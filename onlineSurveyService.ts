import type { EventSurveyAnswer, EventSurveyResponse } from './types';
import { requireSupabaseDataClient } from './supabaseIntegration';

/**
 * Submit a survey using the currently authenticated Supabase user.
 *
 * Unlike the demo service, the member identity is derived by the database
 * from auth.uid(). The RPC and its RLS policies perform the authoritative
 * eligibility checks and persist the response and answers atomically.
 */
export async function submitAuthenticatedMemberSurvey(
  surveyId: string,
  answers: Array<Pick<EventSurveyAnswer, 'question_id' | 'answer_value'>>
): Promise<EventSurveyResponse> {
  const client = requireSupabaseDataClient();
  const { data, error } = await client.rpc('submit_event_survey_response', {
    p_survey_id: surveyId,
    p_answers: answers.map(answer => ({
      question_id: answer.question_id,
      answer_value: answer.answer_value
    }))
  });

  if (error) throw error;
  if (!data) throw new Error('The survey response could not be recorded.');
  return data as EventSurveyResponse;
}
