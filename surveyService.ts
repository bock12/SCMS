export interface PostEventSurvey {
  id: string;
  event_id: string;
  event_title: string;
  survey_url: string;
  is_active: boolean;
  sent_at: string;
  sent_count: number;
}

export interface SurveyResponse {
  id: string;
  survey_id: string;
  event_id: string;
  respondent_name: string;
  overall_rating: number; // 1 to 5 stars
  spiritual_impact_rating: number; // 1 to 5 stars
  sound_media_rating: number; // 1 to 5 stars
  hospitality_rating: number; // 1 to 5 stars
  feedback_text: string;
  submitted_at: string;
  sentiment: 'Positive' | 'Neutral' | 'Constructive';
}

export interface SentimentSummary {
  event_id: string;
  total_responses: number;
  avg_overall_rating: number;
  avg_spiritual_rating: number;
  avg_sound_rating: number;
  avg_hospitality_rating: number;
  positive_percentage: number;
  neutral_percentage: number;
  constructive_percentage: number;
  overall_sentiment_label: 'Overwhelmingly Positive' | 'Generally Positive' | 'Mixed Feedback' | 'Needs Improvement';
}

const SURVEYS_STORAGE_KEY = 'faithconnect_event_surveys_v1';
const RESPONSES_STORAGE_KEY = 'faithconnect_survey_responses_v1';

export const INITIAL_RESPONSES: SurveyResponse[] = [
  {
    id: 'resp-1',
    survey_id: 'surv-evt-1',
    event_id: 'evt-1',
    respondent_name: 'Sister Mary Koroma',
    overall_rating: 5,
    spiritual_impact_rating: 5,
    sound_media_rating: 4,
    hospitality_rating: 5,
    feedback_text: 'The keynote sermon was deeply anointed and transformed my spiritual walk! Worship choir sounded divine.',
    submitted_at: new Date(Date.now() - 86400000).toISOString(),
    sentiment: 'Positive'
  },
  {
    id: 'resp-2',
    survey_id: 'surv-evt-1',
    event_id: 'evt-1',
    respondent_name: 'Deacon James Bangura',
    overall_rating: 5,
    spiritual_impact_rating: 5,
    sound_media_rating: 5,
    hospitality_rating: 4,
    feedback_text: 'Organized check-in at sanctuary doors was fast and efficient. Wonderful fellowship lunch afterwards.',
    submitted_at: new Date(Date.now() - 43200000).toISOString(),
    sentiment: 'Positive'
  },
  {
    id: 'resp-3',
    survey_id: 'surv-evt-1',
    event_id: 'evt-1',
    respondent_name: 'Brother Joseph Bio',
    overall_rating: 4,
    spiritual_impact_rating: 5,
    sound_media_rating: 3,
    hospitality_rating: 4,
    feedback_text: 'Great revival service! Suggest adding 2 extra wireless microphones for the altar prayer team next time.',
    submitted_at: new Date(Date.now() - 21600000).toISOString(),
    sentiment: 'Constructive'
  }
];

export const getSurveyResponses = (eventId: string): SurveyResponse[] => {
  try {
    const raw = localStorage.getItem(RESPONSES_STORAGE_KEY);
    if (raw) {
      const all: SurveyResponse[] = JSON.parse(raw);
      const filtered = all.filter(r => r.event_id === eventId);
      if (filtered.length > 0) return filtered;
    }
  } catch (e) {
    console.error("Error reading survey responses:", e);
  }
  return INITIAL_RESPONSES;
};

export const saveSurveyResponse = (response: SurveyResponse): void => {
  try {
    const raw = localStorage.getItem(RESPONSES_STORAGE_KEY);
    const all: SurveyResponse[] = raw ? JSON.parse(raw) : INITIAL_RESPONSES;
    all.unshift(response);
    localStorage.setItem(RESPONSES_STORAGE_KEY, JSON.stringify(all));
    window.dispatchEvent(new Event('survey_responses_updated'));
  } catch (e) {
    console.error("Error saving survey response:", e);
  }
};

export const calculateSentimentSummary = (eventId: string): SentimentSummary => {
  const responses = getSurveyResponses(eventId);
  if (responses.length === 0) {
    return {
      event_id: eventId,
      total_responses: 0,
      avg_overall_rating: 5.0,
      avg_spiritual_rating: 5.0,
      avg_sound_rating: 5.0,
      avg_hospitality_rating: 5.0,
      positive_percentage: 100,
      neutral_percentage: 0,
      constructive_percentage: 0,
      overall_sentiment_label: 'Overwhelmingly Positive'
    };
  }

  const total = responses.length;
  const avgOverall = Number((responses.reduce((sum, r) => sum + r.overall_rating, 0) / total).toFixed(1));
  const avgSpiritual = Number((responses.reduce((sum, r) => sum + r.spiritual_impact_rating, 0) / total).toFixed(1));
  const avgSound = Number((responses.reduce((sum, r) => sum + r.sound_media_rating, 0) / total).toFixed(1));
  const avgHospitality = Number((responses.reduce((sum, r) => sum + r.hospitality_rating, 0) / total).toFixed(1));

  const posCount = responses.filter(r => r.sentiment === 'Positive').length;
  const neuCount = responses.filter(r => r.sentiment === 'Neutral').length;
  const conCount = responses.filter(r => r.sentiment === 'Constructive').length;

  const posPct = Math.round((posCount / total) * 100);
  const neuPct = Math.round((neuCount / total) * 100);
  const conPct = Math.round((conCount / total) * 100);

  let label: SentimentSummary['overall_sentiment_label'] = 'Overwhelmingly Positive';
  if (avgOverall >= 4.5) label = 'Overwhelmingly Positive';
  else if (avgOverall >= 3.8) label = 'Generally Positive';
  else if (avgOverall >= 3.0) label = 'Mixed Feedback';
  else label = 'Needs Improvement';

  return {
    event_id: eventId,
    total_responses: total,
    avg_overall_rating: avgOverall,
    avg_spiritual_rating: avgSpiritual,
    avg_sound_rating: avgSound,
    avg_hospitality_rating: avgHospitality,
    positive_percentage: posPct,
    neutral_percentage: neuPct,
    constructive_percentage: conPct,
    overall_sentiment_label: label
  };
};
