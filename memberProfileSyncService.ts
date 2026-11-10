import { supabase } from './supabaseClient';

export interface MemberProfileUpdate {
  first_name: string;
  last_name: string;
  phone?: string;
  avatar_url?: string;
  is_baptized?: boolean;
  baptism_date?: string;
  baptized_by?: string;
  date_of_birth?: string;
  marital_status?: 'Single' | 'Married' | 'Widowed' | 'Divorced';
  marriage_date?: string;
}

/**
 * Synchronizes personal details shared by a login profile and its linked
 * church membership record. It never creates membership records for
 * account-only users.
 */
export async function syncLinkedMemberProfile(
  profileId: string,
  details: MemberProfileUpdate
): Promise<void> {
  const { error } = await supabase
    .from('members')
    .update({
      first_name: details.first_name,
      last_name: details.last_name,
      ...(details.phone !== undefined ? { phone: details.phone } : {}),
      ...(details.avatar_url !== undefined ? { avatar_url: details.avatar_url } : {}),
      ...(details.is_baptized !== undefined ? { is_baptized: details.is_baptized } : {}),
      ...(details.baptism_date !== undefined ? { baptism_date: details.baptism_date } : {}),
      ...(details.baptized_by !== undefined ? { baptized_by: details.baptized_by } : {}),
      ...(details.date_of_birth !== undefined ? { date_of_birth: details.date_of_birth } : {}),
      ...(details.marital_status !== undefined ? { marital_status: details.marital_status } : {}),
      ...(details.marriage_date !== undefined ? { marriage_date: details.marriage_date } : {})
    })
    .eq('profile_id', profileId);

  if (error) throw error;
}
