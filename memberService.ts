import type { AppRole, MembershipStatus, PortalAccountStatus, Profile } from './types';
import { mapCanonicalProfileToProfile, mapProfileInputToCanonicalInsert, mapProfileInputToCanonicalUpdate } from './memberProfileMapper';
import { supabase } from './supabaseClient';
import { supabaseDataClient, supabaseIntegrationEnabled, supabaseAuthEnabled } from './supabaseIntegration';

function createUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // RFC 4122 v4 fallback for browsers without crypto.randomUUID.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, character => {
    const random = Math.floor(Math.random() * 16);
    return (character === 'x' ? random : (random & 0x3) | 0x8).toString(16);
  });
}

function requireLiveMemberWriteClient() {
  if (!supabaseAuthEnabled) {
    throw new Error('Secure member writes require a real Supabase Auth session. Mock development login cannot authorize live database writes.');
  }
  if (!supabaseDataClient) {
    throw new Error('Supabase is enabled but its URL or publishable key is missing.');
  }
  return supabaseDataClient;
}

function unwrapRpcProfile(data: any): Profile {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error('The member directory operation returned no saved profile.');
  return toDirectoryProfile(row);
}

function toDirectoryProfile(row: any): Profile {
  // New mock records use the canonical shape; this fallback keeps seeded legacy
  // demo records readable until the mock-data migration is completed.
  if (row && 'portal_access_status' in row) {
    return mapCanonicalProfileToProfile(row);
  }
  return {
    ...row,
    id: row.id,
    primary_role: row.primary_role || 'member',
    branch_id: row.branch_id ?? null,
    email: row.email ?? '',
    phone: row.phone ?? '',
    portal_access_status: row.portal_access_status ??
      (row.auth_user_id ? (row.status === 'suspended' ? 'suspended' : 'active') : 'not_invited')
  } as Profile;
}

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
  if (supabaseIntegrationEnabled) {
    if (!supabaseDataClient) throw new Error('Supabase is enabled but its URL or publishable key is missing.');
    const { data, error } = await supabaseDataClient
      .from('profiles')
      .select('*')
      .order('first_name', { ascending: true });
    if (error) throw error;

    const profiles = (data || []).map(row => toDirectoryProfile(row));
    if (profiles.length === 0) return [];
    const { data: roleRows, error: roleError } = await supabaseDataClient
      .from('profile_role_assignments')
      .select('profile_id,roles(name)')
      .in('profile_id', profiles.map(person => person.id))
      .eq('is_active', true);
    if (roleError) console.warn('Unable to load member role assignments:', roleError);

    const roleByProfile = new Map<string, AppRole>();
    for (const item of roleRows || []) {
      const role = Array.isArray((item as any).roles)
        ? (item as any).roles[0]?.name
        : (item as any).roles?.name;
      if (role && !roleByProfile.has(item.profile_id)) {
        roleByProfile.set(item.profile_id, role as AppRole);
      }
    }
    return profiles.map(person => ({
      ...person,
      primary_role: roleByProfile.get(person.id) || 'member'
    }));
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('first_name', { ascending: true });

  if (error) throw error;
  return (data || []).map(toDirectoryProfile);
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

  if (supabaseIntegrationEnabled) {
    if (enablePortal) {
      throw new Error('The member can be saved without Portal Access. Live portal invitations will be enabled after the trusted server-side provisioning workflow is completed.');
    }
    const client = requireLiveMemberWriteClient();
    const canonical = mapProfileInputToCanonicalInsert({
      first_name: firstName,
      last_name: lastName,
      branch_id: branchId,
      membership_date: membershipDate,
      membership_status: input.membership_status || 'active',
      email,
      phone,
      gender: input.gender || 'other',
      avatar_url: input.avatar_url || null,
      is_baptized: Boolean(input.is_baptized),
      baptism_date: input.is_baptized ? (input.baptism_date || null) : null,
      baptized_by_name_snapshot: input.is_baptized ? (input.baptized_by?.trim() || null) : null,
      date_of_birth: input.date_of_birth || null,
      marital_status: input.marital_status || null,
      marriage_date: input.marital_status === 'Married' ? (input.marriage_date || null) : null
    });
    const memberPayload = {
      first_name: canonical.first_name,
      last_name: canonical.last_name,
      branch_id: canonical.branch_id,
      email: canonical.email,
      phone: canonical.phone,
      gender: canonical.gender,
      avatar_url: canonical.avatar_url,
      membership_date: canonical.membership_date,
      membership_status: canonical.membership_status,
      is_baptized: canonical.is_baptized,
      baptism_date: canonical.baptism_date,
      baptized_by_profile_id: canonical.baptized_by_profile_id,
      baptized_by_name_snapshot: canonical.baptized_by_name_snapshot,
      date_of_birth: canonical.date_of_birth,
      marital_status: canonical.marital_status,
      marriage_date: canonical.marriage_date
    };
    const { data, error } = await (client as any).rpc('create_member_profile', {
      p_member: memberPayload
    });
    if (error) throw error;
    return { profile: unwrapRpcProfile(data) };
  }

  const { data: branch, error: branchError } = await supabase
    .from('church_branches')
    .select('id')
    .eq('id', branchId)
    .maybeSingle();
  if (branchError) throw branchError;
  if (!branch) throw new Error('The selected branch does not exist.');

  await assertUniqueContactDetails(email, phone);

  const personId = createUuid();
  const newProfilePayload = {
    id: personId,
    ...mapProfileInputToCanonicalInsert({
      first_name: firstName,
      last_name: lastName,
      branch_id: branchId,
      membership_date: membershipDate,
      membership_status: input.membership_status || 'active',
      email,
      phone,
      gender: input.gender || 'other',
      avatar_url: input.avatar_url || `https://picsum.photos/seed/${personId}/200`,
      is_baptized: Boolean(input.is_baptized),
      baptism_date: input.is_baptized ? (input.baptism_date || null) : null,
      baptized_by_name_snapshot: input.is_baptized ? (input.baptized_by?.trim() || null) : null,
      date_of_birth: input.date_of_birth || null,
      marital_status: input.marital_status || null,
      marriage_date: input.marital_status === 'Married' ? (input.marriage_date || null) : null
    })
  };

  const { data: inserted, error: insertError } = await supabase
    .from('profiles')
    .insert(newProfilePayload)
    .select('*')
    .single();

  if (insertError) throw insertError;
  const savedRow = Array.isArray(inserted) ? inserted[0] : inserted;
  const savedProfile = toDirectoryProfile(savedRow);
  if (!savedProfile) throw new Error('The member directory record was not created.');

  if (!enablePortal) {
    return { profile: savedProfile };
  }

  const { data: inviteData, error: inviteError } = await supabase.auth.provisionPortalAccess({
    profileId: savedProfile.id,
    email,
    firstName,
    lastName,
    primaryRole: input.primary_role || 'member'
  });

  if (inviteError || !inviteData) {
    // The church member is already saved. Never delete a person record because
    // the optional portal invitation failed; an administrator can retry later.
    throw new Error(
      `Member record was saved, but portal access could not be enabled: ${inviteError?.message || 'Unknown invitation error'} You can enable Portal Access later from the member record.`
    );
  }

  const { data: refreshed } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', savedProfile.id)
    .maybeSingle();

  return {
    profile: toDirectoryProfile(refreshed || { ...savedRow, auth_user_id: inviteData.authUserId, portal_access_status: 'invited' }),
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

  const readClient = supabaseIntegrationEnabled
    ? requireLiveMemberWriteClient()
    : supabase;
  const { data: existing, error: lookupError } = await readClient
    .from('profiles')
    .select('*')
    .eq('id', personId)
    .maybeSingle();
  if (lookupError) throw lookupError;
  if (!existing) throw new Error('Member directory record not found.');

  const current = toDirectoryProfile(existing);
  const email = input.email !== undefined ? normalizeMemberEmail(input.email) : (current.email || '');
  const phone = input.phone !== undefined ? input.phone.trim() : (current.phone || '');

  if (input.branch_id !== undefined && input.branch_id !== current.branch_id) {
    throw new Error('A member’s branch can only be changed through the approved member transfer workflow.');
  }
  if (current.auth_user_id && input.email !== undefined && email !== (current.email || '')) {
    throw new Error('This member has portal access. Update the login email through the portal account workflow to keep both records synchronized.');
  }
  if (input.enable_portal_access && !email) {
    throw new Error('A valid email address is required when Portal Access is enabled.');
  }

  if (!supabaseIntegrationEnabled && input.branch_id) {
    const { data: branch, error: branchError } = await supabase
      .from('church_branches')
      .select('id')
      .eq('id', input.branch_id)
      .maybeSingle();
    if (branchError) throw branchError;
    if (!branch) throw new Error('The selected branch does not exist.');
  }

  if (!supabaseIntegrationEnabled) {
    await assertUniqueContactDetails(email, phone, personId);
  }

  const updates = mapProfileInputToCanonicalUpdate({
    first_name: firstName,
    last_name: lastName,
    email,
    phone,
    ...(input.branch_id !== undefined ? { branch_id: input.branch_id } : {}),
    ...(input.gender !== undefined ? { gender: input.gender } : {}),
    ...(input.avatar_url !== undefined ? { avatar_url: input.avatar_url } : {}),
    ...(input.membership_status !== undefined ? { membership_status: input.membership_status } : {}),
    ...(input.membership_date !== undefined ? { membership_date: input.membership_date } : {}),
    ...(input.is_baptized !== undefined ? { is_baptized: input.is_baptized } : {}),
    ...(input.is_baptized !== undefined ? {
      baptism_date: input.is_baptized ? (input.baptism_date || null) : null,
      baptized_by_name_snapshot: input.is_baptized ? (input.baptized_by?.trim() || null) : null
    } : {}),
    ...(input.date_of_birth !== undefined ? { date_of_birth: input.date_of_birth || null } : {}),
    ...(input.marital_status !== undefined ? { marital_status: input.marital_status } : {}),
    ...(input.marital_status !== undefined ? {
      marriage_date: input.marital_status === 'Married' ? (input.marriage_date || null) : null
    } : {})
  });

  if (supabaseIntegrationEnabled) {
    const portalCurrentlyEnabled = Boolean(current.auth_user_id);
    if (
      input.enable_portal_access !== undefined &&
      input.enable_portal_access !== portalCurrentlyEnabled
    ) {
      throw new Error('Portal access changes require the trusted server-side provisioning workflow and cannot be combined with a member profile update.');
    }
    const client = requireLiveMemberWriteClient();
    const memberPatch = Object.fromEntries(
      Object.entries(updates).filter(([key]) => key !== 'branch_id')
    );
    const { data, error } = await (client as any).rpc('update_member_profile', {
      p_profile_id: personId,
      p_member: memberPatch
    });
    if (error) throw error;
    return { profile: unwrapRpcProfile(data) };
  }

  const { error: updateError } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', personId);
  if (updateError) throw updateError;

  let portalInvite: PortalInvitationInfo | undefined;
  if (input.portal_status === 'archived') {
    // "Archived portal account" means revoke its login link; it does not archive
    // or delete the church member record.
    await supabase.auth.revokePortalAccess(personId);
  } else if (input.portal_status === 'active' && !current.auth_user_id && !input.enable_portal_access) {
    throw new Error('Portal access must be enabled before the account can be marked active.');
  } else if (input.portal_status === 'suspended' && !current.auth_user_id) {
    throw new Error('This member has no linked portal account to suspend.');
  } else if (input.portal_status !== undefined && input.portal_status !== 'active') {
    await supabase.from('profiles')
      .update({ portal_access_status: input.portal_status })
      .eq('id', personId);
  }

  if (input.enable_portal_access === true && !current.auth_user_id) {
    const { data: inviteData, error: inviteError } = await supabase.auth.provisionPortalAccess({
      profileId: personId,
      email,
      firstName,
      lastName,
      primaryRole: input.primary_role || current.primary_role
    });
    if (inviteError || !inviteData) {
      throw new Error(
        `Member changes were saved, but portal access could not be enabled: ${inviteError?.message || 'Unknown invitation error'} You can retry Portal Access later.`
      );
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
    profile: toDirectoryProfile(updatedRow),
    portalInvite
  };
}

/** Updates church membership status without altering portal account status or login credentials. */
export async function updateMembershipStatus(
  personId: string,
  membershipStatus: MembershipStatus
): Promise<Profile> {
  validateMemberAttributes({ membership_status: membershipStatus });
  if (supabaseIntegrationEnabled) {
    const client = requireLiveMemberWriteClient();
    const { data, error } = await (client as any).rpc('update_member_profile', {
      p_profile_id: personId,
      p_member: { membership_status: membershipStatus }
    });
    if (error) throw error;
    return unwrapRpcProfile(data);
  }
  const { data, error } = await supabase
    .from('profiles')
    .update({ membership_status: membershipStatus })
    .eq('id', personId)
    .select('*')
    .single();
  if (error) throw error;
  return toDirectoryProfile(data);
}

/** Updates portal account status (`active` / `suspended` / `archived`) independently of church membership. */
export async function updatePortalAccountStatus(
  personId: string,
  portalStatus: PortalAccountStatus
): Promise<Profile> {
  validateMemberAttributes({ portal_status: portalStatus });
  if (supabaseIntegrationEnabled) {
    throw new Error('Portal account lifecycle changes require the trusted server-side Auth provisioning workflow.');
  }
  if (portalStatus === 'active') {
    const { data: existing, error: lookupError } = await supabase
      .from('profiles').select('auth_user_id').eq('id', personId).maybeSingle();
    if (lookupError) throw lookupError;
    if (!existing?.auth_user_id) throw new Error('Portal access must be enabled before the account can be marked active.');
  }
  if (portalStatus === 'suspended') {
    const { data: existing, error: lookupError } = await supabase
      .from('profiles').select('auth_user_id').eq('id', personId).maybeSingle();
    if (lookupError) throw lookupError;
    if (!existing?.auth_user_id) throw new Error('This member has no linked portal account to suspend.');
  }
  if (portalStatus === 'archived') {
    await supabase.auth.revokePortalAccess(personId);
    const { data, error } = await supabase.from('profiles').select('*').eq('id', personId).single();
    if (error) throw error;
    return toDirectoryProfile(data);
  }

  const { data, error } = await supabase
    .from('profiles')
    .update({ portal_access_status: portalStatus })
    .eq('id', personId)
    .select('*')
    .single();
  if (error) throw error;
  return toDirectoryProfile(data);
}

/** Enables portal access for an existing member record via password-setup invitation. */
export async function enablePortalAccess(
  personId: string,
  options?: { email?: string; primary_role?: AppRole }
): Promise<UnifiedMemberSaveResult> {
  if (supabaseIntegrationEnabled) {
    throw new Error('Portal invitations require the trusted server-side Auth provisioning workflow.');
  }
  const { data: existing, error: lookupError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', personId)
    .maybeSingle();
  if (lookupError) throw lookupError;
  if (!existing) throw new Error('Member directory record not found.');

  const current = toDirectoryProfile(existing);
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

  return { profile: toDirectoryProfile(updated), portalInvite: inviteData };
}

/** Revokes portal login access (`auth_user_id = null`) while keeping the person's church membership record intact. */
export async function disablePortalAccess(personId: string): Promise<Profile> {
  if (supabaseIntegrationEnabled) {
    throw new Error('Portal revocation requires the trusted server-side Auth provisioning workflow.');
  }
  await supabase.auth.revokePortalAccess(personId);
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', personId)
    .single();
  if (error) throw error;
  return toDirectoryProfile(data);
}
