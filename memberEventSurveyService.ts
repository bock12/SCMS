import type { EventSurvey, EventSurveyQuestion, EventSurveyResponse, EventRegistration, ChurchEvent, Profile } from './types';
import { supabase } from './supabaseClient';
import type { EventSurveyWithQuestions } from './eventSurveyService';
import { submitEventSurveyResponse } from './eventSurveyService';
import { isMemberEligibleForSurvey } from './eventSurveyEligibility';

export interface MemberEventSurvey extends EventSurveyWithQuestions {
  event_title: string;
  event_start_time: string;
  already_submitted: boolean;
}

async function resolveActiveMemberProfile(profileOrAuthId: string): Promise<Profile | null> {
  if (!profileOrAuthId.trim()) return null;

  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('*');
  if (error) throw error;

  const matched = ((profiles || []) as Profile[]).find(
    person =>
      (person.id === profileOrAuthId || person.auth_user_id === profileOrAuthId) &&
      (person.membership_status || 'active') === 'active'
  );
  return matched || null;
}

/**
 * Return only surveys for which the active member profile is eligible.
 * Eligibility is checked here for a useful UI and again by RLS on submission.
 */
export async function getMemberAvailableEventSurveys(profileId: string): Promise<MemberEventSurvey[]> {
  const member = await resolveActiveMemberProfile(profileId);
  if (!member) return [];

  const { data: surveys, error: surveyError } = await supabase
    .from('event_surveys').select('*').eq('status', 'published');
  if (surveyError) throw surveyError;
  const published = (surveys || []) as EventSurvey[];
  if (!published.length) return [];

  const eventIds = [...new Set(published.map(survey => survey.event_id))];
  const [eventsResult, registrationsResult, responsesResult] = await Promise.all([
    supabase.from('events').select('*').in('id', eventIds),
    supabase.from('event_registrations').select('*').eq('member_id', member.id).in('event_id', eventIds),
    supabase.from('event_survey_responses').select('survey_id').eq('member_id', member.id).in('survey_id', published.map(survey => survey.id))
  ]);
  if (eventsResult.error) throw eventsResult.error;
  if (registrationsResult.error) throw registrationsResult.error;
  if (responsesResult.error) throw responsesResult.error;

  const events = new Map(((eventsResult.data || []) as ChurchEvent[]).map(event => [event.id, event]));
  const registrations = (registrationsResult.data || []) as EventRegistration[];
  const submitted = new Set((responsesResult.data || []).map((row: { survey_id: string }) => row.survey_id));
  const available: MemberEventSurvey[] = [];

  for (const survey of published) {
    const event = events.get(survey.event_id);
    if (!event) continue;
    const registration = registrations.find(row => row.event_id === survey.event_id);
    if (!isMemberEligibleForSurvey(survey, registration)) continue;

    const { data: questions, error: questionError } = await supabase
      .from('event_survey_questions').select('*').eq('survey_id', survey.id).order('sort_order', { ascending: true });
    if (questionError) throw questionError;
    available.push({
      ...survey,
      event_title: event.title,
      event_start_time: event.start_time,
      questions: (questions || []) as EventSurveyQuestion[],
      already_submitted: submitted.has(survey.id)
    });
  }
  return available.sort((a, b) => new Date(b.event_start_time).getTime() - new Date(a.event_start_time).getTime());
}

export async function submitMemberEventSurvey(
  profileId: string,
  surveyId: string,
  answers: Array<{ question_id: string; answer_value: string | number | boolean | string[] }>
): Promise<EventSurveyResponse> {
  const member = await resolveActiveMemberProfile(profileId);
  if (!member) throw new Error('Your account is not linked to an active member record.');
  return submitEventSurveyResponse(surveyId, member.id, answers);
}
