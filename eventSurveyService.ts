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

  // Preserve question IDs and submitted answers after the first response.
  const existingResponseCount = survey.id ? await getEventSurveyResponseCount(survey.id) : 0;
  const payload = { ...survey, updated_at: now };
  const surveyQuery = survey.id
    ? supabase.from('event_surveys').update(payload).eq('id', survey.id).select('*').single()
    : supabase.from('event_surveys').insert({ ...payload, created_at: now }).select('*').single();
  const { data: savedSurvey, error } = await surveyQuery;
  if (error) throw error;
  const normalizedSurvey = Array.isArray(savedSurvey) ? savedSurvey[0] : savedSurvey;
  if (!normalizedSurvey) throw new Error('The event survey could not be saved.');

  const saved = normalizedSurvey as EventSurvey;
  if (existingResponseCount > 0) {
    const { data, error: questionError } = await supabase
      .from('event_survey_questions')
      .select('*')
      .eq('survey_id', saved.id)
      .order('sort_order', { ascending: true });
    if (questionError) throw questionError;
    return { ...saved, questions: (data || []) as EventSurveyQuestion[] };
  }

  const { data: previousQuestions, error: previousError } = await supabase
    .from('event_survey_questions')
    .select('*')
    .eq('survey_id', saved.id);
  if (previousError) throw previousError;

  let savedQuestions: EventSurveyQuestion[] = [];
  if (questions.length > 0) {
    const questionRows = questions.map((question, index) => ({
      ...question,
      survey_id: saved.id,
      sort_order: question.sort_order ?? index
    }));
    const { data, error: questionError } = await supabase
      .from('event_survey_questions')
      .insert(questionRows)
      .select('*');
    if (questionError) throw questionError;
    savedQuestions = (data || []) as EventSurveyQuestion[];
  }

  // Insert the replacement set first, then remove old rows to avoid losing
  // the current question set if the replacement insert fails.
  for (const oldQuestion of (previousQuestions || []) as EventSurveyQuestion[]) {
    const { error: deleteError } = await supabase
      .from('event_survey_questions')
      .delete()
      .eq('id', oldQuestion.id);
    if (deleteError) throw deleteError;
  }

  return { ...saved, questions: savedQuestions };
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
      await supabase.from('event_survey_responses').delete().eq('id', (normalizedResponse as EventSurveyResponse).id);
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


export interface EventSurveyReportRow {
  response: EventSurveyResponse;
  member_name: string;
  answers: Array<{
    question_id: string;
    question_text: string;
    answer_value: EventSurveyAnswer['answer_value'];
  }>;
}

export async function getEventSurveyResponseReport(surveyId: string): Promise<EventSurveyReportRow[]> {
  const [questionsResult, responsesResult] = await Promise.all([
    supabase.from('event_survey_questions').select('*').eq('survey_id', surveyId).order('sort_order', { ascending: true }),
    supabase.from('event_survey_responses').select('*').eq('survey_id', surveyId).order('submitted_at', { ascending: false })
  ]);
  if (questionsResult.error) throw questionsResult.error;
  if (responsesResult.error) throw responsesResult.error;

  const questions = (questionsResult.data || []) as EventSurveyQuestion[];
  const responses = (responsesResult.data || []) as EventSurveyResponse[];
  if (!responses.length) return [];

  const responseIds = responses.map(response => response.id);
  const memberIds = [...new Set(responses.map(response => response.member_id))];
  const [answersResult, profilesResult] = await Promise.all([
    supabase.from('event_survey_answers').select('*').in('response_id', responseIds),
    supabase.from('profiles').select('*').in('id', memberIds)
  ]);
  if (answersResult.error) throw answersResult.error;
  if (profilesResult.error) throw profilesResult.error;

  const answers = (answersResult.data || []) as EventSurveyAnswer[];
  const members = new Map(((profilesResult.data || []) as Array<{ id: string; first_name: string; last_name: string }>).map(person => [person.id, person]));
  const questionText = new Map(questions.map(question => [question.id, question.question_text]));

  return responses.map(response => ({
    response,
    member_name: (() => {
      const member = members.get(response.member_id);
      return member ? `${member.first_name} ${member.last_name}`.trim() : 'Member record unavailable';
    })(),
    answers: answers
      .filter(answer => answer.response_id === response.id)
      .map(answer => ({
        question_id: answer.question_id,
        question_text: questionText.get(answer.question_id) || 'Question no longer available',
        answer_value: answer.answer_value
      }))
  }));
}
