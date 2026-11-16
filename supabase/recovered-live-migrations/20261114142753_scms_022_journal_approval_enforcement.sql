
begin;

alter table public.journal_entries
  add column approval_checked_at timestamptz;

create or replace function private.submit_journal_entry_for_approval(p_entry_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry public.journal_entries%rowtype;
  v_profile_id uuid;
  v_policy public.approval_policies%rowtype;
  v_band public.approval_policy_bands%rowtype;
  v_request_id uuid;
  v_amount_base numeric(20,4);
  v_debits numeric(24,4);
  v_credits numeric(24,4);
  v_base_debits numeric(24,4);
  v_base_credits numeric(24,4);
  v_line_count integer;
  v_steps_count integer;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;
  v_profile_id := private.current_profile_id();
  if v_profile_id is null then
    raise exception 'No member profile is linked to this account';
  end if;

  select * into v_entry
  from public.journal_entries where id = p_entry_id for update;
  if not found or v_entry.status <> 'draft' then
    raise exception 'Only draft journal entries can be submitted';
  end if;
  if v_entry.source_type = 'financial_document' then
    raise exception 'Financial-document journals use the document approval workflow';
  end if;
  if not private.has_permission('manage_finances', v_entry.branch_id) then
    raise exception 'Insufficient permission to submit this journal';
  end if;

  select count(*),
         coalesce(sum(debit_amount),0),
         coalesce(sum(credit_amount),0),
         coalesce(sum(base_debit_amount),0),
         coalesce(sum(base_credit_amount),0)
  into v_line_count, v_debits, v_credits, v_base_debits, v_base_credits
  from public.journal_lines where journal_entry_id = p_entry_id;

  if v_line_count < 2 or v_debits <> v_credits or v_base_debits <> v_base_credits then
    raise exception 'Journal must contain at least two balanced lines before approval';
  end if;

  v_amount_base := v_base_debits;

  select * into v_policy
  from public.approval_policies p
  where p.transaction_type = 'journal_entry'
    and p.is_active
    and p.effective_from <= current_date
    and (p.effective_to is null or p.effective_to >= current_date)
    and (p.branch_id = v_entry.branch_id or p.branch_id is null)
  order by (p.branch_id is not null) desc, p.version desc
  limit 1;
  if not found then
    raise exception 'No active journal-entry approval policy is configured for this scope';
  end if;

  select * into v_band
  from public.approval_policy_bands b
  where b.policy_id = v_policy.id
    and v_amount_base >= b.min_amount_base
    and (b.max_amount_base is null or v_amount_base < b.max_amount_base)
  limit 1;
  if not found then
    raise exception 'No approval threshold band covers this journal amount';
  end if;

  select count(*) into v_steps_count
  from public.approval_policy_steps where band_id = v_band.id;

  if v_steps_count = 0 then
    update public.journal_entries
    set approval_checked_at = now(),
        approved_at = now(),
        approved_by_profile_id = null,
        approval_request_id = null
    where id = p_entry_id;
    return null;
  end if;

  insert into public.approval_requests (
    transaction_type, target_id, branch_id, policy_id, policy_version,
    band_id, amount_base, submitted_by_profile_id, policy_snapshot
  )
  values (
    'journal_entry', p_entry_id, v_entry.branch_id,
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

  update public.journal_entries
  set approval_request_id = v_request_id,
      approval_checked_at = now(),
      approved_at = null,
      approved_by_profile_id = null
  where id = p_entry_id;

  return v_request_id;
end;
$$;

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
  if not private.has_permission('post_journals', v_entry.branch_id) then
    raise exception 'Insufficient permission to post journals';
  end if;

  if v_entry.source_type = 'financial_document' then
    select status into v_document_status
    from public.financial_documents
    where id = v_entry.source_id and journal_entry_id = v_entry.id;
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

create or replace function private.reverse_journal_entry(
  p_entry_id uuid,
  p_reversal_date date,
  p_description text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_original public.journal_entries%rowtype;
  v_period_id uuid;
  v_reversal_id uuid;
  v_request_id uuid;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required'; end if;

  select * into v_original from public.journal_entries
  where id=p_entry_id for update;
  if not found or v_original.status <> 'posted' then
    raise exception 'Only posted journal entries can be reversed';
  end if;
  if not private.has_permission('post_journals', v_original.branch_id) then
    raise exception 'Insufficient permission to reverse this journal';
  end if;
  if exists (select 1 from public.journal_entries where reversal_of_entry_id=p_entry_id) then
    raise exception 'This journal entry has already been reversed';
  end if;

  select fp.id into v_period_id
  from public.financial_periods fp
  join public.financial_years fy on fy.id=fp.financial_year_id
  where fp.status='open' and fy.status='open'
    and p_reversal_date between fp.start_date and fp.end_date
  limit 1;
  if v_period_id is null then
    raise exception 'No open financial period exists for the reversal date';
  end if;

  insert into public.journal_entries (
    period_id,branch_id,entry_date,description,reference,
    currency_code,exchange_rate_to_base,base_currency_code,
    source_type,source_id,reversal_of_entry_id,created_by_profile_id
  )
  values (
    v_period_id,v_original.branch_id,p_reversal_date,
    coalesce(p_description,'Reversal of journal ' || v_original.entry_number),
    v_original.reference,v_original.currency_code,
    v_original.exchange_rate_to_base,v_original.base_currency_code,
    'reversal',v_original.id,v_original.id,private.current_profile_id()
  )
  returning id into v_reversal_id;

  insert into public.journal_lines (
    journal_entry_id,line_number,account_id,fund_id,branch_id,
    profile_id,description,debit_amount,credit_amount,
    base_debit_amount,base_credit_amount
  )
  select v_reversal_id,line_number,account_id,fund_id,branch_id,
    profile_id,description,credit_amount,debit_amount,
    base_credit_amount,base_debit_amount
  from public.journal_lines
  where journal_entry_id=p_entry_id
  order by line_number;

  v_request_id := private.submit_journal_entry_for_approval(v_reversal_id);
  if v_request_id is null then
    perform private.post_journal_entry(v_reversal_id);
  end if;
  return v_reversal_id;
end;
$$;

revoke all on function private.submit_journal_entry_for_approval(uuid)
  from public, anon, authenticated;
grant execute on function private.submit_journal_entry_for_approval(uuid)
  to authenticated;

revoke all on function private.post_journal_entry(uuid)
  from public, anon, authenticated;
grant execute on function private.post_journal_entry(uuid)
  to authenticated;

revoke all on function private.reverse_journal_entry(uuid,date,text)
  from public, anon, authenticated;
grant execute on function private.reverse_journal_entry(uuid,date,text)
  to authenticated;

-- Budget submission must be performed by its creator or a finance manager.
create or replace function private.submit_budget_for_approval(p_budget_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_budget public.budgets%rowtype;
  v_profile_id uuid;
  v_base_currency char(3);
  v_policy public.approval_policies%rowtype;
  v_band public.approval_policy_bands%rowtype;
  v_request_id uuid;
  v_amount_base numeric(20,4);
  v_steps_count integer;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
  v_profile_id := private.current_profile_id();
  if v_profile_id is null then raise exception 'No member profile is linked to this account'; end if;

  select * into v_budget from public.budgets where id=p_budget_id for update;
  if not found then raise exception 'Budget not found'; end if;
  if v_budget.status not in ('draft','rejected') then
    raise exception 'Only draft or rejected budgets can be submitted';
  end if;
  if v_budget.submitted_by_profile_id is distinct from v_profile_id
     and not private.has_permission('manage_finances', v_budget.branch_id) then
    raise exception 'Insufficient permission to submit this budget';
  end if;

  select base_currency_code into v_base_currency
  from public.church_settings where id=1;
  if v_base_currency is null then raise exception 'Church settings must be configured before financial operations'; end if;
  if v_budget.base_currency_code <> v_base_currency then
    raise exception 'Budget base currency does not match church base currency';
  end if;
  if v_budget.currency_code = v_base_currency and v_budget.exchange_rate_to_base <> 1 then
    raise exception 'Exchange rate must be 1 for the base currency';
  end if;

  select round(coalesce(sum(bl.allocated_amount),0) * v_budget.exchange_rate_to_base,4)
  into v_amount_base
  from public.budget_lines bl where bl.budget_id=p_budget_id;
  if v_amount_base <= 0 then raise exception 'Budget must contain a positive total allocation'; end if;

  select * into v_policy
  from public.approval_policies p
  where p.transaction_type='budget' and p.is_active
    and p.effective_from <= current_date
    and (p.effective_to is null or p.effective_to >= current_date)
    and (p.branch_id = v_budget.branch_id or p.branch_id is null)
  order by (p.branch_id is not null) desc,p.version desc
  limit 1;
  if not found then raise exception 'No active budget approval policy is configured for this scope'; end if;

  select * into v_band from public.approval_policy_bands b
  where b.policy_id=v_policy.id
    and v_amount_base >= b.min_amount_base
    and (b.max_amount_base is null or v_amount_base < b.max_amount_base)
  limit 1;
  if not found then raise exception 'No approval threshold band covers this budget amount'; end if;

  select count(*) into v_steps_count from public.approval_policy_steps where band_id=v_band.id;
  if v_steps_count=0 then
    update public.budgets set status='approved',
      submitted_by_profile_id=v_profile_id,approved_at=now(),
      approved_by_profile_id=null,approval_request_id=null
    where id=p_budget_id;
    return null;
  end if;

  insert into public.approval_requests (
    transaction_type,target_id,branch_id,policy_id,policy_version,
    band_id,amount_base,submitted_by_profile_id,policy_snapshot
  )
  values (
    'budget',p_budget_id,v_budget.branch_id,v_policy.id,v_policy.version,
    v_band.id,v_amount_base,v_profile_id,
    jsonb_build_object(
      'policy_name',v_policy.name,
      'policy_version',v_policy.version,
      'min_amount_base',v_band.min_amount_base,
      'max_amount_base',v_band.max_amount_base,
      'steps',(
        select coalesce(jsonb_agg(jsonb_build_object(
          'step_number',s.step_number,
          'required_permission_key',s.required_permission_key,
          'required_approvals',s.required_approvals,
          'prohibit_submitter_approval',s.prohibit_submitter_approval
        ) order by s.step_number),'[]'::jsonb)
        from public.approval_policy_steps s where s.band_id=v_band.id
      )
    )
  )
  returning id into v_request_id;

  insert into public.approval_request_steps (
    approval_request_id,step_number,required_permission_key,
    required_approvals,prohibit_submitter_approval
  )
  select v_request_id,step_number,required_permission_key,
    required_approvals,prohibit_submitter_approval
  from public.approval_policy_steps where band_id=v_band.id
  order by step_number;

  update public.budgets set status='pending_approval',
    submitted_by_profile_id=v_profile_id,approval_request_id=v_request_id,
    approved_at=null,approved_by_profile_id=null
  where id=p_budget_id;
  return v_request_id;
end;
$$;

revoke all on function private.submit_budget_for_approval(uuid)
  from public, anon, authenticated;
grant execute on function private.submit_budget_for_approval(uuid)
  to authenticated;

commit;