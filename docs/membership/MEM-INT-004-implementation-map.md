# MEM-INT-004 — Dependent Module Integration Map

**Repository:** `bock12/SCMS`  
**Target branch:** `main`  
**Baseline commit reviewed:** `1ea56724e7a2e35119dc892d8740e01f35006840`  
**Development database:** Supabase project `fpzcwetpcwswhxmyeqzh`  
**Review date:** 2026-11-24

## Objective

Ensure ministry membership, member transfers, attendance, event registrations, welfare and member contributions consistently reference the unified church-member record (`public.profiles.id`), enforce branch-scoped authorization in the database, and persist through database-backed workflows rather than unrelated browser storage.

The development default remains mock authentication. Live writes must not be enabled merely to complete this integration; the live database APIs must require a real authenticated session and enforce permissions independently of UI checks.

## Verified baseline

### Canonical member identity

The deployed foreign keys confirm that these dependent records reference `public.profiles(id)`:

| Area | Member reference | Verified target |
|---|---|---|
| Ministry roster | `ministry_members.member_id` | `profiles.id` |
| Transfers | `member_transfers.member_id` | `profiles.id` |
| Attendance | `attendance_records.member_id` | `profiles.id` |
| Event registrations | `event_registrations.member_id` | `profiles.id` |
| Welfare cases | `welfare_cases.member_id` | `profiles.id` |
| Welfare assistance | `welfare_assistance.case_id` | `welfare_cases.id` (which links to `profiles.id`) |
| Welfare campaigns | `welfare_campaigns.branch_id` | `church_branches.id` (branch-scoped; no member FK) |
| Member contributions | `welfare_contributions.contributing_member_id` | `profiles.id` |

The historical `20261111000200_create_ministry_membership.sql` migration references `members(id)`, while the deployed/reconciled schema references `profiles(id)`. Treat the deployed canonical schema and the current fresh-install baseline as authoritative; update the historical migration only through an explicit baseline reconciliation, not by silently rewriting applied migration history.

### Database security

RLS is enabled on `profiles`, `ministry_members`, `member_transfers`, `attendance_sessions`, `attendance_records`, `event_registrations`, `welfare_cases`, `welfare_assistance`, `welfare_campaigns`, and `welfare_contributions`.

The deployed policy inventory currently provides scoped/self SELECT access for these dependent tables, including case-derived access to welfare assistance and active/branch-scoped campaign reads. Event registrations additionally have a member-self INSERT policy. No manager-scoped write policies or module-specific write RPCs were found for ministry roster writes, transfers, attendance records/sessions, event registration management, welfare cases, or welfare contributions. The UI must not assume direct table writes will be authorized in live mode.

The live project currently contains one profile and zero rows in the reviewed dependent tables. This allows schema/policy verification but not reconciliation of populated dependent records.

## Module-by-module findings

| Module | Current implementation | Gap / required integration |
|---|---|---|
| Ministry membership | `ministryMemberService.ts` reads `ministry_members` and resolves roster people from `profiles`; add/update/remove are direct table writes. | Preserve profile IDs; move manager writes behind branch-scoped authorization/RPC; make join-request approval and roster/count changes atomic; remove name/department/local-roster fallbacks from canonical persisted membership decisions over time. |
| Transfers | `member_transfers` exists and its member FK targets `profiles.id`; the Admin dashboard currently contains roadmap copy describing transfers but no complete transfer workflow was found. | Add request, review/approval, and completion workflow with source/destination branch authorization, status transition validation, audit attribution, and atomic membership branch/status update. |
| Attendance | `attendance_sessions` and `attendance_records` exist; records reference `profiles.id`. Event check-in currently updates `event_registrations` instead. No canonical attendance service path was found in the reviewed application files. | Add a scoped session/record service and secure write API; define how event check-in maps to attendance without double counting or maintaining conflicting totals. |
| Event registrations | Admin UI reads `event_registrations`; manual registration inserts `user_id` and contact snapshots but does not populate canonical `member_id`; check-in updates registration status directly. | Populate `member_id` from selected profile; retain guest snapshots only for non-member attendees; enforce event/branch scope; make capacity and registration-count updates atomic; use a secure manager API for create/update/cancel/check-in. |
| Welfare cases and assistance | `welfare_cases.member_id` references `profiles.id`; assistance is reached through its case; both have member/manager SELECT policies. | Ensure case creation, assignment, assistance recording and status changes use authorized server-side operations; preserve sensitive case details under least-privilege access. |
| Welfare campaigns | Campaign reads are active-status and branch scoped; no campaign write policy was found. | Move campaign creation and lifecycle changes from local state to authorized persistence, scoped to the campaign branch. |
| Member contributions | `welfare_contributions` links optional contributing profile and required `financial_documents.id`; deployed policy is read-only. `welfareContributionService.ts` currently reads/writes department-keyed `localStorage` and separately syncs a local department ledger. | Replace local persistence with a secure contribution workflow that creates/links a finance document and contribution row atomically; retain mock behavior when mock auth is active; do not create a second independent money ledger. |

## MEM-INT-004A implementation progress (2026-11-24)

The first server-side increment is now applied to the development database and committed to the fresh-install baseline:

- Ministry roster mutations now use `public.manage_ministry_member`, an authenticated invoker wrapper around a private `SECURITY DEFINER` implementation. The private function requires an active linked portal profile, `manage_ministries` permission for the ministry branch, a live ministry and active directory record, and matching member/ministry branch when the ministry is branch-bound. Add, update and remove execute atomically in one database call. Direct table write policies remain absent.
- `ministryMemberService.ts` now routes add/update/remove through that RPC. The mock client implements equivalent permission and branch checks, preserving mock-auth development.
- Member transfers now use `public.manage_member_transfer`, also an authenticated invoker wrapper around a private authorization-checked implementation. Requests can be made by the member or a source-branch transfer manager; review requires `manage_member_transfers` in both source and destination branches. Approval updates the member's branch and transfer record in one transaction. Rejection and requester/manager cancellation are supported. A member cannot have more than one pending transfer (enforced by a locked member row during request creation).
- `memberTransferService.ts` exposes read, request, approve/reject and cancel operations; the mock client implements the same lifecycle. `MemberTransfer` now matches the database status and timestamp fields while retaining the legacy optional `request_date` alias.
- Regression scripts `supabase/tests/ministry_roster_lifecycle.sql` and `supabase/tests/member_transfer_lifecycle.sql` are included in PostgreSQL fresh-install CI.

**Still outstanding in 004A:** application UI wiring for transfer requests/review and ministry join-request approval integration (the current live schema does not contain `ministry_join_requests`). The development database lifecycle scripts passed transactionally and rolled back all fixtures.

### MEM-INT-004B implementation progress (2026-11-24)

- Added `public.manage_event_registration` for member/guest registration, cancellation, check-in and absence marking. Member registrations now store `member_id = profiles.id`; guest registrations remain unlinked and retain contact snapshots.
- Registration creation locks the event, prevents duplicate active member registrations, and applies capacity/waitlist rules in the same transaction. Waitlisted attendees cannot be checked in while the event remains at capacity.
- Event check-in for a linked member now creates or updates a matching `attendance_sessions` / `attendance_records` entry. Event attendance sessions are unique by event, date and branch, so church-wide events can record attendance separately for members from different branches.
- Added `public.manage_attendance` for branch-authorized attendance session creation and attendance record upsert. New `attendanceService.ts` and `eventRegistrationService.ts` expose the read/write operations.
- Admin event roster registration and cancellation now use the registration service. Manual and QR check-in now use the attendance RPC. Event deletion is blocked while active registrations remain; it no longer attempts to bypass registration lifecycle with direct child-row deletion.
- Added regression coverage in `supabase/tests/event_registration_attendance_lifecycle.sql`; the test ran successfully against the development database inside a rollback transaction.

**Still outstanding in 004B:** a dedicated attendance management UI, browser acceptance for member/guest registration and check-in, and a full end-to-end run in CI after the latest commits. Event create/edit still has legacy direct writes outside this registration/attendance increment.

### MEM-INT-004C implementation progress (2026-11-24)

- Added branch-scoped welfare case create/update APIs. Members may submit their own case; another member's case requires `manage_welfare` permission in that member's branch. Case updates validate status/priority and require assigned officers to be active in the same branch.
- Added welfare campaign create/update APIs with branch authorization, supported-currency validation and non-negative target/expected contribution validation.
- Added welfare contribution and assistance link APIs. A contribution must reference an active campaign and a **posted receipt/adjustment** financial document; assistance must reference an approved/completed case and a **posted payment/adjustment** financial document. Branch and currency/member identity consistency are checked, and the existing database trigger remains an additional integrity guard.
- Added `welfareManagementService.ts` and equivalent mock RPC behavior. Added `supabase/tests/welfare_case_campaign_lifecycle.sql`; it passed against the development database in a rollback transaction, including rejection of missing/non-posted finance document references.

**Still outstanding in 004C:** the existing welfare passbook read model and contribution/campaign UI still use the legacy `localStorage` model. The current database schema does not yet represent all passbook categories (monthly dues and special support) or the existing card metadata, so replacing that read model requires a deliberate schema/data-model mapping rather than silently dropping those details. No end-to-end posted receipt-to-contribution or posted payment-to-assistance flow has yet been exercised.

## Recommended implementation sequence

1. **MEM-INT-004A — Ministry roster and transfer lifecycle**
   - Add focused integration tests for canonical profile IDs and branch-scoped visibility.
   - Introduce authorized, atomic server-side ministry roster operations.
   - Implement transfer request/review/approval/completion transitions, including membership branch/status updates and audit attribution.
2. **MEM-INT-004B — Attendance and event registration**
   - Establish one attendance write/read service.
   - Link member registrations to `profiles.id`; preserve guest registration snapshots without fabricating a member.
   - Add atomic capacity/count handling and manager-scoped registration/check-in operations.
3. **MEM-INT-004C — Welfare and member contributions**
   - Add least-privilege welfare case write operations.
   - Replace local-only member contribution persistence with a finance-document-backed contribution operation.
   - Verify that reversals/corrections follow finance document rules rather than mutating posted financial records.
4. **Cross-module acceptance**
   - Test members with and without portal access.
   - Test branch isolation, inactive/suspended portal identities, duplicate submissions, missing permissions, and failed/partial writes.
   - Verify mock mode remains the default and live auth is not silently activated.

## Acceptance principles

- A church member is identified by `profiles.id`, never by `auth.users.id`, email, display name, or a browser-generated substitute.
- Membership status and portal-access status remain separate.
- Branch scope and permissions are enforced in database functions/policies, not only in React components.
- Multi-step financial and membership lifecycle changes are atomic or explicitly retry-safe.
- Mock mode remains usable for development and does not claim to exercise live Supabase Auth.
- CI must include the new PostgreSQL integration tests and relevant browser smoke coverage.
