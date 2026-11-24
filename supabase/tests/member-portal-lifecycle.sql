-- Regression suite for the secure Member Directory portal lifecycle.
-- Kept in the PostgreSQL 17 fresh-install workflow as well as the live dev DB.
BEGIN;

SELECT set_config(
  'scms.mem_int_003_actor_auth_id',
  (
    SELECT p.auth_user_id::text
    FROM public.profiles AS p
    JOIN public.profile_role_assignments AS a ON a.profile_id = p.id AND a.is_active
    JOIN public.roles AS r ON r.id = a.role_id AND r.is_active
    JOIN public.role_permissions AS rp ON rp.role_id = r.id
    JOIN public.permissions AS perm ON perm.id = rp.permission_id AND perm.key = 'manage_members'
    WHERE p.auth_user_id IS NOT NULL
      AND p.portal_access_status = 'active'
      AND p.record_status = 'active'
      AND a.scope_type = 'church'
    ORDER BY CASE r.name WHEN 'super_admin' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END
    LIMIT 1
  ),
  true
);

SELECT set_config(
  'scms.mem_int_003_actor_profile_id',
  (
    SELECT p.id::text
    FROM public.profiles AS p
    WHERE p.auth_user_id = current_setting('scms.mem_int_003_actor_auth_id')::uuid
    LIMIT 1
  ),
  true
);

SELECT set_config(
  'scms.mem_int_003_actor_email',
  (
    SELECT u.email
    FROM auth.users AS u
    WHERE u.id = current_setting('scms.mem_int_003_actor_auth_id')::uuid
  ),
  true
);

SELECT set_config(
  'scms.mem_int_003_branch_id',
  (
    SELECT b.id::text
    FROM public.church_branches AS b
    WHERE b.status = 'active'
    ORDER BY b.is_main_branch DESC
    LIMIT 1
  ),
  true
);

DO $preflight$
BEGIN
  IF NULLIF(current_setting('scms.mem_int_003_actor_auth_id', true), '') IS NULL
    OR NULLIF(current_setting('scms.mem_int_003_actor_profile_id', true), '') IS NULL
    OR NULLIF(current_setting('scms.mem_int_003_actor_email', true), '') IS NULL
    OR NULLIF(current_setting('scms.mem_int_003_branch_id', true), '') IS NULL THEN
    RAISE EXCEPTION 'MEM-INT-003 requires an active church-wide manage_members actor with an email and an active branch.';
  END IF;
END;
$preflight$;

-- Convert the fixture actor to a pastor with an explicit branch assignment.
-- This verifies Member Directory reads do not depend on church-wide access.
RESET ROLE;
UPDATE public.profile_role_assignments
SET is_active = false
WHERE profile_id = current_setting('scms.mem_int_003_actor_profile_id')::uuid
  AND is_active;

INSERT INTO public.profile_role_assignments (
  profile_id, role_id, scope_type, branch_id, district_id, assigned_by_profile_id
)
SELECT
  current_setting('scms.mem_int_003_actor_profile_id')::uuid,
  r.id,
  'branch',
  current_setting('scms.mem_int_003_branch_id')::uuid,
  NULL,
  current_setting('scms.mem_int_003_actor_profile_id')::uuid
FROM public.roles AS r
WHERE r.name = 'pastor';

-- A second branch and member prove that profile and role reads remain branch scoped.
DO $other_branch$
DECLARE
  v_branch_id uuid := gen_random_uuid();
  v_profile_id uuid;
BEGIN
  INSERT INTO public.church_branches (id, name, code, country, status)
  VALUES (
    v_branch_id,
    'MEM-INT-003 Other Branch',
    'M3' || upper(substr(replace(v_branch_id::text, '-', ''), 1, 6)),
    'Sierra Leone',
    'active'
  );

  INSERT INTO public.profiles (
    branch_id, first_name, last_name, email, membership_date, membership_status
  ) VALUES (
    v_branch_id, 'MEM-INT-003', 'Out of Scope',
    'mem-int-003-out-of-scope@example.invalid',
    CURRENT_DATE, 'active'
  )
  RETURNING id INTO v_profile_id;

  INSERT INTO public.profile_role_assignments (
    profile_id, role_id, scope_type, branch_id, assigned_by_profile_id
  )
  SELECT v_profile_id, r.id, 'branch', v_branch_id,
         current_setting('scms.mem_int_003_actor_profile_id')::uuid
  FROM public.roles AS r
  WHERE r.name = 'member';

  PERFORM set_config('scms.mem_int_003_other_branch_member_id', v_profile_id::text, true);
END;
$other_branch$;

INSERT INTO public.notifications (
  branch_id, title, message, status, created_by_profile_id, published_at
) VALUES (
  current_setting('scms.mem_int_003_branch_id')::uuid,
  'MEM-INT-003 Scoped Notification',
  'Branch-scoped portal access regression fixture',
  'published',
  current_setting('scms.mem_int_003_actor_profile_id')::uuid,
  now()
);

-- Exercise the caller-authorized invitation preflight before changing the
-- existing actor's temporary profile email (the entire test is transactional).
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('scms.mem_int_003_actor_auth_id'), true);

-- Temporarily clear the actor's directory email so the test Auth email can be
-- attached to the new test member later. The Auth identity remains signed in.
RESET ROLE;
UPDATE public.profiles
SET email = NULL
WHERE id = current_setting('scms.mem_int_003_actor_profile_id')::uuid;

SET LOCAL ROLE authenticated;
DO $create_member$
DECLARE
  v_profile public.profiles;
  v_decision jsonb;
BEGIN
  v_profile := public.create_member_profile(
    pg_catalog.jsonb_build_object(
      'first_name', 'MEM-INT-003',
      'last_name', 'Portal Lifecycle Test',
      'branch_id', current_setting('scms.mem_int_003_branch_id'),
      'membership_date', CURRENT_DATE::text,
      'membership_status', 'active'
    )
  );

  PERFORM set_config('scms.mem_int_003_member_id', v_profile.id::text, true);

  v_decision := public.authorize_member_portal_action(
    v_profile.id,
    'invite',
    current_setting('scms.mem_int_003_actor_email')
  );

  IF COALESCE((v_decision->>'already_done')::boolean, true)
    OR v_decision->>'actor_profile_id' <> current_setting('scms.mem_int_003_actor_profile_id')
    OR v_decision->>'profile_id' <> v_profile.id::text THEN
    RAISE EXCEPTION 'Authorized portal invitation preflight returned an unexpected decision.';
  END IF;
END;
$create_member$;

-- Branch-scoped Member Directory reads include the authorized branch and its
-- role labels, but exclude profiles and assignments from another branch.
RESET ROLE;
INSERT INTO public.profile_role_assignments (
  profile_id, role_id, scope_type, branch_id, assigned_by_profile_id
)
SELECT
  current_setting('scms.mem_int_003_member_id')::uuid,
  r.id,
  'branch',
  current_setting('scms.mem_int_003_branch_id')::uuid,
  current_setting('scms.mem_int_003_actor_profile_id')::uuid
FROM public.roles AS r
WHERE r.name = 'member';

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('scms.mem_int_003_actor_auth_id'), true);
DO $directory_read_scope$
DECLARE
  v_in_scope_profiles integer;
  v_out_of_scope_profiles integer;
  v_in_scope_roles integer;
  v_out_of_scope_roles integer;
  v_branch_notifications integer;
BEGIN
  SELECT count(*) INTO v_in_scope_profiles
  FROM public.profiles
  WHERE id = current_setting('scms.mem_int_003_member_id')::uuid;
  SELECT count(*) INTO v_out_of_scope_profiles
  FROM public.profiles
  WHERE id = current_setting('scms.mem_int_003_other_branch_member_id')::uuid;
  SELECT count(*) INTO v_in_scope_roles
  FROM public.profile_role_assignments
  WHERE profile_id = current_setting('scms.mem_int_003_member_id')::uuid;
  SELECT count(*) INTO v_out_of_scope_roles
  FROM public.profile_role_assignments
  WHERE profile_id = current_setting('scms.mem_int_003_other_branch_member_id')::uuid;
  SELECT count(*) INTO v_branch_notifications
  FROM public.notifications
  WHERE title = 'MEM-INT-003 Scoped Notification';

  IF v_in_scope_profiles <> 1 OR v_in_scope_roles <> 1 OR v_branch_notifications <> 1 THEN
    RAISE EXCEPTION 'A branch-scoped member manager could not read an in-scope member and role assignment.';
  END IF;
  IF v_out_of_scope_profiles <> 0 OR v_out_of_scope_roles <> 0 THEN
    RAISE EXCEPTION 'A branch-scoped member manager read an out-of-scope member or role assignment.';
  END IF;
END;
$directory_read_scope$;

-- The trusted Auth-linking trigger also enters the invited state, then the
-- email-confirmation trigger activates that exact directory profile.
DO $trusted_link_create$
DECLARE
  v_profile public.profiles;
  v_auth_user_id uuid := gen_random_uuid();
BEGIN
  v_profile := public.create_member_profile(
    pg_catalog.jsonb_build_object(
      'first_name', 'MEM-INT-003',
      'last_name', 'Trusted Link Test',
      'branch_id', current_setting('scms.mem_int_003_branch_id'),
      'membership_date', CURRENT_DATE::text,
      'membership_status', 'active',
      'email', 'mem-int-003-trusted-link@example.invalid'
    )
  );
  PERFORM set_config('scms.mem_int_003_trusted_profile_id', v_profile.id::text, true);
  PERFORM set_config('scms.mem_int_003_trusted_auth_id', v_auth_user_id::text, true);
END;
$trusted_link_create$;

RESET ROLE;
INSERT INTO auth.users (id, email, raw_app_meta_data)
VALUES (
  current_setting('scms.mem_int_003_trusted_auth_id')::uuid,
  'mem-int-003-trusted-link@example.invalid',
  pg_catalog.jsonb_build_object(
    'provisioned_profile_id',
    current_setting('scms.mem_int_003_trusted_profile_id')
  )
);

DO $trusted_link_invited$
DECLARE
  v_profile public.profiles;
BEGIN
  SELECT * INTO v_profile
  FROM public.profiles
  WHERE id = current_setting('scms.mem_int_003_trusted_profile_id')::uuid;

  IF v_profile.auth_user_id IS DISTINCT FROM current_setting('scms.mem_int_003_trusted_auth_id')::uuid
    OR v_profile.portal_access_status <> 'invited' THEN
    RAISE EXCEPTION 'Trusted Auth linking did not create an invited portal state.';
  END IF;
END;
$trusted_link_invited$;

UPDATE auth.users
SET email_confirmed_at = now()
WHERE id = current_setting('scms.mem_int_003_trusted_auth_id')::uuid;

DO $trusted_link_active$
DECLARE
  v_profile public.profiles;
BEGIN
  SELECT * INTO v_profile
  FROM public.profiles
  WHERE id = current_setting('scms.mem_int_003_trusted_profile_id')::uuid;

  IF v_profile.portal_access_status <> 'active' THEN
    RAISE EXCEPTION 'Trusted Auth email confirmation did not activate the linked profile.';
  END IF;
END;
$trusted_link_active$;

DELETE FROM auth.users
WHERE id = current_setting('scms.mem_int_003_trusted_auth_id')::uuid;

-- Unlinked identities must not be able to authorize portal lifecycle actions.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', true);
DO $unlinked_actor$
BEGIN
  BEGIN
    PERFORM public.authorize_member_portal_action(
      current_setting('scms.mem_int_003_member_id')::uuid,
      'invite',
      'unlinked-member@example.invalid'
    );
    RAISE EXCEPTION 'Expected unlinked actor to be denied portal provisioning.';
  EXCEPTION WHEN SQLSTATE '42501' THEN
    NULL;
  END;
END;
$unlinked_actor$;

-- Restore the real actor claim and temporarily move its existing Auth identity
-- to the new test member. This exercises the complete service-only lifecycle
-- without creating an Auth user or sending a real invitation email.
RESET ROLE;
UPDATE public.profiles
SET auth_user_id = NULL,
    portal_access_status = 'not_invited'
WHERE id = current_setting('scms.mem_int_003_actor_profile_id')::uuid;

UPDATE auth.users
SET email_confirmed_at = NULL
WHERE id = current_setting('scms.mem_int_003_actor_auth_id')::uuid;

SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.role', 'service_role', true);

SELECT public.complete_member_portal_action(
  current_setting('scms.mem_int_003_actor_profile_id')::uuid,
  current_setting('scms.mem_int_003_member_id')::uuid,
  'invite',
  current_setting('scms.mem_int_003_actor_auth_id')::uuid,
  current_setting('scms.mem_int_003_actor_email')
);

-- The invitation is pending until Supabase Auth confirms the email. The
-- auth.users trigger then activates the linked portal account automatically.
RESET ROLE;
UPDATE auth.users
SET email_confirmed_at = now()
WHERE id = current_setting('scms.mem_int_003_actor_auth_id')::uuid;
SET LOCAL ROLE service_role;

-- Inspect fixture state as the database owner, not the service_role API role.
RESET ROLE;
DO $confirmed$
DECLARE
  v_profile public.profiles;
BEGIN
  SELECT * INTO v_profile
  FROM public.profiles
  WHERE id = current_setting('scms.mem_int_003_member_id')::uuid;

  IF v_profile.auth_user_id IS DISTINCT FROM current_setting('scms.mem_int_003_actor_auth_id')::uuid
    OR v_profile.portal_access_status <> 'active'
    OR v_profile.membership_status <> 'active' THEN
    RAISE EXCEPTION 'Email confirmation did not activate portal access independently of membership status.';
  END IF;
END;
$confirmed$;

-- Active accounts resolve to the member profile; suspended accounts do not.
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('scms.mem_int_003_actor_auth_id'), true);

DO $active_identity$
BEGIN
  IF private.current_profile_id() IS DISTINCT FROM current_setting('scms.mem_int_003_member_id')::uuid THEN
    RAISE EXCEPTION 'An active portal account did not resolve to its linked member profile.';
  END IF;
END;
$active_identity$;

RESET ROLE;
SET LOCAL ROLE service_role;
SELECT public.complete_member_portal_action(
  current_setting('scms.mem_int_003_actor_profile_id')::uuid,
  current_setting('scms.mem_int_003_member_id')::uuid,
  'suspend',
  current_setting('scms.mem_int_003_actor_auth_id')::uuid
);

RESET ROLE;
SET LOCAL ROLE authenticated;
DO $suspended_identity$
DECLARE
  v_branch_notifications integer;
  v_self_profile_reads integer;
  v_self_update_rows integer;
BEGIN
  IF private.current_profile_id() IS NOT NULL THEN
    RAISE EXCEPTION 'A suspended portal identity still resolves to a church profile.';
  END IF;

  SELECT count(*) INTO v_branch_notifications
  FROM public.notifications
  WHERE title = 'MEM-INT-003 Scoped Notification';
  IF v_branch_notifications <> 0 THEN
    RAISE EXCEPTION 'A suspended portal identity can still read branch-scoped notifications.';
  END IF;

  SELECT count(*) INTO v_self_profile_reads
  FROM public.profiles
  WHERE auth_user_id = current_setting('scms.mem_int_003_actor_auth_id')::uuid;
  IF v_self_profile_reads <> 0 THEN
    RAISE EXCEPTION 'A suspended portal identity can still read its own profile.';
  END IF;

  UPDATE public.profiles
  SET first_name = 'Suspended Self Update Must Fail'
  WHERE auth_user_id = current_setting('scms.mem_int_003_actor_auth_id')::uuid;
  GET DIAGNOSTICS v_self_update_rows = ROW_COUNT;
  IF v_self_update_rows <> 0 THEN
    RAISE EXCEPTION 'A suspended portal identity can still update its own profile.';
  END IF;
END;
$suspended_identity$;

RESET ROLE;
SET LOCAL ROLE service_role;
SELECT public.complete_member_portal_action(
  current_setting('scms.mem_int_003_actor_profile_id')::uuid,
  current_setting('scms.mem_int_003_member_id')::uuid,
  'activate',
  current_setting('scms.mem_int_003_actor_auth_id')::uuid
);

RESET ROLE;
SET LOCAL ROLE authenticated;
DO $reactivated_identity$
BEGIN
  IF private.current_profile_id() IS DISTINCT FROM current_setting('scms.mem_int_003_member_id')::uuid THEN
    RAISE EXCEPTION 'A reactivated portal account did not resolve to its linked member profile.';
  END IF;
END;
$reactivated_identity$;

RESET ROLE;
SET LOCAL ROLE service_role;
SELECT public.complete_member_portal_action(
  current_setting('scms.mem_int_003_actor_profile_id')::uuid,
  current_setting('scms.mem_int_003_member_id')::uuid,
  'suspend',
  current_setting('scms.mem_int_003_actor_auth_id')::uuid
);

-- Deleting the Auth user applies ON DELETE SET NULL to the member link. The
-- portal record must remain suspended until the service finalizes revocation.
RESET ROLE;
DELETE FROM auth.users
WHERE id = current_setting('scms.mem_int_003_actor_auth_id')::uuid;
SET LOCAL ROLE service_role;
SELECT public.complete_member_portal_action(
  current_setting('scms.mem_int_003_actor_profile_id')::uuid,
  current_setting('scms.mem_int_003_member_id')::uuid,
  'revoke',
  NULL
);

RESET ROLE;
DO $revoked$
DECLARE
  v_profile public.profiles;
BEGIN
  SELECT * INTO v_profile
  FROM public.profiles
  WHERE id = current_setting('scms.mem_int_003_member_id')::uuid;

  IF v_profile.auth_user_id IS NOT NULL
    OR v_profile.portal_access_status <> 'not_invited'
    OR v_profile.membership_status <> 'active'
    OR NOT EXISTS (
      SELECT 1 FROM public.profile_role_assignments
      WHERE profile_id = v_profile.id AND is_active
    ) THEN
    RAISE EXCEPTION 'Portal revocation changed membership status or removed role assignments.';
  END IF;
END;
$revoked$;

-- The service-only completion RPC must not be callable by an ordinary user.
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('scms.mem_int_003_actor_auth_id'), true);
DO $service_only$
BEGIN
  BEGIN
    PERFORM public.complete_member_portal_action(
      current_setting('scms.mem_int_003_actor_profile_id')::uuid,
      current_setting('scms.mem_int_003_member_id')::uuid,
      'suspend',
      current_setting('scms.mem_int_003_actor_auth_id')::uuid
    );
    RAISE EXCEPTION 'Expected direct authenticated execution of the service-only RPC to be denied.';
  EXCEPTION WHEN SQLSTATE '42501' THEN
    NULL;
  END;
END;
$service_only$;

ROLLBACK;
