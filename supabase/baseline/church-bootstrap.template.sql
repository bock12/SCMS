-- SCMS church-specific bootstrap template.
-- EDIT the placeholder values before running this script on a FRESH database
-- after the canonical baseline has been replay-tested.
-- Do not run this template on SCMS-Development.
--
-- This template does not create an Auth user or grant super_admin.
-- Create/invite the first Auth user through Supabase Authentication, then
-- link that user to a profile and assign the church-scoped super_admin role
-- through a reviewed, one-time bootstrap procedure.

begin;

insert into public.church_settings (
  id, church_name, country, base_currency_code
)
select
  1, 'REPLACE WITH CHURCH NAME', 'Sierra Leone', 'SLE'
where not exists (
  select 1 from public.church_settings where id = 1
);

insert into public.church_branches (
  name, code, country, is_main_branch, status
)
select
  'REPLACE WITH MAIN BRANCH NAME', 'MAIN', 'Sierra Leone', true, 'active'
where not exists (
  select 1 from public.church_branches where upper(code) = 'MAIN'
);

-- Create the current calendar year and its 12 monthly periods.
-- Existing periods are preserved; this does not reopen or overwrite closed periods.
insert into public.financial_years (year_number, start_date, end_date, status)
select
  extract(year from current_date)::integer,
  make_date(extract(year from current_date)::integer, 1, 1),
  make_date(extract(year from current_date)::integer, 12, 31),
  'open'
on conflict (year_number) do nothing;

with current_year as (
  select id, year_number, start_date
  from public.financial_years
  where year_number = extract(year from current_date)::integer
),
months as (
  select
    y.id as financial_year_id,
    y.year_number,
    g.month_number,
    make_date(y.year_number, g.month_number, 1) as month_start,
    (make_date(y.year_number, g.month_number, 1)
      + interval '1 month - 1 day')::date as month_end
  from current_year y
  cross join generate_series(1, 12) as g(month_number)
)
insert into public.financial_periods (
  financial_year_id, name, start_date, end_date, status
)
select
  financial_year_id,
  to_char(month_start, 'FMMonth YYYY'),
  month_start,
  month_end,
  'open'
from months m
where not exists (
  select 1
  from public.financial_periods p
  where p.financial_year_id = m.financial_year_id
    and p.start_date = m.month_start
    and p.end_date = m.month_end
);

commit;

-- Still required before financial operations:
-- 1. Review and load the church-specific chart of accounts.
-- 2. Create the required funds.
-- 3. Configure and test threshold-based approval policies and approver permissions.
-- 4. Provision the first Auth user separately and create its linked profiles row.
