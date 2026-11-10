import type { Member } from './types';
import { supabase } from './supabaseClient';

/**
 * Returns church membership records, independently of whether a member has
 * a login profile. Account details and permissions remain in the profiles
 * table and are linked through members.profile_id when applicable.
 */
export async function getMembers(): Promise<Member[]> {
  const { data, error } = await supabase
    .from('members')
    .select('*')
    .order('first_name', { ascending: true });

  if (error) {
    throw error;
  }

  return (data || []) as Member[];
}
