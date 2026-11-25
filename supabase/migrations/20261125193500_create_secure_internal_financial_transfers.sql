begin;

-- FIN-INT-004: secure branch-owned internal transfers. Same-branch transfers
-- create one journal; cross-branch transfers create two independently scoped
-- journals which can only be posted together through post_financial_transfer.

alter table public.approval_policies
  drop constraint if exists approval_policies_transaction_type_check;
alter table public.approval_policies
  add constraint approval_policies_transaction_type_check
  check (transaction_type = any (array[
    'financial_document'::text, 'journal_entry'::text, 'budget'::text,
    'requisition'::text, 'financial_transfer'::text
  ]));

alter table public.approval_requests
  drop constraint if exists approval_requests_transaction_type_check;
alter table public.approval_requests
  add constraint approval_requests_transaction_type_check
  check (transaction_type = any (array[
    'financial_document'::text, 'journal_entry'::text, 'budget'::text,
    'requisition'::text, 'financial_transfer'::text
  ]));

create table public.finance_branch_clearing_accounts (
  branch_id uuid primary key references public.church_branches(id) on delete restrict,
  due_from_chart_account_id uuid not null references public.chart_of_accounts(id) on delete restrict,
  due_to_chart_account_id uuid not null references public.chart_of_accounts(id) on delete restrict,
  is_active boolean not null default true,
  configured_by_profile_id uuid references public.profiles(id) on delete set null,
  configured_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint finance_branch_clearing_accounts_distinct
    check (due_from_chart_account_id <> due_to_chart_account_id)
);

create table public.financial_transfers (
  id uuid primary key default gen_random_uuid(),
  transfer_number bigint generated always as identity unique,
  transaction_date date not null,
  source_financial_account_id uuid not null references public.financial_accounts(id) on delete restrict,
  destination_financial_account_id uuid not null references public.financial_accounts(id) on delete restrict,
  source_branch_id uuid not null references public.church_branches(id) on delete restrict,
  destination_branch_id uuid not null references public.church_branches(id) on delete restrict,
  source_district_id uuid references public.districts(id) on delete restrict,
  destination_district_id uuid references public.districts(id) on delete restrict,
  amount numeric(20,4) not null check (amount > 0),
  currency_code char(3) not null,
  exchange_rate_to_base numeric(20,8) not null check (exchange_rate_to_base > 0),
  base_currency_code char(3) not null,
  external_reference text,
  description text not null check (length(trim(description)) > 0),
  status text not null default 'pending_approval'
    check (status in ('pending_approval','approved','rejected','posted')),
  source_approval_request_id uuid references public.approval_requests(id) on delete restrict,
  destination_approval_request_id uuid references public.approval_requests(id) on delete restrict,
  source_journal_entry_id uuid references public.journal_entries(id) on delete restrict,
  destination_journal_entry_id uuid references public.journal_entries(id) on delete restrict,
  created_by_profile_id uuid not null references public.profiles(id) on delete restrict,
  idempotency_key uuid not null,
  idempotency_fingerprint text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint financial_transfers_distinct_accounts
    check (source_financial_account_id <> destination_financial_account_id),
  constraint financial_transfers_branch_shape check (
    (source_branch_id = destination_branch_id
      and destination_approval_request_id is null
      and destination_journal_entry_id is null)
    or
    (source_branch_id <> destination_branch_id
      and (
        (destination_approval_request_id is null and destination_journal_entry_id is null)
        or
        (destination_approval_request_id is not null and destination_journal_entry_id is not null)
      ))
  )
);

create unique index uq_financial_transfers_creator_idempotency
  on public.financial_transfers(created_by_profile_id, idempotency_key);

create index idx_financial_transfers_source_branch_date
  on public.financial_transfers(source_branch_id, transaction_date desc);
create index idx_financial_transfers_destination_branch_date
  on public.financial_transfers(destination_branch_id, transaction_date desc);

alter table public.finance_branch_clearing_accounts enable row level security;
alter table public.financial_transfers enable row level security;
revoke all on public.finance_branch_clearing_accounts from public, anon, authenticated, service_role;
revoke all on public.financial_transfers from public, anon, authenticated, service_role;

create or replace function public.set_finance_branch_clearing_accounts(
  p_branch_id uuid,
  p_due_from_chart_account_id uuid,
  p_due_to_chart_account_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
  v_profile_id := private.current_profile_id();
  if v_profile_id is null then raise exception 'No member profile is linked to this account'; end if;
  if p_branch_id is null or not private.has_permission('manage_finances', p_branch_id) then
    raise exception 'Insufficient permission to configure branch clearing accounts';
  end if;
  if not exists (select 1 from public.church_branches b where b.id=p_branch_id and b.status='active') then
    raise exception 'Branch does not exist or is inactive';
  end if;
  if p_due_from_chart_account_id is null or p_due_to_chart_account_id is null
     or p_due_from_chart_account_id = p_due_to_chart_account_id then
    raise exception 'Distinct due-from and due-to chart accounts are required';
  end if;
  if not exists (
    select 1 from public.chart_of_accounts c
    where c.id=p_due_from_chart_account_id and c.is_active and c.account_type='asset'
  ) then
    raise exception 'Due-from clearing account must be an active asset chart account';
  end if;
  if not exists (
    select 1 from public.chart_of_accounts c
    where c.id=p_due_to_chart_account_id and c.is_active and c.account_type='liability'
  ) then
    raise exception 'Due-to clearing account must be an active liability chart account';
  end if;

  insert into public.finance_branch_clearing_accounts(
    branch_id,due_from_chart_account_id,due_to_chart_account_id,
    is_active,configured_by_profile_id,configured_at,updated_at
  ) values (
    p_branch_id,p_due_from_chart_account_id,p_due_to_chart_account_id,
    true,v_profile_id,now(),now()
  )
  on conflict (branch_id) do update set
    due_from_chart_account_id=excluded.due_from_chart_account_id,
    due_to_chart_account_id=excluded.due_to_chart_account_id,
    is_active=true,configured_by_profile_id=v_profile_id,updated_at=now();

  return jsonb_build_object('saved',true,'branch_id',p_branch_id);
end;
$$;

revoke all on function public.set_finance_branch_clearing_accounts(uuid,uuid,uuid)
  from public,anon,service_role;
grant execute on function public.set_finance_branch_clearing_accounts(uuid,uuid,uuid)
  to authenticated;

create or replace function private.create_financial_transfer_approval_request(
  p_transfer_id uuid,
  p_branch_id uuid,
  p_district_id uuid,
  p_profile_id uuid,
  p_amount_base numeric
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_policy public.approval_policies%rowtype;
  v_band public.approval_policy_bands%rowtype;
  v_request_id uuid;
  v_step_count integer;
begin
  select * into v_policy
  from public.approval_policies p
  where p.transaction_type='financial_transfer'
    and p.is_active
    and p.effective_from <= current_date
    and (p.effective_to is null or p.effective_to >= current_date)
    and p.branch_id=p_branch_id
    and p.district_id is not distinct from p_district_id
  order by p.version desc
  limit 1;
  if not found then
    raise exception 'No active financial-transfer approval policy is configured for branch %',p_branch_id;
  end if;

  select * into v_band
  from public.approval_policy_bands b
  where b.policy_id=v_policy.id
    and p_amount_base >= b.min_amount_base
    and (b.max_amount_base is null or p_amount_base < b.max_amount_base)
  limit 1;
  if not found then
    raise exception 'No financial-transfer approval threshold band covers this amount for branch %',p_branch_id;
  end if;

  select count(*) into v_step_count
  from public.approval_policy_steps s where s.band_id=v_band.id;

  insert into public.approval_requests(
    transaction_type,target_id,branch_id,district_id,policy_id,policy_version,
    band_id,amount_base,status,submitted_by_profile_id,completed_at,policy_snapshot
  ) values (
    'financial_transfer',p_transfer_id,p_branch_id,p_district_id,v_policy.id,
    v_policy.version,v_band.id,p_amount_base,
    case when v_step_count=0 then 'approved' else 'pending' end,
    p_profile_id,case when v_step_count=0 then now() else null end,
    jsonb_build_object(
      'policy_name',v_policy.name,
      'policy_version',v_policy.version,
      'min_amount_base',v_band.min_amount_base,
      'max_amount_base',v_band.max_amount_base,
      'steps',(select coalesce(jsonb_agg(jsonb_build_object(
        'step_number',s.step_number,
        'required_permission_key',s.required_permission_key,
        'required_approvals',s.required_approvals,
        'prohibit_submitter_approval',s.prohibit_submitter_approval
      ) order by s.step_number),'[]'::jsonb)
      from public.approval_policy_steps s where s.band_id=v_band.id)
    )
  ) returning id into v_request_id;

  insert into public.approval_request_steps(
    approval_request_id,step_number,required_permission_key,
    required_approvals,prohibit_submitter_approval
  )
  select v_request_id,s.step_number,s.required_permission_key,
    s.required_approvals,s.prohibit_submitter_approval
  from public.approval_policy_steps s
  where s.band_id=v_band.id
  order by s.step_number;

  return v_request_id;
end;
$$;

revoke all on function private.create_financial_transfer_approval_request(uuid,uuid,uuid,uuid,numeric)
  from public,anon,authenticated,service_role;

create or replace function public.create_financial_transfer(
  p_transaction_date date,
  p_source_branch_id uuid,
  p_source_financial_account_id uuid,
  p_destination_branch_id uuid,
  p_destination_financial_account_id uuid,
  p_amount numeric,
  p_currency_code char(3),
  p_exchange_rate_to_base numeric,
  p_description text,
  p_external_reference text default null,
  p_idempotency_key uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid;
  v_base_currency char(3);
  v_source_district_id uuid;
  v_destination_district_id uuid;
  v_source_account public.financial_accounts%rowtype;
  v_destination_account public.financial_accounts%rowtype;
  v_source_chart public.chart_of_accounts%rowtype;
  v_destination_chart public.chart_of_accounts%rowtype;
  v_source_clearing public.finance_branch_clearing_accounts%rowtype;
  v_destination_clearing public.finance_branch_clearing_accounts%rowtype;
  v_due_from public.chart_of_accounts%rowtype;
  v_due_to public.chart_of_accounts%rowtype;
  v_period public.financial_periods%rowtype;
  v_transfer_id uuid;
  v_source_journal_id uuid;
  v_destination_journal_id uuid;
  v_source_request_id uuid;
  v_destination_request_id uuid;
  v_base_amount numeric(20,4);
  v_fingerprint text;
  v_existing public.financial_transfers%rowtype;
  v_status text;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
  v_profile_id := private.current_profile_id();
  if v_profile_id is null then raise exception 'No member profile is linked to this account'; end if;
  if p_idempotency_key is null then raise exception 'A transfer idempotency key is required'; end if;

  if p_source_branch_id is null or p_destination_branch_id is null
     or p_source_financial_account_id is null or p_destination_financial_account_id is null
     or p_source_branch_id=p_destination_branch_id and p_source_financial_account_id=p_destination_financial_account_id then
    raise exception 'Distinct source and destination financial accounts in active branches are required';
  end if;
  if p_transaction_date is null or p_amount is null or p_amount<=0
     or p_exchange_rate_to_base is null or p_exchange_rate_to_base<=0
     or p_currency_code is null or length(trim(p_currency_code::text))<>3
     or p_description is null or length(trim(p_description))=0 then
    raise exception 'A transaction date, positive amount/rate, currency and description are required';
  end if;
  if not exists(select 1 from public.currencies c where c.code=p_currency_code) then
    raise exception 'Transfer currency is not supported';
  end if;

  if not private.has_permission('manage_finances',p_source_branch_id)
     or not private.has_permission('manage_finances',p_destination_branch_id) then
    raise exception 'The transfer creator must have manage-finances permission in both affected branches';
  end if;

  select b.district_id into v_source_district_id
  from public.church_branches b where b.id=p_source_branch_id and b.status='active';
  if not found then raise exception 'Source branch does not exist or is inactive'; end if;
  select b.district_id into v_destination_district_id
  from public.church_branches b where b.id=p_destination_branch_id and b.status='active';
  if not found then raise exception 'Destination branch does not exist or is inactive'; end if;

  select * into v_source_account from public.financial_accounts fa
  where fa.id=p_source_financial_account_id and fa.is_active
    and fa.branch_id=p_source_branch_id and fa.currency_code=p_currency_code;
  if not found then raise exception 'Source account must be active, branch-owned and match the transfer currency'; end if;
  select * into v_destination_account from public.financial_accounts fa
  where fa.id=p_destination_financial_account_id and fa.is_active
    and fa.branch_id=p_destination_branch_id and fa.currency_code=p_currency_code;
  if not found then raise exception 'Destination account must be active, branch-owned and match the transfer currency'; end if;

  select * into v_source_chart from public.chart_of_accounts c
  where c.id=v_source_account.chart_account_id and c.is_active and c.account_type='asset';
  if not found then raise exception 'Source financial account must map to an active asset chart account'; end if;
  select * into v_destination_chart from public.chart_of_accounts c
  where c.id=v_destination_account.chart_account_id and c.is_active and c.account_type='asset';
  if not found then raise exception 'Destination financial account must map to an active asset chart account'; end if;

  select base_currency_code into v_base_currency from public.church_settings where id=1;
  if v_base_currency is null then raise exception 'Church settings must be configured before financial operations'; end if;
  if p_currency_code=v_base_currency and p_exchange_rate_to_base<>1 then
    raise exception 'Exchange rate must be 1 for the church base currency';
  end if;
  v_base_amount:=round(p_amount*p_exchange_rate_to_base,4);

  select fp.* into v_period
  from public.financial_periods fp
  join public.financial_years fy on fy.id=fp.financial_year_id
  where fp.status='open' and fy.status='open'
    and p_transaction_date between fp.start_date and fp.end_date
  limit 1;
  if not found then raise exception 'No open financial period and year exist for the transfer date'; end if;

  v_fingerprint:=md5(jsonb_build_object(
    'transaction_date',p_transaction_date,
    'source_branch_id',p_source_branch_id,
    'source_financial_account_id',p_source_financial_account_id,
    'destination_branch_id',p_destination_branch_id,
    'destination_financial_account_id',p_destination_financial_account_id,
    'amount',p_amount,'currency_code',upper(trim(p_currency_code::text)),
    'exchange_rate_to_base',p_exchange_rate_to_base,
    'description',trim(p_description),
    'external_reference',nullif(trim(coalesce(p_external_reference,'')),'')
  )::text);

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_profile_id::text||':'||p_idempotency_key::text,0)
  );
  select * into v_existing from public.financial_transfers
  where created_by_profile_id=v_profile_id and idempotency_key=p_idempotency_key
  for update;
  if found then
    if v_existing.idempotency_fingerprint is distinct from v_fingerprint then
      raise exception 'This transfer idempotency key was already used with different details';
    end if;
    return jsonb_build_object(
      'transfer_id',v_existing.id,'transfer_number',v_existing.transfer_number,
      'source_journal_entry_id',v_existing.source_journal_entry_id,
      'destination_journal_entry_id',v_existing.destination_journal_entry_id,
      'status',v_existing.status,'idempotent_replay',true
    );
  end if;

  if p_source_branch_id<>p_destination_branch_id then
    select * into v_source_clearing from public.finance_branch_clearing_accounts
    where branch_id=p_source_branch_id and is_active;
    if not found then raise exception 'Configure active due-from and due-to clearing accounts for the sending branch first'; end if;
    select * into v_destination_clearing from public.finance_branch_clearing_accounts
    where branch_id=p_destination_branch_id and is_active;
    if not found then raise exception 'Configure active due-from and due-to clearing accounts for the receiving branch first'; end if;
    select * into v_due_from from public.chart_of_accounts
    where id=v_source_clearing.due_from_chart_account_id and is_active and account_type='asset';
    if not found then raise exception 'Sending branch due-from clearing account is no longer an active asset'; end if;
    select * into v_due_to from public.chart_of_accounts
    where id=v_destination_clearing.due_to_chart_account_id and is_active and account_type='liability';
    if not found then raise exception 'Receiving branch due-to clearing account is no longer an active liability'; end if;
  end if;

  insert into public.financial_transfers(
    transaction_date,source_financial_account_id,destination_financial_account_id,
    source_branch_id,destination_branch_id,source_district_id,destination_district_id,
    amount,currency_code,exchange_rate_to_base,base_currency_code,
    external_reference,description,status,created_by_profile_id,
    idempotency_key,idempotency_fingerprint
  ) values (
    p_transaction_date,p_source_financial_account_id,p_destination_financial_account_id,
    p_source_branch_id,p_destination_branch_id,v_source_district_id,v_destination_district_id,
    p_amount,p_currency_code,p_exchange_rate_to_base,v_base_currency,
    nullif(trim(coalesce(p_external_reference,'')),''),trim(p_description),
    'pending_approval',v_profile_id,p_idempotency_key,v_fingerprint
  ) returning id into v_transfer_id;

  insert into public.journal_entries(
    period_id,branch_id,district_id,entry_date,description,reference,
    currency_code,exchange_rate_to_base,base_currency_code,
    source_type,source_id,created_by_profile_id,approval_checked_at
  ) values (
    v_period.id,p_source_branch_id,v_source_district_id,p_transaction_date,
    trim(p_description),nullif(trim(coalesce(p_external_reference,'')),''),
    p_currency_code,p_exchange_rate_to_base,v_base_currency,
    'financial_transfer',v_transfer_id,v_profile_id,now()
  ) returning id into v_source_journal_id;

  if p_source_branch_id=p_destination_branch_id then
    insert into public.journal_lines(
      journal_entry_id,line_number,account_id,branch_id,description,
      debit_amount,credit_amount,base_debit_amount,base_credit_amount
    ) values
      (v_source_journal_id,1,v_destination_chart.id,p_source_branch_id,trim(p_description),
       p_amount,0,v_base_amount,0),
      (v_source_journal_id,2,v_source_chart.id,p_source_branch_id,trim(p_description),
       0,p_amount,0,v_base_amount);
  else
    insert into public.journal_lines(
      journal_entry_id,line_number,account_id,branch_id,description,
      debit_amount,credit_amount,base_debit_amount,base_credit_amount
    ) values
      (v_source_journal_id,1,v_due_from.id,p_source_branch_id,trim(p_description),
       p_amount,0,v_base_amount,0),
      (v_source_journal_id,2,v_source_chart.id,p_source_branch_id,trim(p_description),
       0,p_amount,0,v_base_amount);

    insert into public.journal_entries(
      period_id,branch_id,district_id,entry_date,description,reference,
      currency_code,exchange_rate_to_base,base_currency_code,
      source_type,source_id,created_by_profile_id,approval_checked_at
    ) values (
      v_period.id,p_destination_branch_id,v_destination_district_id,p_transaction_date,
      trim(p_description),nullif(trim(coalesce(p_external_reference,'')),''),
      p_currency_code,p_exchange_rate_to_base,v_base_currency,
      'financial_transfer',v_transfer_id,v_profile_id,now()
    ) returning id into v_destination_journal_id;

    insert into public.journal_lines(
      journal_entry_id,line_number,account_id,branch_id,description,
      debit_amount,credit_amount,base_debit_amount,base_credit_amount
    ) values
      (v_destination_journal_id,1,v_destination_chart.id,p_destination_branch_id,trim(p_description),
       p_amount,0,v_base_amount,0),
      (v_destination_journal_id,2,v_due_to.id,p_destination_branch_id,trim(p_description),
       0,p_amount,0,v_base_amount);
  end if;

  v_source_request_id:=private.create_financial_transfer_approval_request(
    v_transfer_id,p_source_branch_id,v_source_district_id,v_profile_id,v_base_amount
  );
  if p_source_branch_id<>p_destination_branch_id then
    v_destination_request_id:=private.create_financial_transfer_approval_request(
      v_transfer_id,p_destination_branch_id,v_destination_district_id,v_profile_id,v_base_amount
    );
  end if;

  update public.financial_transfers set
    source_approval_request_id=v_source_request_id,
    destination_approval_request_id=v_destination_request_id,
    source_journal_entry_id=v_source_journal_id,
    destination_journal_entry_id=v_destination_journal_id,
    status=case when
      (select status='approved' from public.approval_requests where id=v_source_request_id)
      and (v_destination_request_id is null or
        (select status='approved' from public.approval_requests where id=v_destination_request_id))
      then 'approved' else 'pending_approval' end,
    updated_at=now()
  where id=v_transfer_id
  returning status into v_status;

  if v_status='approved' then
    update public.journal_entries set approved_at=now()
    where id in (v_source_journal_id,v_destination_journal_id);
  end if;

  return jsonb_build_object(
    'transfer_id',v_transfer_id,
    'transfer_number',(select transfer_number from public.financial_transfers where id=v_transfer_id),
    'source_approval_request_id',v_source_request_id,
    'destination_approval_request_id',v_destination_request_id,
    'source_journal_entry_id',v_source_journal_id,
    'destination_journal_entry_id',v_destination_journal_id,
    'status',v_status,'idempotent_replay',false
  );
end;
$$;

revoke all on function public.create_financial_transfer(date,uuid,uuid,uuid,uuid,numeric,char,numeric,text,text,uuid)
  from public,anon,service_role;
grant execute on function public.create_financial_transfer(date,uuid,uuid,uuid,uuid,numeric,char,numeric,text,text,uuid)
  to authenticated;

create or replace function public.decide_financial_transfer_approval(
  p_request_step_id uuid,
  p_decision text,
  p_comments text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_step public.approval_request_steps%rowtype;
  v_request public.approval_requests%rowtype;
  v_transfer public.financial_transfers%rowtype;
  v_result text;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
  select * into v_step from public.approval_request_steps
  where id=p_request_step_id;
  if not found then raise exception 'Approval step not found'; end if;
  select * into v_request from public.approval_requests
  where id=v_step.approval_request_id;
  if not found or v_request.transaction_type<>'financial_transfer' then
    raise exception 'Approval step is not for an internal financial transfer';
  end if;
  select * into v_transfer from public.financial_transfers
  where id=v_request.target_id for update;
  if not found then raise exception 'Financial transfer not found'; end if;
  if v_transfer.status in ('rejected','posted') then
    raise exception 'This transfer is no longer open for approval';
  end if;

  v_result:=private.record_approval_decision(p_request_step_id,p_decision,p_comments);

  if exists (
    select 1 from public.approval_requests ar
    where ar.transaction_type='financial_transfer'
      and ar.target_id=v_transfer.id and ar.status='rejected'
  ) then
    update public.financial_transfers set status='rejected',updated_at=now()
    where id=v_transfer.id;
  elsif not exists (
    select 1 from public.approval_requests ar
    where ar.transaction_type='financial_transfer'
      and ar.target_id=v_transfer.id and ar.status<>'approved'
  ) then
    update public.financial_transfers set status='approved',updated_at=now()
    where id=v_transfer.id;
    update public.journal_entries set approved_at=now()
    where id in (v_transfer.source_journal_entry_id,v_transfer.destination_journal_entry_id)
      and status='draft' and source_type='financial_transfer' and source_id=v_transfer.id;
  else
    update public.financial_transfers set status='pending_approval',updated_at=now()
    where id=v_transfer.id;
  end if;

  return jsonb_build_object(
    'transfer_id',v_transfer.id,
    'approval_request_id',v_request.id,
    'approval_status',v_result,
    'status',(select status from public.financial_transfers where id=v_transfer.id)
  );
end;
$$;

revoke all on function public.decide_financial_transfer_approval(uuid,text,text)
  from public,anon,service_role;
grant execute on function public.decide_financial_transfer_approval(uuid,text,text)
  to authenticated;

create or replace function private.prevent_unilateral_financial_transfer_journal_posting()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status='posted'
     and old.status is distinct from new.status
     and old.source_type='financial_transfer'
     and coalesce(current_setting('scms.finance_transfer_posting',true),'off')<>'on' then
    raise exception 'Internal-transfer journals must be posted together through post_financial_transfer';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_unilateral_financial_transfer_journal_posting
  on public.journal_entries;
create trigger trg_prevent_unilateral_financial_transfer_journal_posting
before update of status on public.journal_entries
for each row execute function private.prevent_unilateral_financial_transfer_journal_posting();

revoke all on function private.prevent_unilateral_financial_transfer_journal_posting()
  from public,anon,authenticated,service_role;

create or replace function public.post_financial_transfer(p_transfer_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_transfer public.financial_transfers%rowtype;
  v_source public.journal_entries%rowtype;
  v_destination public.journal_entries%rowtype;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
  if private.current_profile_id() is null then raise exception 'No member profile is linked to this account'; end if;

  select * into v_transfer from public.financial_transfers
  where id=p_transfer_id for update;
  if not found then raise exception 'Financial transfer not found'; end if;

  if v_transfer.status='posted' then
    return jsonb_build_object(
      'transfer_id',v_transfer.id,'status','posted','already_posted',true,
      'source_journal_entry_id',v_transfer.source_journal_entry_id,
      'destination_journal_entry_id',v_transfer.destination_journal_entry_id
    );
  end if;
  if v_transfer.status<>'approved' then
    raise exception 'Both affected branch approval workflows must be complete before posting';
  end if;
  if not private.has_permission('post_journals',v_transfer.source_branch_id)
     or not private.has_permission('post_journals',v_transfer.destination_branch_id) then
    raise exception 'Posting actor must have post-journals permission in both affected branches';
  end if;
  if not exists (
    select 1 from public.approval_requests ar
    where ar.id=v_transfer.source_approval_request_id
      and ar.transaction_type='financial_transfer' and ar.target_id=v_transfer.id
      and ar.branch_id=v_transfer.source_branch_id and ar.status='approved'
  ) then raise exception 'Sending branch approval is incomplete'; end if;
  if v_transfer.destination_approval_request_id is not null and not exists (
    select 1 from public.approval_requests ar
    where ar.id=v_transfer.destination_approval_request_id
      and ar.transaction_type='financial_transfer' and ar.target_id=v_transfer.id
      and ar.branch_id=v_transfer.destination_branch_id and ar.status='approved'
  ) then raise exception 'Receiving branch approval is incomplete'; end if;

  select * into v_source from public.journal_entries
  where id=v_transfer.source_journal_entry_id for update;
  if not found or v_source.status<>'draft'
     or v_source.source_type<>'financial_transfer' or v_source.source_id<>v_transfer.id
     or v_source.branch_id<>v_transfer.source_branch_id
     or v_source.approved_at is null then
    raise exception 'Sending branch transfer journal is not ready to post';
  end if;

  if v_transfer.destination_journal_entry_id is not null then
    select * into v_destination from public.journal_entries
    where id=v_transfer.destination_journal_entry_id for update;
    if not found or v_destination.status<>'draft'
       or v_destination.source_type<>'financial_transfer' or v_destination.source_id<>v_transfer.id
       or v_destination.branch_id<>v_transfer.destination_branch_id
       or v_destination.approved_at is null then
      raise exception 'Receiving branch transfer journal is not ready to post';
    end if;
  end if;

  -- The trigger guard permits this setting only for the duration of this
  -- SECURITY DEFINER transaction. Both private posts roll back together.
  perform set_config('scms.finance_transfer_posting','on',true);
  perform private.post_journal_entry(v_transfer.source_journal_entry_id);
  if v_transfer.destination_journal_entry_id is not null then
    perform private.post_journal_entry(v_transfer.destination_journal_entry_id);
  end if;

  -- Do not leave the internal trigger bypass enabled for later statements in
  -- a caller-owned transaction after this atomic posting operation completes.
  perform set_config('scms.finance_transfer_posting','off',true);

  update public.financial_transfers set status='posted',updated_at=now()
  where id=v_transfer.id;

  return jsonb_build_object(
    'transfer_id',v_transfer.id,'status','posted','already_posted',false,
    'source_journal_entry_id',v_transfer.source_journal_entry_id,
    'destination_journal_entry_id',v_transfer.destination_journal_entry_id
  );
end;
$$;

revoke all on function public.post_financial_transfer(uuid)
  from public,anon,service_role;
grant execute on function public.post_financial_transfer(uuid)
  to authenticated;

create or replace function public.get_financial_transfers(p_branch_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid;
  v_transfers jsonb;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
  v_profile_id:=private.current_profile_id();
  if v_profile_id is null then raise exception 'No member profile is linked to this account'; end if;
  if p_branch_id is null or not (
    private.has_permission('view_finances',p_branch_id)
    or private.has_permission('manage_finances',p_branch_id)
    or private.has_permission('approve_finances',p_branch_id)
  ) then raise exception 'Insufficient permission to view transfers for this branch'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',ft.id,'transfer_number',ft.transfer_number,
    'transaction_date',ft.transaction_date,
    'source_branch_id',ft.source_branch_id,
    'destination_branch_id',ft.destination_branch_id,
    'source_financial_account_id',ft.source_financial_account_id,
    'destination_financial_account_id',ft.destination_financial_account_id,
    'amount',ft.amount,'currency_code',ft.currency_code,
    'description',ft.description,'external_reference',ft.external_reference,
    'status',ft.status,
    'source_approval_request_id',ft.source_approval_request_id,
    'destination_approval_request_id',ft.destination_approval_request_id,
    'source_approval_status',sar.status,
    'destination_approval_status',dar.status,
    'source_actor_approval_step_id',(
      select s.id from public.approval_request_steps s
      where s.approval_request_id=ft.source_approval_request_id and s.status='pending'
        and (not s.prohibit_submitter_approval or sar.submitted_by_profile_id<>private.current_profile_id())
        and not exists(select 1 from public.approval_decisions d
          where d.approval_request_step_id=s.id and d.approver_profile_id=private.current_profile_id())
        and not exists(select 1 from public.approval_request_steps prior
          where prior.approval_request_id=s.approval_request_id
            and prior.step_number<s.step_number and prior.status<>'approved')
        and not exists(select 1 from public.approval_decisions d
          join public.approval_request_steps other_step on other_step.id=d.approval_request_step_id
          where other_step.approval_request_id=s.approval_request_id
            and other_step.id<>s.id and d.approver_profile_id=private.current_profile_id())
        and private.has_permission(s.required_permission_key,ft.source_branch_id)
      order by s.step_number limit 1
    ),
    'destination_actor_approval_step_id',(
      select s.id from public.approval_request_steps s
      where s.approval_request_id=ft.destination_approval_request_id and s.status='pending'
        and (not s.prohibit_submitter_approval or dar.submitted_by_profile_id<>private.current_profile_id())
        and not exists(select 1 from public.approval_decisions d
          where d.approval_request_step_id=s.id and d.approver_profile_id=private.current_profile_id())
        and not exists(select 1 from public.approval_request_steps prior
          where prior.approval_request_id=s.approval_request_id
            and prior.step_number<s.step_number and prior.status<>'approved')
        and not exists(select 1 from public.approval_decisions d
          join public.approval_request_steps other_step on other_step.id=d.approval_request_step_id
          where other_step.approval_request_id=s.approval_request_id
            and other_step.id<>s.id and d.approver_profile_id=private.current_profile_id())
        and private.has_permission(s.required_permission_key,ft.destination_branch_id)
      order by s.step_number limit 1
    ),
    'source_journal_entry_id',ft.source_journal_entry_id,
    'destination_journal_entry_id',ft.destination_journal_entry_id,
    'created_at',ft.created_at
  ) order by ft.transaction_date desc,ft.created_at desc),'[]'::jsonb)
  into v_transfers
  from public.financial_transfers ft
  left join public.approval_requests sar on sar.id=ft.source_approval_request_id
  left join public.approval_requests dar on dar.id=ft.destination_approval_request_id
  where ft.source_branch_id=p_branch_id or ft.destination_branch_id=p_branch_id;

  return jsonb_build_object('actor_profile_id',v_profile_id,'transfers',v_transfers);
end;
$$;

revoke all on function public.get_financial_transfers(uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.get_financial_transfers(uuid)
  to authenticated;

comment on table public.financial_transfers is
  'Canonical internal movement between branch-owned financial accounts. Cross-branch transfers use reciprocal due-from/due-to journals and atomic posting.';
comment on table public.finance_branch_clearing_accounts is
  'Explicit branch-level reciprocal due-from asset and due-to liability chart-account configuration for cross-branch transfers.';
comment on function public.post_financial_transfer(uuid) is
  'Atomically posts all branch-local journals belonging to one fully approved internal transfer.';

create or replace function public.save_finance_scope_approval_policies(
  p_scope_type text,
  p_scope_id uuid,
  p_policies jsonb,
  p_bands jsonb,
  p_steps jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_profile_id uuid;
  v_branch_id uuid;
  v_district_id uuid;
  v_item jsonb;
  v_id uuid;
  v_policy_id uuid;
  v_band_id uuid;
  v_policy_type text;
  v_name text;
  v_version integer;
  v_existing jsonb;
  v_new_policy_ids uuid[] := array[]::uuid[];
  v_new_band_ids uuid[] := array[]::uuid[];
  v_policies_created integer := 0;
  v_bands_created integer := 0;
  v_steps_created integer := 0;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;
  v_profile_id := private.current_profile_id();
  if v_profile_id is null then
    raise exception 'No active member profile is linked to this account';
  end if;
  if p_scope_type not in ('church','district','branch') then
    raise exception 'Finance scope must be church, district or branch';
  end if;
  if jsonb_typeof(p_policies) is distinct from 'array'
     or jsonb_typeof(p_bands) is distinct from 'array'
     or jsonb_typeof(p_steps) is distinct from 'array' then
    raise exception 'Approval policies, bands and steps must be arrays';
  end if;

  if p_scope_type = 'church' then
    if p_scope_id is not null then raise exception 'Church-wide scope must not include a scope ID'; end if;
    if not private.has_permission('manage_finances', null) then
      raise exception 'Insufficient permission to manage church-wide approval policies';
    end if;
  elsif p_scope_type = 'district' then
    if p_scope_id is null or not exists (select 1 from public.districts d where d.id = p_scope_id and d.status = 'active') then
      raise exception 'Finance district does not exist or is inactive';
    end if;
    if not private.has_permission_for_district('manage_finances', p_scope_id) then
      raise exception 'Insufficient permission to manage approval policies in this district';
    end if;
    v_district_id := p_scope_id;
  else
    select b.district_id into v_district_id
    from public.church_branches b where b.id = p_scope_id and b.status = 'active';
    if not found then raise exception 'Finance branch does not exist or is inactive'; end if;
    if not private.has_permission('manage_finances', p_scope_id) then
      raise exception 'Insufficient permission to manage approval policies in this branch';
    end if;
    v_branch_id := p_scope_id;
  end if;

  for v_item in select value from jsonb_array_elements(p_policies)
  loop
    v_id := nullif(v_item->>'id','')::uuid;
    v_name := trim(coalesce(v_item->>'name',''));
    v_policy_type := v_item->>'transaction_type';
    if v_id is null or v_name = '' or v_policy_type is null or v_policy_type not in ('financial_document','budget','financial_transfer')
       or nullif(v_item->>'effective_from','') is null
       or (nullif(v_item->>'effective_to','') is not null
           and (v_item->>'effective_to')::date < (v_item->>'effective_from')::date) then
      raise exception 'Approval policies require a UUID, name, supported workflow type and valid effective dates';
    end if;


    if v_policy_type = 'financial_transfer' and p_scope_type <> 'branch' then
      raise exception 'Internal financial-transfer approval policies must be configured at branch scope';
    end if;

    if nullif(v_item->>'branch_id','')::uuid is distinct from v_branch_id
       or (nullif(v_item->>'district_id','')::uuid is not null
           and nullif(v_item->>'district_id','')::uuid is distinct from v_district_id) then
      raise exception 'Approval policy ownership must match the requested organizational scope';
    end if;

    select to_jsonb(ap) into v_existing from public.approval_policies ap where ap.id = v_id;
    if v_existing is not null then
      if v_existing->>'name' is distinct from v_name
         or v_existing->>'transaction_type' is distinct from v_policy_type
         or (v_existing->>'branch_id')::uuid is distinct from v_branch_id
         or (v_existing->>'district_id')::uuid is distinct from v_district_id
         or (v_existing->>'effective_from')::date is distinct from (v_item->>'effective_from')::date
         or (v_existing->>'effective_to')::date is distinct from nullif(v_item->>'effective_to','')::date
         or (v_existing->>'is_active')::boolean is distinct from coalesce((v_item->>'is_active')::boolean,true) then
        raise exception 'Approval policy versions are immutable; create a new version instead';
      end if;
      continue;
    end if;

    perform pg_advisory_xact_lock(hashtextextended(
      'scms.finance.approval:' || p_scope_type || ':' || coalesce(p_scope_id::text,'church') || ':' || v_policy_type, 0
    ));
    select coalesce(max(ap.version),0) + 1 into v_version
    from public.approval_policies ap
    where ap.transaction_type = v_policy_type
      and ap.branch_id is not distinct from v_branch_id
      and ap.district_id is not distinct from v_district_id;

    insert into public.approval_policies (
      id,name,transaction_type,branch_id,district_id,version,effective_from,effective_to,is_active,created_by_profile_id
    ) values (
      v_id,v_name,v_policy_type,v_branch_id,v_district_id,v_version,
      (v_item->>'effective_from')::date,nullif(v_item->>'effective_to','')::date,
      coalesce((v_item->>'is_active')::boolean,true),v_profile_id
    );
    v_new_policy_ids := array_append(v_new_policy_ids,v_id);
    v_policies_created := v_policies_created + 1;
  end loop;

  for v_item in select value from jsonb_array_elements(p_bands)
  loop
    v_id := nullif(v_item->>'id','')::uuid;
    v_policy_id := nullif(v_item->>'policy_id','')::uuid;
    if v_id is null or v_policy_id is null
       or nullif(v_item->>'min_amount_base','')::numeric is null
       or (v_item->>'min_amount_base')::numeric < 0
       or (nullif(v_item->>'max_amount_base','') is not null
           and (v_item->>'max_amount_base')::numeric <= (v_item->>'min_amount_base')::numeric) then
      raise exception 'Approval amount bands require a policy and valid non-negative range';
    end if;
    select to_jsonb(band) into v_existing from public.approval_policy_bands band where band.id = v_id;
    if v_existing is not null then
      if (v_existing->>'policy_id')::uuid is distinct from v_policy_id
         or (v_existing->>'min_amount_base')::numeric is distinct from (v_item->>'min_amount_base')::numeric
         or (v_existing->>'max_amount_base')::numeric is distinct from nullif(v_item->>'max_amount_base','')::numeric then
        raise exception 'Existing approval amount bands are immutable';
      end if;
      continue;
    end if;
    if not (v_policy_id = any(v_new_policy_ids)) then
      raise exception 'New amount bands must belong to a policy created in this save';
    end if;
    insert into public.approval_policy_bands(id,policy_id,min_amount_base,max_amount_base)
    values(v_id,v_policy_id,(v_item->>'min_amount_base')::numeric,nullif(v_item->>'max_amount_base','')::numeric);
    v_new_band_ids := array_append(v_new_band_ids,v_id);
    v_bands_created := v_bands_created + 1;
  end loop;

  for v_item in select value from jsonb_array_elements(p_steps)
  loop
    v_id := nullif(v_item->>'id','')::uuid;
    v_band_id := nullif(v_item->>'band_id','')::uuid;
    if v_id is null or v_band_id is null
       or nullif(v_item->>'step_number','')::integer is null
       or (v_item->>'step_number')::integer < 1
       or nullif(v_item->>'required_approvals','')::integer is null
       or (v_item->>'required_approvals')::integer < 1
       or v_item->>'required_permission_key' is distinct from 'approve_finances' then
      raise exception 'Approval steps require an ordered step, approve_finances permission and positive approval count';
    end if;
    select to_jsonb(step) into v_existing from public.approval_policy_steps step where step.id = v_id;
    if v_existing is not null then
      if (v_existing->>'band_id')::uuid is distinct from v_band_id
         or (v_existing->>'step_number')::integer is distinct from (v_item->>'step_number')::integer
         or v_existing->>'required_permission_key' is distinct from v_item->>'required_permission_key'
         or (v_existing->>'required_approvals')::integer is distinct from (v_item->>'required_approvals')::integer
         or (v_existing->>'prohibit_submitter_approval')::boolean is distinct from coalesce((v_item->>'prohibit_submitter_approval')::boolean,true) then
        raise exception 'Existing approval policy steps are immutable';
      end if;
      continue;
    end if;
    if not (v_band_id = any(v_new_band_ids)) then
      raise exception 'New approval steps must belong to an amount band created in this save';
    end if;
    insert into public.approval_policy_steps(
      id,band_id,step_number,required_permission_key,required_approvals,prohibit_submitter_approval
    ) values (
      v_id,v_band_id,(v_item->>'step_number')::integer,v_item->>'required_permission_key',
      (v_item->>'required_approvals')::integer,coalesce((v_item->>'prohibit_submitter_approval')::boolean,true)
    );
    v_steps_created := v_steps_created + 1;
  end loop;

  if exists (
    select 1 from unnest(v_new_policy_ids) as new_policy(policy_id)
    where not exists (select 1 from public.approval_policy_bands band where band.policy_id = new_policy.policy_id)
  ) then
    raise exception 'Every new approval policy requires at least one amount band';
  end if;
  if exists (
    select 1 from unnest(v_new_band_ids) as new_band(band_id)
    where not exists (select 1 from public.approval_policy_steps step where step.band_id = new_band.band_id)
  ) then
    raise exception 'Every new approval amount band requires at least one approval step';
  end if;
  if exists (
    select 1 from unnest(v_new_band_ids) as new_band(band_id)
    join public.approval_policy_steps step on step.band_id = new_band.band_id
    group by new_band.band_id
    having min(step.step_number) <> 1 or max(step.step_number) <> count(*)
  ) then
    raise exception 'Approval policy steps must be consecutive from step one';
  end if;

  return jsonb_build_object(
    'saved',true,'policies_created',v_policies_created,'bands_created',v_bands_created,
    'steps_created',v_steps_created,'scope_type',p_scope_type,'scope_id',p_scope_id
  );
end;
$function$;

revoke all on function public.save_finance_scope_approval_policies(text,uuid,jsonb,jsonb,jsonb) from public,anon,service_role;
grant execute on function public.save_finance_scope_approval_policies(text,uuid,jsonb,jsonb,jsonb) to authenticated;


revoke all on function public.save_finance_scope_approval_policies(text,uuid,jsonb,jsonb,jsonb)
  from public,anon,service_role;
grant execute on function public.save_finance_scope_approval_policies(text,uuid,jsonb,jsonb,jsonb)
  to authenticated;
comment on function public.save_finance_scope_approval_policies(text,uuid,jsonb,jsonb,jsonb) is
  'Creates immutable, versioned financial-document, budget and branch-level financial-transfer approval policies at authorized organizational scopes.';



create or replace function public.get_finance_branch_clearing_accounts(p_branch_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid;
  v_result jsonb;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
  v_profile_id:=private.current_profile_id();
  if v_profile_id is null then raise exception 'No member profile is linked to this account'; end if;
  if p_branch_id is null or not (
    private.has_permission('view_finances',p_branch_id)
    or private.has_permission('manage_finances',p_branch_id)
  ) then raise exception 'Insufficient permission to view branch clearing-account configuration'; end if;

  select jsonb_build_object(
    'branch_id',c.branch_id,
    'due_from_chart_account_id',c.due_from_chart_account_id,
    'due_to_chart_account_id',c.due_to_chart_account_id,
    'is_active',c.is_active,
    'updated_at',c.updated_at
  ) into v_result
  from public.finance_branch_clearing_accounts c
  where c.branch_id=p_branch_id;

  return coalesce(v_result,'null'::jsonb);
end;
$$;

revoke all on function public.get_finance_branch_clearing_accounts(uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.get_finance_branch_clearing_accounts(uuid)
  to authenticated;


commit;
