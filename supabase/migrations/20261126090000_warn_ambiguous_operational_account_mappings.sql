begin;

-- FIN-INT-006: disclose duplicate operational-account mappings instead of
-- silently presenting a chart-account balance as an independently verified
-- bank/cash/mobile-money account balance.
create or replace function public.get_finance_scope_operational_balances(
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
  v_branch_district_id uuid;
  v_accounts jsonb;
  v_accounts_with_warnings jsonb;
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
      raise exception 'Insufficient permission to view church-wide operational balances';
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
      raise exception 'Insufficient permission to view operational balances in this district';
    end if;
  else
    if p_scope_id is null then
      raise exception 'Finance branch ID is required';
    end if;
    select b.district_id into v_branch_district_id
    from public.church_branches b
    where b.id = p_scope_id and b.status = 'active';
    if not found then
      raise exception 'Finance branch does not exist or is inactive';
    end if;
    if not (
      private.has_permission('view_finances', p_scope_id)
      or private.has_permission('manage_finances', p_scope_id)
      or private.has_permission('approve_finances', p_scope_id)
      or private.has_permission('post_journals', p_scope_id)
    ) then
      raise exception 'Insufficient permission to view operational balances in this branch';
    end if;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'financial_account_id', a.financial_account_id,
    'chart_account_id', a.chart_account_id,
    'branch_id', a.branch_id,
    'district_id', a.district_id,
    'account_name', a.account_name,
    'is_active', a.is_active,
    'operational_account_type', a.operational_account_type,
    'currency_code', a.currency_code,
    'provider_name', a.provider_name,
    'account_reference', a.account_reference,
    'chart_account_code', a.chart_account_code,
    'chart_account_name', a.chart_account_name,
    'normal_balance', a.normal_balance,
    'base_currency_code', a.base_currency_code,
    'debit_total', a.debit_total,
    'credit_total', a.credit_total,
    'balance', a.balance
  ) order by a.operational_account_type, a.account_name, a.base_currency_code), '[]'::jsonb)
  into v_accounts
  from (
    select
      fa.id as financial_account_id,
      fa.chart_account_id,
      fa.branch_id,
      fa.district_id,
      fa.name as account_name,
      fa.is_active,
      fa.account_type as operational_account_type,
      fa.currency_code,
      fa.provider_name,
      fa.account_reference,
      coa.code as chart_account_code,
      coa.name as chart_account_name,
      coa.normal_balance,
      cs.base_currency_code,
      coalesce(sum(case when je.id is not null then jl.base_debit_amount else 0 end), 0)::numeric as debit_total,
      coalesce(sum(case when je.id is not null then jl.base_credit_amount else 0 end), 0)::numeric as credit_total,
      case when coa.normal_balance = 'credit'
        then coalesce(sum(case when je.id is not null then jl.base_credit_amount - jl.base_debit_amount else 0 end), 0)
        else coalesce(sum(case when je.id is not null then jl.base_debit_amount - jl.base_credit_amount else 0 end), 0)
      end::numeric as balance
    from public.financial_accounts fa
    join public.chart_of_accounts coa on coa.id = fa.chart_account_id
    left join public.journal_lines jl on jl.account_id = fa.chart_account_id
    cross join public.church_settings cs
    left join public.journal_entries je
      on je.id = jl.journal_entry_id
      and je.status = 'posted'
      and je.currency_code = fa.currency_code
      and (
        p_scope_type = 'church'
        or (p_scope_type = 'district' and je.district_id = p_scope_id)
        or (p_scope_type = 'branch' and je.branch_id = p_scope_id)
      )
      and (fa.branch_id is null or je.branch_id = fa.branch_id)
      and (fa.district_id is null or je.district_id = fa.district_id)
      and not exists (
        select 1
        from public.financial_accounts more_specific
        where more_specific.chart_account_id = fa.chart_account_id
          and more_specific.currency_code = fa.currency_code
          and more_specific.account_type = fa.account_type
          and (
            (fa.branch_id is null and more_specific.branch_id is not null and more_specific.branch_id = je.branch_id)
            or (
              fa.branch_id is null
              and fa.district_id is null
              and more_specific.branch_id is null
              and more_specific.district_id = je.district_id
            )
            or (
              more_specific.branch_id is not distinct from fa.branch_id
              and more_specific.district_id is not distinct from fa.district_id
              and more_specific.id < fa.id
            )
          )
      )
    where fa.account_type in ('cash', 'bank', 'mobile_money')
      and coa.account_type = 'asset'
      and (
        p_scope_type = 'church'
        or (p_scope_type = 'district' and (
          fa.district_id = p_scope_id
          or (fa.branch_id is null and fa.district_id is null)
          or (fa.branch_id is not null and fa.district_id = p_scope_id)
        ))
        or (p_scope_type = 'branch' and (
          fa.branch_id = p_scope_id
          or (fa.branch_id is null and (fa.district_id is null or fa.district_id = v_branch_district_id))
        ))
      )
    group by fa.id, fa.chart_account_id, fa.branch_id, fa.district_id,
      fa.name, fa.is_active, fa.account_type, fa.currency_code, fa.provider_name,
      fa.account_reference, coa.code, coa.name, coa.normal_balance,
      cs.base_currency_code
  ) a;

  -- Count mappings only within the same exact ownership scope. Inherited
  -- parent mappings are intentionally not considered duplicates of a
  -- branch/district-specific mapping.
  select coalesce(jsonb_agg(
    item || jsonb_build_object(
      'mapping_count', duplicate_check.mapping_count,
      'mapping_is_ambiguous', duplicate_check.mapping_count > 1,
      'mapping_warning', case
        when duplicate_check.mapping_count > 1
          then 'Multiple operational accounts share this chart account, currency and ownership scope. The ledger balance cannot be reliably split between them.'
        else null
      end
    )
    order by item->>'operational_account_type', item->>'account_name', item->>'base_currency_code'
  ), '[]'::jsonb)
  into v_accounts_with_warnings
  from jsonb_array_elements(v_accounts) item
  cross join lateral (
    select count(*)::integer as mapping_count
    from public.financial_accounts fa
    where fa.chart_account_id = (item->>'chart_account_id')::uuid
      and fa.currency_code = item->>'currency_code'
      and fa.account_type = item->>'operational_account_type'
      and fa.branch_id is not distinct from nullif(item->>'branch_id', '')::uuid
      and fa.district_id is not distinct from nullif(item->>'district_id', '')::uuid
  ) duplicate_check;

  return jsonb_build_object(
    'actor_profile_id', v_profile_id,
    'scope_type', p_scope_type,
    'scope_id', p_scope_id,
    'accounts', coalesce(v_accounts_with_warnings, '[]'::jsonb)
  );
end;
$$;

revoke all on function public.get_finance_scope_operational_balances(text, uuid)
  from public, anon, service_role;
grant execute on function public.get_finance_scope_operational_balances(text, uuid)
  to authenticated;

comment on function public.get_finance_scope_operational_balances(text, uuid) is
  'Returns authorized cash, bank and mobile-money balances from posted journal lines, with explicit warnings for duplicate operational mappings.';
commit;
