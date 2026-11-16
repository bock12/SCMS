
begin;

insert into public.permissions (key, module, description) values
  ('view_streams', 'streaming', 'View streams available to the user'),
  ('manage_streams', 'streaming', 'Create and manage church streams'),
  ('send_stream_chat', 'streaming', 'Send messages in eligible live streams')
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on
  (r.name in ('super_admin','admin','pastor','leader','worker')
    and p.key in ('view_streams','manage_streams','send_stream_chat'))
  or (r.name = 'member' and p.key in ('view_streams','send_stream_chat'))
on conflict do nothing;

create table public.streams (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid references public.church_branches(id) on delete restrict,
  title text not null,
  description text,
  platform text,
  stream_url text,
  thumbnail_url text,
  visibility text not null default 'members_only'
    check (visibility in ('public','members_only')),
  status text not null default 'scheduled'
    check (status in ('scheduled','live','ended','cancelled')),
  scheduled_start timestamptz,
  started_at timestamptz,
  ended_at timestamptz,
  created_by_profile_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint streams_time_order check (
    ended_at is null or started_at is null or ended_at >= started_at
  )
);
create index ix_streams_branch_status_start
  on public.streams (branch_id, status, scheduled_start);
create index ix_streams_created_by
  on public.streams (created_by_profile_id)
  where created_by_profile_id is not null;

create table public.stream_chat_messages (
  id uuid primary key default gen_random_uuid(),
  stream_id uuid not null references public.streams(id) on delete restrict,
  sender_profile_id uuid not null references public.profiles(id) on delete restrict,
  message text not null,
  status text not null default 'visible'
    check (status in ('visible','hidden','removed')),
  created_at timestamptz not null default now(),
  constraint stream_chat_message_nonblank check (length(trim(message)) > 0),
  constraint stream_chat_message_max_length check (length(message) <= 2000)
);
create index ix_stream_chat_messages_stream_created
  on public.stream_chat_messages (stream_id, created_at);
create index ix_stream_chat_messages_sender
  on public.stream_chat_messages (sender_profile_id);

-- This table stores only a reference to a secret held in a server-side secret
-- manager (for example Supabase Vault). Never store raw stream keys/tokens here.
create table private.stream_credentials (
  id uuid primary key default gen_random_uuid(),
  stream_id uuid not null references public.streams(id) on delete restrict,
  provider text not null,
  secret_reference text not null,
  public_metadata jsonb not null default '{}'::jsonb,
  status text not null default 'active'
    check (status in ('active','revoked')),
  created_by_profile_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
alter table private.stream_credentials enable row level security;
revoke all on private.stream_credentials from public, anon, authenticated, service_role;

alter table public.streams enable row level security;
alter table public.stream_chat_messages enable row level security;

revoke all on public.streams, public.stream_chat_messages
from anon, authenticated;
grant select on public.streams to anon, authenticated;
grant select, insert on public.stream_chat_messages to authenticated;

create policy streams_anon_public_read
on public.streams for select to anon
using (visibility = 'public' and status in ('scheduled','live','ended'));

create policy streams_authenticated_read
on public.streams for select to authenticated
using (
  status in ('scheduled','live','ended')
  and (
    visibility = 'public'
    or private.current_profile_id() is not null
  )
  and (
    branch_id is null
    or exists (
      select 1 from public.profiles p
      where p.auth_user_id = (select auth.uid())
        and p.branch_id = streams.branch_id
    )
    or private.can_access_branch(branch_id)
    or private.has_permission('view_streams', branch_id)
  )
);

create policy stream_chat_read
on public.stream_chat_messages for select to authenticated
using (
  status = 'visible'
  and exists (
    select 1 from public.streams s
    where s.id = stream_id
      and (
        s.branch_id is null
        or exists (
          select 1 from public.profiles p
          where p.auth_user_id = (select auth.uid())
            and p.branch_id = s.branch_id
        )
        or private.can_access_branch(s.branch_id)
        or private.has_permission('view_streams', s.branch_id)
      )
      and (s.visibility = 'public' or private.current_profile_id() is not null)
  )
);

create policy stream_chat_insert_self
on public.stream_chat_messages for insert to authenticated
with check (
  sender_profile_id = private.current_profile_id()
  and exists (
    select 1 from public.streams s
    where s.id = stream_id
      and s.status = 'live'
      and (
        s.branch_id is null
        or exists (
          select 1 from public.profiles p
          where p.auth_user_id = (select auth.uid())
            and p.branch_id = s.branch_id
        )
        or private.can_access_branch(s.branch_id)
        or private.has_permission('send_stream_chat', s.branch_id)
      )
      and (s.visibility = 'public' or private.current_profile_id() is not null)
  )
);

commit;