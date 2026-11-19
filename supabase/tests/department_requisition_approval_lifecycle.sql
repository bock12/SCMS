-- FIN-INT-002 department requisition approval lifecycle regression tests.
-- Runs after finance and event-budget fixtures in the disposable PostgreSQL 17 CI DB.

DO $department_requisition_lifecycle$
DECLARE
  v_branch_id uuid := '10000000-0000-4000-8000-000000000001';
  v_submitter_auth uuid := '97000000-0000-4000-8000-000000000001';
  v_submitter_profile uuid := '97000000-0000-4000-8000-000000000002';
  v_pastor_auth uuid := '97000000-0000-4000-8000-000000000003';
  v_pastor_profile uuid := '97000000-0000-4000-8000-000000000004';
  v_finance_auth uuid := '97000000-0000-4000-8000-000000000005';
  v_finance_profile uuid := '97000000-0000-4000-8000-000000000006';
  v_member_auth uuid := '97000000-0000-4000-8000-000000000007';
  v_member_profile uuid := '97000000-0000-4000-8000-000000000008';
  v_ministry_id uuid := '97000000-0000-4000-8000-000000000009';
  v_policy_id uuid := '97000000-0000-4000-8000-000000000010';
  v_band_id uuid := '97000000-0000-4000-8000-000000000011';
  v_step1_id uuid;
  v_step2_id uuid;
  v_result jsonb;
  v_decision jsonb;
  v_requisition_id uuid;
  v_request_id uuid;
  v_rejected_requisition_id uuid;
  v_rejected_request_id uuid;
BEGIN
  INSERT INTO auth.users (id, email) VALUES
    (v_submitter_auth, 'fin-int-002-requisition-submitter@example.invalid'),
    (v_pastor_auth, 'fin-int-002-requisition-pastor@example.invalid'),
    (v_finance_auth, 'fin-int-002-requisition-finance@example.invalid'),
    (v_member_auth, 'fin-int-002-requisition-member@example.invalid');

  INSERT INTO public.profiles (id, auth_user_id, branch_id, first_name, last_name, email)
  VALUES
    (v_submitter_profile, v_submitter_auth, v_branch_id, 'Requisition', 'Submitter', 'fin-int-002-requisition-submitter@example.invalid'),
    (v_pastor_profile, v_pastor_auth, v_branch_id, 'Requisition', 'Pastor', 'fin-int-002-requisition-pastor@example.invalid'),
    (v_finance_profile, v_finance_auth, v_branch_id, 'Requisition', 'Finance', 'fin-int-002-requisition-finance@example.invalid'),
    (v_member_profile, v_member_auth, v_branch_id, 'Requisition', 'Member', 'fin-int-002-requisition-member@example.invalid');

  INSERT INTO public.profile_role_assignments (
    profile_id, role_id, scope_type, branch_id, assigned_at, is_active
  )
  SELECT actor.profile_id, r.id, 'branch', v_branch_id, now() - interval '1 day', true
  FROM (VALUES
    (v_submitter_profile, 'leader'),
    (v_pastor_profile, 'pastor'),
    (v_finance_profile, 'finance_officer'),
    (v_member_profile, 'member')
  ) actor(profile_id, role_name)
  JOIN public.roles r ON r.name = actor.role_name AND r.is_active;

  INSERT INTO public.ministries (id, branch_id, name, entity_type, status)
  VALUES (v_ministry_id, v_branch_id, 'FIN-INT-002 Test Department', 'department', 'active');

  IF NOT EXISTS (
    SELECT 1
    FROM public.profile_role_assignments pra
    JOIN public.roles r ON r.id = pra.role_id
    JOIN public.role_permissions rp ON rp.role_id = r.id
    JOIN public.permissions p ON p.id = rp.permission_id
    WHERE pra.profile_id = v_submitter_profile
      AND pra.branch_id = v_branch_id
      AND pra.is_active AND r.is_active
      AND p.key = 'submit_requisitions'
  ) OR NOT EXISTS (
    SELECT 1
    FROM public.profile_role_assignments pra
    JOIN public.roles r ON r.id = pra.role_id
    JOIN public.role_permissions rp ON rp.role_id = r.id
    JOIN public.permissions p ON p.id = rp.permission_id
    WHERE pra.profile_id = v_pastor_profile
      AND pra.branch_id = v_branch_id
      AND pra.is_active AND r.is_active
      AND p.key = 'approve_requisitions'
  ) THEN
    RAISE EXCEPTION 'Requisition submitter or approver role mapping is missing';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_submitter_auth::text, true);

  -- Missing policy on a branch must fail closed without leaving a draft.
  BEGIN
    PERFORM public.submit_department_requisition(
      v_branch_id, v_ministry_id, 'No-policy request', 'Must roll back',
      100, 'SLE', 1, 'medium', NULL, NULL,
      '[{"item_name":"Test item","quantity":1,"unit_price":100}]'::jsonb
    );
    RAISE EXCEPTION 'FIN_INT_002_EXPECTED_MISSING_POLICY_FAILURE';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'FIN_INT_002_EXPECTED_MISSING_POLICY_FAILURE' THEN RAISE; END IF;
    IF position('approval policy' in lower(SQLERRM)) = 0 THEN RAISE; END IF;
  END;

  INSERT INTO public.approval_policies (
    id, name, transaction_type, branch_id, version, effective_from,
    is_active, created_by_profile_id
  ) VALUES (
    v_policy_id, 'FIN-INT-002 Department Requisition Policy',
    'requisition', v_branch_id, 1, '2020-01-01', true, v_submitter_profile
  );

  INSERT INTO public.approval_policy_bands (id, policy_id, min_amount_base, max_amount_base)
  VALUES (v_band_id, v_policy_id, 0, NULL);

  INSERT INTO public.approval_policy_steps (
    band_id, step_number, required_permission_key, required_approvals,
    prohibit_submitter_approval
  ) VALUES
    (v_band_id, 1, 'approve_requisitions', 1, true),
    (v_band_id, 2, 'approve_requisitions', 1, true);

  v_result := public.submit_department_requisition(
    v_branch_id, v_ministry_id, 'Department equipment request',
    'Two line item requisition for lifecycle testing',
    150, 'SLE', 1, 'high', '2026-12-15', 'QUOTE-FIN-INT-002',
    '[{"item_name":"Microphone stand","quantity":2,"unit_price":50},{"item_name":"Audio cable","quantity":1,"unit_price":50}]'::jsonb
  );

  v_requisition_id := (v_result->>'requisition_id')::uuid;
  v_request_id := (v_result->>'approval_request_id')::uuid;
  IF v_requisition_id IS NULL OR v_request_id IS NULL
     OR v_result->>'status' <> 'pending_approval'
     OR v_result->>'requisition_number' NOT LIKE 'REQ-%' THEN
    RAISE EXCEPTION 'Requisition submission did not return a pending durable requisition';
  END IF;

  IF (SELECT count(*) FROM public.department_requisition_items WHERE requisition_id = v_requisition_id) <> 2
     OR (SELECT sum(line_total) FROM public.department_requisition_items WHERE requisition_id = v_requisition_id) <> 150
     OR (SELECT requested_amount FROM public.department_requisitions WHERE id = v_requisition_id) <> 150 THEN
    RAISE EXCEPTION 'Requisition item lines do not reconcile to the requested amount';
  END IF;

  IF (SELECT count(*) FROM public.approval_request_steps WHERE approval_request_id = v_request_id) <> 2
     OR (SELECT policy_snapshot->>'policy_name' FROM public.approval_requests WHERE id = v_request_id)
       <> 'FIN-INT-002 Department Requisition Policy' THEN
    RAISE EXCEPTION 'Requisition approval steps or immutable policy snapshot were not persisted';
  END IF;

  SELECT id INTO v_step1_id FROM public.approval_request_steps
  WHERE approval_request_id = v_request_id AND step_number = 1;
  SELECT id INTO v_step2_id FROM public.approval_request_steps
  WHERE approval_request_id = v_request_id AND step_number = 2;

  -- The submitter must not approve their own requisition.
  BEGIN
    PERFORM public.decide_department_requisition_approval(v_step1_id, 'approved', 'Self approval attempt');
    RAISE EXCEPTION 'FIN_INT_002_EXPECTED_SUBMITTER_SEPARATION';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'FIN_INT_002_EXPECTED_SUBMITTER_SEPARATION' THEN RAISE; END IF;
    IF position('submitter cannot approve' in lower(SQLERRM)) = 0 THEN RAISE; END IF;
  END;

  PERFORM set_config('request.jwt.claim.sub', v_pastor_auth::text, true);
  v_decision := public.decide_department_requisition_approval(v_step1_id, 'approved', 'Pastoral review complete');
  IF v_decision->>'approval_status' <> 'pending'
     OR (SELECT status FROM public.department_requisitions WHERE id = v_requisition_id) <> 'pending_approval' THEN
    RAISE EXCEPTION 'Requisition advanced before all approval steps were complete';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_finance_auth::text, true);
  v_decision := public.decide_department_requisition_approval(v_step2_id, 'approved', 'Finance review complete');
  IF v_decision->>'approval_status' <> 'approved'
     OR (SELECT status FROM public.department_requisitions WHERE id = v_requisition_id) <> 'approved'
     OR (SELECT approved_by_profile_id FROM public.department_requisitions WHERE id = v_requisition_id) <> v_finance_profile THEN
    RAISE EXCEPTION 'Final approval did not update the requisition source status';
  END IF;

  -- A separate request is rejected at step one; no approved state is retained.
  PERFORM set_config('request.jwt.claim.sub', v_submitter_auth::text, true);
  v_result := public.submit_department_requisition(
    v_branch_id, v_ministry_id, 'Rejected equipment request', 'Rejection lifecycle test',
    50, 'SLE', 1, 'low', NULL, NULL,
    '[{"item_name":"Cable","quantity":1,"unit_price":50}]'::jsonb
  );
  v_rejected_requisition_id := (v_result->>'requisition_id')::uuid;
  v_rejected_request_id := (v_result->>'approval_request_id')::uuid;
  SELECT id INTO v_step1_id FROM public.approval_request_steps
  WHERE approval_request_id = v_rejected_request_id AND step_number = 1;

  PERFORM set_config('request.jwt.claim.sub', v_pastor_auth::text, true);
  v_decision := public.decide_department_requisition_approval(v_step1_id, 'rejected', 'Insufficient justification');
  IF v_decision->>'approval_status' <> 'rejected'
     OR (SELECT status FROM public.department_requisitions WHERE id = v_rejected_requisition_id) <> 'rejected' THEN
    RAISE EXCEPTION 'Rejected approval did not reject its requisition';
  END IF;

  -- A member role without the submit permission cannot create a requisition.
  PERFORM set_config('request.jwt.claim.sub', v_member_auth::text, true);
  BEGIN
    PERFORM public.submit_department_requisition(
      v_branch_id, v_ministry_id, 'Unauthorized request', 'Must be denied',
      25, 'SLE', 1, 'low', NULL, NULL,
      '[{"item_name":"Cable","quantity":1,"unit_price":25}]'::jsonb
    );
    RAISE EXCEPTION 'FIN_INT_002_EXPECTED_PERMISSION_DENIAL';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'FIN_INT_002_EXPECTED_PERMISSION_DENIAL' THEN RAISE; END IF;
    IF position('insufficient permission' in lower(SQLERRM)) = 0 THEN RAISE; END IF;
  END;

  IF EXISTS (
    SELECT 1 FROM public.department_requisitions
    WHERE title = 'Unauthorized request'
  ) THEN
    RAISE EXCEPTION 'Unauthorized requisition submission left a row behind';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.audit_logs
    WHERE entity_type = 'department_requisition'
      AND entity_id = v_requisition_id
      AND action = 'department_requisition.submitted'
  ) OR NOT EXISTS (
    SELECT 1 FROM public.audit_logs
    WHERE entity_type = 'department_requisition'
      AND entity_id = v_requisition_id
      AND action = 'department_requisition.approved'
  ) THEN
    RAISE EXCEPTION 'Requisition submission and approval audit events were not recorded';
  END IF;
END;
$department_requisition_lifecycle$;
