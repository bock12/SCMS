begin;

-- Finance ownership is hierarchical within one church:
--   branch_id IS NOT NULL                  => branch-owned
--   branch_id IS NULL, district_id NOT NULL => district-owned
--   both NULL                              => church-wide
-- District IDs are stored as an ownership snapshot on finance records. A branch
-- move must be handled explicitly so historical reporting is not silently
-- rewritten.

alter table public.financial_accounts
  add column if not exists district_id uuid
    references public.districts(id) on delete restrict;

alter table public.funds
  add column if not exists branch_id uuid
    references public.church_branches(id) on delete restrict,
  add column if not exists district_id uuid
    references public.districts(id) on delete restrict;

alter table public.financial_documents
  add column if not exists district_id uuid
    references public.districts(id) on delete restrict;

alter table public.approval_policies
  add column if not exists district_id uuid
    references public.districts(id) on delete restrict;

alter table public.approval_requests
  add column if not exists district_id uuid
    references public.districts(id) on delete restrict;

alter table public.journal_entries
  add column if not exists district_id uuid
    references public.districts(id) on delete restrict;

alter table public.budgets
  add column if not exists district_id uuid
    references public.districts(id) on delete restrict;

alter table public.department_requisitions
  add column if not exists district_id uuid
    references public.districts(id) on delete restrict;

create index if not exists financial_accounts_district_scope_idx
  on public.financial_accounts (district_id, branch_id)
  where district_id is not null;
create index if not exists funds_org_scope_idx
  on public.funds (district_id, branch_id, is_active);
create index if not exists financial_documents_district_date_idx
  on public.financial_documents (district_id, transaction_date desc)
  where district_id is not null;
create index if not exists approval_policies_district_scope_idx
  on public.approval_policies (district_id, transaction_type, is_active)
  where district_id is not null;
create index if not exists approval_requests_district_scope_idx
  on public.approval_requests (district_id, transaction_type, submitted_at desc)
  where district_id is not null;
create index if not exists journal_entries_district_date_idx
  on public.journal_entries (district_id, entry_date desc)
  where district_id is not null;
create index if not exists budgets_district_scope_idx
  on public.budgets (district_id, budget_type, created_at desc)
  where district_id is not null;
create index if not exists department_requisitions_district_scope_idx
  on public.department_requisitions (district_id, status, created_at desc)
  where district_id is not null;

-- Branch-scoped records inherit the branch's district. A supplied district
-- must match the branch's current district; this prevents cross-district
-- ownership spoofing. District-owned and church-wide rows have no branch_id.
create or replace function private.sync_finance_district_scope()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_branch_district_id uuid;
begin
  if new.branch_id is not null then
    select b.district_id into v_branch_district_id
    from public.church_branches b
    where b.id = new.branch_id;

    if not found then
      raise exception 'Financial scope references an unknown branch';
    end if;

    if new.district_id is null then
      new.district_id := v_branch_district_id;
    elsif new.district_id is distinct from v_branch_district_id then
      raise exception 'Financial record district must match its branch district';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.sync_finance_district_scope()
  from public, anon, authenticated, service_role;

drop trigger if exists trg_financial_accounts_district_scope on public.financial_accounts;
create trigger trg_financial_accounts_district_scope
before insert or update of branch_id, district_id on public.financial_accounts
for each row execute function private.sync_finance_district_scope();

drop trigger if exists trg_funds_district_scope on public.funds;
create trigger trg_funds_district_scope
before insert or update of branch_id, district_id on public.funds
for each row execute function private.sync_finance_district_scope();

drop trigger if exists trg_financial_documents_district_scope on public.financial_documents;
create trigger trg_financial_documents_district_scope
before insert or update of branch_id, district_id on public.financial_documents
for each row execute function private.sync_finance_district_scope();

drop trigger if exists trg_approval_policies_district_scope on public.approval_policies;
create trigger trg_approval_policies_district_scope
before insert or update of branch_id, district_id on public.approval_policies
for each row execute function private.sync_finance_district_scope();

drop trigger if exists trg_approval_requests_district_scope on public.approval_requests;
create trigger trg_approval_requests_district_scope
before insert or update of branch_id, district_id on public.approval_requests
for each row execute function private.sync_finance_district_scope();

drop trigger if exists trg_journal_entries_district_scope on public.journal_entries;
create trigger trg_journal_entries_district_scope
before insert or update of branch_id, district_id on public.journal_entries
for each row execute function private.sync_finance_district_scope();

drop trigger if exists trg_budgets_district_scope on public.budgets;
create trigger trg_budgets_district_scope
before insert or update of branch_id, district_id on public.budgets
for each row execute function private.sync_finance_district_scope();

drop trigger if exists trg_department_requisitions_district_scope on public.department_requisitions;
create trigger trg_department_requisitions_district_scope
before insert or update of branch_id, district_id on public.department_requisitions
for each row execute function private.sync_finance_district_scope();

-- District-wide records are visible to church-wide roles and to roles assigned
-- to that exact district. Branch-only roles do not gain district-wide access.
create or replace function private.has_permission_for_district(
  p_permission_key text,
  p_district_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_district_id is not null and exists (
    select 1
    from public.profile_role_assignments a
    join public.roles r on r.id = a.role_id and r.is_active
    join public.role_permissions rp on rp.role_id = r.id
    join public.permissions p on p.id = rp.permission_id
    where a.profile_id = private.current_profile_id()
      and a.is_active
      and a.assigned_at <= now()
      and (a.expires_at is null or a.expires_at > now())
      and p.key = p_permission_key
      and (
        a.scope_type = 'church'
        or (a.scope_type = 'district' and a.district_id = p_district_id)
      )
  );
$$;

revoke all on function private.has_permission_for_district(text, uuid)
  from public, anon, service_role;
grant execute on function private.has_permission_for_district(text, uuid)
  to authenticated;

-- Financial accounts
drop policy if exists financial_accounts_finance_read on public.financial_accounts;
create policy financial_accounts_finance_read
on public.financial_accounts for select to authenticated
using (
  (branch_id is not null and private.has_permission('view_finances', branch_id))
  or (branch_id is null and district_id is not null
      and private.has_permission_for_district('view_finances', district_id))
  or (branch_id is null and district_id is null
      and private.has_permission('view_finances', null))
);

-- Funds now have explicit church, district or branch ownership.
drop policy if exists funds_finance_read on public.funds;
create policy funds_finance_read
on public.funds for select to authenticated
using (
  (branch_id is not null and private.has_permission('view_finances', branch_id))
  or (branch_id is null and district_id is not null
      and private.has_permission_for_district('view_finances', district_id))
  or (branch_id is null and district_id is null
      and private.has_permission('view_finances', null))
);

-- Financial documents remain readable by their linked member, or by an
-- authorized finance role at the document's exact organizational scope.
drop policy if exists financial_documents_finance_or_party_read on public.financial_documents;
create policy financial_documents_finance_or_party_read
on public.financial_documents for select to authenticated
using (
  profile_id = private.current_profile_id()
  or (branch_id is not null and private.has_permission('view_finances', branch_id))
  or (branch_id is null and district_id is not null
      and private.has_permission_for_district('view_finances', district_id))
  or (branch_id is null and district_id is null
      and private.has_permission('view_finances', null))
);

drop policy if exists approval_policies_finance_read on public.approval_policies;
create policy approval_policies_finance_read
on public.approval_policies for select to authenticated
using (
  (branch_id is not null and (
    private.has_permission('approve_finances', branch_id)
    or private.has_permission('manage_finances', branch_id)
  ))
  or (branch_id is null and district_id is not null and (
    private.has_permission_for_district('approve_finances', district_id)
    or private.has_permission_for_district('manage_finances', district_id)
  ))
  or (branch_id is null and district_id is null and (
    private.has_permission('approve_finances', null)
    or private.has_permission('manage_finances', null)
  ))
);

drop policy if exists approval_requests_requisition_read on public.approval_requests;
create policy approval_requests_requisition_read
on public.approval_requests for select to authenticated
using (
  transaction_type = 'requisition'
  and (
    submitted_by_profile_id = private.current_profile_id()
    or (branch_id is not null and private.has_permission('approve_requisitions', branch_id))
    or (branch_id is null and district_id is not null
        and private.has_permission_for_district('approve_requisitions', district_id))
    or (branch_id is null and district_id is null
        and private.has_permission('approve_requisitions', null))
  )
);

drop policy if exists approval_requests_submitter_or_approver_read on public.approval_requests;
create policy approval_requests_submitter_or_approver_read
on public.approval_requests for select to authenticated
using (
  submitted_by_profile_id = private.current_profile_id()
  or (branch_id is not null and (
    private.has_permission('approve_finances', branch_id)
    or private.has_permission('manage_finances', branch_id)
  ))
  or (branch_id is null and district_id is not null and (
    private.has_permission_for_district('approve_finances', district_id)
    or private.has_permission_for_district('manage_finances', district_id)
  ))
  or (branch_id is null and district_id is null and (
    private.has_permission('approve_finances', null)
    or private.has_permission('manage_finances', null)
  ))
);

drop policy if exists journal_entries_finance_read on public.journal_entries;
create policy journal_entries_finance_read
on public.journal_entries for select to authenticated
using (
  (branch_id is not null and private.has_permission('view_finances', branch_id))
  or (branch_id is null and district_id is not null
      and private.has_permission_for_district('view_finances', district_id))
  or (branch_id is null and district_id is null
      and private.has_permission('view_finances', null))
);

drop policy if exists budgets_finance_read on public.budgets;
create policy budgets_finance_read
on public.budgets for select to authenticated
using (
  (branch_id is not null and private.has_permission('view_finances', branch_id))
  or (branch_id is null and district_id is not null
      and private.has_permission_for_district('view_finances', district_id))
  or (branch_id is null and district_id is null
      and private.has_permission('view_finances', null))
);

drop policy if exists department_requisitions_submitter_or_approver_read
  on public.department_requisitions;
create policy department_requisitions_submitter_or_approver_read
on public.department_requisitions for select to authenticated
using (
  applicant_profile_id = private.current_profile_id()
  or (branch_id is not null and (
    private.has_permission('approve_requisitions', branch_id)
    or private.has_permission('manage_finances', branch_id)
  ))
  or (branch_id is null and district_id is not null and (
    private.has_permission_for_district('approve_requisitions', district_id)
    or private.has_permission_for_district('manage_finances', district_id)
  ))
  or (branch_id is null and district_id is null and (
    private.has_permission('approve_requisitions', null)
    or private.has_permission('manage_finances', null)
  ))
);

commit;
