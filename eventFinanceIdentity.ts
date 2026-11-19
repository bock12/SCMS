/**
 * Event IDs in the browser demo may be friendly strings (for example, evt-1),
 * while the canonical finance schema references public.events UUIDs.
 * This helper accepts only an explicit UUID identity and never casts a
 * display/application ID into a database identifier.
 */
export const isFinanceEventUuid = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

export interface FinanceEventIdentity {
  id: string;
  finance_event_id?: string | null;
}

export function getFinanceEventUuid(event: FinanceEventIdentity): string {
  if (isFinanceEventUuid(event.id)) return event.id;
  if (isFinanceEventUuid(event.finance_event_id)) return event.finance_event_id;
  throw new Error('Event is not linked to a persisted finance UUID. Save or synchronize the event before creating an event budget.');
}
