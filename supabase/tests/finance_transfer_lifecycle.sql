-- FIN-INT-004: internal financial transfer lifecycle.
-- Runs after the canonical finance baseline and secure transfer migration.

DO $finance_transfer_lifecycle$
DECLARE
  v_district uuid := '98000000-0000-4000-8000-000000000001';
  v_branch_a uuid := '98100000-0000-4000-8000-000000000001';
  v_branch_b uuid := '98100000-0000-4000-8000-000000000002';
  v_auth uuid := '98200000-0000-4000-8000-000000000001';
  v_profile uuid := '98300000-0000-4000-8000-000000000001';
  v_approver_a_auth uuid := '98200000-0000-4000-8000-000000000002';
  v_approver_b_auth uuid := '98200000-0000-4000-8000-000000000003';
  v_approver_a_profile uuid := '98300000-0000-4000-8000-000000000002';
  v_approver_b_profile uuid := '98300000-0000-4000-8000-000000000003';
  v_asset_a uuid := '98400000-0000-4000-8000-000000000001';
  v_asset_b uuid := '98400000-0000-4000-8000-000000000002';
  v_due_from_a uuid := '98400000-0000-4000-8000-000000000003';
  v_due_to_b uuid := '98400000-0000-4000-8000-000000000004';
  v_financial_a uuid := '98500000-0000-4000-8000-000000000001';
  v_financial_a_bank uuid := '98500000-0000-4000-8000-000000000002';
  v_financial_b uuid := '98500000-0000-4000-8000-000000000003';
  v_year uuid := '98600000-0000-4000-8000-000000000001';
  v_period uuid := '98600000-0000-4000-8000-000000000002';
  v_policy_a uuid := '98700000-0000-4000-8000-000000000001';
  v_policy_b uuid := '98700000-0000-4000-8000-000000000002';
  v_band_a uuid := '98700000-0000-4000-8000-000000000003';
  v_band_b uuid := '98700000-0000-4000-8000-000000000004';
  v_policy_a_approval uuid := '98700000-0000-4000-8000-000000000005';
  v_policy_b_approval uuid := '98700000-0000-4000-8000-000000000006';
  v_band_a_approval uuid := '98700000-0000-4000-8000-000000000007';
  v_band_b_approval uuid := '98700000-0000-4000-8000-000000000008';
  v_transfer_step_a uuid;
  v_transfer_step_b uuid;
  v_rejected jsonb;
  v_rejected_id uuid;
  v_rejected_source_journal uuid;
  v_rejected_destination_journal uuid;
  v_same jsonb;
  v_same_retry jsonb;
  v_cross jsonb;
  v_transfer_id uuid;
  v_source_journal uuid;
  v_destination_journal uuid;
  v_line_count integer;
  v_debits numeric(20,4);
  v_credits numeric(20,4);
BEGIN
  INSERT INTO public.districts(id,name,country)
  VALUES(v_district,'FIN-INT-004 Transfer District','Sierra Leone');

  INSERT INTO public.church_branches(id,district_id,name,code,country)
  VALUES
    (v_branch_a,v_district,'FIN-INT-004 Branch A','FININT4-A','Sierra Leone'),
    (v_branch_b,v_district,'FIN-INT-004 Branch B','FININT4-B','Sierra Leone');

  INSERT INTO auth.users(id,email)
  VALUES(v_auth,'fin-int-004@example.invalid');
  INSERT INTO public.profiles(id,auth_user_id,first_name,last_name,email)
  VALUES(v_profile,v_auth,'Transfer','Tester','fin-int-004@example.invalid');
  UPDATE public.profiles SET portal_access_status='active' WHERE id=v_profile;

  INSERT INTO public.profile_role_assignments(
    profile_id,role_id,scope_type,branch_id,assigned_at,is_active
  )
  SELECT v_profile,r.id,'branch',b.branch_id,now()-interval '1 day',true
  FROM public.roles r
  CROSS JOIN (VALUES(v_branch_a),(v_branch_b)) AS b(branch_id)
  WHERE r.name='finance_officer' AND r.is_active;

  PERFORM set_config('request.jwt.claim.sub',v_auth::text,true);

  IF NOT private.has_permission('manage_finances',v_branch_a)
     OR NOT private.has_permission('manage_finances',v_branch_b)
     OR NOT private.has_permission('post_journals',v_branch_a)
     OR NOT private.has_permission('post_journals',v_branch_b) THEN
    RAISE EXCEPTION 'FIN-INT-004 finance_officer fixture lacks required branch permissions';
  END IF;

  INSERT INTO public.church_settings(id,church_name,base_currency_code)
  VALUES(1,'FIN-INT-004 Test Church','SLE')
  ON CONFLICT(id) DO UPDATE SET base_currency_code='SLE';

  INSERT INTO public.chart_of_accounts(id,code,name,account_type,normal_balance)
  VALUES
    (v_asset_a,'FININT4-ASSET-A','Branch A Cash Asset','asset','debit'),
    (v_asset_b,'FININT4-ASSET-B','Branch B Bank Asset','asset','debit'),
    (v_due_from_a,'FININT4-DUE-FROM-A','Branch A Due From Branch B','asset','debit'),
    (v_due_to_b,'FININT4-DUE-TO-B','Branch B Due To Branch A','liability','credit');

  INSERT INTO public.financial_accounts(
    id,chart_account_id,branch_id,name,account_type,currency_code
  ) VALUES
    (v_financial_a,v_asset_a,v_branch_a,'Branch A Cash','cash','SLE'),
    (v_financial_a_bank,v_asset_b,v_branch_a,'Branch A Bank','bank','SLE'),
    (v_financial_b,v_asset_b,v_branch_b,'Branch B Bank','bank','SLE');

  INSERT INTO public.finance_branch_clearing_accounts(
    branch_id,due_from_chart_account_id,due_to_chart_account_id,
    configured_by_profile_id
  ) VALUES
    (v_branch_a,v_due_from_a,v_due_to_b,v_profile),
    (v_branch_b,v_due_from_a,v_due_to_b,v_profile);

  INSERT INTO public.financial_years(id,year_number,start_date,end_date,status)
  VALUES(v_year,2098,'2098-01-01','2098-12-31','open');
  INSERT INTO public.financial_periods(
    id,financial_year_id,name,start_date,end_date,status
  ) VALUES(v_period,v_year,'November 2098','2098-11-01','2098-11-30','open');

  INSERT INTO public.approval_policies(
    id,name,transaction_type,branch_id,district_id,version,effective_from,
    is_active,created_by_profile_id
  ) VALUES
    (v_policy_a,'FIN-INT-004 Branch A Transfer Policy','financial_transfer',v_branch_a,v_district,1,'2020-01-01',true,v_profile),
    (v_policy_b,'FIN-INT-004 Branch B Transfer Policy','financial_transfer',v_branch_b,v_district,1,'2020-01-01',true,v_profile);
  INSERT INTO public.approval_policy_bands(id,policy_id,min_amount_base,max_amount_base)
  VALUES
    (v_band_a,v_policy_a,0,NULL),
    (v_band_b,v_policy_b,0,NULL);

  -- Same-branch Cash -> Bank is one balanced journal and does not require
  -- inter-branch clearing accounts to be consulted by the RPC.
  v_same:=public.create_financial_transfer(
    '2098-11-25',v_branch_a,v_financial_a,v_branch_a,v_financial_a_bank,
    125,'SLE',1,'Same-branch cash to bank transfer','FININT4-SAME',
    '98000000-0000-4000-8000-000000000101'
  );
  v_transfer_id:=(v_same->>'transfer_id')::uuid;
  v_source_journal:=(v_same->>'source_journal_entry_id')::uuid;

  IF v_same->>'status'<>'approved'
     OR v_same->>'destination_journal_entry_id' IS NOT NULL
     OR v_transfer_id IS NULL OR v_source_journal IS NULL THEN
    RAISE EXCEPTION 'Same-branch transfer did not create the expected approved single-journal transfer';
  END IF;

  SELECT count(*),coalesce(sum(debit_amount),0),coalesce(sum(credit_amount),0)
  INTO v_line_count,v_debits,v_credits
  FROM public.journal_lines WHERE journal_entry_id=v_source_journal;
  IF v_line_count<>2 OR v_debits<>125 OR v_credits<>125 THEN
    RAISE EXCEPTION 'Same-branch transfer journal is missing lines or is unbalanced';
  END IF;
  IF NOT EXISTS(
    SELECT 1 FROM public.journal_lines
    WHERE journal_entry_id=v_source_journal AND account_id=v_asset_b
      AND debit_amount=125 AND credit_amount=0
  ) OR NOT EXISTS(
    SELECT 1 FROM public.journal_lines
    WHERE journal_entry_id=v_source_journal AND account_id=v_asset_a
      AND debit_amount=0 AND credit_amount=125
  ) THEN
    RAISE EXCEPTION 'Same-branch transfer debit/credit orientation is incorrect';
  END IF;

  v_same_retry:=public.create_financial_transfer(
    '2098-11-25',v_branch_a,v_financial_a,v_branch_a,v_financial_a_bank,
    125,'SLE',1,'Same-branch cash to bank transfer','FININT4-SAME',
    '98000000-0000-4000-8000-000000000101'
  );
  IF v_same_retry->>'transfer_id' IS DISTINCT FROM v_same->>'transfer_id'
     OR v_same_retry->>'idempotent_replay'<>'true' THEN
    RAISE EXCEPTION 'Same-branch transfer idempotent retry created a duplicate';
  END IF;

  PERFORM public.post_financial_transfer(v_transfer_id);
  IF NOT EXISTS(
    SELECT 1 FROM public.financial_transfers
    WHERE id=v_transfer_id AND status='posted'
  ) OR NOT EXISTS(
    SELECT 1 FROM public.journal_entries
    WHERE id=v_source_journal AND status='posted'
  ) THEN
    RAISE EXCEPTION 'Same-branch transfer did not post its journal and transfer state';
  END IF;

  -- Install a second, versioned policy with one distinct approver per branch.
  -- The transfer cannot be posted after only one branch has approved it.
  INSERT INTO auth.users(id,email)
  VALUES
    (v_approver_a_auth,'fin-int-004-approver-a@example.invalid'),
    (v_approver_b_auth,'fin-int-004-approver-b@example.invalid');
  INSERT INTO public.profiles(id,auth_user_id,first_name,last_name,email)
  VALUES
    (v_approver_a_profile,v_approver_a_auth,'Branch A','Approver','fin-int-004-approver-a@example.invalid'),
    (v_approver_b_profile,v_approver_b_auth,'Branch B','Approver','fin-int-004-approver-b@example.invalid');
  UPDATE public.profiles SET portal_access_status='active'
  WHERE id IN(v_approver_a_profile,v_approver_b_profile);

  INSERT INTO public.profile_role_assignments(
    profile_id,role_id,scope_type,branch_id,assigned_at,is_active
  )
  SELECT v_approver_a_profile,r.id,'branch',v_branch_a,now()-interval '1 day',true
  FROM public.roles r WHERE r.name='finance_officer' AND r.is_active;
  INSERT INTO public.profile_role_assignments(
    profile_id,role_id,scope_type,branch_id,assigned_at,is_active
  )
  SELECT v_approver_b_profile,r.id,'branch',v_branch_b,now()-interval '1 day',true
  FROM public.roles r WHERE r.name='finance_officer' AND r.is_active;

  INSERT INTO public.approval_policies(
    id,name,transaction_type,branch_id,district_id,version,effective_from,
    is_active,created_by_profile_id
  ) VALUES
    (v_policy_a_approval,'FIN-INT-004 Branch A Transfer Approval','financial_transfer',v_branch_a,v_district,2,current_date,true,v_profile),
    (v_policy_b_approval,'FIN-INT-004 Branch B Transfer Approval','financial_transfer',v_branch_b,v_district,2,current_date,true,v_profile);
  INSERT INTO public.approval_policy_bands(id,policy_id,min_amount_base,max_amount_base)
  VALUES
    (v_band_a_approval,v_policy_a_approval,0,NULL),
    (v_band_b_approval,v_policy_b_approval,0,NULL);
  INSERT INTO public.approval_policy_steps(
    band_id,step_number,required_permission_key,required_approvals,prohibit_submitter_approval
  ) VALUES
    (v_band_a_approval,1,'approve_finances',1,true),
    (v_band_b_approval,1,'approve_finances',1,true);

  -- Cross-branch movement uses reciprocal branch-local clearing journals.
  v_cross:=public.create_financial_transfer(
    '2098-11-25',v_branch_a,v_financial_a,v_branch_b,v_financial_b,
    250,'SLE',1,'Branch A to Branch B transfer','FININT4-CROSS',
    '98000000-0000-4000-8000-000000000102'
  );
  v_transfer_id:=(v_cross->>'transfer_id')::uuid;
  v_source_journal:=(v_cross->>'source_journal_entry_id')::uuid;
  v_destination_journal:=(v_cross->>'destination_journal_entry_id')::uuid;

  IF v_cross->>'status'<>'pending_approval'
     OR v_source_journal IS NULL OR v_destination_journal IS NULL
     OR v_source_journal=v_destination_journal THEN
    RAISE EXCEPTION 'Cross-branch transfer did not create two approved branch-local journals';
  END IF;

  IF NOT EXISTS(
    SELECT 1 FROM public.journal_entries
    WHERE id=v_source_journal AND branch_id=v_branch_a AND status='draft'
      AND source_type='financial_transfer' AND source_id=v_transfer_id
  ) OR NOT EXISTS(
    SELECT 1 FROM public.journal_entries
    WHERE id=v_destination_journal AND branch_id=v_branch_b AND status='draft'
      AND source_type='financial_transfer' AND source_id=v_transfer_id
  ) THEN
    RAISE EXCEPTION 'Cross-branch journals are not correctly scoped to their branches';
  END IF;

  IF NOT EXISTS(
    SELECT 1 FROM public.journal_lines
    WHERE journal_entry_id=v_source_journal AND account_id=v_due_from_a
      AND debit_amount=250 AND credit_amount=0
  ) OR NOT EXISTS(
    SELECT 1 FROM public.journal_lines
    WHERE journal_entry_id=v_source_journal AND account_id=v_asset_a
      AND debit_amount=0 AND credit_amount=250
  ) OR NOT EXISTS(
    SELECT 1 FROM public.journal_lines
    WHERE journal_entry_id=v_destination_journal AND account_id=v_asset_b
      AND debit_amount=250 AND credit_amount=0
  ) OR NOT EXISTS(
    SELECT 1 FROM public.journal_lines
    WHERE journal_entry_id=v_destination_journal AND account_id=v_due_to_b
      AND debit_amount=0 AND credit_amount=250
  ) THEN
    RAISE EXCEPTION 'Cross-branch reciprocal due-from/due-to journal orientation is incorrect';
  END IF;

  IF (SELECT count(*) FROM public.approval_requests
      WHERE transaction_type='financial_transfer' AND target_id=v_transfer_id
        AND status='pending')<>2 THEN
    RAISE EXCEPTION 'Cross-branch transfer must create two separate pending approval requests';
  END IF;
  SELECT s.id INTO v_transfer_step_a
  FROM public.approval_request_steps s
  WHERE s.approval_request_id=(SELECT source_approval_request_id FROM public.financial_transfers WHERE id=v_transfer_id);
  SELECT s.id INTO v_transfer_step_b
  FROM public.approval_request_steps s
  WHERE s.approval_request_id=(SELECT destination_approval_request_id FROM public.financial_transfers WHERE id=v_transfer_id);

  PERFORM set_config('request.jwt.claim.sub',v_approver_a_auth::text,true);
  PERFORM public.decide_financial_transfer_approval(v_transfer_step_a,'approved','Sending branch reviewed');
  IF (SELECT status FROM public.financial_transfers WHERE id=v_transfer_id)<>'pending_approval' THEN
    RAISE EXCEPTION 'One branch approval must not approve the complete cross-branch transfer';
  END IF;

  PERFORM set_config('request.jwt.claim.sub',v_auth::text,true);
  BEGIN
    PERFORM public.post_financial_transfer(v_transfer_id);
    RAISE EXCEPTION 'FIN_INT_004_EXPECTED_PARTIAL_APPROVAL_POST_DENIAL';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM='FIN_INT_004_EXPECTED_PARTIAL_APPROVAL_POST_DENIAL' THEN RAISE; END IF;
    IF position('approval workflows' in lower(SQLERRM))=0 THEN RAISE; END IF;
  END;

  PERFORM set_config('request.jwt.claim.sub',v_approver_b_auth::text,true);
  PERFORM public.decide_financial_transfer_approval(v_transfer_step_b,'approved','Receiving branch reviewed');
  IF (SELECT status FROM public.financial_transfers WHERE id=v_transfer_id)<>'approved' THEN
    RAISE EXCEPTION 'Transfer must become approved only after both branch approval requests are complete';
  END IF;

  PERFORM set_config('request.jwt.claim.sub',v_auth::text,true);

  -- A caller cannot post just one transfer journal through the generic API.
  BEGIN
    PERFORM public.post_finance_journal_entry(v_source_journal);
    RAISE EXCEPTION 'FIN_INT_004_EXPECTED_UNILATERAL_POST_DENIAL';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM='FIN_INT_004_EXPECTED_UNILATERAL_POST_DENIAL' THEN RAISE; END IF;
    IF position('must be posted together' in lower(SQLERRM))=0 THEN RAISE; END IF;
  END;

  IF EXISTS(
    SELECT 1 FROM public.journal_entries
    WHERE id IN(v_source_journal,v_destination_journal) AND status<>'draft'
  ) THEN
    RAISE EXCEPTION 'Rejected unilateral post attempt changed one side of the transfer';
  END IF;

  PERFORM public.post_financial_transfer(v_transfer_id);
  IF (SELECT count(*) FROM public.journal_entries
      WHERE id IN(v_source_journal,v_destination_journal) AND status='posted')<>2 THEN
    RAISE EXCEPTION 'Atomic cross-branch posting did not post both journals';
  END IF;
  IF NOT EXISTS(
    SELECT 1 FROM public.financial_transfers
    WHERE id=v_transfer_id AND status='posted'
      AND source_journal_entry_id=v_source_journal
      AND destination_journal_entry_id=v_destination_journal
  ) THEN
    RAISE EXCEPTION 'Cross-branch transfer did not finalize with both journal links';
  END IF;

  -- A rejection by either branch rejects the whole transfer and leaves both
  -- journals as drafts; it must never create a one-sided ledger movement.
  v_rejected:=public.create_financial_transfer(
    '2098-11-25',v_branch_a,v_financial_a,v_branch_b,v_financial_b,
    90,'SLE',1,'Rejected branch transfer','FININT4-REJECT',
    '98000000-0000-4000-8000-000000000103'
  );
  v_rejected_id:=(v_rejected->>'transfer_id')::uuid;
  v_rejected_source_journal:=(v_rejected->>'source_journal_entry_id')::uuid;
  v_rejected_destination_journal:=(v_rejected->>'destination_journal_entry_id')::uuid;
  SELECT s.id INTO v_transfer_step_a
  FROM public.approval_request_steps s
  WHERE s.approval_request_id=(SELECT source_approval_request_id FROM public.financial_transfers WHERE id=v_rejected_id);
  PERFORM set_config('request.jwt.claim.sub',v_approver_a_auth::text,true);
  PERFORM public.decide_financial_transfer_approval(v_transfer_step_a,'rejected','Sending branch rejected transfer');
  IF (SELECT status FROM public.financial_transfers WHERE id=v_rejected_id)<>'rejected' THEN
    RAISE EXCEPTION 'A branch rejection must reject the complete transfer';
  END IF;
  IF (SELECT count(*) FROM public.journal_entries
      WHERE id IN(v_rejected_source_journal,v_rejected_destination_journal)
        AND status='draft')<>2 THEN
    RAISE EXCEPTION 'Rejected transfer must leave both branch journals unposted';
  END IF;
  PERFORM set_config('request.jwt.claim.sub',v_auth::text,true);
  BEGIN
    PERFORM public.post_financial_transfer(v_rejected_id);
    RAISE EXCEPTION 'FIN_INT_004_EXPECTED_REJECTED_POST_DENIAL';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM='FIN_INT_004_EXPECTED_REJECTED_POST_DENIAL' THEN RAISE; END IF;
    IF position('approval workflows' in lower(SQLERRM))=0 THEN RAISE; END IF;
  END;

  IF (SELECT count(*) FROM public.journal_lines
      WHERE journal_entry_id IN(v_source_journal,v_destination_journal)
        AND ((debit_amount=250 AND credit_amount=0) OR (credit_amount=250 AND debit_amount=0)))<>4 THEN
    RAISE EXCEPTION 'Cross-branch clearing journals do not preserve equal reciprocal balances';
  END IF;

  IF NOT has_function_privilege('authenticated','public.create_financial_transfer(date,uuid,uuid,uuid,uuid,numeric,character,numeric,text,text,uuid)','EXECUTE')
     OR NOT has_function_privilege('authenticated','public.decide_financial_transfer_approval(uuid,text,text)','EXECUTE')
     OR NOT has_function_privilege('authenticated','public.post_financial_transfer(uuid)','EXECUTE')
     OR NOT has_function_privilege('authenticated','public.get_financial_transfers(uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'Authenticated role is missing one or more transfer RPC grants';
  END IF;
  IF has_function_privilege('anon','public.create_financial_transfer(date,uuid,uuid,uuid,uuid,numeric,character,numeric,text,text,uuid)','EXECUTE')
     OR has_function_privilege('service_role','public.create_financial_transfer(date,uuid,uuid,uuid,uuid,numeric,character,numeric,text,text,uuid)','EXECUTE')
     OR has_table_privilege('authenticated','public.financial_transfers','INSERT')
     OR has_table_privilege('authenticated','public.financial_transfers','UPDATE')
     OR has_table_privilege('authenticated','public.financial_transfers','DELETE') THEN
    RAISE EXCEPTION 'Transfer API exposed an unsafe grant to an untrusted role';
  END IF;
END
$finance_transfer_lifecycle$;
