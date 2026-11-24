-- MEM-INT-004A follow-up: preserve role assignment expiry and reject reactivation
-- against archived members or inactive organizational scopes.
CREATE OR REPLACE FUNCTION public.reactivate_profile_role_assignment(
  p_assignment_id uuid
)
RETURNS public.profile_role_assignments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_profile_id uuid;
  v_assignment public.profile_role_assignments;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Authentication is required.' USING ERRCODE = '42501';
  END IF;

  v_actor_profile_id := private.current_profile_id();
  IF v_actor_profile_id IS NULL THEN
    RAISE EXCEPTION 'An active linked church profile is required.' USING ERRCODE = '42501';
  END IF;

  SELECT a.*
  INTO v_assignment
  FROM public.profile_role_assignments AS a
  WHERE a.id = p_assignment_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'The selected role assignment does not exist.' USING ERRCODE = '23503';
  END IF;

  IF v_assignment.scope_type = 'church'
    AND NOT private.has_permission('manage_roles', NULL) THEN
    RAISE EXCEPTION 'You do not have permission to manage church-wide roles.' USING ERRCODE = '42501';
  ELSIF v_assignment.scope_type = 'branch'
    AND NOT private.has_permission('manage_roles', v_assignment.branch_id) THEN
    RAISE EXCEPTION 'You do not have permission to manage roles for this branch.' USING ERRCODE = '42501';
  ELSIF v_assignment.scope_type = 'district'
    AND NOT private.has_district_permission('manage_roles', v_assignment.district_id) THEN
    RAISE EXCEPTION 'You do not have permission to manage roles for this district.' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles AS p
    WHERE p.id = v_assignment.profile_id
      AND p.record_status = 'active'
  ) THEN
    RAISE EXCEPTION 'The assigned member profile is no longer active.' USING ERRCODE = '23503';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.roles AS r
    WHERE r.id = v_assignment.role_id
      AND r.is_active
  ) THEN
    RAISE EXCEPTION 'The assigned role is no longer active.' USING ERRCODE = '23503';
  END IF;

  IF v_assignment.scope_type = 'branch'
    AND NOT EXISTS (
      SELECT 1
      FROM public.church_branches AS b
      WHERE b.id = v_assignment.branch_id
        AND b.status = 'active'
    ) THEN
    RAISE EXCEPTION 'The assigned branch is no longer active. Create a new assignment after the branch is restored.' USING ERRCODE = '23503';
  END IF;

  IF v_assignment.scope_type = 'district'
    AND NOT EXISTS (
      SELECT 1
      FROM public.districts AS d
      WHERE d.id = v_assignment.district_id
        AND d.status = 'active'
    ) THEN
    RAISE EXCEPTION 'The assigned district is no longer active. Create a new assignment after the district is restored.' USING ERRCODE = '23503';
  END IF;

  IF v_assignment.expires_at IS NOT NULL AND v_assignment.expires_at <= now() THEN
    RAISE EXCEPTION 'This role assignment has expired. Create a new assignment with an explicit expiry date.' USING ERRCODE = '22023';
  END IF;

  IF NOT private.can_manage_target_role(v_assignment.role_id) THEN
    RAISE EXCEPTION 'Only church-wide administrators may reactivate Super Admin, Admin, or District Admin roles.'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.profile_role_assignments
  SET
    is_active = true,
    assigned_at = LEAST(assigned_at, now()),
    assigned_by_profile_id = v_actor_profile_id
  WHERE id = p_assignment_id
  RETURNING * INTO v_assignment;

  RETURN v_assignment;
END;
$$;

REVOKE ALL ON FUNCTION public.reactivate_profile_role_assignment(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reactivate_profile_role_assignment(uuid) TO authenticated;
