begin;

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
