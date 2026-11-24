-- MEM-INT-004A follow-up: retain cell membership history across branch transfers.
-- Historical cell memberships keep their original branch_id; only active
-- memberships must match the member's current branch.
ALTER TABLE public.cell_members
  DROP CONSTRAINT IF EXISTS fk_cell_members_profile_same_branch;

ALTER TABLE public.cell_members
  ADD CONSTRAINT fk_cell_members_profile
  FOREIGN KEY (member_id)
  REFERENCES public.profiles (id)
  ON DELETE RESTRICT;

CREATE OR REPLACE FUNCTION private.enforce_active_cell_member_branch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_member_branch_id uuid;
  v_record_status text;
BEGIN
  IF NEW.status = 'active' THEN
    SELECT p.branch_id, p.record_status
    INTO v_member_branch_id, v_record_status
    FROM public.profiles AS p
    WHERE p.id = NEW.member_id;

    IF NOT FOUND
      OR v_record_status IS DISTINCT FROM 'active'
      OR v_member_branch_id IS DISTINCT FROM NEW.branch_id THEN
      RAISE EXCEPTION 'An active cell membership must match the active member profile branch.'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.enforce_active_cell_member_branch() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS enforce_active_cell_member_branch ON public.cell_members;
CREATE TRIGGER enforce_active_cell_member_branch
BEFORE INSERT OR UPDATE OF member_id, branch_id, status
ON public.cell_members
FOR EACH ROW
EXECUTE FUNCTION private.enforce_active_cell_member_branch();

CREATE OR REPLACE FUNCTION private.manage_member_transfer(
  p_action text,
  p_transfer_id uuid DEFAULT NULL::uuid,
  p_member_id uuid DEFAULT NULL::uuid,
  p_to_branch_id uuid DEFAULT NULL::uuid,
  p_notes text DEFAULT NULL::text
)
RETURNS public.member_transfers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor_profile_id uuid;
  v_transfer public.member_transfers;
  v_member public.profiles;
  v_result public.member_transfers;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'An authenticated session is required.' USING ERRCODE = '42501';
  END IF;
  v_actor_profile_id := private.current_profile_id();
  IF v_actor_profile_id IS NULL THEN
    RAISE EXCEPTION 'An active linked church profile is required.' USING ERRCODE = '42501';
  END IF;
  IF p_action NOT IN ('request', 'approve', 'reject', 'cancel') THEN
    RAISE EXCEPTION 'Unsupported member transfer operation.' USING ERRCODE = '22023';
  END IF;

  IF p_action = 'request' THEN
    IF p_to_branch_id IS NULL THEN
      RAISE EXCEPTION 'A destination branch is required.' USING ERRCODE = '22023';
    END IF;
    SELECT * INTO v_member
    FROM public.profiles
    WHERE id = COALESCE(p_member_id, v_actor_profile_id)
      AND record_status = 'active'
      AND membership_status = 'active'
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'The selected active church member could not be found.' USING ERRCODE = '23503';
    END IF;
    IF v_member.branch_id IS NOT DISTINCT FROM p_to_branch_id THEN
      RAISE EXCEPTION 'The member is already assigned to the selected branch.' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.church_branches AS b
      WHERE b.id = p_to_branch_id AND b.status = 'active'
    ) THEN
      RAISE EXCEPTION 'The destination branch is unavailable.' USING ERRCODE = '23503';
    END IF;
    IF v_member.id <> v_actor_profile_id
      AND (
        NOT private.has_permission('manage_member_transfers', v_member.branch_id)
        OR NOT private.has_permission('manage_member_transfers', p_to_branch_id)
      ) THEN
      RAISE EXCEPTION 'You do not have permission to request a transfer for this member.' USING ERRCODE = '42501';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.member_transfers AS t
      WHERE t.member_id = v_member.id AND t.status = 'pending'
    ) THEN
      RAISE EXCEPTION 'This member already has a pending transfer request.' USING ERRCODE = '23505';
    END IF;
    INSERT INTO public.member_transfers (
      member_id, from_branch_id, to_branch_id, status, requested_by_profile_id, notes
    ) VALUES (
      v_member.id, v_member.branch_id, p_to_branch_id, 'pending', v_actor_profile_id,
      NULLIF(pg_catalog.btrim(p_notes), '')
    ) RETURNING * INTO v_result;
    RETURN v_result;
  END IF;

  IF p_transfer_id IS NULL THEN
    RAISE EXCEPTION 'A member transfer request is required.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_transfer
  FROM public.member_transfers
  WHERE id = p_transfer_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The member transfer request could not be found.' USING ERRCODE = 'P0002';
  END IF;
  IF v_transfer.status <> 'pending' THEN
    RAISE EXCEPTION 'Only pending transfer requests can be changed.' USING ERRCODE = '22023';
  END IF;

  IF p_action = 'cancel' THEN
    IF v_transfer.requested_by_profile_id <> v_actor_profile_id
      AND NOT private.has_permission('manage_member_transfers', v_transfer.from_branch_id) THEN
      RAISE EXCEPTION 'You do not have permission to cancel this transfer request.' USING ERRCODE = '42501';
    END IF;
    UPDATE public.member_transfers
    SET status = 'cancelled'
    WHERE id = p_transfer_id
    RETURNING * INTO v_result;
    RETURN v_result;
  END IF;

  IF NOT private.has_permission('manage_member_transfers', v_transfer.from_branch_id)
    OR NOT private.has_permission('manage_member_transfers', v_transfer.to_branch_id) THEN
    RAISE EXCEPTION 'Transfer review requires permission in both the source and destination branches.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_member
  FROM public.profiles
  WHERE id = v_transfer.member_id
  FOR UPDATE;
  IF NOT FOUND OR v_member.branch_id IS DISTINCT FROM v_transfer.from_branch_id THEN
    RAISE EXCEPTION 'The member branch no longer matches this transfer request.' USING ERRCODE = '23514';
  END IF;

  IF p_action = 'approve' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.church_branches AS b
      WHERE b.id = v_transfer.to_branch_id AND b.status = 'active'
    ) THEN
      RAISE EXCEPTION 'The destination branch is no longer active.' USING ERRCODE = '23503';
    END IF;

    -- Release previous branch cell leadership/membership before moving branch_id so composite FKs stay consistent.
    IF v_transfer.from_branch_id IS NOT NULL THEN
      UPDATE public.cells
      SET leader_id = NULL, updated_at = now()
      WHERE branch_id = v_transfer.from_branch_id
        AND leader_id = v_transfer.member_id;

      -- Preserve the source cell assignment as transfer history. The status
      -- prevents it from remaining an active roster entry after branch reassignment.
      UPDATE public.cell_members
      SET status = 'transferred'
      WHERE member_id = v_transfer.member_id
        AND branch_id = v_transfer.from_branch_id
        AND status = 'active';

      -- Deactivate source-branch ministry participation while preserving roster history and church-wide teams (branch_id IS NULL).
      UPDATE public.ministry_members AS mm
      SET status = 'inactive'
      FROM public.ministries AS m
      WHERE m.id = mm.ministry_id
        AND mm.member_id = v_transfer.member_id
        AND m.branch_id = v_transfer.from_branch_id
        AND mm.status IS DISTINCT FROM 'inactive';
    END IF;

    UPDATE public.profiles
    SET branch_id = v_transfer.to_branch_id,
        updated_at = now()
    WHERE id = v_transfer.member_id;

    UPDATE public.member_transfers
    SET status = 'approved',
        approved_by_profile_id = v_actor_profile_id,
        approved_at = now()
    WHERE id = p_transfer_id
    RETURNING * INTO v_result;
    RETURN v_result;
  ELSE
    UPDATE public.member_transfers
    SET status = 'rejected',
        approved_by_profile_id = v_actor_profile_id,
        approved_at = now()
    WHERE id = p_transfer_id
    RETURNING * INTO v_result;
    RETURN v_result;
  END IF;
END;
$function$;
