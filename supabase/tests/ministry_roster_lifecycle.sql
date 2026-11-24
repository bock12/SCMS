-- MEM-INT-004B regression coverage for secure ministry roster mutations,
-- branch scoping, status validation, direct DML blocking, and permission separation.
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
    RAISE EXCEPTION 'MEM-INT-004B requires an active church-wide manage_ministries actor assigned to a branch.';
  END IF;
END;
$preflight$;

-- Fixture branches, actors, members, and ministries
DO $fixtures$
DECLARE
  v_branch_1 uuid := current_setting('scms.mem_int_004_branch_id')::uuid;
  v_branch_2 uuid := gen_random_uuid();
  v_unauth_auth_id uuid := gen_random_uuid();
  v_unauth_profile_id uuid := gen_random_uuid();
  v_branch1_mgr_auth_id uuid := gen_random_uuid();
  v_branch1_mgr_profile_id uuid := gen_random_uuid();
  v_member_id uuid := gen_random_uuid();
  v_suspended_member_id uuid := gen_random_uuid();
  v_archived_member_id uuid := gen_random_uuid();
  v_branch2_member_id uuid := gen_random_uuid();
  v_ministry_1_id uuid := gen_random_uuid();
  v_ministry_2_id uuid := gen_random_uuid();
  v_inactive_ministry_id uuid := gen_random_uuid();
  v_admin_role_id uuid;
  v_member_role_id uuid;
BEGIN
  SELECT id INTO v_admin_role_id FROM public.roles WHERE name = 'admin' AND is_active LIMIT 1;
  SELECT id INTO v_member_role_id FROM public.roles WHERE name = 'member' AND is_active LIMIT 1;
  IF v_admin_role_id IS NULL OR v_member_role_id IS NULL THEN
    RAISE EXCEPTION 'Required base roles admin and member are missing.';
  END IF;

  INSERT INTO public.church_branches (id, name, code, country, status)
  VALUES (
    v_branch_2,
    'MEM-INT-004B Second Branch',
    'M4B' || upper(substr(replace(v_branch_2::text, '-', ''), 1, 5)),
    'Sierra Leone',
    'active'
  );

  -- Authenticated user without manage_ministries permission
  INSERT INTO auth.users (id, email, email_confirmed_at, raw_app_meta_data)
  VALUES (v_unauth_auth_id, 'mem-int-004b-unauth@example.invalid', now(), '{}'::jsonb);

  INSERT INTO public.profiles (
    id, auth_user_id, branch_id, first_name, last_name, email,
    membership_date, membership_status, portal_access_status, record_status
  ) VALUES (
    v_unauth_profile_id, v_unauth_auth_id, v_branch_1, 'MEM-INT-004B', 'Unauthorized User',
    'mem-int-004b-unauth@example.invalid', CURRENT_DATE, 'active', 'active', 'active'
  );

  INSERT INTO public.profile_role_assignments (profile_id, role_id, scope_type, branch_id, is_active)
  VALUES (v_unauth_profile_id, v_member_role_id, 'branch', v_branch_1, true);

  -- Branch-1 scoped manager with manage_ministries only on v_branch_1
  INSERT INTO auth.users (id, email, email_confirmed_at, raw_app_meta_data)
  VALUES (v_branch1_mgr_auth_id, 'mem-int-004b-branch1mgr@example.invalid', now(), '{}'::jsonb);

  INSERT INTO public.profiles (
    id, auth_user_id, branch_id, first_name, last_name, email,
    membership_date, membership_status, portal_access_status, record_status
  ) VALUES (
    v_branch1_mgr_profile_id, v_branch1_mgr_auth_id, v_branch_1, 'MEM-INT-004B', 'Branch1 Manager',
    'mem-int-004b-branch1mgr@example.invalid', CURRENT_DATE, 'active', 'active', 'active'
  );

  INSERT INTO public.profile_role_assignments (profile_id, role_id, scope_type, branch_id, is_active)
  VALUES (v_branch1_mgr_profile_id, v_admin_role_id, 'branch', v_branch_1, true);

  -- Ordinary portal-less member (auth_user_id IS NULL)
  INSERT INTO public.profiles (
    id, auth_user_id, branch_id, first_name, last_name,
    membership_date, membership_status, portal_access_status, record_status
  ) VALUES (
    v_member_id, NULL, v_branch_1, 'MEM-INT-004B', 'PortalLess Member',
    CURRENT_DATE, 'active', 'not_invited', 'active'
  );

  -- Suspended member
  INSERT INTO public.profiles (
    id, auth_user_id, branch_id, first_name, last_name,
    membership_date, membership_status, portal_access_status, record_status
  ) VALUES (
    v_suspended_member_id, NULL, v_branch_1, 'MEM-INT-004B', 'Suspended Member',
    CURRENT_DATE, 'suspended', 'not_invited', 'active'
  );

  -- Archived member
  INSERT INTO public.profiles (
    id, auth_user_id, branch_id, first_name, last_name,
    membership_date, membership_status, portal_access_status, record_status
  ) VALUES (
    v_archived_member_id, NULL, v_branch_1, 'MEM-INT-004B', 'Archived Member',
    CURRENT_DATE, 'archived', 'not_invited', 'archived'
  );

  -- Member assigned to Branch 2
  INSERT INTO public.profiles (
    id, auth_user_id, branch_id, first_name, last_name,
    membership_date, membership_status, portal_access_status, record_status
  ) VALUES (
    v_branch2_member_id, NULL, v_branch_2, 'MEM-INT-004B', 'Branch2 Member',
    CURRENT_DATE, 'active', 'not_invited', 'active'
  );

  INSERT INTO public.ministries (id, branch_id, name, entity_type, status)
  VALUES
    (v_ministry_1_id, v_branch_1, 'MEM-INT-004B Branch1 Ministry ' || gen_random_uuid()::text, 'ministry', 'active'),
    (v_ministry_2_id, v_branch_2, 'MEM-INT-004B Branch2 Ministry ' || gen_random_uuid()::text, 'department', 'active'),
    (v_inactive_ministry_id, v_branch_1, 'MEM-INT-004B Inactive Ministry ' || gen_random_uuid()::text, 'ministry', 'inactive');

  PERFORM set_config('scms.mem_int_004_unauth_auth_id', v_unauth_auth_id::text, true);
  PERFORM set_config('scms.mem_int_004_branch1_mgr_auth_id', v_branch1_mgr_auth_id::text, true);
  PERFORM set_config('scms.mem_int_004_branch1_mgr_profile_id', v_branch1_mgr_profile_id::text, true);
  PERFORM set_config('scms.mem_int_004_member_id', v_member_id::text, true);
  PERFORM set_config('scms.mem_int_004_suspended_member_id', v_suspended_member_id::text, true);
  PERFORM set_config('scms.mem_int_004_archived_member_id', v_archived_member_id::text, true);
  PERFORM set_config('scms.mem_int_004_branch2_member_id', v_branch2_member_id::text, true);
  PERFORM set_config('scms.mem_int_004_ministry_id', v_ministry_1_id::text, true);
  PERFORM set_config('scms.mem_int_004_ministry_2_id', v_ministry_2_id::text, true);
  PERFORM set_config('scms.mem_int_004_inactive_ministry_id', v_inactive_ministry_id::text, true);
END;
$fixtures$;

-- 1. Unauthenticated / anon caller must be denied both RPC and direct DML
RESET ROLE;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.sub', '', true);

DO $anon_denied$
BEGIN
  BEGIN
    PERFORM public.manage_ministry_member(
      'add',
      current_setting('scms.mem_int_004_ministry_id')::uuid,
      NULL,
      current_setting('scms.mem_int_004_member_id')::uuid,
      'Team Member', NULL, 'active', CURRENT_DATE
    );
    RAISE EXCEPTION 'Unauthenticated anon call to manage_ministry_member unexpectedly succeeded.';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  BEGIN
    INSERT INTO public.ministry_members (ministry_id, member_id, role_title, status)
    VALUES (
      current_setting('scms.mem_int_004_ministry_id')::uuid,
      current_setting('scms.mem_int_004_member_id')::uuid,
      'Team Member', 'active'
    );
    RAISE EXCEPTION 'Direct anon INSERT into ministry_members unexpectedly succeeded.';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END;
$anon_denied$;

-- 2. Authenticated user without manage_ministries must be denied RPC and direct DML
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('scms.mem_int_004_unauth_auth_id'), true);

DO $unauth_denied$
BEGIN
  BEGIN
    PERFORM public.manage_ministry_member(
      'add',
      current_setting('scms.mem_int_004_ministry_id')::uuid,
      NULL,
      current_setting('scms.mem_int_004_member_id')::uuid,
      'Team Member', NULL, 'active', CURRENT_DATE
    );
    RAISE EXCEPTION 'User without manage_ministries unexpectedly mutated roster.';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  BEGIN
    INSERT INTO public.ministry_members (ministry_id, member_id, role_title, status)
    VALUES (
      current_setting('scms.mem_int_004_ministry_id')::uuid,
      current_setting('scms.mem_int_004_member_id')::uuid,
      'Team Member', 'active'
    );
    RAISE EXCEPTION 'Direct authenticated INSERT into ministry_members unexpectedly succeeded.';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END;
$unauth_denied$;

-- 3. Branch-1 scoped manager can appoint portal-less member (even as Department Leader)
--    without granting system permissions, but cannot mutate Branch-2 or violate constraints.
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('scms.mem_int_004_branch1_mgr_auth_id'), true);

DO $branch_scoped_lifecycle$
DECLARE
  v_entry public.ministry_members;
  v_role_count integer;
BEGIN
  -- Add portal-less member as Department Leader
  v_entry := public.manage_ministry_member(
    'add',
    current_setting('scms.mem_int_004_ministry_id')::uuid,
    NULL,
    current_setting('scms.mem_int_004_member_id')::uuid,
    'Department Leader',
    'Ministry leadership and duty oversight',
    'active',
    CURRENT_DATE
  );

  IF v_entry.member_id <> current_setting('scms.mem_int_004_member_id')::uuid
    OR v_entry.created_by_profile_id <> current_setting('scms.mem_int_004_branch1_mgr_profile_id')::uuid THEN
    RAISE EXCEPTION 'Roster creation did not preserve canonical profile and actor IDs.';
  END IF;

  PERFORM set_config('scms.mem_int_004_assignment_id', v_entry.id::text, true);

  -- Leadership appointment must NOT auto-grant system role assignments
  SELECT count(*) INTO v_role_count
  FROM public.profile_role_assignments
  WHERE profile_id = current_setting('scms.mem_int_004_member_id')::uuid;
  IF v_role_count <> 0 THEN
    RAISE EXCEPTION 'Ministry leadership appointment unexpectedly created system role assignments.';
  END IF;

  -- Duplicate assignment must fail cleanly (23505)
  BEGIN
    PERFORM public.manage_ministry_member(
      'add',
      current_setting('scms.mem_int_004_ministry_id')::uuid,
      NULL,
      current_setting('scms.mem_int_004_member_id')::uuid,
      'Duplicate Member', NULL, 'active', CURRENT_DATE
    );
    RAISE EXCEPTION 'Duplicate ministry membership assignment was unexpectedly allowed.';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;

  -- Update role, duty, and status
  v_entry := public.manage_ministry_member(
    'update', NULL, v_entry.id, NULL, 'Ministry Coordinator', 'Updated duty', 'on_leave', NULL
  );
  IF v_entry.role_title <> 'Ministry Coordinator' OR v_entry.status <> 'on_leave' THEN
    RAISE EXCEPTION 'Roster update did not persist the requested fields.';
  END IF;

  -- Branch-1 manager cannot mutate Branch-2 ministry (42501)
  BEGIN
    PERFORM public.manage_ministry_member(
      'add',
      current_setting('scms.mem_int_004_ministry_2_id')::uuid,
      NULL,
      current_setting('scms.mem_int_004_branch2_member_id')::uuid,
      'Team Member', NULL, 'active', CURRENT_DATE
    );
    RAISE EXCEPTION 'Branch-1 manager unexpectedly mutated Branch-2 ministry roster.';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  -- Cross-branch member into Branch-1 ministry must be rejected (42501)
  BEGIN
    PERFORM public.manage_ministry_member(
      'add',
      current_setting('scms.mem_int_004_ministry_id')::uuid,
      NULL,
      current_setting('scms.mem_int_004_branch2_member_id')::uuid,
      'Team Member', NULL, 'active', CURRENT_DATE
    );
    RAISE EXCEPTION 'Cross-branch member assignment was unexpectedly allowed.';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  -- Suspended member must be rejected on add (23503)
  BEGIN
    PERFORM public.manage_ministry_member(
      'add',
      current_setting('scms.mem_int_004_ministry_id')::uuid,
      NULL,
      current_setting('scms.mem_int_004_suspended_member_id')::uuid,
      'Team Member', NULL, 'active', CURRENT_DATE
    );
    RAISE EXCEPTION 'Suspended church member was unexpectedly added to ministry roster.';
  EXCEPTION WHEN foreign_key_violation THEN
    NULL;
  END;

  -- Archived member must be rejected on add (23503)
  BEGIN
    PERFORM public.manage_ministry_member(
      'add',
      current_setting('scms.mem_int_004_ministry_id')::uuid,
      NULL,
      current_setting('scms.mem_int_004_archived_member_id')::uuid,
      'Team Member', NULL, 'active', CURRENT_DATE
    );
    RAISE EXCEPTION 'Archived church member was unexpectedly added to ministry roster.';
  EXCEPTION WHEN foreign_key_violation THEN
    NULL;
  END;

  -- Inactive ministry must be rejected on add (23503)
  BEGIN
    PERFORM public.manage_ministry_member(
      'add',
      current_setting('scms.mem_int_004_inactive_ministry_id')::uuid,
      NULL,
      current_setting('scms.mem_int_004_member_id')::uuid,
      'Team Member', NULL, 'active', CURRENT_DATE
    );
    RAISE EXCEPTION 'Inactive ministry unexpectedly accepted a roster assignment.';
  EXCEPTION WHEN foreign_key_violation THEN
    NULL;
  END;

  -- Direct authenticated UPDATE / DELETE on ministry_members must fail
  BEGIN
    UPDATE public.ministry_members SET role_title = 'Bypassed' WHERE id = v_entry.id;
    RAISE EXCEPTION 'Direct authenticated UPDATE on ministry_members unexpectedly succeeded.';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  BEGIN
    DELETE FROM public.ministry_members WHERE id = v_entry.id;
    RAISE EXCEPTION 'Direct authenticated DELETE on ministry_members unexpectedly succeeded.';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END;
$branch_scoped_lifecycle$;

-- 4. Suspending an already-assigned member blocks roster updates, while removal still succeeds
RESET ROLE;
UPDATE public.profiles
SET membership_status = 'suspended'
WHERE id = current_setting('scms.mem_int_004_member_id')::uuid;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('scms.mem_int_004_actor_auth_id'), true);

DO $suspended_update_guard$
DECLARE
  v_assignment_id uuid := current_setting('scms.mem_int_004_assignment_id')::uuid;
BEGIN
  BEGIN
    PERFORM public.manage_ministry_member(
      'update', NULL, v_assignment_id, NULL, 'Updated While Suspended', NULL, 'active', NULL
    );
    RAISE EXCEPTION 'Update on a suspended member roster assignment unexpectedly succeeded.';
  EXCEPTION WHEN foreign_key_violation THEN
    NULL;
  END;

  PERFORM public.manage_ministry_member('remove', NULL, v_assignment_id, NULL, NULL, NULL, NULL, NULL);
  IF EXISTS (SELECT 1 FROM public.ministry_members WHERE id = v_assignment_id) THEN
    RAISE EXCEPTION 'Roster removal did not delete the assignment.';
  END IF;
END;
$suspended_update_guard$;

-- 5. Verify function and table privileges & SECURITY DEFINER configuration
DO $api_grants$
BEGIN
  IF NOT has_function_privilege('authenticated', 'public.manage_ministry_member(text,uuid,uuid,uuid,text,text,text,date)', 'EXECUTE')
    OR has_function_privilege('anon', 'public.manage_ministry_member(text,uuid,uuid,uuid,text,text,text,date)', 'EXECUTE')
    OR NOT has_function_privilege('authenticated', 'private.manage_ministry_member(text,uuid,uuid,uuid,text,text,text,date)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Ministry roster RPC grants are incomplete.';
  END IF;

  IF has_table_privilege('authenticated', 'public.ministry_members', 'INSERT')
    OR has_table_privilege('authenticated', 'public.ministry_members', 'UPDATE')
    OR has_table_privilege('authenticated', 'public.ministry_members', 'DELETE')
    OR has_table_privilege('anon', 'public.ministry_members', 'SELECT') THEN
    RAISE EXCEPTION 'Direct ministry_members write or anon read grants must remain revoked.';
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
