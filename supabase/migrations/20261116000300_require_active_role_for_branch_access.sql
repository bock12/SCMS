-- Branch visibility must not survive deactivation of the assigned system role.
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
      and (a.expires_at is null or a.expires_at > now())
      and (
        a.scope_type = 'church'
        or (a.scope_type = 'branch' and a.branch_id = p_branch_id)
        or (a.scope_type = 'district' and b.district_id = a.district_id)
      )
  )
$$;
