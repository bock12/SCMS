begin;

-- Scoped operational finance resources are created through this API only.
-- Shared chart-of-accounts, currency and financial-period configuration remains
-- under the existing church-wide configuration workflow.
create or replace function public.save_finance_scope_resources(
  p_scope_type text,
  p_scope_id uuid,
  p_financial_accounts jsonb,
  p_funds jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid;
  v_district_id uuid;
  v_item jsonb;
  v_id uuid;
  v_chart_account_id uuid;
  v_branch_id uuid;
  v_name text;
  v_code text;
  v_type text;
  v_currency text;
  v_existing jsonb;
  v_accounts_saved integer := 0;
  v_funds_saved integer := 0;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  v_profile_id := private.current_profile_id();
  if v_profile_id is null then
    raise exception 'No active member profile is linked to this account';
  end if;

  if p_scope_type not in ('church', 'district', 'branch') then
    raise exception 'Finance scope must be church, district or branch';
  end if;
  if jsonb_typeof(p_financial_accounts) is distinct from 'array'
     or jsonb_typeof(p_funds) is distinct from 'array' then
    raise exception 'Financial accounts and funds must be supplied as arrays';
  end if;

  if p_scope_type = 'church' then
    if p_scope_id is not null then
      raise exception 'Church-wide finance scope must not include a scope ID';
    end if;
    if not private.has_permission('manage_finances', null) then
      raise exception 'Insufficient permission to manage church-wide finance resources';
    end if;
  elsif p_scope_type = 'district' then
    if p_scope_id is null or not exists (
      select 1 from public.districts d where d.id = p_scope_id
    ) then
      raise exception 'Finance district does not exist';
    end if;
    if not private.has_permission_for_district('manage_finances', p_scope_id) then
      raise exception 'Insufficient permission to manage finance resources in this district';
    end if;
    v_district_id := p_scope_id;
  else
    if p_scope_id is null then
      raise exception 'Finance branch is required';
    end if;
    select b.district_id into v_district_id
    from public.church_branches b where b.id = p_scope_id;
    if not found then
      raise exception 'Finance branch does not exist';
    end if;
    if not private.has_permission('manage_finances', p_scope_id) then
      raise exception 'Insufficient permission to manage finance resources in this branch';
    end if;
    v_branch_id := p_scope_id;
  end if;

  -- Existing resource definitions are immutable through this API. This
  -- prevents account identity or fund ownership being rewritten after use.
  for v_item in select value from jsonb_array_elements(p_financial_accounts)
  loop
    v_id := nullif(v_item->>'id', '')::uuid;
    v_chart_account_id := nullif(v_item->>'chart_account_id', '')::uuid;
    v_name := trim(coalesce(v_item->>'name', ''));
    v_type := v_item->>'account_type';
    v_currency := upper(trim(coalesce(v_item->>'currency_code', '')));
    if v_id is null or v_chart_account_id is null or v_name = ''
       or v_type is null or v_type not in ('cash','bank','mobile_money','clearing')
       or v_currency !~ '^[A-Z]{3}$' then
      raise exception 'Financial account requires a UUID, asset chart account, name, account type and currency';
    end if;

    if not exists (
      select 1 from public.currencies c
      where c.code = v_currency and c.is_active
    ) or not exists (
      select 1 from public.chart_of_accounts coa
      where coa.id = v_chart_account_id and coa.is_active
        and coa.account_type = 'asset' and not coa.is_control_account
    ) then
      raise exception 'Financial account requires an active currency and active non-control asset chart account';
    end if;

    if p_scope_type = 'church' then
      if nullif(v_item->>'branch_id','') is not null
         or nullif(v_item->>'district_id','') is not null then
        raise exception 'Church-wide financial accounts must not specify branch or district ownership';
      end if;
    elsif p_scope_type = 'district' then
      if nullif(v_item->>'branch_id','') is not null
         or nullif(v_item->>'district_id','')::uuid is distinct from v_district_id then
        raise exception 'District financial accounts must belong to the requested district and no branch';
      end if;
    else
      if nullif(v_item->>'branch_id','')::uuid is distinct from v_branch_id
         or (nullif(v_item->>'district_id','') is not null
             and nullif(v_item->>'district_id','')::uuid is distinct from v_district_id) then
        raise exception 'Branch financial accounts must belong to the requested branch and its district';
      end if;
    end if;

    select to_jsonb(fa) into v_existing
    from public.financial_accounts fa where fa.id = v_id;
    if v_existing is not null then
      if (v_existing->>'chart_account_id')::uuid is distinct from v_chart_account_id
         or (v_existing->>'branch_id')::uuid is distinct from v_branch_id
         or (v_existing->>'district_id')::uuid is distinct from v_district_id
         or v_existing->>'name' is distinct from v_name
         or v_existing->>'account_type' is distinct from v_type
         or upper(v_existing->>'currency_code') is distinct from v_currency
         or coalesce(v_existing->>'provider_name','') is distinct from coalesce(v_item->>'provider_name','')
         or coalesce(v_existing->>'account_reference','') is distinct from coalesce(v_item->>'account_reference','')
         or (v_existing->>'is_active')::boolean is distinct from coalesce((v_item->>'is_active')::boolean,true) then
        raise exception 'Existing financial account definitions are immutable';
      end if;
    else
      insert into public.financial_accounts (
        id, chart_account_id, branch_id, district_id, name, account_type,
        currency_code, provider_name, account_reference, is_active
      ) values (
        v_id, v_chart_account_id, v_branch_id, v_district_id, v_name, v_type,
        v_currency, nullif(trim(v_item->>'provider_name'), ''),
        nullif(trim(v_item->>'account_reference'), ''),
        coalesce((v_item->>'is_active')::boolean, true)
      );
      v_accounts_saved := v_accounts_saved + 1;
    end if;
  end loop;

  for v_item in select value from jsonb_array_elements(p_funds)
  loop
    v_id := nullif(v_item->>'id', '')::uuid;
    v_name := trim(coalesce(v_item->>'name',''));
    v_code := upper(trim(coalesce(v_item->>'code','')));
    v_type := coalesce(v_item->>'fund_type','general');
    if v_id is null or v_name = '' or v_code = ''
       or v_type is null or v_type not in ('general','designated','restricted') then
      raise exception 'Fund requires a UUID, code, name and valid fund type';
    end if;

    if p_scope_type = 'church' then
      if nullif(v_item->>'branch_id','') is not null
         or nullif(v_item->>'district_id','') is not null then
        raise exception 'Church-wide funds must not specify branch or district ownership';
      end if;
    elsif p_scope_type = 'district' then
      if nullif(v_item->>'branch_id','') is not null
         or nullif(v_item->>'district_id','')::uuid is distinct from v_district_id then
        raise exception 'District funds must belong to the requested district and no branch';
      end if;
    else
      if nullif(v_item->>'branch_id','')::uuid is distinct from v_branch_id
         or (nullif(v_item->>'district_id','') is not null
             and nullif(v_item->>'district_id','')::uuid is distinct from v_district_id) then
        raise exception 'Branch funds must belong to the requested branch and its district';
      end if;
    end if;

    select to_jsonb(f) into v_existing from public.funds f where f.id = v_id;
    if v_existing is not null then
      if v_existing->>'name' is distinct from v_name
         or v_existing->>'code' is distinct from v_code
         or coalesce(v_existing->>'description','') is distinct from coalesce(v_item->>'description','')
         or v_existing->>'fund_type' is distinct from v_type
         or (v_existing->>'is_default')::boolean is distinct from coalesce((v_item->>'is_default')::boolean,false)
         or (v_existing->>'is_active')::boolean is distinct from coalesce((v_item->>'is_active')::boolean,true)
         or (v_existing->>'branch_id')::uuid is distinct from v_branch_id
         or (v_existing->>'district_id')::uuid is distinct from v_district_id then
        raise exception 'Existing fund definitions are immutable';
      end if;
    else
      insert into public.funds (
        id, name, code, description, fund_type, is_default, is_active,
        branch_id, district_id
      ) values (
        v_id, v_name, v_code, nullif(trim(v_item->>'description'),''),
        v_type, coalesce((v_item->>'is_default')::boolean,false),
        coalesce((v_item->>'is_active')::boolean,true),
        v_branch_id, v_district_id
      );
      v_funds_saved := v_funds_saved + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'saved', true,
    'financial_accounts_created', v_accounts_saved,
    'funds_created', v_funds_saved,
    'scope_type', p_scope_type,
    'scope_id', p_scope_id
  );
end;
$$;

comment on function public.save_finance_scope_resources(text, uuid, jsonb, jsonb) is
  'Creates immutable financial accounts and funds owned by one authorized church, district or branch scope.';

revoke all on function public.save_finance_scope_resources(text, uuid, jsonb, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.save_finance_scope_resources(text, uuid, jsonb, jsonb)
  to authenticated;

commit;
