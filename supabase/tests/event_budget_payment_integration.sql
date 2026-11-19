-- FIN-INT-002 event budget approval and canonical payment regression tests.
-- Runs after FIN-INT-001 lifecycle fixtures in the disposable PostgreSQL 17 CI DB.

DO $event_budget_payment$
DECLARE
  v_branch_id uuid := '10000000-0000-4000-8000-000000000001';
  v_submitter_auth uuid := '98000000-0000-4000-8000-000000000001';
  v_submitter_profile uuid := '98000000-0000-4000-8000-000000000002';
  v_approver_auth uuid := '98000000-0000-4000-8000-000000000003';
  v_approver_profile uuid := '98000000-0000-4000-8000-000000000004';
  v_event_id uuid := '98000000-0000-4000-8000-000000000005';
  v_cash_account_id uuid := '98000000-0000-4000-8000-000000000006';
  v_cash_chart_id uuid := '98000000-0000-4000-8000-000000000007';
  v_expense_chart_id uuid := '98000000-0000-4000-8000-000000000008';
  v_budget_policy_id uuid := '98000000-0000-4000-8000-000000000009';
  v_budget_band_id uuid := '98000000-0000-4000-8000-000000000010';
  v_finance_policy_id uuid := '98000000-0000-4000-8000-000000000011';
  v_finance_band_id uuid := '98000000-0000-4000-8000-000000000012';
  v_budget_result jsonb;
  v_payment_result jsonb;
  v_approval_result jsonb;
  v_budget_id uuid;
  v_request_id uuid;
  v_step_id uuid;
  v_document_id uuid;
  v_journal_id uuid;
  v_unapproved_budget_id uuid;
  v_total_actual numeric(20,4);
BEGIN
  INSERT INTO auth.users (id, email) VALUES
    (v_submitter_auth, 'fin-int-002-submitter@example.invalid'),
    (v_approver_auth, 'fin-int-002-approver@example.invalid');

  INSERT INTO public.profiles (id, auth_user_id, branch_id, first_name, last_name, email)
  VALUES
    (v_submitter_profile, v_submitter_auth, v_branch_id, 'Budget', 'Submitter', 'fin-int-002-submitter@example.invalid'),
    (v_approver_profile, v_approver_auth, v_branch_id, 'Budget', 'Approver', 'fin-int-002-approver@example.invalid');

  INSERT INTO public.profile_role_assignments (
    profile_id, role_id, scope_type, branch_id, assigned_at, is_active
  )
  SELECT actor.profile_id, r.id, 'branch', v_branch_id, now() - interval '1 day', true
  FROM (VALUES (v_submitter_profile), (v_approver_profile)) actor(profile_id)
  CROSS JOIN public.roles r
  WHERE r.name = 'finance_officer' AND r.is_active;

  INSERT INTO public.chart_of_accounts (id, code, name, account_type, normal_balance)
  VALUES
    (v_cash_chart_id, 'FIN-INT-002-CASH', 'Event Test Cash', 'asset', 'debit'),
    (v_expense_chart_id, 'FIN-INT-002-EXP', 'Event Test Expense', 'expense', 'debit');

  INSERT INTO public.financial_accounts (
    id, chart_account_id, branch_id, name, account_type, currency_code
  ) VALUES (
    v_cash_account_id, v_cash_chart_id, v_branch_id,
    'Event Test Cash Account', 'cash', 'SLE'
  );

  INSERT INTO public.events (
    id, branch_id, title, start_time, end_time, status, created_by_profile_id
  ) VALUES (
    v_event_id, v_branch_id, 'FIN-INT-002 Test Event',
    '2026-11-20 10:00:00+00', '2026-11-20 12:00:00+00',
    'upcoming', v_submitter_profile
  );

  INSERT INTO public.approval_policies (
    id, name, transaction_type, branch_id, version, effective_from,
    is_active, created_by_profile_id
  ) VALUES (
    v_budget_policy_id, 'FIN-INT-002 Event Budget Policy', 'budget',
    v_branch_id, 1, '2020-01-01', true, v_submitter_profile
  );

  INSERT INTO public.approval_policy_bands (id, policy_id, min_amount_base, max_amount_base)
  VALUES (v_budget_band_id, v_budget_policy_id, 0, NULL);

  INSERT INTO public.approval_policy_steps (
    band_id, step_number, required_permission_key, required_approvals,
    prohibit_submitter_approval
  ) VALUES (v_budget_band_id, 1, 'approve_finances', 1, true);

  INSERT INTO public.approval_policies (
    id, name, transaction_type, branch_id, version, effective_from,
    is_active, created_by_profile_id
  ) VALUES (
    v_finance_policy_id, 'FIN-INT-002 Immediate Payment Policy', 'financial_document',
    v_branch_id, 6, '2020-01-01', true, v_submitter_profile
  );

  INSERT INTO public.approval_policy_bands (id, policy_id, min_amount_base, max_amount_base)
  VALUES (v_finance_band_id, v_finance_policy_id, 0, NULL);

  PERFORM set_config('request.jwt.claim.sub', v_submitter_auth::text, true);

  v_budget_result := public.submit_event_budget_for_approval(
    v_event_id,
    '96000000-0000-4000-8000-000000000009',
    'FIN-INT-002 Event Budget',
    'SLE',
    1,
    jsonb_build_array(jsonb_build_object(
      'account_id', v_expense_chart_id,
      'fund_id', null,
      'description', 'Event venue and logistics',
      'allocated_amount', 250
    ))
  );

  v_budget_id := (v_budget_result->>'budget_id')::uuid;
  v_request_id := (v_budget_result->>'approval_request_id')::uuid;

  IF v_budget_id IS NULL OR v_request_id IS NULL
     OR v_budget_result->>'status' <> 'pending_approval'
     OR NOT EXISTS (
       SELECT 1 FROM public.budgets
       WHERE id = v_budget_id AND status = 'pending_approval'
         AND budget_type = 'event' AND event_id = v_event_id
     ) THEN
    RAISE EXCEPTION 'Event budget was not atomically submitted for approval';
  END IF;

  SELECT id INTO v_step_id
  FROM public.approval_request_steps
  WHERE approval_request_id = v_request_id AND step_number = 1;

  PERFORM set_config('request.jwt.claim.sub', v_approver_auth::text, true);
  v_approval_result := public.decide_event_budget_approval(
    v_step_id, 'approved', 'Approved in FIN-INT-002 test'
  );

  IF v_approval_result->>'approval_status' <> 'approved'
     OR NOT EXISTS (
       SELECT 1 FROM public.budgets
       WHERE id = v_budget_id AND status = 'approved' AND approved_at IS NOT NULL
     ) THEN
    RAISE EXCEPTION 'Event budget approval did not update the persisted budget';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_submitter_auth::text, true);
  v_payment_result := public.create_event_budget_payment(
    v_budget_id,
    '2026-11-20',
    NULL,
    'Event Venue Supplier',
    200,
    'bank_transfer',
    v_cash_account_id,
    v_expense_chart_id,
    NULL,
    'FIN-INT-002-EVENT-PAYMENT',
    'Payment against approved event budget',
    1
  );

  v_document_id := (v_payment_result->>'document_id')::uuid;
  v_journal_id := (v_payment_result->>'journal_entry_id')::uuid;

  IF v_document_id IS NULL OR v_journal_id IS NULL
     OR v_payment_result->>'status' <> 'approved'
     OR NOT EXISTS (
       SELECT 1 FROM public.financial_documents d
       JOIN public.journal_entries j ON j.id = d.journal_entry_id
       WHERE d.id = v_document_id
         AND d.source_budget_id = v_budget_id
         AND d.document_type = 'payment'
         AND d.status = 'approved'
         AND j.id = v_journal_id
         AND j.status = 'draft'
         AND j.source_type = 'financial_document'
         AND j.source_id = d.id
     ) THEN
    RAISE EXCEPTION 'Canonical payment was not linked to the approved event budget and journal';
  END IF;

  SELECT coalesce(sum(jl.base_debit_amount - jl.base_credit_amount), 0)
  INTO v_total_actual
  FROM public.financial_documents d
  JOIN public.journal_entries j ON j.id = d.journal_entry_id
  JOIN public.journal_lines jl ON jl.journal_entry_id = j.id
  WHERE d.source_budget_id = v_budget_id
    AND j.status = 'posted'
    AND jl.account_id = v_expense_chart_id;

  IF v_total_actual <> 0 THEN
    RAISE EXCEPTION 'Approved but unposted event payment was counted as actual expenditure';
  END IF;

  BEGIN
    PERFORM public.create_event_budget_payment(
      v_budget_id, '2026-11-20', NULL, 'Duplicate Supplier', 100,
      'cash', v_cash_account_id, v_expense_chart_id, NULL,
      'FIN-INT-002-DUPLICATE', 'Duplicate payment attempt', 1
    );
    RAISE EXCEPTION 'FIN_INT_002_EXPECTED_DUPLICATE_PAYMENT_DENIAL';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'FIN_INT_002_EXPECTED_DUPLICATE_PAYMENT_DENIAL' THEN RAISE; END IF;
    IF position('already linked' in lower(SQLERRM)) = 0 THEN RAISE; END IF;
  END;

  v_budget_result := public.submit_event_budget_for_approval(
    v_event_id,
    '96000000-0000-4000-8000-000000000009',
    'FIN-INT-002 Unapproved Event Budget',
    'SLE',
    1,
    jsonb_build_array(jsonb_build_object(
      'account_id', v_expense_chart_id,
      'fund_id', null,
      'description', 'Unapproved event expense',
      'allocated_amount', 100
    ))
  );
  v_unapproved_budget_id := (v_budget_result->>'budget_id')::uuid;

  BEGIN
    PERFORM public.create_event_budget_payment(
      v_unapproved_budget_id, '2026-11-20', NULL, 'Unapproved Supplier', 50,
      'cash', v_cash_account_id, v_expense_chart_id, NULL,
      'FIN-INT-002-UNAPPROVED', 'Unapproved budget payment attempt', 1
    );
    RAISE EXCEPTION 'FIN_INT_002_EXPECTED_UNAPPROVED_BUDGET_DENIAL';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'FIN_INT_002_EXPECTED_UNAPPROVED_BUDGET_DENIAL' THEN RAISE; END IF;
    IF position('only an approved event budget' in lower(SQLERRM)) = 0 THEN RAISE; END IF;
  END;

  v_payment_result := public.post_finance_journal_entry(v_journal_id);
  IF v_payment_result->>'status' <> 'posted' THEN
    RAISE EXCEPTION 'Approved event budget payment journal did not post through the controlled posting API';
  END IF;

  SELECT coalesce(sum(jl.base_debit_amount - jl.base_credit_amount), 0)
  INTO v_total_actual
  FROM public.financial_documents d
  JOIN public.journal_entries j ON j.id = d.journal_entry_id
  JOIN public.journal_lines jl ON jl.journal_entry_id = j.id
  WHERE d.source_budget_id = v_budget_id
    AND j.status = 'posted'
    AND jl.account_id = v_expense_chart_id;

  IF v_total_actual <> 200 THEN
    RAISE EXCEPTION 'Posted event payment did not contribute exactly once to source actuals';
  END IF;

  RAISE NOTICE 'FIN-INT-002 event budget approval, payment linkage and posted actual checks passed';
END
$event_budget_payment$;
