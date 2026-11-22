-- District customization + strictly one HQ branch per district:
-- 1. Replace global uq_church_branches_one_active_main with per-district unique index
--    so each district can have at most one active HQ branch (is_main_branch = true).
-- 2. Add update_district (with optional atomic HQ branch assignment) and delete_district RPCs.
-- 3. Update create_church_branch and update_church_branch to automatically transfer HQ
--    status within the target district while enforcing one HQ branch per district.

drop index if exists public.uq_church_branches_one_active_main;

create unique index if not exists uq_church_branches_one_active_hq_per_district
  on public.church_branches (district_id)
  where is_main_branch = true and status = 'active' and district_id is not null;

create or replace function public.create_district(
  p_name text,
  p_region text,
  p_country text,
  p_description text default null
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

  insert into public.districts (name, region, country, description)
  values (trim(p_name), trim(p_region), trim(p_country), nullif(trim(coalesce(p_description, '')), ''))
  returning * into v_district;

  return v_district;
end;
$$;

create or replace function public.update_district(
  p_district_id uuid,
  p_name text,
  p_region text,
  p_country text,
  p_description text default null,
  p_hq_branch_id uuid default null,
  p_update_hq boolean default false
)
returns public.districts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_profile_id uuid;
  v_district public.districts;
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
    raise exception 'You do not have permission to customize this district.'
      using errcode = '42501';
  end if;

  if coalesce(p_update_hq, false) and not v_has_church_scope then
    raise exception 'Only church-wide administrators may change district HQ branch designation.'
      using errcode = '42501';
  end if;

  if nullif(trim(coalesce(p_name, '')), '') is null
    or nullif(trim(coalesce(p_region, '')), '') is null
    or nullif(trim(coalesce(p_country, '')), '') is null then
    raise exception 'District name, region, and country are required.'
      using errcode = '22023';
  end if;

  if coalesce(p_update_hq, false) and p_hq_branch_id is not null then
    if not exists (
      select 1 from public.church_branches b
      where b.id = p_hq_branch_id and b.district_id = p_district_id
    ) then
      raise exception 'The selected HQ branch does not belong to this district.'
        using errcode = '22023';
    end if;
  end if;

  update public.districts
  set
    name = trim(p_name),
    region = trim(p_region),
    country = trim(p_country),
    description = nullif(trim(coalesce(p_description, '')), ''),
    updated_at = now()
  where id = p_district_id
  returning * into v_district;

  if coalesce(p_update_hq, false) then
    update public.church_branches
    set is_main_branch = false, updated_at = now()
    where district_id = p_district_id
      and is_main_branch = true
      and (p_hq_branch_id is null or id <> p_hq_branch_id);

    if p_hq_branch_id is not null then
      update public.church_branches
      set is_main_branch = true, updated_at = now()
      where id = p_hq_branch_id and district_id = p_district_id;
    end if;
  end if;

  return v_district;
end;
$$;

create or replace function public.delete_district(
  p_district_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_profile_id uuid;
begin
  v_actor_profile_id := private.current_profile_id();
  if v_actor_profile_id is null then
    raise exception 'An authenticated church profile is required.'
      using errcode = '42501';
  end if;

  if not private.has_permission('manage_branches', null) then
    raise exception 'Church-wide manage_branches permission is required to delete districts.'
      using errcode = '42501';
  end if;

  if not exists (select 1 from public.districts d where d.id = p_district_id) then
    return false;
  end if;

  if exists (select 1 from public.church_branches b where b.district_id = p_district_id) then
    raise exception 'Reassign or remove all branches in this district before deleting it.'
      using errcode = '23503';
  end if;

  delete from public.districts where id = p_district_id;
  return true;
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
    raise exception 'Only church-wide administrators may designate the district HQ branch.'
      using errcode = '42501';
  end if;

  if nullif(trim(coalesce(p_name, '')), '') is null
    or nullif(trim(coalesce(p_address, '')), '') is null
    or nullif(trim(coalesce(p_city, '')), '') is null
    or nullif(trim(coalesce(p_state, '')), '') is null then
    raise exception 'Branch name, address, city, and state are required.'
      using errcode = '22023';
  end if;

  -- Enforce strictly one HQ branch per district: demote any existing HQ in this district first
  if coalesce(p_is_main_branch, false) then
    update public.church_branches
    set is_main_branch = false, updated_at = now()
    where district_id = p_district_id and is_main_branch = true;
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
      raise exception 'Only church-wide administrators may change district HQ branch designation.'
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

  -- Enforce strictly one HQ branch per district: demote any other HQ in target district first
  if coalesce(p_is_main_branch, false) then
    update public.church_branches
    set is_main_branch = false, updated_at = now()
    where district_id = p_district_id
      and id <> p_branch_id
      and is_main_branch = true;
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

revoke all on function public.create_district(text, text, text, text) from public, anon, authenticated;
revoke all on function public.update_district(uuid, text, text, text, text, uuid, boolean) from public, anon, authenticated;
revoke all on function public.delete_district(uuid) from public, anon, authenticated;
revoke all on function public.create_church_branch(uuid, text, text, text, text, boolean) from public, anon, authenticated;
revoke all on function public.update_church_branch(uuid, uuid, text, text, text, text, boolean) from public, anon, authenticated;

grant execute on function public.create_district(text, text, text, text) to authenticated;
grant execute on function public.update_district(uuid, text, text, text, text, uuid, boolean) to authenticated;
grant execute on function public.delete_district(uuid) to authenticated;
grant execute on function public.create_church_branch(uuid, text, text, text, text, boolean) to authenticated;
grant execute on function public.update_church_branch(uuid, uuid, text, text, text, text, boolean) to authenticated;
