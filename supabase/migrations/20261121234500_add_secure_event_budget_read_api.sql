begin;
create or replace function public.get_event_budgets(p_branch_id uuid)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  v_profile_id uuid;
  v_budgets jsonb;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
  v_profile_id := private.current_profile_id();
  if v_profile_id is null then raise exception 'No member profile is linked to this account'; end if;
  if p_branch_id is null or not (
    private.has_permission('view_finances', p_branch_id)
    or private.has_permission('manage_finances', p_branch_id)
    or private.has_permission('approve_finances', p_branch_id)
  ) then
    raise exception 'Insufficient permission to view event budgets in this branch';
  end if;

  select coalesce(jsonb_agg(result.item order by result.created_at desc), '[]'::jsonb)
  into v_budgets
  from (
    select b.created_at,
      jsonb_build_object(
        'id', b.id, 'name', b.name, 'budget_type', b.budget_type,
        'branch_id', b.branch_id, 'event_id', b.event_id, 'event_title', e.title,
        'period_id', b.period_id, 'currency_code', b.currency_code,
        'exchange_rate_to_base', b.exchange_rate_to_base,
        'base_currency_code', b.base_currency_code, 'status', b.status,
        'created_at', b.created_at, 'submitted_by_profile_id', b.submitted_by_profile_id,
        'total_budget', (select coalesce(sum(bl.allocated_amount), 0)
                         from public.budget_lines bl where bl.budget_id = b.id),
        'total_actual', coalesce(payment.actual_amount, 0),
        'lines', (select coalesce(jsonb_agg(jsonb_build_object(
          'id', bl.id, 'account_id', bl.account_id, 'fund_id', bl.fund_id,
          'description', bl.description, 'allocated_amount', bl.allocated_amount
        ) order by bl.created_at, bl.id), '[]'::jsonb)
          from public.budget_lines bl where bl.budget_id = b.id),
        'approval_status', ar.status,
        'approval_steps', (select coalesce(jsonb_agg(jsonb_build_object(
          'id', ars.id, 'step_number', ars.step_number,
          'required_permission_key', ars.required_permission_key,
          'required_approvals', ars.required_approvals,
          'prohibit_submitter_approval', ars.prohibit_submitter_approval,
          'status', ars.status,
          'approvals_received', (select count(*)::integer from public.approval_decisions ad
            where ad.approval_request_step_id = ars.id and ad.decision = 'approved'),
          'actor_can_decide', (
            ars.status = 'pending'
            and private.has_permission(ars.required_permission_key, b.branch_id)
            and (not ars.prohibit_submitter_approval or b.submitted_by_profile_id <> v_profile_id)
            and not exists (select 1 from public.approval_decisions own_decision
              where own_decision.approval_request_step_id = ars.id
                and own_decision.approver_profile_id = v_profile_id)
            and not exists (select 1 from public.approval_request_steps prior
              where prior.approval_request_id = ars.approval_request_id
                and prior.step_number < ars.step_number and prior.status <> 'approved')
          )
        ) order by ars.step_number), '[]'::jsonb)
          from public.approval_request_steps ars where ars.approval_request_id = b.approval_request_id),
        'payment_document_id', payment.document_id,
        'payment_document', case when payment.document_id is null then null else jsonb_build_object(
          'id', payment.document_id, 'document_number', payment.document_number,
          'status', payment.document_status, 'journal_entry_id', payment.journal_entry_id
        ) end
      ) as item
    from public.budgets b
    join public.events e on e.id = b.event_id
    left join public.approval_requests ar on ar.id = b.approval_request_id
      and ar.transaction_type = 'budget' and ar.target_id = b.id
    left join lateral (
      select d.id as document_id, d.document_number, d.status as document_status,
        d.journal_entry_id,
        case when d.status = 'posted' and j.status = 'posted' then d.amount else 0 end as actual_amount
      from public.financial_documents d
      left join public.journal_entries j on j.id = d.journal_entry_id
      where d.source_budget_id = b.id
      order by d.created_at desc limit 1
    ) payment on true
    where b.budget_type = 'event' and b.branch_id = p_branch_id
  ) result;
  return jsonb_build_object('budgets', v_budgets);
end;
$$;
revoke all on function public.get_event_budgets(uuid) from public, anon, service_role;
grant execute on function public.get_event_budgets(uuid) to authenticated;
commit;