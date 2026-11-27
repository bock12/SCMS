-- FIN-INT-001 behavior-level regression tests.
-- Runs only in the disposable PostgreSQL 17 CI database after the canonical
-- baseline and the secure finance RPC migration have been applied.

DO $finance_transaction_lifecycle$
DECLARE
  v_branch_id uuid := '10000000-0000-4000-8000-000000000001';
  v_auth_id uuid := '96000000-0000-4000-8000-000000000002';
  v_profile_id uuid := '96000000-0000-4000-8000-000000000003';
  v_cash_chart_id uuid := '96000000-0000-4000-8000-000000000004';
  v_income_chart_id uuid := '96000000-0000-4000-8000-000000000005';
  v_expense_chart_id uuid := '96000000-0000-4000-8000-000000000006';
  v_financial_account_id uuid := '96000000-0000-4000-8000-000000000007';
  v_year_id uuid := '96000000-0000-4000-8000-000000000008';
  v_period_id uuid := '96000000-0000-4000-8000-000000000009';
  v_policy_id uuid := '96000000-0000-4000-8000-000000000010';
  v_band_id uuid := '96000000-0000-4000-8000-000000000011';
  v_approver1_auth uuid := '96000000-0000-4000-8000-000000000012';
  v_approver1_profile uuid := '96000000-0000-4000-8000-000000000013';
  v_approver2_auth uuid := '96000000-0000-4000-8000-000000000014';
  v_approver2_profile uuid := '96000000-0000-4000-8000-000000000015';
  v_policy2_id uuid := '96000000-0000-4000-8000-000000000016';
  v_band2_id uuid := '96000000-0000-4000-8000-000000000017';
  v_policy3_id uuid := '96000000-0000-4000-8000-000000000018';
  v_band3_id uuid := '96000000-0000-4000-8000-000000000019';
  v_policy4_id uuid := '96000000-0000-4000-8000-000000000020';
  v_band4_id uuid := '96000000-0000-4000-8000-000000000021';
  v_result jsonb;
  v_approval_result jsonb;
  v_request_id uuid;
  v_step1_id uuid;
  v_step2_id uuid;
  v_receipt jsonb;
  v_receipt_retry jsonb;
  v_payment jsonb;
  v_document_id uuid;
  v_journal_id uuid;
  v_line_count integer;
  v_debits numeric(20,4);
  v_credits numeric(20,4);
  v_base_debits numeric(20,4);
  v_base_credits numeric(20,4);
  v_post_result jsonb;
  v_journal_listing jsonb;
  v_configuration jsonb;
  v_new_financial_account_id uuid := '96000000-0000-4000-8000-000000000022';
  v_policy5_id uuid := '96000000-0000-4000-8000-000000000023';
  v_band5_id uuid := '96000000-0000-4000-8000-000000000024';
  v_step5_id uuid := '96000000-0000-4000-8000-000000000025';
  v_global_policy_id uuid := '96000000-0000-4000-8000-000000000026';
  v_policy_index integer;
  v_bad_configuration jsonb;
BEGIN
  -- The finance actor is branch-scoped; seed its referenced branch first.
  INSERT INTO public.church_branches (id, name, code, is_main_branch, status)
  VALUES (v_branch_id, 'FIN-INT Test Branch', 'FIN-INT-001', true, 'active')
  ON CONFLICT (id) DO UPDATE
    SET name = EXCLUDED.name,
        code = EXCLUDED.code,
        is_main_branch = EXCLUDED.is_main_branch,
        status = 'active';

  -- A second active branch is required to distinguish scope denial from
  -- a nonexistent-branch validation error in the authorization test.
  INSERT INTO public.church_branches (id, name, code, is_main_branch, status)
  VALUES (
    '10000000-0000-4000-8000-000000000002',
    'FIN-INT Out-of-Scope Branch',
    'FIN-INT-002',
    false,
    'active'
  )
  ON CONFLICT (id) DO UPDATE
    SET name = EXCLUDED.name,
        code = EXCLUDED.code,
        is_main_branch = false,
        status = 'active';

  INSERT INTO auth.users (id, email)
  VALUES (v_auth_id, 'fin-int-001@example.invalid');

  INSERT INTO public.profiles (id, auth_user_id, branch_id, first_name, last_name, email)
  VALUES (v_profile_id, v_auth_id, v_branch_id, 'Finance', 'Tester', 'fin-int-001@example.invalid');
  UPDATE public.profiles
  SET portal_access_status = 'active'
  WHERE auth_user_id = v_auth_id;

  INSERT INTO public.profile_role_assignments (
    profile_id, role_id, scope_type, branch_id, assigned_at, is_active
  )
  SELECT v_profile_id, r.id, 'branch', v_branch_id, now() - interval '1 day', true
  FROM public.roles r WHERE r.name = 'finance_officer' AND r.is_active;

  IF NOT EXISTS (
    SELECT 1 FROM public.profile_role_assignments pra
    JOIN public.roles r ON r.id = pra.role_id
    JOIN public.role_permissions rp ON rp.role_id = r.id
    JOIN public.permissions p ON p.id = rp.permission_id
    WHERE pra.profile_id = v_profile_id
      AND pra.branch_id = v_branch_id
      AND pra.is_active AND r.is_active
      AND p.key = 'manage_finances'
  ) THEN
    RAISE EXCEPTION 'Finance test actor is missing manage_finances permission';
  END IF;

  INSERT INTO public.church_settings (id, church_name, base_currency_code)
  VALUES (1, 'FIN-INT Test Church', 'SLE')
  ON CONFLICT (id) DO UPDATE SET base_currency_code = 'SLE';

  INSERT INTO public.chart_of_accounts (id, code, name, account_type, normal_balance)
  VALUES
    (v_cash_chart_id, 'FIN-INT-CASH', 'Test Cash', 'asset', 'debit'),
    (v_income_chart_id, 'FIN-INT-INCOME', 'Test Offering Income', 'income', 'credit'),
    (v_expense_chart_id, 'FIN-INT-EXPENSE', 'Test Operating Expense', 'expense', 'debit');

  INSERT INTO public.financial_accounts (
    id, chart_account_id, branch_id, name, account_type, currency_code
  ) VALUES (
    v_financial_account_id, v_cash_chart_id, v_branch_id,
    'Test Cash Account', 'cash', 'SLE'
  );

  INSERT INTO public.financial_years (id, year_number, start_date, end_date, status)
  VALUES (v_year_id, 2026, '2026-01-01', '2026-12-31', 'open');

  INSERT INTO public.financial_periods (
    id, financial_year_id, name, start_date, end_date, status
  ) VALUES (
    v_period_id, v_year_id, 'November 2026', '2026-11-01', '2026-11-30', 'open'
  );

  PERFORM set_config('request.jwt.claim.sub', v_auth_id::text, true);

  IF NOT EXISTS (
    SELECT 1 FROM public.church_branches
    WHERE id = v_branch_id AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'FIN-INT test branch is not active immediately before transaction creation';
  END IF;

  -- Missing policy must fail and leave no partial financial document.
  BEGIN
    PERFORM public.create_finance_scope_document_transaction(
      p_scope_type => 'branch',
      p_scope_id => v_branch_id,
      p_document_type => 'receipt',
      p_transaction_date => '2026-11-17',
      p_profile_id => NULL,
      p_party_name => 'Test Donor',
      p_amount => 100,
      p_currency_code => 'SLE',
      p_payment_method => 'cash',
      p_financial_account_id => v_financial_account_id,
      p_category_account_id => v_income_chart_id,
      p_external_reference => 'FIN-INT-NO-POLICY',
      p_description => 'Missing policy rollback test',
      p_exchange_rate_to_base => 1,
      p_idempotency_key => '97000000-0000-4000-8000-000000000001'
    );
    RAISE EXCEPTION 'FIN_INT_EXPECTED_POLICY_FAILURE';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'FIN_INT_EXPECTED_POLICY_FAILURE' THEN RAISE; END IF;
    IF position('approval policy' in lower(SQLERRM)) = 0 THEN RAISE; END IF;
  END;

  IF EXISTS (
    SELECT 1 FROM public.financial_documents
    WHERE external_reference = 'FIN-INT-NO-POLICY'
  ) THEN
    RAISE EXCEPTION 'Missing approval policy left a partial financial document';
  END IF;

  -- A matching zero-step band is an explicitly configured immediate-approval
  -- policy. It is not equivalent to a missing policy or missing amount band.
  INSERT INTO public.approval_policies (
    id, name, transaction_type, branch_id, version, effective_from, is_active,
    created_by_profile_id
  ) VALUES (
    v_policy_id, 'FIN-INT Test Immediate Policy', 'financial_document',
    v_branch_id, 1, '2020-01-01', true, v_profile_id
  );

  INSERT INTO public.approval_policy_bands (id, policy_id, min_amount_base, max_amount_base)
  VALUES (v_band_id, v_policy_id, 0, NULL);

  v_receipt := public.create_finance_scope_document_transaction(
    'branch', v_branch_id, 'receipt', '2026-11-17', NULL, 'Test Donor', 125,
    'SLE', 'mobile_money', v_financial_account_id, v_income_chart_id,
    NULL, 'FIN-INT-RECEIPT', 'Receipt lifecycle test', 1,
    '97000000-0000-4000-8000-000000000002'
  );

  v_receipt_retry := public.create_finance_scope_document_transaction(
    'branch', v_branch_id, 'receipt', '2026-11-17', NULL, 'Test Donor', 125,
    'SLE', 'mobile_money', v_financial_account_id, v_income_chart_id,
    NULL, 'FIN-INT-RECEIPT', 'Receipt lifecycle test', 1,
    '97000000-0000-4000-8000-000000000002'
  );
  IF v_receipt_retry->>'document_id' IS DISTINCT FROM v_receipt->>'document_id'
     OR v_receipt_retry->>'document_number' IS DISTINCT FROM v_receipt->>'document_number'
     OR v_receipt_retry->>'journal_entry_id' IS DISTINCT FROM v_receipt->>'journal_entry_id'
     OR v_receipt_retry->>'idempotent_replay' <> 'true' THEN
    RAISE EXCEPTION 'An identical receipt retry created a new document or journal';
  END IF;

  BEGIN
    PERFORM public.create_finance_scope_document_transaction(
      'branch', v_branch_id, 'receipt', '2026-11-17', NULL, 'Test Donor', 126,
      'SLE', 'mobile_money', v_financial_account_id, v_income_chart_id,
      NULL, 'FIN-INT-RECEIPT', 'Receipt lifecycle test', 1,
      '97000000-0000-4000-8000-000000000002'
    );
    RAISE EXCEPTION 'FIN_INT_EXPECTED_IDEMPOTENCY_CONFLICT';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'FIN_INT_EXPECTED_IDEMPOTENCY_CONFLICT' THEN RAISE; END IF;
    IF position('different transaction details' in lower(SQLERRM)) = 0 THEN RAISE; END IF;
  END;

  v_document_id := (v_receipt->>'document_id')::uuid;
  v_journal_id := (v_receipt->>'journal_entry_id')::uuid;

  IF v_document_id IS NULL OR v_journal_id IS NULL
     OR coalesce((v_receipt->>'document_number')::bigint, 0) <= 0
     OR v_receipt->>'status' <> 'approved' THEN
    RAISE EXCEPTION 'Receipt RPC did not return an immediately approved document and journal';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.financial_documents d
    JOIN public.journal_entries j ON j.id = d.journal_entry_id
    WHERE d.id = v_document_id
      AND d.status = 'approved'
      AND j.id = v_journal_id
      AND j.status = 'draft'
      AND j.source_type = 'financial_document'
      AND j.source_id = d.id
  ) THEN
    RAISE EXCEPTION 'Approved receipt journal was not linked to its source document';
  END IF;

  SELECT count(*), coalesce(sum(debit_amount), 0), coalesce(sum(credit_amount), 0),
         coalesce(sum(base_debit_amount), 0), coalesce(sum(base_credit_amount), 0)
  INTO v_line_count, v_debits, v_credits, v_base_debits, v_base_credits
  FROM public.journal_lines WHERE journal_entry_id = v_journal_id;

  IF v_line_count <> 2 OR v_debits <> 125 OR v_credits <> 125
     OR v_base_debits <> 125 OR v_base_credits <> 125 THEN
    RAISE EXCEPTION 'Receipt journal lines are missing or unbalanced';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.journal_lines
    WHERE journal_entry_id = v_journal_id
      AND account_id = v_cash_chart_id AND debit_amount = 125 AND credit_amount = 0
  ) OR NOT EXISTS (
    SELECT 1 FROM public.journal_lines
    WHERE journal_entry_id = v_journal_id
      AND account_id = v_income_chart_id AND debit_amount = 0 AND credit_amount = 125
  ) THEN
    RAISE EXCEPTION 'Receipt journal debit/credit account orientation is incorrect';
  END IF;

  -- Approved is not posted: explicitly post only through the narrow RPC.
  v_post_result := public.post_finance_journal_entry(v_journal_id);
  IF v_post_result->>'status' <> 'posted'
     OR coalesce((v_post_result->>'already_posted')::boolean, true) THEN
    RAISE EXCEPTION 'Controlled posting RPC did not post the approved receipt journal';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.journal_entries
    WHERE id = v_journal_id AND status = 'posted' AND posted_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Posted receipt journal status/timestamp was not persisted';
  END IF;

  -- A retry is safe and does not mutate an already-posted immutable entry.
  v_post_result := public.post_finance_journal_entry(v_journal_id);
  IF v_post_result->>'status' <> 'posted'
     OR (v_post_result->>'already_posted')::boolean IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Posting retry did not return the already-posted result';
  END IF;

  v_journal_listing := public.get_finance_journals(v_branch_id);
  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_journal_listing->'journals') AS j(value)
    WHERE j.value->>'id' = v_journal_id::text
      AND j.value->>'status' = 'posted'
      AND j.value->>'can_post' = 'false'
  ) OR NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_journal_listing->'account_balances') AS b(value)
    WHERE b.value->>'account_id' = v_cash_chart_id::text
      AND (b.value->>'debit_total')::numeric = 125
      AND (b.value->>'credit_total')::numeric = 0
  ) THEN
    RAISE EXCEPTION 'Journal listing or posted-only account balance projection is incorrect';
  END IF;

  v_payment := public.create_finance_scope_document_transaction(
    'branch', v_branch_id, 'payment', '2026-11-17', NULL, 'Test Supplier', 75,
    'SLE', 'bank_transfer', v_financial_account_id, v_expense_chart_id,
    NULL, 'FIN-INT-PAYMENT', 'Payment lifecycle test', 1,
    '97000000-0000-4000-8000-000000000003'
  );

  v_document_id := (v_payment->>'document_id')::uuid;
  v_journal_id := (v_payment->>'journal_entry_id')::uuid;

  IF v_document_id IS NULL OR v_journal_id IS NULL
     OR v_payment->>'status' <> 'approved' THEN
    RAISE EXCEPTION 'Payment RPC did not return an immediately approved document and journal';
  END IF;

  SELECT count(*), coalesce(sum(debit_amount), 0), coalesce(sum(credit_amount), 0),
         coalesce(sum(base_debit_amount), 0), coalesce(sum(base_credit_amount), 0)
  INTO v_line_count, v_debits, v_credits, v_base_debits, v_base_credits
  FROM public.journal_lines WHERE journal_entry_id = v_journal_id;

  IF v_line_count <> 2 OR v_debits <> 75 OR v_credits <> 75
     OR v_base_debits <> 75 OR v_base_credits <> 75 THEN
    RAISE EXCEPTION 'Payment journal lines are missing or unbalanced';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.journal_lines
    WHERE journal_entry_id = v_journal_id
      AND account_id = v_expense_chart_id AND debit_amount = 75 AND credit_amount = 0
  ) OR NOT EXISTS (
    SELECT 1 FROM public.journal_lines
    WHERE journal_entry_id = v_journal_id
      AND account_id = v_cash_chart_id AND debit_amount = 0 AND credit_amount = 75
  ) THEN
    RAISE EXCEPTION 'Payment journal debit/credit account orientation is incorrect';
  END IF;


  -- A branch-scoped finance permission must not authorize transactions in
  -- another branch. The permission check runs before account compatibility.
  BEGIN
    PERFORM public.create_finance_scope_document_transaction(
      'branch', '10000000-0000-4000-8000-000000000002', 'receipt', '2026-11-17',
      NULL, 'Out-of-branch Donor', 10, 'SLE', 'cash',
      v_financial_account_id, v_income_chart_id, NULL,
      'FIN-INT-BRANCH-DENIED', 'Branch authorization test', 1,
      '97000000-0000-4000-8000-000000000004'
    );
    RAISE EXCEPTION 'FIN_INT_EXPECTED_BRANCH_DENIAL';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'FIN_INT_EXPECTED_BRANCH_DENIAL' THEN RAISE; END IF;
    IF position('permission' in lower(SQLERRM)) = 0 THEN RAISE; END IF;
  END;

  IF EXISTS (
    SELECT 1 FROM public.financial_documents
    WHERE external_reference = 'FIN-INT-BRANCH-DENIED'
  ) THEN
    RAISE EXCEPTION 'Branch-denied transaction left a financial document';
  END IF;

  -- A live policy without a matching amount band is a configuration error,
  -- not an implicit immediate-approval policy.
  INSERT INTO public.approval_policies (
    id, name, transaction_type, branch_id, version, effective_from,
    is_active, created_by_profile_id
  ) VALUES (
    v_policy2_id, 'FIN-INT Missing Band Policy', 'financial_document',
    v_branch_id, 2, '2020-01-01', true, v_profile_id
  );

  BEGIN
    PERFORM public.create_finance_scope_document_transaction(
      'branch', v_branch_id, 'receipt', '2026-11-17', NULL, 'Unbanded Donor', 50,
      'SLE', 'cash', v_financial_account_id, v_income_chart_id,
      NULL, 'FIN-INT-NO-BAND', 'Missing amount band rollback test', 1,
      '97000000-0000-4000-8000-000000000005'
    );
    RAISE EXCEPTION 'FIN_INT_EXPECTED_BAND_FAILURE';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'FIN_INT_EXPECTED_BAND_FAILURE' THEN RAISE; END IF;
    IF position('threshold band' in lower(SQLERRM)) = 0 THEN RAISE; END IF;
  END;

  IF EXISTS (
    SELECT 1 FROM public.financial_documents
    WHERE external_reference = 'FIN-INT-NO-BAND'
  ) THEN
    RAISE EXCEPTION 'Missing amount band left a partial financial document';
  END IF;

  UPDATE public.approval_policies SET is_active = false WHERE id = v_policy2_id;

  -- Two distinct approvers must complete the configured steps in order.
  INSERT INTO auth.users (id, email) VALUES
    (v_approver1_auth, 'fin-int-approver1@example.invalid'),
    (v_approver2_auth, 'fin-int-approver2@example.invalid');

  INSERT INTO public.profiles (id, auth_user_id, branch_id, first_name, last_name, email)
  VALUES
    (v_approver1_profile, v_approver1_auth, v_branch_id, 'Finance', 'Approver One', 'fin-int-approver1@example.invalid'),
    (v_approver2_profile, v_approver2_auth, v_branch_id, 'Finance', 'Approver Two', 'fin-int-approver2@example.invalid');

  UPDATE public.profiles
  SET portal_access_status = 'active'
  WHERE auth_user_id IN (v_approver1_auth, v_approver2_auth);

  INSERT INTO public.profile_role_assignments (
    profile_id, role_id, scope_type, branch_id, assigned_at, is_active
  )
  SELECT actor.profile_id, r.id, 'branch', v_branch_id, now() - interval '1 day', true
  FROM (VALUES (v_approver1_profile), (v_approver2_profile)) AS actor(profile_id)
  CROSS JOIN public.roles r
  WHERE r.name = 'finance_officer' AND r.is_active;

  INSERT INTO public.approval_policies (
    id, name, transaction_type, branch_id, version, effective_from,
    is_active, created_by_profile_id
  ) VALUES (
    v_policy3_id, 'FIN-INT Two-Step Policy', 'financial_document',
    v_branch_id, 3, '2020-01-01', true, v_profile_id
  );

  INSERT INTO public.approval_policy_bands (id, policy_id, min_amount_base, max_amount_base)
  VALUES (v_band3_id, v_policy3_id, 0, NULL);

  INSERT INTO public.approval_policy_steps (
    band_id, step_number, required_permission_key, required_approvals,
    prohibit_submitter_approval
  ) VALUES
    (v_band3_id, 1, 'approve_finances', 1, true),
    (v_band3_id, 2, 'approve_finances', 1, true);

  v_result := public.create_finance_scope_document_transaction(
    'branch', v_branch_id, 'receipt', '2026-11-17', NULL, 'Two-Step Donor', 200,
    'SLE', 'cash', v_financial_account_id, v_income_chart_id,
    NULL, 'FIN-INT-TWO-STEP', 'Two-step approval lifecycle test', 1,
    '97000000-0000-4000-8000-000000000006'
  );

  v_document_id := (v_result->>'document_id')::uuid;
  v_journal_id := (v_result->>'journal_entry_id')::uuid;
  v_request_id := (v_result->>'approval_request_id')::uuid;

  IF v_result->>'status' <> 'pending_approval'
     OR v_request_id IS NULL OR v_journal_id IS NULL THEN
    RAISE EXCEPTION 'Two-step receipt did not enter pending approval with a pending journal';
  END IF;

  SELECT id INTO v_step1_id FROM public.approval_request_steps
  WHERE approval_request_id = v_request_id AND step_number = 1;
  SELECT id INTO v_step2_id FROM public.approval_request_steps
  WHERE approval_request_id = v_request_id AND step_number = 2;

  IF v_step1_id IS NULL OR v_step2_id IS NULL THEN
    RAISE EXCEPTION 'Two-step approval request did not create both approval steps';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_approver1_auth::text, true);
  v_approval_result := public.decide_financial_document_approval(v_step1_id, 'approved', 'First approval');
  IF v_approval_result->>'approval_status' <> 'pending'
     OR EXISTS (
       SELECT 1 FROM public.financial_documents
       WHERE id = v_document_id AND (status <> 'pending_approval' OR journal_entry_id IS NOT NULL)
     ) THEN
    RAISE EXCEPTION 'First approval incorrectly completed the two-step workflow';
  END IF;

  -- Reusing the first approver for the second level must be rejected.
  -- The failed decision runs in a PL/pgSQL exception subtransaction, so the
  -- pending second step remains available for the distinct approver below.
  BEGIN
    PERFORM set_config('request.jwt.claim.sub', v_approver1_auth::text, true);
    PERFORM public.decide_financial_document_approval(v_step2_id, 'approved', 'Repeated first approver');
    RAISE EXCEPTION 'FIN_INT_EXPECTED_DISTINCT_APPROVER_DENIAL';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'FIN_INT_EXPECTED_DISTINCT_APPROVER_DENIAL' THEN RAISE; END IF;
    IF position('different approver' in lower(SQLERRM)) = 0 THEN RAISE; END IF;
  END;

  PERFORM set_config('request.jwt.claim.sub', v_approver2_auth::text, true);
  v_approval_result := public.decide_financial_document_approval(v_step2_id, 'approved', 'Final approval');

  IF v_approval_result->>'approval_status' <> 'approved'
     OR NOT EXISTS (
       SELECT 1 FROM public.financial_documents d
       JOIN public.journal_entries j ON j.id = d.journal_entry_id
       WHERE d.id = v_document_id AND d.status = 'approved'
         AND j.id = v_journal_id AND j.status = 'draft'
         AND j.source_type = 'financial_document' AND j.source_id = d.id
     ) THEN
    RAISE EXCEPTION 'Final approval did not approve and link the pending journal';
  END IF;

  -- A rejection must reject the document and leave its journal unlinked and
  -- guarded as pending; it must never become postable.
  INSERT INTO public.approval_policies (
    id, name, transaction_type, branch_id, version, effective_from,
    is_active, created_by_profile_id
  ) VALUES (
    v_policy4_id, 'FIN-INT Rejection Policy', 'financial_document',
    v_branch_id, 4, '2020-01-01', true, v_profile_id
  );

  INSERT INTO public.approval_policy_bands (id, policy_id, min_amount_base, max_amount_base)
  VALUES (v_band4_id, v_policy4_id, 0, NULL);

  INSERT INTO public.approval_policy_steps (
    band_id, step_number, required_permission_key, required_approvals,
    prohibit_submitter_approval
  ) VALUES (v_band4_id, 1, 'approve_finances', 1, true);

  PERFORM set_config('request.jwt.claim.sub', v_auth_id::text, true);
  v_result := public.create_finance_scope_document_transaction(
    'branch', v_branch_id, 'payment', '2026-11-17', NULL, 'Rejected Supplier', 60,
    'SLE', 'cash', v_financial_account_id, v_expense_chart_id,
    NULL, 'FIN-INT-REJECTED', 'Rejection lifecycle test', 1,
    '97000000-0000-4000-8000-000000000007'
  );

  v_document_id := (v_result->>'document_id')::uuid;
  v_journal_id := (v_result->>'journal_entry_id')::uuid;
  v_request_id := (v_result->>'approval_request_id')::uuid;
  SELECT id INTO v_step1_id FROM public.approval_request_steps
  WHERE approval_request_id = v_request_id AND step_number = 1;

  PERFORM set_config('request.jwt.claim.sub', v_approver1_auth::text, true);
  v_approval_result := public.decide_financial_document_approval(v_step1_id, 'rejected', 'Rejected in test');

  IF v_approval_result->>'approval_status' <> 'rejected'
     OR NOT EXISTS (
       SELECT 1 FROM public.financial_documents
       WHERE id = v_document_id AND status = 'rejected' AND journal_entry_id IS NULL
     )
     OR NOT EXISTS (
       SELECT 1 FROM public.journal_entries
       WHERE id = v_journal_id AND status = 'draft'
         AND source_type = 'financial_document_pending' AND source_id = v_document_id
     ) THEN
    RAISE EXCEPTION 'Rejected document was not retained with an unlinked pending journal';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_auth_id::text, true);
  BEGIN
    PERFORM public.post_finance_journal_entry(v_journal_id);
    RAISE EXCEPTION 'FIN_INT_EXPECTED_PENDING_RPC_POSTING_DENIAL';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'FIN_INT_EXPECTED_PENDING_RPC_POSTING_DENIAL' THEN RAISE; END IF;
    IF position('before approval' in lower(SQLERRM)) = 0 THEN RAISE; END IF;
  END;

  BEGIN
    UPDATE public.journal_entries SET status = 'posted' WHERE id = v_journal_id;
    RAISE EXCEPTION 'FIN_INT_EXPECTED_PENDING_JOURNAL_POSTING_DENIAL';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'FIN_INT_EXPECTED_PENDING_JOURNAL_POSTING_DENIAL' THEN RAISE; END IF;
    IF position('before approval' in lower(SQLERRM)) = 0 THEN RAISE; END IF;
  END;

  -- A branch Finance Officer may see church-wide fallback policies but must
  -- not need church-wide manage_finances permission merely to retain them.
  INSERT INTO public.approval_policies (
    id, name, transaction_type, branch_id, version, effective_from,
    is_active, created_by_profile_id
  ) VALUES (
    v_global_policy_id, 'FIN-INT Global Fallback Policy', 'financial_document',
    NULL, 1, '2099-01-01', true, v_profile_id
  );

  -- Branch-scoped finance configuration read and save APIs.
  v_configuration := public.get_finance_configuration(v_branch_id);
  IF v_configuration->>'baseCurrencyCode' <> 'SLE'
     OR NOT (v_configuration->'currencies' ? 'SLE')
     OR jsonb_typeof(v_configuration->'chartAccounts') <> 'array'
     OR jsonb_typeof(v_configuration->'approvalPolicySteps') <> 'array' THEN
    RAISE EXCEPTION 'Finance configuration read API returned an incomplete payload';
  END IF;

  v_configuration := jsonb_set(
    v_configuration, '{financialAccounts}',
    (v_configuration->'financialAccounts') || jsonb_build_array(jsonb_build_object(
      'id', v_new_financial_account_id, 'chart_account_id', v_cash_chart_id,
      'branch_id', v_branch_id, 'name', 'Configuration API Mobile Money',
      'account_type', 'mobile_money', 'currency_code', 'SLE',
      'provider_name', 'Test Provider', 'account_reference', 'CFG-001', 'is_active', true
    ))
  );
  v_configuration := jsonb_set(
    v_configuration, '{approvalPolicies}',
    (v_configuration->'approvalPolicies') || jsonb_build_array(jsonb_build_object(
      'id', v_policy5_id, 'name', 'FIN-INT Configuration API Policy',
      'transaction_type', 'financial_document', 'branch_id', v_branch_id,
      'version', 99, 'effective_from', '2099-01-01', 'effective_to', null, 'is_active', true
    ))
  );
  v_configuration := jsonb_set(
    v_configuration, '{approvalPolicyBands}',
    (v_configuration->'approvalPolicyBands') || jsonb_build_array(jsonb_build_object(
      'id', v_band5_id, 'policy_id', v_policy5_id, 'min_amount_base', 0, 'max_amount_base', null
    ))
  );
  v_configuration := jsonb_set(
    v_configuration, '{approvalPolicySteps}',
    (v_configuration->'approvalPolicySteps') || jsonb_build_array(jsonb_build_object(
      'id', v_step5_id, 'band_id', v_band5_id, 'step_number', 1,
      'required_permission_key', 'approve_finances',
      'required_approvals', 2, 'prohibit_submitter_approval', true
    ))
  );

  PERFORM public.save_finance_configuration(v_branch_id, v_configuration);
  v_configuration := public.get_finance_configuration(v_branch_id);

  IF NOT EXISTS (
    SELECT 1 FROM public.financial_accounts
    WHERE id = v_new_financial_account_id
      AND branch_id = v_branch_id AND account_reference = 'CFG-001'
  ) OR NOT EXISTS (
    SELECT 1 FROM public.approval_policies
    WHERE id = v_policy5_id AND branch_id = v_branch_id AND version = 99
  ) OR NOT EXISTS (
    SELECT 1 FROM public.approval_policy_steps
    WHERE id = v_step5_id AND required_approvals = 2
  ) THEN
    RAISE EXCEPTION 'Finance configuration save API did not persist branch account and approval policy records';
  END IF;

  -- Existing church-wide fallback policies are readable in branch scope,
  -- but the branch actor cannot rewrite an immutable policy version.
  SELECT ordinality - 1 INTO v_policy_index
  FROM jsonb_array_elements(v_configuration->'approvalPolicies') WITH ORDINALITY item(value, ordinality)
  WHERE item.value->>'id' = v_policy5_id::text;
  v_bad_configuration := jsonb_set(
    v_configuration,
    ARRAY['approvalPolicies', v_policy_index::text, 'name'],
    to_jsonb('Tampered policy name'::text)
  );
  BEGIN
    PERFORM public.save_finance_configuration(v_branch_id, v_bad_configuration);
    RAISE EXCEPTION 'FIN_INT_EXPECTED_IMMUTABLE_POLICY_DENIAL';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'FIN_INT_EXPECTED_IMMUTABLE_POLICY_DENIAL' THEN RAISE; END IF;
    IF position('immutable' in lower(SQLERRM)) = 0 THEN RAISE; END IF;
  END;

  -- The RPC rejects a financial account payload that crosses branch scope.
  v_bad_configuration := jsonb_set(
    v_configuration,
    '{financialAccounts}',
    (v_configuration->'financialAccounts') || jsonb_build_array(jsonb_build_object(
      'id', '96000000-0000-4000-8000-000000000027',
      'chart_account_id', v_cash_chart_id,
      'branch_id', '10000000-0000-4000-8000-000000000099',
      'name', 'Cross Branch Account',
      'account_type', 'cash',
      'currency_code', 'SLE',
      'is_active', true
    ))
  );
  BEGIN
    PERFORM public.save_finance_configuration(v_branch_id, v_bad_configuration);
    RAISE EXCEPTION 'FIN_INT_EXPECTED_BRANCH_SCOPE_DENIAL';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'FIN_INT_EXPECTED_BRANCH_SCOPE_DENIAL' THEN RAISE; END IF;
    IF position('requested branch' in lower(SQLERRM)) = 0 THEN RAISE; END IF;
  END;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.oid = 'public.get_finance_configuration(uuid)'::regprocedure
      AND p.prosecdef
      AND 'search_path=""' = ANY(p.proconfig)
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.oid = 'public.save_finance_configuration(uuid,jsonb)'::regprocedure
      AND p.prosecdef
      AND 'search_path=""' = ANY(p.proconfig)
  ) THEN
    RAISE EXCEPTION 'Finance configuration RPCs must be SECURITY DEFINER with an empty search_path';
  END IF;

  IF has_table_privilege('authenticated', 'public.chart_of_accounts', 'INSERT')
    OR has_table_privilege('authenticated', 'public.financial_accounts', 'INSERT')
    OR has_table_privilege('authenticated', 'public.approval_policies', 'INSERT') THEN
    RAISE EXCEPTION 'Finance configuration API must not grant direct table inserts';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.get_finance_configuration(uuid)', 'EXECUTE')
    OR NOT has_function_privilege('authenticated', 'public.save_finance_configuration(uuid,jsonb)', 'EXECUTE')
    OR has_function_privilege('anon', 'public.get_finance_configuration(uuid)', 'EXECUTE')
    OR has_function_privilege('anon', 'public.save_finance_configuration(uuid,jsonb)', 'EXECUTE')
    OR has_function_privilege('service_role', 'public.get_finance_configuration(uuid)', 'EXECUTE')
    OR has_function_privilege('service_role', 'public.save_finance_configuration(uuid,jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Finance configuration RPC grants are not restricted to authenticated users';
  END IF;

  BEGIN
    PERFORM public.get_finance_configuration(NULL);
    RAISE EXCEPTION 'FIN_INT_EXPECTED_CHURCH_SCOPE_DENIAL';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'FIN_INT_EXPECTED_CHURCH_SCOPE_DENIAL' THEN RAISE; END IF;
    IF position('Insufficient permission' in SQLERRM) = 0 THEN RAISE; END IF;
  END;

  RAISE NOTICE 'FIN-INT-001 receipt/payment, approval and finance configuration lifecycle checks passed';
END
$finance_transaction_lifecycle$;
