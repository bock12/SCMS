
begin;
create extension if not exists btree_gist;

create table public.chart_of_accounts (
  id uuid primary key default gen_random_uuid(),
  parent_account_id uuid references public.chart_of_accounts(id) on delete restrict,
  code text not null unique,
  name text not null,
  account_type text not null
    check (account_type in ('asset','liability','equity','income','expense')),
  normal_balance text not null
    check (normal_balance in ('debit','credit')),
  description text,
  is_control_account boolean not null default false,
  is_system boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint chart_account_code_nonblank check (length(trim(code)) > 0),
  constraint chart_account_name_nonblank check (length(trim(name)) > 0)
);
create index ix_chart_of_accounts_parent on public.chart_of_accounts (parent_account_id)
  where parent_account_id is not null;
create index ix_chart_of_accounts_type_active
  on public.chart_of_accounts (account_type, is_active);

create table public.funds (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  description text,
  fund_type text not null default 'general'
    check (fund_type in ('general','designated','restricted')),
  is_default boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint funds_name_nonblank check (length(trim(name)) > 0),
  constraint funds_code_nonblank check (length(trim(code)) > 0)
);
create unique index uq_funds_one_default
  on public.funds (is_default) where is_default = true;

create table public.financial_years (
  id uuid primary key default gen_random_uuid(),
  year_number integer not null unique
    check (year_number between 1900 and 9998),
  start_date date not null,
  end_date date not null,
  status text not null default 'open'
    check (status in ('open','closed')),
  created_at timestamptz not null default now(),
  constraint financial_year_calendar_dates check (
    start_date = make_date(year_number, 1, 1)
    and end_date = make_date(year_number, 12, 31)
  )
);

create table public.financial_periods (
  id uuid primary key default gen_random_uuid(),
  financial_year_id uuid not null
    references public.financial_years(id) on delete restrict,
  name text not null,
  start_date date not null,
  end_date date not null,
  status text not null default 'open'
    check (status in ('open','closed')),
  closed_by_profile_id uuid references public.profiles(id) on delete set null,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint financial_period_date_order check (start_date <= end_date),
  constraint financial_period_close_consistency check (
    (status = 'closed' and closed_at is not null)
    or status = 'open'
  ),
  constraint financial_periods_no_overlap
    exclude using gist (
      financial_year_id with =,
      daterange(start_date, end_date, '[]') with &&
    )
);
create index ix_financial_periods_year_dates
  on public.financial_periods (financial_year_id, start_date, end_date);
create index ix_financial_periods_closed_by
  on public.financial_periods (closed_by_profile_id)
  where closed_by_profile_id is not null;

create or replace function private.validate_financial_period()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_year public.financial_years%rowtype;
begin
  select * into v_year
  from public.financial_years
  where id = new.financial_year_id;

  if not found then
    raise exception 'Financial year does not exist';
  end if;

  if new.start_date < v_year.start_date or new.end_date > v_year.end_date then
    raise exception 'Financial period must be within its financial year';
  end if;

  return new;
end;
$$;

create trigger trg_validate_financial_period
before insert or update of financial_year_id, start_date, end_date
on public.financial_periods
for each row execute function private.validate_financial_period();

create table public.financial_accounts (
  id uuid primary key default gen_random_uuid(),
  chart_account_id uuid not null
    references public.chart_of_accounts(id) on delete restrict,
  branch_id uuid references public.church_branches(id) on delete restrict,
  name text not null,
  account_type text not null
    check (account_type in ('cash','bank','mobile_money','clearing')),
  currency_code char(3) not null
    references public.currencies(code) on update restrict on delete restrict,
  provider_name text,
  account_reference text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint financial_account_name_nonblank check (length(trim(name)) > 0)
);
create index ix_financial_accounts_chart_account
  on public.financial_accounts (chart_account_id);
create index ix_financial_accounts_branch
  on public.financial_accounts (branch_id);
create index ix_financial_accounts_currency
  on public.financial_accounts (currency_code);

insert into public.permissions (key, module, description) values
  ('manage_chart_of_accounts', 'finance', 'Manage the church chart of accounts'),
  ('manage_financial_periods', 'finance', 'Open and close financial periods')
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on
  (r.name in ('super_admin','admin','finance_officer')
    and p.key in ('manage_chart_of_accounts','manage_financial_periods'))
on conflict do nothing;

alter table public.chart_of_accounts enable row level security;
alter table public.funds enable row level security;
alter table public.financial_years enable row level security;
alter table public.financial_periods enable row level security;
alter table public.financial_accounts enable row level security;

revoke all on public.chart_of_accounts, public.funds,
  public.financial_years, public.financial_periods, public.financial_accounts
from anon, authenticated;
grant select on public.chart_of_accounts, public.funds,
  public.financial_years, public.financial_periods, public.financial_accounts
to authenticated;

create policy chart_of_accounts_finance_read
on public.chart_of_accounts for select to authenticated
using (
  private.has_permission('view_finances', null)
  or exists (
    select 1 from public.church_branches b
    where private.has_permission('view_finances', b.id)
  )
);

create policy funds_finance_read
on public.funds for select to authenticated
using (
  private.has_permission('view_finances', null)
  or exists (
    select 1 from public.church_branches b
    where private.has_permission('view_finances', b.id)
  )
);

create policy financial_years_finance_read
on public.financial_years for select to authenticated
using (
  private.has_permission('view_finances', null)
  or exists (
    select 1 from public.church_branches b
    where private.has_permission('view_finances', b.id)
  )
);

create policy financial_periods_finance_read
on public.financial_periods for select to authenticated
using (
  private.has_permission('view_finances', null)
  or exists (
    select 1 from public.church_branches b
    where private.has_permission('view_finances', b.id)
  )
);

create policy financial_accounts_finance_read
on public.financial_accounts for select to authenticated
using (
  (branch_id is null and private.has_permission('view_finances', null))
  or (branch_id is not null and private.has_permission('view_finances', branch_id))
);

commit;