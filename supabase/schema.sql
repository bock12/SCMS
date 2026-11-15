--
-- PostgreSQL database dump
--

\restrict Gegzfwvkmf6xDw2lsnqWHpSkox7MGbKTEA9di8jqu2gFcKMF0Pb47zmLVqX1myV

-- Dumped from database version 17.11
-- Dumped by pg_dump version 17.12 (Ubuntu 17.12-1.pgdg24.04+1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: extensions; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA extensions;


--
-- Name: private; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA private;


--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: grant_pg_cron_access(); Type: FUNCTION; Schema: extensions; Owner: -
--

CREATE FUNCTION extensions.grant_pg_cron_access() RETURNS event_trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
BEGIN
  IF EXISTS (
    SELECT
    FROM pg_event_trigger_ddl_commands() AS ev
    JOIN pg_extension AS ext
    ON ev.objid = ext.oid
    WHERE ext.extname = 'pg_cron'
  )
  THEN
    grant usage on schema cron to postgres with grant option;

    alter default privileges in schema cron grant all on tables to postgres with grant option;
    alter default privileges in schema cron grant all on functions to postgres with grant option;
    alter default privileges in schema cron grant all on sequences to postgres with grant option;

    alter default privileges for user supabase_admin in schema cron grant all
        on sequences to postgres with grant option;
    alter default privileges for user supabase_admin in schema cron grant all
        on tables to postgres with grant option;
    alter default privileges for user supabase_admin in schema cron grant all
        on functions to postgres with grant option;

    grant all privileges on all tables in schema cron to postgres with grant option;
    revoke all on table cron.job from postgres;
    grant select on table cron.job to postgres with grant option;
    revoke trigger on cron.job_run_details from postgres;
  END IF;
END;
$$;


--
-- Name: FUNCTION grant_pg_cron_access(); Type: COMMENT; Schema: extensions; Owner: -
--

COMMENT ON FUNCTION extensions.grant_pg_cron_access() IS 'Grants access to pg_cron';


--
-- Name: grant_pg_graphql_access(); Type: FUNCTION; Schema: extensions; Owner: -
--

CREATE FUNCTION extensions.grant_pg_graphql_access() RETURNS event_trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $_$
begin
    if not exists (
        select 1
        from pg_catalog.pg_event_trigger_ddl_commands() ev
        join pg_catalog.pg_extension e on ev.objid = e.oid
        where e.extname = 'pg_graphql'
    ) then
        return;
    end if;

    drop function if exists graphql_public.graphql;
    create or replace function graphql_public.graphql(
        "operationName" text default null,
        query text default null,
        variables jsonb default null,
        extensions jsonb default null
    )
        returns jsonb
        language sql
    as $$
        select graphql.resolve(
            query := query,
            variables := coalesce(variables, '{}'),
            "operationName" := "operationName",
            extensions := extensions
        );
    $$;

    -- Attach the wrapper to the extension so DROP EXTENSION cascades to it,
    -- which in turn triggers set_graphql_placeholder to reinstall the "not enabled" stub.
    alter extension pg_graphql add function graphql_public.graphql(text, text, jsonb, jsonb);

    grant usage on schema graphql to postgres, anon, authenticated, service_role;
    grant execute on function graphql.resolve to postgres, anon, authenticated, service_role;
    grant usage on schema graphql to postgres with grant option;
    grant usage on schema graphql_public to postgres with grant option;
end;
$_$;


--
-- Name: FUNCTION grant_pg_graphql_access(); Type: COMMENT; Schema: extensions; Owner: -
--

COMMENT ON FUNCTION extensions.grant_pg_graphql_access() IS 'Grants access to pg_graphql';


--
-- Name: grant_pg_net_access(); Type: FUNCTION; Schema: extensions; Owner: -
--

CREATE FUNCTION extensions.grant_pg_net_access() RETURNS event_trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_event_trigger_ddl_commands() AS ev
    JOIN pg_extension AS ext
    ON ev.objid = ext.oid
    WHERE ext.extname = 'pg_net'
  )
  THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_roles
      WHERE rolname = 'supabase_functions_admin'
    )
    THEN
      CREATE USER supabase_functions_admin NOINHERIT CREATEROLE LOGIN NOREPLICATION;
    END IF;

    GRANT USAGE ON SCHEMA net TO supabase_functions_admin, postgres, anon, authenticated, service_role;

    IF EXISTS (
      SELECT FROM pg_extension
      WHERE extname = 'pg_net'
      -- all versions in use on existing projects as of 2025-02-20
      -- version 0.12.0 onwards don't need these applied
      AND extversion IN ('0.2', '0.6', '0.7', '0.7.1', '0.8.0', '0.10.0', '0.11.0')
    ) THEN
      ALTER function net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) SECURITY DEFINER;
      ALTER function net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) SECURITY DEFINER;

      ALTER function net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) SET search_path = net;
      ALTER function net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) SET search_path = net;

      REVOKE ALL ON FUNCTION net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) FROM PUBLIC;
      REVOKE ALL ON FUNCTION net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) FROM PUBLIC;

      GRANT EXECUTE ON FUNCTION net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) TO supabase_functions_admin, postgres, anon, authenticated, service_role;
      GRANT EXECUTE ON FUNCTION net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) TO supabase_functions_admin, postgres, anon, authenticated, service_role;
    END IF;
  END IF;
END;
$$;


--
-- Name: FUNCTION grant_pg_net_access(); Type: COMMENT; Schema: extensions; Owner: -
--

COMMENT ON FUNCTION extensions.grant_pg_net_access() IS 'Grants access to pg_net';


--
-- Name: pgrst_ddl_watch(); Type: FUNCTION; Schema: extensions; Owner: -
--

CREATE FUNCTION extensions.pgrst_ddl_watch() RETURNS event_trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN SELECT * FROM pg_event_trigger_ddl_commands()
  LOOP
    IF cmd.command_tag IN (
      'CREATE SCHEMA', 'ALTER SCHEMA'
    , 'CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO', 'ALTER TABLE'
    , 'CREATE FOREIGN TABLE', 'ALTER FOREIGN TABLE'
    , 'CREATE VIEW', 'ALTER VIEW'
    , 'CREATE MATERIALIZED VIEW', 'ALTER MATERIALIZED VIEW'
    , 'CREATE FUNCTION', 'ALTER FUNCTION'
    , 'CREATE TRIGGER'
    , 'CREATE TYPE', 'ALTER TYPE'
    , 'CREATE RULE'
    , 'COMMENT'
    )
    -- don't notify in case of CREATE TEMP table or other objects created on pg_temp
    AND cmd.schema_name is distinct from 'pg_temp'
    THEN
      NOTIFY pgrst, 'reload schema';
    END IF;
  END LOOP;
END; $$;


--
-- Name: pgrst_drop_watch(); Type: FUNCTION; Schema: extensions; Owner: -
--

CREATE FUNCTION extensions.pgrst_drop_watch() RETURNS event_trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE
  obj record;
BEGIN
  FOR obj IN SELECT * FROM pg_event_trigger_dropped_objects()
  LOOP
    IF obj.object_type IN (
      'schema'
    , 'table'
    , 'foreign table'
    , 'view'
    , 'materialized view'
    , 'function'
    , 'trigger'
    , 'type'
    , 'rule'
    )
    AND obj.is_temporary IS false -- no pg_temp objects
    THEN
      NOTIFY pgrst, 'reload schema';
    END IF;
  END LOOP;
END; $$;


--
-- Name: set_graphql_placeholder(); Type: FUNCTION; Schema: extensions; Owner: -
--

CREATE FUNCTION extensions.set_graphql_placeholder() RETURNS event_trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $_$
    DECLARE
    graphql_is_dropped bool;
    BEGIN
    graphql_is_dropped = (
        SELECT ev.schema_name = 'graphql_public'
        FROM pg_event_trigger_dropped_objects() AS ev
        WHERE ev.schema_name = 'graphql_public'
    );

    IF graphql_is_dropped
    THEN
        create or replace function graphql_public.graphql(
            "operationName" text default null,
            query text default null,
            variables jsonb default null,
            extensions jsonb default null
        )
            returns jsonb
            language plpgsql
            set search_path to ''
        as $$
            DECLARE
                server_version float;
            BEGIN
                server_version = (SELECT (SPLIT_PART((select version()), ' ', 2))::float);

                IF server_version >= 14 THEN
                    RETURN jsonb_build_object(
                        'errors', jsonb_build_array(
                            jsonb_build_object(
                                'message', 'pg_graphql extension is not enabled.'
                            )
                        )
                    );
                ELSE
                    RETURN jsonb_build_object(
                        'errors', jsonb_build_array(
                            jsonb_build_object(
                                'message', 'pg_graphql is only available on projects running Postgres 14 onwards.'
                            )
                        )
                    );
                END IF;
            END;
        $$;
    END IF;

    END;
$_$;


--
-- Name: FUNCTION set_graphql_placeholder(); Type: COMMENT; Schema: extensions; Owner: -
--

COMMENT ON FUNCTION extensions.set_graphql_placeholder() IS 'Reintroduces placeholder function for graphql_public.graphql';


--
-- Name: attach_journal_to_financial_document(uuid, uuid); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.attach_journal_to_financial_document(p_document_id uuid, p_journal_entry_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_doc public.financial_documents%rowtype;
  v_entry public.journal_entries%rowtype;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  select * into v_doc
  from public.financial_documents
  where id = p_document_id
  for update;
  if not found or v_doc.status <> 'approved' then
    raise exception 'Only approved financial documents can be linked to a journal';
  end if;

  if not private.has_permission('manage_finances', v_doc.branch_id) then
    raise exception 'Insufficient permission to link a journal';
  end if;

  select * into v_entry
  from public.journal_entries
  where id = p_journal_entry_id
  for update;
  if not found or v_entry.status <> 'draft' then
    raise exception 'Journal entry must exist and remain draft';
  end if;

  if v_doc.journal_entry_id is not null then
    raise exception 'Financial document is already linked to a journal';
  end if;

  if v_entry.currency_code <> v_doc.currency_code
     or v_entry.base_currency_code <> v_doc.base_currency_code
     or v_entry.exchange_rate_to_base <> v_doc.exchange_rate_to_base
     or v_entry.branch_id is distinct from v_doc.branch_id then
    raise exception 'Journal and financial document currency, rate or branch do not match';
  end if;

  update public.journal_entries
  set source_type = 'financial_document',
      source_id = p_document_id
  where id = p_journal_entry_id;

  update public.financial_documents
  set journal_entry_id = p_journal_entry_id
  where id = p_document_id;
end;
$$;


--
-- Name: can_access_branch(uuid); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.can_access_branch(p_branch_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select p_branch_id is not null and exists (
    select 1
    from public.profile_role_assignments a
    join public.church_branches b on b.id = p_branch_id
    where a.profile_id = private.current_profile_id()
      and a.is_active
      and (a.expires_at is null or a.expires_at > now())
      and (
        a.scope_type = 'church'
        or (a.scope_type = 'branch' and a.branch_id = p_branch_id)
        or (a.scope_type = 'district' and b.district_id = a.district_id)
      )
  )
$$;


--
-- Name: current_profile_id(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.current_profile_id() RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select p.id
  from public.profiles p
  where p.auth_user_id = (select auth.uid())
  limit 1
$$;


--
-- Name: has_permission(text, uuid); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.has_permission(p_permission_key text, p_branch_id uuid DEFAULT NULL::uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select exists (
    select 1
    from public.profile_role_assignments a
    join public.roles r on r.id = a.role_id and r.is_active
    join public.role_permissions rp on rp.role_id = r.id
    join public.permissions p on p.id = rp.permission_id
    left join public.church_branches b on b.id = p_branch_id
    where a.profile_id = private.current_profile_id()
      and a.is_active
      and (a.expires_at is null or a.expires_at > now())
      and p.key = p_permission_key
      and (
        a.scope_type = 'church'
        or (p_branch_id is not null and a.scope_type = 'branch'
            and a.branch_id = p_branch_id)
        or (p_branch_id is not null and a.scope_type = 'district'
            and b.district_id = a.district_id)
      )
  )
$$;


--
-- Name: normalize_profile_portal_state(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.normalize_profile_portal_state() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
begin
  if new.auth_user_id is null
     and old.auth_user_id is not null
     and new.portal_access_status = 'active' then
    new.portal_access_status := 'suspended';
  end if;
  return new;
end;
$$;


--
-- Name: post_journal_entry(uuid); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.post_journal_entry(p_entry_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_entry public.journal_entries%rowtype;
  v_period public.financial_periods%rowtype;
  v_year public.financial_years%rowtype;
  v_base_currency char(3);
  v_line_count integer;
  v_debits numeric(24,4);
  v_credits numeric(24,4);
  v_base_debits numeric(24,4);
  v_base_credits numeric(24,4);
  v_approval_status text;
  v_document_status text;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required'; end if;

  select * into v_entry from public.journal_entries
  where id = p_entry_id for update;
  if not found then raise exception 'Journal entry not found'; end if;
  if v_entry.status <> 'draft' then raise exception 'Only draft journal entries can be posted'; end if;
  if not private.has_permission('post_journals', v_entry.branch_id) then
    raise exception 'Insufficient permission to post journals';
  end if;

  if v_entry.source_type = 'financial_document' then
    select status into v_document_status
    from public.financial_documents
    where id = v_entry.source_id and journal_entry_id = v_entry.id;
    if v_document_status is distinct from 'approved' then
      raise exception 'Linked financial document must be approved before posting';
    end if;
  else
    if v_entry.approval_checked_at is null then
      raise exception 'Journal entry must complete the approval-policy check before posting';
    end if;
    if v_entry.approval_request_id is not null then
      select status into v_approval_status
      from public.approval_requests
      where id = v_entry.approval_request_id
        and transaction_type = 'journal_entry'
        and target_id = v_entry.id;
      if v_approval_status is distinct from 'approved' then
        raise exception 'Journal approval is incomplete';
      end if;
    elsif v_entry.approved_at is null then
      raise exception 'Journal has not been approved or explicitly exempted by policy';
    end if;
  end if;

  select * into v_period from public.financial_periods where id = v_entry.period_id;
  if not found or v_period.status <> 'open' then raise exception 'Journal entry period is not open'; end if;
  if v_entry.entry_date < v_period.start_date or v_entry.entry_date > v_period.end_date then
    raise exception 'Journal entry date is outside its financial period';
  end if;

  select * into v_year from public.financial_years where id = v_period.financial_year_id;
  if not found or v_year.status <> 'open' then raise exception 'Financial year is not open'; end if;

  select base_currency_code into v_base_currency
  from public.church_settings where id = 1;
  if v_base_currency is null then
    raise exception 'Complete church settings before posting financial entries';
  end if;
  if v_entry.base_currency_code <> v_base_currency then
    raise exception 'Journal base currency does not match church base currency';
  end if;
  if v_entry.currency_code = v_entry.base_currency_code and v_entry.exchange_rate_to_base <> 1 then
    raise exception 'Exchange rate must be 1 for the base currency';
  end if;

  if exists (
    select 1 from public.journal_lines jl
    join public.chart_of_accounts coa on coa.id = jl.account_id
    where jl.journal_entry_id = p_entry_id and not coa.is_active
  ) then
    raise exception 'Journal contains an inactive chart-of-accounts entry';
  end if;

  if v_entry.branch_id is not null and exists (
    select 1 from public.journal_lines jl
    where jl.journal_entry_id = p_entry_id
      and jl.branch_id is not null and jl.branch_id <> v_entry.branch_id
  ) then
    raise exception 'Journal line branch does not match journal branch';
  end if;

  select count(*),
         coalesce(sum(debit_amount),0),
         coalesce(sum(credit_amount),0),
         coalesce(sum(base_debit_amount),0),
         coalesce(sum(base_credit_amount),0)
  into v_line_count, v_debits, v_credits, v_base_debits, v_base_credits
  from public.journal_lines where journal_entry_id = p_entry_id;

  if v_line_count < 2 then raise exception 'A journal entry must contain at least two lines'; end if;
  if v_debits <> v_credits then raise exception 'Journal is not balanced in transaction currency'; end if;
  if v_base_debits <> v_base_credits then raise exception 'Journal is not balanced in base currency'; end if;

  if exists (
    select 1 from public.journal_lines jl
    where jl.journal_entry_id = p_entry_id
      and (
        (jl.debit_amount > 0 and jl.base_debit_amount <>
          round(jl.debit_amount * v_entry.exchange_rate_to_base, 4))
        or
        (jl.credit_amount > 0 and jl.base_credit_amount <>
          round(jl.credit_amount * v_entry.exchange_rate_to_base, 4))
      )
  ) then
    raise exception 'Journal line base amount does not match the recorded exchange rate';
  end if;

  update public.journal_entries set status='posted', posted_at=now()
  where id=p_entry_id;

  if v_entry.source_type = 'financial_document' then
    update public.financial_documents
    set status='posted', updated_at=now()
    where id=v_entry.source_id
      and journal_entry_id=p_entry_id
      and status='approved';
    if not found then raise exception 'Could not finalize linked financial document'; end if;
  end if;
end;
$$;


--
-- Name: prevent_audit_log_mutation(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.prevent_audit_log_mutation() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
begin
  raise exception 'Audit log records are append-only';
end;
$$;


--
-- Name: prevent_budget_line_mutation(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.prevent_budget_line_mutation() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
declare
  v_budget_id uuid;
  v_status text;
begin
  if tg_op = 'DELETE' then
    v_budget_id := old.budget_id;
  else
    v_budget_id := new.budget_id;
  end if;

  select status into v_status
  from public.budgets where id = v_budget_id;

  if v_status not in ('draft','rejected') then
    raise exception 'Budget lines can only be changed while the budget is draft or rejected';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;


--
-- Name: prevent_posted_journal_mutation(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.prevent_posted_journal_mutation() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
declare
  v_status text;
begin
  if tg_table_name = 'journal_entries' then
    if tg_op = 'DELETE' and old.status = 'posted' then
      raise exception 'Posted journal entries cannot be deleted';
    end if;
    if tg_op = 'UPDATE' and old.status = 'posted' then
      raise exception 'Posted journal entries are immutable';
    end if;
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'DELETE' then
    select status into v_status
    from public.journal_entries where id = old.journal_entry_id;
  else
    select status into v_status
    from public.journal_entries where id = new.journal_entry_id;
  end if;

  if v_status is distinct from 'draft' then
    raise exception 'Journal lines can only be changed while the entry is draft';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;


--
-- Name: record_approval_decision(uuid, text, text); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.record_approval_decision(p_request_step_id uuid, p_decision text, p_comments text DEFAULT NULL::text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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

  if not private.has_permission(v_step.required_permission_key, v_request.branch_id) then
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
$$;


--
-- Name: reverse_journal_entry(uuid, date, text); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.reverse_journal_entry(p_entry_id uuid, p_reversal_date date, p_description text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_original public.journal_entries%rowtype;
  v_period_id uuid;
  v_reversal_id uuid;
  v_request_id uuid;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required'; end if;

  select * into v_original from public.journal_entries
  where id=p_entry_id for update;
  if not found or v_original.status <> 'posted' then
    raise exception 'Only posted journal entries can be reversed';
  end if;
  if not private.has_permission('post_journals', v_original.branch_id) then
    raise exception 'Insufficient permission to reverse this journal';
  end if;
  if exists (select 1 from public.journal_entries where reversal_of_entry_id=p_entry_id) then
    raise exception 'This journal entry has already been reversed';
  end if;

  select fp.id into v_period_id
  from public.financial_periods fp
  join public.financial_years fy on fy.id=fp.financial_year_id
  where fp.status='open' and fy.status='open'
    and p_reversal_date between fp.start_date and fp.end_date
  limit 1;
  if v_period_id is null then
    raise exception 'No open financial period exists for the reversal date';
  end if;

  insert into public.journal_entries (
    period_id,branch_id,entry_date,description,reference,
    currency_code,exchange_rate_to_base,base_currency_code,
    source_type,source_id,reversal_of_entry_id,created_by_profile_id
  )
  values (
    v_period_id,v_original.branch_id,p_reversal_date,
    coalesce(p_description,'Reversal of journal ' || v_original.entry_number),
    v_original.reference,v_original.currency_code,
    v_original.exchange_rate_to_base,v_original.base_currency_code,
    'reversal',v_original.id,v_original.id,private.current_profile_id()
  )
  returning id into v_reversal_id;

  insert into public.journal_lines (
    journal_entry_id,line_number,account_id,fund_id,branch_id,
    profile_id,description,debit_amount,credit_amount,
    base_debit_amount,base_credit_amount
  )
  select v_reversal_id,line_number,account_id,fund_id,branch_id,
    profile_id,description,credit_amount,debit_amount,
    base_credit_amount,base_debit_amount
  from public.journal_lines
  where journal_entry_id=p_entry_id
  order by line_number;

  v_request_id := private.submit_journal_entry_for_approval(v_reversal_id);
  if v_request_id is null then
    perform private.post_journal_entry(v_reversal_id);
  end if;
  return v_reversal_id;
end;
$$;


--
-- Name: submit_budget_for_approval(uuid); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.submit_budget_for_approval(p_budget_id uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_budget public.budgets%rowtype;
  v_profile_id uuid;
  v_base_currency char(3);
  v_policy public.approval_policies%rowtype;
  v_band public.approval_policy_bands%rowtype;
  v_request_id uuid;
  v_amount_base numeric(20,4);
  v_steps_count integer;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
  v_profile_id := private.current_profile_id();
  if v_profile_id is null then raise exception 'No member profile is linked to this account'; end if;

  select * into v_budget from public.budgets where id=p_budget_id for update;
  if not found then raise exception 'Budget not found'; end if;
  if v_budget.status not in ('draft','rejected') then
    raise exception 'Only draft or rejected budgets can be submitted';
  end if;
  if v_budget.submitted_by_profile_id is distinct from v_profile_id
     and not private.has_permission('manage_finances', v_budget.branch_id) then
    raise exception 'Insufficient permission to submit this budget';
  end if;

  select base_currency_code into v_base_currency
  from public.church_settings where id=1;
  if v_base_currency is null then raise exception 'Church settings must be configured before financial operations'; end if;
  if v_budget.base_currency_code <> v_base_currency then
    raise exception 'Budget base currency does not match church base currency';
  end if;
  if v_budget.currency_code = v_base_currency and v_budget.exchange_rate_to_base <> 1 then
    raise exception 'Exchange rate must be 1 for the base currency';
  end if;

  select round(coalesce(sum(bl.allocated_amount),0) * v_budget.exchange_rate_to_base,4)
  into v_amount_base
  from public.budget_lines bl where bl.budget_id=p_budget_id;
  if v_amount_base <= 0 then raise exception 'Budget must contain a positive total allocation'; end if;

  select * into v_policy
  from public.approval_policies p
  where p.transaction_type='budget' and p.is_active
    and p.effective_from <= current_date
    and (p.effective_to is null or p.effective_to >= current_date)
    and (p.branch_id = v_budget.branch_id or p.branch_id is null)
  order by (p.branch_id is not null) desc,p.version desc
  limit 1;
  if not found then raise exception 'No active budget approval policy is configured for this scope'; end if;

  select * into v_band from public.approval_policy_bands b
  where b.policy_id=v_policy.id
    and v_amount_base >= b.min_amount_base
    and (b.max_amount_base is null or v_amount_base < b.max_amount_base)
  limit 1;
  if not found then raise exception 'No approval threshold band covers this budget amount'; end if;

  select count(*) into v_steps_count from public.approval_policy_steps where band_id=v_band.id;
  if v_steps_count=0 then
    update public.budgets set status='approved',
      submitted_by_profile_id=v_profile_id,approved_at=now(),
      approved_by_profile_id=null,approval_request_id=null
    where id=p_budget_id;
    return null;
  end if;

  insert into public.approval_requests (
    transaction_type,target_id,branch_id,policy_id,policy_version,
    band_id,amount_base,submitted_by_profile_id,policy_snapshot
  )
  values (
    'budget',p_budget_id,v_budget.branch_id,v_policy.id,v_policy.version,
    v_band.id,v_amount_base,v_profile_id,
    jsonb_build_object(
      'policy_name',v_policy.name,
      'policy_version',v_policy.version,
      'min_amount_base',v_band.min_amount_base,
      'max_amount_base',v_band.max_amount_base,
      'steps',(
        select coalesce(jsonb_agg(jsonb_build_object(
          'step_number',s.step_number,
          'required_permission_key',s.required_permission_key,
          'required_approvals',s.required_approvals,
          'prohibit_submitter_approval',s.prohibit_submitter_approval
        ) order by s.step_number),'[]'::jsonb)
        from public.approval_policy_steps s where s.band_id=v_band.id
      )
    )
  )
  returning id into v_request_id;

  insert into public.approval_request_steps (
    approval_request_id,step_number,required_permission_key,
    required_approvals,prohibit_submitter_approval
  )
  select v_request_id,step_number,required_permission_key,
    required_approvals,prohibit_submitter_approval
  from public.approval_policy_steps where band_id=v_band.id
  order by step_number;

  update public.budgets set status='pending_approval',
    submitted_by_profile_id=v_profile_id,approval_request_id=v_request_id,
    approved_at=null,approved_by_profile_id=null
  where id=p_budget_id;
  return v_request_id;
end;
$$;


--
-- Name: submit_event_survey(uuid, jsonb); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.submit_event_survey(p_survey_id uuid, p_answers jsonb) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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


--
-- Name: submit_financial_document_for_approval(uuid); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.submit_financial_document_for_approval(p_document_id uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_doc public.financial_documents%rowtype;
  v_profile_id uuid;
  v_base_currency char(3);
  v_policy public.approval_policies%rowtype;
  v_band public.approval_policy_bands%rowtype;
  v_request_id uuid;
  v_amount_base numeric(20,4);
  v_steps_count integer;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;
  v_profile_id := private.current_profile_id();
  if v_profile_id is null then
    raise exception 'No member profile is linked to this account';
  end if;

  select * into v_doc
  from public.financial_documents
  where id = p_document_id
  for update;
  if not found then raise exception 'Financial document not found'; end if;
  if v_doc.status not in ('draft','rejected') then
    raise exception 'Only draft or rejected documents can be submitted';
  end if;
  if v_doc.journal_entry_id is not null then
    raise exception 'Document is already linked to a journal entry';
  end if;
  if v_doc.created_by_profile_id is distinct from v_profile_id
     and not private.has_permission('manage_finances', v_doc.branch_id) then
    raise exception 'Insufficient permission to submit this document';
  end if;

  select base_currency_code into v_base_currency
  from public.church_settings where id = 1;
  if v_base_currency is null then
    raise exception 'Church settings must be configured before financial operations';
  end if;
  if v_doc.base_currency_code <> v_base_currency then
    raise exception 'Document base currency does not match church base currency';
  end if;
  if v_doc.currency_code = v_base_currency and v_doc.exchange_rate_to_base <> 1 then
    raise exception 'Exchange rate must be 1 for the base currency';
  end if;

  if v_doc.financial_account_id is not null and not exists (
    select 1 from public.financial_accounts fa
    where fa.id = v_doc.financial_account_id
      and fa.is_active
      and fa.currency_code = v_doc.currency_code
      and (fa.branch_id is null or fa.branch_id is not distinct from v_doc.branch_id)
  ) then
    raise exception 'Financial account is inactive or incompatible with document branch/currency';
  end if;

  v_amount_base := round(v_doc.amount * v_doc.exchange_rate_to_base, 4);

  select * into v_policy
  from public.approval_policies p
  where p.transaction_type = 'financial_document'
    and p.is_active
    and p.effective_from <= current_date
    and (p.effective_to is null or p.effective_to >= current_date)
    and (p.branch_id = v_doc.branch_id or p.branch_id is null)
  order by (p.branch_id is not null) desc, p.version desc
  limit 1;
  if not found then
    raise exception 'No active financial-document approval policy is configured for this scope';
  end if;

  select * into v_band
  from public.approval_policy_bands b
  where b.policy_id = v_policy.id
    and v_amount_base >= b.min_amount_base
    and (b.max_amount_base is null or v_amount_base < b.max_amount_base)
  limit 1;
  if not found then
    raise exception 'No approval threshold band covers this transaction amount';
  end if;

  select count(*) into v_steps_count
  from public.approval_policy_steps
  where band_id = v_band.id;

  if v_steps_count = 0 then
    update public.financial_documents
    set status = 'approved',
        approved_at = now(),
        approved_by_profile_id = null,
        approval_request_id = null
    where id = p_document_id;
    return null;
  end if;

  insert into public.approval_requests (
    transaction_type, target_id, branch_id, policy_id, policy_version,
    band_id, amount_base, submitted_by_profile_id, policy_snapshot
  )
  values (
    'financial_document', p_document_id, v_doc.branch_id,
    v_policy.id, v_policy.version, v_band.id, v_amount_base,
    v_profile_id,
    jsonb_build_object(
      'policy_name', v_policy.name,
      'policy_version', v_policy.version,
      'min_amount_base', v_band.min_amount_base,
      'max_amount_base', v_band.max_amount_base,
      'steps', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'step_number', s.step_number,
          'required_permission_key', s.required_permission_key,
          'required_approvals', s.required_approvals,
          'prohibit_submitter_approval', s.prohibit_submitter_approval
        ) order by s.step_number), '[]'::jsonb)
        from public.approval_policy_steps s where s.band_id = v_band.id
      )
    )
  )
  returning id into v_request_id;

  insert into public.approval_request_steps (
    approval_request_id, step_number, required_permission_key,
    required_approvals, prohibit_submitter_approval
  )
  select v_request_id, step_number, required_permission_key,
    required_approvals, prohibit_submitter_approval
  from public.approval_policy_steps
  where band_id = v_band.id
  order by step_number;

  update public.financial_documents
  set status = 'pending_approval',
      approval_request_id = v_request_id,
      approved_at = null,
      approved_by_profile_id = null
  where id = p_document_id;

  return v_request_id;
end;
$$;


--
-- Name: submit_journal_entry_for_approval(uuid); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.submit_journal_entry_for_approval(p_entry_id uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_entry public.journal_entries%rowtype;
  v_profile_id uuid;
  v_policy public.approval_policies%rowtype;
  v_band public.approval_policy_bands%rowtype;
  v_request_id uuid;
  v_amount_base numeric(20,4);
  v_debits numeric(24,4);
  v_credits numeric(24,4);
  v_base_debits numeric(24,4);
  v_base_credits numeric(24,4);
  v_line_count integer;
  v_steps_count integer;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;
  v_profile_id := private.current_profile_id();
  if v_profile_id is null then
    raise exception 'No member profile is linked to this account';
  end if;

  select * into v_entry
  from public.journal_entries where id = p_entry_id for update;
  if not found or v_entry.status <> 'draft' then
    raise exception 'Only draft journal entries can be submitted';
  end if;
  if v_entry.source_type = 'financial_document' then
    raise exception 'Financial-document journals use the document approval workflow';
  end if;
  if not private.has_permission('manage_finances', v_entry.branch_id) then
    raise exception 'Insufficient permission to submit this journal';
  end if;

  select count(*),
         coalesce(sum(debit_amount),0),
         coalesce(sum(credit_amount),0),
         coalesce(sum(base_debit_amount),0),
         coalesce(sum(base_credit_amount),0)
  into v_line_count, v_debits, v_credits, v_base_debits, v_base_credits
  from public.journal_lines where journal_entry_id = p_entry_id;

  if v_line_count < 2 or v_debits <> v_credits or v_base_debits <> v_base_credits then
    raise exception 'Journal must contain at least two balanced lines before approval';
  end if;

  v_amount_base := v_base_debits;

  select * into v_policy
  from public.approval_policies p
  where p.transaction_type = 'journal_entry'
    and p.is_active
    and p.effective_from <= current_date
    and (p.effective_to is null or p.effective_to >= current_date)
    and (p.branch_id = v_entry.branch_id or p.branch_id is null)
  order by (p.branch_id is not null) desc, p.version desc
  limit 1;
  if not found then
    raise exception 'No active journal-entry approval policy is configured for this scope';
  end if;

  select * into v_band
  from public.approval_policy_bands b
  where b.policy_id = v_policy.id
    and v_amount_base >= b.min_amount_base
    and (b.max_amount_base is null or v_amount_base < b.max_amount_base)
  limit 1;
  if not found then
    raise exception 'No approval threshold band covers this journal amount';
  end if;

  select count(*) into v_steps_count
  from public.approval_policy_steps where band_id = v_band.id;

  if v_steps_count = 0 then
    update public.journal_entries
    set approval_checked_at = now(),
        approved_at = now(),
        approved_by_profile_id = null,
        approval_request_id = null
    where id = p_entry_id;
    return null;
  end if;

  insert into public.approval_requests (
    transaction_type, target_id, branch_id, policy_id, policy_version,
    band_id, amount_base, submitted_by_profile_id, policy_snapshot
  )
  values (
    'journal_entry', p_entry_id, v_entry.branch_id,
    v_policy.id, v_policy.version, v_band.id, v_amount_base,
    v_profile_id,
    jsonb_build_object(
      'policy_name', v_policy.name,
      'policy_version', v_policy.version,
      'min_amount_base', v_band.min_amount_base,
      'max_amount_base', v_band.max_amount_base,
      'steps', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'step_number', s.step_number,
          'required_permission_key', s.required_permission_key,
          'required_approvals', s.required_approvals,
          'prohibit_submitter_approval', s.prohibit_submitter_approval
        ) order by s.step_number), '[]'::jsonb)
        from public.approval_policy_steps s where s.band_id = v_band.id
      )
    )
  )
  returning id into v_request_id;

  insert into public.approval_request_steps (
    approval_request_id, step_number, required_permission_key,
    required_approvals, prohibit_submitter_approval
  )
  select v_request_id, step_number, required_permission_key,
    required_approvals, prohibit_submitter_approval
  from public.approval_policy_steps
  where band_id = v_band.id
  order by step_number;

  update public.journal_entries
  set approval_request_id = v_request_id,
      approval_checked_at = now(),
      approved_at = null,
      approved_by_profile_id = null
  where id = p_entry_id;

  return v_request_id;
end;
$$;


--
-- Name: validate_financial_document_journal_link(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.validate_financial_document_journal_link() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
declare
  v_entry public.journal_entries%rowtype;
begin
  if tg_op = 'DELETE' then
    if old.status = 'posted' then
      raise exception 'Posted financial documents cannot be deleted';
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' and old.status = 'posted' then
    raise exception 'Posted financial documents are immutable';
  end if;

  if new.status = 'posted' then
    if new.journal_entry_id is null then
      raise exception 'Posted financial document must have a journal entry';
    end if;
    select * into v_entry from public.journal_entries
    where id = new.journal_entry_id;
    if not found or v_entry.status <> 'posted' then
      raise exception 'Financial document can only be posted with a posted journal';
    end if;
    if v_entry.source_type <> 'financial_document'
       or v_entry.source_id is distinct from new.id then
      raise exception 'Journal entry source does not match financial document';
    end if;
  end if;

  if new.journal_entry_id is not null then
    select * into v_entry from public.journal_entries
    where id = new.journal_entry_id;
    if not found
       or v_entry.source_type <> 'financial_document'
       or v_entry.source_id is distinct from new.id then
      raise exception 'Journal entry is not linked to this financial document';
    end if;
  end if;

  return new;
end;
$$;


--
-- Name: validate_financial_period(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.validate_financial_period() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
declare
  v_year public.financial_years%rowtype;
begin
  select * into v_year
  from public.financial_years
  where id = new.financial_year_id;

  if not found then
    raise exception 'Financial year does not exist';
  end if;

  if new.start_date < v_year.start_date or new.end_date > v_year.end_date then
    raise exception 'Financial period must be within its financial year';
  end if;

  return new;
end;
$$;


--
-- Name: validate_welfare_financial_links(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.validate_welfare_financial_links() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
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


--
-- Name: rls_auto_enable(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rls_auto_enable() RETURNS event_trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
  tbl name;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        SELECT c.relname INTO tbl FROM pg_catalog.pg_class c WHERE c.oid = cmd.objid;
        EXECUTE format('alter table if exists %I.%I enable row level security', cmd.schema_name, tbl);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: payment_gateway_payloads; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.payment_gateway_payloads (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    transaction_id uuid NOT NULL,
    provider_payload jsonb NOT NULL,
    received_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: stream_credentials; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.stream_credentials (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    stream_id uuid NOT NULL,
    provider text NOT NULL,
    secret_reference text NOT NULL,
    public_metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    created_by_profile_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    revoked_at timestamp with time zone,
    CONSTRAINT stream_credentials_status_check CHECK ((status = ANY (ARRAY['active'::text, 'revoked'::text])))
);


--
-- Name: approval_decisions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.approval_decisions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    approval_request_step_id uuid NOT NULL,
    approver_profile_id uuid NOT NULL,
    decision text NOT NULL,
    comments text,
    decided_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT approval_decisions_decision_check CHECK ((decision = ANY (ARRAY['approved'::text, 'rejected'::text])))
);


--
-- Name: approval_policies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.approval_policies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    transaction_type text NOT NULL,
    branch_id uuid,
    version integer NOT NULL,
    effective_from date NOT NULL,
    effective_to date,
    is_active boolean DEFAULT true NOT NULL,
    created_by_profile_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT approval_policies_transaction_type_check CHECK ((transaction_type = ANY (ARRAY['financial_document'::text, 'journal_entry'::text, 'budget'::text, 'requisition'::text]))),
    CONSTRAINT approval_policies_version_check CHECK ((version > 0)),
    CONSTRAINT approval_policy_effective_dates CHECK (((effective_to IS NULL) OR (effective_to >= effective_from))),
    CONSTRAINT approval_policy_name_nonblank CHECK ((length(TRIM(BOTH FROM name)) > 0))
);


--
-- Name: approval_policy_bands; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.approval_policy_bands (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    policy_id uuid NOT NULL,
    min_amount_base numeric(20,4) DEFAULT 0 NOT NULL,
    max_amount_base numeric(20,4),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT approval_band_range CHECK (((max_amount_base IS NULL) OR (max_amount_base > min_amount_base))),
    CONSTRAINT approval_policy_bands_min_amount_base_check CHECK ((min_amount_base >= (0)::numeric))
);


--
-- Name: approval_policy_steps; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.approval_policy_steps (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    band_id uuid NOT NULL,
    step_number integer NOT NULL,
    required_permission_key text NOT NULL,
    required_approvals integer DEFAULT 1 NOT NULL,
    prohibit_submitter_approval boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT approval_policy_steps_required_approvals_check CHECK ((required_approvals > 0)),
    CONSTRAINT approval_policy_steps_step_number_check CHECK ((step_number > 0))
);


--
-- Name: approval_request_steps; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.approval_request_steps (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    approval_request_id uuid NOT NULL,
    step_number integer NOT NULL,
    required_permission_key text NOT NULL,
    required_approvals integer NOT NULL,
    prohibit_submitter_approval boolean DEFAULT true NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT approval_request_steps_required_approvals_check CHECK ((required_approvals > 0)),
    CONSTRAINT approval_request_steps_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text]))),
    CONSTRAINT approval_request_steps_step_number_check CHECK ((step_number > 0))
);


--
-- Name: approval_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.approval_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    transaction_type text NOT NULL,
    target_id uuid NOT NULL,
    branch_id uuid,
    policy_id uuid,
    policy_version integer,
    band_id uuid,
    amount_base numeric(20,4) NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    submitted_by_profile_id uuid NOT NULL,
    submitted_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    policy_snapshot jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT approval_request_completion CHECK ((((status = ANY (ARRAY['approved'::text, 'rejected'::text, 'cancelled'::text])) AND (completed_at IS NOT NULL)) OR (status = 'pending'::text))),
    CONSTRAINT approval_requests_amount_base_check CHECK ((amount_base >= (0)::numeric)),
    CONSTRAINT approval_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'cancelled'::text]))),
    CONSTRAINT approval_requests_transaction_type_check CHECK ((transaction_type = ANY (ARRAY['financial_document'::text, 'journal_entry'::text, 'budget'::text, 'requisition'::text])))
);


--
-- Name: attendance_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.attendance_records (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_id uuid NOT NULL,
    member_id uuid NOT NULL,
    attendance_status text NOT NULL,
    check_in_time timestamp with time zone,
    recorded_by_profile_id uuid,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT attendance_records_attendance_status_check CHECK ((attendance_status = ANY (ARRAY['present'::text, 'absent'::text, 'late'::text, 'excused'::text])))
);


--
-- Name: attendance_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.attendance_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    branch_id uuid NOT NULL,
    event_id uuid,
    title text NOT NULL,
    session_date date DEFAULT CURRENT_DATE NOT NULL,
    session_type text DEFAULT 'service'::text NOT NULL,
    created_by_profile_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    actor_profile_id uuid,
    action text NOT NULL,
    entity_type text NOT NULL,
    entity_id uuid,
    branch_id uuid,
    details jsonb DEFAULT '{}'::jsonb NOT NULL,
    ip_address inet,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT audit_action_nonblank CHECK ((length(TRIM(BOTH FROM action)) > 0)),
    CONSTRAINT audit_entity_type_nonblank CHECK ((length(TRIM(BOTH FROM entity_type)) > 0))
);


--
-- Name: budget_lines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.budget_lines (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    budget_id uuid NOT NULL,
    account_id uuid,
    fund_id uuid,
    description text,
    allocated_amount numeric(20,4) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT budget_lines_allocated_amount_check CHECK ((allocated_amount >= (0)::numeric))
);


--
-- Name: budgets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.budgets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    budget_type text NOT NULL,
    branch_id uuid,
    event_id uuid,
    period_id uuid NOT NULL,
    currency_code character(3) NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    submitted_by_profile_id uuid,
    approved_by_profile_id uuid,
    approved_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    exchange_rate_to_base numeric(20,8) DEFAULT 1 NOT NULL,
    base_currency_code character(3) DEFAULT 'SLE'::bpchar NOT NULL,
    approval_request_id uuid,
    CONSTRAINT budget_approval_consistency CHECK ((((status = 'approved'::text) AND (approved_at IS NOT NULL)) OR (status <> 'approved'::text))),
    CONSTRAINT budget_base_rate CHECK (((currency_code <> base_currency_code) OR (exchange_rate_to_base = (1)::numeric))),
    CONSTRAINT budget_name_nonblank CHECK ((length(TRIM(BOTH FROM name)) > 0)),
    CONSTRAINT budgets_budget_type_check CHECK ((budget_type = ANY (ARRAY['annual'::text, 'monthly'::text, 'department'::text, 'event'::text, 'other'::text]))),
    CONSTRAINT budgets_exchange_rate_to_base_check CHECK ((exchange_rate_to_base > (0)::numeric)),
    CONSTRAINT budgets_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'pending_approval'::text, 'approved'::text, 'rejected'::text, 'closed'::text])))
);


--
-- Name: cell_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cell_members (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cell_id uuid NOT NULL,
    member_id uuid NOT NULL,
    branch_id uuid NOT NULL,
    role text DEFAULT 'member'::text NOT NULL,
    joined_at date DEFAULT CURRENT_DATE NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT cell_members_role_check CHECK ((role = ANY (ARRAY['member'::text, 'leader'::text, 'assistant_leader'::text]))),
    CONSTRAINT cell_members_status_check CHECK ((status = ANY (ARRAY['active'::text, 'inactive'::text, 'transferred'::text])))
);


--
-- Name: cells; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cells (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    branch_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    location text,
    meeting_day text,
    leader_id uuid,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT cells_status_check CHECK ((status = ANY (ARRAY['active'::text, 'inactive'::text, 'archived'::text])))
);


--
-- Name: chart_of_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chart_of_accounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    parent_account_id uuid,
    code text NOT NULL,
    name text NOT NULL,
    account_type text NOT NULL,
    normal_balance text NOT NULL,
    description text,
    is_control_account boolean DEFAULT false NOT NULL,
    is_system boolean DEFAULT false NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chart_account_code_nonblank CHECK ((length(TRIM(BOTH FROM code)) > 0)),
    CONSTRAINT chart_account_name_nonblank CHECK ((length(TRIM(BOTH FROM name)) > 0)),
    CONSTRAINT chart_of_accounts_account_type_check CHECK ((account_type = ANY (ARRAY['asset'::text, 'liability'::text, 'equity'::text, 'income'::text, 'expense'::text]))),
    CONSTRAINT chart_of_accounts_normal_balance_check CHECK ((normal_balance = ANY (ARRAY['debit'::text, 'credit'::text])))
);


--
-- Name: church_branches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.church_branches (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    district_id uuid,
    name text NOT NULL,
    code text NOT NULL,
    address text,
    city text,
    state_or_region text,
    country text DEFAULT 'Sierra Leone'::text NOT NULL,
    phone text,
    email text,
    latitude numeric(9,6),
    longitude numeric(9,6),
    is_main_branch boolean DEFAULT false NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT church_branches_code_nonblank CHECK ((length(TRIM(BOTH FROM code)) > 0)),
    CONSTRAINT church_branches_latitude_range CHECK (((latitude IS NULL) OR ((latitude >= ('-90'::integer)::numeric) AND (latitude <= (90)::numeric)))),
    CONSTRAINT church_branches_longitude_range CHECK (((longitude IS NULL) OR ((longitude >= ('-180'::integer)::numeric) AND (longitude <= (180)::numeric)))),
    CONSTRAINT church_branches_status_check CHECK ((status = ANY (ARRAY['active'::text, 'inactive'::text, 'archived'::text])))
);


--
-- Name: church_resources; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.church_resources (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    branch_id uuid,
    title text NOT NULL,
    description text,
    category text,
    resource_type text NOT NULL,
    resource_url text NOT NULL,
    visibility text DEFAULT 'members_only'::text NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    created_by_profile_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT church_resources_resource_type_check CHECK ((resource_type = ANY (ARRAY['document'::text, 'video'::text, 'audio'::text, 'image'::text, 'link'::text]))),
    CONSTRAINT church_resources_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text, 'archived'::text]))),
    CONSTRAINT church_resources_visibility_check CHECK ((visibility = ANY (ARRAY['public'::text, 'members_only'::text, 'staff_only'::text])))
);


--
-- Name: church_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.church_settings (
    id smallint DEFAULT 1 NOT NULL,
    church_name text NOT NULL,
    subtitle text,
    senior_pastor_name text,
    email text,
    phone text,
    address text,
    city text,
    country text DEFAULT 'Sierra Leone'::text NOT NULL,
    logo_url text,
    website_url text,
    mission text,
    primary_color text,
    secondary_color text,
    service_times jsonb DEFAULT '[]'::jsonb NOT NULL,
    base_currency_code character(3) DEFAULT 'SLE'::bpchar NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT church_settings_id_check CHECK ((id = 1))
);


--
-- Name: currencies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.currencies (
    code character(3) NOT NULL,
    name text NOT NULL,
    symbol text,
    minor_units smallint DEFAULT 2 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT currencies_code_uppercase CHECK (((code)::text = upper((code)::text))),
    CONSTRAINT currencies_minor_units_check CHECK (((minor_units >= 0) AND (minor_units <= 4)))
);


--
-- Name: districts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.districts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    region text,
    country text,
    description text,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT districts_status_check CHECK ((status = ANY (ARRAY['active'::text, 'inactive'::text, 'archived'::text])))
);


--
-- Name: event_registrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.event_registrations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid NOT NULL,
    member_id uuid,
    member_name text,
    email text,
    phone text,
    registered_at timestamp with time zone DEFAULT now() NOT NULL,
    registered_by_profile_id uuid,
    checked_in_at timestamp with time zone,
    status text DEFAULT 'confirmed'::text NOT NULL,
    CONSTRAINT event_registration_identity CHECK (((member_id IS NOT NULL) OR ((member_name IS NOT NULL) AND (length(TRIM(BOTH FROM member_name)) > 0)))),
    CONSTRAINT event_registrations_status_check CHECK ((status = ANY (ARRAY['confirmed'::text, 'cancelled'::text, 'waitlist'::text, 'checked_in'::text, 'absent'::text, 'attended'::text])))
);


--
-- Name: event_survey_answers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.event_survey_answers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    response_id uuid NOT NULL,
    question_id uuid NOT NULL,
    survey_id uuid NOT NULL,
    answer_value jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: event_survey_questions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.event_survey_questions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    survey_id uuid NOT NULL,
    question_text text NOT NULL,
    question_type text NOT NULL,
    is_required boolean DEFAULT false NOT NULL,
    options jsonb DEFAULT '[]'::jsonb NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT event_survey_questions_question_type_check CHECK ((question_type = ANY (ARRAY['short_text'::text, 'long_text'::text, 'single_choice'::text, 'multiple_choice'::text, 'checkbox'::text, 'number'::text, 'date'::text, 'rating'::text])))
);


--
-- Name: event_survey_responses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.event_survey_responses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    survey_id uuid NOT NULL,
    member_id uuid NOT NULL,
    submitted_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: event_surveys; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.event_surveys (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid NOT NULL,
    title text NOT NULL,
    description text,
    respondent_scope text DEFAULT 'all_members'::text NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    opens_at timestamp with time zone,
    closes_at timestamp with time zone,
    created_by_profile_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT event_surveys_respondent_scope_check CHECK ((respondent_scope = ANY (ARRAY['all_members'::text, 'registrants'::text, 'attendees'::text]))),
    CONSTRAINT event_surveys_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'active'::text, 'closed'::text, 'archived'::text]))),
    CONSTRAINT event_surveys_window CHECK (((opens_at IS NULL) OR (closes_at IS NULL) OR (closes_at > opens_at)))
);


--
-- Name: events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    branch_id uuid,
    title text NOT NULL,
    description text,
    category text,
    start_time timestamp with time zone NOT NULL,
    end_time timestamp with time zone NOT NULL,
    location text,
    is_virtual boolean DEFAULT false NOT NULL,
    virtual_link text,
    featured_image text,
    organizer_name text,
    target_audience text,
    registration_required boolean DEFAULT false NOT NULL,
    max_attendees integer,
    status text DEFAULT 'upcoming'::text NOT NULL,
    created_by_profile_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT events_positive_capacity CHECK (((max_attendees IS NULL) OR (max_attendees > 0))),
    CONSTRAINT events_status_check CHECK ((status = ANY (ARRAY['upcoming'::text, 'ongoing'::text, 'completed'::text, 'cancelled'::text]))),
    CONSTRAINT events_time_order CHECK ((end_time > start_time))
);


--
-- Name: financial_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.financial_accounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    chart_account_id uuid NOT NULL,
    branch_id uuid,
    name text NOT NULL,
    account_type text NOT NULL,
    currency_code character(3) NOT NULL,
    provider_name text,
    account_reference text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT financial_account_name_nonblank CHECK ((length(TRIM(BOTH FROM name)) > 0)),
    CONSTRAINT financial_accounts_account_type_check CHECK ((account_type = ANY (ARRAY['cash'::text, 'bank'::text, 'mobile_money'::text, 'clearing'::text])))
);


--
-- Name: financial_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.financial_documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    document_number bigint NOT NULL,
    document_type text NOT NULL,
    transaction_date date NOT NULL,
    branch_id uuid,
    profile_id uuid,
    payee_or_payer_name text NOT NULL,
    amount numeric(20,4) NOT NULL,
    currency_code character(3) NOT NULL,
    payment_method text NOT NULL,
    financial_account_id uuid,
    external_reference text,
    description text,
    status text DEFAULT 'draft'::text NOT NULL,
    journal_entry_id uuid,
    approval_request_id uuid,
    created_by_profile_id uuid,
    approved_by_profile_id uuid,
    approved_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    exchange_rate_to_base numeric(20,8) DEFAULT 1 NOT NULL,
    base_currency_code character(3) DEFAULT 'SLE'::bpchar NOT NULL,
    CONSTRAINT financial_document_approval_consistency CHECK ((((status = 'approved'::text) AND (approved_at IS NOT NULL)) OR (status <> 'approved'::text))),
    CONSTRAINT financial_document_base_rate CHECK (((currency_code <> base_currency_code) OR (exchange_rate_to_base = (1)::numeric))),
    CONSTRAINT financial_document_party_nonblank CHECK ((length(TRIM(BOTH FROM payee_or_payer_name)) > 0)),
    CONSTRAINT financial_document_posted_has_journal CHECK (((status <> 'posted'::text) OR (journal_entry_id IS NOT NULL))),
    CONSTRAINT financial_documents_amount_check CHECK ((amount > (0)::numeric)),
    CONSTRAINT financial_documents_document_type_check CHECK ((document_type = ANY (ARRAY['receipt'::text, 'payment'::text, 'transfer'::text, 'adjustment'::text]))),
    CONSTRAINT financial_documents_exchange_rate_to_base_check CHECK ((exchange_rate_to_base > (0)::numeric)),
    CONSTRAINT financial_documents_payment_method_check CHECK ((payment_method = ANY (ARRAY['cash'::text, 'bank_transfer'::text, 'mobile_money'::text, 'card'::text, 'cheque'::text, 'other'::text]))),
    CONSTRAINT financial_documents_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'pending_approval'::text, 'approved'::text, 'rejected'::text, 'posted'::text, 'cancelled'::text])))
);


--
-- Name: financial_documents_document_number_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.financial_documents ALTER COLUMN document_number ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.financial_documents_document_number_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: financial_periods; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.financial_periods (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    financial_year_id uuid NOT NULL,
    name text NOT NULL,
    start_date date NOT NULL,
    end_date date NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    closed_by_profile_id uuid,
    closed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT financial_period_close_consistency CHECK ((((status = 'closed'::text) AND (closed_at IS NOT NULL)) OR (status = 'open'::text))),
    CONSTRAINT financial_period_date_order CHECK ((start_date <= end_date)),
    CONSTRAINT financial_periods_status_check CHECK ((status = ANY (ARRAY['open'::text, 'closed'::text])))
);


--
-- Name: financial_years; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.financial_years (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    year_number integer NOT NULL,
    start_date date NOT NULL,
    end_date date NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT financial_year_calendar_dates CHECK (((start_date = make_date(year_number, 1, 1)) AND (end_date = make_date(year_number, 12, 31)))),
    CONSTRAINT financial_years_status_check CHECK ((status = ANY (ARRAY['open'::text, 'closed'::text]))),
    CONSTRAINT financial_years_year_number_check CHECK (((year_number >= 1900) AND (year_number <= 9998)))
);


--
-- Name: funds; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.funds (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    code text NOT NULL,
    description text,
    fund_type text DEFAULT 'general'::text NOT NULL,
    is_default boolean DEFAULT false NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT funds_code_nonblank CHECK ((length(TRIM(BOTH FROM code)) > 0)),
    CONSTRAINT funds_fund_type_check CHECK ((fund_type = ANY (ARRAY['general'::text, 'designated'::text, 'restricted'::text]))),
    CONSTRAINT funds_name_nonblank CHECK ((length(TRIM(BOTH FROM name)) > 0))
);


--
-- Name: giving_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.giving_records (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    financial_document_id uuid NOT NULL,
    giver_profile_id uuid,
    giver_name text NOT NULL,
    giving_type text NOT NULL,
    fund_id uuid,
    campaign_or_appeal text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT giving_record_giver_name_nonblank CHECK ((length(TRIM(BOTH FROM giver_name)) > 0)),
    CONSTRAINT giving_records_giving_type_check CHECK ((giving_type = ANY (ARRAY['tithe'::text, 'offering'::text, 'donation'::text, 'pledge'::text, 'other'::text])))
);


--
-- Name: journal_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.journal_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    entry_number bigint NOT NULL,
    period_id uuid NOT NULL,
    branch_id uuid,
    entry_date date NOT NULL,
    description text NOT NULL,
    reference text,
    currency_code character(3) NOT NULL,
    exchange_rate_to_base numeric(20,8) DEFAULT 1 NOT NULL,
    base_currency_code character(3) NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    source_type text,
    source_id uuid,
    reversal_of_entry_id uuid,
    created_by_profile_id uuid,
    approved_by_profile_id uuid,
    approved_at timestamp with time zone,
    posted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    approval_request_id uuid,
    approval_checked_at timestamp with time zone,
    CONSTRAINT journal_entries_exchange_rate_to_base_check CHECK ((exchange_rate_to_base > (0)::numeric)),
    CONSTRAINT journal_entries_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'posted'::text]))),
    CONSTRAINT journal_entry_base_rate CHECK (((currency_code <> base_currency_code) OR (exchange_rate_to_base = (1)::numeric))),
    CONSTRAINT journal_entry_description_nonblank CHECK ((length(TRIM(BOTH FROM description)) > 0)),
    CONSTRAINT journal_entry_not_self_reversal CHECK (((reversal_of_entry_id IS NULL) OR (reversal_of_entry_id <> id))),
    CONSTRAINT journal_entry_posted_timestamp CHECK ((((status = 'posted'::text) AND (posted_at IS NOT NULL)) OR ((status = 'draft'::text) AND (posted_at IS NULL))))
);


--
-- Name: journal_entries_entry_number_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.journal_entries ALTER COLUMN entry_number ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.journal_entries_entry_number_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: journal_lines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.journal_lines (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    journal_entry_id uuid NOT NULL,
    line_number integer NOT NULL,
    account_id uuid NOT NULL,
    fund_id uuid,
    branch_id uuid,
    profile_id uuid,
    description text,
    debit_amount numeric(20,4) DEFAULT 0 NOT NULL,
    credit_amount numeric(20,4) DEFAULT 0 NOT NULL,
    base_debit_amount numeric(20,4) DEFAULT 0 NOT NULL,
    base_credit_amount numeric(20,4) DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT journal_line_amounts_nonnegative CHECK (((debit_amount >= (0)::numeric) AND (credit_amount >= (0)::numeric) AND (base_debit_amount >= (0)::numeric) AND (base_credit_amount >= (0)::numeric))),
    CONSTRAINT journal_line_number_positive CHECK ((line_number > 0)),
    CONSTRAINT journal_line_one_side_only CHECK ((((debit_amount > (0)::numeric) AND (credit_amount = (0)::numeric) AND (base_debit_amount > (0)::numeric) AND (base_credit_amount = (0)::numeric)) OR ((credit_amount > (0)::numeric) AND (debit_amount = (0)::numeric) AND (base_credit_amount > (0)::numeric) AND (base_debit_amount = (0)::numeric))))
);


--
-- Name: member_transfers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.member_transfers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    member_id uuid NOT NULL,
    from_branch_id uuid,
    to_branch_id uuid NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    requested_at timestamp with time zone DEFAULT now() NOT NULL,
    requested_by_profile_id uuid,
    approved_by_profile_id uuid,
    approved_at timestamp with time zone,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT member_transfers_approval_consistency CHECK ((((status = 'approved'::text) AND (approved_at IS NOT NULL)) OR (status <> 'approved'::text))),
    CONSTRAINT member_transfers_different_branches CHECK ((from_branch_id IS DISTINCT FROM to_branch_id)),
    CONSTRAINT member_transfers_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'cancelled'::text])))
);


--
-- Name: ministries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ministries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    branch_id uuid,
    name text NOT NULL,
    description text,
    entity_type text NOT NULL,
    category text,
    meeting_time text,
    roles_and_responsibilities jsonb DEFAULT '[]'::jsonb NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ministries_entity_type_check CHECK ((entity_type = ANY (ARRAY['ministry'::text, 'department'::text, 'fellowship'::text]))),
    CONSTRAINT ministries_status_check CHECK ((status = ANY (ARRAY['active'::text, 'inactive'::text, 'archived'::text])))
);


--
-- Name: ministry_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ministry_members (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ministry_id uuid NOT NULL,
    member_id uuid NOT NULL,
    role_title text DEFAULT 'Team Member'::text NOT NULL,
    duty text,
    status text DEFAULT 'active'::text NOT NULL,
    joined_at date DEFAULT CURRENT_DATE NOT NULL,
    created_by_profile_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ministry_members_status_check CHECK ((status = ANY (ARRAY['active'::text, 'on_leave'::text, 'in_training'::text, 'inactive'::text])))
);


--
-- Name: notification_recipients; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_recipients (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    notification_id uuid NOT NULL,
    profile_id uuid NOT NULL,
    delivery_status text DEFAULT 'pending'::text NOT NULL,
    read_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT notification_recipients_delivery_status_check CHECK ((delivery_status = ANY (ARRAY['pending'::text, 'sent'::text, 'failed'::text])))
);


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    branch_id uuid,
    title text NOT NULL,
    message text NOT NULL,
    notification_type text DEFAULT 'announcement'::text NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    created_by_profile_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    published_at timestamp with time zone,
    CONSTRAINT notification_message_nonblank CHECK ((length(TRIM(BOTH FROM message)) > 0)),
    CONSTRAINT notification_publish_consistency CHECK ((((status = 'published'::text) AND (published_at IS NOT NULL)) OR (status <> 'published'::text))),
    CONSTRAINT notification_title_nonblank CHECK ((length(TRIM(BOTH FROM title)) > 0)),
    CONSTRAINT notifications_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text, 'archived'::text])))
);


--
-- Name: payment_gateway_transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payment_gateway_transactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    financial_document_id uuid,
    provider text NOT NULL,
    provider_transaction_id text,
    idempotency_key text,
    amount numeric(20,4) NOT NULL,
    currency_code character(3) NOT NULL,
    status text DEFAULT 'initiated'::text NOT NULL,
    received_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT payment_gateway_provider_nonblank CHECK ((length(TRIM(BOTH FROM provider)) > 0)),
    CONSTRAINT payment_gateway_transactions_amount_check CHECK ((amount > (0)::numeric)),
    CONSTRAINT payment_gateway_transactions_status_check CHECK ((status = ANY (ARRAY['initiated'::text, 'pending'::text, 'successful'::text, 'failed'::text, 'cancelled'::text, 'refunded'::text])))
);


--
-- Name: permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.permissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    key text NOT NULL,
    module text NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: profile_role_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profile_role_assignments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    profile_id uuid NOT NULL,
    role_id uuid NOT NULL,
    scope_type text NOT NULL,
    branch_id uuid,
    district_id uuid,
    assigned_by_profile_id uuid,
    assigned_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone,
    is_active boolean DEFAULT true NOT NULL,
    CONSTRAINT profile_role_assignments_scope_type_check CHECK ((scope_type = ANY (ARRAY['church'::text, 'district'::text, 'branch'::text]))),
    CONSTRAINT role_assignment_expiry CHECK (((expires_at IS NULL) OR (expires_at > assigned_at))),
    CONSTRAINT role_assignment_scope_shape CHECK ((((scope_type = 'church'::text) AND (branch_id IS NULL) AND (district_id IS NULL)) OR ((scope_type = 'district'::text) AND (district_id IS NOT NULL) AND (branch_id IS NULL)) OR ((scope_type = 'branch'::text) AND (branch_id IS NOT NULL) AND (district_id IS NULL))))
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    auth_user_id uuid,
    branch_id uuid,
    first_name text NOT NULL,
    last_name text NOT NULL,
    email text,
    phone text,
    gender text,
    date_of_birth date,
    marital_status text,
    marriage_date date,
    avatar_url text,
    membership_date date,
    membership_status text DEFAULT 'active'::text NOT NULL,
    is_baptized boolean DEFAULT false NOT NULL,
    baptism_date date,
    baptized_by_profile_id uuid,
    baptized_by_name_snapshot text,
    portal_access_status text DEFAULT 'not_invited'::text NOT NULL,
    record_status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT profiles_active_portal_requires_auth CHECK (((portal_access_status <> 'active'::text) OR (auth_user_id IS NOT NULL))),
    CONSTRAINT profiles_membership_status_check CHECK ((membership_status = ANY (ARRAY['active'::text, 'inactive'::text, 'suspended'::text, 'transferred'::text, 'archived'::text]))),
    CONSTRAINT profiles_portal_access_status_check CHECK ((portal_access_status = ANY (ARRAY['not_invited'::text, 'invited'::text, 'active'::text, 'suspended'::text]))),
    CONSTRAINT profiles_record_status_check CHECK ((record_status = ANY (ARRAY['active'::text, 'archived'::text])))
);


--
-- Name: role_permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.role_permissions (
    role_id uuid NOT NULL,
    permission_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    is_system boolean DEFAULT false NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: stream_chat_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stream_chat_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    stream_id uuid NOT NULL,
    sender_profile_id uuid NOT NULL,
    message text NOT NULL,
    status text DEFAULT 'visible'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT stream_chat_message_max_length CHECK ((length(message) <= 2000)),
    CONSTRAINT stream_chat_message_nonblank CHECK ((length(TRIM(BOTH FROM message)) > 0)),
    CONSTRAINT stream_chat_messages_status_check CHECK ((status = ANY (ARRAY['visible'::text, 'hidden'::text, 'removed'::text])))
);


--
-- Name: streams; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.streams (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    branch_id uuid,
    title text NOT NULL,
    description text,
    platform text,
    stream_url text,
    thumbnail_url text,
    visibility text DEFAULT 'members_only'::text NOT NULL,
    status text DEFAULT 'scheduled'::text NOT NULL,
    scheduled_start timestamp with time zone,
    started_at timestamp with time zone,
    ended_at timestamp with time zone,
    created_by_profile_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT streams_status_check CHECK ((status = ANY (ARRAY['scheduled'::text, 'live'::text, 'ended'::text, 'cancelled'::text]))),
    CONSTRAINT streams_time_order CHECK (((ended_at IS NULL) OR (started_at IS NULL) OR (ended_at >= started_at))),
    CONSTRAINT streams_visibility_check CHECK ((visibility = ANY (ARRAY['public'::text, 'members_only'::text])))
);


--
-- Name: welfare_assistance; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.welfare_assistance (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    case_id uuid NOT NULL,
    assistance_type text NOT NULL,
    financial_document_id uuid,
    description text,
    approved_by_profile_id uuid,
    provided_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: welfare_campaigns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.welfare_campaigns (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    branch_id uuid,
    campaign_name text NOT NULL,
    beneficiary text,
    purpose text,
    target_amount numeric(20,4) NOT NULL,
    expected_contribution numeric(20,4) DEFAULT 0 NOT NULL,
    currency_code character(3) NOT NULL,
    deadline date,
    status text DEFAULT 'draft'::text NOT NULL,
    created_by_profile_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT welfare_campaign_name_nonblank CHECK ((length(TRIM(BOTH FROM campaign_name)) > 0)),
    CONSTRAINT welfare_campaigns_expected_contribution_check CHECK ((expected_contribution >= (0)::numeric)),
    CONSTRAINT welfare_campaigns_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'active'::text, 'completed'::text, 'cancelled'::text, 'archived'::text]))),
    CONSTRAINT welfare_campaigns_target_amount_check CHECK ((target_amount >= (0)::numeric))
);


--
-- Name: welfare_cases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.welfare_cases (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    member_id uuid NOT NULL,
    branch_id uuid,
    case_type text NOT NULL,
    reason text NOT NULL,
    restricted_description text,
    priority text DEFAULT 'normal'::text NOT NULL,
    status text DEFAULT 'submitted'::text NOT NULL,
    assigned_to_profile_id uuid,
    created_by_profile_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT welfare_case_reason_nonblank CHECK ((length(TRIM(BOTH FROM reason)) > 0)),
    CONSTRAINT welfare_cases_priority_check CHECK ((priority = ANY (ARRAY['low'::text, 'normal'::text, 'high'::text, 'urgent'::text]))),
    CONSTRAINT welfare_cases_status_check CHECK ((status = ANY (ARRAY['submitted'::text, 'under_review'::text, 'approved'::text, 'rejected'::text, 'completed'::text, 'closed'::text])))
);


--
-- Name: welfare_contributions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.welfare_contributions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    campaign_id uuid NOT NULL,
    contributing_member_id uuid,
    financial_document_id uuid NOT NULL,
    contribution_date date DEFAULT CURRENT_DATE NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: payment_gateway_payloads payment_gateway_payloads_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.payment_gateway_payloads
    ADD CONSTRAINT payment_gateway_payloads_pkey PRIMARY KEY (id);


--
-- Name: stream_credentials stream_credentials_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.stream_credentials
    ADD CONSTRAINT stream_credentials_pkey PRIMARY KEY (id);


--
-- Name: approval_policy_bands approval_bands_no_overlap; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_policy_bands
    ADD CONSTRAINT approval_bands_no_overlap EXCLUDE USING gist (policy_id WITH =, numrange(min_amount_base, max_amount_base, '[)'::text) WITH &&);


--
-- Name: approval_decisions approval_decisions_approval_request_step_id_approver_profil_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_decisions
    ADD CONSTRAINT approval_decisions_approval_request_step_id_approver_profil_key UNIQUE (approval_request_step_id, approver_profile_id);


--
-- Name: approval_decisions approval_decisions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_decisions
    ADD CONSTRAINT approval_decisions_pkey PRIMARY KEY (id);


--
-- Name: approval_policies approval_policies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_policies
    ADD CONSTRAINT approval_policies_pkey PRIMARY KEY (id);


--
-- Name: approval_policy_bands approval_policy_bands_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_policy_bands
    ADD CONSTRAINT approval_policy_bands_pkey PRIMARY KEY (id);


--
-- Name: approval_policy_steps approval_policy_steps_band_id_step_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_policy_steps
    ADD CONSTRAINT approval_policy_steps_band_id_step_number_key UNIQUE (band_id, step_number);


--
-- Name: approval_policy_steps approval_policy_steps_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_policy_steps
    ADD CONSTRAINT approval_policy_steps_pkey PRIMARY KEY (id);


--
-- Name: approval_request_steps approval_request_steps_approval_request_id_step_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_request_steps
    ADD CONSTRAINT approval_request_steps_approval_request_id_step_number_key UNIQUE (approval_request_id, step_number);


--
-- Name: approval_request_steps approval_request_steps_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_request_steps
    ADD CONSTRAINT approval_request_steps_pkey PRIMARY KEY (id);


--
-- Name: approval_requests approval_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_requests
    ADD CONSTRAINT approval_requests_pkey PRIMARY KEY (id);


--
-- Name: attendance_records attendance_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_records
    ADD CONSTRAINT attendance_records_pkey PRIMARY KEY (id);


--
-- Name: attendance_records attendance_records_session_id_member_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_records
    ADD CONSTRAINT attendance_records_session_id_member_id_key UNIQUE (session_id, member_id);


--
-- Name: attendance_sessions attendance_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_sessions
    ADD CONSTRAINT attendance_sessions_pkey PRIMARY KEY (id);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: budget_lines budget_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.budget_lines
    ADD CONSTRAINT budget_lines_pkey PRIMARY KEY (id);


--
-- Name: budgets budgets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.budgets
    ADD CONSTRAINT budgets_pkey PRIMARY KEY (id);


--
-- Name: cell_members cell_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cell_members
    ADD CONSTRAINT cell_members_pkey PRIMARY KEY (id);


--
-- Name: cells cells_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cells
    ADD CONSTRAINT cells_pkey PRIMARY KEY (id);


--
-- Name: chart_of_accounts chart_of_accounts_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chart_of_accounts
    ADD CONSTRAINT chart_of_accounts_code_key UNIQUE (code);


--
-- Name: chart_of_accounts chart_of_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chart_of_accounts
    ADD CONSTRAINT chart_of_accounts_pkey PRIMARY KEY (id);


--
-- Name: church_branches church_branches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.church_branches
    ADD CONSTRAINT church_branches_pkey PRIMARY KEY (id);


--
-- Name: church_resources church_resources_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.church_resources
    ADD CONSTRAINT church_resources_pkey PRIMARY KEY (id);


--
-- Name: church_settings church_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.church_settings
    ADD CONSTRAINT church_settings_pkey PRIMARY KEY (id);


--
-- Name: currencies currencies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.currencies
    ADD CONSTRAINT currencies_pkey PRIMARY KEY (code);


--
-- Name: districts districts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.districts
    ADD CONSTRAINT districts_pkey PRIMARY KEY (id);


--
-- Name: event_registrations event_registrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_registrations
    ADD CONSTRAINT event_registrations_pkey PRIMARY KEY (id);


--
-- Name: event_survey_answers event_survey_answers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_survey_answers
    ADD CONSTRAINT event_survey_answers_pkey PRIMARY KEY (id);


--
-- Name: event_survey_questions event_survey_questions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_survey_questions
    ADD CONSTRAINT event_survey_questions_pkey PRIMARY KEY (id);


--
-- Name: event_survey_responses event_survey_responses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_survey_responses
    ADD CONSTRAINT event_survey_responses_pkey PRIMARY KEY (id);


--
-- Name: event_surveys event_surveys_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_surveys
    ADD CONSTRAINT event_surveys_pkey PRIMARY KEY (id);


--
-- Name: events events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_pkey PRIMARY KEY (id);


--
-- Name: financial_accounts financial_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financial_accounts
    ADD CONSTRAINT financial_accounts_pkey PRIMARY KEY (id);


--
-- Name: financial_documents financial_documents_document_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financial_documents
    ADD CONSTRAINT financial_documents_document_number_key UNIQUE (document_number);


--
-- Name: financial_documents financial_documents_journal_entry_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financial_documents
    ADD CONSTRAINT financial_documents_journal_entry_id_key UNIQUE (journal_entry_id);


--
-- Name: financial_documents financial_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financial_documents
    ADD CONSTRAINT financial_documents_pkey PRIMARY KEY (id);


--
-- Name: financial_periods financial_periods_no_overlap; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financial_periods
    ADD CONSTRAINT financial_periods_no_overlap EXCLUDE USING gist (financial_year_id WITH =, daterange(start_date, end_date, '[]'::text) WITH &&);


--
-- Name: financial_periods financial_periods_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financial_periods
    ADD CONSTRAINT financial_periods_pkey PRIMARY KEY (id);


--
-- Name: financial_years financial_years_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financial_years
    ADD CONSTRAINT financial_years_pkey PRIMARY KEY (id);


--
-- Name: financial_years financial_years_year_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financial_years
    ADD CONSTRAINT financial_years_year_number_key UNIQUE (year_number);


--
-- Name: funds funds_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.funds
    ADD CONSTRAINT funds_code_key UNIQUE (code);


--
-- Name: funds funds_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.funds
    ADD CONSTRAINT funds_pkey PRIMARY KEY (id);


--
-- Name: giving_records giving_records_financial_document_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.giving_records
    ADD CONSTRAINT giving_records_financial_document_id_key UNIQUE (financial_document_id);


--
-- Name: giving_records giving_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.giving_records
    ADD CONSTRAINT giving_records_pkey PRIMARY KEY (id);


--
-- Name: journal_entries journal_entries_entry_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_entries
    ADD CONSTRAINT journal_entries_entry_number_key UNIQUE (entry_number);


--
-- Name: journal_entries journal_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_entries
    ADD CONSTRAINT journal_entries_pkey PRIMARY KEY (id);


--
-- Name: journal_lines journal_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_lines
    ADD CONSTRAINT journal_lines_pkey PRIMARY KEY (id);


--
-- Name: member_transfers member_transfers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.member_transfers
    ADD CONSTRAINT member_transfers_pkey PRIMARY KEY (id);


--
-- Name: ministries ministries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ministries
    ADD CONSTRAINT ministries_pkey PRIMARY KEY (id);


--
-- Name: ministry_members ministry_members_ministry_id_member_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ministry_members
    ADD CONSTRAINT ministry_members_ministry_id_member_id_key UNIQUE (ministry_id, member_id);


--
-- Name: ministry_members ministry_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ministry_members
    ADD CONSTRAINT ministry_members_pkey PRIMARY KEY (id);


--
-- Name: notification_recipients notification_recipients_notification_id_profile_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_recipients
    ADD CONSTRAINT notification_recipients_notification_id_profile_id_key UNIQUE (notification_id, profile_id);


--
-- Name: notification_recipients notification_recipients_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_recipients
    ADD CONSTRAINT notification_recipients_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: payment_gateway_transactions payment_gateway_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_gateway_transactions
    ADD CONSTRAINT payment_gateway_transactions_pkey PRIMARY KEY (id);


--
-- Name: permissions permissions_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permissions
    ADD CONSTRAINT permissions_key_key UNIQUE (key);


--
-- Name: permissions permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permissions
    ADD CONSTRAINT permissions_pkey PRIMARY KEY (id);


--
-- Name: profile_role_assignments profile_role_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profile_role_assignments
    ADD CONSTRAINT profile_role_assignments_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_auth_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_auth_user_id_key UNIQUE (auth_user_id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: role_permissions role_permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_pkey PRIMARY KEY (role_id, permission_id);


--
-- Name: roles roles_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_name_key UNIQUE (name);


--
-- Name: roles roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_pkey PRIMARY KEY (id);


--
-- Name: stream_chat_messages stream_chat_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stream_chat_messages
    ADD CONSTRAINT stream_chat_messages_pkey PRIMARY KEY (id);


--
-- Name: streams streams_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.streams
    ADD CONSTRAINT streams_pkey PRIMARY KEY (id);


--
-- Name: cell_members uq_cell_member_pair; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cell_members
    ADD CONSTRAINT uq_cell_member_pair UNIQUE (cell_id, member_id);


--
-- Name: cells uq_cells_branch_name; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cells
    ADD CONSTRAINT uq_cells_branch_name UNIQUE (branch_id, name);


--
-- Name: cells uq_cells_id_branch; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cells
    ADD CONSTRAINT uq_cells_id_branch UNIQUE (id, branch_id);


--
-- Name: journal_lines uq_journal_line_number; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_lines
    ADD CONSTRAINT uq_journal_line_number UNIQUE (journal_entry_id, line_number);


--
-- Name: profiles uq_profiles_id_branch; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT uq_profiles_id_branch UNIQUE (id, branch_id);


--
-- Name: event_survey_answers uq_survey_answer_per_question; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_survey_answers
    ADD CONSTRAINT uq_survey_answer_per_question UNIQUE (response_id, question_id);


--
-- Name: event_survey_questions uq_survey_question_id_survey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_survey_questions
    ADD CONSTRAINT uq_survey_question_id_survey UNIQUE (id, survey_id);


--
-- Name: event_survey_questions uq_survey_question_order; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_survey_questions
    ADD CONSTRAINT uq_survey_question_order UNIQUE (survey_id, sort_order);


--
-- Name: event_survey_responses uq_survey_response_id_survey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_survey_responses
    ADD CONSTRAINT uq_survey_response_id_survey UNIQUE (id, survey_id);


--
-- Name: event_survey_responses uq_survey_response_member; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_survey_responses
    ADD CONSTRAINT uq_survey_response_member UNIQUE (survey_id, member_id);


--
-- Name: welfare_assistance welfare_assistance_financial_document_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.welfare_assistance
    ADD CONSTRAINT welfare_assistance_financial_document_id_key UNIQUE (financial_document_id);


--
-- Name: welfare_assistance welfare_assistance_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.welfare_assistance
    ADD CONSTRAINT welfare_assistance_pkey PRIMARY KEY (id);


--
-- Name: welfare_campaigns welfare_campaigns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.welfare_campaigns
    ADD CONSTRAINT welfare_campaigns_pkey PRIMARY KEY (id);


--
-- Name: welfare_cases welfare_cases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.welfare_cases
    ADD CONSTRAINT welfare_cases_pkey PRIMARY KEY (id);


--
-- Name: welfare_contributions welfare_contributions_financial_document_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.welfare_contributions
    ADD CONSTRAINT welfare_contributions_financial_document_id_key UNIQUE (financial_document_id);


--
-- Name: welfare_contributions welfare_contributions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.welfare_contributions
    ADD CONSTRAINT welfare_contributions_pkey PRIMARY KEY (id);


--
-- Name: ix_private_payment_gateway_payloads_transaction; Type: INDEX; Schema: private; Owner: -
--

CREATE INDEX ix_private_payment_gateway_payloads_transaction ON private.payment_gateway_payloads USING btree (transaction_id);


--
-- Name: ix_private_stream_credentials_created_by; Type: INDEX; Schema: private; Owner: -
--

CREATE INDEX ix_private_stream_credentials_created_by ON private.stream_credentials USING btree (created_by_profile_id) WHERE (created_by_profile_id IS NOT NULL);


--
-- Name: ix_private_stream_credentials_stream; Type: INDEX; Schema: private; Owner: -
--

CREATE INDEX ix_private_stream_credentials_stream ON private.stream_credentials USING btree (stream_id);


--
-- Name: ix_approval_decisions_approver; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_approval_decisions_approver ON public.approval_decisions USING btree (approver_profile_id, decided_at DESC);


--
-- Name: ix_approval_policies_active_scope; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_approval_policies_active_scope ON public.approval_policies USING btree (transaction_type, branch_id, is_active, effective_from);


--
-- Name: ix_approval_policies_branch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_approval_policies_branch ON public.approval_policies USING btree (branch_id) WHERE (branch_id IS NOT NULL);


--
-- Name: ix_approval_policies_created_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_approval_policies_created_by ON public.approval_policies USING btree (created_by_profile_id) WHERE (created_by_profile_id IS NOT NULL);


--
-- Name: ix_approval_policy_bands_policy; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_approval_policy_bands_policy ON public.approval_policy_bands USING btree (policy_id);


--
-- Name: ix_approval_policy_steps_permission; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_approval_policy_steps_permission ON public.approval_policy_steps USING btree (required_permission_key);


--
-- Name: ix_approval_request_steps_permission; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_approval_request_steps_permission ON public.approval_request_steps USING btree (required_permission_key);


--
-- Name: ix_approval_request_steps_request; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_approval_request_steps_request ON public.approval_request_steps USING btree (approval_request_id, step_number);


--
-- Name: ix_approval_requests_band; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_approval_requests_band ON public.approval_requests USING btree (band_id) WHERE (band_id IS NOT NULL);


--
-- Name: ix_approval_requests_branch_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_approval_requests_branch_status ON public.approval_requests USING btree (branch_id, status, submitted_at DESC);


--
-- Name: ix_approval_requests_policy; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_approval_requests_policy ON public.approval_requests USING btree (policy_id) WHERE (policy_id IS NOT NULL);


--
-- Name: ix_approval_requests_submitter; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_approval_requests_submitter ON public.approval_requests USING btree (submitted_by_profile_id, submitted_at DESC);


--
-- Name: ix_attendance_records_member; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_attendance_records_member ON public.attendance_records USING btree (member_id);


--
-- Name: ix_attendance_records_recorded_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_attendance_records_recorded_by ON public.attendance_records USING btree (recorded_by_profile_id) WHERE (recorded_by_profile_id IS NOT NULL);


--
-- Name: ix_attendance_sessions_branch_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_attendance_sessions_branch_date ON public.attendance_sessions USING btree (branch_id, session_date DESC);


--
-- Name: ix_attendance_sessions_created_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_attendance_sessions_created_by ON public.attendance_sessions USING btree (created_by_profile_id) WHERE (created_by_profile_id IS NOT NULL);


--
-- Name: ix_attendance_sessions_event; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_attendance_sessions_event ON public.attendance_sessions USING btree (event_id) WHERE (event_id IS NOT NULL);


--
-- Name: ix_audit_logs_actor_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_audit_logs_actor_created ON public.audit_logs USING btree (actor_profile_id, created_at DESC);


--
-- Name: ix_audit_logs_branch_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_audit_logs_branch_created ON public.audit_logs USING btree (branch_id, created_at DESC);


--
-- Name: ix_audit_logs_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_audit_logs_created ON public.audit_logs USING btree (created_at DESC);


--
-- Name: ix_audit_logs_entity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_audit_logs_entity ON public.audit_logs USING btree (entity_type, entity_id, created_at DESC);


--
-- Name: ix_budget_lines_account; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_budget_lines_account ON public.budget_lines USING btree (account_id) WHERE (account_id IS NOT NULL);


--
-- Name: ix_budget_lines_budget; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_budget_lines_budget ON public.budget_lines USING btree (budget_id);


--
-- Name: ix_budget_lines_fund; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_budget_lines_fund ON public.budget_lines USING btree (fund_id) WHERE (fund_id IS NOT NULL);


--
-- Name: ix_budgets_approval_request; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_budgets_approval_request ON public.budgets USING btree (approval_request_id) WHERE (approval_request_id IS NOT NULL);


--
-- Name: ix_budgets_approved_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_budgets_approved_by ON public.budgets USING btree (approved_by_profile_id) WHERE (approved_by_profile_id IS NOT NULL);


--
-- Name: ix_budgets_base_currency; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_budgets_base_currency ON public.budgets USING btree (base_currency_code);


--
-- Name: ix_budgets_branch_period; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_budgets_branch_period ON public.budgets USING btree (branch_id, period_id);


--
-- Name: ix_budgets_currency; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_budgets_currency ON public.budgets USING btree (currency_code);


--
-- Name: ix_budgets_event; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_budgets_event ON public.budgets USING btree (event_id) WHERE (event_id IS NOT NULL);


--
-- Name: ix_budgets_period; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_budgets_period ON public.budgets USING btree (period_id);


--
-- Name: ix_budgets_submitted_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_budgets_submitted_by ON public.budgets USING btree (submitted_by_profile_id) WHERE (submitted_by_profile_id IS NOT NULL);


--
-- Name: ix_cell_members_cell; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_cell_members_cell ON public.cell_members USING btree (cell_id);


--
-- Name: ix_cell_members_cell_branch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_cell_members_cell_branch ON public.cell_members USING btree (cell_id, branch_id);


--
-- Name: ix_cell_members_member; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_cell_members_member ON public.cell_members USING btree (member_id);


--
-- Name: ix_cells_leader_branch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_cells_leader_branch ON public.cells USING btree (leader_id, branch_id) WHERE (leader_id IS NOT NULL);


--
-- Name: ix_chart_of_accounts_parent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_chart_of_accounts_parent ON public.chart_of_accounts USING btree (parent_account_id) WHERE (parent_account_id IS NOT NULL);


--
-- Name: ix_chart_of_accounts_type_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_chart_of_accounts_type_active ON public.chart_of_accounts USING btree (account_type, is_active);


--
-- Name: ix_church_branches_district_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_church_branches_district_id ON public.church_branches USING btree (district_id);


--
-- Name: ix_church_resources_branch_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_church_resources_branch_status ON public.church_resources USING btree (branch_id, status);


--
-- Name: ix_church_resources_created_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_church_resources_created_by ON public.church_resources USING btree (created_by_profile_id) WHERE (created_by_profile_id IS NOT NULL);


--
-- Name: ix_church_resources_visibility_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_church_resources_visibility_status ON public.church_resources USING btree (visibility, status);


--
-- Name: ix_church_settings_base_currency; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_church_settings_base_currency ON public.church_settings USING btree (base_currency_code);


--
-- Name: ix_event_registrations_event_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_event_registrations_event_status ON public.event_registrations USING btree (event_id, status);


--
-- Name: ix_event_registrations_member; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_event_registrations_member ON public.event_registrations USING btree (member_id) WHERE (member_id IS NOT NULL);


--
-- Name: ix_event_registrations_registered_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_event_registrations_registered_by ON public.event_registrations USING btree (registered_by_profile_id) WHERE (registered_by_profile_id IS NOT NULL);


--
-- Name: ix_event_survey_answers_question; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_event_survey_answers_question ON public.event_survey_answers USING btree (question_id, survey_id);


--
-- Name: ix_event_survey_answers_response_survey; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_event_survey_answers_response_survey ON public.event_survey_answers USING btree (response_id, survey_id);


--
-- Name: ix_event_survey_questions_survey; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_event_survey_questions_survey ON public.event_survey_questions USING btree (survey_id, sort_order);


--
-- Name: ix_event_survey_responses_member; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_event_survey_responses_member ON public.event_survey_responses USING btree (member_id);


--
-- Name: ix_event_surveys_created_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_event_surveys_created_by ON public.event_surveys USING btree (created_by_profile_id) WHERE (created_by_profile_id IS NOT NULL);


--
-- Name: ix_event_surveys_event_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_event_surveys_event_status ON public.event_surveys USING btree (event_id, status);


--
-- Name: ix_events_branch_start; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_events_branch_start ON public.events USING btree (branch_id, start_time);


--
-- Name: ix_events_created_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_events_created_by ON public.events USING btree (created_by_profile_id) WHERE (created_by_profile_id IS NOT NULL);


--
-- Name: ix_events_status_start; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_events_status_start ON public.events USING btree (status, start_time);


--
-- Name: ix_financial_accounts_branch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_financial_accounts_branch ON public.financial_accounts USING btree (branch_id);


--
-- Name: ix_financial_accounts_chart_account; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_financial_accounts_chart_account ON public.financial_accounts USING btree (chart_account_id);


--
-- Name: ix_financial_accounts_currency; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_financial_accounts_currency ON public.financial_accounts USING btree (currency_code);


--
-- Name: ix_financial_documents_account; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_financial_documents_account ON public.financial_documents USING btree (financial_account_id) WHERE (financial_account_id IS NOT NULL);


--
-- Name: ix_financial_documents_approval_request; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_financial_documents_approval_request ON public.financial_documents USING btree (approval_request_id) WHERE (approval_request_id IS NOT NULL);


--
-- Name: ix_financial_documents_approved_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_financial_documents_approved_by ON public.financial_documents USING btree (approved_by_profile_id) WHERE (approved_by_profile_id IS NOT NULL);


--
-- Name: ix_financial_documents_base_currency; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_financial_documents_base_currency ON public.financial_documents USING btree (base_currency_code);


--
-- Name: ix_financial_documents_branch_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_financial_documents_branch_date ON public.financial_documents USING btree (branch_id, transaction_date DESC);


--
-- Name: ix_financial_documents_created_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_financial_documents_created_by ON public.financial_documents USING btree (created_by_profile_id) WHERE (created_by_profile_id IS NOT NULL);


--
-- Name: ix_financial_documents_currency; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_financial_documents_currency ON public.financial_documents USING btree (currency_code);


--
-- Name: ix_financial_documents_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_financial_documents_date ON public.financial_documents USING btree (transaction_date DESC);


--
-- Name: ix_financial_documents_journal; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_financial_documents_journal ON public.financial_documents USING btree (journal_entry_id) WHERE (journal_entry_id IS NOT NULL);


--
-- Name: ix_financial_documents_profile; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_financial_documents_profile ON public.financial_documents USING btree (profile_id) WHERE (profile_id IS NOT NULL);


--
-- Name: ix_financial_periods_closed_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_financial_periods_closed_by ON public.financial_periods USING btree (closed_by_profile_id) WHERE (closed_by_profile_id IS NOT NULL);


--
-- Name: ix_financial_periods_year_dates; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_financial_periods_year_dates ON public.financial_periods USING btree (financial_year_id, start_date, end_date);


--
-- Name: ix_giving_records_fund; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_giving_records_fund ON public.giving_records USING btree (fund_id) WHERE (fund_id IS NOT NULL);


--
-- Name: ix_giving_records_giver; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_giving_records_giver ON public.giving_records USING btree (giver_profile_id) WHERE (giver_profile_id IS NOT NULL);


--
-- Name: ix_journal_entries_approval_request; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_journal_entries_approval_request ON public.journal_entries USING btree (approval_request_id) WHERE (approval_request_id IS NOT NULL);


--
-- Name: ix_journal_entries_approved_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_journal_entries_approved_by ON public.journal_entries USING btree (approved_by_profile_id) WHERE (approved_by_profile_id IS NOT NULL);


--
-- Name: ix_journal_entries_base_currency; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_journal_entries_base_currency ON public.journal_entries USING btree (base_currency_code);


--
-- Name: ix_journal_entries_branch_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_journal_entries_branch_date ON public.journal_entries USING btree (branch_id, entry_date);


--
-- Name: ix_journal_entries_created_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_journal_entries_created_by ON public.journal_entries USING btree (created_by_profile_id) WHERE (created_by_profile_id IS NOT NULL);


--
-- Name: ix_journal_entries_currency; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_journal_entries_currency ON public.journal_entries USING btree (currency_code);


--
-- Name: ix_journal_entries_period_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_journal_entries_period_date ON public.journal_entries USING btree (period_id, entry_date);


--
-- Name: ix_journal_lines_account; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_journal_lines_account ON public.journal_lines USING btree (account_id);


--
-- Name: ix_journal_lines_branch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_journal_lines_branch ON public.journal_lines USING btree (branch_id) WHERE (branch_id IS NOT NULL);


--
-- Name: ix_journal_lines_fund; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_journal_lines_fund ON public.journal_lines USING btree (fund_id) WHERE (fund_id IS NOT NULL);


--
-- Name: ix_journal_lines_profile; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_journal_lines_profile ON public.journal_lines USING btree (profile_id) WHERE (profile_id IS NOT NULL);


--
-- Name: ix_member_transfers_approved_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_member_transfers_approved_by ON public.member_transfers USING btree (approved_by_profile_id) WHERE (approved_by_profile_id IS NOT NULL);


--
-- Name: ix_member_transfers_from_branch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_member_transfers_from_branch ON public.member_transfers USING btree (from_branch_id) WHERE (from_branch_id IS NOT NULL);


--
-- Name: ix_member_transfers_member; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_member_transfers_member ON public.member_transfers USING btree (member_id);


--
-- Name: ix_member_transfers_requested_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_member_transfers_requested_by ON public.member_transfers USING btree (requested_by_profile_id) WHERE (requested_by_profile_id IS NOT NULL);


--
-- Name: ix_member_transfers_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_member_transfers_status ON public.member_transfers USING btree (status);


--
-- Name: ix_member_transfers_to_branch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_member_transfers_to_branch ON public.member_transfers USING btree (to_branch_id);


--
-- Name: ix_ministry_members_created_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_ministry_members_created_by ON public.ministry_members USING btree (created_by_profile_id) WHERE (created_by_profile_id IS NOT NULL);


--
-- Name: ix_ministry_members_member; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_ministry_members_member ON public.ministry_members USING btree (member_id);


--
-- Name: ix_ministry_members_ministry; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_ministry_members_ministry ON public.ministry_members USING btree (ministry_id);


--
-- Name: ix_notification_recipients_notification; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_notification_recipients_notification ON public.notification_recipients USING btree (notification_id);


--
-- Name: ix_notification_recipients_profile; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_notification_recipients_profile ON public.notification_recipients USING btree (profile_id, created_at DESC);


--
-- Name: ix_notifications_branch_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_notifications_branch_status ON public.notifications USING btree (branch_id, status, published_at DESC);


--
-- Name: ix_notifications_created_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_notifications_created_by ON public.notifications USING btree (created_by_profile_id) WHERE (created_by_profile_id IS NOT NULL);


--
-- Name: ix_payment_gateway_currency; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_payment_gateway_currency ON public.payment_gateway_transactions USING btree (currency_code);


--
-- Name: ix_payment_gateway_document; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_payment_gateway_document ON public.payment_gateway_transactions USING btree (financial_document_id) WHERE (financial_document_id IS NOT NULL);


--
-- Name: ix_payment_gateway_status_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_payment_gateway_status_created ON public.payment_gateway_transactions USING btree (status, created_at DESC);


--
-- Name: ix_profile_role_assignments_assigned_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_profile_role_assignments_assigned_by ON public.profile_role_assignments USING btree (assigned_by_profile_id) WHERE (assigned_by_profile_id IS NOT NULL);


--
-- Name: ix_profile_role_assignments_branch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_profile_role_assignments_branch ON public.profile_role_assignments USING btree (branch_id) WHERE (branch_id IS NOT NULL);


--
-- Name: ix_profile_role_assignments_district; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_profile_role_assignments_district ON public.profile_role_assignments USING btree (district_id) WHERE (district_id IS NOT NULL);


--
-- Name: ix_profile_role_assignments_profile; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_profile_role_assignments_profile ON public.profile_role_assignments USING btree (profile_id, is_active);


--
-- Name: ix_profile_role_assignments_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_profile_role_assignments_role ON public.profile_role_assignments USING btree (role_id);


--
-- Name: ix_profiles_baptized_by_profile; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_profiles_baptized_by_profile ON public.profiles USING btree (baptized_by_profile_id) WHERE (baptized_by_profile_id IS NOT NULL);


--
-- Name: ix_profiles_branch_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_profiles_branch_id ON public.profiles USING btree (branch_id);


--
-- Name: ix_profiles_email_lower; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_profiles_email_lower ON public.profiles USING btree (lower(email)) WHERE (email IS NOT NULL);


--
-- Name: ix_profiles_membership_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_profiles_membership_status ON public.profiles USING btree (membership_status);


--
-- Name: ix_profiles_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_profiles_name ON public.profiles USING btree (lower(last_name), lower(first_name));


--
-- Name: ix_role_permissions_permission; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_role_permissions_permission ON public.role_permissions USING btree (permission_id);


--
-- Name: ix_stream_chat_messages_sender; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_stream_chat_messages_sender ON public.stream_chat_messages USING btree (sender_profile_id);


--
-- Name: ix_stream_chat_messages_stream_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_stream_chat_messages_stream_created ON public.stream_chat_messages USING btree (stream_id, created_at);


--
-- Name: ix_streams_branch_status_start; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_streams_branch_status_start ON public.streams USING btree (branch_id, status, scheduled_start);


--
-- Name: ix_streams_created_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_streams_created_by ON public.streams USING btree (created_by_profile_id) WHERE (created_by_profile_id IS NOT NULL);


--
-- Name: ix_welfare_assistance_approved_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_welfare_assistance_approved_by ON public.welfare_assistance USING btree (approved_by_profile_id) WHERE (approved_by_profile_id IS NOT NULL);


--
-- Name: ix_welfare_assistance_case; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_welfare_assistance_case ON public.welfare_assistance USING btree (case_id);


--
-- Name: ix_welfare_campaigns_branch_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_welfare_campaigns_branch_status ON public.welfare_campaigns USING btree (branch_id, status);


--
-- Name: ix_welfare_campaigns_created_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_welfare_campaigns_created_by ON public.welfare_campaigns USING btree (created_by_profile_id) WHERE (created_by_profile_id IS NOT NULL);


--
-- Name: ix_welfare_campaigns_currency; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_welfare_campaigns_currency ON public.welfare_campaigns USING btree (currency_code);


--
-- Name: ix_welfare_cases_assigned_to; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_welfare_cases_assigned_to ON public.welfare_cases USING btree (assigned_to_profile_id) WHERE (assigned_to_profile_id IS NOT NULL);


--
-- Name: ix_welfare_cases_branch_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_welfare_cases_branch_status ON public.welfare_cases USING btree (branch_id, status);


--
-- Name: ix_welfare_cases_created_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_welfare_cases_created_by ON public.welfare_cases USING btree (created_by_profile_id) WHERE (created_by_profile_id IS NOT NULL);


--
-- Name: ix_welfare_cases_member; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_welfare_cases_member ON public.welfare_cases USING btree (member_id, created_at DESC);


--
-- Name: ix_welfare_cases_member_branch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_welfare_cases_member_branch ON public.welfare_cases USING btree (member_id, branch_id);


--
-- Name: ix_welfare_contributions_campaign; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_welfare_contributions_campaign ON public.welfare_contributions USING btree (campaign_id);


--
-- Name: ix_welfare_contributions_member; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_welfare_contributions_member ON public.welfare_contributions USING btree (contributing_member_id) WHERE (contributing_member_id IS NOT NULL);


--
-- Name: uq_approval_policy_version_scope; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_approval_policy_version_scope ON public.approval_policies USING btree (transaction_type, COALESCE(branch_id, '00000000-0000-0000-0000-000000000000'::uuid), version);


--
-- Name: uq_approval_request_one_pending_target; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_approval_request_one_pending_target ON public.approval_requests USING btree (transaction_type, target_id) WHERE (status = 'pending'::text);


--
-- Name: uq_cell_members_one_active_cell_per_branch; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_cell_members_one_active_cell_per_branch ON public.cell_members USING btree (member_id, branch_id) WHERE (status = 'active'::text);


--
-- Name: uq_church_branches_code; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_church_branches_code ON public.church_branches USING btree (upper(code));


--
-- Name: uq_church_branches_one_active_main; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_church_branches_one_active_main ON public.church_branches USING btree (is_main_branch) WHERE ((is_main_branch = true) AND (status = 'active'::text));


--
-- Name: uq_districts_active_name; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_districts_active_name ON public.districts USING btree (lower(name)) WHERE (status = 'active'::text);


--
-- Name: uq_event_registration_active_external_email; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_event_registration_active_external_email ON public.event_registrations USING btree (event_id, lower(email)) WHERE ((member_id IS NULL) AND (email IS NOT NULL) AND (status <> 'cancelled'::text));


--
-- Name: uq_event_registration_active_member; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_event_registration_active_member ON public.event_registrations USING btree (event_id, member_id) WHERE ((member_id IS NOT NULL) AND (status <> 'cancelled'::text));


--
-- Name: uq_funds_one_default; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_funds_one_default ON public.funds USING btree (is_default) WHERE (is_default = true);


--
-- Name: uq_journal_one_reversal_per_entry; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_journal_one_reversal_per_entry ON public.journal_entries USING btree (reversal_of_entry_id) WHERE (reversal_of_entry_id IS NOT NULL);


--
-- Name: uq_member_transfers_one_pending_per_member; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_member_transfers_one_pending_per_member ON public.member_transfers USING btree (member_id) WHERE (status = 'pending'::text);


--
-- Name: uq_ministries_branch_name; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_ministries_branch_name ON public.ministries USING btree (branch_id, lower(name), entity_type) WHERE ((branch_id IS NOT NULL) AND (status = 'active'::text));


--
-- Name: uq_ministries_church_name; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_ministries_church_name ON public.ministries USING btree (lower(name), entity_type) WHERE ((branch_id IS NULL) AND (status = 'active'::text));


--
-- Name: uq_payment_gateway_idempotency; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_payment_gateway_idempotency ON public.payment_gateway_transactions USING btree (idempotency_key) WHERE (idempotency_key IS NOT NULL);


--
-- Name: uq_payment_gateway_provider_transaction; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_payment_gateway_provider_transaction ON public.payment_gateway_transactions USING btree (provider, provider_transaction_id) WHERE (provider_transaction_id IS NOT NULL);


--
-- Name: audit_logs trg_audit_logs_append_only; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_logs_append_only BEFORE DELETE OR UPDATE ON public.audit_logs FOR EACH ROW EXECUTE FUNCTION private.prevent_audit_log_mutation();


--
-- Name: budget_lines trg_budget_lines_draft_only; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_budget_lines_draft_only BEFORE INSERT OR DELETE OR UPDATE ON public.budget_lines FOR EACH ROW EXECUTE FUNCTION private.prevent_budget_line_mutation();


--
-- Name: journal_entries trg_journal_entry_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_journal_entry_immutable BEFORE DELETE OR UPDATE ON public.journal_entries FOR EACH ROW EXECUTE FUNCTION private.prevent_posted_journal_mutation();


--
-- Name: journal_lines trg_journal_lines_draft_only; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_journal_lines_draft_only BEFORE INSERT OR DELETE OR UPDATE ON public.journal_lines FOR EACH ROW EXECUTE FUNCTION private.prevent_posted_journal_mutation();


--
-- Name: profiles trg_normalize_profile_portal_state; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_normalize_profile_portal_state BEFORE UPDATE OF auth_user_id ON public.profiles FOR EACH ROW EXECUTE FUNCTION private.normalize_profile_portal_state();


--
-- Name: financial_documents trg_validate_financial_document_journal; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_validate_financial_document_journal BEFORE INSERT OR DELETE OR UPDATE ON public.financial_documents FOR EACH ROW EXECUTE FUNCTION private.validate_financial_document_journal_link();


--
-- Name: financial_periods trg_validate_financial_period; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_validate_financial_period BEFORE INSERT OR UPDATE OF financial_year_id, start_date, end_date ON public.financial_periods FOR EACH ROW EXECUTE FUNCTION private.validate_financial_period();


--
-- Name: welfare_assistance trg_welfare_assistance_financial_link; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_welfare_assistance_financial_link BEFORE INSERT OR UPDATE OF financial_document_id ON public.welfare_assistance FOR EACH ROW EXECUTE FUNCTION private.validate_welfare_financial_links();


--
-- Name: welfare_contributions trg_welfare_contributions_financial_link; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_welfare_contributions_financial_link BEFORE INSERT OR UPDATE OF financial_document_id ON public.welfare_contributions FOR EACH ROW EXECUTE FUNCTION private.validate_welfare_financial_links();


--
-- Name: payment_gateway_payloads payment_gateway_payloads_transaction_id_fkey; Type: FK CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.payment_gateway_payloads
    ADD CONSTRAINT payment_gateway_payloads_transaction_id_fkey FOREIGN KEY (transaction_id) REFERENCES public.payment_gateway_transactions(id) ON DELETE RESTRICT;


--
-- Name: stream_credentials stream_credentials_created_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.stream_credentials
    ADD CONSTRAINT stream_credentials_created_by_profile_id_fkey FOREIGN KEY (created_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: stream_credentials stream_credentials_stream_id_fkey; Type: FK CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.stream_credentials
    ADD CONSTRAINT stream_credentials_stream_id_fkey FOREIGN KEY (stream_id) REFERENCES public.streams(id) ON DELETE RESTRICT;


--
-- Name: approval_decisions approval_decisions_approval_request_step_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_decisions
    ADD CONSTRAINT approval_decisions_approval_request_step_id_fkey FOREIGN KEY (approval_request_step_id) REFERENCES public.approval_request_steps(id) ON DELETE RESTRICT;


--
-- Name: approval_decisions approval_decisions_approver_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_decisions
    ADD CONSTRAINT approval_decisions_approver_profile_id_fkey FOREIGN KEY (approver_profile_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;


--
-- Name: approval_policies approval_policies_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_policies
    ADD CONSTRAINT approval_policies_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.church_branches(id) ON DELETE RESTRICT;


--
-- Name: approval_policies approval_policies_created_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_policies
    ADD CONSTRAINT approval_policies_created_by_profile_id_fkey FOREIGN KEY (created_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: approval_policy_bands approval_policy_bands_policy_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_policy_bands
    ADD CONSTRAINT approval_policy_bands_policy_id_fkey FOREIGN KEY (policy_id) REFERENCES public.approval_policies(id) ON DELETE RESTRICT;


--
-- Name: approval_policy_steps approval_policy_steps_band_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_policy_steps
    ADD CONSTRAINT approval_policy_steps_band_id_fkey FOREIGN KEY (band_id) REFERENCES public.approval_policy_bands(id) ON DELETE RESTRICT;


--
-- Name: approval_policy_steps approval_policy_steps_required_permission_key_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_policy_steps
    ADD CONSTRAINT approval_policy_steps_required_permission_key_fkey FOREIGN KEY (required_permission_key) REFERENCES public.permissions(key) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: approval_request_steps approval_request_steps_approval_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_request_steps
    ADD CONSTRAINT approval_request_steps_approval_request_id_fkey FOREIGN KEY (approval_request_id) REFERENCES public.approval_requests(id) ON DELETE RESTRICT;


--
-- Name: approval_request_steps approval_request_steps_required_permission_key_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_request_steps
    ADD CONSTRAINT approval_request_steps_required_permission_key_fkey FOREIGN KEY (required_permission_key) REFERENCES public.permissions(key) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: approval_requests approval_requests_band_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_requests
    ADD CONSTRAINT approval_requests_band_id_fkey FOREIGN KEY (band_id) REFERENCES public.approval_policy_bands(id) ON DELETE RESTRICT;


--
-- Name: approval_requests approval_requests_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_requests
    ADD CONSTRAINT approval_requests_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.church_branches(id) ON DELETE RESTRICT;


--
-- Name: approval_requests approval_requests_policy_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_requests
    ADD CONSTRAINT approval_requests_policy_id_fkey FOREIGN KEY (policy_id) REFERENCES public.approval_policies(id) ON DELETE RESTRICT;


--
-- Name: approval_requests approval_requests_submitted_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_requests
    ADD CONSTRAINT approval_requests_submitted_by_profile_id_fkey FOREIGN KEY (submitted_by_profile_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;


--
-- Name: attendance_records attendance_records_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_records
    ADD CONSTRAINT attendance_records_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;


--
-- Name: attendance_records attendance_records_recorded_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_records
    ADD CONSTRAINT attendance_records_recorded_by_profile_id_fkey FOREIGN KEY (recorded_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: attendance_records attendance_records_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_records
    ADD CONSTRAINT attendance_records_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.attendance_sessions(id) ON DELETE RESTRICT;


--
-- Name: attendance_sessions attendance_sessions_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_sessions
    ADD CONSTRAINT attendance_sessions_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.church_branches(id) ON DELETE RESTRICT;


--
-- Name: attendance_sessions attendance_sessions_created_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_sessions
    ADD CONSTRAINT attendance_sessions_created_by_profile_id_fkey FOREIGN KEY (created_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: attendance_sessions attendance_sessions_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_sessions
    ADD CONSTRAINT attendance_sessions_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE RESTRICT;


--
-- Name: audit_logs audit_logs_actor_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_actor_profile_id_fkey FOREIGN KEY (actor_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: audit_logs audit_logs_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.church_branches(id) ON DELETE RESTRICT;


--
-- Name: budget_lines budget_lines_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.budget_lines
    ADD CONSTRAINT budget_lines_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.chart_of_accounts(id) ON DELETE RESTRICT;


--
-- Name: budget_lines budget_lines_budget_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.budget_lines
    ADD CONSTRAINT budget_lines_budget_id_fkey FOREIGN KEY (budget_id) REFERENCES public.budgets(id) ON DELETE RESTRICT;


--
-- Name: budget_lines budget_lines_fund_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.budget_lines
    ADD CONSTRAINT budget_lines_fund_id_fkey FOREIGN KEY (fund_id) REFERENCES public.funds(id) ON DELETE RESTRICT;


--
-- Name: budgets budgets_approval_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.budgets
    ADD CONSTRAINT budgets_approval_request_id_fkey FOREIGN KEY (approval_request_id) REFERENCES public.approval_requests(id) ON DELETE RESTRICT;


--
-- Name: budgets budgets_approved_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.budgets
    ADD CONSTRAINT budgets_approved_by_profile_id_fkey FOREIGN KEY (approved_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: budgets budgets_base_currency_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.budgets
    ADD CONSTRAINT budgets_base_currency_code_fkey FOREIGN KEY (base_currency_code) REFERENCES public.currencies(code);


--
-- Name: budgets budgets_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.budgets
    ADD CONSTRAINT budgets_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.church_branches(id) ON DELETE RESTRICT;


--
-- Name: budgets budgets_currency_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.budgets
    ADD CONSTRAINT budgets_currency_code_fkey FOREIGN KEY (currency_code) REFERENCES public.currencies(code);


--
-- Name: budgets budgets_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.budgets
    ADD CONSTRAINT budgets_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE RESTRICT;


--
-- Name: budgets budgets_period_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.budgets
    ADD CONSTRAINT budgets_period_id_fkey FOREIGN KEY (period_id) REFERENCES public.financial_periods(id) ON DELETE RESTRICT;


--
-- Name: budgets budgets_submitted_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.budgets
    ADD CONSTRAINT budgets_submitted_by_profile_id_fkey FOREIGN KEY (submitted_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: cells cells_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cells
    ADD CONSTRAINT cells_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.church_branches(id) ON DELETE RESTRICT;


--
-- Name: chart_of_accounts chart_of_accounts_parent_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chart_of_accounts
    ADD CONSTRAINT chart_of_accounts_parent_account_id_fkey FOREIGN KEY (parent_account_id) REFERENCES public.chart_of_accounts(id) ON DELETE RESTRICT;


--
-- Name: church_branches church_branches_district_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.church_branches
    ADD CONSTRAINT church_branches_district_id_fkey FOREIGN KEY (district_id) REFERENCES public.districts(id) ON DELETE SET NULL;


--
-- Name: church_resources church_resources_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.church_resources
    ADD CONSTRAINT church_resources_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.church_branches(id) ON DELETE RESTRICT;


--
-- Name: church_resources church_resources_created_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.church_resources
    ADD CONSTRAINT church_resources_created_by_profile_id_fkey FOREIGN KEY (created_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: church_settings church_settings_base_currency_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.church_settings
    ADD CONSTRAINT church_settings_base_currency_code_fkey FOREIGN KEY (base_currency_code) REFERENCES public.currencies(code) ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: event_registrations event_registrations_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_registrations
    ADD CONSTRAINT event_registrations_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE RESTRICT;


--
-- Name: event_registrations event_registrations_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_registrations
    ADD CONSTRAINT event_registrations_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;


--
-- Name: event_registrations event_registrations_registered_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_registrations
    ADD CONSTRAINT event_registrations_registered_by_profile_id_fkey FOREIGN KEY (registered_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: event_survey_questions event_survey_questions_survey_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_survey_questions
    ADD CONSTRAINT event_survey_questions_survey_id_fkey FOREIGN KEY (survey_id) REFERENCES public.event_surveys(id) ON DELETE RESTRICT;


--
-- Name: event_survey_responses event_survey_responses_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_survey_responses
    ADD CONSTRAINT event_survey_responses_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;


--
-- Name: event_survey_responses event_survey_responses_survey_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_survey_responses
    ADD CONSTRAINT event_survey_responses_survey_id_fkey FOREIGN KEY (survey_id) REFERENCES public.event_surveys(id) ON DELETE RESTRICT;


--
-- Name: event_surveys event_surveys_created_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_surveys
    ADD CONSTRAINT event_surveys_created_by_profile_id_fkey FOREIGN KEY (created_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: event_surveys event_surveys_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_surveys
    ADD CONSTRAINT event_surveys_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE RESTRICT;


--
-- Name: events events_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.church_branches(id) ON DELETE RESTRICT;


--
-- Name: events events_created_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_created_by_profile_id_fkey FOREIGN KEY (created_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: financial_accounts financial_accounts_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financial_accounts
    ADD CONSTRAINT financial_accounts_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.church_branches(id) ON DELETE RESTRICT;


--
-- Name: financial_accounts financial_accounts_chart_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financial_accounts
    ADD CONSTRAINT financial_accounts_chart_account_id_fkey FOREIGN KEY (chart_account_id) REFERENCES public.chart_of_accounts(id) ON DELETE RESTRICT;


--
-- Name: financial_accounts financial_accounts_currency_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financial_accounts
    ADD CONSTRAINT financial_accounts_currency_code_fkey FOREIGN KEY (currency_code) REFERENCES public.currencies(code) ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: financial_documents financial_documents_approval_request_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financial_documents
    ADD CONSTRAINT financial_documents_approval_request_fk FOREIGN KEY (approval_request_id) REFERENCES public.approval_requests(id) ON DELETE RESTRICT;


--
-- Name: financial_documents financial_documents_approved_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financial_documents
    ADD CONSTRAINT financial_documents_approved_by_profile_id_fkey FOREIGN KEY (approved_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: financial_documents financial_documents_base_currency_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financial_documents
    ADD CONSTRAINT financial_documents_base_currency_code_fkey FOREIGN KEY (base_currency_code) REFERENCES public.currencies(code);


--
-- Name: financial_documents financial_documents_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financial_documents
    ADD CONSTRAINT financial_documents_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.church_branches(id) ON DELETE RESTRICT;


--
-- Name: financial_documents financial_documents_created_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financial_documents
    ADD CONSTRAINT financial_documents_created_by_profile_id_fkey FOREIGN KEY (created_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: financial_documents financial_documents_currency_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financial_documents
    ADD CONSTRAINT financial_documents_currency_code_fkey FOREIGN KEY (currency_code) REFERENCES public.currencies(code);


--
-- Name: financial_documents financial_documents_financial_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financial_documents
    ADD CONSTRAINT financial_documents_financial_account_id_fkey FOREIGN KEY (financial_account_id) REFERENCES public.financial_accounts(id) ON DELETE RESTRICT;


--
-- Name: financial_documents financial_documents_journal_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financial_documents
    ADD CONSTRAINT financial_documents_journal_entry_id_fkey FOREIGN KEY (journal_entry_id) REFERENCES public.journal_entries(id) ON DELETE RESTRICT;


--
-- Name: financial_documents financial_documents_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financial_documents
    ADD CONSTRAINT financial_documents_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;


--
-- Name: financial_periods financial_periods_closed_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financial_periods
    ADD CONSTRAINT financial_periods_closed_by_profile_id_fkey FOREIGN KEY (closed_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: financial_periods financial_periods_financial_year_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financial_periods
    ADD CONSTRAINT financial_periods_financial_year_id_fkey FOREIGN KEY (financial_year_id) REFERENCES public.financial_years(id) ON DELETE RESTRICT;


--
-- Name: cell_members fk_cell_members_cell_same_branch; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cell_members
    ADD CONSTRAINT fk_cell_members_cell_same_branch FOREIGN KEY (cell_id, branch_id) REFERENCES public.cells(id, branch_id) ON DELETE RESTRICT;


--
-- Name: cell_members fk_cell_members_profile_same_branch; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cell_members
    ADD CONSTRAINT fk_cell_members_profile_same_branch FOREIGN KEY (member_id, branch_id) REFERENCES public.profiles(id, branch_id) ON DELETE RESTRICT;


--
-- Name: cells fk_cells_leader_same_branch; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cells
    ADD CONSTRAINT fk_cells_leader_same_branch FOREIGN KEY (leader_id, branch_id) REFERENCES public.profiles(id, branch_id) ON DELETE SET NULL (leader_id);


--
-- Name: event_survey_answers fk_survey_answer_question_same_survey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_survey_answers
    ADD CONSTRAINT fk_survey_answer_question_same_survey FOREIGN KEY (question_id, survey_id) REFERENCES public.event_survey_questions(id, survey_id) ON DELETE RESTRICT;


--
-- Name: event_survey_answers fk_survey_answer_response_same_survey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_survey_answers
    ADD CONSTRAINT fk_survey_answer_response_same_survey FOREIGN KEY (response_id, survey_id) REFERENCES public.event_survey_responses(id, survey_id) ON DELETE RESTRICT;


--
-- Name: giving_records giving_records_financial_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.giving_records
    ADD CONSTRAINT giving_records_financial_document_id_fkey FOREIGN KEY (financial_document_id) REFERENCES public.financial_documents(id) ON DELETE RESTRICT;


--
-- Name: giving_records giving_records_fund_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.giving_records
    ADD CONSTRAINT giving_records_fund_id_fkey FOREIGN KEY (fund_id) REFERENCES public.funds(id) ON DELETE RESTRICT;


--
-- Name: giving_records giving_records_giver_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.giving_records
    ADD CONSTRAINT giving_records_giver_profile_id_fkey FOREIGN KEY (giver_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: journal_entries journal_entries_approval_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_entries
    ADD CONSTRAINT journal_entries_approval_request_id_fkey FOREIGN KEY (approval_request_id) REFERENCES public.approval_requests(id) ON DELETE RESTRICT;


--
-- Name: journal_entries journal_entries_approved_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_entries
    ADD CONSTRAINT journal_entries_approved_by_profile_id_fkey FOREIGN KEY (approved_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: journal_entries journal_entries_base_currency_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_entries
    ADD CONSTRAINT journal_entries_base_currency_code_fkey FOREIGN KEY (base_currency_code) REFERENCES public.currencies(code);


--
-- Name: journal_entries journal_entries_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_entries
    ADD CONSTRAINT journal_entries_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.church_branches(id) ON DELETE RESTRICT;


--
-- Name: journal_entries journal_entries_created_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_entries
    ADD CONSTRAINT journal_entries_created_by_profile_id_fkey FOREIGN KEY (created_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: journal_entries journal_entries_currency_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_entries
    ADD CONSTRAINT journal_entries_currency_code_fkey FOREIGN KEY (currency_code) REFERENCES public.currencies(code);


--
-- Name: journal_entries journal_entries_period_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_entries
    ADD CONSTRAINT journal_entries_period_id_fkey FOREIGN KEY (period_id) REFERENCES public.financial_periods(id) ON DELETE RESTRICT;


--
-- Name: journal_entries journal_entries_reversal_of_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_entries
    ADD CONSTRAINT journal_entries_reversal_of_entry_id_fkey FOREIGN KEY (reversal_of_entry_id) REFERENCES public.journal_entries(id) ON DELETE RESTRICT;


--
-- Name: journal_lines journal_lines_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_lines
    ADD CONSTRAINT journal_lines_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.chart_of_accounts(id) ON DELETE RESTRICT;


--
-- Name: journal_lines journal_lines_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_lines
    ADD CONSTRAINT journal_lines_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.church_branches(id) ON DELETE RESTRICT;


--
-- Name: journal_lines journal_lines_fund_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_lines
    ADD CONSTRAINT journal_lines_fund_id_fkey FOREIGN KEY (fund_id) REFERENCES public.funds(id) ON DELETE RESTRICT;


--
-- Name: journal_lines journal_lines_journal_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_lines
    ADD CONSTRAINT journal_lines_journal_entry_id_fkey FOREIGN KEY (journal_entry_id) REFERENCES public.journal_entries(id) ON DELETE RESTRICT;


--
-- Name: journal_lines journal_lines_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_lines
    ADD CONSTRAINT journal_lines_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;


--
-- Name: member_transfers member_transfers_approved_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.member_transfers
    ADD CONSTRAINT member_transfers_approved_by_profile_id_fkey FOREIGN KEY (approved_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: member_transfers member_transfers_from_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.member_transfers
    ADD CONSTRAINT member_transfers_from_branch_id_fkey FOREIGN KEY (from_branch_id) REFERENCES public.church_branches(id) ON DELETE RESTRICT;


--
-- Name: member_transfers member_transfers_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.member_transfers
    ADD CONSTRAINT member_transfers_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;


--
-- Name: member_transfers member_transfers_requested_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.member_transfers
    ADD CONSTRAINT member_transfers_requested_by_profile_id_fkey FOREIGN KEY (requested_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: member_transfers member_transfers_to_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.member_transfers
    ADD CONSTRAINT member_transfers_to_branch_id_fkey FOREIGN KEY (to_branch_id) REFERENCES public.church_branches(id) ON DELETE RESTRICT;


--
-- Name: ministries ministries_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ministries
    ADD CONSTRAINT ministries_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.church_branches(id) ON DELETE RESTRICT;


--
-- Name: ministry_members ministry_members_created_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ministry_members
    ADD CONSTRAINT ministry_members_created_by_profile_id_fkey FOREIGN KEY (created_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: ministry_members ministry_members_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ministry_members
    ADD CONSTRAINT ministry_members_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;


--
-- Name: ministry_members ministry_members_ministry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ministry_members
    ADD CONSTRAINT ministry_members_ministry_id_fkey FOREIGN KEY (ministry_id) REFERENCES public.ministries(id) ON DELETE RESTRICT;


--
-- Name: notification_recipients notification_recipients_notification_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_recipients
    ADD CONSTRAINT notification_recipients_notification_id_fkey FOREIGN KEY (notification_id) REFERENCES public.notifications(id) ON DELETE RESTRICT;


--
-- Name: notification_recipients notification_recipients_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_recipients
    ADD CONSTRAINT notification_recipients_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;


--
-- Name: notifications notifications_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.church_branches(id) ON DELETE RESTRICT;


--
-- Name: notifications notifications_created_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_created_by_profile_id_fkey FOREIGN KEY (created_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: payment_gateway_transactions payment_gateway_transactions_currency_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_gateway_transactions
    ADD CONSTRAINT payment_gateway_transactions_currency_code_fkey FOREIGN KEY (currency_code) REFERENCES public.currencies(code);


--
-- Name: payment_gateway_transactions payment_gateway_transactions_financial_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_gateway_transactions
    ADD CONSTRAINT payment_gateway_transactions_financial_document_id_fkey FOREIGN KEY (financial_document_id) REFERENCES public.financial_documents(id) ON DELETE RESTRICT;


--
-- Name: profile_role_assignments profile_role_assignments_assigned_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profile_role_assignments
    ADD CONSTRAINT profile_role_assignments_assigned_by_profile_id_fkey FOREIGN KEY (assigned_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: profile_role_assignments profile_role_assignments_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profile_role_assignments
    ADD CONSTRAINT profile_role_assignments_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.church_branches(id) ON DELETE RESTRICT;


--
-- Name: profile_role_assignments profile_role_assignments_district_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profile_role_assignments
    ADD CONSTRAINT profile_role_assignments_district_id_fkey FOREIGN KEY (district_id) REFERENCES public.districts(id) ON DELETE RESTRICT;


--
-- Name: profile_role_assignments profile_role_assignments_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profile_role_assignments
    ADD CONSTRAINT profile_role_assignments_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;


--
-- Name: profile_role_assignments profile_role_assignments_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profile_role_assignments
    ADD CONSTRAINT profile_role_assignments_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id) ON DELETE RESTRICT;


--
-- Name: profiles profiles_auth_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_auth_user_id_fkey FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: profiles profiles_baptized_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_baptized_by_profile_id_fkey FOREIGN KEY (baptized_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: profiles profiles_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.church_branches(id) ON DELETE RESTRICT;


--
-- Name: role_permissions role_permissions_permission_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_permission_id_fkey FOREIGN KEY (permission_id) REFERENCES public.permissions(id) ON DELETE CASCADE;


--
-- Name: role_permissions role_permissions_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id) ON DELETE CASCADE;


--
-- Name: stream_chat_messages stream_chat_messages_sender_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stream_chat_messages
    ADD CONSTRAINT stream_chat_messages_sender_profile_id_fkey FOREIGN KEY (sender_profile_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;


--
-- Name: stream_chat_messages stream_chat_messages_stream_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stream_chat_messages
    ADD CONSTRAINT stream_chat_messages_stream_id_fkey FOREIGN KEY (stream_id) REFERENCES public.streams(id) ON DELETE RESTRICT;


--
-- Name: streams streams_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.streams
    ADD CONSTRAINT streams_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.church_branches(id) ON DELETE RESTRICT;


--
-- Name: streams streams_created_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.streams
    ADD CONSTRAINT streams_created_by_profile_id_fkey FOREIGN KEY (created_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: welfare_assistance welfare_assistance_approved_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.welfare_assistance
    ADD CONSTRAINT welfare_assistance_approved_by_profile_id_fkey FOREIGN KEY (approved_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: welfare_assistance welfare_assistance_case_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.welfare_assistance
    ADD CONSTRAINT welfare_assistance_case_id_fkey FOREIGN KEY (case_id) REFERENCES public.welfare_cases(id) ON DELETE RESTRICT;


--
-- Name: welfare_assistance welfare_assistance_financial_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.welfare_assistance
    ADD CONSTRAINT welfare_assistance_financial_document_id_fkey FOREIGN KEY (financial_document_id) REFERENCES public.financial_documents(id) ON DELETE RESTRICT;


--
-- Name: welfare_campaigns welfare_campaigns_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.welfare_campaigns
    ADD CONSTRAINT welfare_campaigns_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.church_branches(id) ON DELETE RESTRICT;


--
-- Name: welfare_campaigns welfare_campaigns_created_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.welfare_campaigns
    ADD CONSTRAINT welfare_campaigns_created_by_profile_id_fkey FOREIGN KEY (created_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: welfare_campaigns welfare_campaigns_currency_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.welfare_campaigns
    ADD CONSTRAINT welfare_campaigns_currency_code_fkey FOREIGN KEY (currency_code) REFERENCES public.currencies(code);


--
-- Name: welfare_cases welfare_case_member_branch_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.welfare_cases
    ADD CONSTRAINT welfare_case_member_branch_fk FOREIGN KEY (member_id, branch_id) REFERENCES public.profiles(id, branch_id) ON DELETE RESTRICT;


--
-- Name: welfare_cases welfare_cases_assigned_to_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.welfare_cases
    ADD CONSTRAINT welfare_cases_assigned_to_profile_id_fkey FOREIGN KEY (assigned_to_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: welfare_cases welfare_cases_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.welfare_cases
    ADD CONSTRAINT welfare_cases_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.church_branches(id) ON DELETE RESTRICT;


--
-- Name: welfare_cases welfare_cases_created_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.welfare_cases
    ADD CONSTRAINT welfare_cases_created_by_profile_id_fkey FOREIGN KEY (created_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: welfare_contributions welfare_contributions_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.welfare_contributions
    ADD CONSTRAINT welfare_contributions_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.welfare_campaigns(id) ON DELETE RESTRICT;


--
-- Name: welfare_contributions welfare_contributions_contributing_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.welfare_contributions
    ADD CONSTRAINT welfare_contributions_contributing_member_id_fkey FOREIGN KEY (contributing_member_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: welfare_contributions welfare_contributions_financial_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.welfare_contributions
    ADD CONSTRAINT welfare_contributions_financial_document_id_fkey FOREIGN KEY (financial_document_id) REFERENCES public.financial_documents(id) ON DELETE RESTRICT;


--
-- Name: payment_gateway_payloads; Type: ROW SECURITY; Schema: private; Owner: -
--

ALTER TABLE private.payment_gateway_payloads ENABLE ROW LEVEL SECURITY;

--
-- Name: payment_gateway_payloads payment_gateway_payloads_deny_all; Type: POLICY; Schema: private; Owner: -
--

CREATE POLICY payment_gateway_payloads_deny_all ON private.payment_gateway_payloads USING (false) WITH CHECK (false);


--
-- Name: stream_credentials; Type: ROW SECURITY; Schema: private; Owner: -
--

ALTER TABLE private.stream_credentials ENABLE ROW LEVEL SECURITY;

--
-- Name: stream_credentials stream_credentials_deny_all; Type: POLICY; Schema: private; Owner: -
--

CREATE POLICY stream_credentials_deny_all ON private.stream_credentials USING (false) WITH CHECK (false);


--
-- Name: approval_decisions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.approval_decisions ENABLE ROW LEVEL SECURITY;

--
-- Name: approval_decisions approval_decisions_parent_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY approval_decisions_parent_read ON public.approval_decisions FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.approval_request_steps s
  WHERE (s.id = approval_decisions.approval_request_step_id))));


--
-- Name: approval_policies; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.approval_policies ENABLE ROW LEVEL SECURITY;

--
-- Name: approval_policies approval_policies_finance_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY approval_policies_finance_read ON public.approval_policies FOR SELECT TO authenticated USING ((((branch_id IS NULL) AND private.has_permission('approve_finances'::text, NULL::uuid)) OR ((branch_id IS NOT NULL) AND private.has_permission('approve_finances'::text, branch_id)) OR ((branch_id IS NULL) AND private.has_permission('manage_finances'::text, NULL::uuid)) OR ((branch_id IS NOT NULL) AND private.has_permission('manage_finances'::text, branch_id))));


--
-- Name: approval_policy_bands; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.approval_policy_bands ENABLE ROW LEVEL SECURITY;

--
-- Name: approval_policy_bands approval_policy_bands_finance_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY approval_policy_bands_finance_read ON public.approval_policy_bands FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.approval_policies p
  WHERE (p.id = approval_policy_bands.policy_id))));


--
-- Name: approval_policy_steps; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.approval_policy_steps ENABLE ROW LEVEL SECURITY;

--
-- Name: approval_policy_steps approval_policy_steps_finance_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY approval_policy_steps_finance_read ON public.approval_policy_steps FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.approval_policy_bands b
     JOIN public.approval_policies p ON ((p.id = b.policy_id)))
  WHERE (b.id = approval_policy_steps.band_id))));


--
-- Name: approval_request_steps; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.approval_request_steps ENABLE ROW LEVEL SECURITY;

--
-- Name: approval_request_steps approval_request_steps_parent_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY approval_request_steps_parent_read ON public.approval_request_steps FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.approval_requests r
  WHERE (r.id = approval_request_steps.approval_request_id))));


--
-- Name: approval_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.approval_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: approval_requests approval_requests_submitter_or_approver_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY approval_requests_submitter_or_approver_read ON public.approval_requests FOR SELECT TO authenticated USING (((submitted_by_profile_id = private.current_profile_id()) OR ((branch_id IS NULL) AND (private.has_permission('approve_finances'::text, NULL::uuid) OR private.has_permission('manage_finances'::text, NULL::uuid))) OR ((branch_id IS NOT NULL) AND (private.has_permission('approve_finances'::text, branch_id) OR private.has_permission('manage_finances'::text, branch_id)))));


--
-- Name: attendance_records; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;

--
-- Name: attendance_records attendance_records_self_or_manager_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY attendance_records_self_or_manager_read ON public.attendance_records FOR SELECT TO authenticated USING (((member_id = private.current_profile_id()) OR (EXISTS ( SELECT 1
   FROM public.attendance_sessions s
  WHERE ((s.id = attendance_records.session_id) AND private.has_permission('view_attendance'::text, s.branch_id))))));


--
-- Name: attendance_sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.attendance_sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: attendance_sessions attendance_sessions_scoped_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY attendance_sessions_scoped_read ON public.attendance_sessions FOR SELECT TO authenticated USING (((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.auth_user_id = ( SELECT auth.uid() AS uid)) AND (p.branch_id = attendance_sessions.branch_id)))) OR private.can_access_branch(branch_id) OR private.has_permission('view_attendance'::text, branch_id)));


--
-- Name: audit_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_logs audit_logs_authorized_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY audit_logs_authorized_read ON public.audit_logs FOR SELECT TO authenticated USING ((((branch_id IS NULL) AND private.has_permission('view_audit_logs'::text, NULL::uuid)) OR ((branch_id IS NOT NULL) AND private.has_permission('view_audit_logs'::text, branch_id))));


--
-- Name: church_branches branches_authorized_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY branches_authorized_read ON public.church_branches FOR SELECT TO authenticated USING ((private.can_access_branch(id) OR private.has_permission('manage_branches'::text, NULL::uuid)));


--
-- Name: budget_lines; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.budget_lines ENABLE ROW LEVEL SECURITY;

--
-- Name: budget_lines budget_lines_finance_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY budget_lines_finance_read ON public.budget_lines FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.budgets b
  WHERE (b.id = budget_lines.budget_id))));


--
-- Name: budgets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;

--
-- Name: budgets budgets_finance_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY budgets_finance_read ON public.budgets FOR SELECT TO authenticated USING ((((branch_id IS NULL) AND private.has_permission('view_finances'::text, NULL::uuid)) OR ((branch_id IS NOT NULL) AND private.has_permission('view_finances'::text, branch_id))));


--
-- Name: cell_members; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cell_members ENABLE ROW LEVEL SECURITY;

--
-- Name: cell_members cell_members_scoped_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cell_members_scoped_read ON public.cell_members FOR SELECT TO authenticated USING ((private.can_access_branch(branch_id) OR private.has_permission('view_members'::text, branch_id) OR (member_id = private.current_profile_id())));


--
-- Name: cells; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cells ENABLE ROW LEVEL SECURITY;

--
-- Name: cells cells_scoped_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cells_scoped_read ON public.cells FOR SELECT TO authenticated USING ((private.can_access_branch(branch_id) OR private.has_permission('view_members'::text, branch_id)));


--
-- Name: chart_of_accounts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.chart_of_accounts ENABLE ROW LEVEL SECURITY;

--
-- Name: chart_of_accounts chart_of_accounts_finance_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY chart_of_accounts_finance_read ON public.chart_of_accounts FOR SELECT TO authenticated USING ((private.has_permission('view_finances'::text, NULL::uuid) OR (EXISTS ( SELECT 1
   FROM public.church_branches b
  WHERE private.has_permission('view_finances'::text, b.id)))));


--
-- Name: church_branches; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.church_branches ENABLE ROW LEVEL SECURITY;

--
-- Name: church_resources; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.church_resources ENABLE ROW LEVEL SECURITY;

--
-- Name: church_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.church_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: church_settings church_settings_authenticated_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY church_settings_authenticated_read ON public.church_settings FOR SELECT TO authenticated USING (true);


--
-- Name: currencies; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.currencies ENABLE ROW LEVEL SECURITY;

--
-- Name: currencies currencies_authenticated_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY currencies_authenticated_read ON public.currencies FOR SELECT TO authenticated USING (is_active);


--
-- Name: districts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.districts ENABLE ROW LEVEL SECURITY;

--
-- Name: districts districts_authorized_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY districts_authorized_read ON public.districts FOR SELECT TO authenticated USING (((EXISTS ( SELECT 1
   FROM public.church_branches b
  WHERE ((b.district_id = districts.id) AND private.can_access_branch(b.id)))) OR private.has_permission('manage_branches'::text, NULL::uuid)));


--
-- Name: event_registrations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.event_registrations ENABLE ROW LEVEL SECURITY;

--
-- Name: event_registrations event_registrations_insert_self; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY event_registrations_insert_self ON public.event_registrations FOR INSERT TO authenticated WITH CHECK (((member_id = private.current_profile_id()) AND (EXISTS ( SELECT 1
   FROM public.events e
  WHERE ((e.id = event_registrations.event_id) AND (e.status = 'upcoming'::text) AND ((e.branch_id IS NULL) OR (EXISTS ( SELECT 1
           FROM public.profiles p
          WHERE ((p.auth_user_id = ( SELECT auth.uid() AS uid)) AND (p.branch_id = e.branch_id)))) OR private.can_access_branch(e.branch_id) OR private.has_permission('register_for_events'::text, e.branch_id)))))));


--
-- Name: event_registrations event_registrations_read_own_or_manager; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY event_registrations_read_own_or_manager ON public.event_registrations FOR SELECT TO authenticated USING (((member_id = private.current_profile_id()) OR (EXISTS ( SELECT 1
   FROM public.events e
  WHERE ((e.id = event_registrations.event_id) AND private.has_permission('manage_events'::text, e.branch_id))))));


--
-- Name: event_survey_answers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.event_survey_answers ENABLE ROW LEVEL SECURITY;

--
-- Name: event_survey_answers event_survey_answers_self_or_manager_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY event_survey_answers_self_or_manager_read ON public.event_survey_answers FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.event_survey_responses r
  WHERE ((r.id = event_survey_answers.response_id) AND ((r.member_id = private.current_profile_id()) OR (EXISTS ( SELECT 1
           FROM (public.event_surveys s
             JOIN public.events e ON ((e.id = s.event_id)))
          WHERE ((s.id = r.survey_id) AND private.has_permission('manage_surveys'::text, e.branch_id)))))))));


--
-- Name: event_survey_questions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.event_survey_questions ENABLE ROW LEVEL SECURITY;

--
-- Name: event_survey_questions event_survey_questions_eligible_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY event_survey_questions_eligible_read ON public.event_survey_questions FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.event_surveys s
  WHERE (s.id = event_survey_questions.survey_id))));


--
-- Name: event_survey_responses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.event_survey_responses ENABLE ROW LEVEL SECURITY;

--
-- Name: event_survey_responses event_survey_responses_self_or_manager_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY event_survey_responses_self_or_manager_read ON public.event_survey_responses FOR SELECT TO authenticated USING (((member_id = private.current_profile_id()) OR (EXISTS ( SELECT 1
   FROM (public.event_surveys s
     JOIN public.events e ON ((e.id = s.event_id)))
  WHERE ((s.id = event_survey_responses.survey_id) AND private.has_permission('manage_surveys'::text, e.branch_id))))));


--
-- Name: event_surveys; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.event_surveys ENABLE ROW LEVEL SECURITY;

--
-- Name: event_surveys event_surveys_eligible_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY event_surveys_eligible_read ON public.event_surveys FOR SELECT TO authenticated USING ((private.has_permission('manage_surveys'::text, ( SELECT e.branch_id
   FROM public.events e
  WHERE (e.id = event_surveys.event_id))) OR ((status = 'active'::text) AND ((opens_at IS NULL) OR (opens_at <= now())) AND ((closes_at IS NULL) OR (closes_at > now())) AND (((respondent_scope = 'all_members'::text) AND (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = private.current_profile_id()) AND (p.membership_status = 'active'::text) AND (p.record_status = 'active'::text))))) OR ((respondent_scope = 'registrants'::text) AND (EXISTS ( SELECT 1
   FROM public.event_registrations er
  WHERE ((er.event_id = event_surveys.event_id) AND (er.member_id = private.current_profile_id()) AND (er.status = ANY (ARRAY['confirmed'::text, 'checked_in'::text, 'attended'::text])))))) OR ((respondent_scope = 'attendees'::text) AND (EXISTS ( SELECT 1
   FROM (public.attendance_records ar
     JOIN public.attendance_sessions ats ON ((ats.id = ar.session_id)))
  WHERE ((ats.event_id = event_surveys.event_id) AND (ar.member_id = private.current_profile_id()) AND (ar.attendance_status = ANY (ARRAY['present'::text, 'late'::text]))))))))));


--
-- Name: events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

--
-- Name: events events_authenticated_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY events_authenticated_read ON public.events FOR SELECT TO authenticated USING (((branch_id IS NULL) OR (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.auth_user_id = ( SELECT auth.uid() AS uid)) AND (p.branch_id = events.branch_id)))) OR private.can_access_branch(branch_id) OR private.has_permission('view_events'::text, branch_id)));


--
-- Name: financial_accounts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.financial_accounts ENABLE ROW LEVEL SECURITY;

--
-- Name: financial_accounts financial_accounts_finance_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY financial_accounts_finance_read ON public.financial_accounts FOR SELECT TO authenticated USING ((((branch_id IS NULL) AND private.has_permission('view_finances'::text, NULL::uuid)) OR ((branch_id IS NOT NULL) AND private.has_permission('view_finances'::text, branch_id))));


--
-- Name: financial_documents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.financial_documents ENABLE ROW LEVEL SECURITY;

--
-- Name: financial_documents financial_documents_finance_or_party_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY financial_documents_finance_or_party_read ON public.financial_documents FOR SELECT TO authenticated USING ((((branch_id IS NULL) AND private.has_permission('view_finances'::text, NULL::uuid)) OR ((branch_id IS NOT NULL) AND private.has_permission('view_finances'::text, branch_id)) OR (profile_id = private.current_profile_id())));


--
-- Name: financial_periods; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.financial_periods ENABLE ROW LEVEL SECURITY;

--
-- Name: financial_periods financial_periods_finance_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY financial_periods_finance_read ON public.financial_periods FOR SELECT TO authenticated USING ((private.has_permission('view_finances'::text, NULL::uuid) OR (EXISTS ( SELECT 1
   FROM public.church_branches b
  WHERE private.has_permission('view_finances'::text, b.id)))));


--
-- Name: financial_years; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.financial_years ENABLE ROW LEVEL SECURITY;

--
-- Name: financial_years financial_years_finance_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY financial_years_finance_read ON public.financial_years FOR SELECT TO authenticated USING ((private.has_permission('view_finances'::text, NULL::uuid) OR (EXISTS ( SELECT 1
   FROM public.church_branches b
  WHERE private.has_permission('view_finances'::text, b.id)))));


--
-- Name: funds; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.funds ENABLE ROW LEVEL SECURITY;

--
-- Name: funds funds_finance_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY funds_finance_read ON public.funds FOR SELECT TO authenticated USING ((private.has_permission('view_finances'::text, NULL::uuid) OR (EXISTS ( SELECT 1
   FROM public.church_branches b
  WHERE private.has_permission('view_finances'::text, b.id)))));


--
-- Name: giving_records; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.giving_records ENABLE ROW LEVEL SECURITY;

--
-- Name: giving_records giving_records_finance_or_giver_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY giving_records_finance_or_giver_read ON public.giving_records FOR SELECT TO authenticated USING (((giver_profile_id = private.current_profile_id()) OR (EXISTS ( SELECT 1
   FROM public.financial_documents fd
  WHERE ((fd.id = giving_records.financial_document_id) AND (((fd.branch_id IS NULL) AND private.has_permission('view_finances'::text, NULL::uuid)) OR ((fd.branch_id IS NOT NULL) AND private.has_permission('view_finances'::text, fd.branch_id))))))));


--
-- Name: journal_entries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;

--
-- Name: journal_entries journal_entries_finance_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY journal_entries_finance_read ON public.journal_entries FOR SELECT TO authenticated USING ((((branch_id IS NULL) AND private.has_permission('view_finances'::text, NULL::uuid)) OR ((branch_id IS NOT NULL) AND private.has_permission('view_finances'::text, branch_id))));


--
-- Name: journal_lines; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.journal_lines ENABLE ROW LEVEL SECURITY;

--
-- Name: journal_lines journal_lines_finance_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY journal_lines_finance_read ON public.journal_lines FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.journal_entries je
  WHERE (je.id = journal_lines.journal_entry_id))));


--
-- Name: member_transfers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.member_transfers ENABLE ROW LEVEL SECURITY;

--
-- Name: member_transfers member_transfers_scoped_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY member_transfers_scoped_read ON public.member_transfers FOR SELECT TO authenticated USING ((private.has_permission('view_members'::text, from_branch_id) OR private.has_permission('view_members'::text, to_branch_id) OR (member_id = private.current_profile_id())));


--
-- Name: ministries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ministries ENABLE ROW LEVEL SECURITY;

--
-- Name: ministries ministries_scoped_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ministries_scoped_read ON public.ministries FOR SELECT TO authenticated USING (((status = 'active'::text) AND ((branch_id IS NULL) OR private.can_access_branch(branch_id) OR private.has_permission('view_members'::text, branch_id))));


--
-- Name: ministry_members; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ministry_members ENABLE ROW LEVEL SECURITY;

--
-- Name: ministry_members ministry_members_scoped_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ministry_members_scoped_read ON public.ministry_members FOR SELECT TO authenticated USING (((EXISTS ( SELECT 1
   FROM public.ministries m
  WHERE ((m.id = ministry_members.ministry_id) AND ((m.branch_id IS NULL) OR private.can_access_branch(m.branch_id) OR private.has_permission('view_members'::text, m.branch_id))))) OR (member_id = private.current_profile_id())));


--
-- Name: notification_recipients; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notification_recipients ENABLE ROW LEVEL SECURITY;

--
-- Name: notification_recipients notification_recipients_self_mark_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notification_recipients_self_mark_read ON public.notification_recipients FOR UPDATE TO authenticated USING ((profile_id = private.current_profile_id())) WITH CHECK ((profile_id = private.current_profile_id()));


--
-- Name: notification_recipients notification_recipients_self_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notification_recipients_self_read ON public.notification_recipients FOR SELECT TO authenticated USING ((profile_id = private.current_profile_id()));


--
-- Name: notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications notifications_published_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notifications_published_read ON public.notifications FOR SELECT TO authenticated USING (((status = 'published'::text) AND ((branch_id IS NULL) OR (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.auth_user_id = ( SELECT auth.uid() AS uid)) AND (p.branch_id = notifications.branch_id)))) OR private.can_access_branch(branch_id))));


--
-- Name: payment_gateway_transactions payment_gateway_finance_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY payment_gateway_finance_read ON public.payment_gateway_transactions FOR SELECT TO authenticated USING (((EXISTS ( SELECT 1
   FROM public.financial_documents fd
  WHERE ((fd.id = payment_gateway_transactions.financial_document_id) AND (((fd.branch_id IS NULL) AND private.has_permission('view_finances'::text, NULL::uuid)) OR ((fd.branch_id IS NOT NULL) AND private.has_permission('view_finances'::text, fd.branch_id)))))) OR private.has_permission('view_finances'::text, NULL::uuid)));


--
-- Name: payment_gateway_transactions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.payment_gateway_transactions ENABLE ROW LEVEL SECURITY;

--
-- Name: permissions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;

--
-- Name: permissions permissions_authenticated_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY permissions_authenticated_read ON public.permissions FOR SELECT TO authenticated USING (true);


--
-- Name: profile_role_assignments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profile_role_assignments ENABLE ROW LEVEL SECURITY;

--
-- Name: profile_role_assignments profile_role_assignments_self_or_manager_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profile_role_assignments_self_or_manager_read ON public.profile_role_assignments FOR SELECT TO authenticated USING (((profile_id = private.current_profile_id()) OR ((scope_type = 'church'::text) AND private.has_permission('manage_roles'::text, NULL::uuid)) OR ((scope_type = 'branch'::text) AND private.has_permission('manage_roles'::text, branch_id)) OR ((scope_type = 'district'::text) AND (EXISTS ( SELECT 1
   FROM public.church_branches b
  WHERE ((b.district_id = profile_role_assignments.district_id) AND private.has_permission('manage_roles'::text, b.id)))))));


--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles profiles_scoped_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_scoped_read ON public.profiles FOR SELECT TO authenticated USING (((auth_user_id = ( SELECT auth.uid() AS uid)) OR private.has_permission('view_members'::text, branch_id)));


--
-- Name: profiles profiles_self_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_self_update ON public.profiles FOR UPDATE TO authenticated USING ((auth_user_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((auth_user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: church_resources public_resources_anon_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY public_resources_anon_read ON public.church_resources FOR SELECT TO anon USING (((visibility = 'public'::text) AND (status = 'published'::text) AND (branch_id IS NULL)));


--
-- Name: church_resources resources_authenticated_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY resources_authenticated_read ON public.church_resources FOR SELECT TO authenticated USING (((status = 'published'::text) AND ((visibility = 'public'::text) OR ((visibility = 'members_only'::text) AND (private.current_profile_id() IS NOT NULL)) OR ((visibility = 'staff_only'::text) AND private.has_permission('manage_resources'::text, branch_id))) AND ((branch_id IS NULL) OR (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.auth_user_id = ( SELECT auth.uid() AS uid)) AND (p.branch_id = church_resources.branch_id)))) OR private.can_access_branch(branch_id) OR private.has_permission('view_resources'::text, branch_id) OR private.has_permission('manage_resources'::text, branch_id))));


--
-- Name: role_permissions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

--
-- Name: role_permissions role_permissions_authenticated_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY role_permissions_authenticated_read ON public.role_permissions FOR SELECT TO authenticated USING (true);


--
-- Name: roles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;

--
-- Name: roles roles_authenticated_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY roles_authenticated_read ON public.roles FOR SELECT TO authenticated USING (is_active);


--
-- Name: stream_chat_messages stream_chat_insert_self; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY stream_chat_insert_self ON public.stream_chat_messages FOR INSERT TO authenticated WITH CHECK (((sender_profile_id = private.current_profile_id()) AND (EXISTS ( SELECT 1
   FROM public.streams s
  WHERE ((s.id = stream_chat_messages.stream_id) AND (s.status = 'live'::text) AND ((s.branch_id IS NULL) OR (EXISTS ( SELECT 1
           FROM public.profiles p
          WHERE ((p.auth_user_id = ( SELECT auth.uid() AS uid)) AND (p.branch_id = s.branch_id)))) OR private.can_access_branch(s.branch_id) OR private.has_permission('send_stream_chat'::text, s.branch_id)) AND ((s.visibility = 'public'::text) OR (private.current_profile_id() IS NOT NULL)))))));


--
-- Name: stream_chat_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.stream_chat_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: stream_chat_messages stream_chat_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY stream_chat_read ON public.stream_chat_messages FOR SELECT TO authenticated USING (((status = 'visible'::text) AND (EXISTS ( SELECT 1
   FROM public.streams s
  WHERE ((s.id = stream_chat_messages.stream_id) AND ((s.branch_id IS NULL) OR (EXISTS ( SELECT 1
           FROM public.profiles p
          WHERE ((p.auth_user_id = ( SELECT auth.uid() AS uid)) AND (p.branch_id = s.branch_id)))) OR private.can_access_branch(s.branch_id) OR private.has_permission('view_streams'::text, s.branch_id)) AND ((s.visibility = 'public'::text) OR (private.current_profile_id() IS NOT NULL)))))));


--
-- Name: streams; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.streams ENABLE ROW LEVEL SECURITY;

--
-- Name: streams streams_anon_public_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY streams_anon_public_read ON public.streams FOR SELECT TO anon USING (((visibility = 'public'::text) AND (status = ANY (ARRAY['scheduled'::text, 'live'::text, 'ended'::text]))));


--
-- Name: streams streams_authenticated_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY streams_authenticated_read ON public.streams FOR SELECT TO authenticated USING (((status = ANY (ARRAY['scheduled'::text, 'live'::text, 'ended'::text])) AND ((visibility = 'public'::text) OR (private.current_profile_id() IS NOT NULL)) AND ((branch_id IS NULL) OR (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.auth_user_id = ( SELECT auth.uid() AS uid)) AND (p.branch_id = streams.branch_id)))) OR private.can_access_branch(branch_id) OR private.has_permission('view_streams'::text, branch_id))));


--
-- Name: welfare_assistance; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.welfare_assistance ENABLE ROW LEVEL SECURITY;

--
-- Name: welfare_assistance welfare_assistance_member_or_manager_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY welfare_assistance_member_or_manager_read ON public.welfare_assistance FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.welfare_cases wc
  WHERE ((wc.id = welfare_assistance.case_id) AND ((wc.member_id = private.current_profile_id()) OR private.has_permission('manage_welfare'::text, wc.branch_id))))));


--
-- Name: welfare_campaigns; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.welfare_campaigns ENABLE ROW LEVEL SECURITY;

--
-- Name: welfare_campaigns welfare_campaigns_authenticated_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY welfare_campaigns_authenticated_read ON public.welfare_campaigns FOR SELECT TO authenticated USING (((status = 'active'::text) AND ((branch_id IS NULL) OR (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.auth_user_id = ( SELECT auth.uid() AS uid)) AND (p.branch_id = welfare_campaigns.branch_id)))) OR private.can_access_branch(branch_id) OR private.has_permission('manage_welfare'::text, branch_id))));


--
-- Name: welfare_cases; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.welfare_cases ENABLE ROW LEVEL SECURITY;

--
-- Name: welfare_cases welfare_cases_member_or_manager_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY welfare_cases_member_or_manager_read ON public.welfare_cases FOR SELECT TO authenticated USING (((member_id = private.current_profile_id()) OR private.has_permission('manage_welfare'::text, branch_id)));


--
-- Name: welfare_contributions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.welfare_contributions ENABLE ROW LEVEL SECURITY;

--
-- Name: welfare_contributions welfare_contributions_member_or_manager_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY welfare_contributions_member_or_manager_read ON public.welfare_contributions FOR SELECT TO authenticated USING (((contributing_member_id = private.current_profile_id()) OR (EXISTS ( SELECT 1
   FROM public.welfare_campaigns wc
  WHERE ((wc.id = welfare_contributions.campaign_id) AND private.has_permission('manage_welfare'::text, wc.branch_id)))) OR private.has_permission('view_finances'::text, NULL::uuid)));


--
-- PostgreSQL database dump complete
--

\unrestrict Gegzfwvkmf6xDw2lsnqWHpSkox7MGbKTEA9di8jqu2gFcKMF0Pb47zmLVqX1myV

