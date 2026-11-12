/**
 * @deprecated Retained temporarily only as a migration boundary note.
 * Per ADR-0001, `profiles` is the canonical person/member directory and
 * dual-write profile-to-member synchronization has been retired.
 */
export async function syncLinkedMemberProfile(): Promise<void> {
  // No-op: personal and membership data are stored once in `profiles`.
}
