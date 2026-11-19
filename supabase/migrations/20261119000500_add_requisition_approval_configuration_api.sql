begin;

create or replace function public.get_requisition_approval_configuration(
  p_branch_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;
  v_profile_id := private.current_profile_id();
  if v_profile_id is null then
    raise exception 'No member profile is linked to this account';
  end if;
  if p_branch_id is null then
    if not private.has_permission('manage_finances', null) then
      raise exception 'Church-level finance permission is required to view requisition approval configuration';
    end if;
  elsif not private.has_permission('manage_finances', p_branch_id) then
    raise exception 'Insufficient permission to view requisition approval configuration for this branch';
  end if;

  return jsonb_build_object(
    'policies', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id,
        'name', p.name,
        'transaction_type', p.transaction_type,
        'branch_id', p.branch_id,
        'version', p.version,
        'effective_from', p.effective_from,
        'effective_to', p.effective_to,
        'is_active', p.is_active
      ) order by p.branch_id nulls first, p.version desc)
      from public.approval_policies p
      where p.transaction_type = 'requisition'
        and (p.branch_id = p_branch_id or p.branch_id is null)
    ), '[]'::jsonb),
    'bands', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', b.id,
        'policy_id', b.policy_id,
        'min_amount_base', b.min_amount_base,
        'max_amount_base', b.max_amount_base
      ) order by p.version desc, b.min_amount_base)
      from public.approval_policy_bands b
      join public.approval_policies p on p.id = b.policy_id
      where p.transaction_type = 'requisition'
        and (p.branch_id = p_branch_id or p.branch_id is null)
    ), '[]'::jsonb),
    'steps', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id,
        'band_id', s.band_id,
        'step_number', s.step_number,
        'required_permission_key', s.required_permission_key,
        'required_approvals', s.required_approvals,
        'prohibit_submitter_approval', s.prohibit_submitter_approval
      ) order by p.version desc, s.step_number)
      from public.approval_policy_steps s
      join public.approval_policy_bands b on b.id = s.band_id
      join public.approval_policies p on p.id = b.policy_id
      where p.transaction_type = 'requisition'
        and (p.branch_id = p_branch_id or p.branch_id is null)
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.save_requisition_approval_policy(
  p_branch_id uuid,
  p_name text,
  p_min_amount_base numeric,
  p_max_amount_base numeric,
  p_required_approvals integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid;
  v_version integer;
  v_policy_id uuid;
  v_band_id uuid;
  v_step_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;
  v_profile_id := private.current_profile_id();
  if v_profile_id is null then
    raise exception 'No member profile is linked to this account';
  end if;

  if p_branch_id is null then
    if not private.has_permission('manage_finances', null) then
      raise exception 'Church-level finance permission is required to create a requisition approval policy';
    end if;
  else
    if not exists (
      select 1 from public.church_branches b
      where b.id = p_branch_id and b.status = 'active'
    ) or not private.has_permission('manage_finances', p_branch_id) then
      raise exception 'Insufficient permission or inactive branch for requisition approval configuration';
    end if;
  end if;

  if p_name is null or length(trim(p_name)) = 0
     or p_min_amount_base is null or p_min_amount_base < 0
     or (p_max_amount_base is not null and p_max_amount_base <= p_min_amount_base)
     or p_required_approvals is null or p_required_approvals < 1 then
    raise exception 'A policy name, valid amount band and positive approval count are required';
  end if;

  -- Serialize version allocation for each branch/church scope.
  perform pg_advisory_xact_lock(hashtext(coalesce(p_branch_id::text, 'church'))::bigint);

  select coalesce(max(p.version), 0) + 1
  into v_version
  from public.approval_policies p
  where p.transaction_type = 'requisition'
    and p.branch_id is not distinct from p_branch_id;

  insert into public.approval_policies (
    name, transaction_type, branch_id, version, effective_from,
    is_active, created_by_profile_id
  ) values (
    trim(p_name), 'requisition', p_branch_id, v_version, current_date,
    true, v_profile_id
  ) returning id into v_policy_id;

  insert into public.approval_policy_bands (
    policy_id, min_amount_base, max_amount_base
  ) values (
    v_policy_id, p_min_amount_base, p_max_amount_base
  ) returning id into v_band_id;

  insert into public.approval_policy_steps (
    band_id, step_number, required_permission_key, required_approvals,
    prohibit_submitter_approval
  ) values (
    v_band_id, 1, 'approve_requisitions', p_required_approvals, true
  ) returning id into v_step_id;

  insert into public.audit_logs (
    actor_profile_id, action, entity_type, entity_id, branch_id, details
  ) values (
    v_profile_id, 'requisition_approval_policy.created',
    'approval_policy', v_policy_id, p_branch_id,
    jsonb_build_object(
      'transaction_type', 'requisition',
      'version', v_version,
      'min_amount_base', p_min_amount_base,
      'max_amount_base', p_max_amount_base,
      'required_approvals', p_required_approvals
    )
  );

  return jsonb_build_object(
    'policy_id', v_policy_id,
    'band_id', v_band_id,
    'step_id', v_step_id,
    'version', v_version
  );
end;
$$;

comment on function public.get_requisition_approval_configuration(uuid) is
  'Returns branch-scoped requisition approval policies, amount bands and approval steps.';
comment on function public.save_requisition_approval_policy(uuid,text,numeric,numeric,integer) is
  'Creates a new immutable requisition approval policy version with an amount band and submitter-separated approver step.';

revoke all on function public.get_requisition_approval_configuration(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.save_requisition_approval_policy(uuid, text, numeric, numeric, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.get_requisition_approval_configuration(uuid)
  to authenticated;
grant execute on function public.save_requisition_approval_policy(uuid, text, numeric, numeric, integer)
  to authenticated;

commit;
