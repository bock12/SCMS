-- FIN-INT-002 least-privilege Event Manager submission and read API tests.
-- Runs after the canonical event-budget/payment lifecycle fixture.

DO $event_budget_submission_permissions$
DECLARE
  v_branch_id uuid := '10000000-0000-4000-8000-000000000001';
  v_event_manager_auth uuid := '99000000-0000-4000-8000-000000000001';
  v_event_manager_profile uuid := '99000000-0000-4000-8000-000000000002';
  v_other_manager_auth uuid := '99000000-0000-4000-8000-000000000003';
  v_other_manager_profile uuid := '99000000-0000-4000-8000-000000000004';
  v_finance_only_auth uuid := '99000000-0000-4000-8000-000000000005';
  v_finance_only_profile uuid := '99000000-0000-4000-8000-000000000006';
  v_event_manager_role_id uuid := '99000000-0000-4000-8000-000000000008';
  v_event_id uuid := '99000000-0000-4000-8000-000000000007';
  v_period_id uuid := '96000000-0000-4000-8000-000000000009';
  v_expense_account_id uuid;
  v_options jsonb;
  v_listing jsonb;
  v_submission jsonb;
  v_other_submission jsonb;
  v_error text;
BEGIN
  INSERT INTO auth.users (id, email) VALUES
    (v_event_manager_auth, 'fin-int-002-event-manager@example.invalid'),
    (v_other_manager_auth, 'fin-int-002-other-manager@example.invalid'),
    (v_finance_only_auth, 'fin-int-002-finance-only@example.invalid');

  INSERT INTO public.profiles (id, auth_user_id, branch_id, first_name, last_name, email)
  VALUES
    (v_event_manager_profile, v_event_manager_auth, v_branch_id, 'Event', 'Manager', 'fin-int-002-event-manager@example.invalid'),
    (v_other_manager_profile, v_other_manager_auth, v_branch_id, 'Other', 'Manager', 'fin-int-002-other-manager@example.invalid'),
    (v_finance_only_profile, v_finance_only_auth, v_branch_id, 'Finance', 'Only', 'fin-int-002-finance-only@example.invalid');

  INSERT INTO public.roles (id, name, description, is_system, is_active)
  VALUES (v_event_manager_role_id, 'event_manager_test', 'Test-only least-privilege event manager role', false, true);

  INSERT INTO public.role_permissions (role_id, permission_id)
  SELECT v_event_manager_role_id, p.id
  FROM public.permissions p
  WHERE p.key IN ('manage_events', 'submit_event_budgets');

  INSERT INTO public.profile_role_assignments (
    profile_id, role_id, scope_type, branch_id, assigned_at, is_active
  )
  SELECT actor.profile_id, v_event_manager_role_id, 'branch', v_branch_id, now() - interval '1 day', true
  FROM (VALUES (v_event_manager_profile), (v_other_manager_profile)) actor(profile_id);

  INSERT INTO public.profile_role_assignments (
    profile_id, role_id, scope_type, branch_id, assigned_at, is_active
  )
  SELECT v_finance_only_profile, r.id, 'branch', v_branch_id, now() - interval '1 day', true
  FROM public.roles r
  WHERE r.name = 'finance_officer' AND r.is_active;

  INSERT INTO public.events (
    id, branch_id, title, start_time, end_time, status, created_by_profile_id
  ) VALUES (
    v_event_id, v_branch_id, 'FIN-INT-002 Event Manager Permission Test',
    '2026-11-21 10:00:00+00', '2026-11-21 12:00:00+00',
    'upcoming', v_event_manager_profile
  );

  SELECT id INTO v_expense_account_id
  FROM public.chart_of_accounts
  WHERE code = 'FIN-INT-002-EXP' AND is_active;

  IF v_expense_account_id IS NULL THEN
    RAISE EXCEPTION 'Expected event-budget expense fixture account was not found';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_event_manager_auth::text, true);

  IF NOT private.has_permission('manage_events', v_branch_id)
     OR NOT private.has_permission('submit_event_budgets', v_branch_id)
     OR private.has_permission('view_finances', v_branch_id)
     OR private.has_permission('manage_finances', v_branch_id)
     OR private.has_permission('approve_finances', v_branch_id)
     OR private.has_permission('post_journals', v_branch_id) THEN
    RAISE EXCEPTION 'Event Manager must have only event-budget submission capability, not finance access';
  END IF;

  v_options := public.get_event_budget_submission_options(v_event_id);
  IF jsonb_array_length(v_options->'currencies') = 0
     OR jsonb_array_length(v_options->'periods') = 0
     OR NOT EXISTS (
       SELECT 1 FROM jsonb_array_elements(v_options->'chartAccounts') account
       WHERE account->>'id' = v_expense_account_id::text
     ) THEN
    RAISE EXCEPTION 'Event Manager submission options are incomplete or omit valid expense configuration';
  END IF;

  v_listing := public.get_my_event_budgets(v_event_id);
  IF jsonb_array_length(v_listing->'budgets') <> 0 THEN
    RAISE EXCEPTION 'Event Manager unexpectedly saw another profile budget before submission';
  END IF;

  v_submission := public.submit_event_budget_for_approval(
    v_event_id,
    v_period_id,
    'Event Manager Own Budget',
    'SLE',
    1,
    jsonb_build_array(jsonb_build_object(
      'account_id', v_expense_account_id,
      'fund_id', null,
      'description', 'Event manager submission permission test',
      'allocated_amount', 125
    ))
  );

  IF v_submission->>'status' <> 'pending_approval'
     OR v_submission->>'budget_id' IS NULL THEN
    RAISE EXCEPTION 'Event Manager budget was not submitted through the canonical approval workflow';
  END IF;

  v_listing := public.get_my_event_budgets(v_event_id);
  IF jsonb_array_length(v_listing->'budgets') <> 1
     OR v_listing->'budgets'->0->>'id' <> v_submission->>'budget_id'
     OR (v_listing->'budgets'->0->>'total_budget')::numeric <> 125
     OR jsonb_array_length(v_listing->'budgets'->0->'approval_steps') <> 1 THEN
    RAISE EXCEPTION 'Event Manager own-submission listing did not return the expected budget and approval progress';
  END IF;

  -- A second event manager can submit for the same event, but cannot expose
  -- that other profile's submission to the first manager.
  PERFORM set_config('request.jwt.claim.sub', v_other_manager_auth::text, true);
  v_other_submission := public.submit_event_budget_for_approval(
    v_event_id,
    v_period_id,
    'Other Manager Budget',
    'SLE',
    1,
    jsonb_build_array(jsonb_build_object(
      'account_id', v_expense_account_id,
      'fund_id', null,
      'description', 'Other manager private submission',
      'allocated_amount', 75
    ))
  );

  PERFORM set_config('request.jwt.claim.sub', v_event_manager_auth::text, true);
  v_listing := public.get_my_event_budgets(v_event_id);
  IF jsonb_array_length(v_listing->'budgets') <> 1
     OR v_listing->'budgets'->0->>'id' <> v_submission->>'budget_id' THEN
    RAISE EXCEPTION 'Event Manager listing exposed another submitter''s event budget';
  END IF;

  -- Finance permission alone is not enough to use the event-manager APIs.
  PERFORM set_config('request.jwt.claim.sub', v_finance_only_auth::text, true);
  BEGIN
    PERFORM public.get_event_budget_submission_options(v_event_id);
    RAISE EXCEPTION 'FIN_INT_002_EXPECTED_EVENT_PERMISSION_DENIAL';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_error = MESSAGE_TEXT;
    IF v_error = 'FIN_INT_002_EXPECTED_EVENT_PERMISSION_DENIAL' THEN RAISE; END IF;
    IF position('Insufficient permission' in v_error) = 0 THEN RAISE; END IF;
  END;

  BEGIN
    PERFORM public.submit_event_budget_for_approval(
      v_event_id, v_period_id, 'Finance-only must not submit', 'SLE', 1,
      jsonb_build_array(jsonb_build_object(
        'account_id', v_expense_account_id, 'fund_id', null,
        'description', 'Must be denied', 'allocated_amount', 50
      ))
    );
    RAISE EXCEPTION 'FIN_INT_002_EXPECTED_FINANCE_ONLY_SUBMISSION_DENIAL';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_error = MESSAGE_TEXT;
    IF v_error = 'FIN_INT_002_EXPECTED_FINANCE_ONLY_SUBMISSION_DENIAL' THEN RAISE; END IF;
    IF position('Insufficient permission' in v_error) = 0 THEN RAISE; END IF;
  END;

  IF EXISTS (
    SELECT 1 FROM public.role_permissions rp
    JOIN public.roles r ON r.id = rp.role_id
    JOIN public.permissions p ON p.id = rp.permission_id
    WHERE r.name = 'finance_officer' AND p.key = 'submit_event_budgets'
  ) THEN
    RAISE EXCEPTION 'Finance Officer role received event-manager submission permission without manage_events';
  END IF;

  IF NOT has_function_privilege('authenticated', 'public.get_event_budget_submission_options(uuid)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.get_my_event_budgets(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.get_event_budget_submission_options(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.get_my_event_budgets(uuid)', 'EXECUTE')
     OR has_function_privilege('service_role', 'public.get_event_budget_submission_options(uuid)', 'EXECUTE')
     OR has_function_privilege('service_role', 'public.get_my_event_budgets(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Event budget submission read APIs have incorrect execute grants';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    WHERE p.oid IN (
      'public.get_event_budget_submission_options(uuid)'::regprocedure,
      'public.get_my_event_budgets(uuid)'::regprocedure
    )
    AND (
      NOT p.prosecdef
      OR NOT EXISTS (
        SELECT 1 FROM unnest(p.proconfig) setting
        WHERE split_part(setting, '=', 1) = 'search_path'
          AND trim(both '"' from split_part(setting, '=', 2)) = ''
      )
    )
  ) THEN
    RAISE EXCEPTION 'Event budget submission read APIs must be SECURITY DEFINER with an empty search_path';
  END IF;

  RAISE NOTICE 'FIN-INT-002 least-privilege event budget submission and own-submission read checks passed';
END
$event_budget_submission_permissions$;
