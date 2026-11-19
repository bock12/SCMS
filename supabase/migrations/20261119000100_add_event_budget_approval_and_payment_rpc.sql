begin;

-- Event budgets become durable approval targets and can fund one canonical
-- payment document. The link is unique and created atomically with payment.
alter table public.financial_documents
  add column source_budget_id uuid
    references public.budgets(id) on delete restrict,
  add constraint financial_document_budget_source_type check (
    source_budget_id is null or document_type = 'payment'
  );

create unique index uq_financial_document_one_payment_per_budget
  on public.financial_documents (source_budget_id)
  where source_budget_id is not null;

create or replace function public.submit_event_budget_for_approval(
  p_event_id uuid,
  p_period_id uuid,
  p_name text,
  p_currency_code char(3),
  p_exchange_rate_to_base numeric,
  p_lines jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid;
  v_branch_id uuid;
  v_event public.events%rowtype;
  v_period public.financial_periods%rowtype;
  v_base_currency char(3);
  v_policy public.approval_policies%rowtype;
  v_band public.approval_policy_bands%rowtype;
  v_budget_id uuid;
  v_request_id uuid;
  v_total numeric(20,4);
  v_steps_count integer;
  v_line_count integer;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  v_profile_id := private.current_profile_id();
  if v_profile_id is null then
    raise exception 'No member profile is linked to this account';
  end if;

  if p_event_id is null or p_period_id is null
     or p_name is null or length(trim(p_name)) = 0
     or p_currency_code is null
     or p_exchange_rate_to_base is null or p_exchange_rate_to_base <= 0
     or jsonb_typeof(p_lines) <> 'array' then
    raise exception 'Event, period, name, currency, exchange rate and budget lines are required';
  end if;

  select * into v_event
  from public.events
  where id = p_event_id
  for share;
  if not found then raise exception 'Event does not exist'; end if;

  v_branch_id := v_event.branch_id;
  if not private.has_permission('manage_finances', v_branch_id) then
    raise exception 'Insufficient permission to submit an event budget for this branch';
  end if;

  select fp.* into v_period
  from public.financial_periods fp
  join public.financial_years fy on fy.id = fp.financial_year_id
  where fp.id = p_period_id
    and fp.status = 'open'
    and fy.status = 'open';
  if not found then raise exception 'Selected financial period and year must be open'; end if;

  select base_currency_code into v_base_currency
  from public.church_settings where id = 1;
  if v_base_currency is null then
    raise exception 'Church settings must be configured before financial operations';
  end if;
  if not exists (
    select 1 from public.currencies c where c.code = p_currency_code
  ) then
    raise exception 'A valid event budget currency is required';
  end if;
  if p_currency_code = v_base_currency and p_exchange_rate_to_base <> 1 then
    raise exception 'Exchange rate must be 1 for the base currency';
  end if;

  select count(*), coalesce(sum(line.allocated_amount), 0)
  into v_line_count, v_total
  from jsonb_to_recordset(p_lines) as line(
    account_id uuid,
    fund_id uuid,
    description text,
    allocated_amount numeric
  );

  if v_line_count = 0 or v_total <= 0 then
    raise exception 'An event budget requires at least one positive budget line';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_lines) as line(
      account_id uuid,
      fund_id uuid,
      description text,
      allocated_amount numeric
    )
    left join public.chart_of_accounts coa
      on coa.id = line.account_id
     and coa.is_active
     and not coa.is_control_account
     and coa.account_type = 'expense'
    left join public.funds f
      on f.id = line.fund_id and f.is_active
    where line.allocated_amount is null
       or line.allocated_amount < 0
       or coa.id is null
       or (line.fund_id is not null and f.id is null)
  ) then
    raise exception 'Budget lines must use active expense accounts and active funds with non-negative amounts';
  end if;

  select * into v_policy
  from public.approval_policies p
  where p.transaction_type = 'budget'
    and p.is_active
    and p.effective_from <= current_date
    and (p.effective_to is null or p.effective_to >= current_date)
    and (p.branch_id = v_branch_id or p.branch_id is null)
  order by (p.branch_id is not null) desc, p.version desc
  limit 1;
  if not found then raise exception 'No active event budget approval policy is configured'; end if;

  select * into v_band
  from public.approval_policy_bands b
  where b.policy_id = v_policy.id
    and v_total * p_exchange_rate_to_base >= b.min_amount_base
    and (b.max_amount_base is null or v_total * p_exchange_rate_to_base < b.max_amount_base)
  limit 1;
  if not found then raise exception 'No event budget approval threshold band covers this amount'; end if;

  select count(*) into v_steps_count
  from public.approval_policy_steps s where s.band_id = v_band.id;
  if v_steps_count = 0 then
    raise exception 'Event budget approval policy must contain at least one approval step';
  end if;

  insert into public.budgets (
    name, budget_type, branch_id, event_id, period_id, currency_code,
    exchange_rate_to_base, base_currency_code, status, submitted_by_profile_id
  )
  values (
    trim(p_name), 'event', v_branch_id, p_event_id, p_period_id, p_currency_code,
    p_exchange_rate_to_base, v_base_currency, 'draft', v_profile_id
  )
  returning id into v_budget_id;

  insert into public.budget_lines (
    budget_id, account_id, fund_id, description, allocated_amount
  )
  select
    v_budget_id, line.account_id, line.fund_id,
    nullif(trim(coalesce(line.description, '')), ''),
    line.allocated_amount
  from jsonb_to_recordset(p_lines) as line(
    account_id uuid,
    fund_id uuid,
    description text,
    allocated_amount numeric
  );

  insert into public.approval_requests (
    transaction_type, target_id, branch_id, policy_id, policy_version,
    band_id, amount_base, submitted_by_profile_id, policy_snapshot
  )
  values (
    'budget', v_budget_id, v_branch_id, v_policy.id, v_policy.version,
    v_band.id, round(v_total * p_exchange_rate_to_base, 4), v_profile_id,
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
  select
    v_request_id, s.step_number, s.required_permission_key,
    s.required_approvals, s.prohibit_submitter_approval
  from public.approval_policy_steps s
  where s.band_id = v_band.id
  order by s.step_number;

  update public.budgets
  set status = 'pending_approval',
      approval_request_id = v_request_id,
      updated_at = now()
  where id = v_budget_id;

  return jsonb_build_object(
    'budget_id', v_budget_id,
    'approval_request_id', v_request_id,
    'status', 'pending_approval',
    'total_budget', v_total,
    'currency_code', p_currency_code
  );
end;
$$;

create or replace function public.decide_event_budget_approval(
  p_request_step_id uuid,
  p_decision text,
  p_comments text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_step public.approval_request_steps%rowtype;
  v_request public.approval_requests%rowtype;
  v_status text;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  select * into v_step
  from public.approval_request_steps
  where id = p_request_step_id;
  if not found then raise exception 'Approval step not found'; end if;

  select * into v_request
  from public.approval_requests
  where id = v_step.approval_request_id;
  if not found or v_request.transaction_type <> 'budget' then
    raise exception 'Approval step is not an event budget approval';
  end if;

  if not exists (
    select 1 from public.budgets b
    where b.id = v_request.target_id and b.budget_type = 'event'
      and b.approval_request_id = v_request.id
  ) then
    raise exception 'Approval request does not target a submitted event budget';
  end if;

  v_status := private.record_approval_decision(
    p_request_step_id, p_decision, p_comments
  );

  return jsonb_build_object('approval_status', v_status);
end;
$$;

create or replace function public.create_event_budget_payment(
  p_budget_id uuid,
  p_transaction_date date,
  p_profile_id uuid,
  p_party_name text,
  p_amount numeric,
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
  v_budget public.budgets%rowtype;
  v_total numeric(20,4);
  v_transaction jsonb;
  v_document_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  v_profile_id := private.current_profile_id();
  if v_profile_id is null then
    raise exception 'No member profile is linked to this account';
  end if;

  select * into v_budget
  from public.budgets
  where id = p_budget_id and budget_type = 'event'
  for update;
  if not found then raise exception 'Approved event budget not found'; end if;

  if not private.has_permission('manage_finances', v_budget.branch_id) then
    raise exception 'Insufficient permission to create a payment for this event budget';
  end if;
  if v_budget.status <> 'approved'
     or v_budget.approval_request_id is null
     or v_budget.approved_at is null
     or not exists (
       select 1 from public.approval_requests ar
       where ar.id = v_budget.approval_request_id
         and ar.transaction_type = 'budget'
         and ar.target_id = v_budget.id
         and ar.status = 'approved'
     ) then
    raise exception 'Only an approved event budget can be paid';
  end if;
  if exists (
    select 1 from public.financial_documents d
    where d.source_budget_id = v_budget.id
  ) then
    raise exception 'An event budget payment is already linked to this budget';
  end if;

  select coalesce(sum(bl.allocated_amount), 0)
  into v_total
  from public.budget_lines bl
  where bl.budget_id = v_budget.id;

  if p_amount is null or p_amount <= 0 or p_amount > v_total then
    raise exception 'Payment amount must be positive and cannot exceed the approved event budget';
  end if;
  if p_transaction_date is null
     or p_exchange_rate_to_base is null
     or p_exchange_rate_to_base <> v_budget.exchange_rate_to_base then
    raise exception 'Payment date and the approved budget exchange rate are required';
  end if;
  if p_category_account_id is null or not exists (
    select 1 from public.budget_lines bl
    where bl.budget_id = v_budget.id
      and bl.account_id = p_category_account_id
      and bl.fund_id is not distinct from p_fund_id
  ) then
    raise exception 'Payment expense account and fund must match an approved event budget line';
  end if;

  v_transaction := public.create_financial_document_transaction(
    'payment', p_transaction_date, v_budget.branch_id, p_profile_id,
    p_party_name, p_amount, v_budget.currency_code, p_payment_method,
    p_financial_account_id, p_category_account_id, p_fund_id,
    p_external_reference, p_description, p_exchange_rate_to_base
  );

  v_document_id := (v_transaction->>'document_id')::uuid;

  update public.financial_documents
  set source_budget_id = v_budget.id,
      updated_at = now()
  where id = v_document_id
    and document_type = 'payment'
    and branch_id is not distinct from v_budget.branch_id;

  if not found then
    raise exception 'Canonical payment could not be linked to the approved event budget';
  end if;

  return v_transaction || jsonb_build_object(
    'source_budget_id', v_budget.id
  );
end;
$$;

revoke all on function public.submit_event_budget_for_approval(uuid, uuid, text, char, numeric, jsonb)
  from public, anon, service_role;
revoke all on function public.decide_event_budget_approval(uuid, text, text)
  from public, anon, service_role;
revoke all on function public.create_event_budget_payment(uuid, date, uuid, text, numeric, text, uuid, uuid, uuid, text, text, numeric)
  from public, anon, service_role;

grant execute on function public.submit_event_budget_for_approval(uuid, uuid, text, char, numeric, jsonb)
  to authenticated;
grant execute on function public.decide_event_budget_approval(uuid, text, text)
  to authenticated;
grant execute on function public.create_event_budget_payment(uuid, date, uuid, text, numeric, text, uuid, uuid, uuid, text, text, numeric)
  to authenticated;

commit;
