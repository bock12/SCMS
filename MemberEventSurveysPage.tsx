import React, { useEffect, useState } from 'react';
import type { Profile, EventSurveyQuestion } from './types';
import { getMemberAvailableEventSurveys, submitMemberEventSurvey } from './memberEventSurveyService';
import type { MemberEventSurvey } from './memberEventSurveyService';

type AnswerValue = string | number | boolean | string[];
const dateLabel = (value: string) => new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

export function MemberEventSurveysPage({ profile }: { profile: Profile }) {
  const [surveys, setSurveys] = useState<MemberEventSurvey[]>([]);
  const [selected, setSelected] = useState<MemberEventSurvey | null>(null);
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const refresh = async () => {
    setLoading(true);
    try {
      const rows = await getMemberAvailableEventSurveys(profile.id);
      setSurveys(rows);
      setSelected(current => current ? rows.find(row => row.id === current.id) || null : null);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load available surveys.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void refresh(); }, [profile.id]);

  const setAnswer = (question: EventSurveyQuestion, value: AnswerValue) => {
    setAnswers(current => ({ ...current, [question.id]: value }));
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selected) return;
    const missing = selected.questions.find(question => question.is_required && (answers[question.id] === undefined || answers[question.id] === '' || (Array.isArray(answers[question.id]) && (answers[question.id] as string[]).length === 0)));
    if (missing) {
      setError(`Please answer the required question: ${missing.question_text}`);
      return;
    }
    setSaving(true);
    setError('');
    try {
      const responseAnswers = selected.questions
        .filter(question => answers[question.id] !== undefined && answers[question.id] !== '')
        .map(question => ({ question_id: question.id, answer_value: answers[question.id] }));
      await submitMemberEventSurvey(profile.id, selected.id, responseAnswers);
      setNotice('Your feedback has been submitted. Thank you for helping us improve.');
      setAnswers({});
      setSelected(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Your feedback could not be submitted.');
    } finally {
      setSaving(false);
    }
  };

  const renderQuestion = (question: EventSurveyQuestion) => {
    const value = answers[question.id];
    if (question.question_type === 'long_text') return <textarea value={String(value ?? '')} onChange={e => setAnswer(question, e.target.value)} rows={4} className="mt-2 w-full rounded-xl border border-slate-200 p-3 text-sm" />;
    if (question.question_type === 'single_choice') return <div className="mt-2 space-y-2">{question.options.map(option => <label key={option} className="flex items-center gap-2 text-sm text-slate-700"><input type="radio" name={question.id} checked={value === option} onChange={() => setAnswer(question, option)} />{option}</label>)}</div>;
    if (question.question_type === 'multiple_choice') {
      const selectedOptions = Array.isArray(value) ? value : [];
      return <div className="mt-2 space-y-2">{question.options.map(option => <label key={option} className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={selectedOptions.includes(option)} onChange={e => setAnswer(question, e.target.checked ? [...selectedOptions, option] : selectedOptions.filter(item => item !== option))} />{option}</label>)}</div>;
    }
    if (question.question_type === 'rating') return <select value={String(value ?? '')} onChange={e => setAnswer(question, Number(e.target.value))} className="mt-2 w-full rounded-xl border border-slate-200 p-3 text-sm"><option value="">Choose a rating</option>{[1,2,3,4,5].map(n => <option key={n} value={n}>{n} {n === 1 ? '— Poor' : n === 5 ? '— Excellent' : ''}</option>)}</select>;
    if (question.question_type === 'yes_no') return <div className="mt-2 flex gap-4">{['Yes','No'].map(option => <label key={option} className="flex items-center gap-2 text-sm"><input type="radio" name={question.id} checked={value === (option === 'Yes')} onChange={() => setAnswer(question, option === 'Yes')} />{option}</label>)}</div>;
    return <input value={String(value ?? '')} onChange={e => setAnswer(question, e.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 p-3 text-sm" />;
  };

  return (
    <div className="space-y-6">
      <header className="rounded-3xl bg-white border border-slate-200 p-6 shadow-sm">
        <p className="text-xs font-black uppercase tracking-widest text-indigo-600">Your voice matters</p>
        <h1 className="text-2xl font-black text-slate-900 mt-1">Event Feedback</h1>
        <p className="text-sm text-slate-500 mt-2">Share feedback about events you attended and help the church improve future gatherings.</p>
      </header>
      {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</div>}
      {notice && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">{notice}</div>}
      {selected ? (
        <form onSubmit={submit} className="rounded-3xl bg-white border border-slate-200 p-6 space-y-5">
          <button type="button" onClick={() => { setSelected(null); setAnswers({}); }} className="text-xs font-bold text-indigo-600">← Back to surveys</button>
          <div><h2 className="text-xl font-black text-slate-900">{selected.title}</h2><p className="text-xs text-slate-500 mt-1">{selected.event_title} · {dateLabel(selected.event_start_time)}</p>{selected.description && <p className="text-sm text-slate-600 mt-3">{selected.description}</p>}</div>
          {selected.questions.map((question,index) => <div key={question.id} className="border-t border-slate-100 pt-4"><label className="block text-sm font-bold text-slate-800">{index+1}. {question.question_text}{question.is_required && <span className="text-rose-600"> *</span>}</label>{renderQuestion(question)}</div>)}
          <button disabled={saving} className="rounded-xl bg-indigo-600 px-5 py-3 text-sm font-bold text-white disabled:opacity-50">{saving ? 'Submitting…' : 'Submit feedback'}</button>
        </form>
      ) : (
        <section className="space-y-3">
          <h2 className="font-extrabold text-slate-900">Available surveys</h2>
          {loading ? <div className="rounded-2xl bg-white p-8 text-sm text-slate-500">Loading surveys…</div> : surveys.length === 0 ? <div className="rounded-2xl bg-white border border-slate-200 p-10 text-center"><h3 className="font-bold text-slate-800">No surveys available</h3><p className="text-sm text-slate-500 mt-2">When a survey is published for an event you are eligible for, it will appear here.</p></div> : surveys.map(survey => (
            <article key={survey.id} className="rounded-2xl bg-white border border-slate-200 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div><h3 className="font-bold text-slate-900">{survey.title}</h3><p className="text-xs text-slate-500 mt-1">{survey.event_title} · {dateLabel(survey.event_start_time)} · {survey.questions.length} questions</p><p className="text-sm text-slate-600 mt-2">{survey.description}</p></div>
              {survey.already_submitted ? <span className="text-xs font-bold text-emerald-700 bg-emerald-50 rounded-full px-3 py-2">Feedback submitted</span> : <button type="button" onClick={() => { setSelected(survey); setAnswers({}); setNotice(''); }} className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white">Give feedback</button>}
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
