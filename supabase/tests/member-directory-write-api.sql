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
END;
$guard$;

ROLLBACK;
