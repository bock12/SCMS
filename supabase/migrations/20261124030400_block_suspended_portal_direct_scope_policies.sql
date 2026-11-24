-- MEM-INT-003: prevent suspended/revoked portal identities from using
-- direct auth.uid()-based branch shortcuts. All private branch membership
-- checks now resolve through private.current_profile_id(), which requires an
-- active portal link and active directory record.

DROP POLICY IF EXISTS profiles_self_update ON public.profiles;
CREATE POLICY profiles_self_update
ON public.profiles
FOR UPDATE
TO authenticated
USING (id = private.current_profile_id())
WITH CHECK (id = private.current_profile_id());

DROP POLICY IF EXISTS attendance_sessions_scoped_read ON public.attendance_sessions;
CREATE POLICY attendance_sessions_scoped_read
ON public.attendance_sessions
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles AS member_profile
    WHERE member_profile.id = private.current_profile_id()
      AND member_profile.branch_id = attendance_sessions.branch_id
  )
  OR private.can_access_branch(branch_id)
  OR private.has_permission('view_attendance', branch_id)
);

DROP POLICY IF EXISTS resources_authenticated_read ON public.church_resources;
CREATE POLICY resources_authenticated_read
ON public.church_resources
FOR SELECT
TO authenticated
USING (
  status = 'published'
  AND (
    visibility = 'public'
    OR (visibility = 'members_only' AND private.current_profile_id() IS NOT NULL)
    OR (visibility = 'staff_only' AND private.has_permission('manage_resources', branch_id))
  )
  AND (
    branch_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM public.profiles AS member_profile
      WHERE member_profile.id = private.current_profile_id()
        AND member_profile.branch_id = church_resources.branch_id
    )
    OR private.can_access_branch(branch_id)
    OR private.has_permission('view_resources', branch_id)
    OR private.has_permission('manage_resources', branch_id)
  )
);

DROP POLICY IF EXISTS event_registrations_insert_self ON public.event_registrations;
CREATE POLICY event_registrations_insert_self
ON public.event_registrations
FOR INSERT
TO authenticated
WITH CHECK (
  member_id = private.current_profile_id()
  AND EXISTS (
    SELECT 1
    FROM public.events AS event
    WHERE event.id = event_registrations.event_id
      AND event.status = 'upcoming'
      AND (
        event.branch_id IS NULL
        OR EXISTS (
          SELECT 1
          FROM public.profiles AS member_profile
          WHERE member_profile.id = private.current_profile_id()
            AND member_profile.branch_id = event.branch_id
        )
        OR private.can_access_branch(event.branch_id)
        OR private.has_permission('register_for_events', event.branch_id)
      )
  )
);

DROP POLICY IF EXISTS events_authenticated_read ON public.events;
CREATE POLICY events_authenticated_read
ON public.events
FOR SELECT
TO authenticated
USING (
  branch_id IS NULL
  OR EXISTS (
    SELECT 1
    FROM public.profiles AS member_profile
    WHERE member_profile.id = private.current_profile_id()
      AND member_profile.branch_id = events.branch_id
  )
  OR private.can_access_branch(branch_id)
  OR private.has_permission('view_events', branch_id)
);

DROP POLICY IF EXISTS notifications_published_read ON public.notifications;
CREATE POLICY notifications_published_read
ON public.notifications
FOR SELECT
TO authenticated
USING (
  status = 'published'
  AND (
    branch_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM public.profiles AS member_profile
      WHERE member_profile.id = private.current_profile_id()
        AND member_profile.branch_id = notifications.branch_id
    )
    OR private.can_access_branch(branch_id)
  )
);

DROP POLICY IF EXISTS stream_chat_insert_self ON public.stream_chat_messages;
CREATE POLICY stream_chat_insert_self
ON public.stream_chat_messages
FOR INSERT
TO authenticated
WITH CHECK (
  sender_profile_id = private.current_profile_id()
  AND EXISTS (
    SELECT 1
    FROM public.streams AS stream
    WHERE stream.id = stream_chat_messages.stream_id
      AND stream.status = 'live'
      AND (
        stream.branch_id IS NULL
        OR EXISTS (
          SELECT 1
          FROM public.profiles AS member_profile
          WHERE member_profile.id = private.current_profile_id()
            AND member_profile.branch_id = stream.branch_id
        )
        OR private.can_access_branch(stream.branch_id)
        OR private.has_permission('send_stream_chat', stream.branch_id)
      )
      AND (stream.visibility = 'public' OR private.current_profile_id() IS NOT NULL)
  )
);

DROP POLICY IF EXISTS stream_chat_read ON public.stream_chat_messages;
CREATE POLICY stream_chat_read
ON public.stream_chat_messages
FOR SELECT
TO authenticated
USING (
  status = 'visible'
  AND EXISTS (
    SELECT 1
    FROM public.streams AS stream
    WHERE stream.id = stream_chat_messages.stream_id
      AND (
        stream.branch_id IS NULL
        OR EXISTS (
          SELECT 1
          FROM public.profiles AS member_profile
          WHERE member_profile.id = private.current_profile_id()
            AND member_profile.branch_id = stream.branch_id
        )
        OR private.can_access_branch(stream.branch_id)
        OR private.has_permission('view_streams', stream.branch_id)
      )
      AND (stream.visibility = 'public' OR private.current_profile_id() IS NOT NULL)
  )
);

DROP POLICY IF EXISTS streams_authenticated_read ON public.streams;
CREATE POLICY streams_authenticated_read
ON public.streams
FOR SELECT
TO authenticated
USING (
  status = ANY (ARRAY['scheduled', 'live', 'ended'])
  AND (visibility = 'public' OR private.current_profile_id() IS NOT NULL)
  AND (
    branch_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM public.profiles AS member_profile
      WHERE member_profile.id = private.current_profile_id()
        AND member_profile.branch_id = streams.branch_id
    )
    OR private.can_access_branch(branch_id)
    OR private.has_permission('view_streams', branch_id)
  )
);

DROP POLICY IF EXISTS welfare_campaigns_authenticated_read ON public.welfare_campaigns;
CREATE POLICY welfare_campaigns_authenticated_read
ON public.welfare_campaigns
FOR SELECT
TO authenticated
USING (
  status = 'active'
  AND (
    branch_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM public.profiles AS member_profile
      WHERE member_profile.id = private.current_profile_id()
        AND member_profile.branch_id = welfare_campaigns.branch_id
    )
    OR private.can_access_branch(branch_id)
    OR private.has_permission('manage_welfare', branch_id)
  )
);
