-- MEM-INT-004C regression coverage for welfare case/campaign authorization.
BEGIN;
SELECT set_config('scms.mem_int_004c_actor_auth_id', (
  SELECT p.auth_user_id::text FROM public.profiles p
  JOIN public.profile_role_assignments a ON a.profile_id=p.id AND a.is_active
  JOIN public.roles r ON r.id=a.role_id AND r.is_active
  JOIN public.role_permissions rp ON rp.role_id=r.id
  JOIN public.permissions perm ON perm.id=rp.permission_id AND perm.key='manage_welfare'
  WHERE p.auth_user_id IS NOT NULL AND p.portal_access_status='active' AND p.record_status='active'
    AND a.scope_type='church'
  ORDER BY CASE r.name WHEN 'super_admin' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END LIMIT 1
), true);
SELECT set_config('scms.mem_int_004c_actor_profile_id',
  (SELECT id::text FROM public.profiles WHERE auth_user_id=current_setting('scms.mem_int_004c_actor_auth_id')::uuid LIMIT 1), true);
SELECT set_config('scms.mem_int_004c_branch_id',
  (SELECT branch_id::text FROM public.profiles WHERE id=current_setting('scms.mem_int_004c_actor_profile_id')::uuid), true);
DO $preflight$
BEGIN
  IF NULLIF(current_setting('scms.mem_int_004c_actor_auth_id',true),'') IS NULL
    OR NULLIF(current_setting('scms.mem_int_004c_branch_id',true),'') IS NULL THEN
    RAISE EXCEPTION 'MEM-INT-004C requires an active church-wide welfare manager assigned to a branch.';
  END IF;
END;
$preflight$;

INSERT INTO public.profiles (branch_id,first_name,last_name,membership_date,membership_status)
VALUES(current_setting('scms.mem_int_004c_branch_id')::uuid,'MEM-INT-004C','Welfare Member',CURRENT_DATE,'active');
SELECT set_config('scms.mem_int_004c_member_id',
  (SELECT id::text FROM public.profiles WHERE first_name='MEM-INT-004C' AND last_name='Welfare Member' ORDER BY created_at DESC LIMIT 1),true);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('scms.mem_int_004c_actor_auth_id'),true);

DO $welfare_lifecycle$
DECLARE
  v_case public.welfare_cases;
  v_campaign public.welfare_campaigns;
  v_id uuid := gen_random_uuid();
BEGIN
  v_case := public.manage_welfare_case(
    'create',NULL,current_setting('scms.mem_int_004c_member_id')::uuid,
    'emergency_hardship','MEM-INT-004C case reason','Restricted case detail','high',NULL,NULL
  );
  IF v_case.member_id <> current_setting('scms.mem_int_004c_member_id')::uuid
    OR v_case.branch_id <> current_setting('scms.mem_int_004c_branch_id')::uuid
    OR v_case.status <> 'submitted' THEN
    RAISE EXCEPTION 'Welfare case did not preserve the canonical member and branch identity.';
  END IF;

  v_case := public.manage_welfare_case(
    'update',v_case.id,NULL,NULL,NULL,NULL,'urgent','under_review',current_setting('scms.mem_int_004c_actor_profile_id')::uuid
  );
  IF v_case.status <> 'under_review' OR v_case.priority <> 'urgent' THEN
    RAISE EXCEPTION 'Welfare case review update did not persist.';
  END IF;
  v_case := public.manage_welfare_case('update',v_case.id,NULL,NULL,NULL,NULL,NULL,'approved',NULL);
  IF v_case.status <> 'approved' THEN RAISE EXCEPTION 'Welfare case approval did not persist.'; END IF;

  v_campaign := public.manage_welfare_campaign(
    'create',NULL,current_setting('scms.mem_int_004c_branch_id')::uuid,
    'MEM-INT-004C Campaign','Welfare Member','Integration campaign',500,100,'SLE',CURRENT_DATE+14,'active'
  );
  IF v_campaign.status <> 'active' OR v_campaign.branch_id <> current_setting('scms.mem_int_004c_branch_id')::uuid THEN
    RAISE EXCEPTION 'Welfare campaign did not persist in the requested branch.';
  END IF;

  BEGIN
    PERFORM public.record_welfare_contribution(v_campaign.id,v_id,current_setting('scms.mem_int_004c_member_id')::uuid,CURRENT_DATE);
    RAISE EXCEPTION 'A contribution without a posted receipt was unexpectedly accepted.';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  BEGIN
    PERFORM public.record_welfare_assistance(v_case.id,'emergency_support',v_id,'Should not link without posted payment');
    RAISE EXCEPTION 'Welfare assistance without a posted payment was unexpectedly accepted.';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END;
$welfare_lifecycle$;

DO $api_grants$
BEGIN
  IF NOT has_function_privilege('authenticated','public.manage_welfare_case(text,uuid,uuid,text,text,text,text,text,uuid)','EXECUTE')
    OR has_function_privilege('anon','public.manage_welfare_case(text,uuid,uuid,text,text,text,text,text,uuid)','EXECUTE')
    OR NOT has_function_privilege('authenticated','public.manage_welfare_campaign(text,uuid,uuid,text,text,text,numeric,numeric,character,date,text)','EXECUTE')
    OR NOT has_function_privilege('authenticated','public.record_welfare_contribution(uuid,uuid,uuid,date)','EXECUTE')
    OR NOT has_function_privilege('authenticated','public.record_welfare_assistance(uuid,text,uuid,text)','EXECUTE') THEN
    RAISE EXCEPTION 'Welfare RPC grants are incomplete.';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid='private.manage_welfare_case(text,uuid,uuid,text,text,text,text,text,uuid)'::regprocedure AND p.prosecdef
    AND EXISTS(SELECT 1 FROM unnest(p.proconfig) s WHERE s='search_path=""'))
    OR NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid='private.manage_welfare_campaign(text,uuid,uuid,text,text,text,numeric,numeric,character,date,text)'::regprocedure AND p.prosecdef
    AND EXISTS(SELECT 1 FROM unnest(p.proconfig) s WHERE s='search_path=""')) THEN
    RAISE EXCEPTION 'Welfare private APIs must be SECURITY DEFINER with empty search paths.';
  END IF;
END;
$api_grants$;
ROLLBACK;
