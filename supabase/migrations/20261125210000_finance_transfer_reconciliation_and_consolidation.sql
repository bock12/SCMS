begin;

-- FIN-INT-005: include descendant branch journals in district/church reporting
-- and expose secure transfer reconciliation/elimination summaries.

create or replace function public.get_finance_scope_journals(
  p_scope_type text,
  p_scope_id uuid default null
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

  if p_scope_type not in ('church', 'district', 'branch') then
    raise exception 'Finance scope must be church, district or branch';
  end if;

  if p_scope_type = 'church' then
    if p_scope_id is not null then
      raise exception 'Church-wide finance scope must not include a scope ID';
    end if;
    if not (
      private.has_permission('view_finances', null)
      or private.has_permission('manage_finances', null)
      or private.has_permission('approve_finances', null)
      or private.has_permission('post_journals', null)
    ) then
      raise exception 'Insufficient permission to view church-wide journal entries';
    end if;
  elsif p_scope_type = 'district' then
    if p_scope_id is null or not exists (
      select 1 from public.districts d where d.id = p_scope_id
    ) then
      raise exception 'Finance district does not exist';
    end if;
    if not (
      private.has_permission_for_district('view_finances', p_scope_id)
      or private.has_permission_for_district('manage_finances', p_scope_id)
      or private.has_permission_for_district('approve_finances', p_scope_id)
      or private.has_permission_for_district('post_journals', p_scope_id)
    ) then
      raise exception 'Insufficient permission to view journal entries in this district';
    end if;
  else
    if p_scope_id is null or not exists (
      select 1 from public.church_branches b where b.id = p_scope_id
    ) then
      raise exception 'Finance branch does not exist';
    end if;
    if not (
      private.has_permission('view_finances', p_scope_id)
      or private.has_permission('manage_finances', p_scope_id)
      or private.has_permission('approve_finances', p_scope_id)
      or private.has_permission('post_journals', p_scope_id)
    ) then
      raise exception 'Insufficient permission to view journal entries in this branch';
    end if;
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
        'district_id', je.district_id,
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
          and private.has_permission_for_finance_scope('post_journals', je.branch_id, je.district_id)
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
    where
      (p_scope_type = 'church')
        or (p_scope_type = 'district' and je.district_id = p_scope_id)
        or (p_scope_type = 'branch' and je.branch_id = p_scope_id)
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
    where je.status = 'posted'
      and (
        (p_scope_type = 'church')
        or (p_scope_type = 'district' and je.district_id = p_scope_id)
        or (p_scope_type = 'branch' and je.branch_id = p_scope_id)
      )
    group by coa.id, coa.code, coa.name, coa.account_type, coa.normal_balance, je.base_currency_code
  ) balance;

  return jsonb_build_object(
    'actor_profile_id', v_profile_id,
    'journals', v_journals,
    'account_balances', v_balances
  );
end;
$$;


revoke all on function public.get_finance_scope_journals(text,uuid)
  from public,anon,service_role;
grant execute on function public.get_finance_scope_journals(text,uuid)
  to authenticated;
comment on function public.get_finance_scope_journals(text,uuid) is
  'Returns journal entries and posted-only account balances for an authorized scope, including descendant branch journals in district and church consolidated views.';


create or replace function public.get_finance_transfer_reconciliation(
  p_scope_type text,
  p_scope_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid;
  v_transfers jsonb;
  v_clearing_summary jsonb;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
  v_profile_id := private.current_profile_id();
  if v_profile_id is null then raise exception 'No member profile is linked to this account'; end if;
  if p_scope_type not in ('church','district','branch') then raise exception 'Finance scope must be church, district or branch'; end if;

  if p_scope_type = 'church' then
    if p_scope_id is not null then raise exception 'Church-wide finance scope must not include a scope ID'; end if;
    if not (private.has_permission('view_finances',null)
      or private.has_permission('manage_finances',null)
      or private.has_permission('approve_finances',null)
      or private.has_permission('post_journals',null)) then
      raise exception 'Insufficient permission to view church-wide transfer reconciliation';
    end if;
  elsif p_scope_type = 'district' then
    if p_scope_id is null or not exists(select 1 from public.districts d where d.id=p_scope_id) then
      raise exception 'Finance district does not exist';
    end if;
    if not (private.has_permission_for_district('view_finances',p_scope_id)
      or private.has_permission_for_district('manage_finances',p_scope_id)
      or private.has_permission_for_district('approve_finances',p_scope_id)
      or private.has_permission_for_district('post_journals',p_scope_id)) then
      raise exception 'Insufficient permission to view transfer reconciliation in this district';
    end if;
  else
    if p_scope_id is null or not exists(select 1 from public.church_branches b where b.id=p_scope_id) then
      raise exception 'Finance branch does not exist';
    end if;
    if not (private.has_permission('view_finances',p_scope_id)
      or private.has_permission('manage_finances',p_scope_id)
      or private.has_permission('approve_finances',p_scope_id)
      or private.has_permission('post_journals',p_scope_id)) then
      raise exception 'Insufficient permission to view transfer reconciliation in this branch';
    end if;
  end if;

  with transfer_rows as (
    select
      ft.id,ft.transfer_number,ft.transaction_date,
      ft.source_branch_id,sb.name as source_branch_name,
      ft.destination_branch_id,db.name as destination_branch_name,
      ft.amount,ft.currency_code,ft.base_currency_code,ft.status,
      ft.description,ft.external_reference,
      ft.source_journal_entry_id,sj.status as source_journal_status,
      sj.entry_number as source_entry_number,sj.posted_at as source_posted_at,
      ft.destination_journal_entry_id,dj.status as destination_journal_status,
      dj.entry_number as destination_entry_number,dj.posted_at as destination_posted_at,
      case when ft.source_branch_id<>ft.destination_branch_id then coalesce(sc.amount,0) else 0 end::numeric(20,4) as source_due_from_base_amount,
      case when ft.source_branch_id<>ft.destination_branch_id then coalesce(dc.amount,0) else 0 end::numeric(20,4) as destination_due_to_base_amount,
      sc.account_id as source_clearing_account_id,
      dc.account_id as destination_clearing_account_id,
      (p_scope_type='church'
        or (p_scope_type='district' and ft.source_district_id=p_scope_id and ft.destination_district_id=p_scope_id)
        or (p_scope_type='branch' and ft.source_branch_id=p_scope_id and ft.destination_branch_id=p_scope_id)
      ) as both_sides_in_scope,
      (p_scope_type='church'
        or (p_scope_type='district' and ft.source_district_id=p_scope_id)
        or (p_scope_type='branch' and ft.source_branch_id=p_scope_id)
      ) as source_in_scope,
      (p_scope_type='church'
        or (p_scope_type='district' and ft.destination_district_id=p_scope_id)
        or (p_scope_type='branch' and ft.destination_branch_id=p_scope_id)
      ) as destination_in_scope
    from public.financial_transfers ft
    join public.church_branches sb on sb.id=ft.source_branch_id
    join public.church_branches db on db.id=ft.destination_branch_id
    left join public.journal_entries sj on sj.id=ft.source_journal_entry_id
    left join public.journal_entries dj on dj.id=ft.destination_journal_entry_id
    left join public.financial_accounts sfa on sfa.id=ft.source_financial_account_id
    left join public.financial_accounts dfa on dfa.id=ft.destination_financial_account_id
    left join lateral (
      select (array_agg(jl.account_id order by jl.line_number))[1] as account_id,
        sum(jl.base_debit_amount-jl.base_credit_amount) as amount
      from public.journal_lines jl where jl.journal_entry_id=ft.source_journal_entry_id
        and jl.account_id<>sfa.chart_account_id
    ) sc on true
    left join lateral (
      select (array_agg(jl.account_id order by jl.line_number))[1] as account_id,
        sum(jl.base_credit_amount-jl.base_debit_amount) as amount
      from public.journal_lines jl where jl.journal_entry_id=ft.destination_journal_entry_id
        and jl.account_id<>dfa.chart_account_id
    ) dc on true
    where p_scope_type='church'
      or (p_scope_type='district' and (ft.source_district_id=p_scope_id or ft.destination_district_id=p_scope_id))
      or (p_scope_type='branch' and (ft.source_branch_id=p_scope_id or ft.destination_branch_id=p_scope_id))
  ),
  evaluated as (
    select tr.*,
      case
        when tr.status='rejected' then 'rejected'
        when tr.status<>'posted' then 'not_posted'
        when tr.source_branch_id=tr.destination_branch_id and tr.source_journal_status='posted' then 'not_required'
        when not tr.both_sides_in_scope then 'counterpart_outside_scope'
        when tr.source_journal_status='posted' and tr.destination_journal_status='posted'
          and abs(tr.source_due_from_base_amount-tr.destination_due_to_base_amount)<=0.0001 then 'matched'
        else 'mismatch'
      end as reconciliation_status,
      case
        when tr.status='posted' and tr.both_sides_in_scope
          and tr.source_branch_id<>tr.destination_branch_id
          and tr.source_journal_status='posted' and tr.destination_journal_status='posted'
          and abs(tr.source_due_from_base_amount-tr.destination_due_to_base_amount)<=0.0001
          then least(greatest(tr.source_due_from_base_amount,0),greatest(tr.destination_due_to_base_amount,0))
        else 0::numeric
      end as elimination_base_amount
    from transfer_rows tr
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'transfer_id',e.id,'transfer_number',e.transfer_number,'transaction_date',e.transaction_date,
    'source_branch_id',e.source_branch_id,'source_branch_name',e.source_branch_name,
    'destination_branch_id',e.destination_branch_id,'destination_branch_name',e.destination_branch_name,
    'amount',e.amount,'currency_code',e.currency_code,'base_currency_code',e.base_currency_code,
    'status',e.status,'description',e.description,'external_reference',e.external_reference,
    'source_journal_entry_id',e.source_journal_entry_id,'source_journal_status',e.source_journal_status,
    'source_entry_number',e.source_entry_number,'source_posted_at',e.source_posted_at,
    'destination_journal_entry_id',e.destination_journal_entry_id,
    'destination_journal_status',e.destination_journal_status,
    'destination_entry_number',e.destination_entry_number,'destination_posted_at',e.destination_posted_at,
    'source_due_from_base_amount',e.source_due_from_base_amount,
    'destination_due_to_base_amount',e.destination_due_to_base_amount,
    'source_clearing_account_id',e.source_clearing_account_id,
    'destination_clearing_account_id',e.destination_clearing_account_id,
    'both_sides_in_scope',e.both_sides_in_scope,
    'source_in_scope',e.source_in_scope,
    'destination_in_scope',e.destination_in_scope,
    'reconciliation_status',e.reconciliation_status,
    'elimination_base_amount',e.elimination_base_amount
  ) order by e.transaction_date desc,e.transfer_number desc),'[]'::jsonb)
  into v_transfers from evaluated e;

  with transfer_rows as (
    select ft.base_currency_code,ft.status,ft.source_branch_id,ft.destination_branch_id,
      sj.status as source_journal_status,dj.status as destination_journal_status,
      (p_scope_type='church' or (p_scope_type='district' and ft.source_district_id=p_scope_id)
        or (p_scope_type='branch' and ft.source_branch_id=p_scope_id)) as source_in_scope,
      (p_scope_type='church' or (p_scope_type='district' and ft.destination_district_id=p_scope_id)
        or (p_scope_type='branch' and ft.destination_branch_id=p_scope_id)) as destination_in_scope,
      (p_scope_type='church'
        or (p_scope_type='district' and ft.source_district_id=p_scope_id and ft.destination_district_id=p_scope_id)
        or (p_scope_type='branch' and ft.source_branch_id=p_scope_id and ft.destination_branch_id=p_scope_id)) as both_sides_in_scope,
      coalesce(sc.amount,0)::numeric(20,4) as source_amount,
      coalesce(dc.amount,0)::numeric(20,4) as destination_amount
    from public.financial_transfers ft
    left join public.journal_entries sj on sj.id=ft.source_journal_entry_id
    left join public.journal_entries dj on dj.id=ft.destination_journal_entry_id
    left join public.financial_accounts sfa on sfa.id=ft.source_financial_account_id
    left join public.financial_accounts dfa on dfa.id=ft.destination_financial_account_id
    left join lateral (
      select sum(jl.base_debit_amount-jl.base_credit_amount) as amount
      from public.journal_lines jl where jl.journal_entry_id=ft.source_journal_entry_id
        and jl.account_id<>sfa.chart_account_id
    ) sc on true
    left join lateral (
      select sum(jl.base_credit_amount-jl.base_debit_amount) as amount
      from public.journal_lines jl where jl.journal_entry_id=ft.destination_journal_entry_id
        and jl.account_id<>dfa.chart_account_id
    ) dc on true
    where p_scope_type='church'
      or (p_scope_type='district' and (ft.source_district_id=p_scope_id or ft.destination_district_id=p_scope_id))
      or (p_scope_type='branch' and (ft.source_branch_id=p_scope_id or ft.destination_branch_id=p_scope_id))
  ),
  evaluated as (
    select *,
      case when status='posted' and source_journal_status='posted' and source_in_scope
        and source_branch_id<>destination_branch_id then source_amount else 0::numeric end as due_from_amount,
      case when status='posted' and destination_journal_status='posted' and destination_in_scope
        and source_branch_id<>destination_branch_id then destination_amount else 0::numeric end as due_to_amount,
      case when status='posted' and both_sides_in_scope
        and source_journal_status='posted' and destination_journal_status='posted'
        and source_branch_id<>destination_branch_id
        and abs(source_amount-destination_amount)<=0.0001
        then least(greatest(source_amount,0),greatest(destination_amount,0))
        else 0::numeric end as elimination_amount
    from transfer_rows
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'base_currency_code',summary.base_currency_code,
    'due_from_balance',summary.due_from_balance,'due_to_balance',summary.due_to_balance,
    'elimination_amount',summary.elimination_amount,
    'remaining_due_from',summary.due_from_balance-summary.elimination_amount,
    'remaining_due_to',summary.due_to_balance-summary.elimination_amount
  ) order by summary.base_currency_code),'[]'::jsonb)
  into v_clearing_summary
  from (
    select base_currency_code,sum(due_from_amount) as due_from_balance,
      sum(due_to_amount) as due_to_balance,sum(elimination_amount) as elimination_amount
    from evaluated group by base_currency_code
  ) summary;

  return jsonb_build_object('actor_profile_id',v_profile_id,'scope_type',p_scope_type,
    'scope_id',p_scope_id,'transfers',v_transfers,'clearing_summary',v_clearing_summary);
end;
$$;

revoke all on function public.get_finance_transfer_reconciliation(text,uuid)
  from public,anon,service_role;
grant execute on function public.get_finance_transfer_reconciliation(text,uuid)
  to authenticated;

comment on function public.get_finance_transfer_reconciliation(text,uuid) is
  'Returns authorized branch transfer journal reconciliation and consolidated due-from/due-to elimination totals for church, district or branch scope.';


commit;
