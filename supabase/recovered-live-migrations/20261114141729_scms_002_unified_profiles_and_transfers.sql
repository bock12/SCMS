
begin;

create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique
    references auth.users(id) on delete set null,
  branch_id uuid
    references public.church_branches(id) on delete restrict,

  first_name text not null,
  last_name text not null,
  email text,
  phone text,
  gender text,
  date_of_birth date,
  marital_status text,
  marriage_date date,
  avatar_url text,

  membership_date date,
  membership_status text not null default 'active'
    check (membership_status in ('active','inactive','suspended','transferred','archived')),

  is_baptized boolean not null default false,
  baptism_date date,
  baptized_by_profile_id uuid
    references public.profiles(id) on delete set null,
  baptized_by_name_snapshot text,

  portal_access_status text not null default 'not_invited'
    check (portal_access_status in ('not_invited','invited','active','suspended')),
  record_status text not null default 'active'
    check (record_status in ('active','archived')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint profiles_active_portal_requires_auth
    check (portal_access_status <> 'active' or auth_user_id is not null)
);

create index ix_profiles_branch_id on public.profiles (branch_id);
create index ix_profiles_membership_status on public.profiles (membership_status);
create index ix_profiles_name on public.profiles (lower(last_name), lower(first_name));
create index ix_profiles_email_lower on public.profiles (lower(email)) where email is not null;

create or replace function private.normalize_profile_portal_state()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.auth_user_id is null
     and old.auth_user_id is not null
     and new.portal_access_status = 'active' then
    new.portal_access_status := 'suspended';
  end if;
  return new;
end;
$$;

create trigger trg_normalize_profile_portal_state
before update of auth_user_id on public.profiles
for each row execute function private.normalize_profile_portal_state();

create table public.member_transfers (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.profiles(id) on delete restrict,
  from_branch_id uuid references public.church_branches(id) on delete restrict,
  to_branch_id uuid not null references public.church_branches(id) on delete restrict,
  status text not null default 'pending'
    check (status in ('pending','approved','rejected','cancelled')),
  requested_at timestamptz not null default now(),
  requested_by_profile_id uuid references public.profiles(id) on delete set null,
  approved_by_profile_id uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  constraint member_transfers_different_branches
    check (from_branch_id is distinct from to_branch_id),
  constraint member_transfers_approval_consistency
    check ((status = 'approved' and approved_at is not null) or status <> 'approved')
);

create unique index uq_member_transfers_one_pending_per_member
  on public.member_transfers (member_id) where status = 'pending';
create index ix_member_transfers_member on public.member_transfers (member_id);
create index ix_member_transfers_status on public.member_transfers (status);

commit;