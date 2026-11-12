# Member Directory Unification — Phase 1 Dependency Inventory

- **Related decision:** [ADR-0001 — Unified Member Directory and Optional Portal Access](ADR-0001-unified-member-directory.md)
- **Target branch:** `main`
- **Inventory baseline:** 2026-11-12
- **Status:** Initial source-backed inventory; implementation remains blocked on completing the full repository-wide reference and test audit.

## 1. Purpose and scope

This document records the current dependencies that must be addressed before `members` can be retired and `profiles` becomes the canonical person directory.

The target model is defined by ADR-0001:

- `profiles.id` is a stable person ID and is independent of authentication identity.
- `profiles.auth_user_id` is nullable and unique.
- A profile/person can exist without email or portal access.
- Membership lifecycle and portal-account lifecycle remain separate.
- Membership-related records reference the canonical person ID.
- The old `members` table is retained until all data and references have been migrated and validated.

This is an inventory, not authorization to run a Supabase migration. Supabase is not connected in the current application workflow.

## 2. Current identity and authentication coupling

### 2.1 Database schema

| Current object | Current relationship / behavior | Required transition |
|---|---|---|
| `profiles.id` | Primary key references `auth.users(id) ON DELETE CASCADE`. | Replace with generated stable person ID. |
| `members.profile_id` | Nullable reference to `profiles(id) ON DELETE SET NULL`. | Replace with optional `profiles.auth_user_id` relationship only where account linkage is needed; do not use it as the person identity. |
| `members.id` | Stable membership-row ID used by dependent records. | Backfill/mapping must preserve identity or explicitly remap every dependent reference. |
| `profiles` | Stores name, contact details, avatar, role and creation time. | Extend to own all person and church-membership fields. |
| `members` | Stores person/contact details, branch, gender, membership status/date, baptism and family details. | Read-only migration source during transition; retire only after validation. |

The SQL schema currently declares these foreign keys to `members(id)`:

- `ministry_members.member_id`
- `member_transfers.member_id`
- `event_registrations.member_id`

The SQL schema also declares `event_registrations.user_id` against `profiles(id)`. This currently conflates the person ID and auth identity and must be reviewed as part of the auth-link transition.

### 2.2 Mock authentication and local persistence

Confirmed in `supabaseClient.ts`:

- The mock `createUser()` creates an auth-like user and a profile with the same ID.
- Mock users and passwords are persisted by the browser-local mock auth store. This is demo-only behavior and must not be carried into production credential handling.
- `deleteUser()` currently removes the profile row when deleting a mock auth user. The target behavior must instead clear the optional auth link and preserve the person record.
- `signInWithPassword()` can auto-create a guest account when an email is not found. This behavior must be reviewed; account creation should be an explicit authentication action, not an implicit side effect of failed sign-in.
- The app root resolves the signed-in profile using `profiles.id = auth user id`. It must resolve through `profiles.auth_user_id` after identity decoupling.
- The mock query builder has special uniqueness handling for `members.profile_id`. That constraint and its tests/fixtures must be replaced with uniqueness on `profiles.auth_user_id`.

## 3. Member Directory UI and service dependencies

| File / area | Current dependency | Required change |
|---|---|---|
| `App.tsx` — `DirectoryPage.loadDirectory()` | Loads `profiles` and `getMembers()` separately into separate state collections. | Load the directory from `profiles` only. |
| `App.tsx` — Add New Member | Inserts a profile, then calls `ensureLinkedMemberRecord()`; profile and member writes are separate. | Create one person record. Create/link auth only when portal access is requested. |
| `App.tsx` — Register Member (No Login) | Calls `registerChurchMember()` to insert a standalone `members` row. | Retire this second form after the unified profile workflow is complete. |
| `App.tsx` — profile editing | Updates `profiles`, then separately updates the linked `members` row. | One canonical person update; no mirrored personal-data write. |
| `App.tsx` — membership editing | Calls `updateChurchMemberRecord()` using `members.id`. | Edit membership fields on the canonical profile/person record. |
| `App.tsx` — directory filters | Maintains profile filters and membership filters over different data sets. | Consolidate search and filters over the unified directory while keeping membership and portal statuses distinct. |
| `memberService.ts` | Implements `getMembers`, `ensureLinkedMemberRecord`, `updateLinkedMemberDetails`, `registerChurchMember`, and `updateChurchMemberRecord` against `members`. | Replace with profile/person service operations; remove synchronization helpers after all consumers migrate. |
| `memberDirectoryService.ts` | Joins `members` and `profiles` by `profile_id`; directory output is membership-row based. | Replace with a profile-only directory query/mapper. |
| `memberProfileSyncService.ts` | Copies profile identity fields into `members`. | Retire after the last dual-write consumer is removed. |
| `types.ts` | `Profile` lacks gender and membership lifecycle fields; `Member` owns them. | Move person and membership fields onto the canonical person type; model auth linkage as optional. |

### 3.1 Registration and credential hazards found

The current Add New Member handler:

- Constructs a synthetic profile ID rather than a stable person ID independent of auth.
- Hardcodes `branch-1` in the new profile payload.
- Writes `has_login_credentials`, `login_email`, and `temporary_password` as profile metadata.
- Does not call `supabase.auth.createUser()` before presenting the credential modal.
- Initializes the form with portal access enabled and a hard-coded default password.

These behaviors must not be copied into the unified implementation. The form should default to no portal access unless the user explicitly enables it; portal access must use a supported provisioning/invitation flow and must never persist plaintext passwords in profile data or local storage.

## 4. Confirmed member-ID consumers

The following references were confirmed in the current source files reviewed. The list is deliberately separated by storage type because some references are TypeScript/mock-domain relationships rather than SQL foreign keys.

### 4.1 SQL foreign keys in `schema.sql`

| Table | Column | Current target |
|---|---|---|
| `ministry_members` | `member_id` | `members(id)` |
| `member_transfers` | `member_id` | `members(id)` |
| `event_registrations` | `member_id` | `members(id)` |
| `event_registrations` | `user_id` | `profiles(id)` |

### 4.2 TypeScript domain relationships in `types.ts`

| Type | Field | Meaning |
|---|---|---|
| `MemberTransfer` | `member_id` | Person whose membership is being transferred. |
| `MinistryMember` | `member_id` | Person participating in a ministry. |
| `EventRegistration` | `member_id` | Person associated with an event registration. |
| `MemberContribution` | `member_id` | Person associated with a contribution. |
| `MemberWelfareCard` | `member_id` | Person's welfare card. |
| `WelfareCampaignDrive` | `beneficiary_member_id` | Campaign beneficiary. |
| `EventSurveyResponse` | `member_id` | Survey respondent. |
| `MemberRoleAssignment` | `member_id` | Person receiving a role assignment. |
| `DepartmentLedgerRecord` | `member_id` | Optional person reference for a ledger record. |

These fields should converge on the canonical profile/person ID. Do not rename or remap them mechanically without reviewing each service and its stored records.

### 4.3 Additional consumers confirmed in reviewed files

- `App.tsx` resolves an event registrant's membership row by querying `members.profile_id`, then stores that row's ID in `event_registrations.member_id`.
- `welfareContributionService.ts` uses member IDs to associate contributions, welfare cards, campaign beneficiaries, monthly dues, and volunteer-related records. It also contains name-based fallback matching; that fallback should be retained only as a migration/reconciliation aid, not as the long-term identity mechanism.
- `supabaseClient.ts` seeds member rows, transfer rows, and other mock records with `mem-*` identifiers and enforces uniqueness on `members.profile_id`. Fixtures must be migrated consistently with the new person IDs.
- `MemberEventSurveysPage.tsx` defines the survey UI; the response identity contract is represented by `EventSurveyResponse.member_id` in `types.ts`.

## 5. Required migration mapping

The migration must create a deterministic mapping from each existing `members.id` to exactly one canonical `profiles.id`.

Required reconciliation cases:

1. **Linked member:** If `members.profile_id` points to an existing profile, merge the membership fields into that profile without overwriting non-empty canonical identity fields silently.
2. **Unlinked member:** Create a profile/person row with a new stable person ID and no `auth_user_id`.
3. **Orphaned profile:** Preserve the profile as a person record, with membership fields explicitly set to the agreed non-member/default state if the domain supports account-only profiles. Do not fabricate membership.
4. **Duplicate identity candidates:** Do not auto-merge on name alone. Flag email/phone/name matches for review and preserve both rows until resolved.
5. **Conflicting branch or lifecycle values:** Record the conflict and require an explicit deterministic resolution rule.
6. **Existing references:** Rewrite all dependent member IDs using the mapping table before dropping or retiring `members`.
7. **Authentication deletion:** Deleting or unlinking an auth user must preserve the person row and all membership history.

The migration must be forward-only, transactional where supported, idempotent or safely guarded, and include pre/post counts plus orphan and duplicate checks.

## 6. Implementation sequence and acceptance gates

### Phase 1 — Inventory (this document)

- [x] Record the accepted target model from ADR-0001.
- [x] Inspect current directory registration/edit flows and member services.
- [x] Inspect the SQL foreign keys currently visible in `schema.sql`.
- [x] Record confirmed member-ID domain relationships and mock-auth coupling.
- [ ] Complete repository-wide search for every query, mutation, fixture, migration, and test using `members`, `profiles`, `member_id`, `profile_id`, and auth user IDs.
- [ ] Confirm whether any existing Supabase migration files or production data exist.
- [ ] Add/confirm automated tests for person-only registration, account linking, account unlinking, and dependent-ID preservation.

**Gate:** Do not change the canonical schema or remove the `members` table until the unchecked inventory items are resolved.

### Phase 2 — Canonical person model

- Extend the profile/person type and mock database to support all identity and membership fields.
- Add a nullable unique auth-user link.
- Change mock auth creation/deletion and sign-in profile resolution to use the auth link.
- Keep account status independent from membership status.
- Add unit tests for identity invariants.

### Phase 3 — Unified directory and form

- Make `profiles` the sole directory data source.
- Update Add New Member to create a person record with optional portal provisioning.
- Remove the separate no-login registration UI only after parity is demonstrated.
- Consolidate profile editing into one member profile workflow.
- Remove plaintext/default password handling and credential display that is not backed by successful account provisioning.

### Phase 4 — Dependent modules

- Migrate ministry, transfer, event, survey, welfare, contribution, role-assignment and ledger references to canonical person IDs.
- Update mock fixtures and all services.
- Preserve history and existing IDs through a documented mapping.

### Phase 5 — Supabase migration and retirement

- Add a reviewed forward-only SQL migration.
- Backfill and reconcile all people.
- Remap dependent foreign keys.
- Validate counts, uniqueness, nullability, and orphan references.
- Retire `members` only after every check passes.

**Execution restriction:** Authoring a migration does not authorize running it. Do not connect to or execute changes against Supabase without explicit project-owner approval.

## 7. Verification checklist for the implementation PRs

- [ ] A person can be created without an email or auth user.
- [ ] A person can be created with portal access and the auth user is actually provisioned/linked.
- [ ] Failed auth provisioning does not leave a misleading enabled-account state.
- [ ] A person remains in the directory after auth unlink/deletion.
- [ ] Membership status changes do not alter portal-account status.
- [ ] Portal suspension does not alter membership status.
- [ ] Search and filters return all people, including those without portal access.
- [ ] Existing member-dependent records still resolve to the correct person.
- [ ] Duplicate and orphan reconciliation checks pass.
- [ ] TypeScript, lint, build, and automated tests pass.
- [ ] No Supabase migration has been executed without explicit approval.

## 8. Inventory limitations

This document records references confirmed in the files inspected for this phase. It is not yet a claim that every repository consumer has been found. GitHub code search did not return usable indexed results during this review, so the remaining repository-wide search and test discovery are explicit blockers rather than assumed complete work.
