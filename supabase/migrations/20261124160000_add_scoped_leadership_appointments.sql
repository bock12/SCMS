-- MEM-INT-004A: keep organizational leadership appointments separate from RBAC.
-- Appointments describe who serves in a branch/district leadership capacity.
-- They do not create or modify profile_role_assignments and grant no permissions.

CREATE TABLE public.leadership_appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  scope_type text NOT NULL CHECK (scope_type IN ('branch', 'district')),
  branch_id uuid REFERENCES public.church_branches(id) ON DELETE RESTRICT,
  district_id uuid REFERENCES public.districts(id) ON DELETE RESTRICT,
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 2 AND 100),
  responsibilities text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ended')),
  appointed_by_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  appointed_at timestamptz NOT NULL DEFAULT now(),
  effective_from date NOT NULL DEFAULT current_date,
  effective_to date,
  ended_by_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ended_at timestamptz,
  end_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT leadership_appointments_scope_shape CHECK (
    (scope_type = 'branch' AND branch_id IS NOT NULL AND district_id IS NULL)
    OR (scope_type = 'district' AND district_id IS NOT NULL AND branch_id IS NULL)
  ),
  CONSTRAINT leadership_appointments_effective_dates CHECK (
    effective_to IS NULL OR effective_to >= effective_from
  ),
  CONSTRAINT leadership_appointments_end_state CHECK (
    (status = 'active' AND ended_at IS NULL AND ended_by_profile_id IS NULL)
    OR (status = 'ended' AND ended_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX uq_leadership_appointments_active_title_scope
  ON public.leadership_appointments (
    profile_id,
    scope_type,
    COALESCE(branch_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(district_id, '00000000-0000-0000-0000-000000000000'::uuid),
    lower(title)
  )
  WHERE status = 'active';

CREATE INDEX ix_leadership_appointments_branch_active
  ON public.leadership_appointments (branch_id, status)
  WHERE branch_id IS NOT NULL;
CREATE INDEX ix_leadership_appointments_district_active
  ON public.leadership_appointments (district_id, status)
  WHERE district_id IS NOT NULL;
CREATE INDEX ix_leadership_appointments_profile
  ON public.leadership_appointments (profile_id, status);

ALTER TABLE public.leadership_appointments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.leadership_appointments FROM anon, authenticated;
GRANT SELECT ON public.leadership_appointments TO authenticated;

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
    AND (
      private.has_district_permission('view_members', district_id)
      OR private.has_district_permission('manage_branches', district_id)
    )
  )
);

CREATE OR REPLACE FUNCTION public.create_leadership_appointment(
  p_profile_id uuid,
  p_scope_type text,
  p_branch_id uuid DEFAULT NULL,
  p_district_id uuid DEFAULT NULL,
  p_title text DEFAULT NULL,
  p_responsibilities text DEFAULT NULL,
  p_effective_from date DEFAULT current_date
)
RETURNS public.leadership_appointments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_profile_id uuid;
  v_member public.profiles;
  v_appointment public.leadership_appointments;
  v_title text := btrim(coalesce(p_title, ''));
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Authentication is required.' USING ERRCODE = '42501';
  END IF;

  v_actor_profile_id := private.current_profile_id();
  IF v_actor_profile_id IS NULL THEN
    RAISE EXCEPTION 'An active linked church profile is required.' USING ERRCODE = '42501';
  END IF;

  IF v_title IS NULL OR length(v_title) NOT BETWEEN 2 AND 100 THEN
    RAISE EXCEPTION 'Leadership title must contain between 2 and 100 characters.' USING ERRCODE = '22023';
  END IF;

  IF p_scope_type = 'branch' THEN
    IF p_branch_id IS NULL OR p_district_id IS NOT NULL THEN
      RAISE EXCEPTION 'Branch appointment requires only a branch identifier.' USING ERRCODE = '22023';
    END IF;
    IF NOT private.has_permission('manage_branches', p_branch_id) THEN
      RAISE EXCEPTION 'You do not have permission to manage leadership appointments for this branch.' USING ERRCODE = '42501';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.church_branches b
      WHERE b.id = p_branch_id AND b.status = 'active'
    ) THEN
      RAISE EXCEPTION 'The selected branch does not exist or is inactive.' USING ERRCODE = '23503';
    END IF;
  ELSIF p_scope_type = 'district' THEN
    IF p_district_id IS NULL OR p_branch_id IS NOT NULL THEN
      RAISE EXCEPTION 'District appointment requires only a district identifier.' USING ERRCODE = '22023';
    END IF;
    IF NOT private.has_district_permission('manage_branches', p_district_id) THEN
      RAISE EXCEPTION 'You do not have permission to manage leadership appointments for this district.' USING ERRCODE = '42501';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.districts d
      WHERE d.id = p_district_id AND d.status = 'active'
    ) THEN
      RAISE EXCEPTION 'The selected district does not exist or is inactive.' USING ERRCODE = '23503';
    END IF;
  ELSE
    RAISE EXCEPTION 'Leadership appointment scope must be branch or district.' USING ERRCODE = '22023';
  END IF;

  SELECT p.* INTO v_member
  FROM public.profiles p
  WHERE p.id = p_profile_id
    AND p.record_status = 'active'
    AND p.membership_status NOT IN ('archived', 'transferred');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'The selected member is not an active congregation member.' USING ERRCODE = '23503';
  END IF;

  IF p_scope_type = 'branch' AND v_member.branch_id IS DISTINCT FROM p_branch_id THEN
    RAISE EXCEPTION 'The selected member must belong to the appointed branch.' USING ERRCODE = '23514';
  END IF;

  IF p_scope_type = 'district' AND NOT EXISTS (
    SELECT 1
    FROM public.church_branches b
    WHERE b.id = v_member.branch_id
      AND b.district_id = p_district_id
      AND b.status = 'active'
  ) THEN
    RAISE EXCEPTION 'The selected member must belong to an active branch in the appointed district.' USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.leadership_appointments (
    profile_id, scope_type, branch_id, district_id, title, responsibilities,
    appointed_by_profile_id, effective_from
  )
  VALUES (
    p_profile_id, p_scope_type, p_branch_id, p_district_id, v_title,
    NULLIF(btrim(coalesce(p_responsibilities, '')), ''),
    v_actor_profile_id, coalesce(p_effective_from, current_date)
  )
  RETURNING * INTO v_appointment;

  RETURN v_appointment;
END;
$$;

CREATE OR REPLACE FUNCTION public.end_leadership_appointment(
  p_appointment_id uuid,
  p_end_reason text DEFAULT NULL
)
RETURNS public.leadership_appointments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_profile_id uuid;
  v_appointment public.leadership_appointments;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Authentication is required.' USING ERRCODE = '42501';
  END IF;

  v_actor_profile_id := private.current_profile_id();
  IF v_actor_profile_id IS NULL THEN
    RAISE EXCEPTION 'An active linked church profile is required.' USING ERRCODE = '42501';
  END IF;

  SELECT a.* INTO v_appointment
  FROM public.leadership_appointments a
  WHERE a.id = p_appointment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'The selected leadership appointment does not exist.' USING ERRCODE = '23503';
  END IF;

  IF v_appointment.status <> 'active' THEN
    RAISE EXCEPTION 'The leadership appointment is already ended.' USING ERRCODE = '22023';
  END IF;

  IF v_appointment.scope_type = 'branch'
    AND NOT private.has_permission('manage_branches', v_appointment.branch_id) THEN
    RAISE EXCEPTION 'You do not have permission to end this branch leadership appointment.' USING ERRCODE = '42501';
  ELSIF v_appointment.scope_type = 'district'
    AND NOT private.has_district_permission('manage_branches', v_appointment.district_id) THEN
    RAISE EXCEPTION 'You do not have permission to end this district leadership appointment.' USING ERRCODE = '42501';
  END IF;

  UPDATE public.leadership_appointments
  SET status = 'ended',
      ended_at = now(),
      ended_by_profile_id = v_actor_profile_id,
      end_reason = NULLIF(btrim(coalesce(p_end_reason, '')), ''),
      effective_to = CASE
        WHEN effective_to IS NULL OR effective_to > current_date THEN current_date
        ELSE effective_to
      END,
      updated_at = now()
  WHERE id = p_appointment_id
  RETURNING * INTO v_appointment;

  RETURN v_appointment;
END;
$$;

REVOKE ALL ON FUNCTION public.create_leadership_appointment(uuid, text, uuid, uuid, text, text, date)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.end_leadership_appointment(uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_leadership_appointment(uuid, text, uuid, uuid, text, text, date)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.end_leadership_appointment(uuid, text)
  TO authenticated;
