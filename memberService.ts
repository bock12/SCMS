import type { AppRole, MembershipStatus, PortalAccountStatus, Profile } from './types';
import { supabase } from './supabaseClient';

/** Accepts only real calendar dates in the canonical YYYY-MM-DD format. */
function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + 'T00:00:00.000Z');
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function validateOptionalDate(value: string | undefined, fieldLabel: string): void {
  if (value && !isValidIsoDate(value)) {
    throw new Error(fieldLabel + ' must be a valid date in YYYY-MM-DD format.');
  }
}

export function normalizeMemberEmail(value: string | undefined): string {
  const normalized = value?.trim().toLowerCase() || '';
  if (normalized && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new Error('Enter a valid email address.');
  }
  return normalized;
}

function validateMemberAttributes(input: {
  gender?: Profile['gender'];
  is_baptized?: boolean;
  baptism_date?: string;
  date_of_birth?: string;
  marital_status?: Profile['marital_status'];
  marriage_date?: string;
  membership_status?: MembershipStatus;
  portal_status?: PortalAccountStatus;
}): void {
  if (input.gender && !['male', 'female', 'other'].includes(input.gender)) {
    throw new Error('Invalid gender value.');
  }
  if (input.marital_status && !['Single', 'Married', 'Widowed', 'Divorced'].includes(input.marital_status)) {
    throw new Error('Invalid marital status.');
  }
  if (
    input.membership_status &&
    !['active', 'inactive', 'suspended', 'transferred', 'archived'].includes(input.membership_status)
  ) {
    throw new Error('Invalid membership status.');
  }
  if (input.portal_status && !['active', 'suspended', 'archived'].includes(input.portal_status)) {
    throw new Error('Invalid portal account status.');
  }
  validateOptionalDate(input.baptism_date, 'Baptism date');
  validateOptionalDate(input.date_of_birth, 'Date of birth');
  validateOptionalDate(input.marriage_date, 'Marriage date');
  if (input.date_of_birth && input.date_of_birth > new Date().toISOString().slice(0, 10)) {
    throw new Error('Date of birth cannot be in the future.');
  }
  if (input.is_baptized === false && input.baptism_date) {
    throw new Error('A baptism date cannot be set when the member is not baptized.');
  }
}

export function hasPortalAccess(person: Pick<Profile, 'auth_user_id'> | null | undefined): boolean {
  return Boolean(person?.auth_user_id);
}

/**
 * Returns the canonical congregation member directory from `profiles`.
 * Includes all church members whether or not they have portal login access.
 */
export async function getMembers(): Promise<Profile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('first_name', { ascending: true });

  if (error) throw error;
  return (data || []) as Profile[];
}

export interface PortalInvitationInfo {
  authUserId: string;
  email: string;
  setupToken: string;
  setupUrl: string;
  alreadyActivated: boolean;
}

export interface UnifiedMemberRegistrationInput {
  first_name: string;
  last_name: string;
  branch_id: string;
  membership_date: string;
  membership_status?: MembershipStatus;
  gender?: Profile['gender'];
  email?: string;
  phone?: string;
  avatar_url?: string;
  assigned_department?: string;
  is_baptized?: boolean;
  baptism_date?: string;
  baptized_by?: string;
  date_of_birth?: string;
  marital_status?: Profile['marital_status'];
  marriage_date?: string;
  enable_portal_access?: boolean;
  primary_role?: AppRole;
  portal_status?: PortalAccountStatus;
}

export interface UnifiedMemberSaveResult {
  profile: Profile;
  portalInvite?: PortalInvitationInfo;
}

async function assertUniqueContactDetails(
  email: string,
  phone: string,
  excludePersonId?: string
): Promise<void> {
  const { data: existingProfiles, error } = await supabase.from('profiles').select('*');
  if (error) throw error;

  const list = (existingProfiles || []) as Profile[];
  if (email) {
    const duplicateEmail = list.find(
      p => p.id !== excludePersonId && (p.email || '').trim().toLowerCase() === email
    );
    if (duplicateEmail) {
      throw new Error(
        `A member with email "${email}" is already registered (${duplicateEmail.first_name} ${duplicateEmail.last_name}).`
      );
    }
  }

  const normalizedPhone = phone.replace(/[^0-9+]/g, '');
  if (normalizedPhone.length > 5) {
    const duplicatePhone = list.find(p => {
      if (p.id === excludePersonId || !p.phone) return false;
      const other = p.phone.replace(/[^0-9+]/g, '');
      return other.length > 5 && other === normalizedPhone;
    });
    if (duplicatePhone) {
      throw new Error(
        `A member with phone number "${phone}" is already registered (${duplicatePhone.first_name} ${duplicatePhone.last_name}).`
      );
    }
  }
}

/**
 * Registers a person once in the canonical `profiles` directory.
 * Portal access is optional (`auth_user_id` remains null when disabled).
 * Never stores plaintext passwords on `profiles`.
 */
export async function registerUnifiedMember(
  input: UnifiedMemberRegistrationInput
): Promise<UnifiedMemberSaveResult> {
  const firstName = input.first_name?.trim() || '';
  const lastName = input.last_name?.trim() || '';
  const branchId = input.branch_id?.trim() || '';
  const membershipDate = input.membership_date?.trim() || '';
  const phone = input.phone?.trim() || '';
  const enablePortal = Boolean(input.enable_portal_access);

  if (!firstName || !lastName) throw new Error('First name and last name are required.');
  if (!branchId) throw new Error('A branch is required.');
  if (!isValidIsoDate(membershipDate)) {
    throw new Error('A valid membership date is required (YYYY-MM-DD).');
  }

  validateMemberAttributes({
    gender: input.gender,
    is_baptized: input.is_baptized,
    baptism_date: input.baptism_date,
    date_of_birth: input.date_of_birth,
    marital_status: input.marital_status,
    marriage_date: input.marriage_date,
    membership_status: input.membership_status,
    portal_status: input.portal_status
  });

  const email = normalizeMemberEmail(input.email);
  if (enablePortal && !email) {
    throw new Error('A valid email address is required when Portal Access is enabled.');
  }

  const { data: branch, error: branchError } = await supabase
    .from('church_branches')
    .select('id')
    .eq('id', branchId)
    .maybeSingle();
  if (branchError) throw branchError;
  if (!branch) throw new Error('The selected branch does not exist.');

  await assertUniqueContactDetails(email, phone);

  const personId = `per_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const newProfilePayload: Profile = {
    id: personId,
    auth_user_id: null,
    branch_id: branchId,
    first_name: firstName,
    last_name: lastName,
    email,
    phone,
    gender: input.gender || 'other',
    avatar_url: input.avatar_url || `https://picsum.photos/seed/${personId}/200`,
    primary_role: input.primary_role || 'member',
    status: input.portal_status || 'active',
    membership_status: input.membership_status || 'active',
    membership_date: membershipDate,
    department_name: input.assigned_department,
    assigned_department: input.assigned_department,
    created_at: new Date().toISOString(),
    is_baptized: Boolean(input.is_baptized),
    baptism_date: input.is_baptized ? (input.baptism_date || undefined) : undefined,
    baptized_by: input.is_baptized ? (input.baptized_by?.trim() || undefined) : undefined,
    date_of_birth: input.date_of_birth || undefined,
    marital_status: input.marital_status || undefined,
    marriage_date: input.marital_status === 'Married' ? (input.marriage_date || undefined) : undefined
  };

  const { data: inserted, error: insertError } = await supabase
    .from('profiles')
    .insert(newProfilePayload)
    .select('*')
    .single();

  if (insertError) throw insertError;
  const savedProfile = (Array.isArray(inserted) ? inserted[0] : inserted) as Profile;
  if (!savedProfile) throw new Error('The member directory record was not created.');

  if (!enablePortal) {
    return { profile: savedProfile };
  }

  const { data: inviteData, error: inviteError } = await supabase.auth.provisionPortalAccess({
    profileId: savedProfile.id,
    email,
    firstName,
    lastName,
    primaryRole: savedProfile.primary_role
  });

  if (inviteError || !inviteData) {
    await supabase.from('profiles').delete().eq('id', savedProfile.id);
    throw new Error(inviteError?.message || 'Unable to provision portal access for this member.');
  }

  const { data: refreshed } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', savedProfile.id)
    .maybeSingle();

  return {
    profile: (refreshed || { ...savedProfile, auth_user_id: inviteData.authUserId }) as Profile,
    portalInvite: inviteData
  };
}

export interface UnifiedMemberUpdateInput {
  first_name: string;
  last_name: string;
  branch_id?: string;
  gender?: Profile['gender'];
  email?: string;
  phone?: string;
  avatar_url?: string;
  membership_status?: MembershipStatus;
  membership_date?: string;
  assigned_department?: string;
  is_baptized?: boolean;
  baptism_date?: string;
  baptized_by?: string;
  date_of_birth?: string;
  marital_status?: Profile['marital_status'];
  marriage_date?: string;
  primary_role?: AppRole;
  portal_status?: PortalAccountStatus;
  enable_portal_access?: boolean;
}

/**
 * Single unified update for a person in `profiles`.
 * Keeps membership lifecycle and portal-account lifecycle independent unless explicitly requested.
 */
export async function updateUnifiedMember(
  personId: string,
  input: UnifiedMemberUpdateInput
): Promise<UnifiedMemberSaveResult> {
  if (!personId.trim()) throw new Error('A member ID is required.');
  const firstName = input.first_name?.trim() || '';
  const lastName = input.last_name?.trim() || '';
  if (!firstName || !lastName) throw new Error('First name and last name are required.');

  if (input.membership_date !== undefined && !isValidIsoDate(input.membership_date)) {
    throw new Error('A valid membership date is required (YYYY-MM-DD).');
  }

  validateMemberAttributes({
    gender: input.gender,
    is_baptized: input.is_baptized,
    baptism_date: input.baptism_date,
    date_of_birth: input.date_of_birth,
    marital_status: input.marital_status,
    marriage_date: input.marriage_date,
    membership_status: input.membership_status,
    portal_status: input.portal_status
  });

  const { data: existing, error: lookupError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', personId)
    .maybeSingle();
  if (lookupError) throw lookupError;
  if (!existing) throw new Error('Member directory record not found.');

  const current = existing as Profile;
  const email = input.email !== undefined ? normalizeMemberEmail(input.email) : (current.email || '');
  const phone = input.phone !== undefined ? input.phone.trim() : (current.phone || '');

  if (input.enable_portal_access && !email) {
    throw new Error('A valid email address is required when Portal Access is enabled.');
  }

  if (input.branch_id) {
    const { data: branch, error: branchError } = await supabase
      .from('church_branches')
      .select('id')
      .eq('id', input.branch_id)
      .maybeSingle();
    if (branchError) throw branchError;
    if (!branch) throw new Error('The selected branch does not exist.');
  }

  await assertUniqueContactDetails(email, phone, personId);

  const updates: Partial<Profile> = {
    first_name: firstName,
    last_name: lastName,
    email,
    phone,
    ...(input.branch_id !== undefined ? { branch_id: input.branch_id } : {}),
    ...(input.gender !== undefined ? { gender: input.gender } : {}),
    ...(input.avatar_url !== undefined ? { avatar_url: input.avatar_url } : {}),
    ...(input.membership_status !== undefined ? { membership_status: input.membership_status } : {}),
    ...(input.membership_date !== undefined ? { membership_date: input.membership_date } : {}),
    ...(input.assigned_department !== undefined
      ? { assigned_department: input.assigned_department, department_name: input.assigned_department }
      : {}),
    ...(input.primary_role !== undefined ? { primary_role: input.primary_role } : {}),
    ...(input.portal_status !== undefined ? { status: input.portal_status } : {}),
    ...(input.is_baptized !== undefined ? { is_baptized: input.is_baptized } : {}),
    ...(input.is_baptized !== undefined
      ? {
          baptism_date: input.is_baptized ? (input.baptism_date || undefined) : undefined,
          baptized_by: input.is_baptized ? (input.baptized_by?.trim() || undefined) : undefined
        }
      : {}),
    ...(input.date_of_birth !== undefined ? { date_of_birth: input.date_of_birth || undefined } : {}),
    ...(input.marital_status !== undefined ? { marital_status: input.marital_status } : {}),
    ...(input.marital_status !== undefined
      ? { marriage_date: input.marital_status === 'Married' ? (input.marriage_date || undefined) : undefined }
      : {})
  };

  const { error: updateError } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', personId);
  if (updateError) throw updateError;

  let portalInvite: PortalInvitationInfo | undefined;
  if (input.enable_portal_access === true && !current.auth_user_id) {
    const { data: inviteData, error: inviteError } = await supabase.auth.provisionPortalAccess({
      profileId: personId,
      email,
      firstName,
      lastName,
      primaryRole: input.primary_role || current.primary_role
    });
    if (inviteError || !inviteData) {
      throw new Error(inviteError?.message || 'Unable to enable portal access for this member.');
    }
    portalInvite = inviteData;
  } else if (input.enable_portal_access === false && current.auth_user_id) {
    await supabase.auth.revokePortalAccess(personId);
  }

  const { data: updatedRow, error: reloadError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', personId)
    .single();
  if (reloadError) throw reloadError;

  return {
    profile: updatedRow as Profile,
    portalInvite
  };
}

/** Updates church membership status without altering portal account status or login credentials. */
export async function updateMembershipStatus(
  personId: string,
  membershipStatus: MembershipStatus
): Promise<Profile> {
  validateMemberAttributes({ membership_status: membershipStatus });
  const { data, error } = await supabase
    .from('profiles')
    .update({ membership_status: membershipStatus })
    .eq('id', personId)
    .select('*')
    .single();
  if (error) throw error;
  return data as Profile;
}

/** Updates portal account status (`active` / `suspended` / `archived`) independently of church membership. */
export async function updatePortalAccountStatus(
  personId: string,
  portalStatus: PortalAccountStatus
): Promise<Profile> {
  validateMemberAttributes({ portal_status: portalStatus });
  const { data, error } = await supabase
    .from('profiles')
    .update({ status: portalStatus })
    .eq('id', personId)
    .select('*')
    .single();
  if (error) throw error;
  return data as Profile;
}

/** Enables portal access for an existing member record via password-setup invitation. */
export async function enablePortalAccess(
  personId: string,
  options?: { email?: string; primary_role?: AppRole }
): Promise<UnifiedMemberSaveResult> {
  const { data: existing, error: lookupError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', personId)
    .maybeSingle();
  if (lookupError) throw lookupError;
  if (!existing) throw new Error('Member directory record not found.');

  const current = existing as Profile;
  const email = normalizeMemberEmail(options?.email ?? current.email);
  if (!email) {
    throw new Error('A valid email address is required to enable portal access.');
  }

  await assertUniqueContactDetails(email, '', personId);

  const { data: inviteData, error: inviteError } = await supabase.auth.provisionPortalAccess({
    profileId: personId,
    email,
    firstName: current.first_name,
    lastName: current.last_name,
    primaryRole: options?.primary_role || current.primary_role
  });
  if (inviteError || !inviteData) {
    throw new Error(inviteError?.message || 'Unable to enable portal access.');
  }

  const { data: updated, error: reloadError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', personId)
    .single();
  if (reloadError) throw reloadError;

  return { profile: updated as Profile, portalInvite: inviteData };
}

/** Revokes portal login access (`auth_user_id = null`) while keeping the person's church membership record intact. */
export async function disablePortalAccess(personId: string): Promise<Profile> {
  await supabase.auth.revokePortalAccess(personId);
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', personId)
    .single();
  if (error) throw error;
  return data as Profile;
}
