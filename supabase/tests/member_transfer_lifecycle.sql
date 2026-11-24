-- MEM-INT-004A regression coverage for the atomic member transfer lifecycle.
BEGIN;

SELECT set_config(
  'scms.mem_int_004_transfer_actor_auth_id',
  (
    SELECT p.auth_user_id::text
    FROM public.profiles p
    JOIN public.profile_role_assignments a ON a.profile_id = p.id AND a.is_active
    JOIN public.roles r ON r.id = a.role_id AND r.is_active
    JOIN public.role_permissions rp ON rp.role_id = r.id
    JOIN public.permissions perm ON perm.id = rp.permission_id AND perm.key = 'manage_member_transfers'
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
  'scms.mem_int_004_transfer_actor_profile_id',
  (SELECT id::text FROM public.profiles WHERE auth_user_id = current_setting('scms.mem_int_004_transfer_actor_auth_id')::uuid LIMIT 1),
  true
);
SELECT set_config(
  'scms.mem_int_004_transfer_source_branch_id',
  (SELECT branch_id::text FROM public.profiles WHERE id = current_setting('scms.mem_int_004_transfer_actor_profile_id')::uuid),
  true
);

DO $preflight$
BEGIN
  IF NULLIF(current_setting('scms.mem_int_004_transfer_actor_auth_id', true), '') IS NULL
    OR NULLIF(current_setting('scms.mem_int_004_transfer_actor_profile_id', true), '') IS NULL
    OR NULLIF(current_setting('scms.mem_int_004_transfer_source_branch_id', true), '') IS NULL THEN
    RAISE EXCEPTION 'MEM-INT-004A transfer tests require a church-wide manage_member_transfers actor assigned to a branch.';
  END IF;
END;
$preflight$;

INSERT INTO public.church_branches (name, code, country, status)
VALUES (
  'MEM-INT-004A Transfer Destination',
  'T4' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6)),
  'Sierra Leone',
  'active'
);
SELECT set_config(
  'scms.mem_int_004_transfer_destination_branch_id',
  (SELECT id::text FROM public.church_branches WHERE name = 'MEM-INT-004A Transfer Destination' ORDER BY created_at DESC LIMIT 1),
  true
);

INSERT INTO public.profiles (branch_id, first_name, last_name, membership_date, membership_status)
VALUES (current_setting('scms.mem_int_004_transfer_source_branch_id')::uuid, 'MEM-INT-004A', 'Transfer Approval', CURRENT_DATE, 'active');
SELECT set_config(
  'scms.mem_int_004_transfer_approval_member_id',
  (SELECT id::text FROM public.profiles WHERE first_name='MEM-INT-004A' AND last_name='Transfer Approval' ORDER BY created_at DESC LIMIT 1),
  true
);

INSERT INTO public.profiles (branch_id, first_name, last_name, membership_date, membership_status)
VALUES (current_setting('scms.mem_int_004_transfer_source_branch_id')::uuid, 'MEM-INT-004A', 'Transfer Rejection', CURRENT_DATE, 'active');
SELECT set_config(
  'scms.mem_int_004_transfer_rejection_member_id',
  (SELECT id::text FROM public.profiles WHERE first_name='MEM-INT-004A' AND last_name='Transfer Rejection' ORDER BY created_at DESC LIMIT 1),
  true
);

INSERT INTO public.profiles (branch_id, first_name, last_name, membership_date, membership_status)
VALUES (current_setting('scms.mem_int_004_transfer_source_branch_id')::uuid, 'MEM-INT-004A', 'Transfer Cancellation', CURRENT_DATE, 'active');
SELECT set_config(
  'scms.mem_int_004_transfer_cancel_member_id',
  (SELECT id::text FROM public.profiles WHERE first_name='MEM-INT-004A' AND last_name='Transfer Cancellation' ORDER BY created_at DESC LIMIT 1),
  true
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('scms.mem_int_004_transfer_actor_auth_id'), true);

DO $transfer_lifecycle$
DECLARE
  v_transfer public.member_transfers;
  v_member_branch uuid;
BEGIN
  v_transfer := public.manage_member_transfer(
    'request', NULL,
    current_setting('scms.mem_int_004_transfer_approval_member_id')::uuid,
    current_setting('scms.mem_int_004_transfer_destination_branch_id')::uuid,
    'Integration test approval'
  );
  IF v_transfer.status <> 'pending' THEN
    RAISE EXCEPTION 'Transfer request was not created as pending.';
  END IF;

  v_transfer := public.manage_member_transfer('approve', v_transfer.id, NULL, NULL, NULL);
  SELECT branch_id INTO v_member_branch
  FROM public.profiles
  WHERE id = v_transfer.member_id;
  IF v_transfer.status <> 'approved'
    OR v_member_branch <> current_setting('scms.mem_int_004_transfer_destination_branch_id')::uuid
    OR v_transfer.approved_by_profile_id <> current_setting('scms.mem_int_004_transfer_actor_profile_id')::uuid THEN
    RAISE EXCEPTION 'Transfer approval did not atomically update transfer and member branch.';
  END IF;

  v_transfer := public.manage_member_transfer(
    'request', NULL,
    current_setting('scms.mem_int_004_transfer_rejection_member_id')::uuid,
    current_setting('scms.mem_int_004_transfer_destination_branch_id')::uuid,
    'Integration test rejection'
  );
  v_transfer := public.manage_member_transfer('reject', v_transfer.id, NULL, NULL, NULL);
  IF v_transfer.status <> 'rejected' THEN
    RAISE EXCEPTION 'Transfer rejection did not persist.';
  END IF;

  v_transfer := public.manage_member_transfer(
    'request', NULL,
    current_setting('scms.mem_int_004_transfer_cancel_member_id')::uuid,
    current_setting('scms.mem_int_004_transfer_destination_branch_id')::uuid,
    'Integration test cancellation'
  );
  v_transfer := public.manage_member_transfer('cancel', v_transfer.id, NULL, NULL, NULL);
  IF v_transfer.status <> 'cancelled' THEN
    RAISE EXCEPTION 'Transfer cancellation did not persist.';
  END IF;
END;
$transfer_lifecycle$;

DO $api_grants$
BEGIN
  IF NOT has_function_privilege('authenticated', 'public.manage_member_transfer(text,uuid,uuid,uuid,text)', 'EXECUTE')
    OR has_function_privilege('anon', 'public.manage_member_transfer(text,uuid,uuid,uuid,text)', 'EXECUTE')
    OR NOT has_function_privilege('authenticated', 'private.manage_member_transfer(text,uuid,uuid,uuid,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Member transfer RPC grants are incomplete.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.oid = 'private.manage_member_transfer(text,uuid,uuid,uuid,text)'::regprocedure
      AND p.prosecdef
      AND EXISTS (SELECT 1 FROM unnest(p.proconfig) s WHERE s = 'search_path=""')
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.oid = 'public.manage_member_transfer(text,uuid,uuid,uuid,text)'::regprocedure
      AND NOT p.prosecdef
  ) THEN
    RAISE EXCEPTION 'Member transfer API wrapper or private implementation has unsafe execution properties.';
  END IF;
END;
$api_grants$;

DO $transfer_read_policies$
DECLARE
  v_profiles_policy text;
  v_branches_policy text;
  v_transfers_policy text;
BEGIN
  SELECT qual INTO v_profiles_policy FROM pg_policies
  WHERE schemaname='public' AND tablename='profiles' AND policyname='profiles_scoped_read';
  SELECT qual INTO v_branches_policy FROM pg_policies
  WHERE schemaname='public' AND tablename='church_branches' AND policyname='branches_authorized_read';
  SELECT qual INTO v_transfers_policy FROM pg_policies
  WHERE schemaname='public' AND tablename='member_transfers' AND policyname='member_transfers_scoped_read';
  IF v_profiles_policy LIKE '%manage_member_transfers%'
    OR v_branches_policy LIKE '%manage_member_transfers%'
    OR v_transfers_policy NOT LIKE '%manage_member_transfers%' THEN
    RAISE EXCEPTION 'Transfer managers must use the limited directory RPC; broad profile/branch read access must remain closed.';
  END IF;
  IF NOT has_function_privilege('authenticated','public.get_member_transfer_directory()','EXECUTE')
    OR has_function_privilege('anon','public.get_member_transfer_directory()','EXECUTE')
    OR NOT has_function_privilege('authenticated','private.get_member_transfer_directory()','EXECUTE') THEN
    RAISE EXCEPTION 'The least-privilege transfer directory RPC grants are incomplete.';
  END IF;
END;
$transfer_read_policies$;

ROLLBACK;
