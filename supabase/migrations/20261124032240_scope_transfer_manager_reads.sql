-- Transfer managers need narrowly scoped member and branch reads to prepare/review
-- transfers without granting the broader view_members/manage_members permissions.
DROP POLICY IF EXISTS profiles_scoped_read ON public.profiles;
CREATE POLICY profiles_scoped_read
ON public.profiles
FOR SELECT
TO authenticated
USING (
  id = private.current_profile_id()
  OR private.has_permission('view_members', branch_id)
  OR private.has_permission('manage_members', branch_id)
  OR private.has_permission('manage_member_transfers', branch_id)
);

DROP POLICY IF EXISTS branches_authorized_read ON public.church_branches;
CREATE POLICY branches_authorized_read
ON public.church_branches
FOR SELECT
TO authenticated
USING (
  private.can_access_branch(id)
  OR private.has_permission('manage_branches', NULL)
  OR private.has_permission('manage_member_transfers', id)
);

DROP POLICY IF EXISTS member_transfers_scoped_read ON public.member_transfers;
CREATE POLICY member_transfers_scoped_read
ON public.member_transfers
FOR SELECT
TO authenticated
USING (
  private.has_permission('view_members', from_branch_id)
  OR private.has_permission('view_members', to_branch_id)
  OR private.has_permission('manage_member_transfers', from_branch_id)
  OR private.has_permission('manage_member_transfers', to_branch_id)
  OR member_id = private.current_profile_id()
);
