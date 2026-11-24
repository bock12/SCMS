-- Require a different approver for every approval decision within one request.
-- The request row is locked by record_approval_decision before this check, so
-- concurrent decisions for the same request are serialized.
create or replace function private.record_approval_decision(
  p_request_step_id uuid,
  p_decision text,
  p_comments text default null
)
returns text
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_profile_id uuid;
  v_step public.approval_request_steps%rowtype;
  v_request public.approval_requests%rowtype;
  v_approved_count integer;
  v_all_steps_approved boolean;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;
  if p_decision not in ('approved','rejected') then
    raise exception 'Decision must be approved or rejected';
  end if;

  v_profile_id := private.current_profile_id();
  if v_profile_id is null then
    raise exception 'No member profile is linked to this account';
  end if;

  select * into v_step
  from public.approval_request_steps
  where id = p_request_step_id
  for update;
  if not found then raise exception 'Approval step not found'; end if;

  select * into v_request
  from public.approval_requests
  where id = v_step.approval_request_id
  for update;
  if not found or v_request.status <> 'pending' then
    raise exception 'Approval request is not pending';
  end if;
  if v_step.status <> 'pending' then
    raise exception 'Approval step is not pending';
  end if;

  if exists (
    select 1 from public.approval_request_steps prior
    where prior.approval_request_id = v_request.id
      and prior.step_number < v_step.step_number
      and prior.status <> 'approved'
  ) then
    raise exception 'Earlier approval steps must be completed first';
  end if;

  if v_step.prohibit_submitter_approval
     and v_request.submitted_by_profile_id = v_profile_id then
    raise exception 'The submitter cannot approve this request';
  end if;

  -- A profile may contribute only one decision to an approval request,
  -- including when a step requires multiple approvals.
  if exists (
    select 1
    from public.approval_decisions d
    join public.approval_request_steps decided_step
      on decided_step.id = d.approval_request_step_id
    where decided_step.approval_request_id = v_request.id
      and d.approver_profile_id = v_profile_id
  ) then
    raise exception 'Each approval level requires a different approver';
  end if;

  if not private.has_permission_for_finance_scope(
    v_step.required_permission_key,
    v_request.branch_id,
    v_request.district_id
  ) then
    raise exception 'Approver does not have the required permission';
  end if;

  insert into public.approval_decisions (
    approval_request_step_id, approver_profile_id, decision, comments
  )
  values (p_request_step_id, v_profile_id, p_decision, p_comments);

  if p_decision = 'rejected' then
    update public.approval_request_steps
    set status = 'rejected'
    where id = p_request_step_id;

    update public.approval_requests
    set status = 'rejected', completed_at = now()
    where id = v_request.id;

    if v_request.transaction_type = 'financial_document' then
      update public.financial_documents
      set status = 'rejected', approved_at = null, approved_by_profile_id = null
      where id = v_request.target_id
        and approval_request_id = v_request.id;
    elsif v_request.transaction_type = 'budget' then
      update public.budgets
      set status = 'rejected', approved_at = null, approved_by_profile_id = null
      where id = v_request.target_id
        and approval_request_id = v_request.id;
    end if;

    return 'rejected';
  end if;

  select count(*) into v_approved_count
  from public.approval_decisions
  where approval_request_step_id = p_request_step_id
    and decision = 'approved';

  if v_approved_count >= v_step.required_approvals then
    update public.approval_request_steps
    set status = 'approved'
    where id = p_request_step_id;
  end if;

  select not exists (
    select 1 from public.approval_request_steps s
    where s.approval_request_id = v_request.id
      and s.status <> 'approved'
  ) into v_all_steps_approved;

  if v_all_steps_approved then
    update public.approval_requests
    set status = 'approved', completed_at = now()
    where id = v_request.id;

    if v_request.transaction_type = 'financial_document' then
      update public.financial_documents
      set status = 'approved',
          approved_at = now(),
          approved_by_profile_id = v_profile_id
      where id = v_request.target_id
        and approval_request_id = v_request.id;
    elsif v_request.transaction_type = 'budget' then
      update public.budgets
      set status = 'approved',
          approved_at = now(),
          approved_by_profile_id = v_profile_id
      where id = v_request.target_id
        and approval_request_id = v_request.id;
    elsif v_request.transaction_type = 'journal_entry' then
      update public.journal_entries
      set approved_at = now(),
          approved_by_profile_id = v_profile_id
      where id = v_request.target_id
        and status = 'draft'
        and approval_request_id = v_request.id;
    end if;

    return 'approved';
  end if;

  return 'pending';
end;
$function$;
