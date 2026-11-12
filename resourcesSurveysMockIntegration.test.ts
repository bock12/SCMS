import { beforeEach, describe, expect, test } from 'bun:test';

const values = new Map<string, string>();
const memoryStorage = {
  getItem(key: string) { return values.get(key) ?? null; },
  setItem(key: string, value: string) { values.set(key, String(value)); },
  removeItem(key: string) { values.delete(key); },
  clear() { values.clear(); },
  key(index: number) { return [...values.keys()][index] ?? null; },
  get length() { return values.size; }
};

Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: memoryStorage
});

const { saveChurchResource, getChurchResources, deleteChurchResource } = await import('./churchResourceService');
const { saveEventSurvey, getEventSurveys, getEventSurveyResponseReport } = await import('./eventSurveyService');
const { getMemberAvailableEventSurveys, submitMemberEventSurvey } = await import('./memberEventSurveyService');
const { supabase } = await import('./supabaseClient');

const now = '2026-11-12T12:00:00.000Z';

beforeEach(() => {
  memoryStorage.clear();
});

describe('Resources and post-event surveys mock-database integration', () => {
  test('admin resource publishing, member visibility, update and removal work end to end', async () => {
    const draft = await saveChurchResource({
      title: 'Leadership Handbook',
      description: 'A practical guide for ministry leaders.',
      category: 'Leadership',
      resource_type: 'document',
      resource_url: 'https://example.org/leadership.pdf',
      visibility: 'members',
      status: 'draft'
    });

    expect((await getChurchResources(false)).some(resource => resource.id === draft.id)).toBe(false);
    expect((await getChurchResources(true)).some(resource => resource.id === draft.id)).toBe(true);

    const published = await saveChurchResource({
      id: draft.id,
      title: 'Leadership Handbook',
      description: 'Updated ministry leadership guide.',
      category: 'Leadership',
      resource_type: 'document',
      resource_url: 'https://example.org/leadership-v2.pdf',
      visibility: 'members',
      status: 'published'
    });

    expect(published.id).toBe(draft.id);
    expect((await getChurchResources(false)).find(resource => resource.id === draft.id)?.resource_url)
      .toBe('https://example.org/leadership-v2.pdf');

    await deleteChurchResource(draft.id);
    expect((await getChurchResources(true)).some(resource => resource.id === draft.id)).toBe(false);
  });

  test('published survey is available to an active member, accepts feedback and appears in the response report', async () => {
    const survey = await saveEventSurvey({
      event_id: 'evt-1',
      title: 'Sunday Worship Feedback',
      description: 'Tell us how the service went.',
      respondent_scope: 'all_members',
      status: 'published',
      opens_at: null,
      closes_at: null
    }, [{
      question_text: 'How would you rate the service?',
      question_type: 'rating',
      is_required: true,
      options: [],
      sort_order: 0
    }]);

    const adminSurveys = await getEventSurveys('evt-1');
    expect(adminSurveys.some(row => row.id === survey.id && row.questions.length === 1)).toBe(true);

    const available = await getMemberAvailableEventSurveys('usr-member-1');
    const memberSurvey = available.find(row => row.id === survey.id);
    expect(memberSurvey).toBeDefined();
    expect(memberSurvey?.already_submitted).toBe(false);

    await submitMemberEventSurvey('usr-member-1', survey.id, [{
      question_id: survey.questions[0].id,
      answer_value: 5
    }]);

    const refreshed = await getMemberAvailableEventSurveys('usr-member-1');
    expect(refreshed.find(row => row.id === survey.id)?.already_submitted).toBe(true);

    const report = await getEventSurveyResponseReport(survey.id);
    expect(report).toHaveLength(1);
    expect(report[0].member_name).toBe('Grace Campbell');
    expect(report[0].answers).toEqual([{
      question_id: survey.questions[0].id,
      question_text: 'How would you rate the service?',
      answer_value: 5
    }]);
  });

  test('attendee-only surveys are hidden until the member has an attendance registration', async () => {
    const survey = await saveEventSurvey({
      event_id: 'evt-2',
      title: 'Conference Attendee Feedback',
      description: 'Feedback for attendees.',
      respondent_scope: 'attendees',
      status: 'published',
      opens_at: null,
      closes_at: null
    }, []);

    expect((await getMemberAvailableEventSurveys('usr-member-1')).some(row => row.id === survey.id)).toBe(false);

    const { error } = await supabase.from('event_registrations').insert({
      event_id: 'evt-2',
      member_id: 'mem-5',
      member_name: 'Grace Campbell',
      email: 'member@faithconnect.church',
      status: 'checked_in'
    });
    expect(error).toBeNull();

    expect((await getMemberAvailableEventSurveys('usr-member-1')).some(row => row.id === survey.id)).toBe(true);
  });

  test('inactive or unlinked profiles cannot discover or submit member surveys', async () => {
    const survey = await saveEventSurvey({
      event_id: 'evt-1',
      title: 'Member-only Feedback',
      description: '',
      respondent_scope: 'all_members',
      status: 'published',
      opens_at: null,
      closes_at: null
    }, []);

    expect(await getMemberAvailableEventSurveys('unknown-profile')).toEqual([]);
    await expect(submitMemberEventSurvey('unknown-profile', survey.id, [])).rejects.toThrow(
      'Your account is not linked to an active member record.'
    );
  });

  test('dashboard resource and survey totals reflect records in the mock database', async () => {
    await saveChurchResource({
      title: 'Published Guide',
      description: '',
      category: 'General',
      resource_type: 'document',
      resource_url: 'https://example.org/guide.pdf',
      visibility: 'members',
      status: 'published'
    });
    await saveChurchResource({
      title: 'Draft Guide',
      description: '',
      category: 'General',
      resource_type: 'document',
      resource_url: 'https://example.org/draft.pdf',
      visibility: 'members',
      status: 'draft'
    });
    const survey = await saveEventSurvey({
      event_id: 'evt-1',
      title: 'Dashboard Survey',
      description: '',
      respondent_scope: 'all_members',
      status: 'published',
      opens_at: null,
      closes_at: null
    }, []);

    await submitMemberEventSurvey('usr-member-1', survey.id, []);

    const [resources, surveys, responses] = await Promise.all([
      supabase.from('church_resources').select('*', { count: 'exact', head: true }).eq('status', 'published'),
      supabase.from('event_surveys').select('*', { count: 'exact', head: true }).eq('status', 'published'),
      supabase.from('event_survey_responses').select('*', { count: 'exact', head: true })
    ]);

    expect(resources.count).toBe(1);
    expect(surveys.count).toBe(1);
    expect(responses.count).toBe(1);
  });
});
