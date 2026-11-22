begin;

-- Read-only configuration API for the three organizational ownership levels.
-- It intentionally returns records owned by the requested scope only. Clients
-- can request additional ancestor scopes separately when a workflow requires
-- inherited accounts or approval policies.
create or replace function public.get_finance_scope_configuration(
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
  v_configuration jsonb;
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
      raise exception 'Insufficient permission to view church-wide finance configuration';
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
      raise exception 'Insufficient permission to view finance configuration in this district';
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
      raise exception 'Insufficient permission to view finance configuration in this branch';
    end if;
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
      ) order by fa.name, fa.id)
      from public.financial_accounts fa
      where
        (p_scope_type = 'church' and fa.branch_id is null and fa.district_id is null)
        or (p_scope_type = 'district' and fa.branch_id is null and fa.district_id = p_scope_id)
        or (p_scope_type = 'branch' and fa.branch_id = p_scope_id)
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
      ) order by f.code, f.id)
      from public.funds f
      where
        (p_scope_type = 'church' and f.branch_id is null and f.district_id is null)
        or (p_scope_type = 'district' and f.branch_id is null and f.district_id = p_scope_id)
        or (p_scope_type = 'branch' and f.branch_id = p_scope_id)
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
      ) order by ap.transaction_type, ap.version desc)
      from public.approval_policies ap
      where ap.transaction_type in ('financial_document', 'budget')
        and (
          (p_scope_type = 'church' and ap.branch_id is null and ap.district_id is null)
          or (p_scope_type = 'district' and ap.branch_id is null and ap.district_id = p_scope_id)
          or (p_scope_type = 'branch' and ap.branch_id = p_scope_id)
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
          (p_scope_type = 'church' and ap.branch_id is null and ap.district_id is null)
          or (p_scope_type = 'district' and ap.branch_id is null and ap.district_id = p_scope_id)
          or (p_scope_type = 'branch' and ap.branch_id = p_scope_id)
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
          (p_scope_type = 'church' and ap.branch_id is null and ap.district_id is null)
          or (p_scope_type = 'district' and ap.branch_id is null and ap.district_id = p_scope_id)
          or (p_scope_type = 'branch' and ap.branch_id = p_scope_id)
        )
    ), '[]'::jsonb)
  )
  into v_configuration;

  return v_configuration;
end;
$$;

comment on function public.get_finance_scope_configuration(text, uuid) is
  'Returns finance configuration for exactly one authorized church, district or branch ownership scope.';

revoke all on function public.get_finance_scope_configuration(text, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_finance_scope_configuration(text, uuid)
  to authenticated;

commit;
