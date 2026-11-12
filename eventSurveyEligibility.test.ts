import { describe, expect, test } from 'bun:test';
import { isMemberEligibleForSurvey } from './eventSurveyEligibility';

const baseSurvey = {
  status: 'published' as const,
  respondent_scope: 'all_members' as const,
  opens_at: null,
  closes_at: null
};

describe('isMemberEligibleForSurvey', () => {
  test('allows published all-member surveys without a registration', () => {
    expect(isMemberEligibleForSurvey(baseSurvey, null, Date.parse('2026-11-12T12:00:00Z'))).toBe(true);
  });

  test('rejects drafts and closed surveys', () => {
    expect(isMemberEligibleForSurvey({ ...baseSurvey, status: 'draft' }, null, Date.now())).toBe(false);
    expect(isMemberEligibleForSurvey({ ...baseSurvey, status: 'closed' }, null, Date.now())).toBe(false);
  });

  test('enforces opening and closing boundaries', () => {
    const now = Date.parse('2026-11-12T12:00:00Z');
    expect(isMemberEligibleForSurvey({ ...baseSurvey, opens_at: '2026-11-12T12:00:01Z' }, null, now)).toBe(false);
    expect(isMemberEligibleForSurvey({ ...baseSurvey, closes_at: '2026-11-12T12:00:00Z' }, null, now)).toBe(false);
    expect(isMemberEligibleForSurvey({ ...baseSurvey, opens_at: '2026-11-12T11:00:00Z', closes_at: '2026-11-12T13:00:00Z' }, null, now)).toBe(true);
  });

  test('rejects invalid date values safely', () => {
    expect(isMemberEligibleForSurvey({ ...baseSurvey, opens_at: 'not-a-date' }, null)).toBe(false);
    expect(isMemberEligibleForSurvey({ ...baseSurvey, closes_at: 'not-a-date' }, null)).toBe(false);
  });

  test('allows registrants only for qualifying registration states', () => {
    const survey = { ...baseSurvey, respondent_scope: 'registrants' as const };
    for (const status of ['confirmed', 'checked_in', 'attended', 'absent'] as const) {
      expect(isMemberEligibleForSurvey(survey, { status })).toBe(true);
    }
    for (const status of ['cancelled', 'waitlist'] as const) {
      expect(isMemberEligibleForSurvey(survey, { status })).toBe(false);
    }
    expect(isMemberEligibleForSurvey(survey, null)).toBe(false);
  });

  test('allows attendees only when checked in or marked attended', () => {
    const survey = { ...baseSurvey, respondent_scope: 'attendees' as const };
    expect(isMemberEligibleForSurvey(survey, { status: 'checked_in' })).toBe(true);
    expect(isMemberEligibleForSurvey(survey, { status: 'attended' })).toBe(true);
    expect(isMemberEligibleForSurvey(survey, { status: 'confirmed' })).toBe(false);
    expect(isMemberEligibleForSurvey(survey, { status: 'absent' })).toBe(false);
    expect(isMemberEligibleForSurvey(survey, null)).toBe(false);
  });
});
