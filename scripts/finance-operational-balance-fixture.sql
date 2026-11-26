-- Isolated PostgreSQL fixture for the operational-balance RPC.
-- This deliberately models only the tables/columns consumed by the function;
-- it does not connect to or recreate a Supabase project.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin;

create schema auth;
create schema private;

create or replace function auth.uid()
returns uuid
language sql stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

create or replace function private.current_profile_id()
returns uuid
language sql stable
as $$
  select case when auth.uid() is null then null
    else 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid end
$$;

create or replace function private.has_permission(p_permission text, p_scope_id uuid)
returns boolean
language sql stable
as $$
  select coalesce(current_setting('test.allow_church', true), 'false') = 'true'
      and p_scope_id is null
    or coalesce(current_setting('test.allowed_scope_id', true), '') <> ''
      and p_scope_id = current_setting('test.allowed_scope_id', true)::uuid
      and p_permission in ('view_finances','manage_finances','approve_finances','post_journals')
$$;

create or replace function private.has_permission_for_district(p_permission text, p_district_id uuid)
returns boolean
language sql stable
as $$
  select coalesce(current_setting('test.allowed_district_id', true), '') <> ''
     and p_district_id = current_setting('test.allowed_district_id', true)::uuid
     and p_permission in ('view_finances','manage_finances','approve_finances','post_journals')
$$;

create table public.church_settings (
  id smallint primary key,
  base_currency_code char(3) not null
);
create table public.districts (id uuid primary key);
create table public.church_branches (
  id uuid primary key,
  district_id uuid,
  status text not null
);
create table public.chart_of_accounts (
  id uuid primary key,
  code text not null,
  name text not null,
  account_type text not null,
  normal_balance text not null
);
create table public.financial_accounts (
  id uuid primary key,
  chart_account_id uuid not null,
  branch_id uuid,
  district_id uuid,
  name text not null,
  is_active boolean not null,
  account_type text not null,
  currency_code char(3) not null,
  provider_name text,
  account_reference text
);
create table public.journal_entries (
  id uuid primary key,
  status text not null,
  currency_code char(3) not null,
  branch_id uuid,
  district_id uuid
);
create table public.journal_lines (
  id uuid primary key,
  journal_entry_id uuid not null,
  account_id uuid not null,
  base_debit_amount numeric not null default 0,
  base_credit_amount numeric not null default 0
);
