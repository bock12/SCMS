import { supabase } from './supabaseClient';

export interface MemberIdentityUpdate {
  first_name: string;
  last_name: string;
}

/**
 * Keeps the identity fields shared by a login profile and its linked church
 * membership record synchronized. Unlinked profiles remain valid and do not
 * cause a membership record to be created automatically.
 */
export async function syncLinkedMemberIdentity(
  profileId: string,
  identity: MemberIdentityUpdate
): Promise<void> {
  const { error } = await supabase
    .from('members')
    .update({
      first_name: identity.first_name,
      last_name: identity.last_name
    })
    .eq('profile_id', profileId);

  if (error) {
    throw error;
  }
}
