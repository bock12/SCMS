-- Manager-initiated transfers require transfer scope in both source and destination branches.
CREATE OR REPLACE FUNCTION private.manage_member_transfer(p_action text, p_transfer_id uuid DEFAULT NULL::uuid, p_member_id uuid DEFAULT NULL::uuid, p_to_branch_id uuid DEFAULT NULL::uuid, p_notes text DEFAULT NULL::text)
 RETURNS member_transfers
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_actor_profile_id uuid;
  v_transfer public.member_transfers;
  v_member public.profiles;
  v_result public.member_transfers;
BEGIN
  IF auth.uid() IS NULL THEN
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
      SELECT 1 FROM public.church_branches b
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
      SELECT 1 FROM public.member_transfers t
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
$function$
;
