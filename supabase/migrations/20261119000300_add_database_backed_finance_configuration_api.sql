begin;

-- Finance configuration is exposed through narrow authenticated RPCs. The
-- underlying tables remain non-writable to client roles; all writes are
-- validated here and execute atomically under the caller's permission scope.

create or replace function public.get_finance_configuration(
  p_branch_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid;
  v_configuration jsonb;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  v_profile_id := private.current_profile_id();
  if v_profile_id is null then
    raise exception 'No active member profile is linked to this account';
  end if;

  if p_branch_id is null then
    if not (
      private.has_permission('view_finances', null)
      or private.has_permission('manage_finances', null)
      or private.has_permission('approve_finances', null)
    ) then
      raise exception 'Insufficient permission to view church-wide finance configuration';
    end if;
  elsif not (
    private.has_permission('view_finances', p_branch_id)
    or private.has_permission('manage_finances', p_branch_id)
    or private.has_permission('approve_finances', p_branch_id)
  ) then
    raise exception 'Insufficient permission to view finance configuration in this branch';
  end if;

  select jsonb_build_object(
    'currencies', coalesce((
      select jsonb_agg(c.code order by c.code)
      from public.currencies c
      where c.is_active
    ), '[]'::jsonb),
    'baseCurrencyCode', (
      select cs.base_currency_code
      from public.church_settings cs
      where cs.id = 1
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
        'name', fa.name,
        'account_type', fa.account_type,
        'currency_code', fa.currency_code,
        'provider_name', fa.provider_name,
        'account_reference', fa.account_reference,
        'is_active', fa.is_active
      ) order by fa.name, fa.id)
      from public.financial_accounts fa
      where fa.branch_id is not distinct from p_branch_id
    ), '[]'::jsonb),
    'funds', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', f.id, 'name', f.name, 'code', f.code,
        'description', f.description, 'fund_type', f.fund_type,
        'is_default', f.is_default, 'is_active', f.is_active
      ) order by f.code, f.id)
      from public.funds f
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
        'id', ap.id, 'name', ap.name, 'transaction_type', ap.transaction_type,
        'branch_id', ap.branch_id, 'version', ap.version,
        'effective_from', ap.effective_from, 'effective_to', ap.effective_to,
        'is_active', ap.is_active
      ) order by ap.transaction_type, ap.branch_id nulls first, ap.version desc)
      from public.approval_policies ap
      where ap.transaction_type in ('financial_document', 'budget')
        and ap.branch_id is not distinct from p_branch_id
        or (
          ap.transaction_type in ('financial_document', 'budget')
          and p_branch_id is not null
          and ap.branch_id is null
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
        and (ap.branch_id is not distinct from p_branch_id
          or (p_branch_id is not null and ap.branch_id is null))
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
        and (ap.branch_id is not distinct from p_branch_id
          or (p_branch_id is not null and ap.branch_id is null))
    ), '[]'::jsonb)
  )
  into v_configuration;

  return v_configuration;
end;
$$;

create or replace function public.save_finance_configuration(
  p_branch_id uuid,
  p_configuration jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid;
  v_item jsonb;
  v_id uuid;
  v_parent_id uuid;
  v_code text;
  v_name text;
  v_type text;
  v_normal_balance text;
  v_branch_id uuid;
  v_currency char(3);
  v_base_currency char(3);
  v_year_number integer;
  v_start_date date;
  v_end_date date;
  v_status text;
  v_policy_id uuid;
  v_band_id uuid;
  v_policy_type text;
  v_version integer;
  v_step_number integer;
  v_permission_key text;
  v_required_approvals integer;
  v_existing jsonb;
  v_new_policy_ids uuid[] := array[]::uuid[];
  v_new_band_ids uuid[] := array[]::uuid[];
  v_has_new_currency boolean;
  v_has_new_chart_account boolean;
  v_has_new_fund boolean;
  v_has_new_year boolean;
  v_has_new_period boolean;
  v_has_new_financial_account boolean;
  v_has_new_policy boolean;
  v_can_manage_global boolean;
  v_can_manage_periods boolean;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  v_profile_id := private.current_profile_id();
  if v_profile_id is null then
    raise exception 'No active member profile is linked to this account';
  end if;

  if p_configuration is null or jsonb_typeof(p_configuration) <> 'object'
    or jsonb_typeof(p_configuration->'currencies') is distinct from 'array'
    or jsonb_typeof(p_configuration->'chartAccounts') is distinct from 'array'
    or jsonb_typeof(p_configuration->'financialAccounts') is distinct from 'array'
    or jsonb_typeof(p_configuration->'funds') is distinct from 'array'
    or jsonb_typeof(p_configuration->'financialYears') is distinct from 'array'
    or jsonb_typeof(p_configuration->'periods') is distinct from 'array'
    or jsonb_typeof(p_configuration->'approvalPolicies') is distinct from 'array'
    or jsonb_typeof(p_configuration->'approvalPolicyBands') is distinct from 'array'
    or jsonb_typeof(p_configuration->'approvalPolicySteps') is distinct from 'array' then
    raise exception 'Finance configuration payload is incomplete';
  end if;

  if p_branch_id is not null and not exists (
    select 1 from public.church_branches b where b.id = p_branch_id
  ) then
    raise exception 'Finance configuration branch does not exist';
  end if;

  v_can_manage_global :=
    private.has_permission('manage_finances', null)
    or private.has_permission('manage_chart_of_accounts', null);
  v_can_manage_periods :=
    private.has_permission('manage_finances', null)
    or private.has_permission('manage_financial_periods', null);

  select exists (
    select 1
    from jsonb_array_elements(p_configuration->'currencies') item
    where not exists (
      select 1 from public.currencies c
      where c.code = upper(trim(item #>> '{}')) and c.is_active
    )
  ) into v_has_new_currency;

  select exists (
    select 1
    from jsonb_array_elements(p_configuration->'chartAccounts') item
    where not exists (
      select 1 from public.chart_of_accounts coa
      where coa.id = (item->>'id')::uuid
    )
  ) into v_has_new_chart_account;

  select exists (
    select 1
    from jsonb_array_elements(p_configuration->'funds') item
    where not exists (
      select 1 from public.funds f
      where f.id = (item->>'id')::uuid
    )
  ) into v_has_new_fund;

  select exists (
    select 1
    from jsonb_array_elements(p_configuration->'financialYears') item
    where not exists (
      select 1 from public.financial_years fy
      where fy.id = (item->>'id')::uuid
    )
  ) into v_has_new_year;

  select exists (
    select 1
    from jsonb_array_elements(p_configuration->'periods') item
    where not exists (
      select 1 from public.financial_periods fp
      where fp.id = (item->>'id')::uuid
    )
  ) into v_has_new_period;

  select exists (
    select 1
    from jsonb_array_elements(p_configuration->'financialAccounts') item
    where not exists (
      select 1 from public.financial_accounts fa
      where fa.id = (item->>'id')::uuid
    )
  ) into v_has_new_financial_account;

  select exists (
    select 1
    from jsonb_array_elements(p_configuration->'approvalPolicies') item
    where not exists (
      select 1 from public.approval_policies ap
      where ap.id = (item->>'id')::uuid
    )
  ) into v_has_new_policy;

  if (v_has_new_currency or v_has_new_chart_account or v_has_new_fund
      or upper(coalesce(p_configuration->>'baseCurrencyCode', '')) is distinct from
        (select upper(cs.base_currency_code::text) from public.church_settings cs where cs.id = 1))
    and not v_can_manage_global then
    raise exception 'Church-wide currency, chart-of-accounts and fund changes require church-level finance configuration permission';
  end if;

  if (v_has_new_year or v_has_new_period) and not v_can_manage_periods then
    raise exception 'Financial years and periods require church-level financial-period management permission';
  end if;

  if v_has_new_financial_account and not private.has_permission('manage_finances', p_branch_id) then
    raise exception 'Insufficient permission to manage financial accounts in this branch';
  end if;

  -- Currencies are a shared church reference list. The UI supplies ISO-style
  -- three-letter codes; for a newly introduced code the code is used as its
  -- initial display name until richer currency metadata is maintained.
  for v_item in select value from jsonb_array_elements(p_configuration->'currencies')
  loop
    v_code := upper(trim(v_item #>> '{}'));
    if v_code is null or v_code !~ '^[A-Z]{3}$' then
      raise exception 'Currency codes must be unique three-letter codes';
    end if;
    insert into public.currencies (code, name, is_active)
    values (v_code, v_code, true)
    on conflict (code) do nothing;
  end loop;

  v_base_currency := upper(trim(coalesce(p_configuration->>'baseCurrencyCode', '')));
  if v_base_currency !~ '^[A-Z]{3}$' or not exists (
    select 1 from public.currencies c
    where c.code = v_base_currency and c.is_active
  ) then
    raise exception 'Base currency must be an active supported currency';
  end if;

  if exists (
    select 1 from public.journal_entries je
    where je.status = 'posted'
      and je.base_currency_code <> v_base_currency
  ) and v_base_currency is distinct from (
    select cs.base_currency_code from public.church_settings cs where cs.id = 1
  ) then
    raise exception 'Base currency cannot change after posted accounting entries exist';
  end if;

  update public.church_settings
  set base_currency_code = v_base_currency,
      updated_at = now()
  where id = 1;
  if not found then
    raise exception 'Church settings must be initialized before finance configuration can be saved';
  end if;

  -- Chart-of-accounts rows are append-only through this API. Existing account
  -- definitions are immutable here so referenced ledger history cannot drift.
  for v_item in select value from jsonb_array_elements(p_configuration->'chartAccounts')
  loop
    v_id := (v_item->>'id')::uuid;
    v_parent_id := nullif(v_item->>'parent_account_id', '')::uuid;
    v_code := trim(coalesce(v_item->>'code', ''));
    v_name := trim(coalesce(v_item->>'name', ''));
    v_type := v_item->>'account_type';
    v_normal_balance := coalesce(v_item->>'normal_balance',
      case when v_type in ('asset', 'expense') then 'debit' else 'credit' end);

    if v_id is null or v_code = '' or v_name = '' or v_type is null
      or v_type not in ('asset','liability','equity','income','expense')
      or v_normal_balance not in ('debit','credit') then
      raise exception 'Every chart account requires a UUID, code, name and valid account type and normal balance';
    end if;

    select to_jsonb(coa) into v_existing
    from public.chart_of_accounts coa where coa.id = v_id;

    if v_existing is not null then
      if v_existing->>'code' is distinct from v_code
        or v_existing->>'name' is distinct from v_name
        or v_existing->>'account_type' is distinct from v_type
        or v_existing->>'normal_balance' is distinct from v_normal_balance
        or (v_existing->>'parent_account_id') is distinct from (v_parent_id::text)
        or coalesce(v_existing->>'description','') is distinct from coalesce(v_item->>'description','')
        or (v_existing->>'is_active')::boolean is distinct from coalesce((v_item->>'is_active')::boolean, true)
        or (v_existing->>'is_control_account')::boolean is distinct from coalesce((v_item->>'is_control_account')::boolean, false)
        or (v_existing->>'is_system')::boolean is distinct from coalesce((v_item->>'is_system')::boolean, false) then
        raise exception 'Existing chart account definitions are immutable through finance configuration';
      end if;
    else
      if coalesce((v_item->>'is_control_account')::boolean, false)
        or coalesce((v_item->>'is_system')::boolean, false) then
        raise exception 'New chart accounts cannot be marked as system or control accounts';
      end if;
      insert into public.chart_of_accounts (
        id, parent_account_id, code, name, account_type, normal_balance,
        description, is_control_account, is_system, is_active
      ) values (
        v_id, v_parent_id, v_code, v_name, v_type, v_normal_balance,
        nullif(trim(v_item->>'description'), ''), false, false,
        coalesce((v_item->>'is_active')::boolean, true)
      );
    end if;
  end loop;

  -- Funds are church-wide and append-only in this first database API.
  for v_item in select value from jsonb_array_elements(p_configuration->'funds')
  loop
    v_id := (v_item->>'id')::uuid;
    v_name := trim(coalesce(v_item->>'name', ''));
    v_code := upper(trim(coalesce(v_item->>'code', '')));
    v_type := coalesce(v_item->>'fund_type', 'general');

    if v_id is null or v_name = '' or v_code = '' or v_type is null
      or v_type not in ('general','designated','restricted') then
      raise exception 'Every fund requires a UUID, code, name and valid fund type';
    end if;

    select to_jsonb(f) into v_existing from public.funds f where f.id = v_id;
    if v_existing is not null then
      if v_existing->>'name' is distinct from v_name
        or v_existing->>'code' is distinct from v_code
        or coalesce(v_existing->>'description','') is distinct from coalesce(v_item->>'description','')
        or v_existing->>'fund_type' is distinct from v_type
        or (v_existing->>'is_default')::boolean is distinct from coalesce((v_item->>'is_default')::boolean, false)
        or (v_existing->>'is_active')::boolean is distinct from coalesce((v_item->>'is_active')::boolean, true) then
        raise exception 'Existing fund definitions are immutable through finance configuration';
      end if;
    else
      insert into public.funds (id, name, code, description, fund_type, is_default, is_active)
      values (
        v_id, v_name, v_code, nullif(trim(v_item->>'description'), ''),
        v_type, coalesce((v_item->>'is_default')::boolean, false),
        coalesce((v_item->>'is_active')::boolean, true)
      );
    end if;
  end loop;

  -- Financial years and periods are church-wide. New rows are created open;
  -- closing is deliberately left to a dedicated period-closing workflow.
  for v_item in select value from jsonb_array_elements(p_configuration->'financialYears')
  loop
    v_id := (v_item->>'id')::uuid;
    v_year_number := (v_item->>'year_number')::integer;
    v_start_date := (v_item->>'start_date')::date;
    v_end_date := (v_item->>'end_date')::date;
    v_status := coalesce(v_item->>'status', 'open');

    if v_id is null or v_year_number is null or v_start_date is null or v_end_date is null
      or v_year_number not between 1900 and 9998
      or v_start_date <> make_date(v_year_number, 1, 1)
      or v_end_date <> make_date(v_year_number, 12, 31)
      or v_status not in ('open','closed') then
      raise exception 'Financial years must use calendar-year dates and a valid status';
    end if;

    select to_jsonb(fy) into v_existing from public.financial_years fy where fy.id = v_id;
    if v_existing is not null then
      if (v_existing->>'year_number')::integer is distinct from v_year_number
        or (v_existing->>'start_date')::date is distinct from v_start_date
        or (v_existing->>'end_date')::date is distinct from v_end_date
        or v_existing->>'status' is distinct from v_status then
        raise exception 'Existing financial years are immutable through finance configuration';
      end if;
    else
      if v_status <> 'open' then
        raise exception 'New financial years must be opened through the dedicated financial-year workflow';
      end if;
      insert into public.financial_years (id, year_number, start_date, end_date, status)
      values (v_id, v_year_number, v_start_date, v_end_date, 'open');
    end if;
  end loop;

  for v_item in select value from jsonb_array_elements(p_configuration->'periods')
  loop
    v_id := (v_item->>'id')::uuid;
    v_parent_id := (v_item->>'financial_year_id')::uuid;
    v_name := trim(coalesce(v_item->>'name', ''));
    v_start_date := (v_item->>'start_date')::date;
    v_end_date := (v_item->>'end_date')::date;
    v_status := coalesce(v_item->>'status', 'open');

    if v_id is null or v_parent_id is null or v_name = ''
      or v_start_date is null or v_end_date is null or v_start_date > v_end_date or v_status not in ('open','closed') then
      raise exception 'Financial periods require a year, name, valid date range and status';
    end if;

    if not exists (
      select 1 from public.financial_years fy
      where fy.id = v_parent_id
        and v_start_date >= fy.start_date
        and v_end_date <= fy.end_date
    ) then
      raise exception 'Financial period must fit within its financial year';
    end if;

    select to_jsonb(fp) into v_existing from public.financial_periods fp where fp.id = v_id;
    if v_existing is not null then
      if (v_existing->>'financial_year_id')::uuid is distinct from v_parent_id
        or v_existing->>'name' is distinct from v_name
        or (v_existing->>'start_date')::date is distinct from v_start_date
        or (v_existing->>'end_date')::date is distinct from v_end_date
        or v_existing->>'status' is distinct from v_status then
        raise exception 'Existing financial periods are immutable through finance configuration';
      end if;
    else
      if v_status <> 'open' then
        raise exception 'New financial periods must be opened through the dedicated period workflow';
      end if;
      insert into public.financial_periods (
        id, financial_year_id, name, start_date, end_date, status
      ) values (v_id, v_parent_id, v_name, v_start_date, v_end_date, 'open');
    end if;
  end loop;

  -- Operational accounts are branch-scoped and can only be created in the
  -- exact branch for which the caller holds manage_finances.
  for v_item in select value from jsonb_array_elements(p_configuration->'financialAccounts')
  loop
    v_id := (v_item->>'id')::uuid;
    v_parent_id := (v_item->>'chart_account_id')::uuid;
    v_branch_id := nullif(v_item->>'branch_id', '')::uuid;
    v_name := trim(coalesce(v_item->>'name', ''));
    v_type := v_item->>'account_type';
    v_currency := upper(trim(coalesce(v_item->>'currency_code', '')));

    if v_id is null or v_parent_id is null or v_name = '' or v_type is null
      or v_currency is null or v_branch_id is distinct from p_branch_id
      or v_type not in ('cash','bank','mobile_money','clearing')
      or not exists (select 1 from public.currencies c where c.code = v_currency and c.is_active)
      or not exists (
        select 1 from public.chart_of_accounts coa
        where coa.id = v_parent_id and coa.is_active
          and coa.account_type = 'asset' and not coa.is_control_account
      ) then
      raise exception 'Financial accounts must match the requested branch and use an active currency and active asset chart account';
    end if;

    select to_jsonb(fa) into v_existing from public.financial_accounts fa where fa.id = v_id;
    if v_existing is not null then
      if (v_existing->>'chart_account_id')::uuid is distinct from v_parent_id
        or (v_existing->>'branch_id')::uuid is distinct from v_branch_id
        or v_existing->>'name' is distinct from v_name
        or v_existing->>'account_type' is distinct from v_type
        or upper(v_existing->>'currency_code') is distinct from v_currency
        or coalesce(v_existing->>'provider_name','') is distinct from coalesce(v_item->>'provider_name','')
        or coalesce(v_existing->>'account_reference','') is distinct from coalesce(v_item->>'account_reference','')
        or (v_existing->>'is_active')::boolean is distinct from coalesce((v_item->>'is_active')::boolean, true) then
        raise exception 'Existing financial account definitions are immutable through finance configuration';
      end if;
    else
      insert into public.financial_accounts (
        id, chart_account_id, branch_id, name, account_type, currency_code,
        provider_name, account_reference, is_active
      ) values (
        v_id, v_parent_id, v_branch_id, v_name, v_type, v_currency,
        nullif(trim(v_item->>'provider_name'), ''),
        nullif(trim(v_item->>'account_reference'), ''),
        coalesce((v_item->>'is_active')::boolean, true)
      );
    end if;
  end loop;

  -- Approval policies are versioned and immutable once created. New bands and
  -- steps may only accompany a new policy in this same atomic save.
  for v_item in select value from jsonb_array_elements(p_configuration->'approvalPolicies')
  loop
    v_id := (v_item->>'id')::uuid;
    v_name := trim(coalesce(v_item->>'name', ''));
    v_policy_type := v_item->>'transaction_type';
    v_branch_id := nullif(v_item->>'branch_id', '')::uuid;
    v_version := (v_item->>'version')::integer;

    if v_id is null or v_name = '' or v_policy_type is null
      or v_policy_type not in ('financial_document','budget')
      or v_version is null or v_version < 1
      or nullif(v_item->>'effective_from','') is null
      or (v_item->>'effective_to') is not null
        and (v_item->>'effective_to')::date < (v_item->>'effective_from')::date
      or (v_branch_id is distinct from p_branch_id and v_branch_id is not null) then
      raise exception 'Approval policies require a valid name, scope, transaction type, version and effective dates';
    end if;

    if v_branch_id is null then
      if not private.has_permission('manage_finances', null) then
        raise exception 'Church-wide approval policies require church-level finance management permission';
      end if;
    elsif not private.has_permission('manage_finances', v_branch_id) then
      raise exception 'Insufficient permission to manage approval policies in this branch';
    end if;

    select to_jsonb(ap) into v_existing from public.approval_policies ap where ap.id = v_id;
    if v_existing is not null then
      if v_existing->>'name' is distinct from v_name
        or v_existing->>'transaction_type' is distinct from v_policy_type
        or (v_existing->>'branch_id')::uuid is distinct from v_branch_id
        or (v_existing->>'version')::integer is distinct from v_version
        or (v_existing->>'effective_from')::date is distinct from (v_item->>'effective_from')::date
        or (v_existing->>'effective_to')::date is distinct from nullif(v_item->>'effective_to','')::date
        or (v_existing->>'is_active')::boolean is distinct from coalesce((v_item->>'is_active')::boolean, true) then
        raise exception 'Approval policy versions are immutable; create a new version instead';
      end if;
    else
      insert into public.approval_policies (
        id, name, transaction_type, branch_id, version, effective_from,
        effective_to, is_active, created_by_profile_id
      ) values (
        v_id, v_name, v_policy_type, v_branch_id, v_version,
        (v_item->>'effective_from')::date,
        nullif(v_item->>'effective_to','')::date,
        coalesce((v_item->>'is_active')::boolean, true), v_profile_id
      );
      v_new_policy_ids := array_append(v_new_policy_ids, v_id);
    end if;
  end loop;

  for v_item in select value from jsonb_array_elements(p_configuration->'approvalPolicyBands')
  loop
    v_id := (v_item->>'id')::uuid;
    v_policy_id := (v_item->>'policy_id')::uuid;

    if v_id is null or v_policy_id is null
      or (v_item->>'min_amount_base')::numeric < 0
      or (v_item->>'max_amount_base') is not null
        and (v_item->>'max_amount_base')::numeric <= (v_item->>'min_amount_base')::numeric then
      raise exception 'Approval amount bands require a valid policy and non-overlapping amount range';
    end if;

    select to_jsonb(band) into v_existing
    from public.approval_policy_bands band where band.id = v_id;
    if v_existing is not null then
      if (v_existing->>'policy_id')::uuid is distinct from v_policy_id
        or (v_existing->>'min_amount_base')::numeric is distinct from (v_item->>'min_amount_base')::numeric
        or (v_existing->>'max_amount_base')::numeric is distinct from nullif(v_item->>'max_amount_base','')::numeric then
        raise exception 'Existing approval amount bands are immutable';
      end if;
    else
      if not (v_policy_id = any(v_new_policy_ids)) then
        raise exception 'New approval amount bands must belong to a policy created in this save';
      end if;
      insert into public.approval_policy_bands (
        id, policy_id, min_amount_base, max_amount_base
      ) values (
        v_id, v_policy_id, (v_item->>'min_amount_base')::numeric,
        nullif(v_item->>'max_amount_base','')::numeric
      );
      v_new_band_ids := array_append(v_new_band_ids, v_id);
    end if;
  end loop;

  for v_item in select value from jsonb_array_elements(p_configuration->'approvalPolicySteps')
  loop
    v_id := (v_item->>'id')::uuid;
    v_band_id := (v_item->>'band_id')::uuid;
    v_step_number := (v_item->>'step_number')::integer;
    v_permission_key := v_item->>'required_permission_key';
    v_required_approvals := (v_item->>'required_approvals')::integer;

    if v_id is null or v_band_id is null or v_step_number is null or v_step_number < 1
      or v_required_approvals is null or v_required_approvals < 1
      or v_permission_key is null or v_permission_key not in ('approve_finances','manage_finances','post_journals')
      or not exists (select 1 from public.permissions p where p.key = v_permission_key) then
      raise exception 'Approval steps require a valid band, order, permission and positive approval count';
    end if;

    select to_jsonb(step) into v_existing
    from public.approval_policy_steps step where step.id = v_id;
    if v_existing is not null then
      if (v_existing->>'band_id')::uuid is distinct from v_band_id
        or (v_existing->>'step_number')::integer is distinct from v_step_number
        or v_existing->>'required_permission_key' is distinct from v_permission_key
        or (v_existing->>'required_approvals')::integer is distinct from v_required_approvals
        or (v_existing->>'prohibit_submitter_approval')::boolean is distinct from coalesce((v_item->>'prohibit_submitter_approval')::boolean, true) then
        raise exception 'Existing approval policy steps are immutable';
      end if;
    else
      if not (v_band_id = any(v_new_band_ids)) then
        raise exception 'New approval steps must belong to a new amount band created in this save';
      end if;
      insert into public.approval_policy_steps (
        id, band_id, step_number, required_permission_key,
        required_approvals, prohibit_submitter_approval
      ) values (
        v_id, v_band_id, v_step_number, v_permission_key,
        v_required_approvals,
        coalesce((v_item->>'prohibit_submitter_approval')::boolean, true)
      );
    end if;
  end loop;

  -- Every new policy needs at least one amount band; event budgets also need
  -- at least one approval step, matching their submission RPC contract.
  if exists (
    select 1 from unnest(v_new_policy_ids) new_policy_id
    where not exists (
      select 1 from public.approval_policy_bands band
      where band.policy_id = new_policy_id
    )
  ) then
    raise exception 'Every new approval policy requires at least one amount band';
  end if;

  if exists (
    select 1
    from unnest(v_new_policy_ids) new_policy_id
    join public.approval_policies ap on ap.id = new_policy_id
    where ap.transaction_type = 'budget'
      and not exists (
        select 1
        from public.approval_policy_bands band
        join public.approval_policy_steps step on step.band_id = band.id
        where band.policy_id = ap.id
      )
  ) then
    raise exception 'Event budget approval policies require at least one approval step';
  end if;

  if exists (
    select 1
    from unnest(v_new_band_ids) new_band_id
    join public.approval_policy_steps step on step.band_id = new_band_id
    group by new_band_id
    having min(step.step_number) <> 1 or max(step.step_number) <> count(*)
  ) then
    raise exception 'Approval policy steps must be ordered consecutively from step one';
  end if;

  return jsonb_build_object('saved', true);
end;
$$;

comment on function public.get_finance_configuration(uuid) is
  'Returns finance configuration within the authenticated church or branch scope.';
comment on function public.save_finance_configuration(uuid, jsonb) is
  'Atomically creates validated finance configuration records through permission-scoped RPCs; existing accounting and approval definitions are immutable.';

revoke all on function public.get_finance_configuration(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.save_finance_configuration(uuid, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.get_finance_configuration(uuid)
  to authenticated;
grant execute on function public.save_finance_configuration(uuid, jsonb)
  to authenticated;

commit;
