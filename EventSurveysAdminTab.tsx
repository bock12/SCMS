import React, { useEffect, useState } from 'react';
import type { ChurchEvent, EventSurveyQuestionType, EventSurveyRespondentScope } from './types';
import type { Profile } from './types';
import { getEventSurveys, saveEventSurvey, getEventSurveyResponseReport } from './eventSurveyService';
import type { EventSurveyWithQuestions, EventSurveyWithQuestions as SurveyWithQuestions, EventSurveyReportRow } from './eventSurveyService';

type DraftQuestion = {
  question_text: string;
  question_type: EventSurveyQuestionType;
  is_required: boolean;
  options: string[];
  sort_order: number;
};

const newQuestion = (sort_order: number): DraftQuestion => ({
  question_text: '',
  question_type: 'short_text',
  is_required: false,
  options: [],
  sort_order
});

export function EventSurveysAdminTab({ profile }: { profile: Profile }) {
  const [events, setEvents] = useState<ChurchEvent[]>([]);
  const [eventId, setEventId] = useState('');
  const [surveys, setSurveys] = useState<SurveyWithQuestions[]>([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [scope, setScope] = useState<EventSurveyRespondentScope>('attendees');
  const [questions, setQuestions] = useState<DraftQuestion[]>([newQuestion(0)]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [reportSurveyId, setReportSurveyId] = useState('');
  const [reportRows, setReportRows] = useState<EventSurveyReportRow[]>([]);
  const [reportLoading, setReportLoading] = useState(false);

  useEffect(() => {
    const loadEvents = async () => {
      try {
        const { data, error: eventError } = await (await import('./supabaseClient')).supabase
          .from('events').select('*').order('start_time', { ascending: false });
        if (eventError) throw eventError;
        const rows = (data || []) as ChurchEvent[];
        setEvents(rows);
        if (rows[0]) setEventId(rows[0].id);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not load events.');
      } finally {
        setLoading(false);
      }
    };
    void loadEvents();
  }, []);

  const refreshSurveys = async (selectedEventId: string) => {
    if (!selectedEventId) { setSurveys([]); return; }
    try {
      setSurveys(await getEventSurveys(selectedEventId));
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load event surveys.');
    }
  };

  useEffect(() => { void refreshSurveys(eventId); }, [eventId]);

  const changeQuestion = (index: number, changes: Partial<DraftQuestion>) => {
    setQuestions(current => current.map((question, i) => i === index ? { ...question, ...changes } : question));
  };

  const createSurvey = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!eventId || !title.trim() || questions.some(question => !question.question_text.trim() || (['single_choice', 'multiple_choice'].includes(question.question_type) && question.options.length < 2))) {
      setError('Select an event, enter a survey title, complete every question, and provide at least two options for each choice question.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await saveEventSurvey({
        event_id: eventId,
        title: title.trim(),
        description: description.trim(),
        respondent_scope: scope,
        status: 'draft',
        created_by: profile.id
      }, questions.map((question, index) => ({ ...question, sort_order: index })));
      setTitle('');
      setDescription('');
      setScope('attendees');
      setQuestions([newQuestion(0)]);
      await refreshSurveys(eventId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the survey.');
    } finally {
      setSaving(false);
    }
  };

  const viewResponses = async (survey: EventSurveyWithQuestions) => {
    setReportSurveyId(survey.id);
    setReportLoading(true);
    setError('');
    try {
      setReportRows(await getEventSurveyResponseReport(survey.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load survey responses.');
      setReportRows([]);
    } finally {
      setReportLoading(false);
    }
  };

  const changeStatus = async (survey: EventSurveyWithQuestions, status: 'published' | 'closed') => {
    setSaving(true);
    setError('');
    try {
      await saveEventSurvey({
        id: survey.id,
        event_id: survey.event_id,
        title: survey.title,
        description: survey.description,
        respondent_scope: survey.respondent_scope,
        status,
        opens_at: survey.opens_at,
        closes_at: survey.closes_at,
        created_by: survey.created_by
      }, survey.questions.map(question => ({
        question_text: question.question_text,
        question_type: question.question_type,
        is_required: question.is_required,
        options: question.options,
        sort_order: question.sort_order
      })));
      await refreshSurveys(eventId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update survey status.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="space-y-6">
      <header className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm">
        <p className="text-xs font-black uppercase tracking-widest text-indigo-600">Event Feedback</p>
        <h2 className="text-2xl font-black text-slate-900 mt-1">Post-Event Surveys</h2>
        <p className="text-sm text-slate-500 mt-2">Create feedback forms tied directly to church events. Responses are linked to member records and protected by database policies.</p>
      </header>

      {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}

      <div className="bg-white rounded-3xl border border-slate-200 p-6">
        <label className="block text-xs font-bold text-slate-600">Choose an event
          <select value={eventId} onChange={e => setEventId(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 p-3 text-sm">
            <option value="">Select event</option>
            {events.map(event => <option key={event.id} value={event.id}>{event.title}</option>)}
          </select>
        </label>
        {loading && <p className="text-sm text-slate-500 mt-3">Loading events…</p>}
        {!loading && events.length === 0 && <p className="text-sm text-amber-700 mt-3">Create an event before building its post-event survey.</p>}
      </div>

      <form onSubmit={createSurvey} className="bg-white rounded-3xl border border-slate-200 p-6 space-y-4">
        <h3 className="font-extrabold text-slate-900">Create survey</h3>
        <label className="block text-xs font-bold text-slate-600">Survey title
          <input value={title} onChange={e => setTitle(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 p-3 text-sm" required />
        </label>
        <label className="block text-xs font-bold text-slate-600">Description
          <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} className="mt-1 w-full rounded-xl border border-slate-200 p-3 text-sm" />
        </label>
        <label className="block text-xs font-bold text-slate-600">Who can respond?
          <select value={scope} onChange={e => setScope(e.target.value as EventSurveyRespondentScope)} className="mt-1 w-full rounded-xl border border-slate-200 p-3 text-sm">
            <option value="attendees">Checked-in attendees</option><option value="registrants">Event registrants</option><option value="all_members">All active members</option>
          </select>
        </label>

        <div className="space-y-3">
          <div className="flex items-center justify-between"><h4 className="font-bold text-slate-800">Questions</h4><button type="button" onClick={() => setQuestions(current => [...current, newQuestion(current.length)])} className="text-xs font-bold text-indigo-600">+ Add question</button></div>
          {questions.map((question, index) => (
            <div key={index} className="rounded-2xl border border-slate-200 p-4 space-y-3">
              <div className="flex items-center justify-between"><span className="text-xs font-black text-slate-500">QUESTION {index + 1}</span>{questions.length > 1 && <button type="button" onClick={() => setQuestions(current => current.filter((_, i) => i !== index))} className="text-xs font-bold text-rose-600">Remove</button>}</div>
              <input value={question.question_text} onChange={e => changeQuestion(index, { question_text: e.target.value })} placeholder="Enter your question" className="w-full rounded-xl border border-slate-200 p-3 text-sm" required />
              <div className="flex flex-col sm:flex-row gap-3">
                <select value={question.question_type} onChange={e => changeQuestion(index, { question_type: e.target.value as EventSurveyQuestionType })} className="flex-1 rounded-xl border border-slate-200 p-3 text-sm">
                  <option value="short_text">Short answer</option><option value="long_text">Long answer</option><option value="single_choice">Single choice</option><option value="multiple_choice">Multiple choice</option><option value="rating">Rating (1–5)</option><option value="yes_no">Yes / No</option>
                </select>
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-600"><input type="checkbox" checked={question.is_required} onChange={e => changeQuestion(index, { is_required: e.target.checked })} /> Required</label>
              </div>
              {['single_choice', 'multiple_choice'].includes(question.question_type) && (
                <input value={question.options.join(', ')} onChange={e => changeQuestion(index, { options: e.target.value.split(',').map(option => option.trim()).filter(Boolean) })} placeholder="Options separated by commas" className="w-full rounded-xl border border-slate-200 p-3 text-sm" />
              )}
            </div>
          ))}
        </div>
        <button disabled={saving || !eventId} className="rounded-xl bg-indigo-600 px-5 py-3 text-sm font-bold text-white disabled:opacity-50">{saving ? 'Saving…' : 'Save as draft'}</button>
      </form>

      <div className="bg-white rounded-3xl border border-slate-200 p-6">
        <h3 className="font-extrabold text-slate-900">Surveys for this event</h3>
        {!eventId ? <p className="text-sm text-slate-500 py-6">Select an event to view its surveys.</p> : surveys.length === 0 ? <p className="text-sm text-slate-500 py-6">No surveys have been created for this event.</p> : (
          <div className="mt-3 divide-y divide-slate-100">
            {surveys.map(survey => (
              <article key={survey.id} className="py-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div><h4 className="font-bold text-slate-900">{survey.title}</h4><p className="text-xs text-slate-500 mt-1">{survey.questions.length} questions · {survey.respondent_scope.replace('_', ' ')} · {survey.status}</p><p className="text-sm text-slate-600 mt-1">{survey.description}</p></div>
                <div className="flex gap-2 shrink-0">
                  {survey.status === 'draft' && <button type="button" disabled={saving} onClick={() => void changeStatus(survey, 'published')} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white">Publish</button>}
                  {survey.status === 'published' && <button type="button" disabled={saving} onClick={() => void changeStatus(survey, 'closed')} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700">Close</button>}
                  <button type="button" disabled={reportLoading} onClick={() => void viewResponses(survey)} className="rounded-lg border border-indigo-200 px-3 py-2 text-xs font-bold text-indigo-700">View responses</button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      {reportSurveyId && (
        <section className="rounded-3xl bg-white border border-slate-200 p-6 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div><h3 className="font-extrabold text-slate-900">Survey responses</h3><p className="text-xs text-slate-500 mt-1">{reportRows.length} submitted response{reportRows.length === 1 ? '' : 's'}</p></div>
            <button type="button" onClick={() => { setReportSurveyId(''); setReportRows([]); }} className="text-xs font-bold text-slate-500">Close report</button>
          </div>
          {reportLoading ? <p className="py-6 text-sm text-slate-500">Loading responses…</p> : reportRows.length === 0 ? <p className="py-6 text-sm text-slate-500">No responses have been submitted for this survey yet.</p> : (
            <div className="space-y-3">
              {reportRows.map(row => (
                <article key={row.response.id} className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1"><h4 className="font-bold text-slate-900">{row.member_name}</h4><span className="text-xs text-slate-500">{new Date(row.response.submitted_at).toLocaleString()}</span></div>
                  <div className="mt-3 space-y-3">
                    {row.answers.map(answer => <div key={answer.question_id}><p className="text-xs font-bold text-slate-600">{answer.question_text}</p><p className="text-sm text-slate-800 mt-1 whitespace-pre-wrap">{Array.isArray(answer.answer_value) ? answer.answer_value.join(', ') : String(answer.answer_value)}</p></div>)}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}
    </section>
  );
}
