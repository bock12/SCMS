# ADR-0002: Server-Side Member Directory Authorization

- **Status:** Accepted design; implementation pending
- **Date:** 2026-11-13
- **Decision owners:** SCMS project
- **Related:** [ADR-0001 — Unified Member Directory](ADR-0001-unified-member-directory.md), [Member Directory RLS Access Matrix](../security/member-directory-rls-access-matrix.md)

## Context

The canonical member directory is `public.profiles`. Its current public SELECT policy exposes the complete profile row. The application has role names in `profiles.primary_role`, but custom permission definitions and assignments in `roleService.ts` are persisted in browser local storage. Browser-controlled state is not a trustworthy authorization source.

The application currently models branch membership through `profiles.branch_id` and district membership through `church_branches.district_id`. It does not yet model tenant ownership or a complete, independently managed staff-scope assignment. The existing self-update policy also does not establish column-level protection for role, branch, membership, or auth-link fields.

## Decision

Adopt the following baseline access model for the member directory:

| Role | Directory scope | Default directory capability |
|---|---|---|
| `super_admin` | All records in the authorized organization | Full organization-wide directory administration |
| `admin` | All records in the church | Church-wide directory administration |
| `district_admin` | All branches in the district to which the staff member is explicitly assigned | View, create, and edit directory records within that district |
| `pastor` | The branch or branches to which the pastor is explicitly assigned | View, create, and edit directory records within those branches |
| `finance_officer` | No general directory scope | No directory-wide access; only purpose-specific minimum member data through an explicitly authorized finance workflow |
| `leader` | No general directory scope | Own profile only unless a separate, narrowly scoped permission is granted |
| `worker` | No general directory scope | Own profile only unless a separate, narrowly scoped permission is granted |
| `member` | Own profile | Own profile only |

Additional rules:

1. Directory deletion is denied by default for all roles. Use a controlled archive/status workflow instead of deleting people.
2. `super_admin` is organization-wide, but the current schema represents a single church and has no tenant identifier. Until tenant isolation is implemented, `super_admin` and `admin` both operate within the single configured church. Never interpret this decision as permission to cross future tenant boundaries.
3. The staff member's branch/district assignment must be an explicit, trusted server-side assignment. A user's ability to edit their own `profiles.branch_id` must not grant or change their authorization scope.
4. `profiles.primary_role`, `profiles.branch_id`, `profiles.auth_user_id`, membership lifecycle fields, and other authorization-controlled fields must not be mutable through ordinary self-service profile updates.
5. Custom role and permission state in browser local storage is presentation/workflow state only. It must not grant database access.
6. Any additional access for a finance officer, leader, or worker must be an explicit server-side grant with a defined permission, scope, and purpose.
7. Staff member directory actions must be authorized by PostgreSQL RLS and/or narrowly scoped server-side functions. Client-side route guards are supplementary only.

## Scope resolution

The intended default resolution rules are:

- `admin`: all branches belonging to the current church.
- `district_admin`: target profile's branch must belong to the district explicitly assigned to the acting staff profile.
- `pastor`: target profile's branch must be one of the acting pastor's explicitly assigned branches.
- `super_admin`: all branches in the current organization; a future multi-tenant implementation must additionally enforce matching organization/tenant identity.
- All other roles: own profile only unless an explicit server-side grant authorizes a narrower use case.

The current `profiles.branch_id` may be used as the member's home branch, but it must not silently double as a trusted staff-scope assignment until protected against self-service modification and validated as such. District scope must be derived from trusted district assignment, not inferred from a user-editable branch field.

## Consequences

### Positive

- Access boundaries are explicit and testable.
- District and branch staff cannot automatically browse the entire congregation.
- Finance, ministry, and volunteer roles do not receive broad member-data access merely because of their job title.
- The design is compatible with a future tenant-aware model without granting cross-tenant access.

### Required work before enforcement

1. Introduce trusted server-side staff-scope assignments and narrowly scoped permission grants.
2. Protect role, branch/scope, membership lifecycle, and auth-link fields from ordinary client writes.
3. Move directory list/create/update operations to a server-authorized path, with minimal field projections.
4. Replace the broad public profile policy only after all legitimate consumers use the scoped path.
5. Add database tests for anonymous denial, own-profile access, admin church-wide access, district isolation, pastor branch isolation, unassigned staff denial, cross-tenant denial when tenants exist, and role/scope escalation attempts.
6. Verify the complete schema baseline and migration history against a disposable Supabase-compatible PostgreSQL database before production rollout.

## Deployment safety

This ADR does not itself change RLS policies, grant permissions, or execute a migration. The existing broad SELECT policy remains a known security defect until the implementation sequence is completed. Do not deploy a partial restrictive policy that breaks the directory, and do not leave the public policy in place as a claimed security fix. Production migration remains blocked pending schema/migration-history verification and database-level tests.
