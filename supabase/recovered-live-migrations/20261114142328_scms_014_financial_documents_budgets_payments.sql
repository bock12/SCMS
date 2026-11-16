
begin;

create table public.financial_documents (
  id uuid primary key default gen_random_uuid(),
  document_number bigint generated always as identity unique,
  document_type text not null
    check (document_type in ('receipt','payment','transfer','adjustment')),
  transaction_date date not null,
  branch_id uuid references public.church_branches(id) on delete restrict,
  profile_id uuid references public.profiles(id) on delete restrict,
  payee_or_payer_name text not null,
  amount numeric(20,4) not null check (amount > 0),
  currency_code char(3) not null references public.currencies(code),
  payment_method text not null
    check (payment_method in ('cash','bank_transfer','mobile_money','card','cheque','other')),
  financial_account_id uuid references public.financial_accounts(id) on delete restrict,
  external_reference text,
  description text,
  status text not null default 'draft'
    check (status in ('draft','pending_approval','approved','rejected','posted','cancelled')),
  journal_entry_id uuid unique
    references public.journal_entries(id) on delete restrict,
  approval_request_id uuid,
  created_by_profile_id uuid references public.profiles(id) on delete set null,
  approved_by_profile_id uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint financial_document_party_nonblank
    check (length(trim(payee_or_payer_name)) > 0),
  constraint financial_document_approval_consistency check (
    (status = 'approved' and approved_at is not null)
    or status <> 'approved'
  ),
  constraint financial_document_posted_has_journal check (
    status <> 'posted' or journal_entry_id is not null
  )
);
create index ix_financial_documents_date
  on public.financial_documents (transaction_date desc);
create index ix_financial_documents_branch_date
  on public.financial_documents (branch_id, transaction_date desc);
create index ix_financial_documents_profile
  on public.financial_documents (profile_id) where profile_id is not null;
create index ix_financial_documents_account
  on public.financial_documents (financial_account_id)
  where financial_account_id is not null;
create index ix_financial_documents_journal
  on public.financial_documents (journal_entry_id)
  where journal_entry_id is not null;
create index ix_financial_documents_created_by
  on public.financial_documents (created_by_profile_id)
  where created_by_profile_id is not null;
create index ix_financial_documents_approved_by
  on public.financial_documents (approved_by_profile_id)
  where approved_by_profile_id is not null;

create table public.giving_records (
  id uuid primary key default gen_random_uuid(),
  financial_document_id uuid not null unique
    references public.financial_documents(id) on delete restrict,
  giver_profile_id uuid references public.profiles(id) on delete set null,
  giver_name text not null,
  giving_type text not null
    check (giving_type in ('tithe','offering','donation','pledge','other')),
  fund_id uuid references public.funds(id) on delete restrict,
  campaign_or_appeal text,
  created_at timestamptz not null default now(),
  constraint giving_record_giver_name_nonblank
    check (length(trim(giver_name)) > 0)
);
create index ix_giving_records_giver
  on public.giving_records (giver_profile_id)
  where giver_profile_id is not null;
create index ix_giving_records_fund
  on public.giving_records (fund_id)
  where fund_id is not null;

create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  budget_type text not null
    check (budget_type in ('annual','monthly','department','event','other')),
  branch_id uuid references public.church_branches(id) on delete restrict,
  event_id uuid references public.events(id) on delete restrict,
  period_id uuid not null references public.financial_periods(id) on delete restrict,
  currency_code char(3) not null references public.currencies(code),
  status text not null default 'draft'
    check (status in ('draft','pending_approval','approved','rejected','closed')),
  submitted_by_profile_id uuid references public.profiles(id) on delete set null,
  approved_by_profile_id uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint budget_name_nonblank check (length(trim(name)) > 0),
  constraint budget_approval_consistency check (
    (status = 'approved' and approved_at is not null)
    or status <> 'approved'
  )
);
create index ix_budgets_period on public.budgets (period_id);
create index ix_budgets_branch_period on public.budgets (branch_id, period_id);
create index ix_budgets_event on public.budgets (event_id) where event_id is not null;
create index ix_budgets_submitted_by on public.budgets (submitted_by_profile_id)
  where submitted_by_profile_id is not null;
create index ix_budgets_approved_by on public.budgets (approved_by_profile_id)
  where approved_by_profile_id is not null;

create table public.budget_lines (
  id uuid primary key default gen_random_uuid(),
  budget_id uuid not null references public.budgets(id) on delete restrict,
  account_id uuid references public.chart_of_accounts(id) on delete restrict,
  fund_id uuid references public.funds(id) on delete restrict,
  description text,
  allocated_amount numeric(20,4) not null check (allocated_amount >= 0),
  created_at timestamptz not null default now()
);
create index ix_budget_lines_budget on public.budget_lines (budget_id);
create index ix_budget_lines_account on public.budget_lines (account_id)
  where account_id is not null;
create index ix_budget_lines_fund on public.budget_lines (fund_id)
  where fund_id is not null;

create table public.payment_gateway_transactions (
  id uuid primary key default gen_random_uuid(),
  financial_document_id uuid
    references public.financial_documents(id) on delete restrict,
  provider text not null,
  provider_transaction_id text,
  idempotency_key text,
  amount numeric(20,4) not null check (amount > 0),
  currency_code char(3) not null references public.currencies(code),
  status text not null default 'initiated'
    check (status in ('initiated','pending','successful','failed','cancelled','refunded')),
  received_at timestamptz,
  created_at timestamptz not null default now(),
  constraint payment_gateway_provider_nonblank check (length(trim(provider)) > 0)
);
create unique index uq_payment_gateway_provider_transaction
  on public.payment_gateway_transactions (provider, provider_transaction_id)
  where provider_transaction_id is not null;
create unique index uq_payment_gateway_idempotency
  on public.payment_gateway_transactions (idempotency_key)
  where idempotency_key is not null;
create index ix_payment_gateway_document
  on public.payment_gateway_transactions (financial_document_id)
  where financial_document_id is not null;
create index ix_payment_gateway_status_created
  on public.payment_gateway_transactions (status, created_at desc);

create table private.payment_gateway_payloads (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null
    references public.payment_gateway_transactions(id) on delete restrict,
  provider_payload jsonb not null,
  received_at timestamptz not null default now()
);
alter table private.payment_gateway_payloads enable row level security;
revoke all on private.payment_gateway_payloads
  from public, anon, authenticated, service_role;
create policy payment_gateway_payloads_deny_all
on private.payment_gateway_payloads for all to public
using (false) with check (false);

alter table public.financial_documents enable row level security;
alter table public.giving_records enable row level security;
alter table public.budgets enable row level security;
alter table public.budget_lines enable row level security;
alter table public.payment_gateway_transactions enable row level security;

revoke all on public.financial_documents, public.giving_records,
  public.budgets, public.budget_lines, public.payment_gateway_transactions
from anon, authenticated;
grant select on public.financial_documents, public.giving_records,
  public.budgets, public.budget_lines, public.payment_gateway_transactions
to authenticated;

create policy financial_documents_finance_or_party_read
on public.financial_documents for select to authenticated
using (
  (branch_id is null and private.has_permission('view_finances', null))
  or (branch_id is not null and private.has_permission('view_finances', branch_id))
  or profile_id = private.current_profile_id()
);

create policy giving_records_finance_or_giver_read
on public.giving_records for select to authenticated
using (
  giver_profile_id = private.current_profile_id()
  or exists (
    select 1 from public.financial_documents fd
    where fd.id = financial_document_id
      and (
        (fd.branch_id is null and private.has_permission('view_finances', null))
        or (fd.branch_id is not null and private.has_permission('view_finances', fd.branch_id))
      )
  )
);

create policy budgets_finance_read
on public.budgets for select to authenticated
using (
  (branch_id is null and private.has_permission('view_finances', null))
  or (branch_id is not null and private.has_permission('view_finances', branch_id))
);

create policy budget_lines_finance_read
on public.budget_lines for select to authenticated
using (
  exists (
    select 1 from public.budgets b
    where b.id = budget_id
  )
);

create policy payment_gateway_finance_read
on public.payment_gateway_transactions for select to authenticated
using (
  exists (
    select 1 from public.financial_documents fd
    where fd.id = financial_document_id
      and (
        (fd.branch_id is null and private.has_permission('view_finances', null))
        or (fd.branch_id is not null and private.has_permission('view_finances', fd.branch_id))
      )
  )
  or private.has_permission('view_finances', null)
);

commit;