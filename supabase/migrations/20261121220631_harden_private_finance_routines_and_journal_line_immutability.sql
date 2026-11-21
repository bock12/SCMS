begin;

-- Protect posted journal lines on both sides of an UPDATE. Checking only the
-- destination journal would allow a line to be moved out of a posted journal.
create or replace function private.prevent_posted_journal_mutation()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  v_old_status text;
  v_new_status text;
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
    select status into v_old_status
    from public.journal_entries
    where id = old.journal_entry_id;

    if v_old_status is distinct from 'draft' then
      raise exception 'Journal lines can only be changed while the entry is draft';
    end if;
    return old;
  elsif tg_op = 'UPDATE' then
    select status into v_old_status
    from public.journal_entries
    where id = old.journal_entry_id;

    if v_old_status is distinct from 'draft' then
      raise exception 'Journal lines cannot be moved from a non-draft journal entry';
    end if;

    select status into v_new_status
    from public.journal_entries
    where id = new.journal_entry_id;

    if v_new_status is distinct from 'draft' then
      raise exception 'Journal lines can only be changed while the entry is draft';
    end if;
    return new;
  else
    select status into v_new_status
    from public.journal_entries
    where id = new.journal_entry_id;

    if v_new_status is distinct from 'draft' then
      raise exception 'Journal lines can only be changed while the entry is draft';
    end if;
    return new;
  end if;
end;
$function$;

-- These routines are implementation helpers invoked by owner-executed
-- SECURITY DEFINER RPCs or by triggers; clients should not execute them.
revoke all on function private.attach_journal_to_financial_document(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.post_journal_entry(uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.record_approval_decision(uuid, text, text)
  from public, anon, authenticated, service_role;
revoke all on function private.submit_financial_document_for_approval(uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.prevent_posted_journal_mutation()
  from public, anon, authenticated, service_role;

commit;
