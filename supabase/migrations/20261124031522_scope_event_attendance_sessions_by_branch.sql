-- MEM-INT-004B hardening: event attendance sessions are branch-specific for
-- church-wide events, and waitlisted registrations cannot overrun capacity.
DROP INDEX IF EXISTS public.attendance_sessions_one_event_session_per_day;
CREATE UNIQUE INDEX attendance_sessions_one_event_session_per_branch_day
ON public.attendance_sessions (event_id, session_date, branch_id)
WHERE event_id IS NOT NULL;

CREATE OR REPLACE FUNCTION private.manage_event_registration(
  p_action text, p_event_id uuid DEFAULT NULL, p_registration_id uuid DEFAULT NULL,
  p_member_id uuid DEFAULT NULL, p_member_name text DEFAULT NULL,
  p_email text DEFAULT NULL, p_phone text DEFAULT NULL
)
RETURNS public.event_registrations
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid; v_actor public.profiles; v_event public.events; v_member public.profiles;
  v_registration public.event_registrations; v_result public.event_registrations;
  v_count integer; v_capacity_status text; v_session_id uuid; v_session_branch_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'An authenticated session is required.' USING ERRCODE = '42501'; END IF;
  v_actor_id := private.current_profile_id();
  IF v_actor_id IS NULL THEN RAISE EXCEPTION 'An active linked church profile is required.' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_actor FROM public.profiles WHERE id = v_actor_id;
  IF p_action NOT IN ('register_member', 'register_guest', 'cancel', 'check_in', 'mark_absent') THEN
    RAISE EXCEPTION 'Unsupported event registration operation.' USING ERRCODE = '22023';
  END IF;
  IF p_action IN ('register_member', 'register_guest') THEN
    IF p_event_id IS NULL THEN RAISE EXCEPTION 'An event is required.' USING ERRCODE = '22023'; END IF;
    SELECT * INTO v_event FROM public.events WHERE id=p_event_id AND status IN ('upcoming','ongoing') FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'The event is not available for registration.' USING ERRCODE = '23503'; END IF;
    IF p_action='register_member' THEN
      IF p_member_id IS NULL THEN RAISE EXCEPTION 'Select a church member to register.' USING ERRCODE = '22023'; END IF;
      SELECT * INTO v_member FROM public.profiles
      WHERE id=p_member_id AND record_status='active' AND membership_status='active' FOR KEY SHARE;
      IF NOT FOUND THEN RAISE EXCEPTION 'The selected active church member could not be found.' USING ERRCODE = '23503'; END IF;
      IF v_event.branch_id IS NOT NULL AND v_member.branch_id IS DISTINCT FROM v_event.branch_id THEN
        RAISE EXCEPTION 'The selected member does not belong to the event branch.' USING ERRCODE = '42501';
      END IF;
      IF v_actor_id=v_member.id THEN
        IF NOT private.has_permission('register_for_events',COALESCE(v_event.branch_id,v_member.branch_id)) THEN
          RAISE EXCEPTION 'You do not have permission to register for this event.' USING ERRCODE = '42501';
        END IF;
      ELSIF NOT private.has_permission('manage_events',COALESCE(v_event.branch_id,v_actor.branch_id)) THEN
        RAISE EXCEPTION 'You do not have permission to register another member.' USING ERRCODE = '42501';
      END IF;
      IF EXISTS(SELECT 1 FROM public.event_registrations r WHERE r.event_id=p_event_id AND r.member_id=p_member_id AND r.status<>'cancelled') THEN
        RAISE EXCEPTION 'This member already has an active registration for the event.' USING ERRCODE = '23505';
      END IF;
      SELECT count(*)::integer INTO v_count FROM public.event_registrations r
      WHERE r.event_id=p_event_id AND r.status IN ('confirmed','checked_in','attended');
      v_capacity_status := CASE WHEN v_event.max_attendees IS NOT NULL AND v_count>=v_event.max_attendees THEN 'waitlist' ELSE 'confirmed' END;
      INSERT INTO public.event_registrations(event_id,member_id,member_name,email,phone,registered_by_profile_id,status)
      VALUES(p_event_id,v_member.id,pg_catalog.concat_ws(' ',v_member.first_name,v_member.last_name),
        COALESCE(NULLIF(pg_catalog.btrim(p_email),''),v_member.email),
        COALESCE(NULLIF(pg_catalog.btrim(p_phone),''),v_member.phone),v_actor_id,v_capacity_status)
      RETURNING * INTO v_result;
      RETURN v_result;
    ELSE
      IF NOT private.has_permission('manage_events',COALESCE(v_event.branch_id,v_actor.branch_id)) THEN
        RAISE EXCEPTION 'Only event managers may register guests.' USING ERRCODE = '42501';
      END IF;
      IF NULLIF(pg_catalog.btrim(p_member_name),'') IS NULL THEN RAISE EXCEPTION 'A guest name is required.' USING ERRCODE = '22023'; END IF;
      SELECT count(*)::integer INTO v_count FROM public.event_registrations r
      WHERE r.event_id=p_event_id AND r.status IN ('confirmed','checked_in','attended');
      v_capacity_status := CASE WHEN v_event.max_attendees IS NOT NULL AND v_count>=v_event.max_attendees THEN 'waitlist' ELSE 'confirmed' END;
      INSERT INTO public.event_registrations(event_id,member_id,member_name,email,phone,registered_by_profile_id,status)
      VALUES(p_event_id,NULL,pg_catalog.btrim(p_member_name),NULLIF(pg_catalog.btrim(p_email),''),
        NULLIF(pg_catalog.btrim(p_phone),''),v_actor_id,v_capacity_status)
      RETURNING * INTO v_result;
      RETURN v_result;
    END IF;
  END IF;
  IF p_registration_id IS NULL THEN RAISE EXCEPTION 'An event registration is required.' USING ERRCODE = '22023'; END IF;
  SELECT * INTO v_registration FROM public.event_registrations WHERE id=p_registration_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'The event registration could not be found.' USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO v_event FROM public.events WHERE id=v_registration.event_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'The event could not be found.' USING ERRCODE = '23503'; END IF;
  IF p_action='cancel' THEN
    IF v_registration.member_id IS DISTINCT FROM v_actor_id
      AND NOT private.has_permission('manage_events',COALESCE(v_event.branch_id,v_actor.branch_id)) THEN
      RAISE EXCEPTION 'You do not have permission to cancel this registration.' USING ERRCODE = '42501';
    END IF;
    IF v_registration.status IN ('cancelled','checked_in','attended') THEN
      RAISE EXCEPTION 'This registration can no longer be cancelled.' USING ERRCODE = '22023';
    END IF;
    UPDATE public.event_registrations SET status='cancelled' WHERE id=p_registration_id RETURNING * INTO v_result;
    RETURN v_result;
  END IF;
  IF NOT (private.has_permission('manage_attendance',COALESCE(v_event.branch_id,v_actor.branch_id))
    OR private.has_permission('manage_events',COALESCE(v_event.branch_id,v_actor.branch_id))) THEN
    RAISE EXCEPTION 'You do not have permission to manage event attendance.' USING ERRCODE = '42501';
  END IF;
  IF v_registration.status NOT IN ('confirmed','waitlist','absent','checked_in','attended') THEN
    RAISE EXCEPTION 'This registration is not eligible for attendance updates.' USING ERRCODE = '22023';
  END IF;
  IF p_action='check_in' THEN
    IF v_registration.status='waitlist' AND v_event.max_attendees IS NOT NULL THEN
      SELECT count(*)::integer INTO v_count FROM public.event_registrations r
      WHERE r.event_id=v_event.id AND r.status IN ('confirmed','checked_in','attended');
      IF v_count>=v_event.max_attendees THEN
        RAISE EXCEPTION 'The event is at capacity; this registration remains waitlisted.' USING ERRCODE = '22023';
      END IF;
    END IF;
    IF v_registration.member_id IS NOT NULL THEN
      SELECT * INTO v_member FROM public.profiles WHERE id=v_registration.member_id;
      IF v_event.branch_id IS NOT NULL AND v_member.branch_id IS DISTINCT FROM v_event.branch_id THEN
        RAISE EXCEPTION 'The member is no longer assigned to the event branch.' USING ERRCODE = '42501';
      END IF;
      v_session_branch_id := COALESCE(v_event.branch_id,v_member.branch_id,v_actor.branch_id);
      IF v_session_branch_id IS NULL THEN RAISE EXCEPTION 'An attendance branch is required for this event.' USING ERRCODE = '22023'; END IF;
      INSERT INTO public.attendance_sessions(branch_id,event_id,title,session_date,session_type,created_by_profile_id)
      VALUES(v_session_branch_id,v_event.id,v_event.title,v_event.start_time::date,'event',v_actor_id)
      ON CONFLICT(event_id,session_date,branch_id) WHERE event_id IS NOT NULL DO NOTHING;
      SELECT id INTO v_session_id FROM public.attendance_sessions
      WHERE event_id=v_event.id AND session_date=v_event.start_time::date AND branch_id=v_session_branch_id;
      INSERT INTO public.attendance_records(session_id,member_id,attendance_status,check_in_time,recorded_by_profile_id)
      VALUES(v_session_id,v_registration.member_id,'present',now(),v_actor_id)
      ON CONFLICT(session_id,member_id) DO UPDATE SET attendance_status='present',
        check_in_time=EXCLUDED.check_in_time,recorded_by_profile_id=EXCLUDED.recorded_by_profile_id;
    END IF;
    UPDATE public.event_registrations SET status='checked_in',checked_in_at=now()
    WHERE id=p_registration_id RETURNING * INTO v_result;
    RETURN v_result;
  ELSE
    UPDATE public.event_registrations SET status='absent',checked_in_at=NULL
    WHERE id=p_registration_id RETURNING * INTO v_result;
    RETURN v_result;
  END IF;
END;
$$;
