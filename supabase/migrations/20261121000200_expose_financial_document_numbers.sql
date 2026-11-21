begin;

-- Keep historical migrations immutable. This forward migration exposes the
-- database-generated identity number to transaction callers and document readers.
-- A caller-generated key is scoped to the profile that created the document.
-- A fingerprint prevents the same key from being reused for different input.
alter table public.financial_documents
  add column if not exists idempotency_key uuid,
  add column if not exists idempotency_fingerprint text;

create unique index if not exists uq_financial_documents_creator_idempotency
  on public.financial_documents (created_by_profile_id, idempotency_key)
  where idempotency_key is not null;

create or replace function public.create_financial_document_transaction_idempotent(
  p_document_type text,
  p_transaction_date date,
  p_branch_id uuid,
  p_profile_id uuid,
  p_party_name text,
  p_amount numeric,
  p_currency_code char(3),
  p_payment_method text,
  p_financial_account_id uuid,
  p_category_account_id uuid,
  p_fund_id uuid default null,
  p_external_reference text default null,
  p_description text default null,
  p_exchange_rate_to_base numeric default 1,
  p_idempotency_key uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid;
  v_fingerprint text;
  v_existing public.financial_documents%rowtype;
  v_journal_id uuid;
  v_approval_request_id uuid;
  v_document_number bigint;
  v_result jsonb;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;
  v_profile_id := private.current_profile_id();
  if v_profile_id is null then
    raise exception 'No member profile is linked to this account';
  end if;
  if p_idempotency_key is null then
    raise exception 'A transaction idempotency key is required';
  end if;

  v_fingerprint := md5(jsonb_build_object(
    'document_type', p_document_type,
    'transaction_date', p_transaction_date,
    'branch_id', p_branch_id,
    'profile_id', p_profile_id,
    'party_name', trim(coalesce(p_party_name, '')),
    'amount', p_amount,
    'currency_code', upper(trim(coalesce(p_currency_code::text, ''))),
    'payment_method', p_payment_method,
    'financial_account_id', p_financial_account_id,
    'category_account_id', p_category_account_id,
    'fund_id', p_fund_id,
    'external_reference', nullif(trim(coalesce(p_external_reference, '')), ''),
    'description', trim(coalesce(p_description, '')),
    'exchange_rate_to_base', coalesce(p_exchange_rate_to_base, 1)
  )::text);

  -- Serialize concurrent retries using the same profile/key pair.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_profile_id::text || ':' || p_idempotency_key::text, 0)
  );

  select * into v_existing
  from public.financial_documents
  where created_by_profile_id = v_profile_id
    and idempotency_key = p_idempotency_key
  for update;

  if found then
    if v_existing.idempotency_fingerprint is distinct from v_fingerprint then
      raise exception 'This idempotency key was already used with different transaction details';
    end if;

    v_document_number := v_existing.document_number;
    v_journal_id := v_existing.journal_entry_id;
    if v_journal_id is null then
      select id into v_journal_id
      from public.journal_entries
      where source_id = v_existing.id
        and source_type in ('financial_document', 'financial_document_pending')
      limit 1;
    end if;

    select id into v_approval_request_id
    from public.approval_requests
    where transaction_type = 'financial_document'
      and target_id = v_existing.id
    limit 1;

    return jsonb_build_object(
      'document_id', v_existing.id,
      'document_number', v_document_number,
      'journal_entry_id', v_journal_id,
      'approval_request_id', v_approval_request_id,
      'status', v_existing.status,
      'idempotent_replay', true
    );
  end if;

  -- Keep all accounting validation and journal construction in the existing
  -- authoritative transaction RPC. This wrapper only adds retry safety.
  v_result := public.create_financial_document_transaction(
    p_document_type,
    p_transaction_date,
    p_branch_id,
    p_profile_id,
    p_party_name,
    p_amount,
    p_currency_code,
    p_payment_method,
    p_financial_account_id,
    p_category_account_id,
    p_fund_id,
    p_external_reference,
    p_description,
    p_exchange_rate_to_base
  );

  select document_number into v_document_number
  from public.financial_documents
  where id = (v_result->>'document_id')::uuid;

  update public.financial_documents
  set idempotency_key = p_idempotency_key,
      idempotency_fingerprint = v_fingerprint
  where id = (v_result->>'document_id')::uuid
    and created_by_profile_id = v_profile_id;

  if not found then
    raise exception 'Created financial document could not be associated with its idempotency key';
  end if;

  return v_result || jsonb_build_object(
    'document_number', v_document_number,
    'idempotent_replay', false
  );
end;
$$;

-- The unkeyed RPC remains an internal implementation detail. Authenticated
-- clients must use the keyed entry point above.
revoke all on function public.create_financial_document_transaction(
  text, date, uuid, uuid, text, numeric, char, text, uuid, uuid, uuid, text, text, numeric
) from public, anon, authenticated, service_role;

revoke all on function public.create_financial_document_transaction_idempotent(
  text, date, uuid, uuid, text, numeric, char, text, uuid, uuid, uuid, text, text, numeric, uuid
) from public, anon, authenticated, service_role;
grant execute on function public.create_financial_document_transaction_idempotent(
  text, date, uuid, uuid, text, numeric, char, text, uuid, uuid, uuid, text, text, numeric, uuid
) to authenticated;

-- Read-only, branch-scoped API for the Finance Officer document and approval
-- workspace. SECURITY DEFINER is required because approval metadata is read
-- through this narrow API rather than by exposing internal approval tables.
create or replace function public.get_finance_documents(
  p_branch_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid;
  v_documents jsonb;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  v_profile_id := private.current_profile_id();
  if v_profile_id is null then
    raise exception 'No member profile is linked to this account';
  end if;

  if not (
    private.has_permission('view_finances', p_branch_id)
    or private.has_permission('manage_finances', p_branch_id)
    or private.has_permission('approve_finances', p_branch_id)
  ) then
    raise exception 'Insufficient permission to view financial documents in this branch';
  end if;

  select coalesce(
    jsonb_agg(document_row.document_json
      order by document_row.transaction_date desc,
               document_row.created_at desc,
               document_row.id desc),
    '[]'::jsonb
  )
  into v_documents
  from (
    select
      fd.transaction_date,
      fd.created_at,
      fd.id,
      jsonb_build_object(
        'id', fd.id,
        'document_number', fd.document_number,
        'document_type', fd.document_type,
        'transaction_date', fd.transaction_date,
        'branch_id', fd.branch_id,
        'profile_id', fd.profile_id,
        'payee_or_payer_name', fd.payee_or_payer_name,
        'amount', fd.amount,
        'currency_code', fd.currency_code,
        'payment_method', fd.payment_method,
        'financial_account_id', fd.financial_account_id,
        'fund_id', (
          select jl.fund_id
          from public.journal_entries je
          join public.journal_lines jl on jl.journal_entry_id = je.id
          where je.source_id = fd.id
            and je.source_type in ('financial_document_pending', 'financial_document')
            and jl.fund_id is not null
          order by jl.line_number
          limit 1
        ),
        'external_reference', fd.external_reference,
        'description', fd.description,
        'status', fd.status,
        'journal_entry_id', fd.journal_entry_id,
        'approval_request_id', ar.id,
        'approval_status', ar.status,
        'actor_approval_step_id', actor_step.id,
        'approval_steps_completed', coalesce(approval_progress.completed_count, 0),
        'approval_steps_total', coalesce(approval_progress.total_count, 0),
        'approval_steps', coalesce(approval_progress.steps, '[]'::jsonb)
      ) as document_json
    from public.financial_documents fd
    left join public.approval_requests ar
      on ar.id = fd.approval_request_id
      and ar.transaction_type = 'financial_document'
      and ar.target_id = fd.id
      and ar.branch_id is not distinct from fd.branch_id
    left join lateral (
      select s.id
      from public.approval_request_steps s
      where ar.status = 'pending'
        and s.approval_request_id = ar.id
        and s.status = 'pending'
        and (
          not s.prohibit_submitter_approval
          or ar.submitted_by_profile_id is distinct from v_profile_id
        )
        and private.has_permission(s.required_permission_key, ar.branch_id)
        and not exists (
          select 1
          from public.approval_decisions ad
          where ad.approval_request_step_id = s.id
            and ad.approver_profile_id = v_profile_id
        )
        and not exists (
          select 1
          from public.approval_request_steps prior
          where prior.approval_request_id = ar.id
            and prior.step_number < s.step_number
            and prior.status <> 'approved'
        )
      order by s.step_number
      limit 1
    ) actor_step on true
    left join lateral (
      select
        (count(s.id) filter (where s.status = 'approved'))::integer as completed_count,
        count(s.id)::integer as total_count,
        coalesce(
          jsonb_agg(
            jsonb_build_object(
              'id', s.id,
              'step_order', s.step_number,
              -- The canonical SQL schema is permission-based, not fixed-assignee
              -- based. This is the most recent recorded decision-maker, if any.
              'approver_profile_id', latest_decision.approver_profile_id,
              'status', s.status,
              'decision', latest_decision.decision,
              'comments', latest_decision.comments
            )
            order by s.step_number
          ),
          '[]'::jsonb
        ) as steps
      from public.approval_request_steps s
      left join lateral (
        select
          ad.approver_profile_id,
          ad.decision,
          ad.comments
        from public.approval_decisions ad
        where ad.approval_request_step_id = s.id
        order by ad.decided_at desc, ad.id desc
        limit 1
      ) latest_decision on true
      where s.approval_request_id = ar.id
    ) approval_progress on true
    where fd.branch_id is not distinct from p_branch_id
      and fd.document_type in ('receipt', 'payment')
  ) document_row;

  return jsonb_build_object(
    'actor_profile_id', v_profile_id,
    'documents', v_documents
  );
end;
$$;

comment on function public.get_finance_documents(uuid) is
  'Returns receipt/payment documents and approval progress for the authenticated profile within one permitted branch scope.';

revoke all on function public.get_finance_documents(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_finance_documents(uuid)
  to authenticated;

commit;
