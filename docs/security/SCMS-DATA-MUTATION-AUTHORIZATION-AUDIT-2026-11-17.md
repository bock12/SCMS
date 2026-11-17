# SCMS Data-Mutation Authorization Audit — 17 November 2026

**Repository:** bock12/SCMS  
**Branch:** main  
**Pre-change commit audited:** be547ba0048cf85cbb6cecac327cb373fd5c1088  
**Scope:** application mutation call sites; mock Supabase-compatible client; local browser storage; current PostgreSQL baseline and forward migrations; RLS, grants, triggers, SECURITY DEFINER routines, RPCs and Edge Function source.

## Executive summary

The current PostgreSQL baseline remains largely deny-by-default for direct authenticated writes. Most protected tables grant SELECT only; approved exceptions are narrow (self-profile personal fields, self event-registration INSERT, stream-chat INSERT, and the recipient's read_at UPDATE). Finance posting and approval transitions are database routines, not direct table writes.

The application is not yet aligned to that database contract. The mock query builder accepts generic INSERT/UPDATE/DELETE without authorization, and a large set of screens/services still persist member, finance, welfare, child-safety and event information in localStorage or mock-only tables. Those paths are development conveniences, not production security controls.

This follow-up found and fixed a privilege-scope escalation in district role management, future-dated assignments being honored by SQL permission helpers, and legacy permissive resource/survey/profile policies that could remain after the earlier forward migrations. No live Supabase project was accessed or modified.

## Severity-ranked findings

### Critical — C1: Generic mock CRUD is not an authorization boundary

LocalQueryBuilder in supabaseClient.ts applies generic INSERT, UPDATE and DELETE directly to the localStorage-backed database. It does not check the signed-in profile, effective permission, active assignment, expiry, church/district/branch scope, or a PostgreSQL-equivalent policy. The mock client does not implement upsert. A mock write succeeding says nothing about whether the PostgreSQL write is authorized.

The mock database also persists profiles, financial_records, prayer_requests, ministry_join_requests, event registrations and stream_credentials in browser storage. Demo auth users and password/setup-token metadata are stored locally; the seeded stream credential is a raw-looking key. Keep this adapter strictly for development/demo data and never use it with real member, finance, child-safety or credential data.

### Critical — C2: Stream administration has no deployable server implementation

AdminDashboard invokes stream-admin for credential regeneration. edge_functions.ts is explicitly conceptual, not a deployable supabase/functions/<name>/index.ts Edge Function. The mock functions.invoke handler returns Math.random()-generated or hard-coded keys/playback URLs. There is no deployable JWT verification, manage_streams permission check, branch-scope check, secure secret generation, credential rotation audit or authorized secret-return contract. private.stream_credentials is protected by deny-all RLS and has no client grants, which is safe but leaves the feature unimplemented.

### High — H1: District role-management scope escalation — fixed

Before this change, assign_profile_role and deactivate_profile_role_assignment authorized district-scoped operations by checking whether the actor had manage_roles on any branch in the district. A branch-scoped admin in one branch could therefore create or deactivate a district-wide role assignment. The mock RPC reproduced the same escalation.

The new migration introduces private.has_district_permission, which accepts only a church-wide assignment or a matching district assignment for district-level actions. Branch assignments remain limited to branch actions. The mock RPC now follows the same rule. The migration also adds assigned_at <= now() to server-side permission and branch-access helpers so future-dated assignments do not grant early access.

### High — H2: Legacy role-name policies were broader than the current permission model — fixed

The forward migrations 20261111000300 and 20261112000300 create/recreate policies based on profiles.primary_role, including FOR ALL policies for resource/survey management and unscoped published-resource/survey/question reads. They also retain a broad self-profile UPDATE policy and direct survey INSERT policies. These permissive policies are additive in PostgreSQL; they can broaden access if applied alongside the newer scoped policies and suitable table grants.

The new cleanup migration drops the legacy policy names. The hardened baseline policies remain in place. The PostgreSQL workflow simulates these historical policies, applies the cleanup, and asserts they are absent. This does not broaden any grant.

### High — H3: Sensitive module data remains in browser localStorage

Confirmed localStorage-backed data includes:
- EventWorkspaceModal: child name/age, parent name/phone, child pickup/security code, guest-minister hotel/flight/pickup details and honoraria, event expenses, revenue and post-event closeout reports.
- welfareContributionService.ts: welfare contribution records.
- departmentLedgerService.ts, requisitionService.ts and eventBudgetService.ts: departmental ledger, requisitions, amounts, account/disbursement details and budget-approval state.
- surveyService.ts: respondent names and free-text feedback.
- App.tsx/AdminDashboard.tsx: legacy ministry rosters containing member names, email and phone.
- supabaseClient.ts: the full mock database, including financial records, prayer requests, ministry join requests and stream credential-like seed data.

These records have no server-side RLS, branch isolation, audit trail, centralized retention or cross-device authorization. Do not use these paths for real personal, welfare, financial or child-safeguarding data. A secure schema and permission/scope contract is needed before migration; code was left unchanged where the data lifecycle is undefined.

### High — H4: Direct application DML does not match the PostgreSQL contract

The mock client accepts writes that the real baseline denies. Important examples are:
- profiles registration and staff membership/portal-state changes;
- ministries and ministry_members CRUD;
- events CRUD, event counts, registration cancellation and attendance check-in;
- church_resources CRUD;
- event_surveys and event_survey_questions authoring;
- streams CRUD;
- financial_records creation/approval/rejection.

These calls are not protected by frontend visibility checks. In the real baseline the relevant tables are SELECT-only except for narrow self-service exceptions. The application must move these actions to permission-checked RPCs or explicitly scoped RLS policies; broad grants are not an acceptable repair.

### High — H5: Member transfer and branch configuration server operations are missing

memberService.ts explicitly rejects a branch_id change outside an approved transfer workflow. No application writer or permission-checked RPC for member_transfers was found. member_transfers is read-only to authenticated clients. The intended contract is manage_member_transfers across source and destination branch scope, but the operation is not implemented.

Similarly, church_settings, districts and church_branches are read-only in the baseline. No branch-configuration mutation RPC or deployable server operation was found. Keep these writes unavailable until the workflow, approval rules and manage_branches scope are defined.

### High — H6: Explicitly cleared mock role assignments could be reconstructed from legacy role labels — fixed

The mock database loader previously treated both a missing `profile_role_assignments` array and an explicitly empty array as a signal to bootstrap assignments from `profiles.primary_role`. That could silently restore permissions after assignments had been deliberately cleared. Commit 3c075638 changes the migration rule: bootstrap only when the assignment table is absent; an existing empty array is authoritative. A regression test verifies that an empty assignment table remains empty.

### Medium — M1: Survey submission contracts are inconsistent

The baseline has private.submit_event_survey(uuid,jsonb), SECURITY DEFINER with an empty search_path, current-profile derivation, survey-window/respondent eligibility and atomic response/answer writes. The online service calls public.submit_event_survey_response with answer_value fields, but the baseline exposes only the private function, whose payload contract uses answer. The separate forward migration creates a SECURITY INVOKER public function that queries the legacy public.members table, which the unified-profile baseline deliberately does not contain. eventSurveyService.ts still has direct response/answer INSERT and compensating DELETE paths.

Do not grant direct response/answer DML. Align the unified-profile client contract and a thin public wrapper around the private atomic routine in a dedicated survey integration task.

### Medium — M2: Members-only and church-wide read semantics need a product decision

resources_authenticated_read allows members_only resources with branch_id NULL to any authenticated session; branch-specific resources are also readable to a matching profile without checking membership_status/record_status. ministries_scoped_read and ministry_members_scoped_read expose branchless church-wide rows to any authenticated session. The single-church settings, permission catalogue, published branchless notifications and branchless events are also broadly readable to authenticated users.

These may be intentional church-wide portal semantics, but the exact meaning of members_only and whether inactive/unlinked profiles retain access is not explicit. No policy was changed without that decision.

### Medium — M3: Trigger search_path hardening — fixed

public.handle_new_user() was SECURITY DEFINER and used SET search_path = pg_catalog, public. Its table references were schema-qualified and direct EXECUTE was already revoked, so no exploit was demonstrated. Migration 20261117000400 now pins an empty search_path and explicitly preserves the EXECUTE revocation. PostgreSQL regression coverage verifies the function configuration, denied direct execution, trigger attachment, exact trusted profile linking and no linking for unprovisioned users.

### Medium — M4: Welfare and notification publishing have no protected write contract

welfareContributionService.ts uses localStorage; welfare_cases, welfare_assistance, welfare_campaigns and welfare_contributions are SELECT-only in the baseline. systemNotificationService.ts derives notices from data and stores per-profile read/dismiss state locally; the database only permits the recipient's read_at column update. No authenticated publisher/case-management mutation RPC was found.

## Sensitive mutation inventory

| Operation / caller | Resource | Required permission and scope | Actual server-side enforcement |
|---|---|---|---|
| memberService.ts: register/update membership and portal state | profiles | manage_members; church/district/branch scope; self profile only for personal fields | Authenticated SELECT plus limited own-profile column UPDATE; staff DML denied. Mock generic CRUD accepts it. |
| Member transfer; memberService.ts blocks direct branch change | member_transfers, profiles.branch_id | manage_member_transfers; source and destination branch/district | Read-only transfer rows; no writer/RPC found. |
| profileRoleAssignmentService.ts | profile_role_assignments | manage_roles; exact church/district/branch assignment scope | SECURITY DEFINER public RPCs, empty search_path, explicit EXECUTE; direct DML denied. District scope and future-date checks hardened by this change. |
| AdminDashboard.tsx; ministryMemberService.ts | ministries, ministry_members | manage_ministries; ministry branch | SELECT-only; direct writes denied. Ministry/member links preserve profile-based membership. |
| ministryJoinRequestService.ts | ministry_join_requests | own request; manager decision at ministry branch | Table absent from fresh baseline; mock-only. |
| AdminDashboard.tsx; eventAccountService.ts | events | manage_events; event branch | SELECT-only; no general mutation routine. |
| App.tsx; CalendarPage.tsx; AdminDashboard.tsx | event_registrations | self-registration or manage_events/manage_attendance at event branch | INSERT only for eligible self-registration; no general UPDATE/DELETE. |
| EventWorkspaceModal.tsx; AdminDashboard.tsx | attendance_sessions, attendance_records, event_registrations | manage_attendance; event/session branch | Attendance tables SELECT-only; event registration UPDATE/DELETE denied. |
| FinanceOfficerWorkspace.tsx; AdminDashboard.tsx; App.tsx | legacy financial_records | manage_finances/approve_finances; branch | Table absent from baseline; mock-only. |
| Finance workflow routines | financial_documents, giving_records, budgets, journals, approvals | manage_finances, approve_finances, post_journals; document/journal branch | SECURITY DEFINER routines use empty search_path, permission checks, workflow/state validation; direct table DML denied. |
| welfareContributionService.ts | local welfare contributions; welfare tables | manage_welfare; branch; member self-read | Current writes are localStorage only; baseline tables SELECT-only; no writer RPC. |
| systemNotificationService.ts; inAppNotificationService.ts | notifications, notification_recipients | manage_notifications for publishing; own recipient read state | Published notifications SELECT-only; only read_at column UPDATE on own recipient; publisher routine absent. |
| churchResourceService.ts; ResourcesAdminTab.tsx | church_resources | manage_resources; resource branch | SELECT-only in baseline; direct CRUD denied. |
| eventSurveyService.ts; onlineSurveyService.ts | event_surveys, questions, responses, answers | manage_surveys at event branch; eligible respondent for submission | Authoring direct DML denied; private atomic submission routine exists but caller contract mismatch/direct fallback remains. |
| AdminDashboard.tsx; App.tsx | streams, stream_chat_messages, private.stream_credentials | manage_streams; stream branch; own chat sender | Streams SELECT-only; chat INSERT is sender/active-stream/branch constrained; credentials deny-all; Edge Function missing. |
| Church profile/branch settings | church_settings, districts, church_branches | manage_branches; church/district scope | SELECT-only; no mutation RPC found. |
| Browser persistence | child safety, event finance, welfare, requisitions, rosters, survey feedback, mock database | Corresponding module permission and branch scope | localStorage only; no server-side authorization, RLS, or centralized audit. No Supabase Storage API operations were found in application code. |

## SECURITY DEFINER, grants and policy review

- private.current_profile_id(), private.can_access_branch(), private.has_permission(), survey submission and finance workflow routines use SECURITY DEFINER where required and SET search_path = ''. The role-assignment public RPCs and public.handle_new_user() also use an empty search_path and explicit/revoked EXECUTE grants as appropriate.
- private.has_district_permission() is intentionally not executable by authenticated clients; it is called only inside the SECURITY DEFINER role-assignment functions.
- Role assignment RPC EXECUTE remains granted to authenticated; direct writes to profile_role_assignments remain denied.
- Finance approval/post/reversal routines enforce permission and workflow state; journal triggers protect posted entries and draft-only line mutation.
- private.stream_credentials and private.payment_gateway_payloads have deny-all RLS/no client DML.
- No Supabase Storage upload/download/signed-URL operation was found in the application code. The stream playback/key functions are mock placeholders, not deployed Edge Functions.
- Legacy role-name policies are now dropped by the new migration; the baseline's scoped read policies remain.

## Fixes implemented

1. Added 20261117000200_enforce_exact_district_role_management_scope.sql:
   - prevents branch-scoped administrators from creating or deactivating district assignments;
   - requires church-wide or matching district scope for district role management;
   - rejects future-dated assignments in has_permission and can_access_branch;
   - preserves active-role, active-assignment and expiry checks;
   - retains explicit function grants and empty search_path.
2. Updated mock RPC scope handling to match the server rule.
3. Added role-assignment mock tests for branch/district/church, inactive, expired and future-dated assignments.
4. Added 20261117000300_remove_legacy_unscoped_resource_survey_policies.sql to remove additive role-name policies and direct survey INSERT policies.
5. Extended the PostgreSQL workflow with legacy-policy cleanup and district-scope regression checks, plus broader deny-direct-DML coverage for branch configuration, finance approvals, audit logs and private credential/payload tables.
6. Added 20261117000400_harden_auth_linking_trigger_search_path.sql to pin `public.handle_new_user()` to an empty search_path and preserve denied direct EXECUTE for client roles; added PostgreSQL trigger/linking regression coverage.
7. Changed mock role-assignment bootstrap to migrate only when the assignment array is absent, not when it is explicitly empty; added a regression test against restoring cleared permissions from legacy role labels.

## Unresolved risks and decisions

1. Keep generic mock CRUD and mock auth strictly development-only; do not treat it as authorization.
2. Design secure storage and retention for child-safety, welfare, event finance, departmental ledgers, requisitions, ministry rosters and survey feedback before using real data.
3. Define member-transfer and branch-configuration workflows and server permissions.
4. Align survey submission to unified profiles and the private atomic routine; remove direct fallback writes.
5. Decide whether members_only and branchless ministry/resource reads require active membership.
6. Implement deployable stream-admin and playback Edge Functions with JWT, permission/scope, secure secrets and audit logging.
7. Implement protected mutation contracts for ministries, events, attendance, resources, survey authoring, welfare and notifications.
8. Verify the actual applied migration history before production: the fresh-install baseline is still marked inactive/not approved for deployment and is not a substitute for inspecting a live Supabase schema.

## Final validation — 17 November 2026

- **Verified `main` head:** `2faf410d13036bf23db5b904dc9cf4f2d6394c61` — [final code commit](https://github.com/bock12/SCMS/commit/2faf410d13036bf23db5b904dc9cf4f2d6394c61).
- **SCMS Build Validation #265:** [success](https://github.com/bock12/SCMS/actions/runs/44056808900) on the same SHA. Bun test suite: **57 passed, 0 failed, 258 assertions across 9 files**. Vite production build completed successfully; the existing large-bundle warning remains.
- **PostgreSQL 17 Test #22:** [success](https://github.com/bock12/SCMS/actions/runs/44056809215) on the same SHA. All workflow steps passed against a disposable PostgreSQL 17 service, including auth-linking trigger/search_path checks, legacy-policy cleanup, exact church/district/branch role-management scope, inactive/expired/future-dated/inactive-role rejection, role-assignment RPC checks, profile isolation and deny-direct-DML assertions for protected domain tables.
- The mutation scan of current application TypeScript/TSX found direct INSERT/UPDATE/DELETE paths and RPC calls, but no `.upsert()` call and no Supabase Storage upload/download/signed-URL call. Browser `localStorage` persistence remains present and is listed as an unresolved development-only data path.
- **Browser/runtime:** not exercised; build and unit/integration tests do not prove browser behavior.
- **Live Supabase:** not connected to, queried, migrated or modified. The disposable PostgreSQL run is not a live-schema migration-history check; verify actual applied migration history and the deployed Auth trigger before production.
