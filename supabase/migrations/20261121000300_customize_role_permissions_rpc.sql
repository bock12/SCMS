-- Secure role permission customization behind a church-wide permission-checked RPC.
-- Authenticated clients may read role_permissions under RLS, but cannot write them directly.

create or replace function public.update_role_permissions(
  p_role_id uuid,
  p_permission_ids uuid[]
)
returns setof public.role_permissions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_profile_id uuid;
  v_role public.roles;
  v_permission_ids uuid[];
  v_manage_roles_id uuid;
  v_missing_count integer;
begin
  v_actor_profile_id := private.current_profile_id();
  if v_actor_profile_id is null then
    raise exception 'An authenticated church profile is required.'
      using errcode = '42501';
  end if;

  if not private.has_permission('manage_roles', null) then
    raise exception 'You need church-wide manage_roles permission to customize role permissions.'
      using errcode = '42501';
  end if;

  select r.*
  into v_role
  from public.roles r
  where r.id = p_role_id
    and r.is_active;

  if not found then
    raise exception 'The selected role is unavailable.'
      using errcode = '23503';
  end if;

  select coalesce(array_agg(distinct pid), '{}'::uuid[])
  into v_permission_ids
  from unnest(coalesce(p_permission_ids, '{}'::uuid[])) as pid
  where pid is not null;

  select count(*)
  into v_missing_count
  from unnest(v_permission_ids) as pid
  where not exists (
    select 1 from public.permissions p where p.id = pid
  );

  if v_missing_count > 0 then
    raise exception 'One or more selected permissions do not exist.'
      using errcode = '23503';
  end if;

  if v_role.name = 'super_admin' then
    select p.id into v_manage_roles_id
    from public.permissions p
    where p.key = 'manage_roles'
    limit 1;

    if v_manage_roles_id is not null and not (v_manage_roles_id = any(v_permission_ids)) then
      raise exception 'Super Admin must retain manage_roles so system governance remains accessible.'
        using errcode = '42501';
    end if;
  end if;

  delete from public.role_permissions
  where role_id = p_role_id
    and not (permission_id = any(v_permission_ids));

  insert into public.role_permissions (role_id, permission_id)
  select p_role_id, pid
  from unnest(v_permission_ids) as pid
  on conflict (role_id, permission_id) do nothing;

  return query
  select rp.*
  from public.role_permissions rp
  where rp.role_id = p_role_id
  order by rp.permission_id;
end;
$$;

revoke all on function public.update_role_permissions(uuid, uuid[]) from public, anon;
grant execute on function public.update_role_permissions(uuid, uuid[]) to authenticated;
