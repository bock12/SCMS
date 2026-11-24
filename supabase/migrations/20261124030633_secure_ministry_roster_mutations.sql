-- MEM-INT-004A: secure ministry roster mutations through a branch-scoped RPC.
-- Direct table writes remain unavailable to authenticated clients; this API is
-- the only browser-facing mutation path for ministry_members.

CREATE OR REPLACE FUNCTION private.manage_ministry_member(
  p_action text,
  p_ministry_id uuid DEFAULT NULL,
  p_assignment_id uuid DEFAULT NULL,
  p_member_id uuid DEFAULT NULL,
  p_role_title text DEFAULT NULL,
  p_duty text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_joined_at date DEFAULT NULL
)
RETURNS public.ministry_members
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_profile_id uuid;
  v_branch_id uuid;
  v_member_branch_id uuid;
  v_assignment public.ministry_members;
  v_result public.ministry_members;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'An authenticated session is required.' USING ERRCODE = '42501';
  END IF;
  v_actor_profile_id := private.current_profile_id();
  IF v_actor_profile_id IS NULL THEN
    RAISE EXCEPTION 'An active linked church profile is required.' USING ERRCODE = '42501';
  END IF;
  IF p_action NOT IN ('add', 'update', 'remove') THEN
    RAISE EXCEPTION 'Unsupported ministry roster operation.' USING ERRCODE = '22023';
  END IF;

  IF p_action = 'add' THEN
    IF p_ministry_id IS NULL OR p_member_id IS NULL THEN
      RAISE EXCEPTION 'A ministry and church member are required.' USING ERRCODE = '22023';
    END IF;
    SELECT m.branch_id INTO v_branch_id
    FROM public.ministries AS m
    WHERE m.id = p_ministry_id AND m.status = 'active'
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'The selected ministry is unavailable.' USING ERRCODE = '23503';
    END IF;
    SELECT p.branch_id INTO v_member_branch_id
    FROM public.profiles AS p
    WHERE p.id = p_member_id AND p.record_status = 'active'
    FOR KEY SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'The selected church member is unavailable.' USING ERRCODE = '23503';
    END IF;
    IF v_branch_id IS NOT NULL AND v_member_branch_id IS DISTINCT FROM v_branch_id THEN
      RAISE EXCEPTION 'A member can only join a ministry in their assigned branch.' USING ERRCODE = '42501';
    END IF;
  ELSE
    IF p_assignment_id IS NULL THEN
      RAISE EXCEPTION 'A ministry roster assignment is required.' USING ERRCODE = '22023';
    END IF;
    SELECT m.branch_id INTO v_branch_id
    FROM public.ministry_members AS mm
    JOIN public.ministries AS m ON m.id = mm.ministry_id
    WHERE mm.id = p_assignment_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'The ministry roster assignment could not be found.' USING ERRCODE = 'P0002';
    END IF;
    SELECT * INTO v_assignment
    FROM public.ministry_members
    WHERE id = p_assignment_id
    FOR UPDATE;
  END IF;

  IF NOT private.has_permission('manage_ministries', v_branch_id) THEN
    RAISE EXCEPTION 'You do not have permission to manage this ministry roster.' USING ERRCODE = '42501';
  END IF;

  IF p_action = 'add' THEN
    IF p_status IS NOT NULL AND p_status NOT IN ('active', 'on_leave', 'in_training', 'inactive') THEN
      RAISE EXCEPTION 'Invalid ministry membership status.' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.ministry_members (
      ministry_id, member_id, role_title, duty, status, joined_at, created_by_profile_id
    ) VALUES (
      p_ministry_id, p_member_id,
      COALESCE(NULLIF(pg_catalog.btrim(p_role_title), ''), 'Team Member'),
      NULLIF(pg_catalog.btrim(p_duty), ''),
      COALESCE(p_status, 'active'), COALESCE(p_joined_at, CURRENT_DATE), v_actor_profile_id
    ) RETURNING * INTO v_result;
    RETURN v_result;
  ELSIF p_action = 'update' THEN
    IF p_status IS NOT NULL AND p_status NOT IN ('active', 'on_leave', 'in_training', 'inactive') THEN
      RAISE EXCEPTION 'Invalid ministry membership status.' USING ERRCODE = '22023';
    END IF;
    UPDATE public.ministry_members
    SET role_title = COALESCE(NULLIF(pg_catalog.btrim(p_role_title), ''), role_title),
        duty = CASE WHEN p_duty IS NULL THEN duty ELSE NULLIF(pg_catalog.btrim(p_duty), '') END,
        status = COALESCE(p_status, status)
    WHERE id = p_assignment_id
    RETURNING * INTO v_result;
    RETURN v_result;
  ELSE
    DELETE FROM public.ministry_members WHERE id = p_assignment_id;
    RETURN NULL;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION private.manage_ministry_member(text, uuid, uuid, uuid, text, text, text, date) FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.manage_ministry_member(text, uuid, uuid, uuid, text, text, text, date) TO authenticated;

CREATE OR REPLACE FUNCTION public.manage_ministry_member(
  p_action text,
  p_ministry_id uuid DEFAULT NULL,
  p_assignment_id uuid DEFAULT NULL,
  p_member_id uuid DEFAULT NULL,
  p_role_title text DEFAULT NULL,
  p_duty text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_joined_at date DEFAULT NULL
)
RETURNS public.ministry_members
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT private.manage_ministry_member(
    p_action, p_ministry_id, p_assignment_id, p_member_id,
    p_role_title, p_duty, p_status, p_joined_at
  );
$$;

REVOKE ALL ON FUNCTION public.manage_ministry_member(text, uuid, uuid, uuid, text, text, text, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.manage_ministry_member(text, uuid, uuid, uuid, text, text, text, date) TO authenticated;
