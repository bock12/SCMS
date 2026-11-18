begin;

-- Narrow public posting boundary. The private posting routine remains the
-- accounting authority for period, currency, account, balance and branch checks.
create or replace function public.post_finance_journal_entry(
  p_journal_entry_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid;
  v_entry public.journal_entries%rowtype;
  v_document public.financial_documents%rowtype;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  v_profile_id := private.current_profile_id();
  if v_profile_id is null then
    raise exception 'No member profile is linked to this account';
  end if;

  select * into v_entry
  from public.journal_entries
  where id = p_journal_entry_id
  for update;

  if not found then
    raise exception 'Journal entry not found';
  end if;

  if not private.has_permission('post_journals', v_entry.branch_id) then
    raise exception 'Insufficient permission to post journals';
  end if;

  -- Safe retry: a completed posting is returned without mutating the immutable
  -- posted entry. Permission is checked before disclosing its state.
  if v_entry.status = 'posted' then
    return jsonb_build_object(
      'journal_entry_id', v_entry.id,
      'status', 'posted',
      'already_posted', true
    );
  end if;

  if v_entry.status <> 'draft' then
    raise exception 'Only draft journal entries can be posted';
  end if;

  if v_entry.source_type = 'financial_document_pending' then
    raise exception 'A financial-document journal cannot be posted before approval and linkage';
  end if;

  if v_entry.source_type = 'financial_document' then
    select * into v_document
    from public.financial_documents
    where id = v_entry.source_id
    for update;

    if not found
       or v_document.status <> 'approved'
       or v_document.journal_entry_id is distinct from v_entry.id then
      raise exception 'Financial-document journal must be linked to an approved document before posting';
    end if;
  end if;

  perform private.post_journal_entry(p_journal_entry_id);

  return jsonb_build_object(
    'journal_entry_id', p_journal_entry_id,
    'status', 'posted',
    'already_posted', false
  );
end;
$$;

-- Read-only journal workspace API. Balances are derived exclusively from
-- posted journal lines; draft/approval/rejected journals never enter balances.
create or replace function public.get_finance_journals(
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
  v_journals jsonb;
  v_balances jsonb;
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
    or private.has_permission('post_journals', p_branch_id)
  ) then
    raise exception 'Insufficient permission to view journal entries in this branch';
  end if;

  select coalesce(jsonb_agg(journal_row.journal_json
    order by journal_row.entry_date desc, journal_row.created_at desc, journal_row.id desc), '[]'::jsonb)
  into v_journals
  from (
    select
      je.id,
      je.entry_date,
      je.created_at,
      jsonb_build_object(
        'id', je.id,
        'entry_number', je.entry_number,
        'period_id', je.period_id,
        'branch_id', je.branch_id,
        'entry_date', je.entry_date,
        'description', je.description,
        'reference', je.reference,
        'currency_code', je.currency_code,
        'exchange_rate_to_base', je.exchange_rate_to_base,
        'base_currency_code', je.base_currency_code,
        'status', je.status,
        'source_type', je.source_type,
        'source_id', je.source_id,
        'source_document_status', fd.status,
        'posted_at', je.posted_at,
        'total_debits', coalesce(lines.total_debits, 0),
        'total_credits', coalesce(lines.total_credits, 0),
        'base_total_debits', coalesce(lines.base_total_debits, 0),
        'base_total_credits', coalesce(lines.base_total_credits, 0),
        'can_post', (
          je.status = 'draft'
          and je.source_type is distinct from 'financial_document_pending'
          and private.has_permission('post_journals', je.branch_id)
          and (
            je.source_type is distinct from 'financial_document'
            or (fd.status = 'approved' and fd.journal_entry_id = je.id)
          )
        ),
        'lines', coalesce(lines.line_items, '[]'::jsonb)
      ) as journal_json
    from public.journal_entries je
    left join public.financial_documents fd
      on fd.id = je.source_id
      and je.source_type in ('financial_document_pending', 'financial_document')
    left join lateral (
      select
        sum(jl.debit_amount) as total_debits,
        sum(jl.credit_amount) as total_credits,
        sum(jl.base_debit_amount) as base_total_debits,
        sum(jl.base_credit_amount) as base_total_credits,
        jsonb_agg(jsonb_build_object(
          'id', jl.id,
          'line_number', jl.line_number,
          'account_id', jl.account_id,
          'account_code', coa.code,
          'account_name', coa.name,
          'account_type', coa.account_type,
          'normal_balance', coa.normal_balance,
          'fund_id', jl.fund_id,
          'branch_id', jl.branch_id,
          'profile_id', jl.profile_id,
          'description', jl.description,
          'debit_amount', jl.debit_amount,
          'credit_amount', jl.credit_amount,
          'base_debit_amount', jl.base_debit_amount,
          'base_credit_amount', jl.base_credit_amount
        ) order by jl.line_number) as line_items
      from public.journal_lines jl
      join public.chart_of_accounts coa on coa.id = jl.account_id
      where jl.journal_entry_id = je.id
    ) lines on true
    where je.branch_id is not distinct from p_branch_id
  ) journal_row;

  select coalesce(jsonb_agg(jsonb_build_object(
    'account_id', balance.account_id,
    'account_code', balance.code,
    'account_name', balance.name,
    'account_type', balance.account_type,
    'normal_balance', balance.normal_balance,
    'base_currency_code', balance.base_currency_code,
    'debit_total', balance.debit_total,
    'credit_total', balance.credit_total,
    'net_debit_balance', balance.debit_total - balance.credit_total
  ) order by balance.code), '[]'::jsonb)
  into v_balances
  from (
    select
      coa.id as account_id,
      coa.code,
      coa.name,
      coa.account_type,
      coa.normal_balance,
      je.base_currency_code,
      sum(jl.base_debit_amount) as debit_total,
      sum(jl.base_credit_amount) as credit_total
    from public.journal_entries je
    join public.journal_lines jl on jl.journal_entry_id = je.id
    join public.chart_of_accounts coa on coa.id = jl.account_id
    where je.branch_id is not distinct from p_branch_id
      and je.status = 'posted'
    group by coa.id, coa.code, coa.name, coa.account_type, coa.normal_balance, je.base_currency_code
  ) balance;

  return jsonb_build_object(
    'actor_profile_id', v_profile_id,
    'journals', v_journals,
    'account_balances', v_balances
  );
end;
$$;

comment on function public.post_finance_journal_entry(uuid) is
  'Posts one approved and balanced draft journal through the canonical private posting validator; safe retries do not mutate posted entries.';
comment on function public.get_finance_journals(uuid) is
  'Returns branch-scoped journal entries and posted-line account balances; draft journals are excluded from balances.';

revoke all on function public.post_finance_journal_entry(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.post_finance_journal_entry(uuid)
  to authenticated;

revoke all on function public.get_finance_journals(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_finance_journals(uuid)
  to authenticated;

commit;
