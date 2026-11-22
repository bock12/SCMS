-- FIN-ORG-002: return only the authenticated user's finance scopes.
-- Scope discovery is a convenience for the UI; all reads and writes remain
-- independently authorized by the scoped finance RPCs and RLS policies.

create or replace function public.get_my_finance_scopes()
returns table (
  scope_type text,
  scope_id uuid,
  scope_name text,
  district_id uuid,
  branch_id uuid
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_profile_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  v_profile_id := private.current_profile_id();
  if v_profile_id is null then
    raise exception 'No active member profile is linked to this account';
  end if;

  return query
  select 'church'::text, null::uuid, 'Church-wide'::text, null::uuid, null::uuid
  where
    private.has_permission('view_finances', null)
    or private.has_permission('manage_finances', null)
    or private.has_permission('approve_finances', null)

  union all

  select 'district'::text, d.id, d.name, d.id, null::uuid
  from public.districts d
  where d.status = 'active'
    and (
      private.has_permission_for_district('view_finances', d.id)
      or private.has_permission_for_district('manage_finances', d.id)
      or private.has_permission_for_district('approve_finances', d.id)
    )

  union all

  select 'branch'::text, b.id, b.name, b.district_id, b.id
  from public.church_branches b
  where b.status = 'active'
    and (
      private.has_permission('view_finances', b.id)
      or private.has_permission('manage_finances', b.id)
      or private.has_permission('approve_finances', b.id)
    )

  order by 1, 3;
end;
$function$;

revoke all on function public.get_my_finance_scopes() from public, anon, service_role;
grant execute on function public.get_my_finance_scopes() to authenticated;

comment on function public.get_my_finance_scopes() is
  'Lists church, district and branch finance scopes authorized for the current authenticated profile. Selection is not an authorization boundary; scoped APIs re-check permissions.';
