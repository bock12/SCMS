import type { Member, Ministry, MinistryMember } from './types';
import { supabase } from './supabaseClient';

export interface MinistryRosterEntry extends MinistryMember {
  member: Member;
}

/**
 * Ministry participation is linked to church membership, not login accounts.
 * A member can serve in several ministries without needing a user profile.
 */
export async function getMinistryRoster(ministryId: string): Promise<MinistryRosterEntry[]> {
  const [{ data: assignments, error: assignmentError }, { data: members, error: memberError }] = await Promise.all([
    supabase.from('ministry_members').select('*').eq('ministry_id', ministryId).order('joined_at', { ascending: true }),
    supabase.from('members').select('*')
  ]);

  if (assignmentError) throw assignmentError;
  if (memberError) throw memberError;

  const memberById = new Map<string, Member>((members || []).map((member: Member) => [member.id, member]));
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
  if (!data) throw new Error('The ministry appointment was not saved.');
  return data as MinistryMember;
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
