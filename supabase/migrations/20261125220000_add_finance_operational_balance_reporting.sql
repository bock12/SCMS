begin;

-- FIN-INT-006: authorized, posted-ledger balances for configured operational
-- cash, bank and mobile-money accounts. Clearing accounts are reported in the
-- dedicated inter-branch reconciliation section, not as liquid funds.

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
    'financial_account_id', account_row.financial_account_id,
    'chart_account_id', account_row.chart_account_id,
    'branch_id', account_row.branch_id,
    'district_id', account_row.district_id,
    'account_name', account_row.account_name,
    'operational_account_type', account_row.operational_account_type,
    'currency_code', account_row.currency_code,
    'provider_name', account_row.provider_name,
    'account_reference', account_row.account_reference,
    'chart_account_code', account_row.chart_account_code,
    'chart_account_name', account_row.chart_account_name,
    'normal_balance', account_row.normal_balance,
    'base_currency_code', account_row.base_currency_code,
    'debit_total', account_row.debit_total,
    'credit_total', account_row.credit_total,
    'balance', account_row.balance
  ) order by account_row.operational_account_type, account_row.account_name, account_row.base_currency_code), '[]'::jsonb)
  into v_accounts
  from (
    select
      fa.id as financial_account_id,
      fa.chart_account_id,
      fa.branch_id,
      fa.district_id,
      fa.name as account_name,
      fa.account_type as operational_account_type,
      fa.currency_code,
      fa.provider_name,
      fa.account_reference,
      coa.code as chart_account_code,
      coa.name as chart_account_name,
      coa.normal_balance,
      je.base_currency_code,
      coalesce(sum(jl.base_debit_amount), 0)::numeric as debit_total,
      coalesce(sum(jl.base_credit_amount), 0)::numeric as credit_total,
      case when coa.normal_balance = 'credit'
        then coalesce(sum(jl.base_credit_amount - jl.base_debit_amount), 0)
        else coalesce(sum(jl.base_debit_amount - jl.base_credit_amount), 0)
      end::numeric as balance
    from public.financial_accounts fa
    join public.chart_of_accounts coa on coa.id = fa.chart_account_id
    left join public.journal_lines jl on jl.account_id = fa.chart_account_id
    left join public.journal_entries je
      on je.id = jl.journal_entry_id
      and je.status = 'posted'
      and je.currency_code = fa.currency_code
      and (
        p_scope_type = 'church'
        or (p_scope_type = 'district' and je.district_id = p_scope_id)
        or (p_scope_type = 'branch' and je.branch_id = p_scope_id)
      )
    where fa.is_active
      and fa.account_type in ('cash', 'bank', 'mobile_money')
      and coa.is_active
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
      fa.name, fa.account_type, fa.currency_code, fa.provider_name,
      fa.account_reference, coa.code, coa.name, coa.normal_balance,
      je.base_currency_code
  ) account_row;

  return jsonb_build_object(
    'actor_profile_id', v_profile_id,
    'scope_type', p_scope_type,
    'scope_id', p_scope_id,
    'accounts', v_accounts
  );
end;
$$;

revoke all on function public.get_finance_scope_operational_balances(text, uuid)
  from public, anon, service_role;
grant execute on function public.get_finance_scope_operational_balances(text, uuid)
  to authenticated;

comment on function public.get_finance_scope_operational_balances(text, uuid) is
  'Returns authorized cash, bank and mobile-money account balances calculated only from posted journal lines. Includes inherited operational account ownership in branch and district scopes.';

commit;
