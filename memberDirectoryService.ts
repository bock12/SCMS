import type { Profile } from './types';
import { supabase } from './supabaseClient';

export interface DirectoryMember extends Profile {
  has_login_credentials: boolean;
}

/**
 * The unified church directory reads from canonical `profiles`.
 * Portal access is indicated strictly by a linked `auth_user_id`.
 */
export async function getDirectoryMembers(): Promise<DirectoryMember[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('first_name', { ascending: true });

  if (error) throw error;

  return ((data || []) as Profile[]).map(profile => ({
    ...profile,
    has_login_credentials: Boolean(profile.auth_user_id)
  }));
}
