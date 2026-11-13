# Member Directory RLS Access Matrix

- **Status:** Security design baseline; implementation pending
- **Date:** 2026-11-13
- **Scope:** Canonical `public.profiles` member directory
- **Related decisions:** [ADR-0001 — Unified Member Directory](../architecture/ADR-0001-unified-member-directory.md), [ADR-0002 — Server-Side Member Directory Authorization](../architecture/ADR-0002-server-side-member-directory-authorization.md)

## 1. Purpose

The canonical `profiles` table contains both church membership records and optional portal identity links. It must not be publicly readable. Row-level security (RLS) must protect directory records independently of the visibility of public church content such as events, branches, and public streams.

This document defines the minimum safe access contract and records the gaps that must be closed before replacing the existing broad profile policy. It does not itself grant access or change database policies.

## 2. Current implementation facts

The repository currently establishes these facts:

- `profiles.id` is the stable person/directory identifier.
- `profiles.auth_user_id` is a nullable, unique link to `auth.users.id`.
- `profiles.branch_id` identifies the person's assigned church branch.
- `profiles.primary_role` contains one of: `super_admin`, `admin`, `district_admin`, `pastor`, `finance_officer`, `leader`, `worker`, or `member`.
- The TypeScript permission catalogue includes `manage_members`, but custom role definitions and assignments are currently stored in browser local storage by `roleService.ts`. Browser storage is not an authorization source.
- `memberService.getMembers()` currently requests every column from `profiles` and relies on the database to filter rows.
- The schema's existing `Public read profiles` policy permits anonymous and authenticated clients to select every profile row. This exposes contact, membership, demographic, and portal-link fields.
- The current application is a single-church implementation. The present schema does not provide a complete tenant-level staff-scope grant model.

## 3. Mandatory baseline rules

| Actor | Directory SELECT | Directory INSERT | Directory UPDATE | Directory DELETE |
|---|---|---|---|---|
| Anonymous visitor | Deny | Deny | Deny | Deny |
| Authenticated member | Own profile only | Deny | Own permitted self-service fields only | Deny |
| Authenticated staff without a verified server-side member permission | Own profile only | Deny | Own permitted self-service fields only | Deny |
| Staff with verified `manage_members` permission and an approved scope | Records inside the granted scope | Inside the granted scope | Inside the granted scope, with protected fields restricted | Deny by default |
| Super administrator with verified server-side authority | Organization-wide, subject to tenant boundary | Organization-wide, subject to tenant boundary | Organization-wide, subject to tenant boundary | Explicit administrative workflow only |

**Important:** The staff rows above describe the required authorization contract, not capabilities currently implemented by the browser application. No permission stored only in local storage, React state, or client-supplied metadata may grant database access.

## 4. Scope requirements

A staff permission must be paired with a server-verifiable scope. A role name alone is insufficient.

| Role / scope concept | Intended scope | Current enforcement readiness |
|---|---|---|
| `super_admin` | All records in the authorized organization; current single-church schema means the configured church only until tenant isolation exists | Not established as a trusted server-side grant |
| `admin` | Church-wide administration within the current church | Not established as a server-side grant |
| `district_admin` | All branches in the district explicitly assigned to the staff member | District-to-branch relationship exists; trusted staff district assignment is not modeled independently |
| `pastor` | Explicitly assigned branch or branches | Trusted staff branch assignment and authorization grant need verification |
| `finance_officer` | No general directory access by role alone; only the minimum member identity needed for an authorized finance workflow | Finance role exists; purpose-specific access path is not yet defined |
| `leader` / `worker` | Own profile by default; any additional access must be a separately granted, ministry-specific capability | Ministry appointments and custom permissions are currently client-side |
| `member` | Own profile by default | Can be enforced through the authenticated identity link |

Do not infer a staff member's scope from a profile's `branch_id` unless the system has explicitly established that field as the authoritative staff assignment. Do not treat a ministry name or client-side role assignment as a trusted scope.

## 5. Field sensitivity and write protection

RLS controls rows, not individual columns. The current `profiles` row combines fields with different sensitivity levels, including:

- Basic identity: name and avatar.
- Contact information: email and phone.
- Membership details: membership status/date, baptism information, department.
- Sensitive personal details: date of birth, gender, marital status and marriage date.
- Authorization linkage: `auth_user_id` and `primary_role`.
- Portal lifecycle: account status.

Consequently:

1. A policy that permits a person to update their own row must not, by itself, permit them to change `primary_role`, `auth_user_id`, membership status, branch assignment, or other staff-controlled fields.
2. Self-service updates must use explicit column grants or a narrowly scoped server-side function that validates the allowed fields.
3. Staff access must return only the fields required for the task. Where different audiences need different field sets, use a restricted view or server-side function rather than relying on UI hiding.
4. Portal identity links and authorization fields must never be writable by ordinary authenticated clients.
5. Anonymous access to `profiles` must remain denied. Public pages should use public church-content tables or deliberately curated public views, not the private directory.

## 6. Required implementation sequence

1. Establish the trusted server-side source for staff role assignments and branch/district scope. Do not use browser local storage as an authorization source.
2. Decide and record the exact authority of `super_admin`, `admin`, `district_admin`, `pastor`, and finance roles, including whether each may list, create, edit, or archive directory records.
3. Define the self-service profile fields and staff-managed fields. Enforce the distinction at the database boundary.
4. Replace `Public read profiles` with deny-by-default policies and narrowly scoped policies/functions.
5. Update `getMembers()` and directory consumers to use the approved scoped data path and minimum required columns.
6. Add database-level tests for anonymous access, own-profile access, cross-branch denial, district boundaries, unassigned staff, role escalation attempts, and protected-column updates.
7. Verify the policy set against a disposable PostgreSQL/Supabase-compatible database before considering deployment.

## 7. Explicit non-goals and deployment gates

- This document does not apply or execute a Supabase migration.
- Do not replace the broad policy with a guessed role mapping.
- Do not grant all authenticated users directory-wide SELECT access as a temporary workaround.
- Do not consider client-side route guards, hidden UI controls, custom role labels, or local storage to be database authorization.
- Do not deploy a restrictive policy until all legitimate directory consumers have been moved to a scoped, tested data path.
- Production deployment remains blocked until the target Supabase project's schema baseline and migration history are verified.

## 8. Acceptance criteria

- Anonymous users cannot select any row from `public.profiles`.
- An authenticated member can select only the profile linked through `auth_user_id = auth.uid()`.
- A member cannot change their role, auth link, membership status, branch assignment, or staff-managed fields.
- Staff directory access requires a verified server-side permission and explicit scope.
- A staff user cannot read or modify records outside that scope, including by direct API calls.
- Cross-branch and cross-district denial tests pass.
- Directory screens continue to work through the approved scoped data path.
- No production database has been changed as part of this design task.
