# SCMS Data-Mutation Authorization Audit

**Repository:** `bock12/SCMS`  
**Branch audited:** `main`  
**Audit date:** 16 November 2026  
**Audited commit:** `a6a16f7d66d08b74a7050118ad9562029dd7a2fa`  
**Scope:** application mutation call sites, the mock Supabase-compatible client, the PostgreSQL fresh-install baseline and forward migrations, RLS policies, grants, SECURITY DEFINER routines, and Edge Function source placeholders.

## Executive finding

The PostgreSQL baseline is substantially deny-by-default for direct writes: most authenticated table grants are SELECT-only, sensitive tables have RLS enabled, and selected operations are implemented as permission-checked SECURITY DEFINER routines. That is a useful database boundary, but it does **not** mean the current application write paths are production-ready.

The application is still running against a mock Supabase-compatible client. Multiple screens issue direct writes that the real baseline intentionally does not grant. Several writes target legacy/mock tables that do not exist in the current fresh-install schema. The mock client can accept or simulate operations that PostgreSQL would reject. This discrepancy is the highest-priority integration and security issue.

No live Supabase project was accessed or modified during this audit.

## Severity-ranked findings

### Critical — C1: Mock-only mutation paths are not backed by the current PostgreSQL schema

The UI and services directly write to `financial_records`, `prayer_requests`, and `ministry_join_requests`. These tables are not present in `supabase/baseline/fresh_install.sql`. The actual finance schema instead contains `giving_records`, `financial_documents`, `budgets`, `journal_entries`, `journal_lines`, and approval workflow tables.

Affected callers:
- `AdminDashboard.tsx` and `FinanceOfficerWorkspace.tsx`: create, approve, and reject `financial_records`.
- `App.tsx`: member giving receipt inserts into `financial_records`.
- `App.tsx`: prayer request insert into `prayer_requests`.
- `ministryJoinRequestService.ts`: create/update ministry join requests in `ministry_join_requests`.

**Actual enforcement:** no PostgreSQL table, RLS policy, or grant exists for these legacy table names in the fresh-install baseline. The mock client is not a security boundary. These operations cannot be considered database-protected or production-functional.

**Required decision:** map giving/finance UI to the real finance-document/giving/journal workflow; decide whether prayer requests and ministry join requests belong in the production schema and define their lifecycle, scope, retention, and permissions before adding tables/policies. Do not create permissive compatibility tables merely to make mock calls pass.

### Critical — C2: The generic mock query builder accepts DML without authorization

`supabaseClient.ts` implements `LocalQueryBuilder.insert/update/delete` by directly mutating localStorage-backed `localDb`. The generic `then()` execution path applies filters and writes records without checking the active profile, effective permission, role assignment state, branch/district scope, or a policy equivalent. There are a few integrity-specific special cases (for example, unique auth-user/profile links), and role-assignment RPCs have a separate simulation, but generic table DML is not protected by the database authorization model.

**Actual enforcement:** none in generic mock CRUD. This is acceptable only as a development data adapter and must never be interpreted as evidence that a user is authorized. It can make direct writes appear successful even though the PostgreSQL baseline denies them.

**Required decision:** retain the mock adapter for convenient development login, but add explicit development warnings and use PostgreSQL integration tests as the authority for authorization. Do not attempt to duplicate all RLS logic in the mock; that would create a second, potentially divergent security implementation.

### Critical — C3: Stream administration Edge Functions are conceptual placeholders

`AdminDashboard.tsx` invokes `supabase.functions.invoke('stream-admin')` to regenerate stream credentials. The only implementation found is `edge_functions.ts`, explicitly marked as conceptual and not a deployable Edge Function. It contains a placeholder comment for authorization and generates a key with `Math.random()`; it does not verify JWT identity, role assignment, scope, stream ownership, or securely persist/revoke a credential. The playback function returns a hard-coded example URL.

**Actual enforcement:** none in deployable Edge Function source. The UI's `manage_streams` guard is presentation-layer gating only. The database protects `private.stream_credentials` with RLS deny-all, but that alone does not implement the missing secure server operation.

**Required decision:** implement a real Edge Function with JWT verification, server-side active assignment + `manage_streams` scope check, cryptographically secure key generation, audited credential rotation, and no credential disclosure except to an authorized operator. Keep credential storage in the private schema. Do not expose service-role credentials to the browser.

### High — H1: Direct writes to existing protected tables are rejected by the real database

Application callers issue direct mutations for:
- `profiles`: member registration and staff membership/portal-state changes (`memberService.ts`); self-profile updates in `App.tsx`.
- `ministries` and `ministry_members`: create/update/delete and member-count changes (`AdminDashboard.tsx`, `ministryMemberService.ts`).
- `events`, `event_registrations`, attendance check-in and event counts (`AdminDashboard.tsx`, `CalendarPage.tsx`, `EventWorkspaceModal.tsx`, `eventAccountService.ts`).
- `church_resources`: create/update/delete (`churchResourceService.ts`).
- `event_surveys` and `event_survey_questions`: create/update/delete (`eventSurveyService.ts`).
- `streams`: create/update/delete/status changes (`AdminDashboard.tsx`).

**Actual enforcement:** the fresh-install baseline revokes broad table privileges and grants SELECT for these resources, with narrow exceptions such as:
- `profiles`: column-level updates for basic personal/contact fields only; RLS limits updates to the authenticated user's own linked profile.
- `event_registrations`: INSERT only, with RLS requiring the current profile as member and an eligible event/branch.
- `stream_chat_messages`: SELECT/INSERT only, with RLS requiring the current profile as sender.
- `notification_recipients`: UPDATE on `read_at` only, with RLS restricting the row to the current profile.

The baseline does not grant general INSERT/UPDATE/DELETE for ministries, ministry membership, events, attendance, resources, surveys, or streams. These direct writes should fail against the real database; mock success is not evidence of authorization.

**Required decision:** migrate each operation to a permission-checked database function or a narrowly scoped RLS DML policy. Define required permission and branch/district scope per operation first. For attendance, distinguish recording/check-in permission from self-registration. For ministry changes, preserve the established profile-linked membership model.

### High — H2: Finance UI bypasses the accounting and approval model

The finance UI directly inserts/updates `financial_records`, including direct approve/reject status changes and manual income/expense entries. The real baseline instead models giving records, financial documents, budgets, double-entry journals, approval requests/steps/decisions, and permission-checked submission/approval/posting functions.

**Actual enforcement:** no `financial_records` table exists in the fresh-install baseline. The actual finance tables are SELECT-only for authenticated clients. Sensitive posting and approval transitions are performed through SECURITY DEFINER routines that check `manage_finances`, `approve_finances`, or `post_journals` and enforce workflow state.

**Required decision:** remove the legacy finance ledger write path only as part of a planned finance UI migration. Never translate an approve/reject button into a direct status update or grant broad table writes.

### High — H3: Role assignment is correctly routed through server-side functions, but the mock RPC remains only a simulation

`profileRoleAssignmentService.ts` calls public `assign_profile_role` and `deactivate_profile_role_assignment`. The migration uses SECURITY DEFINER, an empty search_path, active role/permission checks, scope validation, and explicit EXECUTE grants. Direct table grants do not permit authenticated users to mutate role assignments.

**Actual enforcement:** PostgreSQL public RPCs in `20261116000100_secure_profile_role_assignment_operations.sql`; the mock client has a separate local simulation. PostgreSQL tests exercise allowed and denied assignment scope. Production authentication is not yet implemented, so the JWT/profile identity boundary remains a pre-production requirement.

### Medium — M1: Profile self-update paths exceed the database's granted update columns

The baseline grants self-update only for basic contact/profile columns (first/last name, email, phone, gender, DOB, marital fields, avatar). `App.tsx` also attempts to update baptism and membership milestone columns. Staff workflows update membership status and portal status via `memberService.ts`, but the baseline has no corresponding general staff DML grant/policy.

**Actual enforcement:** these additional writes are denied by the real PostgreSQL grants/RLS. The narrow self-update policy and column grants prevent a member from changing their membership or portal state. Keep this restriction; implement staff operations as permission-checked server functions after their permission/scope rules are agreed.

### Medium — M2: Survey submission has a secure database routine, but caller contract does not line up

The baseline provides `private.submit_event_survey(uuid,jsonb)`, SECURITY DEFINER with an empty search_path, authentication/profile checks, survey window and respondent eligibility checks, question ownership/required-answer validation, and transactionally inserts response/answers. `onlineSurveyService.ts` calls `submit_event_survey_response`, which is not the routine name in the baseline. `eventSurveyService.ts` also has direct response/answer insert and compensating delete paths.

**Actual enforcement:** the private function is granted to authenticated in SQL, but the schema is not a public PostgREST RPC surface by default; the public function name used by the client is absent from the baseline. Direct response/answer table writes are not granted.

**Required decision:** add a public, thin, authenticated wrapper with the agreed RPC name that delegates to the private routine, or update the service to use the supported server endpoint. Remove direct multi-step response/answer writes so they cannot bypass the atomic validation.

### Medium — M3: Some read policies intentionally allow broad member visibility

- `church_settings_authenticated_read` permits all authenticated users to read the single church settings row.
- `roles`, `permissions`, and `role_permissions` are readable to authenticated users.
- `church_resources` allows published `members_only` resources to any authenticated user, subject to branch visibility; this is consistent with the current policy label but should be confirmed against future member-status rules.
- `streams` and published events/resources include public/member visibility logic.

These are read paths, not mutation grants. Review privacy expectations before restricting or broadening them.

## Mutation inventory

| Domain / operation | Application caller(s) | Resource | Intended permission / scope | Actual PostgreSQL enforcement |
|---|---|---|---|---|
| Register member / update staff membership / portal state | `memberService.ts` | `profiles` | `manage_members`, church/district/branch scope; self-service limited to own profile | SELECT + limited self column UPDATE only; staff mutations have no direct DML grant/policy. |
| Self-edit profile | `App.tsx` | `profiles` | Own profile only; only approved personal columns | RLS self-update plus column-level grant; milestone columns are not granted. |
| Member transfer | Not found as a direct service mutation | `member_transfers` | `manage_members` across source and destination branches | SELECT only; no client DML. No transfer RPC found in current baseline. |
| Assign/deactivate role | `profileRoleAssignmentService.ts` | `profile_role_assignments` | `manage_roles`, assignment scope | Public SECURITY DEFINER RPCs with explicit checks; direct table DML denied. |
| Ministry join requests | `ministryJoinRequestService.ts` | `ministry_join_requests` | Request own membership; managers approve within ministry branch | Table absent from fresh-install baseline; mock-only path. |
| Ministry membership CRUD | `ministryMemberService.ts`, `AdminDashboard.tsx` | `ministry_members`, `ministries` | `manage_ministries` / membership-management permission at ministry branch | SELECT-only grants and scoped SELECT policies; direct writes denied. |
| Events create/edit/delete | `AdminDashboard.tsx`, `eventAccountService.ts` | `events` | `manage_events`, event branch | SELECT-only grant; no DML policy. |
| Event registration create | `App.tsx`, `CalendarPage.tsx`, `AdminDashboard.tsx` | `event_registrations` | Self-registration or manager registration within event scope | INSERT grant + self/event eligibility RLS; manager-side inserts are not granted by a separate policy. |
| Event registration cancel/delete | `CalendarPage.tsx`, `AdminDashboard.tsx` | `event_registrations` | Self-cancel or `manage_events` in event branch | No DELETE grant/policy. |
| Check-in / attendance updates | `EventWorkspaceModal.tsx`, `AdminDashboard.tsx` | `event_registrations`, `attendance_records`, `attendance_sessions` | Attendance-management permission at event/session branch | SELECT only for attendance; event-registration UPDATE not granted. |
| Resources CRUD | `churchResourceService.ts`, `ResourcesAdminTab.tsx` | `church_resources` | `manage_resources`, resource branch | SELECT only; no DML policy. |
| Survey authoring | `eventSurveyService.ts`, `EventSurveysAdminTab.tsx` | `event_surveys`, `event_survey_questions` | `manage_surveys`, event branch | SELECT only; no DML policy. |
| Survey submission | `eventSurveyService.ts`, `onlineSurveyService.ts` | `event_survey_responses`, `event_survey_answers` | Eligible member/respondent scope | Private SECURITY DEFINER atomic routine; client RPC name mismatch and direct fallback writes are unsupported. |
| Finance entry/approval | `AdminDashboard.tsx`, `FinanceOfficerWorkspace.tsx`, `App.tsx` | Legacy `financial_records` | Finance entry/verification permission at branch | Table absent; mock-only. Actual finance schema is SELECT-only and uses permission-checked workflow routines. |
| Finance approval/post/reverse | Finance workflow services/RPCs | `financial_documents`, `budgets`, `journal_entries`, approval tables | `manage_finances`, `approve_finances`, `post_journals`, branch scope | SECURITY DEFINER routines with permission and workflow checks; direct table DML denied. |
| Welfare case/assistance/contribution | `welfareContributionService.ts` and UI | Welfare tables | `manage_welfare`, branch scope; member self visibility | SELECT-only grants and member/manager SELECT policies; no authenticated direct DML. No dedicated case/assistance mutation RPC found. |
| Notifications | `systemNotificationService.ts` | `notifications`, `notification_recipients` | `manage_notifications` for publishing; own recipient read state | SELECT-only except own `read_at` UPDATE; no publish/mutation routine found in baseline. |
| Stream chat | `App.tsx` | `stream_chat_messages` | Authenticated sender, own profile | INSERT grant + RLS requires current profile as sender. |
| Stream create/status/delete | `AdminDashboard.tsx` | `streams` | `manage_streams`, branch scope | SELECT-only; direct mutations denied. |
| Stream credential rotation | `AdminDashboard.tsx` -> `stream-admin` | `private.stream_credentials` | `manage_streams`, branch scope | Private table RLS deny-all; no deployable Edge Function found. Current TypeScript is a conceptual placeholder. |
| Prayer request create | `App.tsx` | `prayer_requests` | Authenticated member; visibility/moderation policy TBD | Table absent from baseline; mock-only. |

## SECURITY DEFINER / grants review

- Application-owned SECURITY DEFINER routines in the baseline use `SET search_path = ''` and schema-qualified object references.
- Role assignment routines use explicit permission and scope checks; they are public RPCs with explicit EXECUTE grants.
- Finance posting, reversal, approval, budget submission, and survey submission routines are in `private`, have explicit EXECUTE grants to authenticated, and revoke default PUBLIC/anon/authenticated grants before re-granting.
- `private` schema usage is granted to authenticated; do not add broad table grants to make direct UI mutations work.
- The baseline revokes EXECUTE on `public.rls_auto_enable()` from public/anon/authenticated while preserving its event-trigger role.
- `private.stream_credentials` and `private.payment_gateway_payloads` have deny-all RLS policies and no client grants.
- No deployable `supabase/functions/<function>/index.ts` source directory exists in the repository. `edge_functions.ts` is explicitly conceptual, not a deployable security implementation.
- The captured `supabase/schema.sql` includes Supabase platform extension/system objects and grants; treat it as an environment snapshot, not the application migration source of truth. The maintained baseline and migrations are the application security contract.

## Safe changes made in this audit

No production DML policy or table grant was broadened. The identified callers and schema do not yet agree on table names, workflows, or permission semantics, so adding write access now would risk bypassing member lifecycle, accounting approvals, attendance validation, or branch scope. The safe remediation is to preserve deny-by-default and add regression assertions that authenticated clients cannot directly mutate protected domain tables.

## Remaining blockers and recommended decisions

1. Define a migration plan from legacy `financial_records` to the actual double-entry finance model.
2. Decide whether prayer requests and ministry join requests are production modules and define tables, privacy, moderation, lifecycle, and scope.
3. Specify per-action permissions for member staff updates, ministry management, events, attendance, resources, survey authoring, welfare case changes, notifications, and stream management.
4. Implement public RPC wrappers for approved private workflow routines where the browser client needs PostgREST access; align client RPC names with the database contract.
5. Implement actual Edge Functions for stream credential/playback operations with JWT verification, active assignment checks, branch scope, secure random generation, and audit logging.
6. Migrate every direct write listed above to a permission-checked RPC or narrowly scoped RLS policy before connecting production authentication.
7. Run browser/runtime tests after the mock-vs-real service contracts are aligned.

## Validation boundaries

This audit inspected GitHub source and SQL only. PostgreSQL workflow assertions run in a disposable PostgreSQL 17 environment. No browser session was exercised. No migration was applied to the live Supabase project, and no live Supabase credentials or data were accessed.
