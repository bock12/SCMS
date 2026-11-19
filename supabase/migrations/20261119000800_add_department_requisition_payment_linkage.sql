begin;

-- A requisition may be settled by several partial payments. Each payment is
-- linked to exactly one requisition; a retry key makes creation idempotent.
alter table public.financial_documents
  add column source_requisition_id uuid
    references public.department_requisitions(id) on delete restrict,
  add column source_request_key text;

alter table public.financial_documents
  add constraint financial_document_requisition_source_type_check
  check (source_requisition_id is null or document_type = 'payment'),
  add constraint financial_document_requisition_request_key_check
  check (source_request_key is null or length(trim(source_request_key)) > 0),
  add constraint financial_document_requisition_key_pair_check
  check ((source_requisition_id is null) = (source_request_key is null));

create unique index uq_financial_documents_requisition_request_key
  on public.financial_documents (source_requisition_id, source_request_key)
  where source_requisition_id is not null;

create index ix_financial_documents_source_requisition_status
  on public.financial_documents (source_requisition_id, status)
  where source_requisition_id is not null;

create or replace function public.create_department_requisition_payment(
  p_requisition_id uuid,
  p_transaction_date date,
  p_profile_id uuid,
  p_party_name text,
  p_amount numeric,
  p_payment_method text,
  p_financial_account_id uuid,
  p_category_account_id uuid,
  p_fund_id uuid default null,
  p_external_reference text default null,
  p_description text default null,
  p_request_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid;
  v_requisition public.department_requisitions%rowtype;
  v_existing public.financial_documents%rowtype;
  v_document_id uuid;
  v_journal_id uuid;
  v_transaction jsonb;
  v_paid numeric(20,4);
  v_reserved numeric(20,4);
  v_remaining numeric(20,4);
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;
  v_actor_id := private.current_profile_id();
  if v_actor_id is null then
    raise exception 'No member profile is linked to this account';
  end if;
  if p_requisition_id is null or p_request_key is null
     or length(trim(p_request_key)) = 0 then
    raise exception 'A requisition and idempotency request key are required';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Payment amount must be positive';
  end if;

  select * into v_requisition
  from public.department_requisitions r
  where r.id = p_requisition_id
  for update;
  if not found then
    raise exception 'Department requisition not found';
  end if;
  if v_requisition.status <> 'approved' then
    raise exception 'Only approved requisitions can receive payments';
  end if;
  if not private.has_permission('manage_finances', v_requisition.branch_id) then
    raise exception 'Insufficient permission to pay a requisition in this branch';
  end if;

  -- Safe idempotent retry: return the existing payment without creating a
  -- second journal or approval request.
  select * into v_existing
  from public.financial_documents d
  where d.source_requisition_id = p_requisition_id
    and d.source_request_key = trim(p_request_key);
  if found then
    select j.id into v_journal_id
    from public.journal_entries j
    where j.source_type = 'financial_document'
      and j.source_id = v_existing.id;
    return jsonb_build_object(
      'requisition_id', p_requisition_id,
      'document_id', v_existing.id,
      'journal_entry_id', coalesce(v_existing.journal_entry_id, v_journal_id),
      'status', v_existing.status,
      'already_exists', true
    );
  end if;

  select
    coalesce(sum(d.amount) filter (
      where d.status = 'approved'
        and j.status = 'posted'
        and d.journal_entry_id = j.id
    ), 0),
    coalesce(sum(d.amount) filter (
      where d.status in ('draft','pending_approval','approved')
        and (j.id is null or j.status <> 'posted')
    ), 0)
  into v_paid, v_reserved
  from public.financial_documents d
  left join public.journal_entries j
    on j.id = d.journal_entry_id
  where d.source_requisition_id = p_requisition_id;

  v_remaining := round(v_requisition.requested_amount - v_paid - v_reserved, 4);
  if v_remaining <= 0 then
    raise exception 'The approved requisition amount is already fully paid or reserved';
  end if;
  if round(p_amount, 4) > v_remaining then
    raise exception 'Payment exceeds the remaining approved requisition amount';
  end if;

  v_transaction := public.create_financial_document_transaction(
    'payment',
    p_transaction_date,
    v_requisition.branch_id,
    p_profile_id,
    p_party_name,
    p_amount,
    v_requisition.currency_code,
    p_payment_method,
    p_financial_account_id,
    p_category_account_id,
    p_fund_id,
    p_external_reference,
    coalesce(nullif(trim(p_description), ''), v_requisition.title),
    v_requisition.exchange_rate_to_base
  );

  v_document_id := (v_transaction->>'document_id')::uuid;
  v_journal_id := (v_transaction->>'journal_entry_id')::uuid;
  if v_document_id is null or v_journal_id is null then
    raise exception 'Canonical payment creation did not return a document and journal';
  end if;

  update public.financial_documents
  set source_requisition_id = p_requisition_id,
      source_request_key = trim(p_request_key),
      updated_at = now()
  where id = v_document_id
    and document_type = 'payment'
    and branch_id = v_requisition.branch_id
    and currency_code = v_requisition.currency_code
    and exchange_rate_to_base = v_requisition.exchange_rate_to_base;
  if not found then
    raise exception 'Canonical payment could not be linked to the approved requisition';
  end if;

  insert into public.audit_logs (
    actor_profile_id, action, entity_type, entity_id, branch_id, details
  ) values (
    v_actor_id, 'department_requisition.payment_created',
    'department_requisition', p_requisition_id, v_requisition.branch_id,
    jsonb_build_object(
      'document_id', v_document_id,
      'journal_entry_id', v_journal_id,
      'amount', p_amount,
      'currency_code', v_requisition.currency_code,
      'request_key', trim(p_request_key),
      'document_status', v_transaction->>'status'
    )
  );

  return jsonb_build_object(
    'requisition_id', p_requisition_id,
    'document_id', v_document_id,
    'journal_entry_id', v_journal_id,
    'approval_request_id', v_transaction->>'approval_request_id',
    'status', v_transaction->>'status',
    'already_exists', false
  );
end;
$$;

create or replace function public.get_department_requisition_payment_summary(
  p_branch_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;
  v_profile_id := private.current_profile_id();
  if v_profile_id is null then
    raise exception 'No member profile is linked to this account';
  end if;
  if p_branch_id is null
     or not private.has_permission('manage_finances', p_branch_id) then
    raise exception 'Insufficient permission to view requisition payment details in this branch';
  end if;

  return coalesce((
    select jsonb_agg(summary.item order by summary.created_at desc)
    from (
      select
        r.created_at,
        jsonb_build_object(
          'requisition_id', r.id,
          'requested_amount', r.requested_amount,
          'currency_code', r.currency_code,
          'paid_amount', coalesce(payments.paid_amount, 0),
          'reserved_amount', coalesce(payments.reserved_amount, 0),
          'remaining_amount', greatest(
            round(r.requested_amount - coalesce(payments.paid_amount, 0)
              - coalesce(payments.reserved_amount, 0), 4), 0
          ),
          'payment_status', case
            when coalesce(payments.paid_amount, 0) >= r.requested_amount then 'paid'
            when coalesce(payments.paid_amount, 0) > 0 then 'partially_paid'
            when coalesce(payments.reserved_amount, 0) > 0 then 'payment_pending'
            else 'unpaid'
          end,
          'payments', coalesce(payments.payment_rows, '[]'::jsonb)
        ) as item
      from public.department_requisitions r
      left join lateral (
        select
          coalesce(sum(d.amount) filter (
            where d.status = 'approved' and j.status = 'posted'
              and d.journal_entry_id = j.id
          ), 0) as paid_amount,
          coalesce(sum(d.amount) filter (
            where d.status in ('draft','pending_approval','approved')
              and (j.id is null or j.status <> 'posted')
          ), 0) as reserved_amount,
          jsonb_agg(jsonb_build_object(
            'document_id', d.id,
            'journal_entry_id', d.journal_entry_id,
            'amount', d.amount,
            'currency_code', d.currency_code,
            'status', d.status,
            'journal_status', j.status,
            'transaction_date', d.transaction_date,
            'external_reference', d.external_reference
          ) order by d.created_at) as payment_rows
        from public.financial_documents d
        left join public.journal_entries j on j.id = d.journal_entry_id
        where d.source_requisition_id = r.id
      ) payments on true
      where r.branch_id = p_branch_id
        and (
          private.has_permission('manage_finances', r.branch_id)
        )
    ) summary
  ), '[]'::jsonb);
end;
$$;

comment on function public.create_department_requisition_payment(uuid,date,uuid,text,numeric,text,uuid,uuid,uuid,text,text,text) is
  'Creates a partial or full canonical payment for an approved requisition, atomically links it, and reserves its amount until posting or rejection.';
comment on function public.get_department_requisition_payment_summary(uuid) is
  'Returns finance-authorized requisition payment reservations and posted-only paid totals.';

revoke all on function public.create_department_requisition_payment(
  uuid,date,uuid,text,numeric,text,uuid,uuid,uuid,text,text,text
) from public, anon, authenticated, service_role;
grant execute on function public.create_department_requisition_payment(
  uuid,date,uuid,text,numeric,text,uuid,uuid,uuid,text,text,text
) to authenticated;

revoke all on function public.get_department_requisition_payment_summary(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_department_requisition_payment_summary(uuid)
  to authenticated;

commit;
