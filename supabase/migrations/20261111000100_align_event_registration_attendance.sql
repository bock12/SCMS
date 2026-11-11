-- EVENTS-INT-001: align event registration and attendance persistence.
-- Safe to apply to an existing SCMS Supabase database.

ALTER TABLE public.event_registrations
  ADD COLUMN IF NOT EXISTS member_id UUID REFERENCES public.members(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS checked_in_at TIMESTAMPTZ;

-- The application uses these statuses across RSVP, waitlist, and attendance.
-- Keep the legacy 'attended' value valid for existing records.
ALTER TABLE public.event_registrations
  DROP CONSTRAINT IF EXISTS event_registrations_status_check;

ALTER TABLE public.event_registrations
  ADD CONSTRAINT event_registrations_status_check
  CHECK (status IN ('confirmed', 'cancelled', 'waitlist', 'checked_in', 'absent', 'attended'));

CREATE INDEX IF NOT EXISTS idx_event_registrations_event_id
  ON public.event_registrations(event_id);

CREATE INDEX IF NOT EXISTS idx_event_registrations_member_id
  ON public.event_registrations(member_id);

CREATE INDEX IF NOT EXISTS idx_event_registrations_user_id
  ON public.event_registrations(user_id);
