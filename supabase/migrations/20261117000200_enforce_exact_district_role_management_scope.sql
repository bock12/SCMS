-- Enforce exact role-assignment scope and make future-dated assignments inactive
-- in every server-side authorization helper. Branch authority must never be
-- promoted to district authority merely because one branch belongs to a district.

create or replace function private.can_access_branch(p_branch_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_branch_id is not null and exists (
    select 1
    from public.profile_role_assignments a
    join public.roles r on r.id = a.role_id and r.is_active
    join public.church_branches b on b.id = p_branch_id
    where a.profile_id = private.current_profile_id()
      and a.is_active
      and a.assigned_at <= now()
      and (a.expires_at is null or a.expires_at > now())
      and (
        a.scope_type = 'church'
        or (a.scope_type = 'branch' and a.branch_id = p_branch_id)
        or (a.scope_type = 'district' and b.district_id = a.district_id)
      )
  )
$$;

create or replace function private.has_permission(
  p_permission_key text,
  p_branch_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profile_role_assignments a
    join public.roles r on r.id = a.role_id and r.is_active
    join public.role_permissions rp on rp.role_id = r.id
    join public.permissions p on p.id = rp.permission_id
    left join public.church_branches b on b.id = p_branch_id
    where a.profile_id = private.current_profile_id()
      and a.is_active
      and a.assigned_at <= now()
      and (a.expires_at is null or a.expires_at > now())
      and p.key = p_permission_key
      and (
        a.scope_type = 'church'
        or (p_branch_id is not null and a.scope_type = 'branch'
            and a.branch_id = p_branch_id)
        or (p_branch_id is not null and a.scope_type = 'district'
            and b.district_id = a.district_id)
      )
  )
$$;

-- A district-level action requires a church-wide or matching district assignment.
-- A branch assignment in that district is deliberately insufficient.
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
  select p_district_id is not null and exists (
    select 1
    from public.profile_role_assignments a
    join public.roles r on r.id = a.role_id and r.is_active
    join public.role_permissions rp on rp.role_id = r.id
    join public.permissions p on p.id = rp.permission_id
    where a.profile_id = private.current_profile_id()
      and a.is_active
      and a.assigned_at <= now()
      and (a.expires_at is null or a.expires_at > now())
      and p.key = p_permission_key
      and (
        a.scope_type = 'church'
        or (a.scope_type = 'district' and a.district_id = p_district_id)
      )
  )
$$;

revoke all on function private.can_access_branch(uuid) from public, anon, authenticated;
revoke all on function private.has_permission(text, uuid) from public, anon, authenticated;
revoke all on function private.has_district_permission(text, uuid) from public, anon, authenticated;
grant execute on function private.can_access_branch(uuid) to authenticated;
grant execute on function private.has_permission(text, uuid) to authenticated;

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
    and not private.has_district_permission('manage_roles', v_assignment.district_id) then
    raise exception 'You do not have permission to manage roles for this district.'
      using errcode = '42501';
  end if;

  update public.profile_role_assignments
  set is_active = false
  where id = p_assignment_id;

  return true;
end;
$$;

revoke all on function public.assign_profile_role(uuid, uuid, text, uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.deactivate_profile_role_assignment(uuid)
  from public, anon, authenticated;
grant execute on function public.assign_profile_role(uuid, uuid, text, uuid, uuid)
  to authenticated;
grant execute on function public.deactivate_profile_role_assignment(uuid)
  to authenticated;
