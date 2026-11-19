import { describe, expect, test } from 'bun:test';
import { getFinanceEventUuid, isFinanceEventUuid } from './eventFinanceIdentity';

describe('event finance identity', () => {
  test('accepts a UUID-backed event ID directly', () => {
    const id = '2f2b7e68-7b14-4b93-9f17-2e5c5b18b49a';
    expect(getFinanceEventUuid({ id })).toBe(id);
  });

  test('resolves an explicit UUID bridge for a friendly application ID', () => {
    const id = '2f2b7e68-7b14-4b93-9f17-2e5c5b18b49a';
    expect(getFinanceEventUuid({ id: 'evt-1', finance_event_id: id })).toBe(id);
  });

  test('does not cast friendly event IDs or accept malformed UUIDs', () => {
    expect(isFinanceEventUuid('evt-1')).toBe(false);
    expect(() => getFinanceEventUuid({ id: 'evt-1' })).toThrow('not linked to a persisted finance UUID');
    expect(() => getFinanceEventUuid({ id: 'evt-1', finance_event_id: 'not-a-uuid' })).toThrow();
  });
});
