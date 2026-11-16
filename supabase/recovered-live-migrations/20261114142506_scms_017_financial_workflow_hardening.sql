
begin;

create or replace function private.submit_financial_document_for_approval(
  p_document_id uuid
)
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
     and not private.has_permission('manage_finances', v_doc.branch_id) then
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
      and (fa.branch_id is null or fa.branch_id is not distinct from v_doc.branch_id)
  ) then
    raise exception 'Financial account is inactive or incompatible with document branch/currency';
  end if;

  v_amount_base := round(v_doc.amount * v_doc.exchange_rate_to_base, 4);

  select * into v_policy
  from public.approval_policies p
  where p.transaction_type = 'financial_document'
    and p.is_active
    and p.effective_from <= current_date
    and (p.effective_to is null or p.effective_to >= current_date)
    and (p.branch_id = v_doc.branch_id or p.branch_id is null)
  order by (p.branch_id is not null) desc, p.version desc
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
    transaction_type, target_id, branch_id, policy_id, policy_version,
    band_id, amount_base, submitted_by_profile_id, policy_snapshot
  )
  values (
    'financial_document', p_document_id, v_doc.branch_id,
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
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;
  v_profile_id := private.current_profile_id();
  if v_profile_id is null then
    raise exception 'No member profile is linked to this account';
  end if;

  select * into v_budget
  from public.budgets where id = p_budget_id for update;
  if not found then raise exception 'Budget not found'; end if;
  if v_budget.status not in ('draft','rejected') then
    raise exception 'Only draft or rejected budgets can be submitted';
  end if;
  if v_budget.submitted_by_profile_id is not null
     and v_budget.submitted_by_profile_id <> v_profile_id
     and not private.has_permission('manage_finances', v_budget.branch_id) then
    raise exception 'Insufficient permission to submit this budget';
  end if;

  select base_currency_code into v_base_currency
  from public.church_settings where id = 1;
  if v_base_currency is null then
    raise exception 'Church settings must be configured before financial operations';
  end if;
  if v_budget.base_currency_code <> v_base_currency then
    raise exception 'Budget base currency does not match church base currency';
  end if;
  if v_budget.currency_code = v_base_currency and v_budget.exchange_rate_to_base <> 1 then
    raise exception 'Exchange rate must be 1 for the base currency';
  end if;

  select coalesce(sum(bl.allocated_amount),0) * v_budget.exchange_rate_to_base
  into v_amount_base
  from public.budget_lines bl
  where bl.budget_id = p_budget_id;
  v_amount_base := round(v_amount_base, 4);
  if v_amount_base <= 0 then
    raise exception 'Budget must contain a positive total allocation';
  end if;

  select * into v_policy
  from public.approval_policies p
  where p.transaction_type = 'budget'
    and p.is_active
    and p.effective_from <= current_date
    and (p.effective_to is null or p.effective_to >= current_date)
    and (p.branch_id = v_budget.branch_id or p.branch_id is null)
  order by (p.branch_id is not null) desc, p.version desc
  limit 1;
  if not found then
    raise exception 'No active budget approval policy is configured for this scope';
  end if;

  select * into v_band
  from public.approval_policy_bands b
  where b.policy_id = v_policy.id
    and v_amount_base >= b.min_amount_base
    and (b.max_amount_base is null or v_amount_base < b.max_amount_base)
  limit 1;
  if not found then
    raise exception 'No approval threshold band covers this budget amount';
  end if;

  select count(*) into v_steps_count
  from public.approval_policy_steps where band_id = v_band.id;

  if v_steps_count = 0 then
    update public.budgets
    set status = 'approved',
        submitted_by_profile_id = v_profile_id,
        approved_at = now(),
        approved_by_profile_id = null,
        approval_request_id = null
    where id = p_budget_id;
    return null;
  end if;

  insert into public.approval_requests (
    transaction_type, target_id, branch_id, policy_id, policy_version,
    band_id, amount_base, submitted_by_profile_id, policy_snapshot
  )
  values (
    'budget', p_budget_id, v_budget.branch_id,
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

  update public.budgets
  set status = 'pending_approval',
      submitted_by_profile_id = v_profile_id,
      approval_request_id = v_request_id,
      approved_at = null,
      approved_by_profile_id = null
  where id = p_budget_id;

  return v_request_id;
end;
$$;

create or replace function private.validate_financial_document_journal_link()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_entry public.journal_entries%rowtype;
begin
  if tg_op = 'DELETE' then
    if old.status = 'posted' then
      raise exception 'Posted financial documents cannot be deleted';
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' and old.status = 'posted' then
    raise exception 'Posted financial documents are immutable';
  end if;

  if new.status = 'posted' then
    if new.journal_entry_id is null then
      raise exception 'Posted financial document must have a journal entry';
    end if;
    select * into v_entry from public.journal_entries
    where id = new.journal_entry_id;
    if not found or v_entry.status <> 'posted' then
      raise exception 'Financial document can only be posted with a posted journal';
    end if;
    if v_entry.source_type <> 'financial_document'
       or v_entry.source_id is distinct from new.id then
      raise exception 'Journal entry source does not match financial document';
    end if;
  end if;

  if new.journal_entry_id is not null then
    select * into v_entry from public.journal_entries
    where id = new.journal_entry_id;
    if not found
       or v_entry.source_type <> 'financial_document'
       or v_entry.source_id is distinct from new.id then
      raise exception 'Journal entry is not linked to this financial document';
    end if;
  end if;

  return new;
end;
$$;

drop trigger trg_validate_financial_document_journal on public.financial_documents;
create trigger trg_validate_financial_document_journal
before insert or update or delete on public.financial_documents
for each row execute function private.validate_financial_document_journal_link();

create or replace function private.prevent_budget_line_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_budget_id uuid;
  v_status text;
begin
  if tg_op = 'DELETE' then
    v_budget_id := old.budget_id;
  else
    v_budget_id := new.budget_id;
  end if;

  select status into v_status
  from public.budgets where id = v_budget_id;

  if v_status not in ('draft','rejected') then
    raise exception 'Budget lines can only be changed while the budget is draft or rejected';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger trg_budget_lines_draft_only
before insert or update or delete on public.budget_lines
for each row execute function private.prevent_budget_line_mutation();

revoke all on function private.submit_budget_for_approval(uuid)
  from public, anon, authenticated;
grant execute on function private.submit_budget_for_approval(uuid)
  to authenticated;

commit;