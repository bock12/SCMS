-- MEM-INT-004B: persist ministry join requests and process approval atomically
-- with the canonical ministry_members roster.

CREATE TABLE public.ministry_join_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ministry_id uuid NOT NULL REFERENCES public.ministries(id) ON DELETE RESTRICT,
  member_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  ministry_name text NOT NULL,
  applicant_name text NOT NULL,
  applicant_email text NOT NULL DEFAULT '',
  applicant_phone text NOT NULL,
  preferred_roles jsonb NOT NULL DEFAULT '[]'::jsonb,
  availability text NOT NULL,
  note text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'declined', 'withdrawn')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_by_name text,
  reviewed_at timestamptz,
  review_note text,
  assigned_role_title text,
  assigned_duty text,
  CONSTRAINT ministry_join_requests_roles_array
    CHECK (jsonb_typeof(preferred_roles) = 'array')
);

CREATE UNIQUE INDEX uq_ministry_join_requests_pending_member
  ON public.ministry_join_requests (ministry_id, member_id)
  WHERE status = 'pending';

CREATE INDEX ix_ministry_join_requests_member_created
  ON public.ministry_join_requests (member_id, created_at DESC);
CREATE INDEX ix_ministry_join_requests_ministry_status_created
  ON public.ministry_join_requests (ministry_id, status, created_at DESC);

ALTER TABLE public.ministry_join_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ministry_join_requests FROM anon, authenticated;
GRANT SELECT ON public.ministry_join_requests TO authenticated;

CREATE POLICY ministry_join_requests_scoped_read
ON public.ministry_join_requests
FOR SELECT TO authenticated
USING (
  member_id = private.current_profile_id()
  OR EXISTS (
    SELECT 1
    FROM public.ministries ministry
    WHERE ministry.id = ministry_join_requests.ministry_id
      AND private.has_permission('manage_ministries', ministry.branch_id)
  )
);

CREATE OR REPLACE FUNCTION private.submit_ministry_join_request(
  p_ministry_id uuid,
  p_preferred_roles jsonb,
  p_availability text,
  p_note text,
  p_applicant_phone text
)
RETURNS public.ministry_join_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_member_id uuid;
  v_member public.profiles;
  v_ministry public.ministries;
  v_request public.ministry_join_requests;
  v_roles jsonb := coalesce(p_preferred_roles, '["Open to serving where needed"]'::jsonb);
  v_phone text := pg_catalog.btrim(coalesce(p_applicant_phone, ''));
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Authentication is required to submit a ministry request.' USING ERRCODE = '42501';
  END IF;

  v_member_id := private.current_profile_id();
  IF v_member_id IS NULL THEN
    RAISE EXCEPTION 'An active linked church member profile is required.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_member
  FROM public.profiles member
  WHERE member.id = v_member_id
    AND member.auth_user_id = (SELECT auth.uid())
    AND member.portal_access_status = 'active'
    AND member.record_status = 'active'
    AND member.membership_status = 'active';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Only active church members with active portal access can submit ministry requests.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_ministry
  FROM public.ministries ministry
  WHERE ministry.id = p_ministry_id
    AND ministry.status = 'active';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'The selected ministry is unavailable or inactive.' USING ERRCODE = '23503';
  END IF;

  IF v_ministry.branch_id IS NOT NULL
    AND v_member.branch_id IS DISTINCT FROM v_ministry.branch_id THEN
    RAISE EXCEPTION 'You can only request to join ministries available to your current branch.' USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.ministry_members assignment
    WHERE assignment.ministry_id = p_ministry_id
      AND assignment.member_id = v_member_id
      AND assignment.status IN ('active', 'on_leave', 'in_training')
  ) THEN
    RAISE EXCEPTION 'You are already on this ministry roster.' USING ERRCODE = '23505';
  END IF;

  IF pg_catalog.btrim(coalesce(p_availability, '')) = '' OR v_phone = '' THEN
    RAISE EXCEPTION 'Availability and a contact phone number are required.' USING ERRCODE = '22023';
  END IF;

  IF pg_catalog.jsonb_typeof(v_roles) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Preferred roles must be provided as a JSON array.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.ministry_join_requests (
    ministry_id, member_id, ministry_name, applicant_name, applicant_email,
    applicant_phone, preferred_roles, availability, note, status
  )
  VALUES (
    p_ministry_id,
    v_member_id,
    v_ministry.name,
    pg_catalog.concat_ws(' ', v_member.first_name, v_member.last_name),
    coalesce(v_member.email, ''),
    v_phone,
    CASE WHEN pg_catalog.jsonb_array_length(v_roles) = 0
      THEN '["Open to serving where needed"]'::jsonb
      ELSE v_roles
    END,
    pg_catalog.btrim(p_availability),
    coalesce(pg_catalog.btrim(p_note), ''),
    'pending'
  )
  RETURNING * INTO v_request;

  RETURN v_request;
END;
$$;

CREATE OR REPLACE FUNCTION private.withdraw_ministry_join_request(
  p_request_id uuid
)
RETURNS public.ministry_join_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_member_id uuid;
  v_request public.ministry_join_requests;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Authentication is required.' USING ERRCODE = '42501';
  END IF;
  v_member_id := private.current_profile_id();
  IF v_member_id IS NULL THEN
    RAISE EXCEPTION 'An active linked church member profile is required.' USING ERRCODE = '42501';
  END IF;

  UPDATE public.ministry_join_requests
  SET status = 'withdrawn',
      updated_at = now()
  WHERE id = p_request_id
    AND member_id = v_member_id
    AND status = 'pending'
  RETURNING * INTO v_request;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Only your own pending ministry requests can be withdrawn.' USING ERRCODE = '42501';
  END IF;
  RETURN v_request;
END;
$$;

CREATE OR REPLACE FUNCTION private.review_ministry_join_request(
  p_request_id uuid,
  p_action text,
  p_role_title text DEFAULT NULL,
  p_duty text DEFAULT NULL,
  p_member_status text DEFAULT 'active',
  p_review_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid;
  v_actor public.profiles;
  v_request public.ministry_join_requests;
  v_ministry public.ministries;
  v_member public.profiles;
  v_roster_entry public.ministry_members;
  v_existing_assignment public.ministry_members;
  v_has_existing_assignment boolean := false;
  v_target_status text := coalesce(p_member_status, 'active');
  v_role_title text;
  v_duty text;
  v_note text := nullif(pg_catalog.btrim(coalesce(p_review_note, '')), '');
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Authentication is required.' USING ERRCODE = '42501';
  END IF;
  v_actor_id := private.current_profile_id();
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'An active linked church profile is required.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_actor FROM public.profiles WHERE id = v_actor_id;
  SELECT * INTO v_request
  FROM public.ministry_join_requests
  WHERE id = p_request_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The ministry join request does not exist.' USING ERRCODE = '23503';
  END IF;

  SELECT * INTO v_ministry
  FROM public.ministries
  WHERE id = v_request.ministry_id
  FOR UPDATE;
  IF NOT FOUND OR NOT private.has_permission('manage_ministries', v_ministry.branch_id) THEN
    RAISE EXCEPTION 'You do not have permission to review this ministry request.' USING ERRCODE = '42501';
  END IF;

  IF p_action = 'approve' THEN
    IF v_request.status <> 'pending' OR v_ministry.status <> 'active' THEN
      RAISE EXCEPTION 'Only pending requests for active ministries can be approved.' USING ERRCODE = '22023';
    END IF;
    IF v_target_status NOT IN ('active', 'in_training', 'on_leave') THEN
      RAISE EXCEPTION 'Invalid approved ministry membership status.' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_member
    FROM public.profiles
    WHERE id = v_request.member_id
      AND record_status = 'active'
      AND membership_status = 'active';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'The applicant is no longer an active congregation member.' USING ERRCODE = '23503';
    END IF;
    IF v_ministry.branch_id IS NOT NULL AND v_member.branch_id IS DISTINCT FROM v_ministry.branch_id THEN
      RAISE EXCEPTION 'The applicant no longer belongs to the ministry branch.' USING ERRCODE = '23514';
    END IF;

    SELECT * INTO v_existing_assignment
    FROM public.ministry_members
    WHERE ministry_id = v_request.ministry_id
      AND member_id = v_request.member_id
    FOR UPDATE;
    v_has_existing_assignment := FOUND;

    v_role_title := coalesce(
      nullif(pg_catalog.btrim(p_role_title), ''),
      (
        SELECT role_option.value #>> '{}'
        FROM pg_catalog.jsonb_array_elements(v_request.preferred_roles) AS role_option(value)
        WHERE coalesce(role_option.value #>> '{}', '') <> ''
          AND lower(coalesce(role_option.value #>> '{}', '')) NOT LIKE 'open to%'
        LIMIT 1
      ),
      'Team Member'
    );
    v_duty := coalesce(nullif(pg_catalog.btrim(p_duty), ''), v_request.availability, 'Sunday & Ministry Service Duty');

    IF v_has_existing_assignment THEN
      v_roster_entry := private.manage_ministry_member(
        'update', NULL, v_existing_assignment.id, NULL,
        v_role_title, v_duty, v_target_status, NULL
      );
    ELSE
      v_roster_entry := private.manage_ministry_member(
        'add', v_request.ministry_id, NULL, v_request.member_id,
        v_role_title, v_duty, v_target_status, CURRENT_DATE
      );
    END IF;

    UPDATE public.ministry_join_requests
    SET status = 'approved',
        updated_at = now(),
        reviewed_by_id = v_actor_id,
        reviewed_by_name = pg_catalog.concat_ws(' ', v_actor.first_name, v_actor.last_name),
        reviewed_at = now(),
        review_note = v_note,
        assigned_role_title = v_role_title,
        assigned_duty = v_duty
    WHERE id = p_request_id
    RETURNING * INTO v_request;

    RETURN pg_catalog.jsonb_build_object(
      'request', pg_catalog.to_jsonb(v_request),
      'roster_entry', pg_catalog.to_jsonb(v_roster_entry)
    );
  ELSIF p_action = 'decline' THEN
    IF v_request.status <> 'pending' THEN
      RAISE EXCEPTION 'Only pending ministry requests can be declined.' USING ERRCODE = '22023';
    END IF;

    UPDATE public.ministry_join_requests
    SET status = 'declined',
        updated_at = now(),
        reviewed_by_id = v_actor_id,
        reviewed_by_name = pg_catalog.concat_ws(' ', v_actor.first_name, v_actor.last_name),
        reviewed_at = now(),
        review_note = v_note
    WHERE id = p_request_id
    RETURNING * INTO v_request;

    RETURN pg_catalog.jsonb_build_object('request', pg_catalog.to_jsonb(v_request), 'roster_entry', NULL);
  ELSIF p_action = 'reopen' THEN
    IF v_request.status NOT IN ('declined', 'withdrawn') THEN
      RAISE EXCEPTION 'Only declined or withdrawn requests can be reopened.' USING ERRCODE = '22023';
    END IF;

    UPDATE public.ministry_join_requests
    SET status = 'pending',
        updated_at = now(),
        reviewed_by_id = v_actor_id,
        reviewed_by_name = pg_catalog.concat_ws(' ', v_actor.first_name, v_actor.last_name),
        reviewed_at = NULL,
        review_note = NULL,
        assigned_role_title = NULL,
        assigned_duty = NULL
    WHERE id = p_request_id
    RETURNING * INTO v_request;

    RETURN pg_catalog.jsonb_build_object('request', pg_catalog.to_jsonb(v_request), 'roster_entry', NULL);
  ELSE
    RAISE EXCEPTION 'Unsupported ministry join request action.' USING ERRCODE = '22023';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_ministry_join_request(
  p_ministry_id uuid,
  p_preferred_roles jsonb,
  p_availability text,
  p_note text,
  p_applicant_phone text
)
RETURNS public.ministry_join_requests
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT private.submit_ministry_join_request(
    p_ministry_id, p_preferred_roles, p_availability, p_note, p_applicant_phone
  );
$$;

CREATE OR REPLACE FUNCTION public.withdraw_ministry_join_request(p_request_id uuid)
RETURNS public.ministry_join_requests
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT private.withdraw_ministry_join_request(p_request_id);
$$;

CREATE OR REPLACE FUNCTION public.review_ministry_join_request(
  p_request_id uuid,
  p_action text,
  p_role_title text DEFAULT NULL,
  p_duty text DEFAULT NULL,
  p_member_status text DEFAULT 'active',
  p_review_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT private.review_ministry_join_request(
    p_request_id, p_action, p_role_title, p_duty, p_member_status, p_review_note
  );
$$;

REVOKE ALL ON FUNCTION private.submit_ministry_join_request(uuid, jsonb, text, text, text)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.withdraw_ministry_join_request(uuid)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.review_ministry_join_request(uuid, text, text, text, text, text)
  FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.submit_ministry_join_request(uuid, jsonb, text, text, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION private.withdraw_ministry_join_request(uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION private.review_ministry_join_request(uuid, text, text, text, text, text)
  TO authenticated;

REVOKE ALL ON FUNCTION public.submit_ministry_join_request(uuid, jsonb, text, text, text)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.withdraw_ministry_join_request(uuid)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.review_ministry_join_request(uuid, text, text, text, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_ministry_join_request(uuid, jsonb, text, text, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.withdraw_ministry_join_request(uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_ministry_join_request(uuid, text, text, text, text, text)
  TO authenticated;
