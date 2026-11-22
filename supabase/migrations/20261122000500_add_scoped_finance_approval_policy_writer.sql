-- FIN-ORG-003: create immutable finance approval policy versions at exact org scope.

-- The legacy uniqueness key only distinguished church and branch policies.
-- Include district_id so district-owned policies can safely version alongside
-- church-wide policies without colliding at branch_id IS NULL.
drop index if exists public.uq_approval_policy_version_scope;
create unique index uq_approval_policy_version_scope
  on public.approval_policies (
    transaction_type,
    coalesce(branch_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(district_id, '00000000-0000-0000-0000-000000000000'::uuid),
    version
  );

create or replace function public.save_finance_scope_approval_policies(
  p_scope_type text,
  p_scope_id uuid,
  p_policies jsonb,
  p_bands jsonb,
  p_steps jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_profile_id uuid;
  v_branch_id uuid;
  v_district_id uuid;
  v_item jsonb;
  v_id uuid;
  v_policy_id uuid;
  v_band_id uuid;
  v_policy_type text;
  v_name text;
  v_version integer;
  v_existing jsonb;
  v_new_policy_ids uuid[] := array[]::uuid[];
  v_new_band_ids uuid[] := array[]::uuid[];
  v_policies_created integer := 0;
  v_bands_created integer := 0;
  v_steps_created integer := 0;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;
  v_profile_id := private.current_profile_id();
  if v_profile_id is null then
    raise exception 'No active member profile is linked to this account';
  end if;
  if p_scope_type not in ('church','district','branch') then
    raise exception 'Finance scope must be church, district or branch';
  end if;
  if jsonb_typeof(p_policies) is distinct from 'array'
     or jsonb_typeof(p_bands) is distinct from 'array'
     or jsonb_typeof(p_steps) is distinct from 'array' then
    raise exception 'Approval policies, bands and steps must be arrays';
  end if;

  if p_scope_type = 'church' then
    if p_scope_id is not null then raise exception 'Church-wide scope must not include a scope ID'; end if;
    if not private.has_permission('manage_finances', null) then
      raise exception 'Insufficient permission to manage church-wide approval policies';
    end if;
  elsif p_scope_type = 'district' then
    if p_scope_id is null or not exists (select 1 from public.districts d where d.id = p_scope_id and d.status = 'active') then
      raise exception 'Finance district does not exist or is inactive';
    end if;
    if not private.has_permission_for_district('manage_finances', p_scope_id) then
      raise exception 'Insufficient permission to manage approval policies in this district';
    end if;
    v_district_id := p_scope_id;
  else
    select b.district_id into v_district_id
    from public.church_branches b where b.id = p_scope_id and b.status = 'active';
    if not found then raise exception 'Finance branch does not exist or is inactive'; end if;
    if not private.has_permission('manage_finances', p_scope_id) then
      raise exception 'Insufficient permission to manage approval policies in this branch';
    end if;
    v_branch_id := p_scope_id;
  end if;

  for v_item in select value from jsonb_array_elements(p_policies)
  loop
    v_id := nullif(v_item->>'id','')::uuid;
    v_name := trim(coalesce(v_item->>'name',''));
    v_policy_type := v_item->>'transaction_type';
    if v_id is null or v_name = '' or v_policy_type not in ('financial_document','budget')
       or nullif(v_item->>'effective_from','') is null
       or (nullif(v_item->>'effective_to','') is not null
           and (v_item->>'effective_to')::date < (v_item->>'effective_from')::date) then
      raise exception 'Approval policies require a UUID, name, supported workflow type and valid effective dates';
    end if;

    if nullif(v_item->>'branch_id','')::uuid is distinct from v_branch_id
       or (nullif(v_item->>'district_id','')::uuid is not null
           and nullif(v_item->>'district_id','')::uuid is distinct from v_district_id) then
      raise exception 'Approval policy ownership must match the requested organizational scope';
    end if;

    select to_jsonb(ap) into v_existing from public.approval_policies ap where ap.id = v_id;
    if v_existing is not null then
      if v_existing->>'name' is distinct from v_name
         or v_existing->>'transaction_type' is distinct from v_policy_type
         or (v_existing->>'branch_id')::uuid is distinct from v_branch_id
         or (v_existing->>'district_id')::uuid is distinct from v_district_id
         or (v_existing->>'effective_from')::date is distinct from (v_item->>'effective_from')::date
         or (v_existing->>'effective_to')::date is distinct from nullif(v_item->>'effective_to','')::date
         or (v_existing->>'is_active')::boolean is distinct from coalesce((v_item->>'is_active')::boolean,true) then
        raise exception 'Approval policy versions are immutable; create a new version instead';
      end if;
      continue;
    end if;

    perform pg_advisory_xact_lock(hashtextextended(
      'scms.finance.approval:' || p_scope_type || ':' || coalesce(p_scope_id::text,'church') || ':' || v_policy_type, 0
    ));
    select coalesce(max(ap.version),0) + 1 into v_version
    from public.approval_policies ap
    where ap.transaction_type = v_policy_type
      and ap.branch_id is not distinct from v_branch_id
      and ap.district_id is not distinct from v_district_id;

    insert into public.approval_policies (
      id,name,transaction_type,branch_id,district_id,version,effective_from,effective_to,is_active,created_by_profile_id
    ) values (
      v_id,v_name,v_policy_type,v_branch_id,v_district_id,v_version,
      (v_item->>'effective_from')::date,nullif(v_item->>'effective_to','')::date,
      coalesce((v_item->>'is_active')::boolean,true),v_profile_id
    );
    v_new_policy_ids := array_append(v_new_policy_ids,v_id);
    v_policies_created := v_policies_created + 1;
  end loop;

  for v_item in select value from jsonb_array_elements(p_bands)
  loop
    v_id := nullif(v_item->>'id','')::uuid;
    v_policy_id := nullif(v_item->>'policy_id','')::uuid;
    if v_id is null or v_policy_id is null
       or nullif(v_item->>'min_amount_base','')::numeric is null
       or (v_item->>'min_amount_base')::numeric < 0
       or (nullif(v_item->>'max_amount_base','') is not null
           and (v_item->>'max_amount_base')::numeric <= (v_item->>'min_amount_base')::numeric) then
      raise exception 'Approval amount bands require a policy and valid non-negative range';
    end if;
    select to_jsonb(band) into v_existing from public.approval_policy_bands band where band.id = v_id;
    if v_existing is not null then
      if (v_existing->>'policy_id')::uuid is distinct from v_policy_id
         or (v_existing->>'min_amount_base')::numeric is distinct from (v_item->>'min_amount_base')::numeric
         or (v_existing->>'max_amount_base')::numeric is distinct from nullif(v_item->>'max_amount_base','')::numeric then
        raise exception 'Existing approval amount bands are immutable';
      end if;
      continue;
    end if;
    if not (v_policy_id = any(v_new_policy_ids)) then
      raise exception 'New amount bands must belong to a policy created in this save';
    end if;
    insert into public.approval_policy_bands(id,policy_id,min_amount_base,max_amount_base)
    values(v_id,v_policy_id,(v_item->>'min_amount_base')::numeric,nullif(v_item->>'max_amount_base','')::numeric);
    v_new_band_ids := array_append(v_new_band_ids,v_id);
    v_bands_created := v_bands_created + 1;
  end loop;

  for v_item in select value from jsonb_array_elements(p_steps)
  loop
    v_id := nullif(v_item->>'id','')::uuid;
    v_band_id := nullif(v_item->>'band_id','')::uuid;
    if v_id is null or v_band_id is null
       or nullif(v_item->>'step_number','')::integer is null
       or (v_item->>'step_number')::integer < 1
       or nullif(v_item->>'required_approvals','')::integer is null
       or (v_item->>'required_approvals')::integer < 1
       or v_item->>'required_permission_key' <> 'approve_finances' then
      raise exception 'Approval steps require an ordered step, approve_finances permission and positive approval count';
    end if;
    select to_jsonb(step) into v_existing from public.approval_policy_steps step where step.id = v_id;
    if v_existing is not null then
      if (v_existing->>'band_id')::uuid is distinct from v_band_id
         or (v_existing->>'step_number')::integer is distinct from (v_item->>'step_number')::integer
         or v_existing->>'required_permission_key' is distinct from v_item->>'required_permission_key'
         or (v_existing->>'required_approvals')::integer is distinct from (v_item->>'required_approvals')::integer
         or (v_existing->>'prohibit_submitter_approval')::boolean is distinct from coalesce((v_item->>'prohibit_submitter_approval')::boolean,true) then
        raise exception 'Existing approval policy steps are immutable';
      end if;
      continue;
    end if;
    if not (v_band_id = any(v_new_band_ids)) then
      raise exception 'New approval steps must belong to an amount band created in this save';
    end if;
    insert into public.approval_policy_steps(
      id,band_id,step_number,required_permission_key,required_approvals,prohibit_submitter_approval
    ) values (
      v_id,v_band_id,(v_item->>'step_number')::integer,v_item->>'required_permission_key',
      (v_item->>'required_approvals')::integer,coalesce((v_item->>'prohibit_submitter_approval')::boolean,true)
    );
    v_steps_created := v_steps_created + 1;
  end loop;

  if exists (
    select 1 from unnest(v_new_policy_ids) policy_id
    where not exists (select 1 from public.approval_policy_bands band where band.policy_id = policy_id)
  ) then
    raise exception 'Every new approval policy requires at least one amount band';
  end if;
  if exists (
    select 1 from unnest(v_new_band_ids) band_id
    where not exists (select 1 from public.approval_policy_steps step where step.band_id = band_id)
  ) then
    raise exception 'Every new approval amount band requires at least one approval step';
  end if;
  if exists (
    select 1 from unnest(v_new_band_ids) band_id
    join public.approval_policy_steps step on step.band_id = band_id
    group by band_id
    having min(step.step_number) <> 1 or max(step.step_number) <> count(*)
  ) then
    raise exception 'Approval policy steps must be consecutive from step one';
  end if;

  return jsonb_build_object(
    'saved',true,'policies_created',v_policies_created,'bands_created',v_bands_created,
    'steps_created',v_steps_created,'scope_type',p_scope_type,'scope_id',p_scope_id
  );
end;
$function$;

revoke all on function public.save_finance_scope_approval_policies(text,uuid,jsonb,jsonb,jsonb) from public,anon,service_role;
grant execute on function public.save_finance_scope_approval_policies(text,uuid,jsonb,jsonb,jsonb) to authenticated;

comment on function public.save_finance_scope_approval_policies(text,uuid,jsonb,jsonb,jsonb) is
  'Creates immutable, versioned financial-document and budget approval policies at an authorized church, district or branch scope.';
