-- Keep the transfer manager's member directory least-privilege. Row-level
-- policies do not restrict columns, so expose only the fields needed by the UI
-- through a narrowly shaped SECURITY DEFINER directory RPC.
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

DROP POLICY IF EXISTS branches_authorized_read ON public.church_branches;
CREATE POLICY branches_authorized_read
ON public.church_branches
FOR SELECT
TO authenticated
USING (
  private.can_access_branch(id)
  OR private.has_permission('manage_branches', NULL)
);

CREATE OR REPLACE FUNCTION private.get_member_transfer_directory()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid;
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501';
  END IF;
  v_actor_id := private.current_profile_id();
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'An active linked church profile is required.' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'members',
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', p.id, 'first_name', p.first_name, 'last_name', p.last_name,
        'branch_id', p.branch_id, 'membership_status', p.membership_status
      ) ORDER BY p.first_name, p.last_name)
      FROM public.profiles p
      WHERE p.record_status='active' AND p.membership_status='active'
        AND p.branch_id IS NOT NULL
        AND private.has_permission('manage_member_transfers', p.branch_id)
    ), '[]'::jsonb),
    'branches',
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', b.id, 'name', b.name, 'district_id', b.district_id, 'status', b.status
      ) ORDER BY b.name)
      FROM public.church_branches b
      WHERE b.status='active'
        AND private.has_permission('manage_member_transfers', b.id)
    ), '[]'::jsonb)
  ) INTO v_result;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_member_transfer_directory()
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT private.get_member_transfer_directory();
$$;

REVOKE ALL ON FUNCTION private.get_member_transfer_directory() FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.get_member_transfer_directory() TO authenticated;
REVOKE ALL ON FUNCTION public.get_member_transfer_directory() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_member_transfer_directory() TO authenticated;
