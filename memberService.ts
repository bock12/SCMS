import type { Member, Profile } from './types';
import { supabase } from './supabaseClient';

export type LinkedMemberDetails = Pick<Profile, 'first_name' | 'last_name'> & Partial<Pick<
  Profile,
  'email' | 'phone' | 'avatar_url' | 'is_baptized' | 'baptism_date' | 'baptized_by' | 'date_of_birth' | 'marital_status' | 'marriage_date'
>>;

/**
 * Returns church membership records, independently of whether a member has
 * a login profile. Account details and permissions remain in profiles.
 */
export async function getMembers(): Promise<Member[]> {
  const { data, error } = await supabase
    .from('members')
    .select('*')
    .order('first_name', { ascending: true });

  if (error) throw error;
  return (data || []) as Member[];
}

/**
 * Ensures a profile has a corresponding church membership record.
 * Safe to call repeatedly: profile_id is treated as the unique link.
 * The mock auth/profile layer does not create real login credentials.
 */
export async function ensureLinkedMemberRecord(
  profile: Profile,
  gender: Member['gender'] = 'other'
): Promise<Member> {
  if (!profile.id?.trim()) throw new Error('A profile ID is required to link a membership record.');
  if (!profile.branch_id?.trim()) throw new Error('A branch is required to create a membership record.');
  if (!profile.first_name.trim() || !profile.last_name.trim()) {
    throw new Error('First name and last name are required.');
  }

  const { data: existingRows, error: lookupError } = await supabase
    .from('members')
    .select('*')
    .eq('profile_id', profile.id);

  if (lookupError) throw lookupError;
  const existing = (existingRows || [])[0] as Member | undefined;

  const details = {
    first_name: profile.first_name.trim(),
    last_name: profile.last_name.trim(),
    email: profile.email.trim(),
    phone: profile.phone?.trim() || '',
    avatar_url: profile.avatar_url || '',
    is_baptized: Boolean(profile.is_baptized),
    baptism_date: profile.baptism_date || null,
    baptized_by: profile.baptized_by || null,
    date_of_birth: profile.date_of_birth || null,
    marital_status: profile.marital_status || null,
    marriage_date: profile.marriage_date || null
  };

  if (existing) {
    const { error } = await supabase
      .from('members')
      .update(details)
      .eq('id', existing.id);
    if (error) throw error;
    return { ...existing, ...details } as Member;
  }

  const { data, error } = await supabase
    .from('members')
    .insert({
      ...details,
      profile_id: profile.id,
      branch_id: profile.branch_id,
      gender,
      status: 'active',
      membership_date: new Date().toISOString().slice(0, 10)
    })
    .select('*')
    .single();

  if (error) throw error;
  const saved = Array.isArray(data) ? data[0] : data;
  if (!saved) throw new Error('The membership record was not created.');
  return saved as Member;
}

/** Updates shared identity/contact details without changing membership status. */
export async function updateLinkedMemberDetails(
  profileId: string,
  details: LinkedMemberDetails
): Promise<void> {
  if (!profileId.trim()) throw new Error('A profile ID is required.');

  const { error } = await supabase
    .from('members')
    .update({
      first_name: details.first_name.trim(),
      last_name: details.last_name.trim(),
      ...(details.email !== undefined ? { email: details.email.trim() } : {}),
      ...(details.phone !== undefined ? { phone: details.phone.trim() } : {}),
      ...(details.avatar_url !== undefined ? { avatar_url: details.avatar_url } : {}),
      ...(details.is_baptized !== undefined ? { is_baptized: details.is_baptized } : {}),
      ...(details.baptism_date !== undefined ? { baptism_date: details.baptism_date || null } : {}),
      ...(details.baptized_by !== undefined ? { baptized_by: details.baptized_by || null } : {}),
      ...(details.date_of_birth !== undefined ? { date_of_birth: details.date_of_birth || null } : {}),
      ...(details.marital_status !== undefined ? { marital_status: details.marital_status || null } : {}),
      ...(details.marriage_date !== undefined ? { marriage_date: details.marriage_date || null } : {})
    })
    .eq('profile_id', profileId);

  if (error) throw error;
}

/**
 * Mirrors directory account status to an existing church membership record.
 * Does not create a membership record and does not alter portal credentials.
 */
export async function syncLinkedMemberStatus(
  profileId: string,
  status: 'active' | 'suspended' | 'archived'
): Promise<void> {
  if (!profileId.trim()) throw new Error('A profile ID is required.');

  const { data, error: lookupError } = await supabase
    .from('members')
    .select('id')
    .eq('profile_id', profileId);

  if (lookupError) throw lookupError;
  if (!data?.length) return;

  const { error } = await supabase
    .from('members')
    .update({ status })
    .eq('profile_id', profileId);

  if (error) throw error;
}


export interface StandaloneMemberRegistrationInput {
  first_name: string;
  last_name: string;
  branch_id: string;
  membership_date: string;
  gender?: Member['gender'];
  email?: string;
  phone?: string;
  profile_id?: string | null;
  is_baptized?: boolean;
  baptism_date?: string;
  baptized_by?: string;
  date_of_birth?: string;
  marital_status?: Member['marital_status'];
  marriage_date?: string;
}

/**
 * Registers a church membership independently of portal access.
 * A profile is linked only when an existing profile_id is explicitly supplied;
 * this function never creates profiles, auth users, passwords or sessions.
 */
export async function registerChurchMember(
  input: StandaloneMemberRegistrationInput
): Promise<Member> {
  const firstName = input.first_name?.trim() || '';
  const lastName = input.last_name?.trim() || '';
  const branchId = input.branch_id?.trim() || '';
  const membershipDate = input.membership_date?.trim() || '';

  if (!firstName || !lastName) throw new Error('First name and last name are required.');
  if (!branchId) throw new Error('A branch is required.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(membershipDate) || Number.isNaN(Date.parse(membershipDate))) {
    throw new Error('A valid membership date is required (YYYY-MM-DD).');
  }

  const { data: branch, error: branchError } = await supabase
    .from('church_branches')
    .select('id')
    .eq('id', branchId)
    .maybeSingle();
  if (branchError) throw branchError;
  if (!branch) throw new Error('The selected branch does not exist.');

  const profileId = input.profile_id?.trim() || null;
  if (profileId) {
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, branch_id')
      .eq('id', profileId)
      .maybeSingle();
    if (profileError) throw profileError;
    if (!profile) throw new Error('The selected portal profile does not exist.');
    if (profile.branch_id !== branchId) {
      throw new Error('The member and linked portal profile must belong to the same branch.');
    }

    const { data: linkedRows, error: linkedError } = await supabase
      .from('members')
      .select('id')
      .eq('profile_id', profileId);
    if (linkedError) throw linkedError;
    if (linkedRows?.length) throw new Error('This portal profile is already linked to a membership record.');
  }

  const { data, error } = await supabase
    .from('members')
    .insert({
      profile_id: profileId,
      branch_id: branchId,
      first_name: firstName,
      last_name: lastName,
      gender: input.gender || 'other',
      status: 'active',
      membership_date: membershipDate,
      email: input.email?.trim() || null,
      phone: input.phone?.trim() || null,
      is_baptized: Boolean(input.is_baptized),
      baptism_date: input.baptism_date || null,
      baptized_by: input.baptized_by?.trim() || null,
      date_of_birth: input.date_of_birth || null,
      marital_status: input.marital_status || null,
      marriage_date: input.marriage_date || null
    })
    .select('*')
    .single();

  if (error) throw error;
  const saved = Array.isArray(data) ? data[0] : data;
  if (!saved) throw new Error('The membership record was not created.');
  return saved as Member;
}
