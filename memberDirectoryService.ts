import type { Member, Profile } from './types';
import { supabase } from './supabaseClient';

export interface DirectoryMember extends Member {
  email: string;
  phone: string;
  primary_role: Profile['primary_role'];
  department_name?: string;
  assigned_department?: string;
  created_at: string;
  has_login_credentials: boolean;
  profile: Profile | null;
}

/**
 * The church directory is based on membership records. A linked profile only
 * supplies application-role and portal-account information; it does not
 * determine whether someone is a church member.
 */
export async function getDirectoryMembers(): Promise<DirectoryMember[]> {
  const [membersResult, profilesResult] = await Promise.all([
    supabase.from('members').select('*').order('first_name', { ascending: true }),
    supabase.from('profiles').select('*')
  ]);

  if (membersResult.error) throw membersResult.error;
  if (profilesResult.error) throw profilesResult.error;

  const profiles = (profilesResult.data || []) as Profile[];
  const profilesById = new Map(profiles.map(profile => [profile.id, profile]));

  return ((membersResult.data || []) as Member[]).map(member => {
    const linkedProfile = member.profile_id ? profilesById.get(member.profile_id) || null : null;
    const extendedMember = member as Member & { created_at?: string };

    return {
      ...member,
      email: member.email || linkedProfile?.email || '',
      phone: member.phone || linkedProfile?.phone || '',
      avatar_url: member.avatar_url || linkedProfile?.avatar_url,
      primary_role: linkedProfile?.primary_role || 'member',
      department_name: linkedProfile?.department_name,
      assigned_department: linkedProfile?.assigned_department,
      created_at: extendedMember.created_at || member.membership_date,
      has_login_credentials: Boolean(linkedProfile),
      profile: linkedProfile
    };
  });
}
