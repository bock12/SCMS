
begin;

insert into public.permissions (key, module, description) values
  ('view_resources', 'resources', 'View resources available to the user'),
  ('manage_resources', 'resources', 'Create and manage church resources'),
  ('view_surveys', 'surveys', 'View eligible event surveys'),
  ('manage_surveys', 'surveys', 'Create and manage event surveys')
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on
  (r.name in ('super_admin','admin','pastor','leader','worker')
    and p.key in ('view_resources','manage_resources','view_surveys','manage_surveys'))
  or (r.name = 'member' and p.key in ('view_resources','view_surveys'))
on conflict do nothing;

create table public.church_resources (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid references public.church_branches(id) on delete restrict,
  title text not null,
  description text,
  category text,
  resource_type text not null
    check (resource_type in ('document','video','audio','image','link')),
  resource_url text not null,
  visibility text not null default 'members_only'
    check (visibility in ('public','members_only','staff_only')),
  status text not null default 'draft'
    check (status in ('draft','published','archived')),
  created_by_profile_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index ix_church_resources_branch_status
  on public.church_resources (branch_id, status);
create index ix_church_resources_visibility_status
  on public.church_resources (visibility, status);
create index ix_church_resources_created_by
  on public.church_resources (created_by_profile_id)
  where created_by_profile_id is not null;

create table public.event_surveys (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete restrict,
  title text not null,
  description text,
  respondent_scope text not null default 'all_members'
    check (respondent_scope in ('all_members','registrants','attendees')),
  status text not null default 'draft'
    check (status in ('draft','active','closed','archived')),
  opens_at timestamptz,
  closes_at timestamptz,
  created_by_profile_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_surveys_window check (
    opens_at is null or closes_at is null or closes_at > opens_at
  )
);
create index ix_event_surveys_event_status on public.event_surveys (event_id, status);
create index ix_event_surveys_created_by
  on public.event_surveys (created_by_profile_id)
  where created_by_profile_id is not null;

create table public.event_survey_questions (
  id uuid primary key default gen_random_uuid(),
  survey_id uuid not null references public.event_surveys(id) on delete restrict,
  question_text text not null,
  question_type text not null
    check (question_type in (
      'short_text','long_text','single_choice','multiple_choice',
      'checkbox','number','date','rating'
    )),
  is_required boolean not null default false,
  options jsonb not null default '[]'::jsonb,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint uq_survey_question_id_survey unique (id, survey_id),
  constraint uq_survey_question_order unique (survey_id, sort_order)
);
create index ix_event_survey_questions_survey
  on public.event_survey_questions (survey_id, sort_order);

create table public.event_survey_responses (
  id uuid primary key default gen_random_uuid(),
  survey_id uuid not null references public.event_surveys(id) on delete restrict,
  member_id uuid not null references public.profiles(id) on delete restrict,
  submitted_at timestamptz not null default now(),
  constraint uq_survey_response_member unique (survey_id, member_id),
  constraint uq_survey_response_id_survey unique (id, survey_id)
);
create index ix_event_survey_responses_member
  on public.event_survey_responses (member_id);

create table public.event_survey_answers (
  id uuid primary key default gen_random_uuid(),
  response_id uuid not null,
  question_id uuid not null,
  survey_id uuid not null,
  answer_value jsonb not null,
  created_at timestamptz not null default now(),
  constraint fk_survey_answer_response_same_survey
    foreign key (response_id, survey_id)
    references public.event_survey_responses (id, survey_id)
    on delete restrict,
  constraint fk_survey_answer_question_same_survey
    foreign key (question_id, survey_id)
    references public.event_survey_questions (id, survey_id)
    on delete restrict,
  constraint uq_survey_answer_per_question unique (response_id, question_id)
);
create index ix_event_survey_answers_question
  on public.event_survey_answers (question_id, survey_id);

alter table public.church_resources enable row level security;
alter table public.event_surveys enable row level security;
alter table public.event_survey_questions enable row level security;
alter table public.event_survey_responses enable row level security;
alter table public.event_survey_answers enable row level security;

revoke all on public.church_resources, public.event_surveys,
  public.event_survey_questions, public.event_survey_responses,
  public.event_survey_answers
from anon, authenticated;

grant select on public.church_resources to anon, authenticated;
grant select on public.event_surveys, public.event_survey_questions,
  public.event_survey_responses, public.event_survey_answers
to authenticated;

create policy public_resources_anon_read
on public.church_resources for select to anon
using (visibility = 'public' and status = 'published' and branch_id is null);

create policy resources_authenticated_read
on public.church_resources for select to authenticated
using (
  status = 'published'
  and (
    visibility = 'public'
    or visibility = 'members_only'
    or private.has_permission('manage_resources', branch_id)
  )
  and (
    branch_id is null
    or exists (
      select 1 from public.profiles p
      where p.auth_user_id = (select auth.uid())
        and p.branch_id = church_resources.branch_id
    )
    or private.can_access_branch(branch_id)
    or private.has_permission('view_resources', branch_id)
  )
);

create policy event_surveys_eligible_read
on public.event_surveys for select to authenticated
using (
  private.has_permission('manage_surveys',
    (select e.branch_id from public.events e where e.id = event_surveys.event_id))
  or (
    status = 'active'
    and (opens_at is null or opens_at <= now())
    and (closes_at is null or closes_at > now())
    and (
      (
        respondent_scope = 'all_members'
        and exists (
          select 1 from public.profiles p
          where p.id = private.current_profile_id()
            and p.membership_status = 'active'
            and p.record_status = 'active'
        )
      )
      or (
        respondent_scope = 'registrants'
        and exists (
          select 1 from public.event_registrations er
          where er.event_id = event_surveys.event_id
            and er.member_id = private.current_profile_id()
            and er.status in ('confirmed','checked_in','attended')
        )
      )
      or (
        respondent_scope = 'attendees'
        and exists (
          select 1
          from public.attendance_records ar
          join public.attendance_sessions ats on ats.id = ar.session_id
          where ats.event_id = event_surveys.event_id
            and ar.member_id = private.current_profile_id()
            and ar.attendance_status in ('present','late')
        )
      )
    )
  )
);

create policy event_survey_questions_eligible_read
on public.event_survey_questions for select to authenticated
using (
  exists (
    select 1 from public.event_surveys s
    where s.id = survey_id
  )
);

create policy event_survey_responses_self_or_manager_read
on public.event_survey_responses for select to authenticated
using (
  member_id = private.current_profile_id()
  or exists (
    select 1
    from public.event_surveys s
    join public.events e on e.id = s.event_id
    where s.id = survey_id
      and private.has_permission('manage_surveys', e.branch_id)
  )
);

create policy event_survey_answers_self_or_manager_read
on public.event_survey_answers for select to authenticated
using (
  exists (
    select 1 from public.event_survey_responses r
    where r.id = response_id
      and (
        r.member_id = private.current_profile_id()
        or exists (
          select 1
          from public.event_surveys s
          join public.events e on e.id = s.event_id
          where s.id = r.survey_id
            and private.has_permission('manage_surveys', e.branch_id)
        )
      )
  )
);

create or replace function private.submit_event_survey(
  p_survey_id uuid,
  p_answers jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid;
  v_survey public.event_surveys%rowtype;
  v_response_id uuid;
  v_answer jsonb;
  v_question_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  v_profile_id := private.current_profile_id();
  if v_profile_id is null then
    raise exception 'No member profile is linked to this account';
  end if;

  if jsonb_typeof(p_answers) is distinct from 'array' then
    raise exception 'Answers must be supplied as a JSON array';
  end if;

  select * into v_survey
  from public.event_surveys
  where id = p_survey_id
  for update;

  if not found then
    raise exception 'Survey not found';
  end if;

  if v_survey.status <> 'active'
     or (v_survey.opens_at is not null and v_survey.opens_at > now())
     or (v_survey.closes_at is not null and v_survey.closes_at <= now()) then
    raise exception 'Survey is not currently open';
  end if;

  if v_survey.respondent_scope = 'all_members' then
    if not exists (
      select 1 from public.profiles p
      where p.id = v_profile_id
        and p.membership_status = 'active'
        and p.record_status = 'active'
    ) then
      raise exception 'Only active members may respond';
    end if;
  elsif v_survey.respondent_scope = 'registrants' then
    if not exists (
      select 1 from public.event_registrations er
      where er.event_id = v_survey.event_id
        and er.member_id = v_profile_id
        and er.status in ('confirmed','checked_in','attended')
    ) then
      raise exception 'Only registered event members may respond';
    end if;
  elsif v_survey.respondent_scope = 'attendees' then
    if not exists (
      select 1
      from public.attendance_records ar
      join public.attendance_sessions ats on ats.id = ar.session_id
      where ats.event_id = v_survey.event_id
        and ar.member_id = v_profile_id
        and ar.attendance_status in ('present','late')
    ) then
      raise exception 'Only recorded attendees may respond';
    end if;
  end if;

  if exists (
    select 1
    from public.event_survey_questions q
    where q.survey_id = p_survey_id
      and q.is_required
      and not exists (
        select 1
        from jsonb_array_elements(p_answers) a
        where (a->>'question_id')::uuid = q.id
      )
  ) then
    raise exception 'A required survey question is unanswered';
  end if;

  insert into public.event_survey_responses (survey_id, member_id)
  values (p_survey_id, v_profile_id)
  returning id into v_response_id;

  for v_answer in select value from jsonb_array_elements(p_answers)
  loop
    v_question_id := (v_answer->>'question_id')::uuid;

    if not exists (
      select 1 from public.event_survey_questions q
      where q.id = v_question_id and q.survey_id = p_survey_id
    ) then
      raise exception 'Question does not belong to this survey';
    end if;

    if not (v_answer ? 'answer') then
      raise exception 'Each answer must include an answer value';
    end if;

    insert into public.event_survey_answers (
      response_id, question_id, survey_id, answer_value
    )
    values (
      v_response_id, v_question_id, p_survey_id, v_answer->'answer'
    );
  end loop;

  return v_response_id;
end;
$$;

revoke all on function private.submit_event_survey(uuid, jsonb)
  from public, anon, authenticated;
grant execute on function private.submit_event_survey(uuid, jsonb)
  to authenticated;

commit;