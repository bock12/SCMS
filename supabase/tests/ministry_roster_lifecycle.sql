-- MEM-INT-004A regression coverage for secure ministry roster mutations.
BEGIN;

SELECT set_config(
  'scms.mem_int_004_actor_auth_id',
  (
    SELECT p.auth_user_id::text
    FROM public.profiles p
    JOIN public.profile_role_assignments a ON a.profile_id = p.id AND a.is_active
    JOIN public.roles r ON r.id = a.role_id AND r.is_active
    JOIN public.role_permissions rp ON rp.role_id = r.id
    JOIN public.permissions perm ON perm.id = rp.permission_id AND perm.key = 'manage_ministries'
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
  'scms.mem_int_004_actor_profile_id',
  (SELECT id::text FROM public.profiles WHERE auth_user_id = current_setting('scms.mem_int_004_actor_auth_id')::uuid LIMIT 1),
  true
);
SELECT set_config(
  'scms.mem_int_004_branch_id',
  (SELECT branch_id::text FROM public.profiles WHERE id = current_setting('scms.mem_int_004_actor_profile_id')::uuid),
  true
);

DO $preflight$
BEGIN
  IF NULLIF(current_setting('scms.mem_int_004_actor_auth_id', true), '') IS NULL
    OR NULLIF(current_setting('scms.mem_int_004_actor_profile_id', true), '') IS NULL
    OR NULLIF(current_setting('scms.mem_int_004_branch_id', true), '') IS NULL THEN
    RAISE EXCEPTION 'MEM-INT-004A requires an active church-wide manage_ministries actor assigned to a branch.';
  END IF;
END;
$preflight$;

INSERT INTO public.profiles (branch_id, first_name, last_name, membership_date, membership_status)
VALUES (current_setting('scms.mem_int_004_branch_id')::uuid, 'MEM-INT-004A', 'Roster Member', CURRENT_DATE, 'active')
RETURNING id;
SELECT set_config(
  'scms.mem_int_004_member_id',
  (SELECT id::text FROM public.profiles WHERE first_name = 'MEM-INT-004A' AND last_name = 'Roster Member' ORDER BY created_at DESC LIMIT 1),
  true
);

INSERT INTO public.profiles (branch_id, first_name, last_name, membership_date, membership_status)
VALUES (NULL, 'MEM-INT-004A', 'Wrong Branch Member', CURRENT_DATE, 'active')
RETURNING id;
SELECT set_config(
  'scms.mem_int_004_wrong_branch_member_id',
  (SELECT id::text FROM public.profiles WHERE first_name = 'MEM-INT-004A' AND last_name = 'Wrong Branch Member' ORDER BY created_at DESC LIMIT 1),
  true
);

INSERT INTO public.ministries (branch_id, name, entity_type, status)
VALUES (
  current_setting('scms.mem_int_004_branch_id')::uuid,
  'MEM-INT-004A ' || gen_random_uuid()::text,
  'ministry',
  'active'
)
RETURNING id;
SELECT set_config(
  'scms.mem_int_004_ministry_id',
  (SELECT id::text FROM public.ministries WHERE name LIKE 'MEM-INT-004A %' ORDER BY created_at DESC LIMIT 1),
  true
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('scms.mem_int_004_actor_auth_id'), true);

DO $roster_lifecycle$
DECLARE
  v_entry public.ministry_members;
BEGIN
  v_entry := public.manage_ministry_member(
    'add',
    current_setting('scms.mem_int_004_ministry_id')::uuid,
    NULL,
    current_setting('scms.mem_int_004_member_id')::uuid,
    'Team Member',
    'Roster lifecycle regression test',
    'active',
    CURRENT_DATE
  );

  IF v_entry.member_id <> current_setting('scms.mem_int_004_member_id')::uuid
    OR v_entry.created_by_profile_id <> current_setting('scms.mem_int_004_actor_profile_id')::uuid THEN
    RAISE EXCEPTION 'Roster creation did not preserve canonical profile and actor IDs.';
  END IF;

  v_entry := public.manage_ministry_member(
    'update', NULL, v_entry.id, NULL, 'Ministry Coordinator', 'Updated duty', 'on_leave', NULL
  );
  IF v_entry.role_title <> 'Ministry Coordinator' OR v_entry.status <> 'on_leave' THEN
    RAISE EXCEPTION 'Roster update did not persist the requested fields.';
  END IF;

  BEGIN
    PERFORM public.manage_ministry_member(
      'add',
      current_setting('scms.mem_int_004_ministry_id')::uuid,
      NULL,
      current_setting('scms.mem_int_004_wrong_branch_member_id')::uuid,
      'Team Member',
      NULL,
      'active',
      CURRENT_DATE
    );
    RAISE EXCEPTION 'Cross-branch ministry assignment was unexpectedly allowed.';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  PERFORM public.manage_ministry_member('remove', NULL, v_entry.id, NULL, NULL, NULL, NULL, NULL);
  IF EXISTS (SELECT 1 FROM public.ministry_members WHERE id = v_entry.id) THEN
    RAISE EXCEPTION 'Roster removal did not delete the assignment.';
  END IF;
END;
$roster_lifecycle$;

DO $api_grants$
BEGIN
  IF NOT has_function_privilege('authenticated', 'public.manage_ministry_member(text,uuid,uuid,uuid,text,text,text,date)', 'EXECUTE')
    OR has_function_privilege('anon', 'public.manage_ministry_member(text,uuid,uuid,uuid,text,text,text,date)', 'EXECUTE')
    OR has_function_privilege('authenticated', 'private.manage_ministry_member(text,uuid,uuid,uuid,text,text,text,date)', 'EXECUTE') = false THEN
    RAISE EXCEPTION 'Ministry roster RPC grants are incomplete.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.oid = 'public.manage_ministry_member(text,uuid,uuid,uuid,text,text,text,date)'::regprocedure
      AND NOT p.prosecdef
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.oid = 'private.manage_ministry_member(text,uuid,uuid,uuid,text,text,text,date)'::regprocedure
      AND p.prosecdef
      AND EXISTS (SELECT 1 FROM unnest(p.proconfig) s WHERE s = 'search_path=""')
  ) THEN
    RAISE EXCEPTION 'Ministry roster API wrapper or private implementation has unsafe execution properties.';
  END IF;
END;
$api_grants$;

ROLLBACK;
