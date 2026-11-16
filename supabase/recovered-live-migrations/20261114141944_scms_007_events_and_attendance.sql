
begin;

insert into public.permissions (key, module, description) values
  ('view_events', 'events', 'View events available to the member or branch'),
  ('register_for_events', 'events', 'Register the current member for events'),
  ('view_attendance', 'attendance', 'View attendance records within permitted scope')
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on
  (r.name in ('super_admin','admin','district_admin','pastor','leader','worker','member')
    and p.key in ('view_events','register_for_events'))
  or (r.name in ('super_admin','admin','district_admin','pastor','leader','worker')
    and p.key = 'view_attendance')
on conflict do nothing;

create table public.events (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid references public.church_branches(id) on delete restrict,
  title text not null,
  description text,
  category text,
  start_time timestamptz not null,
  end_time timestamptz not null,
  location text,
  is_virtual boolean not null default false,
  virtual_link text,
  featured_image text,
  organizer_name text,
  target_audience text,
  registration_required boolean not null default false,
  max_attendees integer,
  status text not null default 'upcoming'
    check (status in ('upcoming','ongoing','completed','cancelled')),
  created_by_profile_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint events_time_order check (end_time > start_time),
  constraint events_positive_capacity check (max_attendees is null or max_attendees > 0)
);
create index ix_events_branch_start on public.events (branch_id, start_time);
create index ix_events_status_start on public.events (status, start_time);
create index ix_events_created_by on public.events (created_by_profile_id)
  where created_by_profile_id is not null;

create table public.event_registrations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete restrict,
  member_id uuid references public.profiles(id) on delete restrict,
  member_name text,
  email text,
  phone text,
  registered_at timestamptz not null default now(),
  registered_by_profile_id uuid references public.profiles(id) on delete set null,
  checked_in_at timestamptz,
  status text not null default 'confirmed'
    check (status in ('confirmed','cancelled','waitlist','checked_in','absent','attended')),
  constraint event_registration_identity check (
    member_id is not null
    or (member_name is not null and length(trim(member_name)) > 0)
  )
);
create unique index uq_event_registration_active_member
  on public.event_registrations (event_id, member_id)
  where member_id is not null and status <> 'cancelled';
create unique index uq_event_registration_active_external_email
  on public.event_registrations (event_id, lower(email))
  where member_id is null and email is not null and status <> 'cancelled';
create index ix_event_registrations_event_status
  on public.event_registrations (event_id, status);
create index ix_event_registrations_member
  on public.event_registrations (member_id) where member_id is not null;
create index ix_event_registrations_registered_by
  on public.event_registrations (registered_by_profile_id)
  where registered_by_profile_id is not null;

create table public.attendance_sessions (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.church_branches(id) on delete restrict,
  event_id uuid references public.events(id) on delete restrict,
  title text not null,
  session_date date not null default current_date,
  session_type text not null default 'service',
  created_by_profile_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index ix_attendance_sessions_branch_date
  on public.attendance_sessions (branch_id, session_date desc);
create index ix_attendance_sessions_event
  on public.attendance_sessions (event_id) where event_id is not null;
create index ix_attendance_sessions_created_by
  on public.attendance_sessions (created_by_profile_id)
  where created_by_profile_id is not null;

create table public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.attendance_sessions(id) on delete restrict,
  member_id uuid not null references public.profiles(id) on delete restrict,
  attendance_status text not null
    check (attendance_status in ('present','absent','late','excused')),
  check_in_time timestamptz,
  recorded_by_profile_id uuid references public.profiles(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  unique (session_id, member_id)
);
create index ix_attendance_records_member on public.attendance_records (member_id);
create index ix_attendance_records_recorded_by
  on public.attendance_records (recorded_by_profile_id)
  where recorded_by_profile_id is not null;

alter table public.events enable row level security;
alter table public.event_registrations enable row level security;
alter table public.attendance_sessions enable row level security;
alter table public.attendance_records enable row level security;

revoke all on public.events, public.event_registrations,
  public.attendance_sessions, public.attendance_records
from anon, authenticated;

grant select on public.events, public.event_registrations,
  public.attendance_sessions, public.attendance_records
to authenticated;
grant insert on public.event_registrations to authenticated;

create policy events_authenticated_read
on public.events for select to authenticated
using (
  branch_id is null
  or exists (
    select 1 from public.profiles p
    where p.auth_user_id = (select auth.uid())
      and p.branch_id = events.branch_id
  )
  or private.can_access_branch(branch_id)
  or private.has_permission('view_events', branch_id)
);

create policy event_registrations_read_own_or_manager
on public.event_registrations for select to authenticated
using (
  member_id = private.current_profile_id()
  or exists (
    select 1 from public.events e
    where e.id = event_id
      and private.has_permission('manage_events', e.branch_id)
  )
);

create policy event_registrations_insert_self
on public.event_registrations for insert to authenticated
with check (
  member_id = private.current_profile_id()
  and exists (
    select 1 from public.events e
    where e.id = event_id
      and e.status = 'upcoming'
      and (
        e.branch_id is null
        or exists (
          select 1 from public.profiles p
          where p.auth_user_id = (select auth.uid())
            and p.branch_id = e.branch_id
        )
        or private.can_access_branch(e.branch_id)
        or private.has_permission('register_for_events', e.branch_id)
      )
  )
);

create policy attendance_sessions_scoped_read
on public.attendance_sessions for select to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.auth_user_id = (select auth.uid())
      and p.branch_id = attendance_sessions.branch_id
  )
  or private.can_access_branch(branch_id)
  or private.has_permission('view_attendance', branch_id)
);

create policy attendance_records_self_or_manager_read
on public.attendance_records for select to authenticated
using (
  member_id = private.current_profile_id()
  or exists (
    select 1 from public.attendance_sessions s
    where s.id = session_id
      and private.has_permission('view_attendance', s.branch_id)
  )
);

commit;