-- MEM-INT-003: allow Member Directory managers to read the canonical member
-- projection and role labels within their trusted branch/district scope.

DROP POLICY IF EXISTS profiles_scoped_read ON public.profiles;
CREATE POLICY profiles_scoped_read
ON public.profiles
FOR SELECT
TO authenticated
USING (
  auth_user_id = (SELECT auth.uid())
  OR private.has_permission('view_members', branch_id)
  OR private.has_permission('manage_members', branch_id)
);

DROP POLICY IF EXISTS profile_role_assignments_self_or_manager_read ON public.profile_role_assignments;
CREATE POLICY profile_role_assignments_self_or_manager_read
ON public.profile_role_assignments
FOR SELECT
TO authenticated
USING (
  profile_id = private.current_profile_id()
  OR EXISTS (
    SELECT 1
    FROM public.profiles AS member_profile
    WHERE member_profile.id = profile_role_assignments.profile_id
      AND (
        private.has_permission('view_members', member_profile.branch_id)
        OR private.has_permission('manage_members', member_profile.branch_id)
      )
  )
  OR (
    scope_type = 'church'
    AND private.has_permission('manage_roles', NULL)
  )
  OR (
    scope_type = 'branch'
    AND private.has_permission('manage_roles', branch_id)
  )
  OR (
    scope_type = 'district'
    AND EXISTS (
      SELECT 1
      FROM public.church_branches AS branch
      WHERE branch.district_id = profile_role_assignments.district_id
        AND private.has_permission('manage_roles', branch.id)
    )
  )
);
