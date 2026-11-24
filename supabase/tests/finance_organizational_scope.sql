-- FIN-ORG-001: hierarchical financial ownership and district isolation.
-- Runs after 20261122000100_add_district_scoped_finance_ownership.sql.

DO $finance_org_setup$
DECLARE
  v_chart_account_id uuid;
BEGIN
  INSERT INTO public.districts (id, name, country)
  VALUES
    ('97000000-0000-4000-8000-000000000001', 'FIN-ORG-001 District A', 'Sierra Leone'),
    ('97000000-0000-4000-8000-000000000002', 'FIN-ORG-001 District B', 'Sierra Leone');

  INSERT INTO public.church_branches (id, district_id, name, code, country)
  VALUES
    ('97100000-0000-4000-8000-000000000001', '97000000-0000-4000-8000-000000000001', 'FIN-ORG-001 Branch A1', 'FINORG-A1', 'Sierra Leone'),
    ('97100000-0000-4000-8000-000000000002', '97000000-0000-4000-8000-000000000001', 'FIN-ORG-001 Branch A2', 'FINORG-A2', 'Sierra Leone'),
    ('97100000-0000-4000-8000-000000000003', '97000000-0000-4000-8000-000000000002', 'FIN-ORG-001 Branch B1', 'FINORG-B1', 'Sierra Leone');

  SELECT id INTO v_chart_account_id
  FROM public.chart_of_accounts
  WHERE account_type = 'asset' AND is_active
  ORDER BY code
  LIMIT 1;

  IF v_chart_account_id IS NULL THEN
    RAISE EXCEPTION 'FIN-ORG-001 requires an active asset chart account fixture';
  END IF;

  INSERT INTO public.financial_accounts (
    id, chart_account_id, name, account_type, currency_code, district_id
  ) VALUES (
    '97200000-0000-4000-8000-000000000001',
    v_chart_account_id, 'FIN-ORG-001 District A Treasury', 'cash', 'SLE',
    '97000000-0000-4000-8000-000000000001'
  );

  -- A branch account inherits its district from church_branches.
  INSERT INTO public.financial_accounts (
    id, chart_account_id, branch_id, name, account_type, currency_code
  ) VALUES
    ('97200000-0000-4000-8000-000000000002',
     v_chart_account_id, '97100000-0000-4000-8000-000000000001',
     'FIN-ORG-001 Branch A1 Cash', 'cash', 'SLE'),
    ('97200000-0000-4000-8000-000000000003',
     v_chart_account_id, '97100000-0000-4000-8000-000000000002',
     'FIN-ORG-001 Branch A2 Cash', 'cash', 'SLE'),
    ('97200000-0000-4000-8000-000000000004',
     v_chart_account_id, '97100000-0000-4000-8000-000000000003',
     'FIN-ORG-001 Branch B1 Cash', 'cash', 'SLE');

  IF NOT EXISTS (
    SELECT 1 FROM public.financial_accounts
    WHERE id = '97200000-0000-4000-8000-000000000002'
      AND district_id = '97000000-0000-4000-8000-000000000001'
  ) THEN
    RAISE EXCEPTION 'Branch-owned financial account did not inherit its district';
  END IF;

  INSERT INTO public.funds (
    id, name, code, fund_type, is_default, is_active, district_id
  ) VALUES (
    '97500000-0000-4000-8000-000000000001',
    'FIN-ORG-001 District A General', 'FINORGA-GEN', 'general', false, true,
    '97000000-0000-4000-8000-000000000001'
  );

  INSERT INTO public.funds (
    id, name, code, fund_type, is_default, is_active, branch_id
  ) VALUES
    ('97500000-0000-4000-8000-000000000002',
     'FIN-ORG-001 Branch A1 Welfare', 'FINORGA-A1', 'designated', false, true,
     '97100000-0000-4000-8000-000000000001'),
    ('97500000-0000-4000-8000-000000000003',
     'FIN-ORG-001 Branch A2 Welfare', 'FINORGA-A2', 'designated', false, true,
     '97100000-0000-4000-8000-000000000002'),
    ('97500000-0000-4000-8000-000000000004',
     'FIN-ORG-001 Branch B1 Welfare', 'FINORGB-B1', 'designated', false, true,
     '97100000-0000-4000-8000-000000000003');

  IF NOT EXISTS (
    SELECT 1 FROM public.funds
    WHERE id = '97500000-0000-4000-8000-000000000002'
      AND district_id = '97000000-0000-4000-8000-000000000001'
  ) THEN
    RAISE EXCEPTION 'Branch-owned fund did not inherit its district';
  END IF;

  BEGIN
    INSERT INTO public.financial_accounts (
      id, chart_account_id, branch_id, district_id, name, account_type, currency_code
    ) VALUES (
      '97200000-0000-4000-8000-000000000005',
      v_chart_account_id,
      '97100000-0000-4000-8000-000000000001',
      '97000000-0000-4000-8000-000000000002',
      'FIN-ORG-001 Invalid Cross-District Account',
      'cash', 'SLE'
    );
    RAISE EXCEPTION 'FIN_ORG_001_EXPECTED_DISTRICT_MISMATCH_DENIAL';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'FIN_ORG_001_EXPECTED_DISTRICT_MISMATCH_DENIAL' THEN RAISE; END IF;
    IF position('district must match' in lower(SQLERRM)) = 0 THEN RAISE; END IF;
  END;
END
$finance_org_setup$;

-- District-scoped finance roles can see their district-wide account and all
-- accounts in branches belonging to that district, but not another district.
INSERT INTO auth.users (id, email) VALUES
  ('97300000-0000-4000-8000-000000000001', 'fin-org-district@example.invalid'),
  ('97300000-0000-4000-8000-000000000002', 'fin-org-branch@example.invalid');

INSERT INTO public.profiles (id, auth_user_id, first_name, last_name, email) VALUES
  ('97400000-0000-4000-8000-000000000001',
   '97300000-0000-4000-8000-000000000001', 'District', 'Finance', 'fin-org-district@example.invalid'),
  ('97400000-0000-4000-8000-000000000002',
   '97300000-0000-4000-8000-000000000002', 'Branch', 'Finance', 'fin-org-branch@example.invalid');

UPDATE public.profiles
SET portal_access_status = 'active'
WHERE auth_user_id IN (
  '97300000-0000-4000-8000-000000000001',
  '97300000-0000-4000-8000-000000000002'
);

INSERT INTO public.profile_role_assignments (
  profile_id, role_id, scope_type, district_id, assigned_at, is_active
)
SELECT '97400000-0000-4000-8000-000000000001', r.id, 'district',
       '97000000-0000-4000-8000-000000000001', now() - interval '1 day', true
FROM public.roles r
WHERE r.name = 'finance_officer' AND r.is_active;

INSERT INTO public.profile_role_assignments (
  profile_id, role_id, scope_type, branch_id, assigned_at, is_active
)
SELECT '97400000-0000-4000-8000-000000000002', r.id, 'branch',
       '97100000-0000-4000-8000-000000000001', now() - interval '1 day', true
FROM public.roles r
WHERE r.name = 'finance_officer' AND r.is_active;

DO $finance_org_role_fixtures$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profile_role_assignments
    WHERE profile_id = '97400000-0000-4000-8000-000000000001'
      AND scope_type = 'district'
      AND district_id = '97000000-0000-4000-8000-000000000001'
      AND is_active
  ) OR NOT EXISTS (
    SELECT 1 FROM public.profile_role_assignments
    WHERE profile_id = '97400000-0000-4000-8000-000000000002'
      AND scope_type = 'branch'
      AND branch_id = '97100000-0000-4000-8000-000000000001'
      AND is_active
  ) THEN
    RAISE EXCEPTION 'FIN-ORG-001 finance role fixtures could not be created';
  END IF;
END
$finance_org_role_fixtures$;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '97300000-0000-4000-8000-000000000001', true);
DO $district_visibility$
DECLARE
  v_visible integer;
BEGIN
  SELECT count(*) INTO v_visible
  FROM public.financial_accounts
  WHERE id IN (
    '97200000-0000-4000-8000-000000000001',
    '97200000-0000-4000-8000-000000000002',
    '97200000-0000-4000-8000-000000000003',
    '97200000-0000-4000-8000-000000000004'
  );
  IF v_visible <> 3 THEN
    RAISE EXCEPTION 'District finance officer should see district treasury and both district branches; saw %', v_visible;
  END IF;
  SELECT count(*) INTO v_visible
  FROM public.funds
  WHERE id IN (
    '97500000-0000-4000-8000-000000000001',
    '97500000-0000-4000-8000-000000000002',
    '97500000-0000-4000-8000-000000000003',
    '97500000-0000-4000-8000-000000000004'
  );
  IF v_visible <> 3 THEN
    RAISE EXCEPTION 'District finance officer should see district and district-branch funds; saw %', v_visible;
  END IF;
END
$district_visibility$;
ROLLBACK;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '97300000-0000-4000-8000-000000000002', true);
DO $branch_visibility$
DECLARE
  v_visible integer;
BEGIN
  SELECT count(*) INTO v_visible
  FROM public.financial_accounts
  WHERE id IN (
    '97200000-0000-4000-8000-000000000001',
    '97200000-0000-4000-8000-000000000002',
    '97200000-0000-4000-8000-000000000003',
    '97200000-0000-4000-8000-000000000004'
  );
  IF v_visible <> 1 THEN
    RAISE EXCEPTION 'Branch finance officer should see only its branch account; saw %', v_visible;
  END IF;
  SELECT count(*) INTO v_visible
  FROM public.funds
  WHERE id IN (
    '97500000-0000-4000-8000-000000000001',
    '97500000-0000-4000-8000-000000000002',
    '97500000-0000-4000-8000-000000000003',
    '97500000-0000-4000-8000-000000000004'
  );
  IF v_visible <> 1 THEN
    RAISE EXCEPTION 'Branch finance officer should see only its branch fund; saw %', v_visible;
  END IF;
END
$branch_visibility$;
ROLLBACK;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '97300000-0000-4000-8000-000000000001', true);
DO $district_configuration$
DECLARE
  v_config jsonb;
BEGIN
  v_config := public.get_finance_scope_configuration(
    'district', '97000000-0000-4000-8000-000000000001'
  );
  IF jsonb_array_length(v_config->'financialAccounts') <> 1
     OR jsonb_array_length(v_config->'funds') <> 1
     OR v_config->'scope'->>'type' <> 'district' THEN
    RAISE EXCEPTION 'District configuration must return only district-owned accounts and funds';
  END IF;

  BEGIN
    PERFORM public.get_finance_scope_configuration('church', null);
    RAISE EXCEPTION 'FIN_ORG_001_EXPECTED_CHURCH_SCOPE_DENIAL';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'FIN_ORG_001_EXPECTED_CHURCH_SCOPE_DENIAL' THEN RAISE; END IF;
    IF position('Insufficient permission' in SQLERRM) = 0 THEN RAISE; END IF;
  END;
END
$district_configuration$;
ROLLBACK;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '97300000-0000-4000-8000-000000000002', true);
DO $branch_configuration$
DECLARE
  v_config jsonb;
BEGIN
  v_config := public.get_finance_scope_configuration(
    'branch', '97100000-0000-4000-8000-000000000001'
  );
  IF jsonb_array_length(v_config->'financialAccounts') <> 1
     OR jsonb_array_length(v_config->'funds') <> 1
     OR v_config->'scope'->>'type' <> 'branch' THEN
    RAISE EXCEPTION 'Branch configuration must return only branch-owned accounts and funds';
  END IF;

  BEGIN
    PERFORM public.get_finance_scope_configuration(
      'district', '97000000-0000-4000-8000-000000000001'
    );
    RAISE EXCEPTION 'FIN_ORG_001_EXPECTED_DISTRICT_SCOPE_DENIAL';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'FIN_ORG_001_EXPECTED_DISTRICT_SCOPE_DENIAL' THEN RAISE; END IF;
    IF position('Insufficient permission' in SQLERRM) = 0 THEN RAISE; END IF;
  END;
END
$branch_configuration$;
ROLLBACK;


-- Scoped resource writes enforce exact ownership and derive branch district IDs.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '97300000-0000-4000-8000-000000000001', true);
DO $district_resource_write$
DECLARE v_chart_account_id uuid; v_result jsonb;
BEGIN
  SELECT id INTO v_chart_account_id FROM public.chart_of_accounts
  WHERE account_type = 'asset' AND is_active AND NOT is_control_account ORDER BY code LIMIT 1;
  v_result := public.save_finance_scope_resources(
    'district', '97000000-0000-4000-8000-000000000001',
    jsonb_build_array(jsonb_build_object(
      'id','97600000-0000-4000-8000-000000000001','chart_account_id',v_chart_account_id,
      'branch_id',null,'district_id','97000000-0000-4000-8000-000000000001',
      'name','FIN-ORG-001 District Bank','account_type','bank','currency_code','SLE','is_active',true
    )),
    jsonb_build_array(jsonb_build_object(
      'id','97700000-0000-4000-8000-000000000001','branch_id',null,
      'district_id','97000000-0000-4000-8000-000000000001',
      'name','FIN-ORG-001 District Mission','code','FINORGD-MISS',
      'fund_type','designated','is_default',false,'is_active',true
    ))
  );
  IF v_result->>'saved' <> 'true'
     OR (v_result->>'financial_accounts_created')::integer <> 1
     OR (v_result->>'funds_created')::integer <> 1 THEN
    RAISE EXCEPTION 'District finance resource creation returned unexpected result: %', v_result;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.financial_accounts WHERE id = '97600000-0000-4000-8000-000000000001' AND branch_id IS NULL AND district_id = '97000000-0000-4000-8000-000000000001')
     OR NOT EXISTS (SELECT 1 FROM public.funds WHERE id = '97700000-0000-4000-8000-000000000001' AND branch_id IS NULL AND district_id = '97000000-0000-4000-8000-000000000001') THEN
    RAISE EXCEPTION 'District resources were not persisted at their exact ownership scope';
  END IF;
END
$district_resource_write$;
ROLLBACK;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '97300000-0000-4000-8000-000000000002', true);
DO $branch_resource_write$
DECLARE v_chart_account_id uuid; v_result jsonb;
BEGIN
  SELECT id INTO v_chart_account_id FROM public.chart_of_accounts
  WHERE account_type = 'asset' AND is_active AND NOT is_control_account ORDER BY code LIMIT 1;
  v_result := public.save_finance_scope_resources(
    'branch', '97100000-0000-4000-8000-000000000001',
    jsonb_build_array(jsonb_build_object(
      'id','97600000-0000-4000-8000-000000000002','chart_account_id',v_chart_account_id,
      'branch_id','97100000-0000-4000-8000-000000000001',
      'name','FIN-ORG-001 Branch Mobile Money','account_type','mobile_money','currency_code','SLE','is_active',true
    )),
    jsonb_build_array(jsonb_build_object(
      'id','97700000-0000-4000-8000-000000000002',
      'branch_id','97100000-0000-4000-8000-000000000001',
      'name','FIN-ORG-001 Branch Welfare','code','FINORGBR-WELF',
      'fund_type','designated','is_default',false,'is_active',true
    ))
  );
  IF (v_result->>'financial_accounts_created')::integer <> 1 OR (v_result->>'funds_created')::integer <> 1 THEN
    RAISE EXCEPTION 'Branch finance resource creation returned unexpected result: %', v_result;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.financial_accounts WHERE id = '97600000-0000-4000-8000-000000000002' AND branch_id = '97100000-0000-4000-8000-000000000001' AND district_id = '97000000-0000-4000-8000-000000000001')
     OR NOT EXISTS (SELECT 1 FROM public.funds WHERE id = '97700000-0000-4000-8000-000000000002' AND branch_id = '97100000-0000-4000-8000-000000000001' AND district_id = '97000000-0000-4000-8000-000000000001') THEN
    RAISE EXCEPTION 'Branch resources did not inherit their branch district';
  END IF;
  BEGIN
    PERFORM public.save_finance_scope_resources('district','97000000-0000-4000-8000-000000000001','[]'::jsonb,'[]'::jsonb);
    RAISE EXCEPTION 'FIN_ORG_001_EXPECTED_DISTRICT_WRITE_DENIAL';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'FIN_ORG_001_EXPECTED_DISTRICT_WRITE_DENIAL' THEN RAISE; END IF;
    IF position('Insufficient permission' in SQLERRM) = 0 THEN RAISE; END IF;
  END;
END
$branch_resource_write$;
ROLLBACK;

-- Scope discovery mirrors the exact scopes granted by the finance permission catalog.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '97300000-0000-4000-8000-000000000001', true);
DO $district_scope_discovery$
DECLARE v_scopes jsonb;
BEGIN
  SELECT coalesce(jsonb_agg(jsonb_build_object('type', scope_type, 'id', scope_id)), '[]'::jsonb)
  INTO v_scopes FROM public.get_my_finance_scopes();
  IF jsonb_array_length(v_scopes) <> 3
     OR NOT (v_scopes @> '[{"type":"district","id":"97000000-0000-4000-8000-000000000001"}]'::jsonb)
     OR NOT (v_scopes @> '[{"type":"branch","id":"97100000-0000-4000-8000-000000000001"}]'::jsonb)
     OR NOT (v_scopes @> '[{"type":"branch","id":"97100000-0000-4000-8000-000000000002"}]'::jsonb) THEN
    RAISE EXCEPTION 'District finance user received incorrect authorized scope list: %', v_scopes;
  END IF;
END
$district_scope_discovery$;
ROLLBACK;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '97300000-0000-4000-8000-000000000002', true);
DO $branch_scope_discovery$
DECLARE v_scopes jsonb;
BEGIN
  SELECT coalesce(jsonb_agg(jsonb_build_object('type', scope_type, 'id', scope_id)), '[]'::jsonb)
  INTO v_scopes FROM public.get_my_finance_scopes();
  IF jsonb_array_length(v_scopes) <> 1
     OR NOT (v_scopes @> '[{"type":"branch","id":"97100000-0000-4000-8000-000000000001"}]'::jsonb) THEN
    RAISE EXCEPTION 'Branch finance user received scopes outside its branch: %', v_scopes;
  END IF;
END
$branch_scope_discovery$;
ROLLBACK;

-- District and branch approval policy writes must stay at their exact ownership scope.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '97300000-0000-4000-8000-000000000001', true);
DO $district_policy_write$
DECLARE v_result jsonb;
BEGIN
  v_result := public.save_finance_scope_approval_policies(
    'district','97000000-0000-4000-8000-000000000001',
    jsonb_build_array(jsonb_build_object(
      'id','97800000-0000-4000-8000-000000000001',
      'name','FIN-ORG-001 District Receipt Approval',
      'transaction_type','financial_document','branch_id',null,
      'district_id','97000000-0000-4000-8000-000000000001',
      'effective_from','2026-01-01','is_active',true
    )),
    jsonb_build_array(jsonb_build_object(
      'id','97900000-0000-4000-8000-000000000001',
      'policy_id','97800000-0000-4000-8000-000000000001',
      'min_amount_base',0,'max_amount_base',null
    )),
    jsonb_build_array(jsonb_build_object(
      'id','97900000-0000-4000-8000-000000000002',
      'band_id','97900000-0000-4000-8000-000000000001',
      'step_number',1,'required_permission_key','approve_finances',
      'required_approvals',2,'prohibit_submitter_approval',true
    ))
  );
  IF v_result->>'saved' <> 'true'
     OR (v_result->>'policies_created')::integer <> 1
     OR NOT EXISTS (
       SELECT 1 FROM public.approval_policies
       WHERE id='97800000-0000-4000-8000-000000000001'
         AND branch_id IS NULL AND district_id='97000000-0000-4000-8000-000000000001'
     ) THEN
    RAISE EXCEPTION 'District approval policy was not saved at its exact scope: %',v_result;
  END IF;
  BEGIN
    PERFORM public.save_finance_scope_approval_policies(
      'district','97000000-0000-4000-8000-000000000001',
      jsonb_build_array(jsonb_build_object(
        'id','97800000-0000-4000-8000-000000000002','name','Invalid cross-scope policy',
        'transaction_type','financial_document','branch_id','97100000-0000-4000-8000-000000000003',
        'district_id','97000000-0000-4000-8000-000000000001',
        'effective_from','2026-01-01','is_active',true
      )), '[]'::jsonb, '[]'::jsonb
    );
    RAISE EXCEPTION 'FIN_ORG_002_EXPECTED_SCOPE_MISMATCH_DENIAL';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'FIN_ORG_002_EXPECTED_SCOPE_MISMATCH_DENIAL' THEN RAISE; END IF;
    IF position('ownership must match' in lower(SQLERRM)) = 0 THEN RAISE; END IF;
  END;
END
$district_policy_write$;
ROLLBACK;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '97300000-0000-4000-8000-000000000002', true);
DO $branch_policy_write$
BEGIN
  BEGIN
    PERFORM public.save_finance_scope_approval_policies(
      'district','97000000-0000-4000-8000-000000000001','[]'::jsonb,'[]'::jsonb,'[]'::jsonb
    );
    RAISE EXCEPTION 'FIN_ORG_002_EXPECTED_DISTRICT_POLICY_DENIAL';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'FIN_ORG_002_EXPECTED_DISTRICT_POLICY_DENIAL' THEN RAISE; END IF;
    IF position('Insufficient permission' in SQLERRM) = 0 THEN RAISE; END IF;
  END;
END
$branch_policy_write$;
ROLLBACK;

-- Two districts may each have their own version-one policy.
-- The baseline already seeds a church-wide version-one policy.
BEGIN;
DO $approval_policy_scope_version_uniqueness$
DECLARE v_count integer;
BEGIN
  INSERT INTO public.approval_policies (
    id,name,transaction_type,branch_id,district_id,version,effective_from,is_active
  ) VALUES
    ('97800000-0000-4000-8000-000000000011',
     'FIN-ORG-001 District A Version Key Test','financial_document',
     NULL,'97000000-0000-4000-8000-000000000001',1,'2026-01-01',true),
    ('97800000-0000-4000-8000-000000000012',
     'FIN-ORG-001 District B Version Key Test','financial_document',
     NULL,'97000000-0000-4000-8000-000000000002',1,'2026-01-01',true);
  SELECT count(*) INTO v_count FROM public.approval_policies
  WHERE id IN (
    '97800000-0000-4000-8000-000000000011',
    '97800000-0000-4000-8000-000000000012'
  );
  IF v_count <> 2 THEN
    RAISE EXCEPTION 'Different districts must be able to use the same approval policy version';
  END IF;
END
$approval_policy_scope_version_uniqueness$;
ROLLBACK;

DO $finance_org_security$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'uq_approval_policy_version_scope'
      AND position('district_id' in indexdef) > 0
  ) THEN
    RAISE EXCEPTION 'Approval policy version uniqueness must include district ownership';
  END IF;
  IF has_function_privilege('anon', 'private.has_permission_for_district(text,uuid)', 'EXECUTE')
     OR has_function_privilege('service_role', 'private.has_permission_for_district(text,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'District permission helper must not be executable by anon or service_role';
  END IF;
  IF NOT has_function_privilege('authenticated', 'private.has_permission_for_district(text,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Authenticated role is missing district permission helper execution';
  END IF;
  IF has_function_privilege('anon', 'public.save_finance_scope_approval_policies(text,uuid,jsonb,jsonb,jsonb)', 'EXECUTE')
     OR has_function_privilege('service_role', 'public.save_finance_scope_approval_policies(text,uuid,jsonb,jsonb,jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Scoped approval policy writer must not be executable by anon or service_role';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.save_finance_scope_approval_policies(text,uuid,jsonb,jsonb,jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Authenticated role is missing scoped approval policy writer execution';
  END IF;
  IF has_function_privilege('anon', 'public.get_my_finance_scopes()', 'EXECUTE')
     OR has_function_privilege('service_role', 'public.get_my_finance_scopes()', 'EXECUTE') THEN
    RAISE EXCEPTION 'Finance scope discovery must not be executable by anon or service_role';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.get_my_finance_scopes()', 'EXECUTE') THEN
    RAISE EXCEPTION 'Authenticated role is missing finance scope discovery execution';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.oid = 'public.create_finance_scope_document_transaction(text,uuid,text,date,uuid,text,numeric,character,text,uuid,uuid,uuid,text,text,numeric,uuid)'::regprocedure
      AND p.prosecdef
      AND EXISTS (SELECT 1 FROM unnest(p.proconfig) s WHERE split_part(s, '=', 1) = 'search_path' AND trim(both '"' from split_part(s, '=', 2)) = '')
  ) THEN
    RAISE EXCEPTION 'Scoped transaction RPC must be SECURITY DEFINER with empty search_path';
  END IF;
  IF has_function_privilege('authenticated', 'private.has_permission_for_finance_scope(text,uuid,uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'private.has_permission_for_finance_scope(text,uuid,uuid)', 'EXECUTE')
     OR has_function_privilege('service_role', 'private.has_permission_for_finance_scope(text,uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Scoped permission helper must remain private';
  END IF;
END
$finance_org_security$;

-- FIN-ORG-004: Full end-to-end district and church-wide transaction, multi-band/multi-step approval,
-- journal posting, and cross-scope isolation verification.
BEGIN;
INSERT INTO auth.users (id, email) VALUES
  ('97300000-0000-4000-8000-000000000003', 'fin-org-district-approver-one@example.invalid'),
  ('97300000-0000-4000-8000-000000000004', 'fin-org-church-admin@example.invalid'),
  ('97300000-0000-4000-8000-000000000005', 'fin-org-church-approver@example.invalid'),
  ('97300000-0000-4000-8000-000000000006', 'fin-org-district-approver-two@example.invalid');

INSERT INTO public.profiles (id, auth_user_id, first_name, last_name, email) VALUES
  ('97400000-0000-4000-8000-000000000003',
   '97300000-0000-4000-8000-000000000003', 'District', 'Approver One', 'fin-org-district-approver-one@example.invalid'),
  ('97400000-0000-4000-8000-000000000004',
   '97300000-0000-4000-8000-000000000004', 'Church', 'Creator', 'fin-org-church-admin@example.invalid'),
  ('97400000-0000-4000-8000-000000000005',
   '97300000-0000-4000-8000-000000000005', 'Church', 'Approver', 'fin-org-church-approver@example.invalid'),
  ('97400000-0000-4000-8000-000000000006',
   '97300000-0000-4000-8000-000000000006', 'District', 'Approver Two', 'fin-org-district-approver-two@example.invalid');

UPDATE public.profiles
SET portal_access_status = 'active'
WHERE auth_user_id IN (
  '97300000-0000-4000-8000-000000000003',
  '97300000-0000-4000-8000-000000000004',
  '97300000-0000-4000-8000-000000000005',
  '97300000-0000-4000-8000-000000000006'
);

INSERT INTO public.profile_role_assignments (
  profile_id, role_id, scope_type, district_id, assigned_at, is_active
)
SELECT p.id, r.id, 'district',
       '97000000-0000-4000-8000-000000000001', now() - interval '1 day', true
FROM (VALUES
  ('97400000-0000-4000-8000-000000000003'::uuid),
  ('97400000-0000-4000-8000-000000000006'::uuid)
) AS p(id)
CROSS JOIN public.roles r
WHERE r.name IN ('finance_officer', 'admin') AND r.is_active;

INSERT INTO public.profile_role_assignments (
  profile_id, role_id, scope_type, branch_id, district_id, assigned_at, is_active
)
SELECT p.id, r.id, 'church', NULL, NULL, now() - interval '1 day', true
FROM (VALUES
  ('97400000-0000-4000-8000-000000000004'::uuid),
  ('97400000-0000-4000-8000-000000000005'::uuid)
) AS p(id)
CROSS JOIN public.roles r
WHERE r.name IN ('finance_officer', 'admin') AND r.is_active;

-- Save a multi-band, multi-step approval policy in District A, create district receipt + payment,
-- verify options isolation, approve sequentially, post journal, and verify ledger isolation.
DO $fin_org_004_district_lifecycle$
DECLARE
  v_income_id uuid;
  v_expense_id uuid;
  v_church_cash_id uuid;
  v_policy_res jsonb;
  v_options jsonb;
  v_receipt jsonb;
  v_receipt_replay jsonb;
  v_payment jsonb;
  v_docs jsonb;
  v_branch_docs jsonb;
  v_step1_id uuid;
  v_step2_id uuid;
  v_approval_res jsonb;
  v_post_res jsonb;
  v_journals jsonb;
  v_branch_journals jsonb;
  v_tx_date date;
  v_idem_receipt uuid := '97910000-0000-4000-8000-000000000001';
  v_idem_payment uuid := '97910000-0000-4000-8000-000000000002';
  v_church_tx jsonb;
  v_church_docs jsonb;
  v_church_journals jsonb;
  v_church_step_id uuid;
  v_idem_church uuid := '97910000-0000-4000-8000-000000000003';
BEGIN
  SELECT fp.start_date INTO v_tx_date
  FROM public.financial_periods fp
  JOIN public.financial_years fy ON fy.id = fp.financial_year_id
  WHERE fp.status = 'open' AND fy.status = 'open'
  ORDER BY fp.start_date DESC LIMIT 1;

  IF v_tx_date IS NULL THEN
    RAISE EXCEPTION 'FIN-ORG-004 requires at least one open financial period fixture';
  END IF;

  SELECT id INTO v_income_id FROM public.chart_of_accounts
  WHERE account_type = 'income' AND is_active AND NOT is_control_account ORDER BY code LIMIT 1;
  SELECT id INTO v_expense_id FROM public.chart_of_accounts
  WHERE account_type = 'expense' AND is_active AND NOT is_control_account ORDER BY code LIMIT 1;
  SELECT id INTO v_church_cash_id FROM public.financial_accounts
  WHERE branch_id IS NULL AND district_id IS NULL AND is_active AND currency_code = 'SLE' ORDER BY name LIMIT 1;

  -- Switch to District A Finance Officer
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', '97300000-0000-4000-8000-000000000001', true);

  v_policy_res := public.save_finance_scope_approval_policies(
    'district', '97000000-0000-4000-8000-000000000001',
    jsonb_build_array(jsonb_build_object(
      'id', '97810000-0000-4000-8000-000000000001',
      'name', 'District A Tiered Policy',
      'transaction_type', 'financial_document',
      'branch_id', null,
      'district_id', '97000000-0000-4000-8000-000000000001',
      'effective_from', '2020-01-01',
      'is_active', true
    )),
    jsonb_build_array(
      jsonb_build_object(
        'id', '97820000-0000-4000-8000-000000000001',
        'policy_id', '97810000-0000-4000-8000-000000000001',
        'min_amount_base', 0, 'max_amount_base', 1000
      ),
      jsonb_build_object(
        'id', '97820000-0000-4000-8000-000000000002',
        'policy_id', '97810000-0000-4000-8000-000000000001',
        'min_amount_base', 1000, 'max_amount_base', null
      )
    ),
    jsonb_build_array(
      jsonb_build_object(
        'id', '97830000-0000-4000-8000-000000000001',
        'band_id', '97820000-0000-4000-8000-000000000001',
        'step_number', 1, 'required_permission_key', 'approve_finances',
        'required_approvals', 1, 'prohibit_submitter_approval', true
      ),
      jsonb_build_object(
        'id', '97830000-0000-4000-8000-000000000002',
        'band_id', '97820000-0000-4000-8000-000000000002',
        'step_number', 1, 'required_permission_key', 'approve_finances',
        'required_approvals', 1, 'prohibit_submitter_approval', true
      ),
      jsonb_build_object(
        'id', '97830000-0000-4000-8000-000000000003',
        'band_id', '97820000-0000-4000-8000-000000000002',
        'step_number', 2, 'required_permission_key', 'approve_finances',
        'required_approvals', 1, 'prohibit_submitter_approval', true
      )
    )
  );
  IF (v_policy_res->>'bands_created')::integer <> 2
     OR (v_policy_res->>'steps_created')::integer <> 3 THEN
    RAISE EXCEPTION 'Multi-band/multi-step district policy did not persist expected bands/steps: %', v_policy_res;
  END IF;

  -- Check transaction options hierarchy isolation (must include District A treasury, must exclude Branch B1)
  v_options := public.get_finance_scope_transaction_options('district', '97000000-0000-4000-8000-000000000001');
  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_options->'financialAccounts') fa
    WHERE fa->>'id' = '97200000-0000-4000-8000-000000000001'
  ) OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_options->'financialAccounts') fa
    WHERE fa->>'id' IN ('97200000-0000-4000-8000-000000000002', '97200000-0000-4000-8000-000000000004')
  ) THEN
    RAISE EXCEPTION 'District transaction options leaked branch accounts: %', v_options->'financialAccounts';
  END IF;

  -- Create District A Receipt (400 SLE -> Band 1) and test idempotency
  v_receipt := public.create_finance_scope_document_transaction(
    'district', '97000000-0000-4000-8000-000000000001',
    'receipt', v_tx_date, NULL, 'District A Fellowship', 400, 'SLE',
    'cash', '97200000-0000-4000-8000-000000000001', v_income_id,
    '97500000-0000-4000-8000-000000000001', 'DIST-RCPT-1', 'District convention offering', 1, v_idem_receipt
  );
  v_receipt_replay := public.create_finance_scope_document_transaction(
    'district', '97000000-0000-4000-8000-000000000001',
    'receipt', v_tx_date, NULL, 'District A Fellowship', 400, 'SLE',
    'cash', '97200000-0000-4000-8000-000000000001', v_income_id,
    '97500000-0000-4000-8000-000000000001', 'DIST-RCPT-1', 'District convention offering', 1, v_idem_receipt
  );
  IF v_receipt->>'document_id' <> v_receipt_replay->>'document_id'
     OR (v_receipt_replay->>'idempotent_replay')::boolean IS NOT TRUE
     OR v_receipt->>'scope_type' <> 'district' THEN
    RAISE EXCEPTION 'District receipt idempotency or scope check failed: % vs %', v_receipt, v_receipt_replay;
  END IF;

  -- Create District A Payment (1500 SLE -> Band 2 with 2 ordered steps)
  v_payment := public.create_finance_scope_document_transaction(
    'district', '97000000-0000-4000-8000-000000000001',
    'payment', v_tx_date, NULL, 'District Hall Vendor', 1500, 'SLE',
    'bank_transfer', '97200000-0000-4000-8000-000000000001', v_expense_id,
    '97500000-0000-4000-8000-000000000001', 'DIST-PAY-1', 'District outreach venue', 1, v_idem_payment
  );

  -- Branch B1 account must be rejected for District A
  BEGIN
    PERFORM public.create_finance_scope_document_transaction(
      'district', '97000000-0000-4000-8000-000000000001',
      'receipt', v_tx_date, NULL, 'Cross-Scope', 100, 'SLE',
      'cash', '97200000-0000-4000-8000-000000000004', v_income_id,
      NULL, 'X-SCOPE', 'Should fail', 1, '97910000-0000-4000-8000-000000000099'
    );
    RAISE EXCEPTION 'FIN_ORG_004_EXPECTED_ACCOUNT_SCOPE_DENIAL';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'FIN_ORG_004_EXPECTED_ACCOUNT_SCOPE_DENIAL' THEN RAISE; END IF;
  END;

  -- District officer cannot create Church-wide transactions
  BEGIN
    PERFORM public.create_finance_scope_document_transaction(
      'church', NULL,
      'receipt', v_tx_date, NULL, 'Church', 100, 'SLE',
      'cash', v_church_cash_id, v_income_id,
      NULL, 'CHURCH-DENY', 'Should fail', 1, '97910000-0000-4000-8000-000000000098'
    );
    RAISE EXCEPTION 'FIN_ORG_004_EXPECTED_CHURCH_TX_DENIAL';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'FIN_ORG_004_EXPECTED_CHURCH_TX_DENIAL' THEN RAISE; END IF;
    IF position('Insufficient permission' in SQLERRM) = 0 THEN RAISE; END IF;
  END;

  -- Submitter cannot approve their own district document
  v_docs := public.get_finance_scope_documents('district', '97000000-0000-4000-8000-000000000001');
  SELECT (doc->>'actor_approval_step_id')::uuid INTO v_step1_id
  FROM jsonb_array_elements(v_docs->'documents') doc
  WHERE doc->>'id' = v_payment->>'document_id';
  IF v_step1_id IS NOT NULL THEN
    RAISE EXCEPTION 'Submitter unexpectedly received an actionable approval step for their own district payment';
  END IF;

  -- Branch A1 document listing must not include District A documents
  v_branch_docs := public.get_finance_scope_documents('branch', '97100000-0000-4000-8000-000000000001');
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_branch_docs->'documents') doc
    WHERE doc->>'id' IN (v_receipt->>'document_id', v_payment->>'document_id')
  ) THEN
    RAISE EXCEPTION 'Branch document list leaked district-owned documents';
  END IF;

  -- Branch A1 officer cannot approve District A payment step
  PERFORM set_config('request.jwt.claim.sub', '97300000-0000-4000-8000-000000000002', true);
  SELECT (s->>'id')::uuid INTO v_step1_id
  FROM jsonb_array_elements(v_docs->'documents') doc,
       jsonb_array_elements(doc->'approval_steps') s
  WHERE doc->>'id' = v_payment->>'document_id' AND (s->>'step_order')::integer = 1;
  BEGIN
    PERFORM public.decide_financial_document_approval(v_step1_id, 'approved', 'Unauthorized branch try');
    RAISE EXCEPTION 'FIN_ORG_004_EXPECTED_BRANCH_APPROVER_DENIAL';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'FIN_ORG_004_EXPECTED_BRANCH_APPROVER_DENIAL' THEN RAISE; END IF;
    IF position('required permission' in lower(SQLERRM)) = 0 THEN RAISE; END IF;
  END;

  -- District approver one completes Step 1; a separate district approver completes Step 2.
  PERFORM set_config('request.jwt.claim.sub', '97300000-0000-4000-8000-000000000003', true);
  v_docs := public.get_finance_scope_documents('district', '97000000-0000-4000-8000-000000000001');
  SELECT (doc->>'actor_approval_step_id')::uuid INTO v_step1_id
  FROM jsonb_array_elements(v_docs->'documents') doc
  WHERE doc->>'id' = v_payment->>'document_id';
  IF v_step1_id IS NULL THEN
    RAISE EXCEPTION 'District approver did not receive step 1 of district payment';
  END IF;

  v_approval_res := public.decide_financial_document_approval(v_step1_id, 'approved', 'Step 1 OK');
  IF v_approval_res->>'approval_status' <> 'pending' THEN
    RAISE EXCEPTION '2-step district payment completed prematurely after step 1: %', v_approval_res;
  END IF;

  PERFORM set_config('request.jwt.claim.sub', '97300000-0000-4000-8000-000000000006', true);
  v_docs := public.get_finance_scope_documents('district', '97000000-0000-4000-8000-000000000001');
  SELECT (doc->>'actor_approval_step_id')::uuid INTO v_step2_id
  FROM jsonb_array_elements(v_docs->'documents') doc
  WHERE doc->>'id' = v_payment->>'document_id';
  IF v_step2_id IS NULL OR v_step2_id = v_step1_id THEN
    RAISE EXCEPTION 'District approver did not advance to step 2';
  END IF;

  v_approval_res := public.decide_financial_document_approval(v_step2_id, 'approved', 'Step 2 OK');
  IF v_approval_res->>'approval_status' <> 'approved' OR v_approval_res->>'journal_entry_id' IS NULL THEN
    RAISE EXCEPTION 'Step 2 did not approve and attach district payment journal: %', v_approval_res;
  END IF;

  -- District poster posts the approved journal entry
  v_post_res := public.post_finance_journal_entry((v_payment->>'journal_entry_id')::uuid);
  IF v_post_res->>'status' <> 'posted' THEN
    RAISE EXCEPTION 'District journal posting failed: %', v_post_res;
  END IF;

  v_journals := public.get_finance_scope_journals('district', '97000000-0000-4000-8000-000000000001');
  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_journals->'journals') j
    WHERE j->>'id' = v_payment->>'journal_entry_id'
      AND j->>'status' = 'posted'
      AND j->>'district_id' = '97000000-0000-4000-8000-000000000001'
  ) OR jsonb_array_length(v_journals->'account_balances') = 0 THEN
    RAISE EXCEPTION 'District posted journal did not populate scoped ledger balances: %', v_journals;
  END IF;

  v_branch_journals := public.get_finance_scope_journals('branch', '97100000-0000-4000-8000-000000000001');
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_branch_journals->'journals') j
    WHERE j->>'id' = v_payment->>'journal_entry_id'
  ) THEN
    RAISE EXCEPTION 'Branch journal list leaked district journal entry';
  END IF;

  -- Church-wide receipt lifecycle
  IF v_church_cash_id IS NOT NULL THEN
    PERFORM set_config('request.jwt.claim.sub', '97300000-0000-4000-8000-000000000004', true);
    v_church_tx := public.create_finance_scope_document_transaction(
      'church', NULL, 'receipt', v_tx_date, NULL, 'National Synod Offering', 250, 'SLE',
      'bank_transfer', v_church_cash_id, v_income_id, NULL, 'HQ-RCPT-1', 'Church-wide income', 1, v_idem_church
    );

    PERFORM set_config('request.jwt.claim.sub', '97300000-0000-4000-8000-000000000005', true);
    v_church_docs := public.get_finance_scope_documents('church', NULL);
    SELECT (doc->>'actor_approval_step_id')::uuid INTO v_church_step_id
    FROM jsonb_array_elements(v_church_docs->'documents') doc
    WHERE doc->>'id' = v_church_tx->>'document_id';
    IF v_church_step_id IS NULL THEN
      RAISE EXCEPTION 'Church-wide approver did not see pending church-wide document';
    END IF;
    PERFORM public.decide_financial_document_approval(v_church_step_id, 'approved', 'Church approved');
    PERFORM public.post_finance_journal_entry((v_church_tx->>'journal_entry_id')::uuid);

    v_church_journals := public.get_finance_scope_journals('church', NULL);
    IF NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_church_journals->'journals') j
      WHERE j->>'id' = v_church_tx->>'journal_entry_id' AND j->>'status' = 'posted'
    ) THEN
      RAISE EXCEPTION 'Church-wide posted journal was not returned by get_finance_scope_journals';
    END IF;
  END IF;
END
$fin_org_004_district_lifecycle$;
ROLLBACK;

DO $finance_org_complete$ BEGIN
  RAISE NOTICE 'FIN-ORG-001 through FIN-ORG-004 hierarchical financial ownership, lifecycle, and district isolation checks passed';
END $finance_org_complete$;

