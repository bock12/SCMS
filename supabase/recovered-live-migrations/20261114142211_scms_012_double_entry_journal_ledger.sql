
begin;

create table public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  entry_number bigint generated always as identity unique,
  period_id uuid not null references public.financial_periods(id) on delete restrict,
  branch_id uuid references public.church_branches(id) on delete restrict,
  entry_date date not null,
  description text not null,
  reference text,
  currency_code char(3) not null references public.currencies(code),
  exchange_rate_to_base numeric(20,8) not null default 1
    check (exchange_rate_to_base > 0),
  base_currency_code char(3) not null references public.currencies(code),
  status text not null default 'draft'
    check (status in ('draft','posted')),
  source_type text,
  source_id uuid,
  reversal_of_entry_id uuid
    references public.journal_entries(id) on delete restrict,
  created_by_profile_id uuid references public.profiles(id) on delete set null,
  approved_by_profile_id uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  posted_at timestamptz,
  created_at timestamptz not null default now(),
  constraint journal_entry_description_nonblank
    check (length(trim(description)) > 0),
  constraint journal_entry_base_rate check (
    currency_code <> base_currency_code or exchange_rate_to_base = 1
  ),
  constraint journal_entry_not_self_reversal check (
    reversal_of_entry_id is null or reversal_of_entry_id <> id
  ),
  constraint journal_entry_posted_timestamp check (
    (status = 'posted' and posted_at is not null)
    or (status = 'draft' and posted_at is null)
  )
);

create unique index uq_journal_one_reversal_per_entry
  on public.journal_entries (reversal_of_entry_id)
  where reversal_of_entry_id is not null;
create index ix_journal_entries_period_date
  on public.journal_entries (period_id, entry_date);
create index ix_journal_entries_branch_date
  on public.journal_entries (branch_id, entry_date);
create index ix_journal_entries_currency
  on public.journal_entries (currency_code);
create index ix_journal_entries_created_by
  on public.journal_entries (created_by_profile_id)
  where created_by_profile_id is not null;
create index ix_journal_entries_approved_by
  on public.journal_entries (approved_by_profile_id)
  where approved_by_profile_id is not null;

create table public.journal_lines (
  id uuid primary key default gen_random_uuid(),
  journal_entry_id uuid not null
    references public.journal_entries(id) on delete restrict,
  line_number integer not null,
  account_id uuid not null
    references public.chart_of_accounts(id) on delete restrict,
  fund_id uuid references public.funds(id) on delete restrict,
  branch_id uuid references public.church_branches(id) on delete restrict,
  profile_id uuid references public.profiles(id) on delete restrict,
  description text,
  debit_amount numeric(20,4) not null default 0,
  credit_amount numeric(20,4) not null default 0,
  base_debit_amount numeric(20,4) not null default 0,
  base_credit_amount numeric(20,4) not null default 0,
  created_at timestamptz not null default now(),
  constraint journal_line_number_positive check (line_number > 0),
  constraint journal_line_amounts_nonnegative check (
    debit_amount >= 0 and credit_amount >= 0
    and base_debit_amount >= 0 and base_credit_amount >= 0
  ),
  constraint journal_line_one_side_only check (
    (debit_amount > 0 and credit_amount = 0
      and base_debit_amount > 0 and base_credit_amount = 0)
    or
    (credit_amount > 0 and debit_amount = 0
      and base_credit_amount > 0 and base_debit_amount = 0)
  ),
  constraint uq_journal_line_number unique (journal_entry_id, line_number)
);
create index ix_journal_lines_account on public.journal_lines (account_id);
create index ix_journal_lines_fund on public.journal_lines (fund_id)
  where fund_id is not null;
create index ix_journal_lines_branch on public.journal_lines (branch_id)
  where branch_id is not null;
create index ix_journal_lines_profile on public.journal_lines (profile_id)
  where profile_id is not null;

create or replace function private.prevent_posted_journal_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_status text;
begin
  if tg_table_name = 'journal_entries' then
    if tg_op = 'DELETE' and old.status = 'posted' then
      raise exception 'Posted journal entries cannot be deleted';
    end if;
    if tg_op = 'UPDATE' and old.status = 'posted' then
      raise exception 'Posted journal entries are immutable';
    end if;
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'DELETE' then
    select status into v_status
    from public.journal_entries where id = old.journal_entry_id;
  else
    select status into v_status
    from public.journal_entries where id = new.journal_entry_id;
  end if;

  if v_status is distinct from 'draft' then
    raise exception 'Journal lines can only be changed while the entry is draft';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger trg_journal_entry_immutable
before update or delete on public.journal_entries
for each row execute function private.prevent_posted_journal_mutation();

create trigger trg_journal_lines_draft_only
before insert or update or delete on public.journal_lines
for each row execute function private.prevent_posted_journal_mutation();

create or replace function private.post_journal_entry(p_entry_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry public.journal_entries%rowtype;
  v_period public.financial_periods%rowtype;
  v_year public.financial_years%rowtype;
  v_base_currency char(3);
  v_line_count integer;
  v_debits numeric(24,4);
  v_credits numeric(24,4);
  v_base_debits numeric(24,4);
  v_base_credits numeric(24,4);
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  select * into v_entry
  from public.journal_entries
  where id = p_entry_id
  for update;

  if not found then raise exception 'Journal entry not found'; end if;
  if v_entry.status <> 'draft' then
    raise exception 'Only draft journal entries can be posted';
  end if;

  if not private.has_permission('post_journals', v_entry.branch_id) then
    raise exception 'Insufficient permission to post journals';
  end if;

  select * into v_period
  from public.financial_periods
  where id = v_entry.period_id;

  if not found or v_period.status <> 'open' then
    raise exception 'Journal entry period is not open';
  end if;

  if v_entry.entry_date < v_period.start_date
     or v_entry.entry_date > v_period.end_date then
    raise exception 'Journal entry date is outside its financial period';
  end if;

  select * into v_year
  from public.financial_years
  where id = v_period.financial_year_id;

  if not found or v_year.status <> 'open' then
    raise exception 'Financial year is not open';
  end if;

  select base_currency_code into v_base_currency
  from public.church_settings
  where id = 1;

  if v_base_currency is null then
    raise exception 'Complete church settings before posting financial entries';
  end if;

  if v_entry.base_currency_code <> v_base_currency then
    raise exception 'Journal base currency does not match church base currency';
  end if;

  if v_entry.currency_code = v_entry.base_currency_code
     and v_entry.exchange_rate_to_base <> 1 then
    raise exception 'Exchange rate must be 1 for the base currency';
  end if;

  if exists (
    select 1
    from public.journal_lines jl
    join public.chart_of_accounts coa on coa.id = jl.account_id
    where jl.journal_entry_id = p_entry_id
      and not coa.is_active
  ) then
    raise exception 'Journal contains an inactive chart-of-accounts entry';
  end if;

  if v_entry.branch_id is not null and exists (
    select 1 from public.journal_lines jl
    where jl.journal_entry_id = p_entry_id
      and jl.branch_id is not null
      and jl.branch_id <> v_entry.branch_id
  ) then
    raise exception 'Journal line branch does not match journal branch';
  end if;

  select count(*),
         coalesce(sum(debit_amount),0),
         coalesce(sum(credit_amount),0),
         coalesce(sum(base_debit_amount),0),
         coalesce(sum(base_credit_amount),0)
  into v_line_count, v_debits, v_credits, v_base_debits, v_base_credits
  from public.journal_lines
  where journal_entry_id = p_entry_id;

  if v_line_count < 2 then
    raise exception 'A journal entry must contain at least two lines';
  end if;

  if v_debits <> v_credits then
    raise exception 'Journal is not balanced in transaction currency';
  end if;

  if v_base_debits <> v_base_credits then
    raise exception 'Journal is not balanced in base currency';
  end if;

  if exists (
    select 1
    from public.journal_lines jl
    where jl.journal_entry_id = p_entry_id
      and (
        (jl.debit_amount > 0 and
          jl.base_debit_amount <> round(jl.debit_amount * v_entry.exchange_rate_to_base, 4))
        or
        (jl.credit_amount > 0 and
          jl.base_credit_amount <> round(jl.credit_amount * v_entry.exchange_rate_to_base, 4))
      )
  ) then
    raise exception 'Journal line base amount does not match the recorded exchange rate';
  end if;

  update public.journal_entries
  set status = 'posted',
      posted_at = now()
  where id = p_entry_id;
end;
$$;

create or replace function private.reverse_journal_entry(
  p_entry_id uuid,
  p_reversal_date date,
  p_description text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_original public.journal_entries%rowtype;
  v_period_id uuid;
  v_reversal_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  select * into v_original
  from public.journal_entries
  where id = p_entry_id
  for update;

  if not found or v_original.status <> 'posted' then
    raise exception 'Only posted journal entries can be reversed';
  end if;

  if not private.has_permission('post_journals', v_original.branch_id) then
    raise exception 'Insufficient permission to reverse this journal';
  end if;

  if exists (
    select 1 from public.journal_entries
    where reversal_of_entry_id = p_entry_id
  ) then
    raise exception 'This journal entry has already been reversed';
  end if;

  select fp.id into v_period_id
  from public.financial_periods fp
  join public.financial_years fy on fy.id = fp.financial_year_id
  where fp.status = 'open'
    and fy.status = 'open'
    and p_reversal_date between fp.start_date and fp.end_date
  limit 1;

  if v_period_id is null then
    raise exception 'No open financial period exists for the reversal date';
  end if;

  insert into public.journal_entries (
    period_id, branch_id, entry_date, description, reference,
    currency_code, exchange_rate_to_base, base_currency_code,
    source_type, source_id, reversal_of_entry_id, created_by_profile_id
  )
  values (
    v_period_id, v_original.branch_id, p_reversal_date,
    coalesce(p_description, 'Reversal of journal ' || v_original.entry_number),
    v_original.reference, v_original.currency_code,
    v_original.exchange_rate_to_base, v_original.base_currency_code,
    'reversal', v_original.id, v_original.id, private.current_profile_id()
  )
  returning id into v_reversal_id;

  insert into public.journal_lines (
    journal_entry_id, line_number, account_id, fund_id, branch_id,
    profile_id, description, debit_amount, credit_amount,
    base_debit_amount, base_credit_amount
  )
  select
    v_reversal_id, line_number, account_id, fund_id, branch_id,
    profile_id, description, credit_amount, debit_amount,
    base_credit_amount, base_debit_amount
  from public.journal_lines
  where journal_entry_id = p_entry_id
  order by line_number;

  perform private.post_journal_entry(v_reversal_id);
  return v_reversal_id;
end;
$$;

revoke all on function private.post_journal_entry(uuid)
  from public, anon, authenticated;
revoke all on function private.reverse_journal_entry(uuid, date, text)
  from public, anon, authenticated;
grant execute on function private.post_journal_entry(uuid)
  to authenticated;
grant execute on function private.reverse_journal_entry(uuid, date, text)
  to authenticated;

alter table public.journal_entries enable row level security;
alter table public.journal_lines enable row level security;

revoke all on public.journal_entries, public.journal_lines
from anon, authenticated;
grant select on public.journal_entries, public.journal_lines to authenticated;

create policy journal_entries_finance_read
on public.journal_entries for select to authenticated
using (
  (branch_id is null and private.has_permission('view_finances', null))
  or (branch_id is not null and private.has_permission('view_finances', branch_id))
);

create policy journal_lines_finance_read
on public.journal_lines for select to authenticated
using (
  exists (
    select 1 from public.journal_entries je
    where je.id = journal_entry_id
  )
);

commit;