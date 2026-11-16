
begin;

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  is_system boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.permissions (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  module text not null,
  description text,
  created_at timestamptz not null default now()
);

create table public.role_permissions (
  role_id uuid not null references public.roles(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (role_id, permission_id)
);

create table public.profile_role_assignments (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete restrict,
  role_id uuid not null references public.roles(id) on delete restrict,
  scope_type text not null check (scope_type in ('church','district','branch')),
  branch_id uuid references public.church_branches(id) on delete restrict,
  district_id uuid references public.districts(id) on delete restrict,
  assigned_by_profile_id uuid references public.profiles(id) on delete set null,
  assigned_at timestamptz not null default now(),
  expires_at timestamptz,
  is_active boolean not null default true,
  constraint role_assignment_scope_shape check (
    (scope_type = 'church' and branch_id is null and district_id is null)
    or (scope_type = 'district' and district_id is not null and branch_id is null)
    or (scope_type = 'branch' and branch_id is not null and district_id is null)
  ),
  constraint role_assignment_expiry check (expires_at is null or expires_at > assigned_at)
);

create index ix_profile_role_assignments_profile
  on public.profile_role_assignments (profile_id, is_active);
create index ix_profile_role_assignments_branch
  on public.profile_role_assignments (branch_id) where branch_id is not null;
create index ix_profile_role_assignments_district
  on public.profile_role_assignments (district_id) where district_id is not null;

insert into public.roles (name, description, is_system) values
  ('super_admin', 'Church system administrator', true),
  ('admin', 'Church administrator', true),
  ('district_admin', 'District administrator', true),
  ('pastor', 'Pastoral leadership', true),
  ('finance_officer', 'Finance operations', true),
  ('leader', 'Ministry or group leader', true),
  ('worker', 'Church worker', true),
  ('member', 'Church member', true)
on conflict (name) do nothing;

insert into public.permissions (key, module, description) values
  ('view_members', 'members', 'View member directory records'),
  ('manage_members', 'members', 'Create and manage member records'),
  ('manage_member_transfers', 'members', 'Approve and manage branch transfers'),
  ('manage_roles', 'authorization', 'Manage role assignments'),
  ('manage_branches', 'church', 'Manage districts and branches'),
  ('manage_ministries', 'ministries', 'Manage ministries and departments'),
  ('view_finances', 'finance', 'View financial information'),
  ('manage_finances', 'finance', 'Create financial transactions'),
  ('approve_finances', 'finance', 'Approve financial transactions'),
  ('post_journals', 'finance', 'Post accounting journal entries'),
  ('manage_events', 'events', 'Manage church events'),
  ('manage_attendance', 'attendance', 'Manage attendance'),
  ('manage_welfare', 'welfare', 'Manage welfare cases'),
  ('view_audit_logs', 'audit', 'View audit history')
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on
  (r.name in ('super_admin','admin') and p.key in (
    'view_members','manage_members','manage_member_transfers',
    'manage_roles','manage_branches','manage_ministries',
    'manage_events','manage_attendance','view_audit_logs'
  ))
  or (r.name = 'district_admin' and p.key in (
    'view_members','manage_members','manage_member_transfers',
    'manage_ministries','manage_events','manage_attendance'
  ))
  or (r.name = 'pastor' and p.key in (
    'view_members','manage_ministries','manage_events','manage_attendance'
  ))
  or (r.name = 'finance_officer' and p.key in (
    'view_finances','manage_finances','approve_finances','post_journals'
  ))
on conflict do nothing;

create or replace function private.current_profile_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.id
  from public.profiles p
  where p.auth_user_id = (select auth.uid())
  limit 1
$$;

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

revoke all on function private.current_profile_id() from public, anon, authenticated;
revoke all on function private.can_access_branch(uuid) from public, anon, authenticated;
revoke all on function private.has_permission(text, uuid) from public, anon, authenticated;
grant execute on function private.current_profile_id() to authenticated;
grant execute on function private.can_access_branch(uuid) to authenticated;
grant execute on function private.has_permission(text, uuid) to authenticated;

commit;