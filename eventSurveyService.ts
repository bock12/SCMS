import type {
  EventSurvey,
  EventSurveyAnswer,
  EventSurveyQuestion,
  EventSurveyResponse
} from './types';
import { supabase } from './supabaseClient';

export interface EventSurveyWithQuestions extends EventSurvey {
  questions: EventSurveyQuestion[];
}

export async function getEventSurveys(eventId: string): Promise<EventSurveyWithQuestions[]> {
  const { data: surveys, error } = await supabase
    .from('event_surveys')
    .select('*')
    .eq('event_id', eventId)
    .order('created_at', { ascending: false });
  if (error) throw error;

  const surveyRows = (surveys || []) as EventSurvey[];
  if (surveyRows.length === 0) return [];

  const questionResults = await Promise.all(surveyRows.map(async survey => {
    const { data, error: questionError } = await supabase
      .from('event_survey_questions')
      .select('*')
      .eq('survey_id', survey.id)
      .order('sort_order', { ascending: true });
    if (questionError) throw questionError;
    return { ...survey, questions: (data || []) as EventSurveyQuestion[] };
  }));
  return questionResults;
}

export async function saveEventSurvey(
  survey: Omit<EventSurvey, 'id' | 'created_at' | 'updated_at'> & { id?: string },
  questions: Array<Omit<EventSurveyQuestion, 'id' | 'survey_id' | 'created_at'>>
): Promise<EventSurveyWithQuestions> {
  const now = new Date().toISOString();
  const payload = { ...survey, updated_at: now };
  const surveyQuery = survey.id
    ? supabase.from('event_surveys').update(payload).eq('id', survey.id).select('*').single()
    : supabase.from('event_surveys').insert({ ...payload, created_at: now }).select('*').single();
  const { data: savedSurvey, error } = await surveyQuery;
  if (error) throw error;
  const normalizedSurvey = Array.isArray(savedSurvey) ? savedSurvey[0] : savedSurvey;
  if (!normalizedSurvey) throw new Error('The event survey could not be saved.');

  const surveyId = (normalizedSurvey as EventSurvey).id;
  const { error: clearError } = await supabase
    .from('event_survey_questions')
    .delete()
    .eq('survey_id', surveyId);
  if (clearError) throw clearError;

  if (questions.length > 0) {
    const questionRows = questions.map((question, index) => ({
      ...question,
      survey_id: surveyId,
      sort_order: question.sort_order ?? index
    }));
    const { data, error: questionError } = await supabase
      .from('event_survey_questions')
      .insert(questionRows)
      .select('*');
    if (questionError) throw questionError;
    return { ...(normalizedSurvey as EventSurvey), questions: (data || []) as EventSurveyQuestion[] };
  }

  return { ...(savedSurvey as EventSurvey), questions: [] };
}

export async function submitEventSurveyResponse(
  surveyId: string,
  memberId: string,
  answers: Array<Pick<EventSurveyAnswer, 'question_id' | 'answer_value'>>
): Promise<EventSurveyResponse> {
  const { data: response, error } = await supabase
    .from('event_survey_responses')
    .insert({ survey_id: surveyId, member_id: memberId, submitted_at: new Date().toISOString() })
    .select('*')
    .single();
  if (error) throw error;
  const normalizedResponse = Array.isArray(response) ? response[0] : response;
  if (!normalizedResponse) throw new Error('The survey response could not be recorded.');

  if (answers.length > 0) {
    const answerRows = answers.map(answer => ({
      response_id: (normalizedResponse as EventSurveyResponse).id,
      question_id: answer.question_id,
      answer_value: answer.answer_value
    }));
    const { error: answerError } = await supabase.from('event_survey_answers').insert(answerRows);
    if (answerError) {
      await supabase.from('event_survey_responses').delete().eq('id', (response as EventSurveyResponse).id);
      throw answerError;
    }
  }
  return normalizedResponse as EventSurveyResponse;
}

export async function getEventSurveyResponseCount(surveyId: string): Promise<number> {
  const { count, error } = await supabase
    .from('event_survey_responses')
    .select('*', { count: 'exact', head: true })
    .eq('survey_id', surveyId);
  if (error) throw error;
  return count || 0;
}
