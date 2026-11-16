
begin;
create index if not exists ix_welfare_campaigns_currency
  on public.welfare_campaigns (currency_code);
create index if not exists ix_welfare_cases_member_branch
  on public.welfare_cases (member_id, branch_id);
commit;