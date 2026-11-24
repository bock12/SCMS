-- MEM-INT-004B: secure event registrations and attendance writes.
CREATE UNIQUE INDEX IF NOT EXISTS event_registrations_one_active_member_per_event
ON public.event_registrations (event_id, member_id)
WHERE member_id IS NOT NULL AND status <> 'cancelled';

CREATE UNIQUE INDEX IF NOT EXISTS attendance_sessions_one_event_session_per_day
ON public.attendance_sessions (event_id, session_date)
WHERE event_id IS NOT NULL;

CREATE OR REPLACE FUNCTION private.manage_event_registration(
  p_action text,
  p_event_id uuid DEFAULT NULL,
  p_registration_id uuid DEFAULT NULL,
  p_member_id uuid DEFAULT NULL,
  p_member_name text DEFAULT NULL,
  p_email text DEFAULT NULL,
  p_phone text DEFAULT NULL
)
RETURNS public.event_registrations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid;
  v_actor public.profiles;
  v_event public.events;
  v_member public.profiles;
  v_registration public.event_registrations;
  v_result public.event_registrations;
  v_count integer;
  v_capacity_status text;
  v_session_id uuid;
  v_session_branch_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'An authenticated session is required.' USING ERRCODE = '42501';
  END IF;
  v_actor_id := private.current_profile_id();
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'An active linked church profile is required.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_actor FROM public.profiles WHERE id = v_actor_id;

  IF p_action NOT IN ('register_member', 'register_guest', 'cancel', 'check_in', 'mark_absent') THEN
    RAISE EXCEPTION 'Unsupported event registration operation.' USING ERRCODE = '22023';
  END IF;

  IF p_action IN ('register_member', 'register_guest') THEN
    IF p_event_id IS NULL THEN
      RAISE EXCEPTION 'An event is required.' USING ERRCODE = '22023';
    END IF;
    SELECT * INTO v_event
    FROM public.events
    WHERE id = p_event_id AND status IN ('upcoming', 'ongoing')
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'The event is not available for registration.' USING ERRCODE = '23503';
    END IF;

    IF p_action = 'register_member' THEN
      IF p_member_id IS NULL THEN
        RAISE EXCEPTION 'Select a church member to register.' USING ERRCODE = '22023';
      END IF;
      SELECT * INTO v_member
      FROM public.profiles
      WHERE id = p_member_id AND record_status = 'active' AND membership_status = 'active'
      FOR KEY SHARE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'The selected active church member could not be found.' USING ERRCODE = '23503';
      END IF;
      IF v_event.branch_id IS NOT NULL AND v_member.branch_id IS DISTINCT FROM v_event.branch_id THEN
        RAISE EXCEPTION 'The selected member does not belong to the event branch.' USING ERRCODE = '42501';
      END IF;
      IF v_actor_id = v_member.id THEN
        IF NOT private.has_permission('register_for_events', v_event.branch_id) THEN
          RAISE EXCEPTION 'You do not have permission to register for this event.' USING ERRCODE = '42501';
        END IF;
      ELSIF NOT private.has_permission('manage_events', v_event.branch_id) THEN
        RAISE EXCEPTION 'You do not have permission to register another member.' USING ERRCODE = '42501';
      END IF;
      IF EXISTS (
        SELECT 1 FROM public.event_registrations r
        WHERE r.event_id = p_event_id AND r.member_id = p_member_id AND r.status <> 'cancelled'
      ) THEN
        RAISE EXCEPTION 'This member already has an active registration for the event.' USING ERRCODE = '23505';
      END IF;
      SELECT count(*)::integer INTO v_count
      FROM public.event_registrations r
      WHERE r.event_id = p_event_id AND r.status IN ('confirmed', 'checked_in', 'attended');
      v_capacity_status := CASE
        WHEN v_event.max_attendees IS NOT NULL AND v_count >= v_event.max_attendees THEN 'waitlist'
        ELSE 'confirmed'
      END;
      INSERT INTO public.event_registrations (
        event_id, member_id, member_name, email, phone, registered_by_profile_id, status
      ) VALUES (
        p_event_id, v_member.id,
        pg_catalog.concat_ws(' ', v_member.first_name, v_member.last_name),
        COALESCE(NULLIF(pg_catalog.btrim(p_email), ''), v_member.email),
        COALESCE(NULLIF(pg_catalog.btrim(p_phone), ''), v_member.phone),
        v_actor_id, v_capacity_status
      ) RETURNING * INTO v_result;
      RETURN v_result;
    ELSE
      IF NOT private.has_permission('manage_events', v_event.branch_id) THEN
        RAISE EXCEPTION 'Only event managers may register guests.' USING ERRCODE = '42501';
      END IF;
      IF NULLIF(pg_catalog.btrim(p_member_name), '') IS NULL THEN
        RAISE EXCEPTION 'A guest name is required.' USING ERRCODE = '22023';
      END IF;
      SELECT count(*)::integer INTO v_count
      FROM public.event_registrations r
      WHERE r.event_id = p_event_id AND r.status IN ('confirmed', 'checked_in', 'attended');
      v_capacity_status := CASE
        WHEN v_event.max_attendees IS NOT NULL AND v_count >= v_event.max_attendees THEN 'waitlist'
        ELSE 'confirmed'
      END;
      INSERT INTO public.event_registrations (
        event_id, member_id, member_name, email, phone, registered_by_profile_id, status
      ) VALUES (
        p_event_id, NULL, pg_catalog.btrim(p_member_name),
        NULLIF(pg_catalog.btrim(p_email), ''),
        NULLIF(pg_catalog.btrim(p_phone), ''),
        v_actor_id, v_capacity_status
      ) RETURNING * INTO v_result;
      RETURN v_result;
    END IF;
  END IF;

  IF p_registration_id IS NULL THEN
    RAISE EXCEPTION 'An event registration is required.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_registration
  FROM public.event_registrations
  WHERE id = p_registration_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The event registration could not be found.' USING ERRCODE = 'P0002';
  END IF;
  SELECT * INTO v_event FROM public.events WHERE id = v_registration.event_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The event could not be found.' USING ERRCODE = '23503';
  END IF;

  IF p_action = 'cancel' THEN
    IF v_registration.member_id IS DISTINCT FROM v_actor_id
      AND NOT private.has_permission('manage_events', v_event.branch_id) THEN
      RAISE EXCEPTION 'You do not have permission to cancel this registration.' USING ERRCODE = '42501';
    END IF;
    IF v_registration.status IN ('cancelled', 'checked_in', 'attended') THEN
      RAISE EXCEPTION 'This registration can no longer be cancelled.' USING ERRCODE = '22023';
    END IF;
    UPDATE public.event_registrations SET status = 'cancelled'
    WHERE id = p_registration_id RETURNING * INTO v_result;
    RETURN v_result;
  END IF;

  IF NOT (
    private.has_permission('manage_attendance', v_event.branch_id)
    OR private.has_permission('manage_events', v_event.branch_id)
  ) THEN
    RAISE EXCEPTION 'You do not have permission to manage event attendance.' USING ERRCODE = '42501';
  END IF;
  IF v_registration.status NOT IN ('confirmed', 'waitlist', 'absent', 'checked_in', 'attended') THEN
    RAISE EXCEPTION 'This registration is not eligible for attendance updates.' USING ERRCODE = '22023';
  END IF;

  IF p_action = 'check_in' THEN
    UPDATE public.event_registrations
    SET status = 'checked_in', checked_in_at = now()
    WHERE id = p_registration_id
    RETURNING * INTO v_result;

    IF v_registration.member_id IS NOT NULL THEN
      SELECT * INTO v_member FROM public.profiles WHERE id = v_registration.member_id;
      v_session_branch_id := COALESCE(v_event.branch_id, v_member.branch_id, v_actor.branch_id);
      IF v_session_branch_id IS NULL THEN
        RAISE EXCEPTION 'An attendance branch is required for this event.' USING ERRCODE = '22023';
      END IF;
      INSERT INTO public.attendance_sessions (
        branch_id, event_id, title, session_date, session_type, created_by_profile_id
      ) VALUES (
        v_session_branch_id, v_event.id, v_event.title, v_event.start_time::date, 'event', v_actor_id
      )
      ON CONFLICT (event_id, session_date) WHERE event_id IS NOT NULL DO NOTHING;
      SELECT id INTO v_session_id
      FROM public.attendance_sessions
      WHERE event_id = v_event.id AND session_date = v_event.start_time::date;
      INSERT INTO public.attendance_records (
        session_id, member_id, attendance_status, check_in_time, recorded_by_profile_id
      ) VALUES (
        v_session_id, v_registration.member_id, 'present', now(), v_actor_id
      )
      ON CONFLICT (session_id, member_id) DO UPDATE
      SET attendance_status = 'present',
          check_in_time = EXCLUDED.check_in_time,
          recorded_by_profile_id = EXCLUDED.recorded_by_profile_id;
    END IF;
    RETURN v_result;
  ELSE
    UPDATE public.event_registrations
    SET status = 'absent', checked_in_at = NULL
    WHERE id = p_registration_id
    RETURNING * INTO v_result;
    RETURN v_result;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION private.manage_event_registration(text, uuid, uuid, uuid, text, text, text) FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.manage_event_registration(text, uuid, uuid, uuid, text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.manage_event_registration(
  p_action text,
  p_event_id uuid DEFAULT NULL,
  p_registration_id uuid DEFAULT NULL,
  p_member_id uuid DEFAULT NULL,
  p_member_name text DEFAULT NULL,
  p_email text DEFAULT NULL,
  p_phone text DEFAULT NULL
)
RETURNS public.event_registrations
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT private.manage_event_registration(
    p_action, p_event_id, p_registration_id, p_member_id, p_member_name, p_email, p_phone
  );
$$;

REVOKE ALL ON FUNCTION public.manage_event_registration(text, uuid, uuid, uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.manage_event_registration(text, uuid, uuid, uuid, text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION private.manage_attendance(
  p_action text,
  p_session_id uuid DEFAULT NULL,
  p_branch_id uuid DEFAULT NULL,
  p_title text DEFAULT NULL,
  p_session_date date DEFAULT NULL,
  p_session_type text DEFAULT 'service',
  p_member_id uuid DEFAULT NULL,
  p_attendance_status text DEFAULT 'present',
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid;
  v_session public.attendance_sessions;
  v_member public.profiles;
  v_record public.attendance_records;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'An authenticated session is required.' USING ERRCODE = '42501';
  END IF;
  v_actor_id := private.current_profile_id();
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'An active linked church profile is required.' USING ERRCODE = '42501';
  END IF;

  IF p_action = 'create_session' THEN
    IF p_branch_id IS NULL OR NULLIF(pg_catalog.btrim(p_title), '') IS NULL THEN
      RAISE EXCEPTION 'A branch and attendance session title are required.' USING ERRCODE = '22023';
    END IF;
    IF NOT private.has_permission('manage_attendance', p_branch_id) THEN
      RAISE EXCEPTION 'You do not have permission to create attendance sessions for this branch.' USING ERRCODE = '42501';
    END IF;
    INSERT INTO public.attendance_sessions (
      branch_id, title, session_date, session_type, created_by_profile_id
    ) VALUES (
      p_branch_id, pg_catalog.btrim(p_title), COALESCE(p_session_date, CURRENT_DATE),
      COALESCE(NULLIF(pg_catalog.btrim(p_session_type), ''), 'service'), v_actor_id
    ) RETURNING * INTO v_session;
    RETURN pg_catalog.to_jsonb(v_session);
  ELSIF p_action = 'record' THEN
    IF p_session_id IS NULL OR p_member_id IS NULL THEN
      RAISE EXCEPTION 'An attendance session and church member are required.' USING ERRCODE = '22023';
    END IF;
    SELECT * INTO v_session
    FROM public.attendance_sessions
    WHERE id = p_session_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'The attendance session could not be found.' USING ERRCODE = 'P0002';
    END IF;
    IF NOT private.has_permission('manage_attendance', v_session.branch_id) THEN
      RAISE EXCEPTION 'You do not have permission to record attendance for this branch.' USING ERRCODE = '42501';
    END IF;
    SELECT * INTO v_member
    FROM public.profiles
    WHERE id = p_member_id AND record_status = 'active'
    FOR KEY SHARE;
    IF NOT FOUND OR v_member.branch_id IS DISTINCT FROM v_session.branch_id THEN
      RAISE EXCEPTION 'The selected member is not active in this attendance branch.' USING ERRCODE = '42501';
    END IF;
    IF p_attendance_status NOT IN ('present', 'absent', 'late', 'excused') THEN
      RAISE EXCEPTION 'Invalid attendance status.' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.attendance_records (
      session_id, member_id, attendance_status, check_in_time, recorded_by_profile_id, notes
    ) VALUES (
      p_session_id, p_member_id, p_attendance_status,
      CASE WHEN p_attendance_status IN ('present', 'late') THEN now() ELSE NULL END,
      v_actor_id, NULLIF(pg_catalog.btrim(p_notes), '')
    )
    ON CONFLICT (session_id, member_id) DO UPDATE
    SET attendance_status = EXCLUDED.attendance_status,
        check_in_time = EXCLUDED.check_in_time,
        recorded_by_profile_id = EXCLUDED.recorded_by_profile_id,
        notes = EXCLUDED.notes
    RETURNING * INTO v_record;
    RETURN pg_catalog.to_jsonb(v_record);
  ELSE
    RAISE EXCEPTION 'Unsupported attendance operation.' USING ERRCODE = '22023';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION private.manage_attendance(text, uuid, uuid, text, date, text, uuid, text, text) FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.manage_attendance(text, uuid, uuid, text, date, text, uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.manage_attendance(
  p_action text,
  p_session_id uuid DEFAULT NULL,
  p_branch_id uuid DEFAULT NULL,
  p_title text DEFAULT NULL,
  p_session_date date DEFAULT NULL,
  p_session_type text DEFAULT 'service',
  p_member_id uuid DEFAULT NULL,
  p_attendance_status text DEFAULT 'present',
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT private.manage_attendance(
    p_action, p_session_id, p_branch_id, p_title, p_session_date,
    p_session_type, p_member_id, p_attendance_status, p_notes
  );
$$;

REVOKE ALL ON FUNCTION public.manage_attendance(text, uuid, uuid, text, date, text, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.manage_attendance(text, uuid, uuid, text, date, text, uuid, text, text) TO authenticated;
