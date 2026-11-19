begin;

create or replace function public.get_department_requisition_submission_options(
  p_branch_id uuid,
  p_ministry_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid;
  v_profile public.profiles%rowtype;
  v_ministry public.ministries%rowtype;
  v_base_currency char(3);
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;
  v_profile_id := private.current_profile_id();
  if v_profile_id is null then
    raise exception 'No member profile is linked to this account';
  end if;
  if p_branch_id is null or not private.has_permission('submit_requisitions', p_branch_id) then
    raise exception 'Insufficient permission to prepare a requisition in this branch';
  end if;

  select * into v_profile
  from public.profiles p
  where p.id = v_profile_id
    and p.branch_id = p_branch_id
    and p.membership_status = 'active'
    and p.record_status = 'active';
  if not found then
    raise exception 'The submitting profile must be an active member of the selected branch';
  end if;

  select * into v_ministry
  from public.ministries m
  where m.id = p_ministry_id
    and m.status = 'active'
    and m.entity_type in ('ministry','department')
    and (m.branch_id is null or m.branch_id = p_branch_id);
  if not found then
    raise exception 'Select an active ministry or department in the same branch';
  end if;

  select c.base_currency_code into v_base_currency
  from public.church_settings c where c.id = 1;
  if v_base_currency is null then
    raise exception 'Church base currency must be configured before requisitions can be submitted';
  end if;

  return jsonb_build_object(
    'branch_id', p_branch_id,
    'ministry_id', v_ministry.id,
    'ministry_name', v_ministry.name,
    'base_currency_code', v_base_currency,
    'currencies', coalesce((
      select jsonb_agg(c.code order by c.code)
      from public.currencies c
      where c.is_active
    ), '[]'::jsonb)
  );
end;
$$;

comment on function public.get_department_requisition_submission_options(uuid,uuid) is
  'Returns the active ministry and currency options a branch member may use when submitting a requisition.';

revoke all on function public.get_department_requisition_submission_options(uuid,uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_department_requisition_submission_options(uuid,uuid)
  to authenticated;

commit;
