\set ON_ERROR_STOP on

-- Install the exact committed migration against the isolated fixture.
\ir ../supabase/migrations/20261126090000_warn_ambiguous_operational_account_mappings.sql

insert into public.church_settings values (1, 'SLE');
insert into public.districts values
 ('dddddddd-dddd-4ddd-8ddd-dddddddddddd'),
 ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee');
insert into public.church_branches values
 ('11111111-1111-4111-8111-111111111111','dddddddd-dddd-4ddd-8ddd-dddddddddddd','active'),
 ('22222222-2222-4222-8222-222222222222','dddddddd-dddd-4ddd-8ddd-dddddddddddd','active'),
 ('33333333-3333-4333-8333-333333333333','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','active');

insert into public.chart_of_accounts values
 ('10000000-0000-4000-8000-000000000001','1000','Cash','asset','debit'),
 ('10000000-0000-4000-8000-000000000002','1010','Bank','asset','debit');

-- Global inherited cash, two same-scope branch-A mappings, branch-B cash,
-- district-E cash, and a global USD bank account.
insert into public.financial_accounts values
 ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',null,null,'Church cash',true,'cash','SLE',null,null),
 ('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','dddddddd-dddd-4ddd-8ddd-dddddddddddd','Branch A cash',true,'cash','SLE',null,null),
 ('20000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','dddddddd-dddd-4ddd-8ddd-dddddddddddd','Branch A duplicate cash',true,'cash','SLE',null,null),
 ('20000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000001','22222222-2222-4222-8222-222222222222','dddddddd-dddd-4ddd-8ddd-dddddddddddd','Branch B cash',true,'cash','SLE',null,null),
 ('20000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000001',null,'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','District E cash',true,'cash','SLE',null,null),
 ('20000000-0000-4000-8000-000000000006','10000000-0000-4000-8000-000000000002',null,null,'Church USD bank',true,'bank','USD','Test Bank','USD-001');

insert into public.journal_entries values
 ('30000000-0000-4000-8000-000000000001','posted','SLE','11111111-1111-4111-8111-111111111111','dddddddd-dddd-4ddd-8ddd-dddddddddddd'),
 ('30000000-0000-4000-8000-000000000002','draft','SLE','11111111-1111-4111-8111-111111111111','dddddddd-dddd-4ddd-8ddd-dddddddddddd'),
 ('30000000-0000-4000-8000-000000000003','posted','SLE','22222222-2222-4222-8222-222222222222','dddddddd-dddd-4ddd-8ddd-dddddddddddd'),
 ('30000000-0000-4000-8000-000000000004','posted','SLE','33333333-3333-4333-8333-333333333333','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'),
 ('30000000-0000-4000-8000-000000000005','posted','USD','11111111-1111-4111-8111-111111111111','dddddddd-dddd-4ddd-8ddd-dddddddddddd');

insert into public.journal_lines values
 ('40000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',100,0),
 ('40000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001',500,0),
 ('40000000-0000-4000-8000-000000000003','30000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001',200,0),
 ('40000000-0000-4000-8000-000000000004','30000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000001',300,0),
 ('40000000-0000-4000-8000-000000000005','30000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000002',50,0);

-- Authenticated branch-A user: branch-A only, no church or district permission.
select set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',false);
select set_config('test.allowed_scope_id','11111111-1111-4111-8111-111111111111',false);

do $$
declare r jsonb; a jsonb; n integer;
begin
  r := public.get_finance_scope_operational_balances('branch','11111111-1111-4111-8111-111111111111');
  if (r->>'scope_type') <> 'branch' then raise exception 'branch scope not returned'; end if;
  select count(*) into n from jsonb_array_elements(r->'accounts') x
    where x->>'financial_account_id' in (
      '20000000-0000-4000-8000-000000000002',
      '20000000-0000-4000-8000-000000000003');
  if n <> 2 then raise exception 'branch A mappings missing'; end if;
  select x into a from jsonb_array_elements(r->'accounts') x
    where x->>'financial_account_id'='20000000-0000-4000-8000-000000000002';
  if (a->>'balance')::numeric <> 100 then raise exception 'posted branch-A balance incorrect: %',a; end if;
  if (a->>'mapping_count')::integer <> 2 or (a->>'mapping_is_ambiguous')::boolean is not true
    then raise exception 'duplicate mapping warning missing: %',a; end if;
  if exists (select 1 from jsonb_array_elements(r->'accounts') x
      where x->>'financial_account_id'='20000000-0000-4000-8000-000000000004')
    then raise exception 'branch A leaked branch B account'; end if;
  if exists (select 1 from jsonb_array_elements(r->'accounts') x
      where x->>'financial_account_id'='20000000-0000-4000-8000-000000000001'
        and (x->>'balance')::numeric <> 0)
    then raise exception 'inherited cash mapping double-counted branch A'; end if;
  select x into a from jsonb_array_elements(r->'accounts') x
    where x->>'financial_account_id'='20000000-0000-4000-8000-000000000006';
  if (a->>'balance')::numeric <> 50 then raise exception 'stored base-currency USD journal amount was not reported unchanged: %',a; end if;
end $$;

-- District scope requires district-level permission, and includes both
-- district branches without leaking another district's branch.
select set_config('test.allowed_scope_id','',false);
select set_config('test.allowed_district_id','dddddddd-dddd-4ddd-8ddd-dddddddddddd',false);
do $$
declare r jsonb;
begin
  r := public.get_finance_scope_operational_balances('district','dddddddd-dddd-4ddd-8ddd-dddddddddddd');
  if not exists (select 1 from jsonb_array_elements(r->'accounts') x
      where x->>'financial_account_id'='20000000-0000-4000-8000-000000000004'
        and (x->>'balance')::numeric=200)
    then raise exception 'district did not include branch B posted balance'; end if;
  if exists (select 1 from jsonb_array_elements(r->'accounts') x
      where x->>'financial_account_id'='20000000-0000-4000-8000-000000000005')
    then raise exception 'district scope leaked another district account'; end if;
end $$;

-- Church scope requires explicit church permission and includes both districts.
select set_config('test.allowed_district_id','',false);
select set_config('test.allow_church','true',false);
do $$
declare r jsonb; total numeric;
begin
  r := public.get_finance_scope_operational_balances('church',null);
  select coalesce(sum((x->>'balance')::numeric),0) into total
    from jsonb_array_elements(r->'accounts') x
    where x->>'operational_account_type'='cash';
  if total <> 600 then raise exception 'church-wide cash total expected 600, got %',total; end if;
end $$;

-- Unauthenticated and unauthorized access must be rejected.
select set_config('request.jwt.claim.sub','',false);
do $$
begin
  begin
    perform public.get_finance_scope_operational_balances('church',null);
    raise exception 'unauthenticated call unexpectedly succeeded';
  exception when others then
    if sqlerrm = 'unauthenticated call unexpectedly succeeded' then raise; end if;
  end;
end $$;

select set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',false);
select set_config('test.allow_church','false',false);
select set_config('test.allowed_district_id','',false);
select set_config('test.allowed_scope_id','',false);
do $$
begin
  begin
    perform public.get_finance_scope_operational_balances('church',null);
    raise exception 'unauthorized call unexpectedly succeeded';
  exception when others then
    if sqlerrm = 'unauthorized call unexpectedly succeeded' then raise; end if;
  end;
end $$;

\echo 'Operational balance PostgreSQL integration checks passed.'
