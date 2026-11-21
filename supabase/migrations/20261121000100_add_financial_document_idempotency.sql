begin;

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

  update public.financial_documents
  set idempotency_key = p_idempotency_key,
      idempotency_fingerprint = v_fingerprint
  where id = (v_result->>'document_id')::uuid
    and created_by_profile_id = v_profile_id;

  if not found then
    raise exception 'Created financial document could not be associated with its idempotency key';
  end if;

  return v_result || jsonb_build_object('idempotent_replay', false);
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

commit;
