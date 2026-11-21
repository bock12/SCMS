-- Add permission-checked RPCs to reactivate, update, and delete member role assignments.
-- Preserves exact scope enforcement (church / district / branch) on both existing and target scopes.

create or replace function public.reactivate_profile_role_assignment(
  p_assignment_id uuid
)
returns public.profile_role_assignments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_profile_id uuid;
  v_assignment public.profile_role_assignments;
begin
  v_actor_profile_id := private.current_profile_id();
  if v_actor_profile_id is null then
    raise exception 'An authenticated church profile is required.'
      using errcode = '42501';
  end if;

  select a.*
  into v_assignment
  from public.profile_role_assignments a
  where a.id = p_assignment_id;

  if not found then
    raise exception 'The selected role assignment does not exist.'
      using errcode = '23503';
  end if;

  if v_assignment.scope_type = 'church'
    and not private.has_permission('manage_roles', null) then
    raise exception 'You do not have permission to manage church-wide roles.'
      using errcode = '42501';
  elsif v_assignment.scope_type = 'branch'
    and not private.has_permission('manage_roles', v_assignment.branch_id) then
    raise exception 'You do not have permission to manage roles for this branch.'
      using errcode = '42501';
  elsif v_assignment.scope_type = 'district'
    and not private.has_district_permission('manage_roles', v_assignment.district_id) then
    raise exception 'You do not have permission to manage roles for this district.'
      using errcode = '42501';
  end if;

  if not exists (select 1 from public.roles r where r.id = v_assignment.role_id and r.is_active) then
    raise exception 'The assigned role is no longer active.'
      using errcode = '23503';
  end if;

  update public.profile_role_assignments
  set
    is_active = true,
    expires_at = null,
    assigned_at = least(assigned_at, now()),
    assigned_by_profile_id = v_actor_profile_id
  where id = p_assignment_id
  returning * into v_assignment;

  return v_assignment;
end;
$$;

create or replace function public.update_profile_role_assignment(
  p_assignment_id uuid,
  p_role_id uuid,
  p_scope_type text default 'church',
  p_branch_id uuid default null,
  p_district_id uuid default null
)
returns public.profile_role_assignments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_profile_id uuid;
  v_existing public.profile_role_assignments;
  v_updated public.profile_role_assignments;
begin
  v_actor_profile_id := private.current_profile_id();
  if v_actor_profile_id is null then
    raise exception 'An authenticated church profile is required.'
      using errcode = '42501';
  end if;

  if p_scope_type not in ('church', 'district', 'branch') then
    raise exception 'Unsupported role assignment scope.'
      using errcode = '22023';
  end if;

  if (p_scope_type = 'church' and (p_branch_id is not null or p_district_id is not null))
    or (p_scope_type = 'district' and (p_district_id is null or p_branch_id is not null))
    or (p_scope_type = 'branch' and (p_branch_id is null or p_district_id is not null)) then
    raise exception 'Role assignment scope identifiers do not match the selected scope.'
      using errcode = '22023';
  end if;

  select a.*
  into v_existing
  from public.profile_role_assignments a
  where a.id = p_assignment_id;

  if not found then
    raise exception 'The selected role assignment does not exist.'
      using errcode = '23503';
  end if;

  if v_existing.scope_type = 'church'
    and not private.has_permission('manage_roles', null) then
    raise exception 'You do not have permission to manage church-wide roles.'
      using errcode = '42501';
  elsif v_existing.scope_type = 'branch'
    and not private.has_permission('manage_roles', v_existing.branch_id) then
    raise exception 'You do not have permission to manage roles for this branch.'
      using errcode = '42501';
  elsif v_existing.scope_type = 'district'
    and not private.has_district_permission('manage_roles', v_existing.district_id) then
    raise exception 'You do not have permission to manage roles for this district.'
      using errcode = '42501';
  end if;

  if p_scope_type = 'church'
    and not private.has_permission('manage_roles', null) then
    raise exception 'You do not have permission to assign church-wide roles.'
      using errcode = '42501';
  elsif p_scope_type = 'branch'
    and not private.has_permission('manage_roles', p_branch_id) then
    raise exception 'You do not have permission to assign roles for this branch.'
      using errcode = '42501';
  elsif p_scope_type = 'district'
    and not private.has_district_permission('manage_roles', p_district_id) then
    raise exception 'You do not have permission to assign roles for this district.'
      using errcode = '42501';
  end if;

  if not exists (select 1 from public.roles r where r.id = p_role_id and r.is_active) then
    raise exception 'The selected role is unavailable.'
      using errcode = '23503';
  end if;

  if p_scope_type = 'branch'
    and not exists (select 1 from public.church_branches b where b.id = p_branch_id) then
    raise exception 'The selected branch does not exist.'
      using errcode = '23503';
  end if;

  if p_scope_type = 'district'
    and not exists (select 1 from public.districts d where d.id = p_district_id) then
    raise exception 'The selected district does not exist.'
      using errcode = '23503';
  end if;

  update public.profile_role_assignments
  set
    role_id = p_role_id,
    scope_type = p_scope_type,
    branch_id = p_branch_id,
    district_id = p_district_id,
    assigned_by_profile_id = v_actor_profile_id
  where id = p_assignment_id
  returning * into v_updated;

  return v_updated;
end;
$$;

create or replace function public.delete_profile_role_assignment(
  p_assignment_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_profile_id uuid;
  v_assignment public.profile_role_assignments;
begin
  v_actor_profile_id := private.current_profile_id();
  if v_actor_profile_id is null then
    raise exception 'An authenticated church profile is required.'
      using errcode = '42501';
  end if;

  select a.*
  into v_assignment
  from public.profile_role_assignments a
  where a.id = p_assignment_id;

  if not found then
    return false;
  end if;

  if v_assignment.scope_type = 'church'
    and not private.has_permission('manage_roles', null) then
    raise exception 'You do not have permission to manage church-wide roles.'
      using errcode = '42501';
  elsif v_assignment.scope_type = 'branch'
    and not private.has_permission('manage_roles', v_assignment.branch_id) then
    raise exception 'You do not have permission to manage roles for this branch.'
      using errcode = '42501';
  elsif v_assignment.scope_type = 'district'
    and not private.has_district_permission('manage_roles', v_assignment.district_id) then
    raise exception 'You do not have permission to manage roles for this district.'
      using errcode = '42501';
  end if;

  delete from public.profile_role_assignments
  where id = p_assignment_id;

  return true;
end;
$$;

revoke all on function public.reactivate_profile_role_assignment(uuid) from public, anon, authenticated;
revoke all on function public.update_profile_role_assignment(uuid, uuid, text, uuid, uuid) from public, anon, authenticated;
revoke all on function public.delete_profile_role_assignment(uuid) from public, anon, authenticated;
grant execute on function public.reactivate_profile_role_assignment(uuid) to authenticated;
grant execute on function public.update_profile_role_assignment(uuid, uuid, text, uuid, uuid) to authenticated;
grant execute on function public.delete_profile_role_assignment(uuid) to authenticated;
