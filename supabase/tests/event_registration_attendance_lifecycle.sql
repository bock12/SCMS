-- MEM-INT-004B regression coverage for canonical event registration and attendance.
BEGIN;
SELECT set_config('scms.mem_int_004b_actor_auth_id', (
  SELECT p.auth_user_id::text FROM public.profiles p
  JOIN public.profile_role_assignments a ON a.profile_id=p.id AND a.is_active
  JOIN public.roles r ON r.id=a.role_id AND r.is_active
  JOIN public.role_permissions rp ON rp.role_id=r.id
  JOIN public.permissions perm ON perm.id=rp.permission_id AND perm.key='manage_events'
  WHERE p.auth_user_id IS NOT NULL AND p.portal_access_status='active' AND p.record_status='active'
    AND a.scope_type='church'
  ORDER BY CASE r.name WHEN 'super_admin' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END LIMIT 1
), true);
SELECT set_config('scms.mem_int_004b_actor_profile_id',
  (SELECT id::text FROM public.profiles WHERE auth_user_id=current_setting('scms.mem_int_004b_actor_auth_id')::uuid LIMIT 1), true);
SELECT set_config('scms.mem_int_004b_branch_id',
  (SELECT branch_id::text FROM public.profiles WHERE id=current_setting('scms.mem_int_004b_actor_profile_id')::uuid), true);

DO $preflight$
BEGIN
  IF NULLIF(current_setting('scms.mem_int_004b_actor_auth_id', true), '') IS NULL
    OR NULLIF(current_setting('scms.mem_int_004b_actor_profile_id', true), '') IS NULL
    OR NULLIF(current_setting('scms.mem_int_004b_branch_id', true), '') IS NULL THEN
    RAISE EXCEPTION 'MEM-INT-004B requires an active church-wide event manager assigned to a branch.';
  END IF;
END;
$preflight$;

INSERT INTO public.profiles (branch_id, first_name, last_name, membership_date, membership_status)
VALUES (current_setting('scms.mem_int_004b_branch_id')::uuid, 'MEM-INT-004B', 'Event Member', CURRENT_DATE, 'active');
SELECT set_config('scms.mem_int_004b_member_id',
  (SELECT id::text FROM public.profiles WHERE first_name='MEM-INT-004B' AND last_name='Event Member' ORDER BY created_at DESC LIMIT 1), true);

INSERT INTO public.events (branch_id, title, start_time, end_time, status, registration_required, max_attendees, created_by_profile_id)
VALUES (current_setting('scms.mem_int_004b_branch_id')::uuid,
  'MEM-INT-004B Event ' || gen_random_uuid()::text, now()+interval '1 day', now()+interval '1 day 2 hours',
  'upcoming', true, 1, current_setting('scms.mem_int_004b_actor_profile_id')::uuid);
SELECT set_config('scms.mem_int_004b_event_id',
  (SELECT id::text FROM public.events WHERE title LIKE 'MEM-INT-004B Event %' ORDER BY created_at DESC LIMIT 1), true);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('scms.mem_int_004b_actor_auth_id'), true);

DO $registration_attendance$
DECLARE
  v_registration public.event_registrations;
  v_guest public.event_registrations;
  v_session_id uuid;
  v_attendance_status text;
  v_session jsonb;
  v_record jsonb;
BEGIN
  v_registration := public.manage_event_registration('register_member',
    current_setting('scms.mem_int_004b_event_id')::uuid, NULL,
    current_setting('scms.mem_int_004b_member_id')::uuid, NULL, NULL, NULL);
  IF v_registration.member_id <> current_setting('scms.mem_int_004b_member_id')::uuid
    OR v_registration.status <> 'confirmed' THEN
    RAISE EXCEPTION 'Member registration did not use the canonical profile ID or expected status.';
  END IF;

  BEGIN
    PERFORM public.manage_event_registration('register_member',
      current_setting('scms.mem_int_004b_event_id')::uuid, NULL,
      current_setting('scms.mem_int_004b_member_id')::uuid, NULL, NULL, NULL);
    RAISE EXCEPTION 'Duplicate member registration was unexpectedly accepted.';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  v_registration := public.manage_event_registration('check_in', NULL, v_registration.id, NULL, NULL, NULL, NULL);
  IF v_registration.status <> 'checked_in' THEN RAISE EXCEPTION 'Event check-in did not update the registration.'; END IF;

  SELECT s.id INTO v_session_id FROM public.attendance_sessions s
  WHERE s.event_id = current_setting('scms.mem_int_004b_event_id')::uuid;
  SELECT ar.attendance_status INTO v_attendance_status FROM public.attendance_records ar
  WHERE ar.session_id=v_session_id AND ar.member_id=current_setting('scms.mem_int_004b_member_id')::uuid;
  IF v_session_id IS NULL OR v_attendance_status <> 'present' THEN
    RAISE EXCEPTION 'Event check-in did not create the corresponding attendance record.';
  END IF;

  v_guest := public.manage_event_registration('register_guest',
    current_setting('scms.mem_int_004b_event_id')::uuid, NULL, NULL, 'MEM-INT-004B Guest', NULL, NULL);
  IF v_guest.member_id IS NOT NULL OR v_guest.status <> 'waitlist' THEN
    RAISE EXCEPTION 'Guest registration should remain unlinked and respect event capacity.';
  END IF;
  v_guest := public.manage_event_registration('cancel', NULL, v_guest.id, NULL, NULL, NULL, NULL);
  IF v_guest.status <> 'cancelled' THEN RAISE EXCEPTION 'Guest registration cancellation did not persist.'; END IF;

  v_session := public.manage_attendance('create_session', NULL,
    current_setting('scms.mem_int_004b_branch_id')::uuid, 'MEM-INT-004B Manual Attendance',
    CURRENT_DATE, 'service', NULL, 'present', NULL);
  v_session_id := (v_session->>'id')::uuid;
  v_record := public.manage_attendance('record', v_session_id, NULL, NULL, NULL, NULL,
    current_setting('scms.mem_int_004b_member_id')::uuid, 'late', 'Regression attendance note');
  IF v_record->>'attendance_status' <> 'late' THEN
    RAISE EXCEPTION 'Manual attendance recording did not persist the requested status.';
  END IF;
END;
$registration_attendance$;

DO $api_grants$
BEGIN
  IF NOT has_function_privilege('authenticated', 'public.manage_event_registration(text,uuid,uuid,uuid,text,text,text)', 'EXECUTE')
    OR has_function_privilege('anon', 'public.manage_event_registration(text,uuid,uuid,uuid,text,text,text)', 'EXECUTE')
    OR NOT has_function_privilege('authenticated', 'public.manage_attendance(text,uuid,uuid,text,date,text,uuid,text,text)', 'EXECUTE')
    OR has_function_privilege('anon', 'public.manage_attendance(text,uuid,uuid,text,date,text,uuid,text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Event registration or attendance RPC grants are incomplete.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p
    WHERE p.oid='private.manage_event_registration(text,uuid,uuid,uuid,text,text,text)'::regprocedure
      AND p.prosecdef AND EXISTS (SELECT 1 FROM unnest(p.proconfig) s WHERE s='search_path=""'))
    OR NOT EXISTS (SELECT 1 FROM pg_proc p
    WHERE p.oid='private.manage_attendance(text,uuid,uuid,text,date,text,uuid,text,text)'::regprocedure
      AND p.prosecdef AND EXISTS (SELECT 1 FROM unnest(p.proconfig) s WHERE s='search_path=""')) THEN
    RAISE EXCEPTION 'Event registration and attendance private APIs must be SECURITY DEFINER with empty search paths.';
  END IF;
END;
$api_grants$;
ROLLBACK;
