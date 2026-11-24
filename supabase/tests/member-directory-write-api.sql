-- MEM-INT-002 database regression checks.
-- Run with a Supabase/Postgres test database containing an active super_admin
-- role assignment and at least one active branch. All data changes roll back.

BEGIN;

SELECT set_config(
  'scms.test_actor_auth_id',
  (
    SELECT p.auth_user_id::text
    FROM public.profiles AS p
    JOIN public.profile_role_assignments AS a ON a.profile_id = p.id AND a.is_active
    JOIN public.roles AS r ON r.id = a.role_id AND r.is_active
    JOIN public.role_permissions AS rp ON rp.role_id = r.id
    JOIN public.permissions AS perm ON perm.id = rp.permission_id AND perm.key = 'manage_members'
    WHERE p.auth_user_id IS NOT NULL
      AND a.scope_type = 'church'
    ORDER BY CASE r.name WHEN 'super_admin' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END
    LIMIT 1
  ),
  true
);

SELECT set_config(
  'scms.test_actor_profile_id',
  (
    SELECT p.id::text
    FROM public.profiles AS p
    WHERE p.auth_user_id = current_setting('scms.test_actor_auth_id')::uuid
    LIMIT 1
  ),
  true
);

SELECT set_config(
  'scms.test_branch_id',
  (SELECT b.id::text FROM public.church_branches AS b WHERE b.status = 'active' ORDER BY b.is_main_branch DESC LIMIT 1),
  true
);

DO $preflight$
BEGIN
  IF NULLIF(current_setting('scms.test_actor_auth_id', true), '') IS NULL
    OR NULLIF(current_setting('scms.test_actor_profile_id', true), '') IS NULL
    OR NULLIF(current_setting('scms.test_branch_id', true), '') IS NULL THEN
    RAISE EXCEPTION 'MEM-INT-002 tests require an authenticated church-wide manage_members fixture and an active branch.';
  END IF;
END;
$preflight$;

-- Create two isolated districts/branches and a member in the second branch.
-- These fixtures are rolled back with the test transaction.
SELECT set_config('request.jwt.claim.sub', current_setting('scms.test_actor_auth_id'), true);

DO $scope_fixtures$
DECLARE
  v_district_a uuid := gen_random_uuid();
  v_district_b uuid := gen_random_uuid();
  v_branch_a uuid := gen_random_uuid();
  v_branch_b uuid := gen_random_uuid();
  v_outside_member public.profiles;
BEGIN
  INSERT INTO public.districts (id, name, region, country)
  VALUES
    (v_district_a, 'MEM-INT-002 District A', 'Test Region', 'Sierra Leone'),
    (v_district_b, 'MEM-INT-002 District B', 'Test Region', 'Sierra Leone');

  INSERT INTO public.church_branches (id, district_id, name, code, country)
  VALUES
    (v_branch_a, v_district_a, 'MEM-INT-002 Branch A', 'M2A' || upper(substr(replace(v_branch_a::text, '-', ''), 1, 6)), 'Sierra Leone'),
    (v_branch_b, v_district_b, 'MEM-INT-002 Branch B', 'M2B' || upper(substr(replace(v_branch_b::text, '-', ''), 1, 6)), 'Sierra Leone');

  PERFORM set_config('scms.test_scope_district_a', v_district_a::text, true);
  PERFORM set_config('scms.test_scope_district_b', v_district_b::text, true);
  PERFORM set_config('scms.test_scope_branch_a', v_branch_a::text, true);
  PERFORM set_config('scms.test_scope_branch_b', v_branch_b::text, true);

  v_outside_member := public.create_member_profile(
    pg_catalog.jsonb_build_object(
      'first_name', 'Outside',
      'last_name', 'Scope Member',
      'branch_id', v_branch_b,
      'membership_date', CURRENT_DATE::text,
      'email', 'mem-int-002-outside-scope@example.invalid'
    )
  );
  PERFORM set_config('scms.test_scope_outside_member_id', v_outside_member.id::text, true);
END;
$scope_fixtures$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('scms.test_actor_auth_id'), true);

DO $tests$
DECLARE
  v_profile public.profiles;
  v_updated public.profiles;
  v_email text := 'mem-int-002-regression@example.invalid';
BEGIN
  -- Authorized create and update through the public RPCs.
  v_profile := public.create_member_profile(
    pg_catalog.jsonb_build_object(
      'first_name', 'MEM-INT-002',
      'last_name', 'Regression Test',
      'branch_id', current_setting('scms.test_branch_id'),
      'membership_date', CURRENT_DATE::text,
      'membership_status', 'active',
      'gender', 'other',
      'email', v_email,
      'phone', '+23278000999',
      'is_baptized', false
    )
  );

  v_updated := public.update_member_profile(
    v_profile.id,
    pg_catalog.jsonb_build_object(
      'first_name', 'MEM-INT-002 Updated',
      'membership_status', 'inactive'
    )
  );

  IF v_updated.first_name <> 'MEM-INT-002 Updated'
    OR v_updated.membership_status <> 'inactive'
    OR v_updated.auth_user_id IS NOT NULL
    OR v_updated.portal_access_status <> 'not_invited' THEN
    RAISE EXCEPTION 'Authorized member create/update did not preserve the expected lifecycle state.';
  END IF;

  -- Protected fields must not be accepted by the create RPC.
  BEGIN
    PERFORM public.create_member_profile(
      pg_catalog.jsonb_build_object(
        'first_name', 'Protected',
        'last_name', 'Field',
        'branch_id', current_setting('scms.test_branch_id'),
        'membership_date', CURRENT_DATE::text,
        'auth_user_id', current_setting('scms.test_actor_auth_id')
      )
    );
    RAISE EXCEPTION 'Expected protected create field to be rejected.';
  EXCEPTION WHEN SQLSTATE '22023' THEN
    NULL;
  END;

  -- Generic member editing cannot change branch.
  BEGIN
    PERFORM public.update_member_profile(
      v_profile.id,
      pg_catalog.jsonb_build_object('branch_id', '00000000-0000-4000-8000-000000000001')
    );
    RAISE EXCEPTION 'Expected generic branch reassignment to be rejected.';
  EXCEPTION WHEN SQLSTATE '42501' THEN
    NULL;
  END;

  -- Duplicate email must be rejected by the database, not just the browser.
  BEGIN
    PERFORM public.create_member_profile(
      pg_catalog.jsonb_build_object(
        'first_name', 'Duplicate',
        'last_name', 'Contact',
        'branch_id', current_setting('scms.test_branch_id'),
        'membership_date', CURRENT_DATE::text,
        'email', v_email
      )
    );
    RAISE EXCEPTION 'Expected duplicate email to be rejected.';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;

  -- An unlinked identity cannot create a directory record.
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', true);
  BEGIN
    PERFORM public.create_member_profile(
      pg_catalog.jsonb_build_object(
        'first_name', 'Unlinked',
        'last_name', 'Actor',
        'branch_id', current_setting('scms.test_branch_id'),
        'membership_date', CURRENT_DATE::text
      )
    );
    RAISE EXCEPTION 'Expected unlinked actor to be rejected.';
  EXCEPTION WHEN SQLSTATE '42501' THEN
    NULL;
  END;
  PERFORM set_config('request.jwt.claim.sub', current_setting('scms.test_actor_auth_id'), true);
END;
$tests$;

-- A user may update permitted self-service fields, but not their own membership state.
DO $guard$
BEGIN
  BEGIN
    UPDATE public.profiles
    SET membership_status = 'inactive'
    WHERE id = current_setting('scms.test_actor_profile_id')::uuid;
    RAISE EXCEPTION 'Expected direct membership-field update to be blocked.';
  EXCEPTION WHEN SQLSTATE '42501' THEN
    NULL;
  END;

  BEGIN
    UPDATE public.profiles
    SET auth_user_id = NULL
    WHERE id = current_setting('scms.test_actor_profile_id')::uuid;
    RAISE EXCEPTION 'Expected direct auth-link update to be blocked.';
  EXCEPTION WHEN SQLSTATE '42501' THEN
    NULL;
  END;
END;
$guard$;

-- Switch the same trusted actor to an explicit pastor branch assignment.
RESET ROLE;
UPDATE public.profile_role_assignments
SET is_active = false
WHERE profile_id = current_setting('scms.test_actor_profile_id')::uuid
  AND is_active;

INSERT INTO public.profile_role_assignments (
  profile_id, role_id, scope_type, branch_id, district_id, is_active
)
SELECT
  current_setting('scms.test_actor_profile_id')::uuid,
  r.id,
  'branch',
  current_setting('scms.test_scope_branch_a')::uuid,
  NULL,
  true
FROM public.roles AS r
WHERE r.name = 'pastor';

SET LOCAL ROLE authenticated;
DO $branch_scope$
DECLARE
  v_created public.profiles;
BEGIN
  v_created := public.create_member_profile(
    pg_catalog.jsonb_build_object(
      'first_name', 'Branch',
      'last_name', 'Scoped Member',
      'branch_id', current_setting('scms.test_scope_branch_a'),
      'membership_date', CURRENT_DATE::text,
      'email', 'mem-int-002-branch-scope@example.invalid'
    )
  );

  IF v_created.branch_id <> current_setting('scms.test_scope_branch_a')::uuid THEN
    RAISE EXCEPTION 'Branch-scoped pastor did not create within the assigned branch.';
  END IF;

  v_created := public.update_member_profile(
    v_created.id,
    pg_catalog.jsonb_build_object('first_name', 'Branch Scoped Updated')
  );
  IF v_created.first_name <> 'Branch Scoped Updated' THEN
    RAISE EXCEPTION 'Branch-scoped pastor could not update within the assigned branch.';
  END IF;

  BEGIN
    PERFORM public.create_member_profile(
      pg_catalog.jsonb_build_object(
        'first_name', 'Outside',
        'last_name', 'Branch Scope',
        'branch_id', current_setting('scms.test_scope_branch_b'),
        'membership_date', CURRENT_DATE::text
      )
    );
    RAISE EXCEPTION 'Expected branch-scoped create outside the assigned branch to be denied.';
  EXCEPTION WHEN SQLSTATE '42501' THEN
    NULL;
  END;

  BEGIN
    PERFORM public.update_member_profile(
      current_setting('scms.test_scope_outside_member_id')::uuid,
      pg_catalog.jsonb_build_object('first_name', 'Unauthorized Update')
    );
    RAISE EXCEPTION 'Expected branch-scoped update outside the assigned branch to be denied.';
  EXCEPTION WHEN SQLSTATE '42501' THEN
    NULL;
  END;
END;
$branch_scope$;

-- Replace the branch assignment with a district_admin assignment and verify
-- the same target-branch checks resolve through the district relationship.
RESET ROLE;
UPDATE public.profile_role_assignments
SET is_active = false
WHERE profile_id = current_setting('scms.test_actor_profile_id')::uuid
  AND is_active;

INSERT INTO public.profile_role_assignments (
  profile_id, role_id, scope_type, branch_id, district_id, is_active
)
SELECT
  current_setting('scms.test_actor_profile_id')::uuid,
  r.id,
  'district',
  NULL,
  current_setting('scms.test_scope_district_a')::uuid,
  true
FROM public.roles AS r
WHERE r.name = 'district_admin';

SET LOCAL ROLE authenticated;
DO $district_scope$
DECLARE
  v_created public.profiles;
BEGIN
  v_created := public.create_member_profile(
    pg_catalog.jsonb_build_object(
      'first_name', 'District',
      'last_name', 'Scoped Member',
      'branch_id', current_setting('scms.test_scope_branch_a'),
      'membership_date', CURRENT_DATE::text,
      'email', 'mem-int-002-district-scope@example.invalid'
    )
  );

  IF v_created.branch_id <> current_setting('scms.test_scope_branch_a')::uuid THEN
    RAISE EXCEPTION 'District-scoped administrator did not create within the assigned district.';
  END IF;

  v_created := public.update_member_profile(
    v_created.id,
    pg_catalog.jsonb_build_object('first_name', 'District Scoped Updated')
  );
  IF v_created.first_name <> 'District Scoped Updated' THEN
    RAISE EXCEPTION 'District-scoped administrator could not update within the assigned district.';
  END IF;

  BEGIN
    PERFORM public.create_member_profile(
      pg_catalog.jsonb_build_object(
        'first_name', 'Outside',
        'last_name', 'District Scope',
        'branch_id', current_setting('scms.test_scope_branch_b'),
        'membership_date', CURRENT_DATE::text
      )
    );
    RAISE EXCEPTION 'Expected district-scoped create outside the assigned district to be denied.';
  EXCEPTION WHEN SQLSTATE '42501' THEN
    NULL;
  END;

  BEGIN
    PERFORM public.update_member_profile(
      current_setting('scms.test_scope_outside_member_id')::uuid,
      pg_catalog.jsonb_build_object('first_name', 'Unauthorized District Update')
    );
    RAISE EXCEPTION 'Expected district-scoped update outside the assigned district to be denied.';
  EXCEPTION WHEN SQLSTATE '42501' THEN
    NULL;
  END;
END;
$district_scope$;

ROLLBACK;
