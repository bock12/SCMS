begin;

create or replace function public.get_department_requisitions(
  p_branch_id uuid
)
returns jsonb
language plpgsql
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
     or not (
       private.has_permission('submit_requisitions', p_branch_id)
       or private.has_permission('approve_requisitions', p_branch_id)
       or private.has_permission('manage_finances', p_branch_id)
     ) then
    raise exception 'Insufficient permission to view requisitions in this branch';
  end if;

  return coalesce((
    select jsonb_agg(result.item order by result.created_at desc)
    from (
      select
        r.created_at,
        jsonb_build_object(
          'id', r.id,
          'requisition_number', r.requisition_number,
          'branch_id', r.branch_id,
          'ministry_id', r.ministry_id,
          'department_name', r.ministry_name_snapshot,
          'applicant_profile_id', r.applicant_profile_id,
          'applicant_name', r.applicant_name_snapshot,
          'title', r.title,
          'description', r.description,
          'requested_amount', r.requested_amount,
          'currency', r.currency_code,
          'exchange_rate_to_base', r.exchange_rate_to_base,
          'base_currency_code', r.base_currency_code,
          'priority', r.priority,
          'status', r.status,
          'created_at', r.created_at,
          'submitted_at', r.submitted_at,
          'needed_by_date', r.needed_by_date,
          'vendor_quote_reference', r.vendor_quote_reference,
          'approval_request_id', r.approval_request_id,
          'approved_at', r.approved_at,
          'approved_by_profile_id', r.approved_by_profile_id,
          'items', (
            select coalesce(jsonb_agg(jsonb_build_object(
              'id', item.id,
              'item_name', item.item_name,
              'quantity', item.quantity,
              'unit_price', item.unit_price,
              'total_price', item.line_total,
              'line_number', item.line_number
            ) order by item.line_number), '[]'::jsonb)
            from public.department_requisition_items item
            where item.requisition_id = r.id
          ),
          'approval_request', (
            select jsonb_build_object(
              'id', ar.id,
              'status', ar.status,
              'submitted_at', ar.submitted_at,
              'completed_at', ar.completed_at,
              'policy_version', ar.policy_version,
              'policy_snapshot', ar.policy_snapshot
            )
            from public.approval_requests ar
            where ar.id = r.approval_request_id
              and ar.transaction_type = 'requisition'
          ),
          'approval_steps', (
            select coalesce(jsonb_agg(jsonb_build_object(
              'id', s.id,
              'step_number', s.step_number,
              'required_permission_key', s.required_permission_key,
              'required_approvals', s.required_approvals,
              'prohibit_submitter_approval', s.prohibit_submitter_approval,
              'status', s.status,
              'approvals_received', (
                select count(*) from public.approval_decisions d
                where d.approval_request_step_id = s.id
                  and d.decision = 'approved'
              ),
              'actor_can_decide', (
                s.status = 'pending'
                and private.has_permission(s.required_permission_key, r.branch_id)
                and (not s.prohibit_submitter_approval or r.applicant_profile_id <> v_profile_id)
                and not exists (
                  select 1 from public.approval_decisions own_decision
                  where own_decision.approval_request_step_id = s.id
                    and own_decision.approver_profile_id = v_profile_id
                )
                and not exists (
                  select 1 from public.approval_request_steps prior
                  where prior.approval_request_id = s.approval_request_id
                    and prior.step_number < s.step_number
                    and prior.status <> 'approved'
                )
              ),
              'decisions', (
                select coalesce(jsonb_agg(jsonb_build_object(
                  'approver_profile_id', d.approver_profile_id,
                  'decision', d.decision,
                  'comments', d.comments,
                  'decided_at', d.decided_at
                ) order by d.decided_at), '[]'::jsonb)
                from public.approval_decisions d
                where d.approval_request_step_id = s.id
              )
            ) order by s.step_number), '[]'::jsonb)
            from public.approval_request_steps s
            where s.approval_request_id = r.approval_request_id
          )
        ) as item
      from public.department_requisitions r
      where r.branch_id = p_branch_id
        and (
          r.applicant_profile_id = v_profile_id
          or private.has_permission('approve_requisitions', r.branch_id)
          or private.has_permission('manage_finances', r.branch_id)
        )
    ) result
  ), '[]'::jsonb);
end;
$$;

comment on function public.get_department_requisitions(uuid) is
  'Returns only the current profile own requisitions and branch-scoped requisitions visible to authorized approvers.';

revoke all on function public.get_department_requisitions(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_department_requisitions(uuid)
  to authenticated;

commit;
