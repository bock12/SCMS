-- FIN-INT-002 requisition-to-payment lifecycle regression tests.
-- Runs after finance transaction and requisition approval fixtures in PostgreSQL 17 CI.

DO $department_requisition_payment$
DECLARE
  v_branch_id uuid := '10000000-0000-4000-8000-000000000001';
  v_finance_auth uuid := 'a7000000-0000-4000-8000-000000000005';
  v_finance_approver_auth uuid := '96000000-0000-4000-8000-000000000012';
  v_requisition_id uuid;
  v_payment jsonb;
  v_retry jsonb;
  v_summary jsonb;
  v_document_id uuid;
  v_journal_id uuid;
  v_request_id uuid;
  v_step_id uuid;
  v_second_payment jsonb;
  v_second_request uuid;
  v_second_step uuid;
  v_third_payment jsonb;
  v_third_request uuid;
  v_third_step uuid;
  v_post jsonb;
  v_payment_policy_id uuid := 'a8000000-0000-4000-8000-000000000001';
  v_payment_band_id uuid := 'a8000000-0000-4000-8000-000000000002';
BEGIN
  SELECT id INTO v_requisition_id
  FROM public.department_requisitions
  WHERE title = 'Department equipment request'
    AND status = 'approved'
  ORDER BY created_at DESC
  LIMIT 1;
  IF v_requisition_id IS NULL THEN
    RAISE EXCEPTION 'Approved requisition fixture was not created by the preceding lifecycle test';
  END IF;

  -- Isolate this test from earlier finance lifecycle fixtures by configuring
  -- a current, explicit one-step payment approval policy for this branch.
  INSERT INTO public.approval_policies (
    id, name, transaction_type, branch_id, version, effective_from,
    is_active, created_by_profile_id
  ) VALUES (
    v_payment_policy_id, 'FIN-INT-002 Requisition Payment Policy',
    'financial_document', v_branch_id, 1001, '2020-01-01', true,
    'a7000000-0000-4000-8000-000000000006'
  );
  INSERT INTO public.approval_policy_bands (id, policy_id, min_amount_base, max_amount_base)
  VALUES (v_payment_band_id, v_payment_policy_id, 0, NULL);
  INSERT INTO public.approval_policy_steps (
    band_id, step_number, required_permission_key, required_approvals,
    prohibit_submitter_approval
  ) VALUES (v_payment_band_id, 1, 'approve_finances', 1, true);

  PERFORM set_config('request.jwt.claim.sub', v_finance_auth::text, true);
  v_payment := public.create_department_requisition_payment(
    v_requisition_id, '2026-11-19', NULL, 'Test Department Supplier',
    80, 'bank_transfer',
    '96000000-0000-4000-8000-000000000007',
    '96000000-0000-4000-8000-000000000006',
    NULL, 'REQ-PAY-001', 'First partial requisition payment', 'req-payment-attempt-001'
  );
  v_document_id := (v_payment->>'document_id')::uuid;
  v_journal_id := (v_payment->>'journal_entry_id')::uuid;
  v_request_id := (v_payment->>'approval_request_id')::uuid;
  IF v_payment->>'status' <> 'pending_approval'
     OR v_document_id IS NULL OR v_journal_id IS NULL OR v_request_id IS NULL THEN
    RAISE EXCEPTION 'Requisition payment did not enter its separate payment approval workflow';
  END IF;

  -- Repeating the same key returns the original document, not another payment.
  v_retry := public.create_department_requisition_payment(
    v_requisition_id, '2026-11-19', NULL, 'Test Department Supplier',
    80, 'bank_transfer',
    '96000000-0000-4000-8000-000000000007',
    '96000000-0000-4000-8000-000000000006',
    NULL, 'REQ-PAY-001', 'First partial requisition payment', 'req-payment-attempt-001'
  );
  IF v_retry->>'document_id' <> v_document_id::text
     OR coalesce((v_retry->>'already_exists')::boolean, false) IS DISTINCT FROM true
     OR (SELECT count(*) FROM public.financial_documents
         WHERE source_requisition_id = v_requisition_id) <> 1 THEN
    RAISE EXCEPTION 'Idempotent retry created a duplicate requisition payment';
  END IF;

  -- Pending payment reservations prevent over-commitment of the approved amount.
  BEGIN
    PERFORM public.create_department_requisition_payment(
      v_requisition_id, '2026-11-19', NULL, 'Test Department Supplier',
      80, 'bank_transfer',
      '96000000-0000-4000-8000-000000000007',
      '96000000-0000-4000-8000-000000000006',
      NULL, 'REQ-PAY-OVER', 'Over-reservation attempt', 'req-payment-over'
    );
    RAISE EXCEPTION 'REQ_PAY_EXPECTED_OVERPAYMENT_DENIAL';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'REQ_PAY_EXPECTED_OVERPAYMENT_DENIAL' THEN RAISE; END IF;
    IF position('remaining approved requisition amount' in lower(SQLERRM)) = 0 THEN RAISE; END IF;
  END;

  SELECT id INTO v_step_id
  FROM public.approval_request_steps
  WHERE approval_request_id = v_request_id AND step_number = 1;
  PERFORM set_config('request.jwt.claim.sub', v_finance_approver_auth::text, true);
  PERFORM public.decide_financial_document_approval(v_step_id, 'approved', 'Payment approved separately');

  -- Approval alone is not payment: no paid amount until the journal is posted.
  PERFORM set_config('request.jwt.claim.sub', v_finance_auth::text, true);
  v_summary := public.get_department_requisition_payment_summary(v_branch_id);
  SELECT item.value INTO v_summary
  FROM jsonb_array_elements(v_summary) item(value)
  WHERE item.value->>'requisition_id' = v_requisition_id::text;
  IF v_summary IS NULL OR v_summary->>'payment_status' <> 'payment_pending'
     OR (v_summary->>'paid_amount')::numeric <> 0
     OR (v_summary->>'reserved_amount')::numeric <> 80 THEN
    RAISE EXCEPTION 'Approved but unposted requisition payment was incorrectly counted as paid';
  END IF;

  v_post := public.post_finance_journal_entry(v_journal_id);
  IF v_post->>'status' <> 'posted' THEN
    RAISE EXCEPTION 'First requisition payment journal did not post';
  END IF;
  v_summary := public.get_department_requisition_payment_summary(v_branch_id);
  SELECT item.value INTO v_summary
  FROM jsonb_array_elements(v_summary) item(value)
  WHERE item.value->>'requisition_id' = v_requisition_id::text;
  IF v_summary IS NULL OR v_summary->>'payment_status' <> 'partially_paid'
     OR (v_summary->>'paid_amount')::numeric <> 80
     OR (v_summary->>'remaining_amount')::numeric <> 70 THEN
    RAISE EXCEPTION 'Posted partial payment was not reflected in requisition paid totals';
  END IF;

  -- A rejected payment releases its reservation and can be retried with a new key.
  v_second_payment := public.create_department_requisition_payment(
    v_requisition_id, '2026-11-19', NULL, 'Test Department Supplier',
    70, 'bank_transfer',
    '96000000-0000-4000-8000-000000000007',
    '96000000-0000-4000-8000-000000000006',
    NULL, 'REQ-PAY-002', 'Rejected payment attempt', 'req-payment-attempt-002'
  );
  v_second_request := (v_second_payment->>'approval_request_id')::uuid;
  SELECT id INTO v_second_step
  FROM public.approval_request_steps
  WHERE approval_request_id = v_second_request AND step_number = 1;
  PERFORM set_config('request.jwt.claim.sub', v_finance_approver_auth::text, true);
  PERFORM public.decide_financial_document_approval(v_second_step, 'rejected', 'Rejected for test retry');

  PERFORM set_config('request.jwt.claim.sub', v_finance_auth::text, true);
  v_third_payment := public.create_department_requisition_payment(
    v_requisition_id, '2026-11-19', NULL, 'Test Department Supplier',
    70, 'bank_transfer',
    '96000000-0000-4000-8000-000000000007',
    '96000000-0000-4000-8000-000000000006',
    NULL, 'REQ-PAY-003', 'Replacement payment attempt', 'req-payment-attempt-003'
  );
  v_third_request := (v_third_payment->>'approval_request_id')::uuid;
  v_document_id := (v_third_payment->>'document_id')::uuid;
  v_journal_id := (v_third_payment->>'journal_entry_id')::uuid;
  SELECT id INTO v_third_step
  FROM public.approval_request_steps
  WHERE approval_request_id = v_third_request AND step_number = 1;
  PERFORM set_config('request.jwt.claim.sub', v_finance_approver_auth::text, true);
  PERFORM public.decide_financial_document_approval(v_third_step, 'approved', 'Replacement payment approved');
  PERFORM set_config('request.jwt.claim.sub', v_finance_auth::text, true);
  PERFORM public.post_finance_journal_entry(v_journal_id);

  v_summary := public.get_department_requisition_payment_summary(v_branch_id);
  SELECT item.value INTO v_summary
  FROM jsonb_array_elements(v_summary) item(value)
  WHERE item.value->>'requisition_id' = v_requisition_id::text;
  IF v_summary IS NULL OR v_summary->>'payment_status' <> 'paid'
     OR (v_summary->>'paid_amount')::numeric <> 150
     OR (v_summary->>'remaining_amount')::numeric <> 0 THEN
    RAISE EXCEPTION 'Fully posted requisition payments did not settle the approved amount';
  END IF;

  BEGIN
    PERFORM public.create_department_requisition_payment(
      v_requisition_id, '2026-11-19', NULL, 'Test Department Supplier',
      1, 'bank_transfer',
      '96000000-0000-4000-8000-000000000007',
      '96000000-0000-4000-8000-000000000006',
      NULL, 'REQ-PAY-EXCESS', 'Excess payment attempt', 'req-payment-excess'
    );
    RAISE EXCEPTION 'REQ_PAY_EXPECTED_SETTLED_DENIAL';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'REQ_PAY_EXPECTED_SETTLED_DENIAL' THEN RAISE; END IF;
    IF position('fully paid or reserved' in lower(SQLERRM)) = 0 THEN RAISE; END IF;
  END;

  IF (SELECT status FROM public.department_requisitions WHERE id = v_requisition_id) <> 'approved' THEN
    RAISE EXCEPTION 'Payment lifecycle incorrectly rewrote the independent requisition approval status';
  END IF;
END;
$department_requisition_payment$;
