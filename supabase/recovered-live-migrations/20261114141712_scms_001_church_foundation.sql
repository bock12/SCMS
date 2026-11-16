
begin;
create extension if not exists pgcrypto;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

create table public.currencies (
  code char(3) primary key,
  name text not null,
  symbol text,
  minor_units smallint not null default 2 check (minor_units between 0 and 4),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint currencies_code_uppercase check (code = upper(code))
);

insert into public.currencies (code, name, symbol, minor_units)
values ('SLE', 'Sierra Leonean Leone', 'Le', 2)
on conflict (code) do nothing;

create table public.church_settings (
  id smallint primary key default 1 check (id = 1),
  church_name text not null,
  subtitle text,
  senior_pastor_name text,
  email text,
  phone text,
  address text,
  city text,
  country text not null default 'Sierra Leone',
  logo_url text,
  website_url text,
  mission text,
  primary_color text,
  secondary_color text,
  service_times jsonb not null default '[]'::jsonb,
  base_currency_code char(3) not null default 'SLE'
    references public.currencies(code) on update restrict on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.districts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  region text,
  country text,
  description text,
  status text not null default 'active'
    check (status in ('active', 'inactive', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index uq_districts_active_name
  on public.districts (lower(name)) where status = 'active';

create table public.church_branches (
  id uuid primary key default gen_random_uuid(),
  district_id uuid references public.districts(id) on delete set null,
  name text not null,
  code text not null,
  address text,
  city text,
  state_or_region text,
  country text not null default 'Sierra Leone',
  phone text,
  email text,
  latitude numeric(9,6),
  longitude numeric(9,6),
  is_main_branch boolean not null default false,
  status text not null default 'active'
    check (status in ('active', 'inactive', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint church_branches_code_nonblank check (length(trim(code)) > 0),
  constraint church_branches_latitude_range check (latitude is null or latitude between -90 and 90),
  constraint church_branches_longitude_range check (longitude is null or longitude between -180 and 180)
);
create unique index uq_church_branches_code on public.church_branches (upper(code));
create unique index uq_church_branches_one_active_main
  on public.church_branches (is_main_branch)
  where is_main_branch = true and status = 'active';
create index ix_church_branches_district_id on public.church_branches (district_id);
commit;