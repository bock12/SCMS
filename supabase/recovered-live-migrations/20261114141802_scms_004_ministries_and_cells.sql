
begin;

-- Composite keys let PostgreSQL enforce branch consistency without trusting
-- client-supplied branch identifiers.
alter table public.profiles
  add constraint uq_profiles_id_branch unique (id, branch_id);

create table public.ministries (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid references public.church_branches(id) on delete restrict,
  name text not null,
  description text,
  entity_type text not null check (entity_type in ('ministry','department','fellowship')),
  category text,
  meeting_time text,
  roles_and_responsibilities jsonb not null default '[]'::jsonb,
  status text not null default 'active'
    check (status in ('active','inactive','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index uq_ministries_church_name
  on public.ministries (lower(name), entity_type)
  where branch_id is null and status = 'active';
create unique index uq_ministries_branch_name
  on public.ministries (branch_id, lower(name), entity_type)
  where branch_id is not null and status = 'active';

create table public.ministry_members (
  id uuid primary key default gen_random_uuid(),
  ministry_id uuid not null references public.ministries(id) on delete restrict,
  member_id uuid not null references public.profiles(id) on delete restrict,
  role_title text not null default 'Team Member',
  duty text,
  status text not null default 'active'
    check (status in ('active','on_leave','in_training','inactive')),
  joined_at date not null default current_date,
  created_by_profile_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (ministry_id, member_id)
);
create index ix_ministry_members_member on public.ministry_members (member_id);
create index ix_ministry_members_ministry on public.ministry_members (ministry_id);

create table public.cells (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.church_branches(id) on delete restrict,
  name text not null,
  description text,
  location text,
  meeting_day text,
  leader_id uuid,
  status text not null default 'active'
    check (status in ('active','inactive','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_cells_id_branch unique (id, branch_id),
  constraint uq_cells_branch_name unique (branch_id, name),
  constraint fk_cells_leader_same_branch
    foreign key (leader_id, branch_id)
    references public.profiles (id, branch_id)
    on delete set null (leader_id)
);

create table public.cell_members (
  id uuid primary key default gen_random_uuid(),
  cell_id uuid not null,
  member_id uuid not null,
  branch_id uuid not null,
  role text not null default 'member'
    check (role in ('member','leader','assistant_leader')),
  joined_at date not null default current_date,
  status text not null default 'active'
    check (status in ('active','inactive','transferred')),
  created_at timestamptz not null default now(),
  constraint fk_cell_members_cell_same_branch
    foreign key (cell_id, branch_id)
    references public.cells (id, branch_id)
    on delete restrict,
  constraint fk_cell_members_profile_same_branch
    foreign key (member_id, branch_id)
    references public.profiles (id, branch_id)
    on delete restrict,
  constraint uq_cell_member_pair unique (cell_id, member_id)
);

create unique index uq_cell_members_one_active_cell_per_branch
  on public.cell_members (member_id, branch_id)
  where status = 'active';
create index ix_cell_members_cell on public.cell_members (cell_id);
create index ix_cell_members_member on public.cell_members (member_id);

commit;