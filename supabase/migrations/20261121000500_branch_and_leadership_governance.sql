-- Two-tier Branch & Leadership Governance:
-- 1. Grant district_admin manage_branches and manage_roles so district overseers can create/manage
--    branches in their district and assign branch leadership (pastor, finance_officer, leader, worker).
-- 2. Prevent role privilege escalation: only church-wide manage_roles can assign or manage
--    super_admin, admin, or district_admin assignments.
-- 3. Add permission-checked RPCs for creating districts and creating/updating church branches.

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in ('manage_branches', 'manage_roles')
where r.name = 'district_admin'
on conflict do nothing;

create or replace function private.has_district_permission(
  p_permission_key text,
  p_district_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profile_role_assignments pra
    join public.profiles p on p.id = pra.profile_id
    join public.roles r on r.id = pra.role_id and r.is_active
    join public.role_permissions rp on rp.role_id = r.id
    join public.permissions perm on perm.id = rp.permission_id
    where p.auth_user_id = auth.uid()
      and pra.is_active
      and pra.assigned_at <= now()
      and (pra.expires_at is null or pra.expires_at > now())
      and perm.key = p_permission_key
      and (
        pra.scope_type = 'church'
        or (pra.scope_type = 'district' and pra.district_id = p_district_id)
      )
  );
$$;

revoke all on function private.has_district_permission(text, uuid) from public, anon, authenticated;

-- Helper ensuring non-church managers cannot escalate or alter church/district governance roles
create or replace function private.can_manage_target_role(
  p_role_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role_name text;
begin
  select r.name
  into v_role_name
  from public.roles r
  where r.id = p_role_id;

  if v_role_name is null then
    return false;
  end if;

  if v_role_name in ('super_admin', 'admin', 'district_admin') then
    return private.has_permission('manage_roles', null);
  end if;

  return true;
end;
$$;

revoke all on function private.can_manage_target_role(uuid) from public, anon, authenticated;

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
  elsif p_scope_type = 'district'
    and not private.has_district_permission('manage_roles', p_district_id) then
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

  if not private.can_manage_target_role(p_role_id) then
    raise exception 'Only church-wide administrators may assign Super Admin, Admin, or District Admin roles.'
      using errcode = '42501';
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
    and a.assigned_at <= now()
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

  if not private.can_manage_target_role(v_assignment.role_id) then
    raise exception 'Only church-wide administrators may reactivate Super Admin, Admin, or District Admin roles.'
      using errcode = '42501';
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

  if not private.can_manage_target_role(v_existing.role_id) or not private.can_manage_target_role(p_role_id) then
    raise exception 'Only church-wide administrators may modify Super Admin, Admin, or District Admin role assignments.'
      using errcode = '42501';
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

  if not private.can_manage_target_role(v_assignment.role_id) then
    raise exception 'Only church-wide administrators may remove Super Admin, Admin, or District Admin role assignments.'
      using errcode = '42501';
  end if;

  delete from public.profile_role_assignments
  where id = p_assignment_id;

  return true;
end;
$$;

-- Permission-checked RPCs for creating districts and creating/updating church branches.
create or replace function public.create_district(
  p_name text,
  p_region text,
  p_country text
)
returns public.districts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_profile_id uuid;
  v_district public.districts;
begin
  v_actor_profile_id := private.current_profile_id();
  if v_actor_profile_id is null then
    raise exception 'An authenticated church profile is required.'
      using errcode = '42501';
  end if;

  if not private.has_permission('manage_branches', null) then
    raise exception 'Church-wide manage_branches permission is required to create districts.'
      using errcode = '42501';
  end if;

  if nullif(trim(coalesce(p_name, '')), '') is null
    or nullif(trim(coalesce(p_region, '')), '') is null
    or nullif(trim(coalesce(p_country, '')), '') is null then
    raise exception 'District name, region, and country are required.'
      using errcode = '22023';
  end if;

  insert into public.districts (name, region, country)
  values (trim(p_name), trim(p_region), trim(p_country))
  returning * into v_district;

  return v_district;
end;
$$;

create or replace function public.create_church_branch(
  p_district_id uuid,
  p_name text,
  p_address text,
  p_city text,
  p_state text,
  p_is_main_branch boolean default false
)
returns public.church_branches
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_profile_id uuid;
  v_branch public.church_branches;
  v_has_church_scope boolean;
begin
  v_actor_profile_id := private.current_profile_id();
  if v_actor_profile_id is null then
    raise exception 'An authenticated church profile is required.'
      using errcode = '42501';
  end if;

  if not exists (select 1 from public.districts d where d.id = p_district_id) then
    raise exception 'The selected district does not exist.'
      using errcode = '23503';
  end if;

  v_has_church_scope := private.has_permission('manage_branches', null);
  if not v_has_church_scope and not private.has_district_permission('manage_branches', p_district_id) then
    raise exception 'You do not have permission to create branches in this district.'
      using errcode = '42501';
  end if;

  if coalesce(p_is_main_branch, false) and not v_has_church_scope then
    raise exception 'Only church-wide administrators may designate the main headquarters branch.'
      using errcode = '42501';
  end if;

  if nullif(trim(coalesce(p_name, '')), '') is null
    or nullif(trim(coalesce(p_address, '')), '') is null
    or nullif(trim(coalesce(p_city, '')), '') is null
    or nullif(trim(coalesce(p_state, '')), '') is null then
    raise exception 'Branch name, address, city, and state are required.'
      using errcode = '22023';
  end if;

  insert into public.church_branches (district_id, name, address, city, state, is_main_branch)
  values (p_district_id, trim(p_name), trim(p_address), trim(p_city), trim(p_state), coalesce(p_is_main_branch, false))
  returning * into v_branch;

  return v_branch;
end;
$$;

create or replace function public.update_church_branch(
  p_branch_id uuid,
  p_district_id uuid,
  p_name text,
  p_address text,
  p_city text,
  p_state text,
  p_is_main_branch boolean default false
)
returns public.church_branches
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_profile_id uuid;
  v_existing public.church_branches;
  v_updated public.church_branches;
  v_has_church_scope boolean;
begin
  v_actor_profile_id := private.current_profile_id();
  if v_actor_profile_id is null then
    raise exception 'An authenticated church profile is required.'
      using errcode = '42501';
  end if;

  select b.*
  into v_existing
  from public.church_branches b
  where b.id = p_branch_id;

  if not found then
    raise exception 'The selected branch does not exist.'
      using errcode = '23503';
  end if;

  if not exists (select 1 from public.districts d where d.id = p_district_id) then
    raise exception 'The selected district does not exist.'
      using errcode = '23503';
  end if;

  v_has_church_scope := private.has_permission('manage_branches', null);
  if not v_has_church_scope then
    if not private.has_district_permission('manage_branches', v_existing.district_id)
      or not private.has_district_permission('manage_branches', p_district_id) then
      raise exception 'You do not have permission to update this branch or move it across districts.'
        using errcode = '42501';
    end if;
    if coalesce(p_is_main_branch, false) is distinct from v_existing.is_main_branch then
      raise exception 'Only church-wide administrators may change main branch designation.'
        using errcode = '42501';
    end if;
  end if;

  if nullif(trim(coalesce(p_name, '')), '') is null
    or nullif(trim(coalesce(p_address, '')), '') is null
    or nullif(trim(coalesce(p_city, '')), '') is null
    or nullif(trim(coalesce(p_state, '')), '') is null then
    raise exception 'Branch name, address, city, and state are required.'
      using errcode = '22023';
  end if;

  update public.church_branches
  set
    district_id = p_district_id,
    name = trim(p_name),
    address = trim(p_address),
    city = trim(p_city),
    state = trim(p_state),
    is_main_branch = coalesce(p_is_main_branch, false)
  where id = p_branch_id
  returning * into v_updated;

  return v_updated;
end;
$$;

revoke all on function public.assign_profile_role(uuid, uuid, text, uuid, uuid) from public, anon, authenticated;
revoke all on function public.reactivate_profile_role_assignment(uuid) from public, anon, authenticated;
revoke all on function public.update_profile_role_assignment(uuid, uuid, text, uuid, uuid) from public, anon, authenticated;
revoke all on function public.delete_profile_role_assignment(uuid) from public, anon, authenticated;
revoke all on function public.create_district(text, text, text) from public, anon, authenticated;
revoke all on function public.create_church_branch(uuid, text, text, text, text, boolean) from public, anon, authenticated;
revoke all on function public.update_church_branch(uuid, uuid, text, text, text, text, boolean) from public, anon, authenticated;

grant execute on function public.assign_profile_role(uuid, uuid, text, uuid, uuid) to authenticated;
grant execute on function public.reactivate_profile_role_assignment(uuid) to authenticated;
grant execute on function public.update_profile_role_assignment(uuid, uuid, text, uuid, uuid) to authenticated;
grant execute on function public.delete_profile_role_assignment(uuid) to authenticated;
grant execute on function public.create_district(text, text, text) to authenticated;
grant execute on function public.create_church_branch(uuid, text, text, text, text, boolean) to authenticated;
grant execute on function public.update_church_branch(uuid, uuid, text, text, text, text, boolean) to authenticated;
