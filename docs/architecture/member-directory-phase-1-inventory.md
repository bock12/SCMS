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


## 9. Completed repository-wide audit (2026-11-13)

The initial inventory above has now been checked against the current repository tree and implementation at main commit `01ee1fcdedff88192cd4497ade7433e9f9319966`. The repository tree contained 74 tracked paths at the time of review. Relevant application, service, test, schema, migration, and workflow files were inspected; the findings below supersede the earlier statement that repository-wide search and test discovery were still pending.

### 9.1 Canonical-model implementation already present on main

The current main branch already contains a substantial first implementation of ADR-0001:

- `types.ts` defines `Profile.auth_user_id?`, `MembershipStatus`, and `PortalAccountStatus`, with identity and membership fields on `Profile`.
- `memberService.ts` reads and writes the directory through `profiles`; it provides person registration, editing, independent membership and portal status updates, portal enable/disable, and invitation/setup handling.
- `memberDirectoryService.ts` reads canonical profiles only.
- `memberProfileSyncService.ts` is now a compatibility no-op rather than a second write path.
- `App.tsx`'s main Member Directory uses one profile list, one registration/edit flow, and a portal-access toggle that defaults off.
- `ministryMemberService.ts`, event-survey services, and the ministry/role screens resolve their member references against canonical profile IDs.
- `supabaseClient.ts` normalizes legacy browser-local records from `members` into `profiles` and remaps selected legacy member IDs.
- `memberService.integration.test.ts` covers directory-only registration, optional portal provisioning, unique auth links, portal revocation/deletion, independent lifecycles, validation, legacy conversion, and transfer/event-registration ID remapping.

This is application/mock-database implementation evidence only. It does not prove that a remote Supabase database has been migrated.

### 9.2 Complete migration inventory and schema-baseline finding

The repository contains seven SQL migrations:

1. `20261110000100_expand_member_records.sql`
2. `20261111000100_align_event_registration_attendance.sql`
3. `20261111000200_create_ministry_membership.sql`
4. `20261111000300_create_resources_and_event_surveys.sql`
5. `20261112000100_add_atomic_event_survey_submission.sql`
6. `20261112000200_enforce_unique_member_profile_link.sql`
7. `20261112000300_unify_profiles_member_directory.sql`

The first six migrations assume that `public.members` exists. They add member columns, add member foreign keys, create event-survey references to members, query members in RLS/RPC logic, and enforce uniqueness on `members.profile_id`. The final migration decouples `profiles.id` from auth identity, adds `auth_user_id`, merges member rows, remaps the four SQL dependent tables (`ministry_members`, `member_transfers`, `event_registrations`, and `event_survey_responses`), updates policies/RPC logic, and drops `public.members`.

**Schema-baseline blocker:** the current root `schema.sql` is already a canonical-profile schema: it defines `profiles.auth_user_id` and membership fields, and its ministry/transfer/event-registration foreign keys point to `profiles`. It does not define the legacy `members` table expected by migrations 1–6. Therefore, `schema.sql` cannot safely be treated as the pre-migration baseline for replaying the full seven-file migration history. The project must explicitly document whether a fresh Supabase setup uses the current consolidated `schema.sql` as the complete target schema (without replaying historical migrations), or uses a separately versioned legacy baseline followed by all migrations. Do not apply both paths together.

### 9.3 Dependent application and mock-data references

The audit confirmed these current contracts:

- Ministry roster rows use `ministry_members.member_id` as a canonical `profiles.id`; roster reads join to profiles.
- Transfers resolve their `member_id` against canonical profiles.
- Event registrations use canonical person IDs for `member_id`; the auth identity belongs in `user_id` only when an authenticated user exists.
- Event survey eligibility and response services resolve the signed-in person through `auth_user_id` and store canonical profile IDs.
- Role assignments retain both `member_id` and `profile_id` compatibility fields in parts of the UI/mock model; both currently represent the canonical person ID and should be normalized in a later dependent-module cleanup.
- Welfare contributions, welfare cards, campaign beneficiaries, and department-ledger links are currently browser-local data structures, not SQL foreign keys in the inspected migration set. Their IDs must still be preserved/remapped when browser-local legacy data is normalized. Name-based matching remains a legacy fallback and must not become the canonical identity rule.
- `types.ts` still contains a legacy `Member` interface and compatibility member/profile ID fields. Their eventual removal is a later cleanup after all imports and serialized data have been reconciled.

### 9.4 Remaining implementation and deployment risks

The source review identified follow-up work for Phase 2:

1. The root auth-profile resolver first queries `profiles.auth_user_id`, but still falls back to `profiles.id = auth user id` and fabricates a client-side profile if no row is found. The fallback is contrary to the new identity contract and should be removed once auth-trigger/provisioning behavior is verified.
2. The mock `signInWithPassword` path still auto-creates an account when an email is unknown. A failed sign-in must not create an identity; account creation must remain explicit.
3. Mock sign-up/provisioning and SQL `handle_new_user` contain email-based linking behavior. The production linking flow must be protected against unverified or unauthorized email-based account claiming; a secure invitation/verified-email flow is required.
4. The final SQL migration drops all foreign keys referencing `public.members` dynamically, but explicitly remaps/recreates only the four currently known SQL dependent tables. Add a preflight assertion that fails if any unrecognized FK still references `members`, and verify dependent row counts before/after remapping.
5. The final SQL migration resolves linked-profile field conflicts by precedence rules in the update statement; it does not persist a conflict report or require review for conflicting non-empty identity/membership values. This needs a reviewed reconciliation design before any production execution.
6. The existing `docs/testing/membership-workflow-acceptance.md` still describes the superseded dual-form workflow (including “Register Member (No Login)” and linking a separate portal profile). It must be rewritten to match ADR-0001.
7. No live Supabase connection, migration history, or production dataset was available during this audit. Whether a production database exists and which migrations have been applied remains unverified. This is a deployment gate, not a blocker to local/mock Phase 2 code work.

### 9.5 Automated test coverage and gaps

Confirmed automated coverage in `memberService.integration.test.ts` includes:

- person registration without email or auth;
- optional portal invitation/setup and sign-in after activation;
- uniqueness of non-null `auth_user_id`;
- unlinking/deleting auth without deleting the person;
- independent portal and membership lifecycles;
- validation and duplicate-contact checks;
- migration of legacy `members` browser data, including a transfer and event-registration reference.

Additional event-survey tests exist in `eventSurveyEligibility.test.ts` and `resourcesSurveysMockIntegration.test.ts`. The package test command is `bun test`.

Gaps: there is no test that executes the SQL migration against a disposable PostgreSQL/Supabase-compatible database; no test proves unknown-email sign-in is rejected without side effects; no security test proves an unverified signup cannot claim an existing person's record; and the existing legacy migration test should be expanded to cover ministry roster and event-survey response references plus orphan/duplicate conflict cases.

### 9.6 Phase 1 exit decision

- [x] Accepted target model and ADR recorded.
- [x] Main directory, registration/edit, service, mock-auth, and dependent-module paths inventoried.
- [x] All seven repository SQL migrations inspected and their historical dependency chain recorded.
- [x] Existing membership tests and acceptance documentation located.
- [x] Browser-local legacy ID migration behavior reviewed.
- [x] Phase 2 implementation risks and acceptance gaps recorded.
- [ ] Remote Supabase migration state and production data baseline verified — unavailable without project-owner connection/access.

**Phase 1 is complete for repository/source-code scope.** The remote database baseline remains explicitly unverified and is a hard gate for any database migration or deployment. Phase 2 may proceed against the application and mock implementation, without executing SQL or connecting to Supabase.

## 10. Phase 2 entry scope

Phase 2 begins with hardening the canonical person/auth identity boundary:

1. Remove auth-user-ID fallbacks that treat a person ID as an auth ID.
2. Make unknown-email sign-in fail without creating an account.
3. Make auth/profile linking explicit and resistant to unverified email-based account claiming.
4. Add regression tests for these invariants.
5. Review and correct the final SQL migration's preflight, conflict reporting, and dependent-reference assertions before it can be considered production-ready.

The existing canonical directory work is a starting implementation, not evidence that these Phase 2 safeguards are complete.
