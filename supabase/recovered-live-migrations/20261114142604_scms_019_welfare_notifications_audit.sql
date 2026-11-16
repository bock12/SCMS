
begin;

create table public.welfare_cases (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null,
  branch_id uuid references public.church_branches(id) on delete restrict,
  case_type text not null,
  reason text not null,
  restricted_description text,
  priority text not null default 'normal'
    check (priority in ('low','normal','high','urgent')),
  status text not null default 'submitted'
    check (status in ('submitted','under_review','approved','rejected','completed','closed')),
  assigned_to_profile_id uuid references public.profiles(id) on delete set null,
  created_by_profile_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint welfare_case_reason_nonblank check (length(trim(reason)) > 0),
  constraint welfare_case_member_branch_fk
    foreign key (member_id, branch_id)
    references public.profiles (id, branch_id)
    on delete restrict
);
create index ix_welfare_cases_member on public.welfare_cases (member_id, created_at desc);
create index ix_welfare_cases_branch_status on public.welfare_cases (branch_id, status);
create index ix_welfare_cases_assigned_to on public.welfare_cases (assigned_to_profile_id)
  where assigned_to_profile_id is not null;
create index ix_welfare_cases_created_by on public.welfare_cases (created_by_profile_id)
  where created_by_profile_id is not null;

create table public.welfare_assistance (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.welfare_cases(id) on delete restrict,
  assistance_type text not null,
  financial_document_id uuid unique
    references public.financial_documents(id) on delete restrict,
  description text,
  approved_by_profile_id uuid references public.profiles(id) on delete set null,
  provided_at timestamptz,
  created_at timestamptz not null default now()
);
create index ix_welfare_assistance_case on public.welfare_assistance (case_id);
create index ix_welfare_assistance_approved_by
  on public.welfare_assistance (approved_by_profile_id)
  where approved_by_profile_id is not null;

create table public.welfare_campaigns (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid references public.church_branches(id) on delete restrict,
  campaign_name text not null,
  beneficiary text,
  purpose text,
  target_amount numeric(20,4) not null check (target_amount >= 0),
  expected_contribution numeric(20,4) not null default 0
    check (expected_contribution >= 0),
  currency_code char(3) not null references public.currencies(code),
  deadline date,
  status text not null default 'draft'
    check (status in ('draft','active','completed','cancelled','archived')),
  created_by_profile_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint welfare_campaign_name_nonblank check (length(trim(campaign_name)) > 0)
);
create index ix_welfare_campaigns_branch_status
  on public.welfare_campaigns (branch_id, status);
create index ix_welfare_campaigns_created_by
  on public.welfare_campaigns (created_by_profile_id)
  where created_by_profile_id is not null;

create table public.welfare_contributions (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.welfare_campaigns(id) on delete restrict,
  contributing_member_id uuid references public.profiles(id) on delete set null,
  financial_document_id uuid not null unique
    references public.financial_documents(id) on delete restrict,
  contribution_date date not null default current_date,
  created_at timestamptz not null default now()
);
create index ix_welfare_contributions_campaign
  on public.welfare_contributions (campaign_id);
create index ix_welfare_contributions_member
  on public.welfare_contributions (contributing_member_id)
  where contributing_member_id is not null;

create or replace function private.validate_welfare_financial_links()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_doc public.financial_documents%rowtype;
begin
  if tg_table_name = 'welfare_assistance' then
    if new.financial_document_id is not null then
      select * into v_doc
      from public.financial_documents
      where id = new.financial_document_id;
      if not found or v_doc.document_type not in ('payment','adjustment') then
        raise exception 'Welfare assistance must link to a payment or adjustment document';
      end if;
    end if;
  elsif tg_table_name = 'welfare_contributions' then
    select * into v_doc
    from public.financial_documents
    where id = new.financial_document_id;
    if not found or v_doc.document_type not in ('receipt','adjustment') then
      raise exception 'Welfare contribution must link to a receipt or adjustment document';
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_welfare_assistance_financial_link
before insert or update of financial_document_id
on public.welfare_assistance
for each row execute function private.validate_welfare_financial_links();

create trigger trg_welfare_contributions_financial_link
before insert or update of financial_document_id
on public.welfare_contributions
for each row execute function private.validate_welfare_financial_links();

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid references public.church_branches(id) on delete restrict,
  title text not null,
  message text not null,
  notification_type text not null default 'announcement',
  status text not null default 'draft'
    check (status in ('draft','published','archived')),
  created_by_profile_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  published_at timestamptz,
  constraint notification_title_nonblank check (length(trim(title)) > 0),
  constraint notification_message_nonblank check (length(trim(message)) > 0),
  constraint notification_publish_consistency check (
    (status = 'published' and published_at is not null)
    or status <> 'published'
  )
);
create index ix_notifications_branch_status
  on public.notifications (branch_id, status, published_at desc);
create index ix_notifications_created_by
  on public.notifications (created_by_profile_id)
  where created_by_profile_id is not null;

create table public.notification_recipients (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null
    references public.notifications(id) on delete restrict,
  profile_id uuid not null references public.profiles(id) on delete restrict,
  delivery_status text not null default 'pending'
    check (delivery_status in ('pending','sent','failed')),
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (notification_id, profile_id)
);
create index ix_notification_recipients_profile
  on public.notification_recipients (profile_id, created_at desc);
create index ix_notification_recipients_notification
  on public.notification_recipients (notification_id);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_profile_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  branch_id uuid references public.church_branches(id) on delete restrict,
  details jsonb not null default '{}'::jsonb,
  ip_address inet,
  created_at timestamptz not null default now(),
  constraint audit_action_nonblank check (length(trim(action)) > 0),
  constraint audit_entity_type_nonblank check (length(trim(entity_type)) > 0)
);
create index ix_audit_logs_actor_created
  on public.audit_logs (actor_profile_id, created_at desc);
create index ix_audit_logs_branch_created
  on public.audit_logs (branch_id, created_at desc);
create index ix_audit_logs_entity
  on public.audit_logs (entity_type, entity_id, created_at desc);
create index ix_audit_logs_created
  on public.audit_logs (created_at desc);

alter table public.welfare_cases enable row level security;
alter table public.welfare_assistance enable row level security;
alter table public.welfare_campaigns enable row level security;
alter table public.welfare_contributions enable row level security;
alter table public.notifications enable row level security;
alter table public.notification_recipients enable row level security;
alter table public.audit_logs enable row level security;

revoke all on public.welfare_cases, public.welfare_assistance,
  public.welfare_campaigns, public.welfare_contributions,
  public.notifications, public.notification_recipients, public.audit_logs
from anon, authenticated;
grant select on public.welfare_cases, public.welfare_assistance,
  public.welfare_campaigns, public.welfare_contributions,
  public.notifications, public.notification_recipients, public.audit_logs
to authenticated;
grant update (read_at) on public.notification_recipients to authenticated;

create policy welfare_cases_member_or_manager_read
on public.welfare_cases for select to authenticated
using (
  member_id = private.current_profile_id()
  or private.has_permission('manage_welfare', branch_id)
);

create policy welfare_assistance_member_or_manager_read
on public.welfare_assistance for select to authenticated
using (
  exists (
    select 1 from public.welfare_cases wc
    where wc.id = case_id
      and (
        wc.member_id = private.current_profile_id()
        or private.has_permission('manage_welfare', wc.branch_id)
      )
  )
);

create policy welfare_campaigns_authenticated_read
on public.welfare_campaigns for select to authenticated
using (
  status = 'active'
  and (
    branch_id is null
    or exists (
      select 1 from public.profiles p
      where p.auth_user_id = (select auth.uid())
        and p.branch_id = welfare_campaigns.branch_id
    )
    or private.can_access_branch(branch_id)
    or private.has_permission('manage_welfare', branch_id)
  )
);

create policy welfare_contributions_member_or_manager_read
on public.welfare_contributions for select to authenticated
using (
  contributing_member_id = private.current_profile_id()
  or exists (
    select 1 from public.welfare_campaigns wc
    where wc.id = campaign_id
      and private.has_permission('manage_welfare', wc.branch_id)
  )
  or private.has_permission('view_finances', null)
);

create policy notifications_published_read
on public.notifications for select to authenticated
using (
  status = 'published'
  and (
    branch_id is null
    or exists (
      select 1 from public.profiles p
      where p.auth_user_id = (select auth.uid())
        and p.branch_id = notifications.branch_id
    )
    or private.can_access_branch(branch_id)
  )
);

create policy notification_recipients_self_read
on public.notification_recipients for select to authenticated
using (profile_id = private.current_profile_id());

create policy notification_recipients_self_mark_read
on public.notification_recipients for update to authenticated
using (profile_id = private.current_profile_id())
with check (profile_id = private.current_profile_id());

create policy audit_logs_authorized_read
on public.audit_logs for select to authenticated
using (
  (branch_id is null and private.has_permission('view_audit_logs', null))
  or (branch_id is not null and private.has_permission('view_audit_logs', branch_id))
);

commit;