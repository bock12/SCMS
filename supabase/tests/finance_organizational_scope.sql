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

DO $finance_org_security$
BEGIN
  IF has_function_privilege('anon', 'private.has_permission_for_district(text,uuid)', 'EXECUTE')
     OR has_function_privilege('service_role', 'private.has_permission_for_district(text,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'District permission helper must not be executable by anon or service_role';
  END IF;
  IF NOT has_function_privilege('authenticated', 'private.has_permission_for_district(text,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Authenticated role is missing district permission helper execution';
  END IF;
  IF has_function_privilege('anon', 'public.get_finance_scope_configuration(text,uuid)', 'EXECUTE')
     OR has_function_privilege('service_role', 'public.get_finance_scope_configuration(text,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Scoped finance configuration API must not be executable by anon or service_role';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.get_finance_scope_configuration(text,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Authenticated role is missing scoped finance configuration API execution';
  END IF;
END
$finance_org_security$;

DO $finance_org_complete$ BEGIN
  RAISE NOTICE 'FIN-ORG-001 hierarchical financial ownership and district isolation checks passed';
END $finance_org_complete$;
