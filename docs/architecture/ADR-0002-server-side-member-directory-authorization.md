# ADR-0002: Server-Side Member Directory Authorization

- **Status:** Accepted; scoped create/update API implemented and deployed to the SCMS development database
- **Date:** 2026-11-13
- **Implementation checkpoint:** 2026-11-24
- **Related:** [ADR-0001 — Unified Member Directory](ADR-0001-unified-member-directory.md), [Member Directory RLS Access Matrix](../security/member-directory-rls-access-matrix.md)

## Context

The canonical member directory is `public.profiles`. A profile is a church person record and may exist without a portal account. Authentication is linked only through nullable `profiles.auth_user_id`.

Authorization is stored in database-backed `roles`, `permissions`, `role_permissions`, and `profile_role_assignments`. The active role assignment records an explicit `church`, `district`, or `branch` scope. Browser local storage and React state are not authorization sources.

The database provides `private.current_profile_id()`, `private.has_permission()`, and `private.has_district_permission()` helpers. `private.has_permission(permission_key, branch_id)` resolves church-wide, explicit branch, and district assignments against the target branch's district. A member's `profiles.branch_id` is their home branch; staff authority is derived from the separate trusted role-assignment record.

## Decision

Use PostgreSQL RLS for row visibility and narrowly scoped, permission-checked RPCs for staff-managed member writes.

| Role | Directory scope | Default capability |
|---|---|---|
| `super_admin` | Current single church | Church-wide view/create/edit |
| `admin` | Current single church | Church-wide view/create/edit |
| `district_admin` | Explicitly assigned district | View/create/edit in branches in that district |
| `pastor` | Explicitly assigned branch or branches | View/create/edit in assigned branches |
| `finance_officer` | No general directory scope | Purpose-specific minimum data only |
| `leader`, `worker` | Own profile by default | No directory-wide access without a separate grant |
| `member` | Own profile | Own profile only |

The current schema represents one church. Church-wide authority does not imply cross-tenant access in a future multi-tenant model.

Additional rules:

1. Directory deletion is denied by default. Use membership archive/status workflows.
2. A person's branch cannot be changed through generic profile editing. Use the approved transfer workflow.
3. `profiles.auth_user_id`, portal lifecycle, role assignments, branch, membership lifecycle and baptism records are server-managed.
4. Ordinary self-service updates may change basic profile details, but not protected membership, branch, portal or authentication fields.
5. Portal account provisioning/revocation is a separate trusted Auth workflow. Member creation never creates credentials implicitly.
6. Role assignment is a separate operation. The member form does not grant a portal role or permissions.
7. Browser-side permission checks are presentation controls only.

## Implemented database controls (2026-11-24)

Migration `20261124014219_add_secure_member_directory_write_api.sql` adds:

- `public.create_member_profile(p_member jsonb)`
- `public.update_member_profile(p_profile_id uuid, p_member jsonb)`
- `private.assert_unique_profile_contacts(...)`, using transaction advisory locks to serialize email/phone duplicate checks.
- `private.guard_profile_direct_updates()` and trigger `guard_profile_direct_updates`, which blocks ordinary `anon`/`authenticated` updates to branch, membership lifecycle/date, baptism, portal-link/status, record status and creation timestamp fields. It also blocks direct login-email changes for linked portal accounts.
- A `manage_members` permission grant to the `pastor` role, still constrained by the actor's trusted branch assignment.

Both public RPCs:

- Require a real `auth.uid()` and a linked church profile.
- Require `manage_members` for the target branch.
- Validate allowed JSON keys, names, contact formats, dates and membership enums.
- Reject unsupported/protected fields.
- Preserve the existing branch on update and reject generic branch transfers.
- Keep `auth_user_id` and portal lifecycle fields unchanged.
- Do not assign roles or provision portal accounts.
- Are `SECURITY DEFINER` with an empty search path, explicit identity/permission checks, and execute granted only to `authenticated` (not `anon` or `PUBLIC`).

The Supabase security advisor reports the expected generic warning that authenticated users can execute SECURITY DEFINER RPCs. This is intentional for these API operations; the functions must retain their explicit authentication, linked-profile, scope and field-allowlist checks. Do not broaden grants or remove these checks.

## Current read and write behavior

- The live `profiles` RLS SELECT policy is `profiles_scoped_read`: a user can read their own profile or profiles in a branch for which `view_members` is effective.
- The old anonymous public-read policy is absent.
- The existing self-update policy is reinforced by the new trigger for protected fields.
- Live create/edit and membership-status changes use the new RPCs only when both database integration and real Supabase Auth are enabled. While mock authentication remains active, the Member Directory continues to use the mock database and mock workflows.
- Mock development login is not a Supabase Auth session. The Member Directory stays on mock data until `VITE_SUPABASE_AUTH=enabled`; it never attempts live member writes with a mock identity.
- Live portal invitations, role assignment from the member form, portal suspension/revocation and branch transfers are not implemented by these two RPCs and remain separate workflows.

## Verification completed

The SQL regression script `supabase/tests/member-directory-write-api.sql` was executed against the connected development database inside a transaction and rolled back. It verified:

- Authorized create and update through the RPCs.
- Rejection of protected create fields.
- Rejection of generic branch reassignment.
- Database-level duplicate email rejection.
- Rejection of an unlinked actor.
- Rejection of direct membership-status updates from an authenticated session.
- Branch-scoped pastor create/update succeeds only in the assigned branch.
- District-scoped administrator create/update succeeds only in branches in the assigned district.

A post-test query confirmed that no test member remained. Function execute privileges were checked: authenticated can execute the two RPCs; anon and PUBLIC cannot.

## Remaining work

1. **Complete:** branch and district isolation are covered by `supabase/tests/member-directory-write-api.sql` and were executed against the development database in a rolled-back transaction.
2. Complete a minimal-field directory read API/projection and audit every consumer before further tightening profile SELECT access.
3. Complete the trusted server-side portal invitation, suspension and revocation workflow.
4. Complete the separate member-transfer workflow and its database authorization tests.
5. Enable real Supabase Auth only when the project owner is ready; mock login remains the development default.
6. Run browser acceptance with real Supabase Auth before treating live member administration as production-ready.
