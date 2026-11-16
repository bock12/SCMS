-- Secure role assignment mutations behind permission-checked database functions.
-- Authenticated clients may read role assignments under RLS, but cannot write them directly.

create or replace function public.assign_profile_role(
  p_profile_id uuid,
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
  v_assignment public.profile_role_assignments;
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

  if p_scope_type = 'church' and not private.has_permission('manage_roles', null) then
    raise exception 'You do not have permission to manage church-wide roles.'
      using errcode = '42501';
  elsif p_scope_type = 'branch' and not private.has_permission('manage_roles', p_branch_id) then
    raise exception 'You do not have permission to manage roles for this branch.'
      using errcode = '42501';
  elsif p_scope_type = 'district' and not exists (
    select 1
    from public.church_branches b
    where b.district_id = p_district_id
      and private.has_permission('manage_roles', b.id)
  ) then
    raise exception 'You do not have permission to manage roles for this district.'
      using errcode = '42501';
  end if;

  if not exists (select 1 from public.profiles p where p.id = p_profile_id) then
    raise exception 'The selected member does not exist.'
      using errcode = '23503';
  end if;

  if not exists (select 1 from public.roles r where r.id = p_role_id and r.is_active) then
    raise exception 'The selected role is unavailable.'
      using errcode = '23503';
  end if;

  select a.*
  into v_assignment
  from public.profile_role_assignments a
  where a.profile_id = p_profile_id
    and a.role_id = p_role_id
    and a.scope_type = p_scope_type
    and a.branch_id is not distinct from p_branch_id
    and a.district_id is not distinct from p_district_id
    and a.is_active
    and (a.expires_at is null or a.expires_at > now())
  order by a.assigned_at desc
  limit 1;

  if found then
    return v_assignment;
  end if;

  insert into public.profile_role_assignments (
    profile_id, role_id, scope_type, branch_id, district_id, assigned_by_profile_id
  ) values (
    p_profile_id, p_role_id, p_scope_type, p_branch_id, p_district_id, v_actor_profile_id
  )
  returning * into v_assignment;

  return v_assignment;
end;
$$;

create or replace function public.deactivate_profile_role_assignment(
  p_assignment_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_assignment public.profile_role_assignments;
begin
  select a.*
  into v_assignment
  from public.profile_role_assignments a
  where a.id = p_assignment_id
    and a.is_active;

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
    and not exists (
      select 1
      from public.church_branches b
      where b.district_id = v_assignment.district_id
        and private.has_permission('manage_roles', b.id)
    ) then
    raise exception 'You do not have permission to manage roles for this district.'
      using errcode = '42501';
  end if;

  update public.profile_role_assignments
  set is_active = false
  where id = p_assignment_id;

  return true;
end;
$$;

revoke all on function public.assign_profile_role(uuid, uuid, text, uuid, uuid) from public, anon;
revoke all on function public.deactivate_profile_role_assignment(uuid) from public, anon;
grant execute on function public.assign_profile_role(uuid, uuid, text, uuid, uuid) to authenticated;
grant execute on function public.deactivate_profile_role_assignment(uuid) to authenticated;
