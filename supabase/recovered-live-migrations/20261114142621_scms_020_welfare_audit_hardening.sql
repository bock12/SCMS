
begin;

insert into public.roles (name, description, is_system) values
  ('welfare_officer', 'Authorized welfare case manager', true),
  ('communications_officer', 'Church communications and announcements manager', true)
on conflict (name) do nothing;

insert into public.permissions (key, module, description) values
  ('manage_notifications', 'notifications', 'Create and publish church notifications')
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on
  (r.name in ('super_admin','admin','pastor','welfare_officer') and p.key = 'manage_welfare')
  or (r.name in ('super_admin','admin','pastor','communications_officer')
      and p.key = 'manage_notifications')
on conflict do nothing;

create or replace function private.validate_welfare_financial_links()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_doc public.financial_documents%rowtype;
  v_case public.welfare_cases%rowtype;
  v_campaign public.welfare_campaigns%rowtype;
begin
  if tg_table_name = 'welfare_assistance' then
    if new.financial_document_id is not null then
      select * into v_doc from public.financial_documents
      where id = new.financial_document_id;
      if not found or v_doc.status <> 'posted'
         or v_doc.document_type not in ('payment','adjustment') then
        raise exception 'Welfare assistance must link to a posted payment or adjustment document';
      end if;

      select * into v_case from public.welfare_cases where id = new.case_id;
      if found and v_case.branch_id is not null
         and v_doc.branch_id is not null
         and v_case.branch_id <> v_doc.branch_id then
        raise exception 'Welfare assistance and financial document branches do not match';
      end if;
    end if;
  elsif tg_table_name = 'welfare_contributions' then
    select * into v_doc from public.financial_documents
    where id = new.financial_document_id;
    if not found or v_doc.status <> 'posted'
       or v_doc.document_type not in ('receipt','adjustment') then
      raise exception 'Welfare contribution must link to a posted receipt or adjustment document';
    end if;

    select * into v_campaign from public.welfare_campaigns where id = new.campaign_id;
    if found then
      if v_doc.currency_code <> v_campaign.currency_code then
        raise exception 'Welfare contribution currency must match campaign currency';
      end if;
      if v_campaign.branch_id is not null
         and v_doc.branch_id is not null
         and v_campaign.branch_id <> v_doc.branch_id then
        raise exception 'Welfare contribution and financial document branches do not match';
      end if;
    end if;
  end if;
  return new;
end;
$$;

create or replace function private.prevent_audit_log_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Audit log records are append-only';
end;
$$;

create trigger trg_audit_logs_append_only
before update or delete on public.audit_logs
for each row execute function private.prevent_audit_log_mutation();

commit;