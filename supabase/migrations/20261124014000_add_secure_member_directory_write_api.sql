-- MEM-INT-002: secure, scope-aware member directory writes.
-- The canonical person row remains public.profiles. This migration deliberately
-- does not provision Auth users, change portal lifecycle state, assign roles,
-- or move people between branches.

CREATE OR REPLACE FUNCTION private.assert_unique_profile_contacts(
  p_email text,
  p_phone text,
  p_exclude_profile_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $function$
DECLARE
  v_phone text;
BEGIN
  IF NULLIF(pg_catalog.btrim(COALESCE(p_email, '')), '') IS NOT NULL THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('scms:profile-email:' || pg_catalog.lower(pg_catalog.btrim(p_email)), 0)
    );

    IF EXISTS (
      SELECT 1
      FROM public.profiles AS p
      WHERE p.id IS DISTINCT FROM p_exclude_profile_id
        AND pg_catalog.lower(pg_catalog.btrim(p.email)) = pg_catalog.lower(pg_catalog.btrim(p_email))
    ) THEN
      RAISE EXCEPTION 'A member with this email address is already registered.'
        USING ERRCODE = '23505';
    END IF;
  END IF;

  v_phone := pg_catalog.regexp_replace(COALESCE(p_phone, ''), '[^0-9+]', '', 'g');
  IF pg_catalog.length(v_phone) > 5 THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('scms:profile-phone:' || v_phone, 0)
    );

    IF EXISTS (
      SELECT 1
      FROM public.profiles AS p
      WHERE p.id IS DISTINCT FROM p_exclude_profile_id
        AND pg_catalog.length(pg_catalog.regexp_replace(COALESCE(p.phone, ''), '[^0-9+]', '', 'g')) > 5
        AND pg_catalog.regexp_replace(COALESCE(p.phone, ''), '[^0-9+]', '', 'g') = v_phone
    ) THEN
      RAISE EXCEPTION 'A member with this phone number is already registered.'
        USING ERRCODE = '23505';
    END IF;
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION private.assert_unique_profile_contacts(text, text, uuid)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.guard_profile_direct_updates()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  -- Ordinary browser sessions may edit basic self-service details, but all
  -- membership, branch, portal-link and lifecycle fields are server-managed.
  -- The approved SECURITY DEFINER RPCs execute as their trusted owner and are
  -- therefore allowed through this guard after their own authorization checks.
  IF current_user IN ('anon', 'authenticated') THEN
    IF NEW.auth_user_id IS DISTINCT FROM OLD.auth_user_id
      OR NEW.branch_id IS DISTINCT FROM OLD.branch_id
      OR NEW.membership_date IS DISTINCT FROM OLD.membership_date
      OR NEW.membership_status IS DISTINCT FROM OLD.membership_status
      OR NEW.is_baptized IS DISTINCT FROM OLD.is_baptized
      OR NEW.baptism_date IS DISTINCT FROM OLD.baptism_date
      OR NEW.baptized_by_profile_id IS DISTINCT FROM OLD.baptized_by_profile_id
      OR NEW.baptized_by_name_snapshot IS DISTINCT FROM OLD.baptized_by_name_snapshot
      OR NEW.portal_access_status IS DISTINCT FROM OLD.portal_access_status
      OR NEW.record_status IS DISTINCT FROM OLD.record_status
      OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'Membership, branch, portal and authentication fields must be changed through an authorized workflow.'
        USING ERRCODE = '42501';
    END IF;

    IF OLD.auth_user_id IS NOT NULL AND NEW.email IS DISTINCT FROM OLD.email THEN
      RAISE EXCEPTION 'A linked portal email must be changed through the portal account workflow.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION private.guard_profile_direct_updates()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS guard_profile_direct_updates ON public.profiles;
CREATE TRIGGER guard_profile_direct_updates
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION private.guard_profile_direct_updates();

CREATE OR REPLACE FUNCTION public.create_member_profile(p_member jsonb)
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor_profile_id uuid;
  v_branch_id uuid;
  v_first_name text;
  v_last_name text;
  v_email text;
  v_phone text;
  v_gender text;
  v_membership_date date;
  v_membership_status text;
  v_is_baptized boolean;
  v_baptism_date date;
  v_baptized_by_profile_id uuid;
  v_baptized_by_name_snapshot text;
  v_date_of_birth date;
  v_marital_status text;
  v_marriage_date date;
  v_profile public.profiles;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Authentication is required to create a member.'
      USING ERRCODE = '42501';
  END IF;

  v_actor_profile_id := private.current_profile_id();
  IF v_actor_profile_id IS NULL THEN
    RAISE EXCEPTION 'The authenticated user is not linked to a church profile.'
      USING ERRCODE = '42501';
  END IF;

  IF p_member IS NULL OR pg_catalog.jsonb_typeof(p_member) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Member details must be provided as a JSON object.'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.jsonb_object_keys(p_member) AS supplied(key_name)
    WHERE supplied.key_name <> ALL (ARRAY[
      'first_name','last_name','branch_id','email','phone','gender','avatar_url',
      'membership_date','membership_status','is_baptized','baptism_date',
      'baptized_by_profile_id','baptized_by_name_snapshot','date_of_birth',
      'marital_status','marriage_date'
    ]::text[])
  ) THEN
    RAISE EXCEPTION 'Member details contain unsupported or protected fields.'
      USING ERRCODE = '22023';
  END IF;

  v_first_name := pg_catalog.btrim(COALESCE(p_member->>'first_name', ''));
  v_last_name := pg_catalog.btrim(COALESCE(p_member->>'last_name', ''));
  v_branch_id := NULLIF(p_member->>'branch_id', '')::uuid;
  v_membership_date := NULLIF(p_member->>'membership_date', '')::date;
  v_email := NULLIF(pg_catalog.lower(pg_catalog.btrim(COALESCE(p_member->>'email', ''))), '');
  v_phone := NULLIF(pg_catalog.btrim(COALESCE(p_member->>'phone', '')), '');
  v_gender := COALESCE(NULLIF(p_member->>'gender', ''), 'other');
  v_membership_status := COALESCE(NULLIF(p_member->>'membership_status', ''), 'active');
  v_is_baptized := COALESCE(NULLIF(p_member->>'is_baptized', '')::boolean, false);
  v_baptism_date := NULLIF(p_member->>'baptism_date', '')::date;
  v_baptized_by_profile_id := NULLIF(p_member->>'baptized_by_profile_id', '')::uuid;
  v_baptized_by_name_snapshot := NULLIF(pg_catalog.btrim(COALESCE(p_member->>'baptized_by_name_snapshot', '')), '');
  v_date_of_birth := NULLIF(p_member->>'date_of_birth', '')::date;
  v_marital_status := NULLIF(p_member->>'marital_status', '');
  v_marriage_date := NULLIF(p_member->>'marriage_date', '')::date;

  IF v_first_name = '' OR v_last_name = '' OR pg_catalog.length(v_first_name) > 120 OR pg_catalog.length(v_last_name) > 120 THEN
    RAISE EXCEPTION 'First name and last name are required and must not exceed 120 characters.'
      USING ERRCODE = '22023';
  END IF;

  IF v_branch_id IS NULL OR v_membership_date IS NULL THEN
    RAISE EXCEPTION 'A branch and valid membership date are required.'
      USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.church_branches AS b
    WHERE b.id = v_branch_id AND b.status = 'active'
  ) THEN
    RAISE EXCEPTION 'The selected branch does not exist or is inactive.'
      USING ERRCODE = '23503';
  END IF;

  IF NOT private.has_permission('manage_members', v_branch_id) THEN
    RAISE EXCEPTION 'You do not have permission to create members in this branch.'
      USING ERRCODE = '42501';
  END IF;

  IF v_email IS NOT NULL AND v_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RAISE EXCEPTION 'Enter a valid email address.'
      USING ERRCODE = '22023';
  END IF;

  IF v_gender NOT IN ('male', 'female', 'other') THEN
    RAISE EXCEPTION 'Invalid gender value.'
      USING ERRCODE = '22023';
  END IF;

  IF v_membership_status NOT IN ('active', 'inactive', 'suspended', 'archived') THEN
    RAISE EXCEPTION 'Invalid membership status. Transfers must use the member transfer workflow.'
      USING ERRCODE = '22023';
  END IF;

  IF v_marital_status IS NOT NULL AND v_marital_status NOT IN ('Single', 'Married', 'Widowed', 'Divorced') THEN
    RAISE EXCEPTION 'Invalid marital status.'
      USING ERRCODE = '22023';
  END IF;

  IF v_date_of_birth IS NOT NULL AND v_date_of_birth > CURRENT_DATE THEN
    RAISE EXCEPTION 'Date of birth cannot be in the future.'
      USING ERRCODE = '22023';
  END IF;

  IF NOT v_is_baptized AND v_baptism_date IS NOT NULL THEN
    RAISE EXCEPTION 'A baptism date cannot be set when the member is not baptized.'
      USING ERRCODE = '22023';
  END IF;

  IF v_marital_status IS DISTINCT FROM 'Married' THEN
    v_marriage_date := NULL;
  END IF;

  PERFORM private.assert_unique_profile_contacts(v_email, v_phone, NULL);

  INSERT INTO public.profiles (
    branch_id, first_name, last_name, email, phone, gender, avatar_url,
    membership_date, membership_status, is_baptized, baptism_date,
    baptized_by_profile_id, baptized_by_name_snapshot, date_of_birth,
    marital_status, marriage_date
  ) VALUES (
    v_branch_id, v_first_name, v_last_name, v_email, v_phone, v_gender,
    NULLIF(p_member->>'avatar_url', ''), v_membership_date, v_membership_status,
    v_is_baptized, v_baptism_date, v_baptized_by_profile_id,
    v_baptized_by_name_snapshot, v_date_of_birth, v_marital_status, v_marriage_date
  )
  RETURNING * INTO v_profile;

  RETURN v_profile;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_member_profile(
  p_profile_id uuid,
  p_member jsonb
)
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor_profile_id uuid;
  v_existing public.profiles;
  v_candidate public.profiles;
  v_payload jsonb;
  v_profile public.profiles;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Authentication is required to update a member.'
      USING ERRCODE = '42501';
  END IF;

  v_actor_profile_id := private.current_profile_id();
  IF v_actor_profile_id IS NULL THEN
    RAISE EXCEPTION 'The authenticated user is not linked to a church profile.'
      USING ERRCODE = '42501';
  END IF;

  IF p_profile_id IS NULL OR p_member IS NULL OR pg_catalog.jsonb_typeof(p_member) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'A member ID and JSON object of member changes are required.'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.jsonb_object_keys(p_member) AS supplied(key_name)
    WHERE supplied.key_name <> ALL (ARRAY[
      'first_name','last_name','branch_id','email','phone','gender','avatar_url',
      'membership_date','membership_status','is_baptized','baptism_date',
      'baptized_by_profile_id','baptized_by_name_snapshot','date_of_birth',
      'marital_status','marriage_date'
    ]::text[])
  ) THEN
    RAISE EXCEPTION 'Member changes contain unsupported or protected fields.'
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_existing
  FROM public.profiles AS p
  WHERE p.id = p_profile_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Member directory record not found.'
      USING ERRCODE = '23503';
  END IF;

  IF v_existing.branch_id IS NULL
    OR NOT private.has_permission('manage_members', v_existing.branch_id) THEN
    RAISE EXCEPTION 'You do not have permission to update this member in the assigned branch.'
      USING ERRCODE = '42501';
  END IF;

  v_payload := pg_catalog.to_jsonb(v_existing) || p_member;
  SELECT * INTO v_candidate
  FROM pg_catalog.jsonb_populate_record(v_existing, v_payload);

  IF v_candidate.branch_id IS DISTINCT FROM v_existing.branch_id THEN
    RAISE EXCEPTION 'A member branch can only be changed through the approved member transfer workflow.'
      USING ERRCODE = '42501';
  END IF;

  v_candidate.first_name := pg_catalog.btrim(COALESCE(v_candidate.first_name, ''));
  v_candidate.last_name := pg_catalog.btrim(COALESCE(v_candidate.last_name, ''));
  v_candidate.email := NULLIF(pg_catalog.lower(pg_catalog.btrim(COALESCE(v_candidate.email, ''))), '');
  v_candidate.phone := NULLIF(pg_catalog.btrim(COALESCE(v_candidate.phone, '')), '');

  IF v_candidate.first_name = '' OR v_candidate.last_name = ''
    OR pg_catalog.length(v_candidate.first_name) > 120
    OR pg_catalog.length(v_candidate.last_name) > 120 THEN
    RAISE EXCEPTION 'First name and last name are required and must not exceed 120 characters.'
      USING ERRCODE = '22023';
  END IF;

  IF v_candidate.email IS NOT NULL AND v_candidate.email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RAISE EXCEPTION 'Enter a valid email address.'
      USING ERRCODE = '22023';
  END IF;

  IF v_existing.auth_user_id IS NOT NULL AND v_candidate.email IS DISTINCT FROM v_existing.email THEN
    RAISE EXCEPTION 'A linked portal email must be changed through the portal account workflow.'
      USING ERRCODE = '42501';
  END IF;

  IF v_candidate.gender IS NOT NULL AND v_candidate.gender NOT IN ('male', 'female', 'other') THEN
    RAISE EXCEPTION 'Invalid gender value.'
      USING ERRCODE = '22023';
  END IF;

  IF v_candidate.membership_status NOT IN ('active', 'inactive', 'suspended', 'transferred', 'archived') THEN
    RAISE EXCEPTION 'Invalid membership status.'
      USING ERRCODE = '22023';
  END IF;

  IF v_candidate.membership_status = 'transferred'
    AND v_existing.membership_status IS DISTINCT FROM 'transferred' THEN
    RAISE EXCEPTION 'Member transfers must use the approved member transfer workflow.'
      USING ERRCODE = '42501';
  END IF;

  IF v_candidate.marital_status IS NOT NULL
    AND v_candidate.marital_status NOT IN ('Single', 'Married', 'Widowed', 'Divorced') THEN
    RAISE EXCEPTION 'Invalid marital status.'
      USING ERRCODE = '22023';
  END IF;

  IF v_candidate.date_of_birth IS NOT NULL AND v_candidate.date_of_birth > CURRENT_DATE THEN
    RAISE EXCEPTION 'Date of birth cannot be in the future.'
      USING ERRCODE = '22023';
  END IF;

  IF NOT v_candidate.is_baptized AND v_candidate.baptism_date IS NOT NULL THEN
    RAISE EXCEPTION 'A baptism date cannot be set when the member is not baptized.'
      USING ERRCODE = '22023';
  END IF;

  IF NOT v_candidate.is_baptized THEN
    v_candidate.baptized_by_profile_id := NULL;
    v_candidate.baptized_by_name_snapshot := NULL;
  END IF;

  IF v_candidate.marital_status IS DISTINCT FROM 'Married' THEN
    v_candidate.marriage_date := NULL;
  END IF;

  PERFORM private.assert_unique_profile_contacts(v_candidate.email, v_candidate.phone, p_profile_id);

  UPDATE public.profiles
  SET
    first_name = v_candidate.first_name,
    last_name = v_candidate.last_name,
    email = v_candidate.email,
    phone = v_candidate.phone,
    gender = v_candidate.gender,
    avatar_url = v_candidate.avatar_url,
    membership_date = v_candidate.membership_date,
    membership_status = v_candidate.membership_status,
    is_baptized = v_candidate.is_baptized,
    baptism_date = v_candidate.baptism_date,
    baptized_by_profile_id = v_candidate.baptized_by_profile_id,
    baptized_by_name_snapshot = v_candidate.baptized_by_name_snapshot,
    date_of_birth = v_candidate.date_of_birth,
    marital_status = v_candidate.marital_status,
    marriage_date = v_candidate.marriage_date,
    updated_at = now()
  WHERE id = p_profile_id
  RETURNING * INTO v_profile;

  RETURN v_profile;
END;
$function$;

REVOKE ALL ON FUNCTION public.create_member_profile(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_member_profile(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_member_profile(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_member_profile(uuid, jsonb) TO authenticated;

-- The accepted Member Directory authorization decision grants pastors create/edit
-- authority only when their trusted profile_role_assignments scope covers the branch.
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles AS r
JOIN public.permissions AS p ON p.key = 'manage_members'
WHERE r.name = 'pastor'
ON CONFLICT DO NOTHING;
