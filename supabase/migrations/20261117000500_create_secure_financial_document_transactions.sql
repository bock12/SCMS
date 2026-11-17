begin;

-- A single pending journal may exist for each financial document. The source
-- marker is intentionally distinct from the final financial_document source.
create unique index if not exists uq_journal_pending_financial_document
  on public.journal_entries (source_id)
  where source_type = 'financial_document_pending';

create or replace function private.attach_approved_pending_financial_document_journal(
  p_document_id uuid,
  p_journal_entry_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_doc public.financial_documents%rowtype;
  v_entry public.journal_entries%rowtype;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  select * into v_doc
  from public.financial_documents
  where id = p_document_id
  for update;

  if not found or v_doc.status <> 'approved' then
    raise exception 'Only approved financial documents can be linked to a journal';
  end if;
  if v_doc.journal_entry_id is not null then
    raise exception 'Financial document is already linked to a journal';
  end if;

  select * into v_entry
  from public.journal_entries
  where id = p_journal_entry_id
  for update;

  if not found or v_entry.status <> 'draft' then
    raise exception 'Pending journal must exist and remain draft';
  end if;
  if v_entry.source_type <> 'financial_document_pending'
     or v_entry.source_id is distinct from p_document_id then
    raise exception 'Journal is not the pending journal for this document';
  end if;
  if v_entry.currency_code <> v_doc.currency_code
     or v_entry.base_currency_code <> v_doc.base_currency_code
     or v_entry.exchange_rate_to_base <> v_doc.exchange_rate_to_base
     or v_entry.branch_id is distinct from v_doc.branch_id then
    raise exception 'Journal and financial document currency, rate or branch do not match';
  end if;

  update public.journal_entries
  set source_type = 'financial_document',
      source_id = p_document_id
  where id = p_journal_entry_id;

  update public.financial_documents
  set journal_entry_id = p_journal_entry_id,
      updated_at = now()
  where id = p_document_id;
end;
$$;

revoke all on function private.attach_approved_pending_financial_document_journal(uuid, uuid)
  from public, anon, authenticated, service_role;

create or replace function public.create_financial_document_transaction(
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
  p_exchange_rate_to_base numeric default 1
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid;
  v_base_currency char(3);
  v_account public.financial_accounts%rowtype;
  v_cash_account public.chart_of_accounts%rowtype;
  v_category_account public.chart_of_accounts%rowtype;
  v_period public.financial_periods%rowtype;
  v_year public.financial_years%rowtype;
  v_document_id uuid;
  v_journal_id uuid;
  v_request_id uuid;
  v_base_amount numeric(20,4);
  v_document_status text;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  v_profile_id := private.current_profile_id();
  if v_profile_id is null then
    raise exception 'No member profile is linked to this account';
  end if;
  if not private.has_permission('manage_finances', p_branch_id) then
    raise exception 'Insufficient permission to create financial transactions in this branch';
  end if;

  if p_document_type is null or p_document_type not in ('receipt', 'payment') then
    raise exception 'Only receipt and payment transactions can be created here';
  end if;
  if p_transaction_date is null
     or p_amount is null or p_amount <= 0
     or p_exchange_rate_to_base is null or p_exchange_rate_to_base <= 0 then
    raise exception 'Transaction date, positive amount and positive exchange rate are required';
  end if;
  if p_currency_code is null or length(trim(p_currency_code::text)) <> 3
     or not exists (select 1 from public.currencies c where c.code = p_currency_code) then
    raise exception 'A valid transaction currency is required';
  end if;
  if p_party_name is null or length(trim(p_party_name)) = 0
     or p_description is null or length(trim(p_description)) = 0 then
    raise exception 'Counterparty name and description are required';
  end if;
  if p_payment_method is null or p_payment_method not in ('cash','bank_transfer','mobile_money','card','cheque','other') then
    raise exception 'Unsupported payment method';
  end if;

  if p_profile_id is not null and not exists (
    select 1 from public.profiles p where p.id = p_profile_id
  ) then
    raise exception 'Selected member profile does not exist';
  end if;

  select base_currency_code into v_base_currency
  from public.church_settings where id = 1;
  if v_base_currency is null then
    raise exception 'Church settings must be configured before financial operations';
  end if;
  if p_currency_code = v_base_currency and p_exchange_rate_to_base <> 1 then
    raise exception 'Exchange rate must be 1 for the base currency';
  end if;

  select * into v_account
  from public.financial_accounts
  where id = p_financial_account_id
    and is_active
    and currency_code = p_currency_code
    and (branch_id is null or branch_id is not distinct from p_branch_id);
  if not found then
    raise exception 'Financial account is inactive or incompatible with transaction branch/currency';
  end if;

  select * into v_cash_account
  from public.chart_of_accounts
  where id = v_account.chart_account_id
    and is_active
    and account_type = 'asset';
  if not found then
    raise exception 'Financial account must link to an active asset chart account';
  end if;

  select * into v_category_account
  from public.chart_of_accounts
  where id = p_category_account_id
    and is_active
    and not is_control_account
    and account_type = case when p_document_type = 'receipt' then 'income' else 'expense' end;
  if not found then
    raise exception 'Selected category must be an active, non-control account of the correct type';
  end if;

  if p_fund_id is not null and not exists (
    select 1 from public.funds where id = p_fund_id and is_active
  ) then
    raise exception 'Selected fund is inactive or does not exist';
  end if;

  select fp.* into v_period
  from public.financial_periods fp
  join public.financial_years fy on fy.id = fp.financial_year_id
  where fp.status = 'open'
    and fy.status = 'open'
    and p_transaction_date between fp.start_date and fp.end_date
  limit 1;
  if not found then
    raise exception 'No open financial period and year exist for the transaction date';
  end if;

  v_base_amount := round(p_amount * p_exchange_rate_to_base, 4);

  insert into public.financial_documents (
    document_type, transaction_date, branch_id, profile_id,
    payee_or_payer_name, amount, currency_code, payment_method,
    financial_account_id, external_reference, description,
    status, created_by_profile_id, exchange_rate_to_base, base_currency_code
  )
  values (
    p_document_type, p_transaction_date, p_branch_id, p_profile_id,
    trim(p_party_name), p_amount, p_currency_code, p_payment_method,
    p_financial_account_id, nullif(trim(coalesce(p_external_reference, '')), ''),
    trim(p_description), 'draft', v_profile_id,
    p_exchange_rate_to_base, v_base_currency
  )
  returning id into v_document_id;

  insert into public.journal_entries (
    period_id, branch_id, entry_date, description, reference,
    currency_code, exchange_rate_to_base, base_currency_code,
    source_type, source_id, created_by_profile_id
  )
  values (
    v_period.id, p_branch_id, p_transaction_date, trim(p_description),
    nullif(trim(coalesce(p_external_reference, '')), ''),
    p_currency_code, p_exchange_rate_to_base, v_base_currency,
    'financial_document_pending', v_document_id, v_profile_id
  )
  returning id into v_journal_id;

  if p_document_type = 'receipt' then
    insert into public.journal_lines (
      journal_entry_id, line_number, account_id, fund_id, branch_id,
      profile_id, description, debit_amount, credit_amount,
      base_debit_amount, base_credit_amount
    )
    values
      (v_journal_id, 1, v_cash_account.id, null, p_branch_id, p_profile_id,
       trim(p_description), p_amount, 0, v_base_amount, 0),
      (v_journal_id, 2, v_category_account.id, p_fund_id, p_branch_id, p_profile_id,
       trim(p_description), 0, p_amount, 0, v_base_amount);
  else
    insert into public.journal_lines (
      journal_entry_id, line_number, account_id, fund_id, branch_id,
      profile_id, description, debit_amount, credit_amount,
      base_debit_amount, base_credit_amount
    )
    values
      (v_journal_id, 1, v_category_account.id, p_fund_id, p_branch_id, p_profile_id,
       trim(p_description), p_amount, 0, v_base_amount, 0),
      (v_journal_id, 2, v_cash_account.id, null, p_branch_id, p_profile_id,
       trim(p_description), 0, p_amount, 0, v_base_amount);
  end if;

  -- The existing private routine enforces a live policy and a matching amount
  -- band. Any failure rolls back the document and journal with this transaction.
  v_request_id := private.submit_financial_document_for_approval(v_document_id);

  select status into v_document_status
  from public.financial_documents where id = v_document_id;

  if v_document_status = 'approved' then
    perform private.attach_approved_pending_financial_document_journal(
      v_document_id, v_journal_id
    );
  end if;

  return jsonb_build_object(
    'document_id', v_document_id,
    'journal_entry_id', v_journal_id,
    'approval_request_id', v_request_id,
    'status', v_document_status
  );
end;
$$;

create or replace function public.decide_financial_document_approval(
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
  v_document public.financial_documents%rowtype;
  v_journal_id uuid;
  v_result text;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  select * into v_step
  from public.approval_request_steps
  where id = p_request_step_id;
  if not found then raise exception 'Approval step not found'; end if;

  select * into v_request
  from public.approval_requests
  where id = v_step.approval_request_id;
  if not found or v_request.transaction_type <> 'financial_document' then
    raise exception 'Approval step is not for a financial document';
  end if;

  select * into v_document
  from public.financial_documents
  where id = v_request.target_id
  for update;
  if not found then raise exception 'Financial document not found'; end if;

  v_result := private.record_approval_decision(
    p_request_step_id, p_decision, p_comments
  );

  if v_result = 'approved' then
    select id into v_journal_id
    from public.journal_entries
    where source_type = 'financial_document_pending'
      and source_id = v_document.id
      and status = 'draft'
    for update;

    if v_journal_id is null then
      raise exception 'Approved financial document has no matching pending journal';
    end if;

    perform private.attach_approved_pending_financial_document_journal(
      v_document.id, v_journal_id
    );
  end if;

  return jsonb_build_object(
    'document_id', v_document.id,
    'approval_request_id', v_request.id,
    'journal_entry_id', v_journal_id,
    'approval_status', v_result
  );
end;
$$;

-- Keep the baseline-only guard aligned with the forward migration path.
create or replace function private.prevent_pending_financial_document_journal_posting()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'posted'
     and new.source_type = 'financial_document_pending' then
    raise exception 'A financial-document journal cannot be posted before approval and linkage';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_pending_financial_document_journal_posting
  on public.journal_entries;
create trigger trg_prevent_pending_financial_document_journal_posting
before update of status on public.journal_entries
for each row
execute function private.prevent_pending_financial_document_journal_posting();

revoke all on function private.prevent_pending_financial_document_journal_posting()
  from public, anon, authenticated, service_role;

revoke all on function public.create_financial_document_transaction(
  text, date, uuid, uuid, text, numeric, char, text, uuid, uuid, uuid, text, text, numeric
) from public, anon, service_role;
grant execute on function public.create_financial_document_transaction(
  text, date, uuid, uuid, text, numeric, char, text, uuid, uuid, uuid, text, text, numeric
) to authenticated;

revoke all on function public.decide_financial_document_approval(uuid, text, text)
  from public, anon, service_role;
grant execute on function public.decide_financial_document_approval(uuid, text, text)
  to authenticated;

commit;
