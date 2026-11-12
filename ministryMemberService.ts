import type { MinistryMember, Profile } from './types';
import { supabase } from './supabaseClient';

export interface MinistryRosterEntry extends MinistryMember {
  member: Profile;
}

/**
 * Ministry participation references canonical `profiles` (`member_id` -> `profiles.id`),
 * supporting all church members whether or not they have portal login access.
 */
export async function getMinistryRoster(ministryId: string): Promise<MinistryRosterEntry[]> {
  const [{ data: assignments, error: assignmentError }, { data: profiles, error: profileError }] = await Promise.all([
    supabase.from('ministry_members').select('*').eq('ministry_id', ministryId).order('joined_at', { ascending: true }),
    supabase.from('profiles').select('*')
  ]);

  if (assignmentError) throw assignmentError;
  if (profileError) throw profileError;

  const memberById = new Map<string, Profile>((profiles || []).map((person: Profile) => [person.id, person]));
  return (assignments || [])
    .map((assignment: MinistryMember) => {
      const member = memberById.get(assignment.member_id);
      return member ? { ...assignment, member } : null;
    })
    .filter((entry): entry is MinistryRosterEntry => entry !== null);
}

export async function addMinistryMember(
  assignment: Omit<MinistryMember, 'id' | 'joined_at'> & { joined_at?: string }
): Promise<MinistryMember> {
  const { data, error } = await supabase
    .from('ministry_members')
    .insert({
      ...assignment,
      joined_at: assignment.joined_at || new Date().toISOString()
    })
    .select('*')
    .single();

  if (error) throw error;
  const saved = Array.isArray(data) ? data[0] : data;
  if (!saved) throw new Error('The ministry appointment was not saved.');
  return saved as MinistryMember;
}

export async function updateMinistryMember(
  assignmentId: string,
  changes: Partial<Pick<MinistryMember, 'role_title' | 'duty' | 'status'>>
): Promise<void> {
  const { error } = await supabase
    .from('ministry_members')
    .update(changes)
    .eq('id', assignmentId);

  if (error) throw error;
}

export async function removeMinistryMember(assignmentId: string): Promise<void> {
  const { error } = await supabase
    .from('ministry_members')
    .delete()
    .eq('id', assignmentId);

  if (error) throw error;
}
