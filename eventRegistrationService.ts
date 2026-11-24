import type { EventRegistration } from './types';
import { supabase } from './supabaseClient';

export async function registerEventMember(input: {
  eventId: string;
  memberId: string;
  email?: string | null;
  phone?: string | null;
}): Promise<EventRegistration> {
  const { data, error } = await supabase.rpc('manage_event_registration', {
    p_action: 'register_member',
    p_event_id: input.eventId,
    p_member_id: input.memberId,
    p_email: input.email || null,
    p_phone: input.phone || null
  });
  if (error) throw error;
  if (!data) throw new Error('The member registration was not saved.');
  return data as EventRegistration;
}

export async function registerEventGuest(input: {
  eventId: string;
  name: string;
  email?: string | null;
  phone?: string | null;
}): Promise<EventRegistration> {
  if (!input.name.trim()) throw new Error('Enter the guest name.');
  const { data, error } = await supabase.rpc('manage_event_registration', {
    p_action: 'register_guest',
    p_event_id: input.eventId,
    p_member_name: input.name.trim(),
    p_email: input.email || null,
    p_phone: input.phone || null
  });
  if (error) throw error;
  if (!data) throw new Error('The guest registration was not saved.');
  return data as EventRegistration;
}

export async function cancelEventRegistration(registrationId: string): Promise<EventRegistration> {
  const { data, error } = await supabase.rpc('manage_event_registration', {
    p_action: 'cancel',
    p_registration_id: registrationId
  });
  if (error) throw error;
  if (!data) throw new Error('The registration cancellation was not saved.');
  return data as EventRegistration;
}

export async function updateEventRegistrationAttendance(
  registrationId: string,
  status: 'check_in' | 'mark_absent'
): Promise<EventRegistration> {
  const { data, error } = await supabase.rpc('manage_event_registration', {
    p_action: status,
    p_registration_id: registrationId
  });
  if (error) throw error;
  if (!data) throw new Error('The event attendance update was not saved.');
  return data as EventRegistration;
}
