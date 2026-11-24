-- End branch leadership appointments when a member transfers.
-- District appointments remain active for transfers within the same district.
CREATE OR REPLACE FUNCTION private.reconcile_leadership_appointments_after_member_transfer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_new_district_id uuid;
  v_actor_profile_id uuid;
BEGIN
  IF NEW.branch_id IS NOT DISTINCT FROM OLD.branch_id THEN
    RETURN NEW;
  END IF;

  SELECT b.district_id
  INTO v_new_district_id
  FROM public.church_branches b
  WHERE b.id = NEW.branch_id
    AND b.status = 'active';

  v_actor_profile_id := private.current_profile_id();

  UPDATE public.leadership_appointments a
  SET status = 'ended',
      ended_at = now(),
      ended_by_profile_id = v_actor_profile_id,
      end_reason = CASE
        WHEN a.scope_type = 'branch'
          THEN 'Automatically ended because the member transferred from the appointed branch.'
        ELSE 'Automatically ended because the member transferred outside the appointed district.'
      END,
      effective_to = GREATEST(current_date, a.effective_from),
      updated_at = now()
  WHERE a.profile_id = NEW.id
    AND a.status = 'active'
    AND (
      (a.scope_type = 'branch' AND a.branch_id IS DISTINCT FROM NEW.branch_id)
      OR (a.scope_type = 'district' AND a.district_id IS DISTINCT FROM v_new_district_id)
    );

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.reconcile_leadership_appointments_after_member_transfer()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS reconcile_leadership_appointments_after_member_transfer ON public.profiles;
CREATE TRIGGER reconcile_leadership_appointments_after_member_transfer
AFTER UPDATE OF branch_id ON public.profiles
FOR EACH ROW
WHEN (OLD.branch_id IS DISTINCT FROM NEW.branch_id)
EXECUTE FUNCTION private.reconcile_leadership_appointments_after_member_transfer();

-- Keep reads aligned with the existing branch-aware permission resolver.
DROP POLICY IF EXISTS leadership_appointments_scoped_read ON public.leadership_appointments;
CREATE POLICY leadership_appointments_scoped_read
ON public.leadership_appointments
FOR SELECT TO authenticated
USING (
  profile_id = private.current_profile_id()
  OR (
    scope_type = 'branch'
    AND (
      private.can_access_branch(branch_id)
      OR private.has_permission('view_members', branch_id)
      OR private.has_permission('manage_branches', branch_id)
    )
  )
  OR (
    scope_type = 'district'
    AND EXISTS (
      SELECT 1
      FROM public.church_branches b
      WHERE b.district_id = leadership_appointments.district_id
        AND (
          private.can_access_branch(b.id)
          OR private.has_permission('view_members', b.id)
          OR private.has_permission('manage_branches', b.id)
        )
    )
  )
);
