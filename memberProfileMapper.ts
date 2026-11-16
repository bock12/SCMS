import type { Database } from './database.types';
import type { AppRole, MembershipStatus, PortalAccessLifecycle, PortalAccountStatus, Profile } from './types';

export type CanonicalProfileRow = Database['public']['Tables']['profiles']['Row'];
export type CanonicalProfileInsert = Database['public']['Tables']['profiles']['Insert'];
export type CanonicalProfileUpdate = Database['public']['Tables']['profiles']['Update'];

const MEMBERSHIP_STATUSES: readonly MembershipStatus[] = [
  'active', 'inactive', 'suspended', 'transferred', 'archived'
];
const PORTAL_STATUSES: readonly PortalAccessLifecycle[] = [
  'not_invited', 'invited', 'active', 'suspended'
];

function membershipStatus(value: string): MembershipStatus {
  return MEMBERSHIP_STATUSES.includes(value as MembershipStatus)
    ? value as MembershipStatus
    : 'active';
}

function portalLifecycle(value: string): PortalAccessLifecycle {
  return PORTAL_STATUSES.includes(value as PortalAccessLifecycle)
    ? value as PortalAccessLifecycle
    : 'not_invited';
}

function legacyPortalStatus(value: PortalAccessLifecycle): PortalAccountStatus | undefined {
  return value === 'active' || value === 'suspended' ? value : undefined;
}

/**
 * Maps the database's person-first profile row to the existing UI view model.
 * Role is deliberately a neutral display fallback: authoritative roles must be
 * loaded from profile_role_assignments and must never be inferred from this value.
 */
export function mapCanonicalProfileToProfile(row: CanonicalProfileRow): Profile {
  const portalAccessStatus = portalLifecycle(row.portal_access_status);
  return {
    id: row.id,
    auth_user_id: row.auth_user_id,
    branch_id: row.branch_id,
    first_name: row.first_name,
    last_name: row.last_name,
    email: row.email ?? '',
    phone: row.phone ?? '',
    gender: row.gender === 'male' || row.gender === 'female' || row.gender === 'other'
      ? row.gender
      : undefined,
    avatar_url: row.avatar_url ?? undefined,
    primary_role: 'member' satisfies AppRole,
    status: legacyPortalStatus(portalAccessStatus),
    portal_access_status: portalAccessStatus,
    membership_status: membershipStatus(row.membership_status),
    membership_date: row.membership_date ?? undefined,
    created_at: row.created_at,
    is_baptized: row.is_baptized,
    baptism_date: row.baptism_date ?? undefined,
    baptized_by: row.baptized_by_name_snapshot ?? undefined,
    baptized_by_profile_id: row.baptized_by_profile_id,
    date_of_birth: row.date_of_birth ?? undefined,
    marital_status: row.marital_status === 'Single' || row.marital_status === 'Married' ||
      row.marital_status === 'Widowed' || row.marital_status === 'Divorced'
      ? row.marital_status
      : undefined,
    marriage_date: row.marriage_date ?? undefined
  };
}

/** Maps canonical form data to allowed profile columns; never writes role fields. */
export function mapProfileInputToCanonicalInsert(input: {
  first_name: string;
  last_name: string;
  branch_id?: string | null;
  email?: string | null;
  phone?: string | null;
  gender?: string | null;
  avatar_url?: string | null;
  membership_date?: string | null;
  membership_status?: string;
  is_baptized?: boolean;
  baptism_date?: string | null;
  baptized_by_profile_id?: string | null;
  baptized_by_name_snapshot?: string | null;
  date_of_birth?: string | null;
  marital_status?: string | null;
  marriage_date?: string | null;
}): CanonicalProfileInsert {
  return {
    first_name: input.first_name,
    last_name: input.last_name,
    branch_id: input.branch_id ?? null,
    email: input.email?.trim().toLowerCase() || null,
    phone: input.phone?.trim() || null,
    gender: input.gender ?? null,
    avatar_url: input.avatar_url ?? null,
    membership_date: input.membership_date ?? null,
    membership_status: input.membership_status ?? 'active',
    is_baptized: input.is_baptized ?? false,
    baptism_date: input.baptism_date ?? null,
    baptized_by_profile_id: input.baptized_by_profile_id ?? null,
    baptized_by_name_snapshot: input.baptized_by_name_snapshot ?? null,
    date_of_birth: input.date_of_birth ?? null,
    marital_status: input.marital_status ?? null,
    marriage_date: input.marriage_date ?? null,
    portal_access_status: 'not_invited',
    record_status: 'active',
    auth_user_id: null
  };
}

/** Whitelist of editable person/membership fields; auth and role fields are excluded. */
export function mapProfileInputToCanonicalUpdate(input: Partial<{
  first_name: string;
  last_name: string;
  branch_id: string | null;
  email: string | null;
  phone: string | null;
  gender: string | null;
  avatar_url: string | null;
  membership_date: string | null;
  membership_status: string;
  is_baptized: boolean;
  baptism_date: string | null;
  baptized_by_profile_id: string | null;
  baptized_by_name_snapshot: string | null;
  date_of_birth: string | null;
  marital_status: string | null;
  marriage_date: string | null;
}>): CanonicalProfileUpdate {
  const update: CanonicalProfileUpdate = {};
  if (input.first_name !== undefined) update.first_name = input.first_name;
  if (input.last_name !== undefined) update.last_name = input.last_name;
  if (input.branch_id !== undefined) update.branch_id = input.branch_id;
  if (input.email !== undefined) update.email = input.email?.trim().toLowerCase() || null;
  if (input.phone !== undefined) update.phone = input.phone?.trim() || null;
  if (input.gender !== undefined) update.gender = input.gender;
  if (input.avatar_url !== undefined) update.avatar_url = input.avatar_url;
  if (input.membership_date !== undefined) update.membership_date = input.membership_date;
  if (input.membership_status !== undefined) update.membership_status = input.membership_status;
  if (input.is_baptized !== undefined) update.is_baptized = input.is_baptized;
  if (input.baptism_date !== undefined) update.baptism_date = input.baptism_date;
  if (input.baptized_by_profile_id !== undefined) update.baptized_by_profile_id = input.baptized_by_profile_id;
  if (input.baptized_by_name_snapshot !== undefined) update.baptized_by_name_snapshot = input.baptized_by_name_snapshot;
  if (input.date_of_birth !== undefined) update.date_of_birth = input.date_of_birth;
  if (input.marital_status !== undefined) update.marital_status = input.marital_status;
  if (input.marriage_date !== undefined) update.marriage_date = input.marriage_date;
  return update;
}
