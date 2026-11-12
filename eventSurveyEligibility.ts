import type { EventRegistration, EventSurvey } from './types';

type SurveyEligibilityInput = Pick<EventSurvey, 'status' | 'respondent_scope' | 'opens_at' | 'closes_at'>;
type RegistrationEligibilityInput = Pick<EventRegistration, 'status'> | null | undefined;

/**
 * Shared eligibility rule for member-facing survey discovery.
 * Database RLS remains the authoritative submission boundary.
 */
export function isMemberEligibleForSurvey(
  survey: SurveyEligibilityInput,
  registration: RegistrationEligibilityInput,
  nowMs: number = Date.now()
): boolean {
  if (survey.status !== 'published') return false;

  if (survey.opens_at) {
    const opensAt = Date.parse(survey.opens_at);
    if (!Number.isFinite(opensAt) || opensAt > nowMs) return false;
  }

  if (survey.closes_at) {
    const closesAt = Date.parse(survey.closes_at);
    if (!Number.isFinite(closesAt) || closesAt <= nowMs) return false;
  }

  if (survey.respondent_scope === 'all_members') return true;
  if (!registration) return false;

  const registrantStatuses = ['confirmed', 'checked_in', 'attended', 'absent'];
  const attendeeStatuses = ['checked_in', 'attended'];

  if (survey.respondent_scope === 'registrants') return registrantStatuses.includes(registration.status);
  if (survey.respondent_scope === 'attendees') return attendeeStatuses.includes(registration.status);
  return false;
}
