
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

  if v_doc.created_by_profile_id <> v_profile_id
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

  if v_doc.financial_account_id is not null then
    if not exists (
      select 1 from public.financial_accounts fa
      where fa.id = v_doc.financial_account_id
        and fa.is_active
        and fa.currency_code = v_doc.currency_code
        and (fa.branch_id is null or fa.branch_id is not distinct from v_doc.branch_id)
    ) then
      raise exception 'Financial account is inactive or incompatible with document branch/currency';
    end if;
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
    update public.financial_documents
    set status = 'approved',
        approved_at = now(),
        approved_by_profile_id = null,
        approval_request_id = null
    where id = p_document_id;
    return null;
  end if;

  select * into v_band
  from public.approval_policy_bands b
  where b.policy_id = v_policy.id
    and v_amount_base >= b.min_amount_base
    and (b.max_amount_base is null or v_amount_base < b.max_amount_base)
  limit 1;

  if not found then
    update public.financial_documents
    set status = 'approved',
        approved_at = now(),
        approved_by_profile_id = null,
        approval_request_id = null
    where id = p_document_id;
    return null;
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
        from public.approval_policy_steps s
        where s.band_id = v_band.id
      )
    )
  )
  returning id into v_request_id;

  insert into public.approval_request_steps (
    approval_request_id, step_number, required_permission_key,
    required_approvals, prohibit_submitter_approval
  )
  select
    v_request_id, step_number, required_permission_key,
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

  if not private.has_permission(v_step.required_permission_key, v_request.branch_id) then
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

create or replace function private.attach_journal_to_financial_document(
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

  if not private.has_permission('manage_finances', v_doc.branch_id) then
    raise exception 'Insufficient permission to link a journal';
  end if;

  select * into v_entry
  from public.journal_entries
  where id = p_journal_entry_id
  for update;
  if not found or v_entry.status <> 'draft' then
    raise exception 'Journal entry must exist and remain draft';
  end if;

  if v_doc.journal_entry_id is not null then
    raise exception 'Financial document is already linked to a journal';
  end if;

  if v_entry.currency_code <> v_doc.currency_code
     or v_entry.base_currency_code <> v_doc.base_currency_code
     or v_entry.exchange_rate_to_base <> v_doc.exchange_rate_to_base
     or v_entry.branch_id is distinct from v_doc.branch_id then
    raise exception 'Journal and financial document currency, rate or branch do not match';
  end if;

  update public.journal_entries
  set source_type = 'financial_document',
      source_id = p_document_id
  where id = p_journal_entry_id;

  update public.financial_documents
  set journal_entry_id = p_journal_entry_id
  where id = p_document_id;
end;
$$;

-- Replace the posting routine to enforce approval and document linkage.
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
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  select * into v_entry
  from public.journal_entries
  where id = p_entry_id
  for update;
  if not found then raise exception 'Journal entry not found'; end if;
  if v_entry.status <> 'draft' then
    raise exception 'Only draft journal entries can be posted';
  end if;
  if not private.has_permission('post_journals', v_entry.branch_id) then
    raise exception 'Insufficient permission to post journals';
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
  end if;

  if v_entry.source_type = 'financial_document' then
    select status into v_document_status
    from public.financial_documents
    where id = v_entry.source_id
      and journal_entry_id = v_entry.id;
    if v_document_status is distinct from 'approved' then
      raise exception 'Linked financial document must be approved before posting';
    end if;
  end if;

  select * into v_period
  from public.financial_periods
  where id = v_entry.period_id;
  if not found or v_period.status <> 'open' then
    raise exception 'Journal entry period is not open';
  end if;
  if v_entry.entry_date < v_period.start_date
     or v_entry.entry_date > v_period.end_date then
    raise exception 'Journal entry date is outside its financial period';
  end if;

  select * into v_year
  from public.financial_years
  where id = v_period.financial_year_id;
  if not found or v_year.status <> 'open' then
    raise exception 'Financial year is not open';
  end if;

  select base_currency_code into v_base_currency
  from public.church_settings where id = 1;
  if v_base_currency is null then
    raise exception 'Complete church settings before posting financial entries';
  end if;
  if v_entry.base_currency_code <> v_base_currency then
    raise exception 'Journal base currency does not match church base currency';
  end if;
  if v_entry.currency_code = v_entry.base_currency_code
     and v_entry.exchange_rate_to_base <> 1 then
    raise exception 'Exchange rate must be 1 for the base currency';
  end if;

  if exists (
    select 1
    from public.journal_lines jl
    join public.chart_of_accounts coa on coa.id = jl.account_id
    where jl.journal_entry_id = p_entry_id and not coa.is_active
  ) then
    raise exception 'Journal contains an inactive chart-of-accounts entry';
  end if;

  if v_entry.branch_id is not null and exists (
    select 1 from public.journal_lines jl
    where jl.journal_entry_id = p_entry_id
      and jl.branch_id is not null
      and jl.branch_id <> v_entry.branch_id
  ) then
    raise exception 'Journal line branch does not match journal branch';
  end if;

  select count(*),
         coalesce(sum(debit_amount),0),
         coalesce(sum(credit_amount),0),
         coalesce(sum(base_debit_amount),0),
         coalesce(sum(base_credit_amount),0)
  into v_line_count, v_debits, v_credits, v_base_debits, v_base_credits
  from public.journal_lines
  where journal_entry_id = p_entry_id;

  if v_line_count < 2 then raise exception 'A journal entry must contain at least two lines'; end if;
  if v_debits <> v_credits then raise exception 'Journal is not balanced in transaction currency'; end if;
  if v_base_debits <> v_base_credits then raise exception 'Journal is not balanced in base currency'; end if;

  if exists (
    select 1 from public.journal_lines jl
    where jl.journal_entry_id = p_entry_id
      and (
        (jl.debit_amount > 0 and
          jl.base_debit_amount <> round(jl.debit_amount * v_entry.exchange_rate_to_base, 4))
        or
        (jl.credit_amount > 0 and
          jl.base_credit_amount <> round(jl.credit_amount * v_entry.exchange_rate_to_base, 4))
      )
  ) then
    raise exception 'Journal line base amount does not match the recorded exchange rate';
  end if;

  update public.journal_entries
  set status = 'posted', posted_at = now()
  where id = p_entry_id;

  if v_entry.source_type = 'financial_document' then
    update public.financial_documents
    set status = 'posted', updated_at = now()
    where id = v_entry.source_id
      and journal_entry_id = p_entry_id
      and status = 'approved';
    if not found then
      raise exception 'Could not finalize linked financial document';
    end if;
  end if;
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
  if tg_op = 'UPDATE' and old.status = 'posted' then
    raise exception 'Posted financial documents are immutable';
  end if;

  if new.status = 'posted' then
    if new.journal_entry_id is null then
      raise exception 'Posted financial document must have a journal entry';
    end if;
    select * into v_entry
    from public.journal_entries
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
    select * into v_entry
    from public.journal_entries
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

create trigger trg_validate_financial_document_journal
before insert or update on public.financial_documents
for each row execute function private.validate_financial_document_journal_link();

revoke all on function private.submit_financial_document_for_approval(uuid)
  from public, anon, authenticated;
revoke all on function private.record_approval_decision(uuid, text, text)
  from public, anon, authenticated;
revoke all on function private.attach_journal_to_financial_document(uuid, uuid)
  from public, anon, authenticated;
revoke all on function private.post_journal_entry(uuid)
  from public, anon, authenticated;

grant execute on function private.submit_financial_document_for_approval(uuid)
  to authenticated;
grant execute on function private.record_approval_decision(uuid, text, text)
  to authenticated;
grant execute on function private.attach_journal_to_financial_document(uuid, uuid)
  to authenticated;
grant execute on function private.post_journal_entry(uuid)
  to authenticated;

commit;