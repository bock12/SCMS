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
  v_receipt jsonb;
  v_payment jsonb;
  v_document_id uuid;
  v_journal_id uuid;
  v_line_count integer;
  v_debits numeric(20,4);
  v_credits numeric(20,4);
  v_base_debits numeric(20,4);
  v_base_credits numeric(20,4);
BEGIN
  INSERT INTO auth.users (id, email)
  VALUES (v_auth_id, 'fin-int-001@example.invalid');

  INSERT INTO public.profiles (id, auth_user_id, branch_id, first_name, last_name, email)
  VALUES (v_profile_id, v_auth_id, v_branch_id, 'Finance', 'Tester', 'fin-int-001@example.invalid');

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

  -- Missing policy must fail and leave no partial financial document.
  BEGIN
    PERFORM public.create_financial_document_transaction(
      'receipt', '2026-11-17', v_branch_id, NULL, 'Test Donor', 100,
      'SLE', 'cash', v_financial_account_id, v_income_chart_id,
      NULL, 'FIN-INT-NO-POLICY', 'Missing policy rollback test', 1
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

  v_receipt := public.create_financial_document_transaction(
    'receipt', '2026-11-17', v_branch_id, NULL, 'Test Donor', 125,
    'SLE', 'mobile_money', v_financial_account_id, v_income_chart_id,
    NULL, 'FIN-INT-RECEIPT', 'Receipt lifecycle test', 1
  );

  v_document_id := (v_receipt->>'document_id')::uuid;
  v_journal_id := (v_receipt->>'journal_entry_id')::uuid;

  IF v_document_id IS NULL OR v_journal_id IS NULL
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

  v_payment := public.create_financial_document_transaction(
    'payment', '2026-11-17', v_branch_id, NULL, 'Test Supplier', 75,
    'SLE', 'bank_transfer', v_financial_account_id, v_expense_chart_id,
    NULL, 'FIN-INT-PAYMENT', 'Payment lifecycle test', 1
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

  RAISE NOTICE 'FIN-INT-001 receipt/payment immediate-approval lifecycle checks passed';
END
$finance_transaction_lifecycle$;
