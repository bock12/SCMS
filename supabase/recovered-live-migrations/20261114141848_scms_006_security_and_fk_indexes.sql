
begin;

-- The existing Supabase RLS event-trigger function must not be callable
-- through the public Data API. Revoking EXECUTE does not remove its event
-- trigger attachment or stop PostgreSQL from invoking it for DDL events.
revoke execute on function public.rls_auto_enable()
  from public, anon, authenticated;

-- Cover foreign-key lookup paths reported by the Supabase performance advisor.
create index if not exists ix_church_settings_base_currency
  on public.church_settings (base_currency_code);

create index if not exists ix_profiles_baptized_by_profile
  on public.profiles (baptized_by_profile_id)
  where baptized_by_profile_id is not null;

create index if not exists ix_member_transfers_from_branch
  on public.member_transfers (from_branch_id)
  where from_branch_id is not null;
create index if not exists ix_member_transfers_to_branch
  on public.member_transfers (to_branch_id);
create index if not exists ix_member_transfers_requested_by
  on public.member_transfers (requested_by_profile_id)
  where requested_by_profile_id is not null;
create index if not exists ix_member_transfers_approved_by
  on public.member_transfers (approved_by_profile_id)
  where approved_by_profile_id is not null;

create index if not exists ix_profile_role_assignments_role
  on public.profile_role_assignments (role_id);
create index if not exists ix_profile_role_assignments_assigned_by
  on public.profile_role_assignments (assigned_by_profile_id)
  where assigned_by_profile_id is not null;

create index if not exists ix_role_permissions_permission
  on public.role_permissions (permission_id);

create index if not exists ix_ministry_members_created_by
  on public.ministry_members (created_by_profile_id)
  where created_by_profile_id is not null;

create index if not exists ix_cells_leader_branch
  on public.cells (leader_id, branch_id)
  where leader_id is not null;

create index if not exists ix_cell_members_cell_branch
  on public.cell_members (cell_id, branch_id);

commit;