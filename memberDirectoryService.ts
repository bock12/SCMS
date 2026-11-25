import type { Profile } from './types';
import { supabase } from './supabaseClient';
import { resolveMemberDataClient } from './supabaseIntegration';
import { mapCanonicalProfileToProfile } from './memberProfileMapper';

export interface DirectoryMember extends Profile {
  has_login_credentials: boolean;
}

/**
 * The unified church directory reads from canonical `profiles`.
 * Portal access is indicated strictly by a linked `auth_user_id`.
 */
export async function getDirectoryMembers(): Promise<DirectoryMember[]> {
  const client = resolveMemberDataClient(supabase);
  const { data, error } = await client
    .from('profiles')
    .select('*')
    .order('first_name', { ascending: true });

  if (error) throw error;

  return ((data || []) as any[]).map(row => {
    const profile = 'portal_access_status' in row && 'record_status' in row
      ? mapCanonicalProfileToProfile(row)
      : row as Profile;
    return { ...profile, has_login_credentials: Boolean(profile.auth_user_id) };
  });
}
