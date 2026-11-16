
begin;
set local search_path = public, extensions;

create table public.approval_policies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  transaction_type text not null
    check (transaction_type in ('financial_document','journal_entry','budget','requisition')),
  branch_id uuid references public.church_branches(id) on delete restrict,
  version integer not null check (version > 0),
  effective_from date not null,
  effective_to date,
  is_active boolean not null default true,
  created_by_profile_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint approval_policy_effective_dates check (
    effective_to is null or effective_to >= effective_from
  ),
  constraint approval_policy_name_nonblank check (length(trim(name)) > 0)
);
create unique index uq_approval_policy_version_scope
  on public.approval_policies (
    transaction_type,
    coalesce(branch_id, '00000000-0000-0000-0000-000000000000'::uuid),
    version
  );
create index ix_approval_policies_active_scope
  on public.approval_policies (transaction_type, branch_id, is_active, effective_from);

create table public.approval_policy_bands (
  id uuid primary key default gen_random_uuid(),
  policy_id uuid not null references public.approval_policies(id) on delete restrict,
  min_amount_base numeric(20,4) not null default 0
    check (min_amount_base >= 0),
  max_amount_base numeric(20,4),
  created_at timestamptz not null default now(),
  constraint approval_band_range check (
    max_amount_base is null or max_amount_base > min_amount_base
  ),
  constraint approval_bands_no_overlap
    exclude using gist (
      policy_id with =,
      numrange(min_amount_base, max_amount_base, '[)') with &&
    )
);
create index ix_approval_policy_bands_policy
  on public.approval_policy_bands (policy_id);

create table public.approval_policy_steps (
  id uuid primary key default gen_random_uuid(),
  band_id uuid not null references public.approval_policy_bands(id) on delete restrict,
  step_number integer not null check (step_number > 0),
  required_permission_key text not null
    references public.permissions(key) on update cascade on delete restrict,
  required_approvals integer not null default 1
    check (required_approvals > 0),
  prohibit_submitter_approval boolean not null default true,
  created_at timestamptz not null default now(),
  unique (band_id, step_number)
);

create table public.approval_requests (
  id uuid primary key default gen_random_uuid(),
  transaction_type text not null
    check (transaction_type in ('financial_document','journal_entry','budget','requisition')),
  target_id uuid not null,
  branch_id uuid references public.church_branches(id) on delete restrict,
  policy_id uuid references public.approval_policies(id) on delete restrict,
  policy_version integer,
  band_id uuid references public.approval_policy_bands(id) on delete restrict,
  amount_base numeric(20,4) not null check (amount_base >= 0),
  status text not null default 'pending'
    check (status in ('pending','approved','rejected','cancelled')),
  submitted_by_profile_id uuid not null
    references public.profiles(id) on delete restrict,
  submitted_at timestamptz not null default now(),
  completed_at timestamptz,
  policy_snapshot jsonb not null default '{}'::jsonb,
  constraint approval_request_completion check (
    (status in ('approved','rejected','cancelled') and completed_at is not null)
    or status = 'pending'
  )
);
create unique index uq_approval_request_one_pending_target
  on public.approval_requests (transaction_type, target_id)
  where status = 'pending';
create index ix_approval_requests_branch_status
  on public.approval_requests (branch_id, status, submitted_at desc);
create index ix_approval_requests_submitter
  on public.approval_requests (submitted_by_profile_id, submitted_at desc);

create table public.approval_request_steps (
  id uuid primary key default gen_random_uuid(),
  approval_request_id uuid not null
    references public.approval_requests(id) on delete restrict,
  step_number integer not null check (step_number > 0),
  required_permission_key text not null
    references public.permissions(key) on update cascade on delete restrict,
  required_approvals integer not null check (required_approvals > 0),
  prohibit_submitter_approval boolean not null default true,
  status text not null default 'pending'
    check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now(),
  unique (approval_request_id, step_number)
);
create index ix_approval_request_steps_request
  on public.approval_request_steps (approval_request_id, step_number);

create table public.approval_decisions (
  id uuid primary key default gen_random_uuid(),
  approval_request_step_id uuid not null
    references public.approval_request_steps(id) on delete restrict,
  approver_profile_id uuid not null
    references public.profiles(id) on delete restrict,
  decision text not null check (decision in ('approved','rejected')),
  comments text,
  decided_at timestamptz not null default now(),
  unique (approval_request_step_id, approver_profile_id)
);
create index ix_approval_decisions_approver
  on public.approval_decisions (approver_profile_id, decided_at desc);

alter table public.financial_documents
  add column exchange_rate_to_base numeric(20,8) not null default 1
    check (exchange_rate_to_base > 0),
  add column base_currency_code char(3) not null default 'SLE'
    references public.currencies(code),
  add constraint financial_document_base_rate check (
    currency_code <> base_currency_code or exchange_rate_to_base = 1
  ),
  add constraint financial_documents_approval_request_fk
    foreign key (approval_request_id)
    references public.approval_requests(id) on delete restrict;

alter table public.budgets
  add column exchange_rate_to_base numeric(20,8) not null default 1
    check (exchange_rate_to_base > 0),
  add column base_currency_code char(3) not null default 'SLE'
    references public.currencies(code),
  add column approval_request_id uuid
    references public.approval_requests(id) on delete restrict,
  add constraint budget_base_rate check (
    currency_code <> base_currency_code or exchange_rate_to_base = 1
  );

alter table public.journal_entries
  add column approval_request_id uuid
    references public.approval_requests(id) on delete restrict;

alter table public.approval_policies enable row level security;
alter table public.approval_policy_bands enable row level security;
alter table public.approval_policy_steps enable row level security;
alter table public.approval_requests enable row level security;
alter table public.approval_request_steps enable row level security;
alter table public.approval_decisions enable row level security;

revoke all on public.approval_policies, public.approval_policy_bands,
  public.approval_policy_steps, public.approval_requests,
  public.approval_request_steps, public.approval_decisions
from anon, authenticated;
grant select on public.approval_policies, public.approval_policy_bands,
  public.approval_policy_steps, public.approval_requests,
  public.approval_request_steps, public.approval_decisions
to authenticated;

create policy approval_policies_finance_read
on public.approval_policies for select to authenticated
using (
  (branch_id is null and private.has_permission('approve_finances', null))
  or (branch_id is not null and private.has_permission('approve_finances', branch_id))
  or (branch_id is null and private.has_permission('manage_finances', null))
  or (branch_id is not null and private.has_permission('manage_finances', branch_id))
);

create policy approval_policy_bands_finance_read
on public.approval_policy_bands for select to authenticated
using (
  exists (
    select 1 from public.approval_policies p
    where p.id = policy_id
  )
);

create policy approval_policy_steps_finance_read
on public.approval_policy_steps for select to authenticated
using (
  exists (
    select 1
    from public.approval_policy_bands b
    join public.approval_policies p on p.id = b.policy_id
    where b.id = band_id
  )
);

create policy approval_requests_submitter_or_approver_read
on public.approval_requests for select to authenticated
using (
  submitted_by_profile_id = private.current_profile_id()
  or (
    branch_id is null
    and (
      private.has_permission('approve_finances', null)
      or private.has_permission('manage_finances', null)
    )
  )
  or (
    branch_id is not null
    and (
      private.has_permission('approve_finances', branch_id)
      or private.has_permission('manage_finances', branch_id)
    )
  )
);

create policy approval_request_steps_parent_read
on public.approval_request_steps for select to authenticated
using (
  exists (
    select 1 from public.approval_requests r
    where r.id = approval_request_id
  )
);

create policy approval_decisions_parent_read
on public.approval_decisions for select to authenticated
using (
  exists (
    select 1
    from public.approval_request_steps s
    where s.id = approval_request_step_id
  )
);

commit;