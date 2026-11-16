
begin;

alter table public.currencies enable row level security;
alter table public.church_settings enable row level security;
alter table public.districts enable row level security;
alter table public.church_branches enable row level security;
alter table public.profiles enable row level security;
alter table public.member_transfers enable row level security;
alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.profile_role_assignments enable row level security;
alter table public.ministries enable row level security;
alter table public.ministry_members enable row level security;
alter table public.cells enable row level security;
alter table public.cell_members enable row level security;

revoke all on public.currencies, public.church_settings, public.districts,
  public.church_branches, public.profiles, public.member_transfers,
  public.roles, public.permissions, public.role_permissions,
  public.profile_role_assignments, public.ministries, public.ministry_members,
  public.cells, public.cell_members
from anon, authenticated;

grant select on public.currencies, public.church_settings,
  public.districts, public.church_branches,
  public.roles, public.permissions, public.role_permissions,
  public.profile_role_assignments,
  public.profiles, public.member_transfers,
  public.ministries, public.ministry_members, public.cells, public.cell_members
to authenticated;

-- Members can update only basic personal/contact fields on their own profile.
grant update (first_name, last_name, email, phone, gender, date_of_birth,
  marital_status, marriage_date, avatar_url)
on public.profiles to authenticated;

create policy currencies_authenticated_read
on public.currencies for select to authenticated
using (is_active);

create policy church_settings_authenticated_read
on public.church_settings for select to authenticated
using (true);

create policy districts_authorized_read
on public.districts for select to authenticated
using (
  exists (
    select 1 from public.church_branches b
    where b.district_id = districts.id
      and private.can_access_branch(b.id)
  )
  or private.has_permission('manage_branches', null)
);

create policy branches_authorized_read
on public.church_branches for select to authenticated
using (
  private.can_access_branch(id)
  or private.has_permission('manage_branches', null)
);

create policy profiles_scoped_read
on public.profiles for select to authenticated
using (
  auth_user_id = (select auth.uid())
  or private.has_permission('view_members', branch_id)
);

create policy profiles_self_update
on public.profiles for update to authenticated
using (auth_user_id = (select auth.uid()))
with check (auth_user_id = (select auth.uid()));

create policy member_transfers_scoped_read
on public.member_transfers for select to authenticated
using (
  private.has_permission('view_members', from_branch_id)
  or private.has_permission('view_members', to_branch_id)
  or member_id = private.current_profile_id()
);

create policy roles_authenticated_read
on public.roles for select to authenticated
using (is_active);

create policy permissions_authenticated_read
on public.permissions for select to authenticated
using (true);

create policy role_permissions_authenticated_read
on public.role_permissions for select to authenticated
using (true);

create policy profile_role_assignments_self_or_manager_read
on public.profile_role_assignments for select to authenticated
using (
  profile_id = private.current_profile_id()
  or (
    scope_type = 'church'
    and private.has_permission('manage_roles', null)
  )
  or (
    scope_type = 'branch'
    and private.has_permission('manage_roles', branch_id)
  )
  or (
    scope_type = 'district'
    and exists (
      select 1 from public.church_branches b
      where b.district_id = profile_role_assignments.district_id
        and private.has_permission('manage_roles', b.id)
    )
  )
);

create policy ministries_scoped_read
on public.ministries for select to authenticated
using (
  status = 'active'
  and (
    branch_id is null
    or private.can_access_branch(branch_id)
    or private.has_permission('view_members', branch_id)
  )
);

create policy ministry_members_scoped_read
on public.ministry_members for select to authenticated
using (
  exists (
    select 1 from public.ministries m
    where m.id = ministry_id
      and (
        m.branch_id is null
        or private.can_access_branch(m.branch_id)
        or private.has_permission('view_members', m.branch_id)
      )
  )
  or member_id = private.current_profile_id()
);

create policy cells_scoped_read
on public.cells for select to authenticated
using (
  private.can_access_branch(branch_id)
  or private.has_permission('view_members', branch_id)
);

create policy cell_members_scoped_read
on public.cell_members for select to authenticated
using (
  private.can_access_branch(branch_id)
  or private.has_permission('view_members', branch_id)
  or member_id = private.current_profile_id()
);

commit;