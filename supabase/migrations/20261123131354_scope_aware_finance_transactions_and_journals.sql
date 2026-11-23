begin;

-- FIN-ORG-004: scope-aware receipt/payment creation, approval decisions,
-- journal attachment/posting, and scoped document/journal/ledger queries
-- across church-wide, district, and branch organizational scopes.

create or replace function private.has_permission_for_finance_scope(
  p_permission_key text,
  p_branch_id uuid,
  p_district_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_branch_id is not null then private.has_permission(p_permission_key, p_branch_id)
    when p_district_id is not null then private.has_permission_for_district(p_permission_key, p_district_id)
    else private.has_permission(p_permission_key, null)
  end;
$$;

revoke all on function private.has_permission_for_finance_scope(text, uuid, uuid)
  from public, anon, authenticated, service_role;

create or replace function private.attach_approved_pending_financial_document_journal(
  p_document_id uuid,
  p_journal_entry_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_doc public.financial_documents%rowtype;
  v_entry public.journal_entries%rowtype;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  select * into v_doc
  from public.financial_documents
  where id = p_document_id
  for update;

  if not found or v_doc.status <> 'approved' then
    raise exception 'Only approved financial documents can be linked to a journal';
  end if;
  if v_doc.journal_entry_id is not null then
    raise exception 'Financial document is already linked to a journal';
  end if;

  select * into v_entry
  from public.journal_entries
  where id = p_journal_entry_id
  for update;

  if not found or v_entry.status <> 'draft' then
    raise exception 'Pending journal must exist and remain draft';
  end if;
  if v_entry.source_type <> 'financial_document_pending'
     or v_entry.source_id is distinct from p_document_id then
    raise exception 'Journal is not the pending journal for this document';
  end if;
  if v_entry.currency_code <> v_doc.currency_code
     or v_entry.base_currency_code <> v_doc.base_currency_code
     or v_entry.exchange_rate_to_base <> v_doc.exchange_rate_to_base
     or v_entry.branch_id is distinct from v_doc.branch_id
     or v_entry.district_id is distinct from v_doc.district_id then
    raise exception 'Journal and financial document currency, rate or organizational scope do not match';
  end if;

  update public.journal_entries
  set source_type = 'financial_document',
      source_id = p_document_id
  where id = p_journal_entry_id;

  update public.financial_documents
  set journal_entry_id = p_journal_entry_id,
      updated_at = now()
  where id = p_document_id;
end;
$$;

revoke all on function private.attach_approved_pending_financial_document_journal(uuid, uuid)
  from public, anon, authenticated, service_role;

create or replace function private.submit_financial_document_for_approval(p_document_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_doc public.financial_documents%rowtype;
  v_profile_id uuid;
  v_base_currency char(3);
  v_policy public.approval_policies%rowtype;
  v_band public.approval_policy_bands%rowtype;
  v_request_id uuid;
  v_amount_base numeric(20,4);
  v_steps_count integer;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;
  v_profile_id := private.current_profile_id();
  if v_profile_id is null then
    raise exception 'No member profile is linked to this account';
  end if;

  select * into v_doc
  from public.financial_documents
  where id = p_document_id
  for update;
  if not found then raise exception 'Financial document not found'; end if;
  if v_doc.status not in ('draft','rejected') then
    raise exception 'Only draft or rejected documents can be submitted';
  end if;
  if v_doc.journal_entry_id is not null then
    raise exception 'Document is already linked to a journal entry';
  end if;
  if v_doc.created_by_profile_id is distinct from v_profile_id
     and not private.has_permission_for_finance_scope('manage_finances', v_doc.branch_id, v_doc.district_id) then
    raise exception 'Insufficient permission to submit this document';
  end if;

  select base_currency_code into v_base_currency
  from public.church_settings where id = 1;
  if v_base_currency is null then
    raise exception 'Church settings must be configured before financial operations';
  end if;
  if v_doc.base_currency_code <> v_base_currency then
    raise exception 'Document base currency does not match church base currency';
  end if;
  if v_doc.currency_code = v_base_currency and v_doc.exchange_rate_to_base <> 1 then
    raise exception 'Exchange rate must be 1 for the base currency';
  end if;

  if v_doc.financial_account_id is not null and not exists (
    select 1 from public.financial_accounts fa
    where fa.id = v_doc.financial_account_id
      and fa.is_active
      and fa.currency_code = v_doc.currency_code
      and (
        (v_doc.branch_id is not null and (
          fa.branch_id = v_doc.branch_id
          or (fa.branch_id is null and (fa.district_id is null or fa.district_id is not distinct from v_doc.district_id))
        ))
        or (v_doc.branch_id is null and v_doc.district_id is not null and (
          fa.branch_id is null and (fa.district_id = v_doc.district_id or fa.district_id is null)
        ))
        or (v_doc.branch_id is null and v_doc.district_id is null and (
          fa.branch_id is null and fa.district_id is null
        ))
      )
  ) then
    raise exception 'Financial account is inactive or incompatible with document scope or currency';
  end if;

  v_amount_base := round(v_doc.amount * v_doc.exchange_rate_to_base, 4);

  select * into v_policy
  from public.approval_policies p
  where p.transaction_type = 'financial_document'
    and p.is_active
    and p.effective_from <= current_date
    and (p.effective_to is null or p.effective_to >= current_date)
    and (
      (v_doc.branch_id is not null and (
        p.branch_id = v_doc.branch_id
        or (p.branch_id is null and (p.district_id is null or p.district_id is not distinct from v_doc.district_id))
      ))
      or (v_doc.branch_id is null and v_doc.district_id is not null and (
        p.branch_id is null and (p.district_id = v_doc.district_id or p.district_id is null)
      ))
      or (v_doc.branch_id is null and v_doc.district_id is null and (
        p.branch_id is null and p.district_id is null
      ))
    )
  order by (p.branch_id is not null) desc, (p.district_id is not null) desc, p.version desc
  limit 1;
  if not found then
    raise exception 'No active financial-document approval policy is configured for this scope';
  end if;

  select * into v_band
  from public.approval_policy_bands b
  where b.policy_id = v_policy.id
    and v_amount_base >= b.min_amount_base
    and (b.max_amount_base is null or v_amount_base < b.max_amount_base)
  limit 1;
  if not found then
    raise exception 'No approval threshold band covers this transaction amount';
  end if;

  select count(*) into v_steps_count
  from public.approval_policy_steps
  where band_id = v_band.id;

  if v_steps_count = 0 then
    update public.financial_documents
    set status = 'approved',
        approved_at = now(),
        approved_by_profile_id = null,
        approval_request_id = null
    where id = p_document_id;
    return null;
  end if;

  insert into public.approval_requests (
    transaction_type, target_id, branch_id, district_id, policy_id, policy_version,
    band_id, amount_base, submitted_by_profile_id, policy_snapshot
  )
  values (
    'financial_document', p_document_id, v_doc.branch_id, v_doc.district_id,
    v_policy.id, v_policy.version, v_band.id, v_amount_base,
    v_profile_id,
    jsonb_build_object(
      'policy_name', v_policy.name,
      'policy_version', v_policy.version,
      'min_amount_base', v_band.min_amount_base,
      'max_amount_base', v_band.max_amount_base,
      'steps', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'step_number', s.step_number,
          'required_permission_key', s.required_permission_key,
          'required_approvals', s.required_approvals,
          'prohibit_submitter_approval', s.prohibit_submitter_approval
        ) order by s.step_number), '[]'::jsonb)
        from public.approval_policy_steps s where s.band_id = v_band.id
      )
    )
  )
  returning id into v_request_id;

  insert into public.approval_request_steps (
    approval_request_id, step_number, required_permission_key,
    required_approvals, prohibit_submitter_approval
  )
  select v_request_id, step_number, required_permission_key,
    required_approvals, prohibit_submitter_approval
  from public.approval_policy_steps
  where band_id = v_band.id
  order by step_number;

  update public.financial_documents
  set status = 'pending_approval',
      approval_request_id = v_request_id,
      approved_at = null,
      approved_by_profile_id = null
  where id = p_document_id;

  return v_request_id;
end;
$$;

revoke all on function private.submit_financial_document_for_approval(uuid)
  from public, anon, authenticated, service_role;

create or replace function private.record_approval_decision(
  p_request_step_id uuid,
  p_decision text,
  p_comments text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid;
  v_step public.approval_request_steps%rowtype;
  v_request public.approval_requests%rowtype;
  v_approved_count integer;
  v_all_steps_approved boolean;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;
  if p_decision not in ('approved','rejected') then
    raise exception 'Decision must be approved or rejected';
  end if;

  v_profile_id := private.current_profile_id();
  if v_profile_id is null then
    raise exception 'No member profile is linked to this account';
  end if;

  select * into v_step
  from public.approval_request_steps
  where id = p_request_step_id
  for update;
  if not found then raise exception 'Approval step not found'; end if;

  select * into v_request
  from public.approval_requests
  where id = v_step.approval_request_id
  for update;
  if not found or v_request.status <> 'pending' then
    raise exception 'Approval request is not pending';
  end if;
  if v_step.status <> 'pending' then
    raise exception 'Approval step is not pending';
  end if;

  if exists (
    select 1 from public.approval_request_steps prior
    where prior.approval_request_id = v_request.id
      and prior.step_number < v_step.step_number
      and prior.status <> 'approved'
  ) then
    raise exception 'Earlier approval steps must be completed first';
  end if;

  if v_step.prohibit_submitter_approval
     and v_request.submitted_by_profile_id = v_profile_id then
    raise exception 'The submitter cannot approve this request';
  end if;

  if not private.has_permission_for_finance_scope(
    v_step.required_permission_key,
    v_request.branch_id,
    v_request.district_id
  ) then
    raise exception 'Approver does not have the required permission';
  end if;

  insert into public.approval_decisions (
    approval_request_step_id, approver_profile_id, decision, comments
  )
  values (p_request_step_id, v_profile_id, p_decision, p_comments);

  if p_decision = 'rejected' then
    update public.approval_request_steps
    set status = 'rejected'
    where id = p_request_step_id;

    update public.approval_requests
    set status = 'rejected', completed_at = now()
    where id = v_request.id;

    if v_request.transaction_type = 'financial_document' then
      update public.financial_documents
      set status = 'rejected', approved_at = null, approved_by_profile_id = null
      where id = v_request.target_id
        and approval_request_id = v_request.id;
    elsif v_request.transaction_type = 'budget' then
      update public.budgets
      set status = 'rejected', approved_at = null, approved_by_profile_id = null
      where id = v_request.target_id
        and approval_request_id = v_request.id;
    end if;

    return 'rejected';
  end if;

  select count(*) into v_approved_count
  from public.approval_decisions
  where approval_request_step_id = p_request_step_id
    and decision = 'approved';

  if v_approved_count >= v_step.required_approvals then
    update public.approval_request_steps
    set status = 'approved'
    where id = p_request_step_id;
  end if;

  select not exists (
    select 1 from public.approval_request_steps s
    where s.approval_request_id = v_request.id
      and s.status <> 'approved'
  ) into v_all_steps_approved;

  if v_all_steps_approved then
    update public.approval_requests
    set status = 'approved', completed_at = now()
    where id = v_request.id;

    if v_request.transaction_type = 'financial_document' then
      update public.financial_documents
      set status = 'approved',
          approved_at = now(),
          approved_by_profile_id = v_profile_id
      where id = v_request.target_id
        and approval_request_id = v_request.id;
    elsif v_request.transaction_type = 'budget' then
      update public.budgets
      set status = 'approved',
          approved_at = now(),
          approved_by_profile_id = v_profile_id
      where id = v_request.target_id
        and approval_request_id = v_request.id;
    elsif v_request.transaction_type = 'journal_entry' then
      update public.journal_entries
      set approved_at = now(),
          approved_by_profile_id = v_profile_id
      where id = v_request.target_id
        and status = 'draft'
        and approval_request_id = v_request.id;
    end if;

    return 'approved';
  end if;

  return 'pending';
end;
$$;

revoke all on function private.record_approval_decision(uuid, text, text)
  from public, anon, authenticated, service_role;

create or replace function private.post_journal_entry(p_entry_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry public.journal_entries%rowtype;
  v_period public.financial_periods%rowtype;
  v_year public.financial_years%rowtype;
  v_base_currency char(3);
  v_line_count integer;
  v_debits numeric(24,4);
  v_credits numeric(24,4);
  v_base_debits numeric(24,4);
  v_base_credits numeric(24,4);
  v_approval_status text;
  v_document_status text;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required'; end if;

  select * into v_entry from public.journal_entries
  where id = p_entry_id for update;
  if not found then raise exception 'Journal entry not found'; end if;
  if v_entry.status <> 'draft' then raise exception 'Only draft journal entries can be posted'; end if;
  if not private.has_permission_for_finance_scope('post_journals', v_entry.branch_id, v_entry.district_id) then
    raise exception 'Insufficient permission to post journals';
  end if;

  if v_entry.source_type = 'financial_document' then
    select status into v_document_status
    from public.financial_documents
    where id = v_entry.source_id
      and journal_entry_id = v_entry.id
      and branch_id is not distinct from v_entry.branch_id
      and district_id is not distinct from v_entry.district_id;
    if v_document_status is distinct from 'approved' then
      raise exception 'Linked financial document must be approved before posting';
    end if;
  else
    if v_entry.approval_checked_at is null then
      raise exception 'Journal entry must complete the approval-policy check before posting';
    end if;
    if v_entry.approval_request_id is not null then
      select status into v_approval_status
      from public.approval_requests
      where id = v_entry.approval_request_id
        and transaction_type = 'journal_entry'
        and target_id = v_entry.id;
      if v_approval_status is distinct from 'approved' then
        raise exception 'Journal approval is incomplete';
      end if;
    elsif v_entry.approved_at is null then
      raise exception 'Journal has not been approved or explicitly exempted by policy';
    end if;
  end if;

  select * into v_period from public.financial_periods where id = v_entry.period_id;
  if not found or v_period.status <> 'open' then raise exception 'Journal entry period is not open'; end if;
  if v_entry.entry_date < v_period.start_date or v_entry.entry_date > v_period.end_date then
    raise exception 'Journal entry date is outside its financial period';
  end if;

  select * into v_year from public.financial_years where id = v_period.financial_year_id;
  if not found or v_year.status <> 'open' then raise exception 'Financial year is not open'; end if;

  select base_currency_code into v_base_currency
  from public.church_settings where id = 1;
  if v_base_currency is null then
    raise exception 'Complete church settings before posting financial entries';
  end if;
  if v_entry.base_currency_code <> v_base_currency then
    raise exception 'Journal base currency does not match church base currency';
  end if;
  if v_entry.currency_code = v_entry.base_currency_code and v_entry.exchange_rate_to_base <> 1 then
    raise exception 'Exchange rate must be 1 for the base currency';
  end if;

  if exists (
    select 1 from public.journal_lines jl
    join public.chart_of_accounts coa on coa.id = jl.account_id
    where jl.journal_entry_id = p_entry_id and not coa.is_active
  ) then
    raise exception 'Journal contains an inactive chart-of-accounts entry';
  end if;

  if v_entry.branch_id is not null and exists (
    select 1 from public.journal_lines jl
    where jl.journal_entry_id = p_entry_id
      and jl.branch_id is not null and jl.branch_id <> v_entry.branch_id
  ) then
    raise exception 'Journal line branch does not match journal branch';
  end if;

  select count(*),
         coalesce(sum(debit_amount),0),
         coalesce(sum(credit_amount),0),
         coalesce(sum(base_debit_amount),0),
         coalesce(sum(base_credit_amount),0)
  into v_line_count, v_debits, v_credits, v_base_debits, v_base_credits
  from public.journal_lines where journal_entry_id = p_entry_id;

  if v_line_count < 2 then raise exception 'A journal entry must contain at least two lines'; end if;
  if v_debits <> v_credits then raise exception 'Journal is not balanced in transaction currency'; end if;
  if v_base_debits <> v_base_credits then raise exception 'Journal is not balanced in base currency'; end if;

  if exists (
    select 1 from public.journal_lines jl
    where jl.journal_entry_id = p_entry_id
      and (
        (jl.debit_amount > 0 and jl.base_debit_amount <>
          round(jl.debit_amount * v_entry.exchange_rate_to_base, 4))
        or
        (jl.credit_amount > 0 and jl.base_credit_amount <>
          round(jl.credit_amount * v_entry.exchange_rate_to_base, 4))
      )
  ) then
    raise exception 'Journal line base amount does not match the recorded exchange rate';
  end if;

  update public.journal_entries set status='posted', posted_at=now()
  where id=p_entry_id;

  if v_entry.source_type = 'financial_document' then
    update public.financial_documents
    set status='posted', updated_at=now()
    where id=v_entry.source_id
      and journal_entry_id=p_entry_id
      and status='approved';
    if not found then raise exception 'Could not finalize linked financial document'; end if;
  end if;
end;
$$;

revoke all on function private.post_journal_entry(uuid)
  from public, anon, authenticated, service_role;

create or replace function public.post_finance_journal_entry(
  p_journal_entry_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid;
  v_entry public.journal_entries%rowtype;
  v_document public.financial_documents%rowtype;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  v_profile_id := private.current_profile_id();
  if v_profile_id is null then
    raise exception 'No member profile is linked to this account';
  end if;

  select * into v_entry
  from public.journal_entries
  where id = p_journal_entry_id
  for update;

  if not found then
    raise exception 'Journal entry not found';
  end if;

  if not private.has_permission_for_finance_scope('post_journals', v_entry.branch_id, v_entry.district_id) then
    raise exception 'Insufficient permission to post journals';
  end if;

  if v_entry.status = 'posted' then
    return jsonb_build_object(
      'journal_entry_id', v_entry.id,
      'status', 'posted',
      'already_posted', true
    );
  end if;

  if v_entry.status <> 'draft' then
    raise exception 'Only draft journal entries can be posted';
  end if;

  if v_entry.source_type = 'financial_document_pending' then
    raise exception 'A financial-document journal cannot be posted before approval and linkage';
  end if;

  if v_entry.source_type = 'financial_document' then
    select * into v_document
    from public.financial_documents
    where id = v_entry.source_id
    for update;

    if not found
       or v_document.status <> 'approved'
       or v_document.journal_entry_id is distinct from v_entry.id
       or v_document.branch_id is distinct from v_entry.branch_id
       or v_document.district_id is distinct from v_entry.district_id then
      raise exception 'Financial-document journal must be linked to an approved document before posting';
    end if;
  end if;

  perform private.post_journal_entry(p_journal_entry_id);

  return jsonb_build_object(
    'journal_entry_id', p_journal_entry_id,
    'status', 'posted',
    'already_posted', false
  );
end;
$$;

revoke all on function public.post_finance_journal_entry(uuid)
  from public, anon, service_role;
grant execute on function public.post_finance_journal_entry(uuid)
  to authenticated;

create or replace function private.create_scoped_financial_document_transaction(
  p_scope_type text,
  p_scope_id uuid,
  p_document_type text,
  p_transaction_date date,
  p_profile_id uuid,
  p_party_name text,
  p_amount numeric,
  p_currency_code char(3),
  p_payment_method text,
  p_financial_account_id uuid,
  p_category_account_id uuid,
  p_fund_id uuid default null,
  p_external_reference text default null,
  p_description text default null,
  p_exchange_rate_to_base numeric default 1
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid;
  v_branch_id uuid;
  v_district_id uuid;
  v_base_currency char(3);
  v_account public.financial_accounts%rowtype;
  v_cash_account public.chart_of_accounts%rowtype;
  v_category_account public.chart_of_accounts%rowtype;
  v_period public.financial_periods%rowtype;
  v_document_id uuid;
  v_document_number bigint;
  v_journal_id uuid;
  v_request_id uuid;
  v_base_amount numeric(20,4);
  v_document_status text;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  v_profile_id := private.current_profile_id();
  if v_profile_id is null then
    raise exception 'No member profile is linked to this account';
  end if;

  if p_scope_type not in ('church', 'district', 'branch') then
    raise exception 'Finance scope must be church, district or branch';
  end if;

  if p_scope_type = 'church' then
    if p_scope_id is not null then
      raise exception 'Church-wide finance scope must not include a scope ID';
    end if;
    if not private.has_permission('manage_finances', null) then
      raise exception 'Insufficient permission to create church-wide financial transactions';
    end if;
    v_branch_id := null;
    v_district_id := null;
  elsif p_scope_type = 'district' then
    if p_scope_id is null or not exists (
      select 1 from public.districts d where d.id = p_scope_id and d.status = 'active'
    ) then
      raise exception 'Finance district does not exist or is inactive';
    end if;
    if not private.has_permission_for_district('manage_finances', p_scope_id) then
      raise exception 'Insufficient permission to create financial transactions in this district';
    end if;
    v_branch_id := null;
    v_district_id := p_scope_id;
  else
    if p_scope_id is null then
      raise exception 'A branch ID is required for branch-scoped transactions';
    end if;
    select b.district_id into v_district_id
    from public.church_branches b
    where b.id = p_scope_id and b.status = 'active';
    if not found then
      raise exception 'Finance branch does not exist or is inactive';
    end if;
    if not private.has_permission('manage_finances', p_scope_id) then
      raise exception 'Insufficient permission to create financial transactions in this branch';
    end if;
    v_branch_id := p_scope_id;
  end if;

  if p_document_type is null or p_document_type not in ('receipt', 'payment') then
    raise exception 'Only receipt and payment transactions can be created here';
  end if;
  if p_transaction_date is null
     or p_amount is null or p_amount <= 0
     or p_exchange_rate_to_base is null or p_exchange_rate_to_base <= 0 then
    raise exception 'Transaction date, positive amount and positive exchange rate are required';
  end if;
  if p_currency_code is null or length(trim(p_currency_code::text)) <> 3
     or not exists (select 1 from public.currencies c where c.code = p_currency_code) then
    raise exception 'A valid transaction currency is required';
  end if;
  if p_party_name is null or length(trim(p_party_name)) = 0
     or p_description is null or length(trim(p_description)) = 0 then
    raise exception 'Counterparty name and description are required';
  end if;
  if p_payment_method is null or p_payment_method not in ('cash','bank_transfer','mobile_money','card','cheque','other') then
    raise exception 'Unsupported payment method';
  end if;

  if p_profile_id is not null and not exists (
    select 1 from public.profiles p where p.id = p_profile_id
  ) then
    raise exception 'Selected member profile does not exist';
  end if;

  select base_currency_code into v_base_currency
  from public.church_settings where id = 1;
  if v_base_currency is null then
    raise exception 'Church settings must be configured before financial operations';
  end if;
  if p_currency_code = v_base_currency and p_exchange_rate_to_base <> 1 then
    raise exception 'Exchange rate must be 1 for the base currency';
  end if;

  select * into v_account
  from public.financial_accounts fa
  where fa.id = p_financial_account_id
    and fa.is_active
    and fa.currency_code = p_currency_code
    and (
      (p_scope_type = 'branch' and (
        fa.branch_id = v_branch_id
        or (fa.branch_id is null and (fa.district_id is null or fa.district_id is not distinct from v_district_id))
      ))
      or (p_scope_type = 'district' and (
        fa.branch_id is null and (fa.district_id = v_district_id or fa.district_id is null)
      ))
      or (p_scope_type = 'church' and (
        fa.branch_id is null and fa.district_id is null
      ))
    );
  if not found then
    raise exception 'Financial account is inactive or incompatible with transaction scope/currency';
  end if;

  select * into v_cash_account
  from public.chart_of_accounts
  where id = v_account.chart_account_id
    and is_active
    and account_type = 'asset';
  if not found then
    raise exception 'Financial account must link to an active asset chart account';
  end if;

  select * into v_category_account
  from public.chart_of_accounts
  where id = p_category_account_id
    and is_active
    and not is_control_account
    and account_type = case when p_document_type = 'receipt' then 'income' else 'expense' end;
  if not found then
    raise exception 'Selected category must be an active, non-control account of the correct type';
  end if;

  if p_fund_id is not null and not exists (
    select 1 from public.funds f
    where f.id = p_fund_id
      and f.is_active
      and (
        (p_scope_type = 'branch' and (
          f.branch_id = v_branch_id
          or (f.branch_id is null and (f.district_id is null or f.district_id is not distinct from v_district_id))
        ))
        or (p_scope_type = 'district' and (
          f.branch_id is null and (f.district_id = v_district_id or f.district_id is null)
        ))
        or (p_scope_type = 'church' and (
          f.branch_id is null and f.district_id is null
        ))
      )
  ) then
    raise exception 'Selected fund is inactive or incompatible with this organizational scope';
  end if;

  select fp.* into v_period
  from public.financial_periods fp
  join public.financial_years fy on fy.id = fp.financial_year_id
  where fp.status = 'open'
    and fy.status = 'open'
    and p_transaction_date between fp.start_date and fp.end_date
  limit 1;
  if not found then
    raise exception 'No open financial period and year exist for the transaction date';
  end if;

  v_base_amount := round(p_amount * p_exchange_rate_to_base, 4);

  insert into public.financial_documents (
    document_type, transaction_date, branch_id, district_id, profile_id,
    payee_or_payer_name, amount, currency_code, payment_method,
    financial_account_id, external_reference, description,
    status, created_by_profile_id, exchange_rate_to_base, base_currency_code
  )
  values (
    p_document_type, p_transaction_date, v_branch_id, v_district_id, p_profile_id,
    trim(p_party_name), p_amount, p_currency_code, p_payment_method,
    p_financial_account_id, nullif(trim(coalesce(p_external_reference, '')), ''),
    trim(p_description), 'draft', v_profile_id,
    p_exchange_rate_to_base, v_base_currency
  )
  returning id, document_number into v_document_id, v_document_number;

  insert into public.journal_entries (
    period_id, branch_id, district_id, entry_date, description, reference,
    currency_code, exchange_rate_to_base, base_currency_code,
    source_type, source_id, created_by_profile_id
  )
  values (
    v_period.id, v_branch_id, v_district_id, p_transaction_date, trim(p_description),
    nullif(trim(coalesce(p_external_reference, '')), ''),
    p_currency_code, p_exchange_rate_to_base, v_base_currency,
    'financial_document_pending', v_document_id, v_profile_id
  )
  returning id into v_journal_id;

  if p_document_type = 'receipt' then
    insert into public.journal_lines (
      journal_entry_id, line_number, account_id, fund_id, branch_id,
      profile_id, description, debit_amount, credit_amount,
      base_debit_amount, base_credit_amount
    )
    values
      (v_journal_id, 1, v_cash_account.id, null, v_branch_id, p_profile_id,
       trim(p_description), p_amount, 0, v_base_amount, 0),
      (v_journal_id, 2, v_category_account.id, p_fund_id, v_branch_id, p_profile_id,
       trim(p_description), 0, p_amount, 0, v_base_amount);
  else
    insert into public.journal_lines (
      journal_entry_id, line_number, account_id, fund_id, branch_id,
      profile_id, description, debit_amount, credit_amount,
      base_debit_amount, base_credit_amount
    )
    values
      (v_journal_id, 1, v_category_account.id, p_fund_id, v_branch_id, p_profile_id,
       trim(p_description), p_amount, 0, v_base_amount, 0),
      (v_journal_id, 2, v_cash_account.id, null, v_branch_id, p_profile_id,
       trim(p_description), 0, p_amount, 0, v_base_amount);
  end if;

  v_request_id := private.submit_financial_document_for_approval(v_document_id);

  select status into v_document_status
  from public.financial_documents where id = v_document_id;

  if v_document_status = 'approved' then
    perform private.attach_approved_pending_financial_document_journal(
      v_document_id, v_journal_id
    );
  end if;

  return jsonb_build_object(
    'document_id', v_document_id,
    'document_number', v_document_number,
    'journal_entry_id', v_journal_id,
    'approval_request_id', v_request_id,
    'status', v_document_status
  );
end;
$$;

revoke all on function private.create_scoped_financial_document_transaction(
  text, uuid, text, date, uuid, text, numeric, char, text, uuid, uuid, uuid, text, text, numeric
) from public, anon, authenticated, service_role;

create or replace function public.create_financial_document_transaction(
  p_document_type text,
  p_transaction_date date,
  p_branch_id uuid,
  p_profile_id uuid,
  p_party_name text,
  p_amount numeric,
  p_currency_code char(3),
  p_payment_method text,
  p_financial_account_id uuid,
  p_category_account_id uuid,
  p_fund_id uuid default null,
  p_external_reference text default null,
  p_description text default null,
  p_exchange_rate_to_base numeric default 1
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  return private.create_scoped_financial_document_transaction(
    case when p_branch_id is null then 'church' else 'branch' end,
    p_branch_id,
    p_document_type,
    p_transaction_date,
    p_profile_id,
    p_party_name,
    p_amount,
    p_currency_code,
    p_payment_method,
    p_financial_account_id,
    p_category_account_id,
    p_fund_id,
    p_external_reference,
    p_description,
    p_exchange_rate_to_base
  );
end;
$$;

revoke all on function public.create_financial_document_transaction(
  text, date, uuid, uuid, text, numeric, char, text, uuid, uuid, uuid, text, text, numeric
) from public, anon, authenticated, service_role;

create or replace function public.create_finance_scope_document_transaction(
  p_scope_type text,
  p_scope_id uuid,
  p_document_type text,
  p_transaction_date date,
  p_profile_id uuid,
  p_party_name text,
  p_amount numeric,
  p_currency_code char(3),
  p_payment_method text,
  p_financial_account_id uuid,
  p_category_account_id uuid,
  p_fund_id uuid default null,
  p_external_reference text default null,
  p_description text default null,
  p_exchange_rate_to_base numeric default 1,
  p_idempotency_key uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid;
  v_fingerprint text;
  v_existing public.financial_documents%rowtype;
  v_journal_id uuid;
  v_approval_request_id uuid;
  v_result jsonb;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;
  v_profile_id := private.current_profile_id();
  if v_profile_id is null then
    raise exception 'No member profile is linked to this account';
  end if;
  if p_idempotency_key is null then
    raise exception 'A transaction idempotency key is required';
  end if;
  if p_scope_type not in ('church', 'district', 'branch') then
    raise exception 'Finance scope must be church, district or branch';
  end if;

  v_fingerprint := md5(jsonb_build_object(
    'scope_type', p_scope_type,
    'scope_id', p_scope_id,
    'document_type', p_document_type,
    'transaction_date', p_transaction_date,
    'profile_id', p_profile_id,
    'party_name', trim(coalesce(p_party_name, '')),
    'amount', p_amount,
    'currency_code', upper(trim(coalesce(p_currency_code::text, ''))),
    'payment_method', p_payment_method,
    'financial_account_id', p_financial_account_id,
    'category_account_id', p_category_account_id,
    'fund_id', p_fund_id,
    'external_reference', nullif(trim(coalesce(p_external_reference, '')), ''),
    'description', trim(coalesce(p_description, '')),
    'exchange_rate_to_base', coalesce(p_exchange_rate_to_base, 1)
  )::text);

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_profile_id::text || ':' || p_idempotency_key::text, 0)
  );

  select * into v_existing
  from public.financial_documents
  where created_by_profile_id = v_profile_id
    and idempotency_key = p_idempotency_key
  for update;

  if found then
    if v_existing.idempotency_fingerprint is distinct from v_fingerprint then
      raise exception 'This idempotency key was already used with different transaction details';
    end if;

    v_journal_id := v_existing.journal_entry_id;
    if v_journal_id is null then
      select id into v_journal_id
      from public.journal_entries
      where source_id = v_existing.id
        and source_type in ('financial_document', 'financial_document_pending')
      limit 1;
    end if;

    select id into v_approval_request_id
    from public.approval_requests
    where transaction_type = 'financial_document'
      and target_id = v_existing.id
    limit 1;

    return jsonb_build_object(
      'document_id', v_existing.id,
      'document_number', v_existing.document_number,
      'journal_entry_id', v_journal_id,
      'approval_request_id', v_approval_request_id,
      'status', v_existing.status,
      'scope_type', p_scope_type,
      'scope_id', p_scope_id,
      'idempotent_replay', true
    );
  end if;

  v_result := private.create_scoped_financial_document_transaction(
    p_scope_type,
    p_scope_id,
    p_document_type,
    p_transaction_date,
    p_profile_id,
    p_party_name,
    p_amount,
    p_currency_code,
    p_payment_method,
    p_financial_account_id,
    p_category_account_id,
    p_fund_id,
    p_external_reference,
    p_description,
    p_exchange_rate_to_base
  );

  update public.financial_documents
  set idempotency_key = p_idempotency_key,
      idempotency_fingerprint = v_fingerprint
  where id = (v_result->>'document_id')::uuid
    and created_by_profile_id = v_profile_id;

  if not found then
    raise exception 'Created financial document could not be associated with its idempotency key';
  end if;

  return v_result || jsonb_build_object(
    'scope_type', p_scope_type,
    'scope_id', p_scope_id,
    'idempotent_replay', false
  );
end;
$$;

revoke all on function public.create_finance_scope_document_transaction(
  text, uuid, text, date, uuid, text, numeric, char, text, uuid, uuid, uuid, text, text, numeric, uuid
) from public, anon, service_role;
grant execute on function public.create_finance_scope_document_transaction(
  text, uuid, text, date, uuid, text, numeric, char, text, uuid, uuid, uuid, text, text, numeric, uuid
) to authenticated;

create or replace function public.get_finance_scope_transaction_options(
  p_scope_type text,
  p_scope_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid;
  v_branch_id uuid;
  v_district_id uuid;
  v_options jsonb;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  v_profile_id := private.current_profile_id();
  if v_profile_id is null then
    raise exception 'No member profile is linked to this account';
  end if;

  if p_scope_type not in ('church', 'district', 'branch') then
    raise exception 'Finance scope must be church, district or branch';
  end if;

  if p_scope_type = 'church' then
    if p_scope_id is not null then
      raise exception 'Church-wide finance scope must not include a scope ID';
    end if;
    if not (
      private.has_permission('view_finances', null)
      or private.has_permission('manage_finances', null)
      or private.has_permission('approve_finances', null)
    ) then
      raise exception 'Insufficient permission to view church-wide finance transaction options';
    end if;
    v_branch_id := null;
    v_district_id := null;
  elsif p_scope_type = 'district' then
    if p_scope_id is null or not exists (
      select 1 from public.districts d where d.id = p_scope_id
    ) then
      raise exception 'Finance district does not exist';
    end if;
    if not (
      private.has_permission_for_district('view_finances', p_scope_id)
      or private.has_permission_for_district('manage_finances', p_scope_id)
      or private.has_permission_for_district('approve_finances', p_scope_id)
    ) then
      raise exception 'Insufficient permission to view finance transaction options in this district';
    end if;
    v_branch_id := null;
    v_district_id := p_scope_id;
  else
    if p_scope_id is null then
      raise exception 'Finance branch does not exist';
    end if;
    select b.district_id into v_district_id
    from public.church_branches b
    where b.id = p_scope_id;
    if not found then
      raise exception 'Finance branch does not exist';
    end if;
    if not (
      private.has_permission('view_finances', p_scope_id)
      or private.has_permission('manage_finances', p_scope_id)
      or private.has_permission('approve_finances', p_scope_id)
    ) then
      raise exception 'Insufficient permission to view finance transaction options in this branch';
    end if;
    v_branch_id := p_scope_id;
  end if;

  select jsonb_build_object(
    'scope', jsonb_build_object('type', p_scope_type, 'id', p_scope_id),
    'currencies', coalesce((
      select jsonb_agg(c.code order by c.code)
      from public.currencies c where c.is_active
    ), '[]'::jsonb),
    'baseCurrencyCode', (
      select cs.base_currency_code from public.church_settings cs where cs.id = 1
    ),
    'chartAccounts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', coa.id,
        'parent_account_id', coa.parent_account_id,
        'code', coa.code,
        'name', coa.name,
        'account_type', coa.account_type,
        'normal_balance', coa.normal_balance,
        'description', coa.description,
        'is_control_account', coa.is_control_account,
        'is_system', coa.is_system,
        'is_active', coa.is_active
      ) order by coa.code, coa.id)
      from public.chart_of_accounts coa
    ), '[]'::jsonb),
    'financialAccounts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', fa.id,
        'chart_account_id', fa.chart_account_id,
        'branch_id', fa.branch_id,
        'district_id', fa.district_id,
        'name', fa.name,
        'account_type', fa.account_type,
        'currency_code', fa.currency_code,
        'provider_name', fa.provider_name,
        'account_reference', fa.account_reference,
        'is_active', fa.is_active
      ) order by (fa.branch_id is not null) desc, (fa.district_id is not null) desc, fa.name, fa.id)
      from public.financial_accounts fa
      where
        (p_scope_type = 'branch' and (
          fa.branch_id = v_branch_id
          or (fa.branch_id is null and (fa.district_id is null or fa.district_id is not distinct from v_district_id))
        ))
        or (p_scope_type = 'district' and (
          fa.branch_id is null and (fa.district_id = v_district_id or fa.district_id is null)
        ))
        or (p_scope_type = 'church' and (
          fa.branch_id is null and fa.district_id is null
        ))
    ), '[]'::jsonb),
    'funds', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', f.id,
        'branch_id', f.branch_id,
        'district_id', f.district_id,
        'name', f.name,
        'code', f.code,
        'description', f.description,
        'fund_type', f.fund_type,
        'is_default', f.is_default,
        'is_active', f.is_active
      ) order by (f.branch_id is not null) desc, (f.district_id is not null) desc, f.code, f.id)
      from public.funds f
      where
        (p_scope_type = 'branch' and (
          f.branch_id = v_branch_id
          or (f.branch_id is null and (f.district_id is null or f.district_id is not distinct from v_district_id))
        ))
        or (p_scope_type = 'district' and (
          f.branch_id is null and (f.district_id = v_district_id or f.district_id is null)
        ))
        or (p_scope_type = 'church' and (
          f.branch_id is null and f.district_id is null
        ))
    ), '[]'::jsonb),
    'financialYears', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', fy.id, 'year_number', fy.year_number,
        'start_date', fy.start_date, 'end_date', fy.end_date,
        'status', fy.status
      ) order by fy.year_number desc)
      from public.financial_years fy
    ), '[]'::jsonb),
    'periods', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', fp.id, 'financial_year_id', fp.financial_year_id,
        'name', fp.name, 'start_date', fp.start_date,
        'end_date', fp.end_date, 'status', fp.status,
        'year_status', fy.status
      ) order by fp.start_date desc, fp.id)
      from public.financial_periods fp
      join public.financial_years fy on fy.id = fp.financial_year_id
    ), '[]'::jsonb),
    'approvalPolicies', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', ap.id,
        'name', ap.name,
        'transaction_type', ap.transaction_type,
        'branch_id', ap.branch_id,
        'district_id', ap.district_id,
        'version', ap.version,
        'effective_from', ap.effective_from,
        'effective_to', ap.effective_to,
        'is_active', ap.is_active
      ) order by (ap.branch_id is not null) desc, (ap.district_id is not null) desc, ap.transaction_type, ap.version desc)
      from public.approval_policies ap
      where ap.transaction_type in ('financial_document', 'budget')
        and (
          (p_scope_type = 'branch' and (
            ap.branch_id = v_branch_id
            or (ap.branch_id is null and (ap.district_id is null or ap.district_id is not distinct from v_district_id))
          ))
          or (p_scope_type = 'district' and (
            ap.branch_id is null and (ap.district_id = v_district_id or ap.district_id is null)
          ))
          or (p_scope_type = 'church' and (
            ap.branch_id is null and ap.district_id is null
          ))
        )
    ), '[]'::jsonb),
    'approvalPolicyBands', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', band.id, 'policy_id', band.policy_id,
        'min_amount_base', band.min_amount_base,
        'max_amount_base', band.max_amount_base
      ) order by band.policy_id, band.min_amount_base)
      from public.approval_policy_bands band
      join public.approval_policies ap on ap.id = band.policy_id
      where ap.transaction_type in ('financial_document', 'budget')
        and (
          (p_scope_type = 'branch' and (
            ap.branch_id = v_branch_id
            or (ap.branch_id is null and (ap.district_id is null or ap.district_id is not distinct from v_district_id))
          ))
          or (p_scope_type = 'district' and (
            ap.branch_id is null and (ap.district_id = v_district_id or ap.district_id is null)
          ))
          or (p_scope_type = 'church' and (
            ap.branch_id is null and ap.district_id is null
          ))
        )
    ), '[]'::jsonb),
    'approvalPolicySteps', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', step.id, 'band_id', step.band_id,
        'step_number', step.step_number,
        'required_permission_key', step.required_permission_key,
        'required_approvals', step.required_approvals,
        'prohibit_submitter_approval', step.prohibit_submitter_approval
      ) order by step.band_id, step.step_number)
      from public.approval_policy_steps step
      join public.approval_policy_bands band on band.id = step.band_id
      join public.approval_policies ap on ap.id = band.policy_id
      where ap.transaction_type in ('financial_document', 'budget')
        and (
          (p_scope_type = 'branch' and (
            ap.branch_id = v_branch_id
            or (ap.branch_id is null and (ap.district_id is null or ap.district_id is not distinct from v_district_id))
          ))
          or (p_scope_type = 'district' and (
            ap.branch_id is null and (ap.district_id = v_district_id or ap.district_id is null)
          ))
          or (p_scope_type = 'church' and (
            ap.branch_id is null and ap.district_id is null
          ))
        )
    ), '[]'::jsonb)
  )
  into v_options;

  return v_options;
end;
$$;

revoke all on function public.get_finance_scope_transaction_options(text, uuid)
  from public, anon, service_role;
grant execute on function public.get_finance_scope_transaction_options(text, uuid)
  to authenticated;

create or replace function public.get_finance_scope_documents(
  p_scope_type text,
  p_scope_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid;
  v_documents jsonb;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  v_profile_id := private.current_profile_id();
  if v_profile_id is null then
    raise exception 'No member profile is linked to this account';
  end if;

  if p_scope_type not in ('church', 'district', 'branch') then
    raise exception 'Finance scope must be church, district or branch';
  end if;

  if p_scope_type = 'church' then
    if p_scope_id is not null then
      raise exception 'Church-wide finance scope must not include a scope ID';
    end if;
    if not (
      private.has_permission('view_finances', null)
      or private.has_permission('manage_finances', null)
      or private.has_permission('approve_finances', null)
    ) then
      raise exception 'Insufficient permission to view church-wide financial documents';
    end if;
  elsif p_scope_type = 'district' then
    if p_scope_id is null or not exists (
      select 1 from public.districts d where d.id = p_scope_id
    ) then
      raise exception 'Finance district does not exist';
    end if;
    if not (
      private.has_permission_for_district('view_finances', p_scope_id)
      or private.has_permission_for_district('manage_finances', p_scope_id)
      or private.has_permission_for_district('approve_finances', p_scope_id)
    ) then
      raise exception 'Insufficient permission to view financial documents in this district';
    end if;
  else
    if p_scope_id is null or not exists (
      select 1 from public.church_branches b where b.id = p_scope_id
    ) then
      raise exception 'Finance branch does not exist';
    end if;
    if not (
      private.has_permission('view_finances', p_scope_id)
      or private.has_permission('manage_finances', p_scope_id)
      or private.has_permission('approve_finances', p_scope_id)
    ) then
      raise exception 'Insufficient permission to view financial documents in this branch';
    end if;
  end if;

  select coalesce(
    jsonb_agg(document_row.document_json
      order by document_row.transaction_date desc,
               document_row.created_at desc,
               document_row.id desc),
    '[]'::jsonb
  )
  into v_documents
  from (
    select
      fd.transaction_date,
      fd.created_at,
      fd.id,
      jsonb_build_object(
        'id', fd.id,
        'document_number', fd.document_number,
        'document_type', fd.document_type,
        'transaction_date', fd.transaction_date,
        'branch_id', fd.branch_id,
        'district_id', fd.district_id,
        'profile_id', fd.profile_id,
        'payee_or_payer_name', fd.payee_or_payer_name,
        'amount', fd.amount,
        'currency_code', fd.currency_code,
        'payment_method', fd.payment_method,
        'financial_account_id', fd.financial_account_id,
        'fund_id', (
          select jl.fund_id
          from public.journal_entries je
          join public.journal_lines jl on jl.journal_entry_id = je.id
          where je.source_id = fd.id
            and je.source_type in ('financial_document_pending', 'financial_document')
            and jl.fund_id is not null
          order by jl.line_number
          limit 1
        ),
        'external_reference', fd.external_reference,
        'description', fd.description,
        'status', fd.status,
        'journal_entry_id', fd.journal_entry_id,
        'approval_request_id', ar.id,
        'approval_status', ar.status,
        'actor_approval_step_id', actor_step.id,
        'approval_steps_completed', coalesce(approval_progress.completed_count, 0),
        'approval_steps_total', coalesce(approval_progress.total_count, 0),
        'approval_steps', coalesce(approval_progress.steps, '[]'::jsonb)
      ) as document_json
    from public.financial_documents fd
    left join public.approval_requests ar
      on ar.id = fd.approval_request_id
      and ar.transaction_type = 'financial_document'
      and ar.target_id = fd.id
      and ar.branch_id is not distinct from fd.branch_id
      and ar.district_id is not distinct from fd.district_id
    left join lateral (
      select s.id
      from public.approval_request_steps s
      where ar.status = 'pending'
        and s.approval_request_id = ar.id
        and s.status = 'pending'
        and (
          not s.prohibit_submitter_approval
          or ar.submitted_by_profile_id is distinct from v_profile_id
        )
        and private.has_permission_for_finance_scope(s.required_permission_key, ar.branch_id, ar.district_id)
        and not exists (
          select 1
          from public.approval_decisions ad
          where ad.approval_request_step_id = s.id
            and ad.approver_profile_id = v_profile_id
        )
        and not exists (
          select 1
          from public.approval_request_steps prior
          where prior.approval_request_id = ar.id
            and prior.step_number < s.step_number
            and prior.status <> 'approved'
        )
      order by s.step_number
      limit 1
    ) actor_step on true
    left join lateral (
      select
        (count(s.id) filter (where s.status = 'approved'))::integer as completed_count,
        count(s.id)::integer as total_count,
        coalesce(
          jsonb_agg(
            jsonb_build_object(
              'id', s.id,
              'step_order', s.step_number,
              'approver_profile_id', latest_decision.approver_profile_id,
              'status', s.status,
              'decision', latest_decision.decision,
              'comments', latest_decision.comments
            )
            order by s.step_number
          ),
          '[]'::jsonb
        ) as steps
      from public.approval_request_steps s
      left join lateral (
        select
          ad.approver_profile_id,
          ad.decision,
          ad.comments
        from public.approval_decisions ad
        where ad.approval_request_step_id = s.id
        order by ad.decided_at desc, ad.id desc
        limit 1
      ) latest_decision on true
      where s.approval_request_id = ar.id
    ) approval_progress on true
    where fd.document_type in ('receipt', 'payment')
      and (
        (p_scope_type = 'church' and fd.branch_id is null and fd.district_id is null)
        or (p_scope_type = 'district' and fd.branch_id is null and fd.district_id = p_scope_id)
        or (p_scope_type = 'branch' and fd.branch_id = p_scope_id)
      )
  ) document_row;

  return jsonb_build_object(
    'actor_profile_id', v_profile_id,
    'documents', v_documents
  );
end;
$$;

revoke all on function public.get_finance_scope_documents(text, uuid)
  from public, anon, service_role;
grant execute on function public.get_finance_scope_documents(text, uuid)
  to authenticated;

create or replace function public.get_finance_scope_journals(
  p_scope_type text,
  p_scope_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid;
  v_journals jsonb;
  v_balances jsonb;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  v_profile_id := private.current_profile_id();
  if v_profile_id is null then
    raise exception 'No member profile is linked to this account';
  end if;

  if p_scope_type not in ('church', 'district', 'branch') then
    raise exception 'Finance scope must be church, district or branch';
  end if;

  if p_scope_type = 'church' then
    if p_scope_id is not null then
      raise exception 'Church-wide finance scope must not include a scope ID';
    end if;
    if not (
      private.has_permission('view_finances', null)
      or private.has_permission('manage_finances', null)
      or private.has_permission('approve_finances', null)
      or private.has_permission('post_journals', null)
    ) then
      raise exception 'Insufficient permission to view church-wide journal entries';
    end if;
  elsif p_scope_type = 'district' then
    if p_scope_id is null or not exists (
      select 1 from public.districts d where d.id = p_scope_id
    ) then
      raise exception 'Finance district does not exist';
    end if;
    if not (
      private.has_permission_for_district('view_finances', p_scope_id)
      or private.has_permission_for_district('manage_finances', p_scope_id)
      or private.has_permission_for_district('approve_finances', p_scope_id)
      or private.has_permission_for_district('post_journals', p_scope_id)
    ) then
      raise exception 'Insufficient permission to view journal entries in this district';
    end if;
  else
    if p_scope_id is null or not exists (
      select 1 from public.church_branches b where b.id = p_scope_id
    ) then
      raise exception 'Finance branch does not exist';
    end if;
    if not (
      private.has_permission('view_finances', p_scope_id)
      or private.has_permission('manage_finances', p_scope_id)
      or private.has_permission('approve_finances', p_scope_id)
      or private.has_permission('post_journals', p_scope_id)
    ) then
      raise exception 'Insufficient permission to view journal entries in this branch';
    end if;
  end if;

  select coalesce(jsonb_agg(journal_row.journal_json
    order by journal_row.entry_date desc, journal_row.created_at desc, journal_row.id desc), '[]'::jsonb)
  into v_journals
  from (
    select
      je.id,
      je.entry_date,
      je.created_at,
      jsonb_build_object(
        'id', je.id,
        'entry_number', je.entry_number,
        'period_id', je.period_id,
        'branch_id', je.branch_id,
        'district_id', je.district_id,
        'entry_date', je.entry_date,
        'description', je.description,
        'reference', je.reference,
        'currency_code', je.currency_code,
        'exchange_rate_to_base', je.exchange_rate_to_base,
        'base_currency_code', je.base_currency_code,
        'status', je.status,
        'source_type', je.source_type,
        'source_id', je.source_id,
        'source_document_status', fd.status,
        'posted_at', je.posted_at,
        'total_debits', coalesce(lines.total_debits, 0),
        'total_credits', coalesce(lines.total_credits, 0),
        'base_total_debits', coalesce(lines.base_total_debits, 0),
        'base_total_credits', coalesce(lines.base_total_credits, 0),
        'can_post', (
          je.status = 'draft'
          and je.source_type is distinct from 'financial_document_pending'
          and private.has_permission_for_finance_scope('post_journals', je.branch_id, je.district_id)
          and (
            je.source_type is distinct from 'financial_document'
            or (fd.status = 'approved' and fd.journal_entry_id = je.id)
          )
        ),
        'lines', coalesce(lines.line_items, '[]'::jsonb)
      ) as journal_json
    from public.journal_entries je
    left join public.financial_documents fd
      on fd.id = je.source_id
      and je.source_type in ('financial_document_pending', 'financial_document')
    left join lateral (
      select
        sum(jl.debit_amount) as total_debits,
        sum(jl.credit_amount) as total_credits,
        sum(jl.base_debit_amount) as base_total_debits,
        sum(jl.base_credit_amount) as base_total_credits,
        jsonb_agg(jsonb_build_object(
          'id', jl.id,
          'line_number', jl.line_number,
          'account_id', jl.account_id,
          'account_code', coa.code,
          'account_name', coa.name,
          'account_type', coa.account_type,
          'normal_balance', coa.normal_balance,
          'fund_id', jl.fund_id,
          'branch_id', jl.branch_id,
          'profile_id', jl.profile_id,
          'description', jl.description,
          'debit_amount', jl.debit_amount,
          'credit_amount', jl.credit_amount,
          'base_debit_amount', jl.base_debit_amount,
          'base_credit_amount', jl.base_credit_amount
        ) order by jl.line_number) as line_items
      from public.journal_lines jl
      join public.chart_of_accounts coa on coa.id = jl.account_id
      where jl.journal_entry_id = je.id
    ) lines on true
    where
      (p_scope_type = 'church' and je.branch_id is null and je.district_id is null)
      or (p_scope_type = 'district' and je.branch_id is null and je.district_id = p_scope_id)
      or (p_scope_type = 'branch' and je.branch_id = p_scope_id)
  ) journal_row;

  select coalesce(jsonb_agg(jsonb_build_object(
    'account_id', balance.account_id,
    'account_code', balance.code,
    'account_name', balance.name,
    'account_type', balance.account_type,
    'normal_balance', balance.normal_balance,
    'base_currency_code', balance.base_currency_code,
    'debit_total', balance.debit_total,
    'credit_total', balance.credit_total,
    'net_debit_balance', balance.debit_total - balance.credit_total
  ) order by balance.code), '[]'::jsonb)
  into v_balances
  from (
    select
      coa.id as account_id,
      coa.code,
      coa.name,
      coa.account_type,
      coa.normal_balance,
      je.base_currency_code,
      sum(jl.base_debit_amount) as debit_total,
      sum(jl.base_credit_amount) as credit_total
    from public.journal_entries je
    join public.journal_lines jl on jl.journal_entry_id = je.id
    join public.chart_of_accounts coa on coa.id = jl.account_id
    where je.status = 'posted'
      and (
        (p_scope_type = 'church' and je.branch_id is null and je.district_id is null)
        or (p_scope_type = 'district' and je.branch_id is null and je.district_id = p_scope_id)
        or (p_scope_type = 'branch' and je.branch_id = p_scope_id)
      )
    group by coa.id, coa.code, coa.name, coa.account_type, coa.normal_balance, je.base_currency_code
  ) balance;

  return jsonb_build_object(
    'actor_profile_id', v_profile_id,
    'journals', v_journals,
    'account_balances', v_balances
  );
end;
$$;

revoke all on function public.get_finance_scope_journals(text, uuid)
  from public, anon, service_role;
grant execute on function public.get_finance_scope_journals(text, uuid)
  to authenticated;

comment on function public.create_finance_scope_document_transaction(
  text, uuid, text, date, uuid, text, numeric, char, text, uuid, uuid, uuid, text, text, numeric, uuid
) is 'Idempotently creates a receipt or payment document, pending journal, and approval request across church-wide, district, or branch scopes.';

comment on function public.get_finance_scope_transaction_options(text, uuid)
  is 'Returns transaction entry options including active chart accounts, periods, and hierarchically inherited accounts, funds, and approval policies for one authorized scope.';

comment on function public.get_finance_scope_documents(text, uuid)
  is 'Returns receipt and payment documents with approval progress for exactly one authorized church, district, or branch scope.';

comment on function public.get_finance_scope_journals(text, uuid)
  is 'Returns journal entries and posted-only account balances for exactly one authorized church, district, or branch scope.';

commit;
