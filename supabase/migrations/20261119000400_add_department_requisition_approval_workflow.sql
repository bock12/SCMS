begin;

-- Department/ministry requisitions are durable approval targets. They are not
-- payments; payment linkage is introduced only after this approval lifecycle.
create sequence public.department_requisition_number_seq;

insert into public.permissions (key, module, description)
values
  ('submit_requisitions', 'ministries', 'Submit department and ministry funding requisitions'),
  ('approve_requisitions', 'finance', 'Approve or reject department and ministry requisitions')
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key = 'submit_requisitions'
where r.name in ('leader', 'pastor')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key = 'approve_requisitions'
where r.name in ('super_admin', 'admin', 'pastor', 'finance_officer')
on conflict do nothing;

create table public.department_requisitions (
  id uuid primary key default gen_random_uuid(),
  requisition_number text not null unique,
  branch_id uuid not null references public.church_branches(id) on delete restrict,
  ministry_id uuid not null references public.ministries(id) on delete restrict,
  applicant_profile_id uuid not null references public.profiles(id) on delete restrict,
  applicant_name_snapshot text not null,
  ministry_name_snapshot text not null,
  title text not null,
  description text,
  requested_amount numeric(20,4) not null check (requested_amount > 0),
  currency_code char(3) not null references public.currencies(code) on delete restrict,
  exchange_rate_to_base numeric(20,8) not null check (exchange_rate_to_base > 0),
  base_currency_code char(3) not null references public.currencies(code) on delete restrict,
  priority text not null default 'medium'
    check (priority in ('low','medium','high','urgent')),
  status text not null default 'draft'
    check (status in ('draft','pending_approval','approved','rejected','cancelled')),
  needed_by_date date,
  vendor_quote_reference text,
  approval_request_id uuid unique
    references public.approval_requests(id) on delete restrict,
  approved_at timestamptz,
  approved_by_profile_id uuid references public.profiles(id) on delete restrict,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint department_requisition_title_nonblank
    check (length(trim(title)) > 0),
  constraint department_requisition_applicant_snapshot_nonblank
    check (length(trim(applicant_name_snapshot)) > 0),
  constraint department_requisition_ministry_snapshot_nonblank
    check (length(trim(ministry_name_snapshot)) > 0),
  constraint department_requisition_approval_consistency check (
    (status = 'draft' and approval_request_id is null)
    or (status <> 'draft' and approval_request_id is not null)
  ),
  constraint department_requisition_approved_consistency check (
    (status = 'approved' and approved_at is not null and approved_by_profile_id is not null)
    or (status <> 'approved' and approved_at is null and approved_by_profile_id is null)
  )
);

create index ix_department_requisitions_branch_status
  on public.department_requisitions (branch_id, status, submitted_at desc);
create index ix_department_requisitions_ministry_created
  on public.department_requisitions (ministry_id, created_at desc);
create index ix_department_requisitions_applicant
  on public.department_requisitions (applicant_profile_id, created_at desc);

create table public.department_requisition_items (
  id uuid primary key default gen_random_uuid(),
  requisition_id uuid not null
    references public.department_requisitions(id) on delete restrict,
  line_number integer not null check (line_number > 0),
  item_name text not null,
  quantity numeric(14,4) not null check (quantity > 0),
  unit_price numeric(20,4) not null check (unit_price >= 0),
  line_total numeric(20,4)
    generated always as (round(quantity * unit_price, 4)) stored,
  created_at timestamptz not null default now(),
  constraint department_requisition_item_name_nonblank
    check (length(trim(item_name)) > 0),
  unique (requisition_id, line_number)
);
create index ix_department_requisition_items_requisition
  on public.department_requisition_items (requisition_id, line_number);

alter table public.department_requisitions enable row level security;
alter table public.department_requisition_items enable row level security;

revoke all on public.department_requisitions, public.department_requisition_items
  from public, anon, authenticated, service_role;
grant select on public.department_requisitions, public.department_requisition_items
  to authenticated;
revoke all on sequence public.department_requisition_number_seq
  from public, anon, authenticated, service_role;

create policy department_requisitions_submitter_or_approver_read
on public.department_requisitions for select to authenticated
using (
  applicant_profile_id = private.current_profile_id()
  or private.has_permission('approve_requisitions', branch_id)
  or private.has_permission('manage_finances', branch_id)
);

create policy department_requisition_items_parent_read
on public.department_requisition_items for select to authenticated
using (
  exists (
    select 1
    from public.department_requisitions r
    where r.id = requisition_id
  )
);

create policy approval_requests_requisition_read
on public.approval_requests for select to authenticated
using (
  transaction_type = 'requisition'
  and (
    submitted_by_profile_id = private.current_profile_id()
    or private.has_permission('approve_requisitions', branch_id)
  )
);

create policy approval_request_steps_requisition_read
on public.approval_request_steps for select to authenticated
using (
  exists (
    select 1
    from public.approval_requests r
    where r.id = approval_request_id
      and r.transaction_type = 'requisition'
      and (
        r.submitted_by_profile_id = private.current_profile_id()
        or private.has_permission('approve_requisitions', r.branch_id)
      )
  )
);

create policy approval_decisions_requisition_read
on public.approval_decisions for select to authenticated
using (
  exists (
    select 1
    from public.approval_request_steps s
    join public.approval_requests r on r.id = s.approval_request_id
    where s.id = approval_request_step_id
      and r.transaction_type = 'requisition'
      and (
        r.submitted_by_profile_id = private.current_profile_id()
        or private.has_permission('approve_requisitions', r.branch_id)
      )
  )
);

create or replace function public.submit_department_requisition(
  p_branch_id uuid,
  p_ministry_id uuid,
  p_title text,
  p_description text,
  p_requested_amount numeric,
  p_currency_code char(3),
  p_exchange_rate_to_base numeric,
  p_priority text,
  p_needed_by_date date,
  p_vendor_quote_reference text,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid;
  v_profile public.profiles%rowtype;
  v_ministry public.ministries%rowtype;
  v_base_currency char(3);
  v_policy public.approval_policies%rowtype;
  v_band public.approval_policy_bands%rowtype;
  v_requisition_id uuid;
  v_requisition_number text;
  v_request_id uuid;
  v_items_total numeric(20,4);
  v_base_amount numeric(20,4);
  v_steps_count integer;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  v_profile_id := private.current_profile_id();
  if v_profile_id is null then
    raise exception 'No member profile is linked to this account';
  end if;
  if p_branch_id is null or not private.has_permission('submit_requisitions', p_branch_id) then
    raise exception 'Insufficient permission to submit a requisition in this branch';
  end if;

  select * into v_profile
  from public.profiles p
  where p.id = v_profile_id
    and p.branch_id = p_branch_id
    and p.membership_status = 'active'
    and p.record_status = 'active'
  for share;
  if not found then
    raise exception 'The submitting profile must be an active member of the selected branch';
  end if;

  select * into v_ministry
  from public.ministries m
  where m.id = p_ministry_id
    and m.status = 'active'
    and m.entity_type in ('ministry','department')
    and (m.branch_id is null or m.branch_id = p_branch_id)
  for share;
  if not found then
    raise exception 'Select an active ministry or department in the same branch';
  end if;

  if p_title is null or length(trim(p_title)) = 0
     or p_requested_amount is null or p_requested_amount <= 0
     or p_currency_code is null
     or p_exchange_rate_to_base is null or p_exchange_rate_to_base <= 0
     or p_priority is null or p_priority not in ('low','medium','high','urgent')
     or jsonb_typeof(p_items) is distinct from 'array'
     or jsonb_array_length(p_items) = 0 then
    raise exception 'A title, positive amount, currency, exchange rate, priority and at least one item are required';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_items) as item(
      item_name text, quantity numeric, unit_price numeric
    )
    where item.item_name is null or length(trim(item.item_name)) = 0
       or item.quantity is null or item.quantity <= 0
       or item.unit_price is null or item.unit_price < 0
  ) then
    raise exception 'Requisition items require a name, positive quantity and non-negative unit price';
  end if;

  select coalesce(sum(round(item.quantity * item.unit_price, 4)), 0)
  into v_items_total
  from jsonb_to_recordset(p_items) as item(
    item_name text, quantity numeric, unit_price numeric
  );
  if v_items_total <= 0 or round(p_requested_amount, 4) <> v_items_total then
    raise exception 'The requested amount must equal the sum of the requisition item lines';
  end if;

  select c.base_currency_code into v_base_currency
  from public.church_settings c
  where c.id = 1;
  if v_base_currency is null then
    raise exception 'Church base currency must be configured before requisitions can be submitted';
  end if;
  if not exists (
    select 1 from public.currencies c
    where c.code = p_currency_code and c.is_active
  ) then
    raise exception 'Select an active requisition currency';
  end if;
  if p_currency_code = v_base_currency and p_exchange_rate_to_base <> 1 then
    raise exception 'Exchange rate must be 1 for the church base currency';
  end if;

  v_base_amount := round(p_requested_amount * p_exchange_rate_to_base, 4);

  select * into v_policy
  from public.approval_policies p
  where p.transaction_type = 'requisition'
    and p.is_active
    and p.effective_from <= current_date
    and (p.effective_to is null or p.effective_to >= current_date)
    and (p.branch_id = p_branch_id or p.branch_id is null)
  order by (p.branch_id is not null) desc, p.version desc
  limit 1;
  if not found then
    raise exception 'No active requisition approval policy is configured for this branch';
  end if;

  select * into v_band
  from public.approval_policy_bands b
  where b.policy_id = v_policy.id
    and v_base_amount >= b.min_amount_base
    and (b.max_amount_base is null or v_base_amount < b.max_amount_base)
  limit 1;
  if not found then
    raise exception 'No requisition approval threshold band covers this amount';
  end if;

  select count(*) into v_steps_count
  from public.approval_policy_steps s
  where s.band_id = v_band.id;
  if v_steps_count = 0
     or exists (
       select 1 from public.approval_policy_steps s
       where s.band_id = v_band.id
         and (s.required_permission_key <> 'approve_requisitions'
           or not s.prohibit_submitter_approval)
     )
     or (select min(s.step_number) from public.approval_policy_steps s where s.band_id = v_band.id) <> 1
     or (select max(s.step_number) from public.approval_policy_steps s where s.band_id = v_band.id) <> v_steps_count then
    raise exception 'Requisition approval policy must have ordered approval_requisitions steps that prohibit submitter approval';
  end if;

  v_requisition_number := format(
    'REQ-%s-%s',
    to_char(current_date, 'YYYY'),
    lpad(nextval('public.department_requisition_number_seq')::text, 6, '0')
  );

  insert into public.department_requisitions (
    requisition_number, branch_id, ministry_id, applicant_profile_id,
    applicant_name_snapshot, ministry_name_snapshot, title, description,
    requested_amount, currency_code, exchange_rate_to_base, base_currency_code,
    priority, status, needed_by_date, vendor_quote_reference
  ) values (
    v_requisition_number, p_branch_id, p_ministry_id, v_profile_id,
    concat_ws(' ', v_profile.first_name, v_profile.last_name),
    v_ministry.name, trim(p_title), nullif(trim(coalesce(p_description, '')), ''),
    p_requested_amount, p_currency_code, p_exchange_rate_to_base, v_base_currency,
    p_priority, 'draft', p_needed_by_date,
    nullif(trim(coalesce(p_vendor_quote_reference, '')), '')
  )
  returning id into v_requisition_id;

  insert into public.department_requisition_items (
    requisition_id, line_number, item_name, quantity, unit_price
  )
  select
    v_requisition_id, row_number() over (order by item.ordinality)::integer,
    trim(item.item_name), item.quantity, item.unit_price
  from jsonb_to_recordset(p_items) with ordinality as item(
    item_name text, quantity numeric, unit_price numeric, ordinality bigint
  );

  insert into public.approval_requests (
    transaction_type, target_id, branch_id, policy_id, policy_version,
    band_id, amount_base, submitted_by_profile_id, policy_snapshot
  ) values (
    'requisition', v_requisition_id, p_branch_id, v_policy.id, v_policy.version,
    v_band.id, v_base_amount, v_profile_id,
    jsonb_build_object(
      'policy_name', v_policy.name,
      'policy_version', v_policy.version,
      'min_amount_base', v_band.min_amount_base,
      'max_amount_base', v_band.max_amount_base,
      'steps', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'step_number', s.step_number,
          'required_permission_key', s.required_permission_key,
          'required_approvals', s.required_approvals,
          'prohibit_submitter_approval', s.prohibit_submitter_approval
        ) order by s.step_number), '[]'::jsonb)
        from public.approval_policy_steps s where s.band_id = v_band.id
      )
    )
  ) returning id into v_request_id;

  insert into public.approval_request_steps (
    approval_request_id, step_number, required_permission_key,
    required_approvals, prohibit_submitter_approval
  )
  select
    v_request_id, s.step_number, s.required_permission_key,
    s.required_approvals, s.prohibit_submitter_approval
  from public.approval_policy_steps s
  where s.band_id = v_band.id
  order by s.step_number;

  update public.department_requisitions
  set status = 'pending_approval',
      approval_request_id = v_request_id,
      submitted_at = now(),
      updated_at = now()
  where id = v_requisition_id;

  insert into public.audit_logs (
    actor_profile_id, action, entity_type, entity_id, branch_id, details
  ) values (
    v_profile_id, 'department_requisition.submitted', 'department_requisition',
    v_requisition_id, p_branch_id,
    jsonb_build_object('requisition_number', v_requisition_number,
      'ministry_id', p_ministry_id, 'amount', p_requested_amount,
      'currency_code', p_currency_code, 'approval_request_id', v_request_id)
  );

  return jsonb_build_object(
    'requisition_id', v_requisition_id,
    'requisition_number', v_requisition_number,
    'approval_request_id', v_request_id,
    'status', 'pending_approval',
    'requested_amount', p_requested_amount,
    'currency_code', p_currency_code
  );
end;
$$;

create or replace function public.decide_department_requisition_approval(
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
  v_requisition public.department_requisitions%rowtype;
  v_profile_id uuid;
  v_status text;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;
  v_profile_id := private.current_profile_id();
  if v_profile_id is null then
    raise exception 'No member profile is linked to this account';
  end if;
  if p_decision not in ('approved','rejected') then
    raise exception 'Decision must be approved or rejected';
  end if;

  select * into v_step
  from public.approval_request_steps s
  where s.id = p_request_step_id
  for update;
  if not found then raise exception 'Requisition approval step not found'; end if;

  select * into v_request
  from public.approval_requests r
  where r.id = v_step.approval_request_id
    and r.transaction_type = 'requisition'
  for update;
  if not found then raise exception 'Approval step is not a requisition approval'; end if;

  select * into v_requisition
  from public.department_requisitions r
  where r.id = v_request.target_id
    and r.approval_request_id = v_request.id
  for update;
  if not found then raise exception 'Requisition approval target is missing or inconsistent'; end if;
  if v_requisition.status <> 'pending_approval' then
    raise exception 'Requisition is no longer awaiting approval';
  end if;

  v_status := private.record_approval_decision(
    p_request_step_id, p_decision, nullif(trim(coalesce(p_comments, '')), '')
  );

  if v_status = 'approved' then
    update public.department_requisitions
    set status = 'approved',
        approved_at = now(),
        approved_by_profile_id = v_profile_id,
        updated_at = now()
    where id = v_requisition.id;
  elsif v_status = 'rejected' then
    update public.department_requisitions
    set status = 'rejected',
        approved_at = null,
        approved_by_profile_id = null,
        updated_at = now()
    where id = v_requisition.id;
  end if;

  insert into public.audit_logs (
    actor_profile_id, action, entity_type, entity_id, branch_id, details
  ) values (
    v_profile_id, 'department_requisition.' || p_decision,
    'department_requisition', v_requisition.id, v_requisition.branch_id,
    jsonb_build_object('approval_request_id', v_request.id,
      'request_step_id', p_request_step_id, 'comments', nullif(trim(coalesce(p_comments, '')), ''),
      'approval_status', v_status)
  );

  return jsonb_build_object(
    'requisition_id', v_requisition.id,
    'approval_request_id', v_request.id,
    'approval_status', v_status,
    'status', case when v_status in ('approved','rejected') then v_status else 'pending_approval' end
  );
end;
$$;

comment on table public.department_requisitions is
  'Durable branch-scoped ministry/department funding requests; approval is separate from payment and posting.';
comment on function public.submit_department_requisition(uuid,uuid,text,text,numeric,character,numeric,text,date,text,jsonb) is
  'Creates a branch-scoped requisition, immutable approval snapshot and ordered approval steps atomically.';
comment on function public.decide_department_requisition_approval(uuid,text,text) is
  'Records a requisition approval decision through the shared approval engine and updates the requisition source status.';

revoke all on function public.submit_department_requisition(
  uuid, uuid, text, text, numeric, character, numeric, text, date, text, jsonb
) from public, anon, authenticated, service_role;
revoke all on function public.decide_department_requisition_approval(uuid, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.submit_department_requisition(
  uuid, uuid, text, text, numeric, character, numeric, text, date, text, jsonb
) to authenticated;
grant execute on function public.decide_department_requisition_approval(uuid, text, text)
  to authenticated;

commit;
