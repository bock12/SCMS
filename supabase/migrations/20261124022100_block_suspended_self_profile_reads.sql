-- Suspended and invited identities must not retain even self-service
-- profile reads. Active members may read their own profile through the
-- canonical current-profile resolver; managers retain scoped directory reads.

DROP POLICY IF EXISTS profiles_scoped_read ON public.profiles;
CREATE POLICY profiles_scoped_read
ON public.profiles
FOR SELECT
TO authenticated
USING (
  id = private.current_profile_id()
  OR private.has_permission('view_members', branch_id)
  OR private.has_permission('manage_members', branch_id)
);
