-- MEM-INT-003 portal lifecycle regression checks.
-- Requires one active church-wide manage_members Auth actor and one active branch.
-- All changes, including the temporary Auth/profile link, are rolled back.

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

-- Unlinked identities must not be able to authorize portal lifecycle actions.
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
UPDATE auth.users
SET email_confirmed_at = now()
WHERE id = current_setting('scms.mem_int_003_actor_auth_id')::uuid;

DO $confirmed$
DECLARE
  v_profile public.profiles;
BEGIN
  SELECT * INTO v_profile
  FROM public.profiles
  WHERE id = current_setting('scms.mem_int_003_member_id')::uuid;

  IF v_profile.auth_user_id IS DISTINCT FROM current_setting('scms.mem_int_003_actor_auth_id')::uuid
    OR v_profile.portal_access_status <> 'active' THEN
    RAISE EXCEPTION 'Email confirmation did not activate the linked member portal account.';
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
BEGIN
  IF private.current_profile_id() IS NOT NULL THEN
    RAISE EXCEPTION 'A suspended portal identity still resolves to a church profile.';
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
SELECT public.complete_member_portal_action(
  current_setting('scms.mem_int_003_actor_profile_id')::uuid,
  current_setting('scms.mem_int_003_member_id')::uuid,
  'revoke',
  current_setting('scms.mem_int_003_actor_auth_id')::uuid
);

DO $revoked$
DECLARE
  v_profile public.profiles;
BEGIN
  SELECT * INTO v_profile
  FROM public.profiles
  WHERE id = current_setting('scms.mem_int_003_member_id')::uuid;

  IF v_profile.auth_user_id IS NOT NULL
    OR v_profile.portal_access_status <> 'not_invited' THEN
    RAISE EXCEPTION 'Portal revocation did not unlink the Auth identity and reset portal state.';
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
