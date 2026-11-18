-- FIN-INT-001 read API behavior and authorization regression tests.
-- Runs after the transaction lifecycle fixture in the disposable PostgreSQL 17 DB.

DO $finance_document_listing$
DECLARE
  v_branch_id uuid := '10000000-0000-4000-8000-000000000001';
  v_other_branch_id uuid := '10000000-0000-4000-8000-000000000002';
  v_creator_auth_id uuid := '96000000-0000-4000-8000-000000000002';
  v_creator_profile_id uuid := '96000000-0000-4000-8000-000000000003';
  v_approver_auth_id uuid := '96000000-0000-4000-8000-000000000012';
  v_approver_profile_id uuid := '96000000-0000-4000-8000-000000000013';
  v_financial_account_id uuid := '96000000-0000-4000-8000-000000000007';
  v_income_chart_id uuid := '96000000-0000-4000-8000-000000000005';
  v_policy_id uuid := '96000000-0000-4000-8000-000000000022';
  v_band_id uuid := '96000000-0000-4000-8000-000000000023';
  v_no_access_auth_id uuid := '97000000-0000-4000-8000-000000000001';
  v_no_access_profile_id uuid := '97000000-0000-4000-8000-000000000002';
  v_created jsonb;
  v_listing jsonb;
  v_document jsonb;
  v_approval jsonb;
  v_document_id uuid;
  v_journal_id uuid;
  v_request_id uuid;
  v_step_id uuid;
BEGIN
  INSERT INTO public.approval_policies (
    id, name, transaction_type, branch_id, version, effective_from,
    is_active, created_by_profile_id
  ) VALUES (
    v_policy_id, 'FIN-INT Listing API Policy', 'financial_document',
    v_branch_id, 5, '2020-01-01', true, v_creator_profile_id
  );

  INSERT INTO public.approval_policy_bands (
    id, policy_id, min_amount_base, max_amount_base
  ) VALUES (v_band_id, v_policy_id, 0, NULL);

  INSERT INTO public.approval_policy_steps (
    band_id, step_number, required_permission_key, required_approvals,
    prohibit_submitter_approval
  ) VALUES (v_band_id, 1, 'approve_finances', 1, true);

  PERFORM set_config('request.jwt.claim.sub', v_creator_auth_id::text, true);
  v_created := public.create_financial_document_transaction(
    'receipt', '2026-11-17', v_branch_id, NULL, 'Listing API Donor', 42,
    'SLE', 'cash', v_financial_account_id, v_income_chart_id,
    NULL, 'FIN-INT-LISTING', 'Finance document listing API test', 1
  );

  v_document_id := (v_created->>'document_id')::uuid;
  v_journal_id := (v_created->>'journal_entry_id')::uuid;
  v_request_id := (v_created->>'approval_request_id')::uuid;

  IF v_created->>'status' <> 'pending_approval'
     OR v_document_id IS NULL
     OR v_journal_id IS NULL
     OR v_request_id IS NULL THEN
    RAISE EXCEPTION 'Listing fixture did not create a pending financial document and journal';
  END IF;

  SELECT id INTO v_step_id
  FROM public.approval_request_steps
  WHERE approval_request_id = v_request_id
    AND step_number = 1;

  IF v_step_id IS NULL THEN
    RAISE EXCEPTION 'Listing fixture did not create its approval step';
  END IF;

  -- The submitter can see the document through manage_finances, but cannot
  -- receive an actionable step when the policy prohibits self-approval.
  v_listing := public.get_finance_documents(v_branch_id);
  IF v_listing->>'actor_profile_id' IS DISTINCT FROM v_creator_profile_id::text THEN
    RAISE EXCEPTION 'Listing API returned the wrong actor profile';
  END IF;

  SELECT item.value INTO v_document
  FROM jsonb_array_elements(v_listing->'documents') AS item(value)
  WHERE item.value->>'id' = v_document_id::text;

  IF v_document IS NULL
     OR v_document->>'status' <> 'pending_approval'
     OR v_document->>'approval_status' <> 'pending'
     OR v_document->>'actor_approval_step_id' IS NOT NULL
     OR v_document->>'journal_entry_id' IS NOT NULL
     OR v_document->>'approval_steps_total' <> '1'
     OR v_document->>'approval_steps_completed' <> '0' THEN
    RAISE EXCEPTION 'Submitter listing did not preserve pending state or submitter separation';
  END IF;

  -- A different user with the required branch permission receives the
  -- current actionable step, without changing the approval workflow.
  PERFORM set_config('request.jwt.claim.sub', v_approver_auth_id::text, true);
  v_listing := public.get_finance_documents(v_branch_id);

  SELECT item.value INTO v_document
  FROM jsonb_array_elements(v_listing->'documents') AS item(value)
  WHERE item.value->>'id' = v_document_id::text;

  IF v_listing->>'actor_profile_id' IS DISTINCT FROM v_approver_profile_id::text
     OR v_document->>'actor_approval_step_id' IS DISTINCT FROM v_step_id::text
     OR v_document->>'approval_steps_total' <> '1'
     OR v_document->'approval_steps'->0->>'status' <> 'pending'
     OR v_document->'approval_steps'->0->>'approver_profile_id' IS NOT NULL THEN
    RAISE EXCEPTION 'Scoped approver did not receive the expected actionable step and progress';
  END IF;

  v_approval := public.decide_financial_document_approval(
    v_step_id, 'approved', 'Approved through listing API fixture'
  );
  IF v_approval->>'approval_status' <> 'approved' THEN
    RAISE EXCEPTION 'Listing fixture approval did not complete';
  END IF;

  v_listing := public.get_finance_documents(v_branch_id);
  SELECT item.value INTO v_document
  FROM jsonb_array_elements(v_listing->'documents') AS item(value)
  WHERE item.value->>'id' = v_document_id::text;

  IF v_document->>'status' <> 'approved'
     OR v_document->>'approval_status' <> 'approved'
     OR v_document->>'actor_approval_step_id' IS NOT NULL
     OR v_document->>'journal_entry_id' IS DISTINCT FROM v_journal_id::text
     OR v_document->>'approval_steps_completed' <> '1' THEN
    RAISE EXCEPTION 'Listing API did not reflect final approval and journal linkage';
  END IF;

  -- A linked profile without finance permission cannot list the branch queue.
  INSERT INTO auth.users (id, email)
  VALUES (v_no_access_auth_id, 'fin-int-listing-no-access@example.invalid');

  INSERT INTO public.profiles (
    id, auth_user_id, branch_id, first_name, last_name, email
  ) VALUES (
    v_no_access_profile_id, v_no_access_auth_id, v_branch_id,
    'No', 'Finance Access', 'fin-int-listing-no-access@example.invalid'
  );

  PERFORM set_config('request.jwt.claim.sub', v_no_access_auth_id::text, true);
  BEGIN
    PERFORM public.get_finance_documents(v_branch_id);
    RAISE EXCEPTION 'FIN_INT_EXPECTED_FINANCE_DOCUMENT_READ_DENIAL';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'FIN_INT_EXPECTED_FINANCE_DOCUMENT_READ_DENIAL' THEN RAISE; END IF;
    IF position('Insufficient permission' in SQLERRM) = 0 THEN RAISE; END IF;
  END;

  -- A branch-A approver cannot query branch B by changing the RPC argument.
  PERFORM set_config('request.jwt.claim.sub', v_approver_auth_id::text, true);
  BEGIN
    PERFORM public.get_finance_documents(v_other_branch_id);
    RAISE EXCEPTION 'FIN_INT_EXPECTED_FINANCE_DOCUMENT_SCOPE_DENIAL';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'FIN_INT_EXPECTED_FINANCE_DOCUMENT_SCOPE_DENIAL' THEN RAISE; END IF;
    IF position('Insufficient permission' in SQLERRM) = 0 THEN RAISE; END IF;
  END;

  -- The RPC is not callable without an authenticated Supabase identity.
  PERFORM set_config('request.jwt.claim.sub', '', true);
  BEGIN
    PERFORM public.get_finance_documents(v_branch_id);
    RAISE EXCEPTION 'FIN_INT_EXPECTED_FINANCE_DOCUMENT_AUTH_DENIAL';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'FIN_INT_EXPECTED_FINANCE_DOCUMENT_AUTH_DENIAL' THEN RAISE; END IF;
    IF position('Authentication required' in SQLERRM) = 0 THEN RAISE; END IF;
  END;

  RAISE NOTICE 'FIN-INT-001 finance document listing and scope checks passed';
END
$finance_document_listing$;
