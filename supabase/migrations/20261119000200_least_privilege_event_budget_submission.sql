begin;

-- Event budget submission is a narrowly scoped event-management capability.
-- Grant it only to roles already allowed to manage events; it does not grant
-- finance configuration, approval, payment, or journal permissions.
insert into public.permissions (key, module, description)
values (
  'submit_event_budgets',
  'events',
  'Submit event budgets for approval and view own submissions'
)
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_id)
select event_roles.role_id, p.id
from (
  select distinct rp.role_id
  from public.role_permissions rp
  join public.permissions event_permission on event_permission.id = rp.permission_id
  where event_permission.key = 'manage_events'
) event_roles
join public.permissions p on p.key = 'submit_event_budgets'
on conflict do nothing;

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
  if not private.has_permission('manage_events', v_branch_id)
     or not private.has_permission('submit_event_budgets', v_branch_id) then
    raise exception 'Insufficient permission to submit an event budget for this event';
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
    select 1 from public.currencies c where c.code = p_currency_code and c.is_active
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

create or replace function public.get_event_budget_submission_options(p_event_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_event public.events%rowtype;
  v_base_currency char(3);
  v_options jsonb;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  if private.current_profile_id() is null then
    raise exception 'No member profile is linked to this account';
  end if;

  select * into v_event
  from public.events
  where id = p_event_id;
  if not found then raise exception 'Event does not exist'; end if;

  if not private.has_permission('manage_events', v_event.branch_id)
     or not private.has_permission('submit_event_budgets', v_event.branch_id) then
    raise exception 'Insufficient permission to prepare an event budget for this event';
  end if;

  select base_currency_code into v_base_currency
  from public.church_settings
  where id = 1;

  select jsonb_build_object(
    'currencies', (
      select coalesce(jsonb_agg(c.code order by c.code), '[]'::jsonb)
      from public.currencies c
      where c.is_active
    ),
    'baseCurrencyCode', v_base_currency,
    'periods', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', fp.id,
        'financial_year_id', fp.financial_year_id,
        'name', fp.name,
        'start_date', fp.start_date,
        'end_date', fp.end_date,
        'status', fp.status,
        'year_status', fy.status
      ) order by fp.start_date), '[]'::jsonb)
      from public.financial_periods fp
      join public.financial_years fy on fy.id = fp.financial_year_id
      where fp.status = 'open' and fy.status = 'open'
    ),
    'chartAccounts', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', coa.id,
        'code', coa.code,
        'name', coa.name,
        'account_type', coa.account_type,
        'is_control_account', coa.is_control_account,
        'is_active', coa.is_active
      ) order by coa.code), '[]'::jsonb)
      from public.chart_of_accounts coa
      where coa.is_active and coa.account_type = 'expense'
        and not coa.is_control_account
    ),
    'funds', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', f.id,
        'name', f.name,
        'code', f.code,
        'fund_type', f.fund_type,
        'is_default', f.is_default,
        'is_active', f.is_active
      ) order by f.name), '[]'::jsonb)
      from public.funds f
      where f.is_active
    )
  ) into v_options;

  return v_options;
end;
$$;

create or replace function public.get_my_event_budgets(p_event_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid;
  v_event public.events%rowtype;
  v_budgets jsonb;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  v_profile_id := private.current_profile_id();
  if v_profile_id is null then
    raise exception 'No member profile is linked to this account';
  end if;

  select * into v_event
  from public.events
  where id = p_event_id;
  if not found then raise exception 'Event does not exist'; end if;

  if not private.has_permission('manage_events', v_event.branch_id)
     or not private.has_permission('submit_event_budgets', v_event.branch_id) then
    raise exception 'Insufficient permission to view event budget submissions for this event';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', b.id,
    'name', b.name,
    'budget_type', b.budget_type,
    'branch_id', b.branch_id,
    'event_id', b.event_id,
    'period_id', b.period_id,
    'currency_code', b.currency_code,
    'exchange_rate_to_base', b.exchange_rate_to_base,
    'base_currency_code', b.base_currency_code,
    'status', b.status,
    'created_at', b.created_at,
    'total_budget', (
      select coalesce(sum(bl.allocated_amount), 0)
      from public.budget_lines bl
      where bl.budget_id = b.id
    ),
    'lines', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', bl.id,
        'account_id', bl.account_id,
        'fund_id', bl.fund_id,
        'description', bl.description,
        'allocated_amount', bl.allocated_amount
      ) order by bl.created_at, bl.id), '[]'::jsonb)
      from public.budget_lines bl
      where bl.budget_id = b.id
    ),
    'approval_status', ar.status,
    'approval_steps', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'step_number', ars.step_number,
        'required_approvals', ars.required_approvals,
        'status', ars.status,
        'approvals_received', (
          select count(*)
          from public.approval_decisions ad
          where ad.approval_request_step_id = ars.id
            and ad.decision = 'approved'
        )
      ) order by ars.step_number), '[]'::jsonb)
      from public.approval_request_steps ars
      where ars.approval_request_id = b.approval_request_id
    )
  ) order by b.created_at desc), '[]'::jsonb)
  into v_budgets
  from public.budgets b
  left join public.approval_requests ar
    on ar.id = b.approval_request_id
   and ar.transaction_type = 'budget'
   and ar.target_id = b.id
  where b.budget_type = 'event'
    and b.event_id = p_event_id
    and b.branch_id = v_event.branch_id
    and b.submitted_by_profile_id = v_profile_id;

  return jsonb_build_object('budgets', v_budgets);
end;
$$;

revoke all on function public.get_event_budget_submission_options(uuid)
  from public, anon, service_role;
revoke all on function public.get_my_event_budgets(uuid)
  from public, anon, service_role;
grant execute on function public.get_event_budget_submission_options(uuid)
  to authenticated;
grant execute on function public.get_my_event_budgets(uuid)
  to authenticated;

commit;
