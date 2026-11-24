# Member Directory RLS Access Matrix

- **Status:** Scoped database write API implemented; read-side and portal provisioning follow-ups remain
- **Date:** 2026-11-13
- **Implementation checkpoint:** 2026-11-24
- **Scope:** Canonical `public.profiles` member directory
- **Related decisions:** [ADR-0001 — Unified Member Directory](../architecture/ADR-0001-unified-member-directory.md), [ADR-0002 — Server-Side Member Directory Authorization](../architecture/ADR-0002-server-side-member-directory-authorization.md)

## 1. Purpose

The canonical `profiles` table contains church membership records and optional portal identity links. It must not be publicly readable. RLS, database-backed role assignments and scoped write RPCs protect directory records independently of public church content.

## 2. Current implementation facts

- `profiles.id` is the stable person/directory identifier.
- `profiles.auth_user_id` is a nullable, unique link to `auth.users.id`.
- `profiles.branch_id` is the person's home branch, not the staff actor's authorization assignment.
- Trusted staff scope is stored in `profile_role_assignments` as church, district or branch scope.
- `private.current_profile_id()` resolves the authenticated person through `profiles.auth_user_id = auth.uid()`.
- `private.has_permission(permission_key, branch_id)` verifies active role assignments and target-branch scope.
- The live `profiles_scoped_read` policy permits own-profile reads or branch-scoped reads for `view_members`; anonymous directory reads are not allowed.
- `public.create_member_profile(jsonb)` and `public.update_member_profile(uuid,jsonb)` provide permission-checked writes.
- A trigger blocks ordinary authenticated direct changes to protected membership, branch, baptism, portal and auth-link fields.
- Role and permission state in browser local storage is not authoritative.

## 3. Access matrix

| Actor | Directory SELECT | Directory INSERT | Directory UPDATE | Directory DELETE |
|---|---|---|---|---|
| Anonymous visitor | Deny | Deny | Deny | Deny |
| Authenticated member | Own profile | Deny | Permitted self-service fields only | Deny |
| Authenticated staff without `manage_members` | Own profile or separately granted `view_members` scope | Deny | Permitted self-service fields only | Deny |
| Staff with trusted `manage_members` and branch/district scope | Own profile or `view_members` scope | Through `create_member_profile` within scope | Through `update_member_profile` within scope | Deny |
| Church-wide administrator with trusted permission | Church-wide | Through scoped RPC | Through scoped RPC | Deny by default |

The Pastor role now has the `manage_members` permission in the database, but that permission is effective only for branches covered by the pastor's active trusted role assignment. District administrators are similarly limited to their assigned district. A role name alone does not grant access.

## 4. Scope and field requirements

- Create checks `private.has_permission('manage_members', target_branch_id)`.
- Update checks the existing member's branch and rejects any attempted branch change.
- Generic update rejects transition into `transferred`; use the approved transfer workflow.
- The RPC field allowlist excludes `auth_user_id`, `portal_access_status`, `record_status`, and role/permission assignment fields.
- Portal provisioning is separate and is not performed by member create/update.
- Duplicate email and normalized phone checks run in the database and use transaction advisory locks.
- Ordinary authenticated direct updates cannot change branch, membership date/status, baptism fields, portal link/status, record status or `created_at`.
- A linked portal account's email cannot be changed through the generic member editor.

## 5. RPC and grant contract

| Function | Execute | Security | Required checks |
|---|---|---|---|
| `public.create_member_profile(jsonb)` | authenticated only | SECURITY DEFINER, empty search path | Auth UID, linked profile, active target branch, `manage_members` scope, JSON allowlist, validation, duplicate contacts |
| `public.update_member_profile(uuid,jsonb)` | authenticated only | SECURITY DEFINER, empty search path | Auth UID, linked profile, existing member branch scope, JSON allowlist, protected fields, validation, duplicate contacts |

Both functions revoke execute from PUBLIC and anon. Their SECURITY DEFINER status is intentional because they perform protected writes; explicit checks inside the function are mandatory. The Supabase advisor's generic warning for authenticated-callable SECURITY DEFINER functions is recorded in ADR-0002.

## 6. Deployment and test state

- The migration is deployed to the connected SCMS development Supabase project.
- SQL regression checks were run inside a transaction and rolled back.
- Authorized create/update, protected-field rejection, branch-change rejection, duplicate-email rejection, unlinked-actor denial and direct-update trigger behavior passed.
- No test member records remain.
- The browser app still requires a real Supabase Auth session. Mock development login cannot authorize live database writes.
- Portal provisioning, portal lifecycle administration, branch transfer, branch/district isolation fixtures and minimal-field read APIs remain follow-up work.

## 7. Required follow-up

1. Add disposable-database branch and district isolation tests with separate staff assignments.
2. Replace broad profile projections with a minimal scoped read API after auditing every legitimate consumer.
3. Complete trusted portal provisioning and revocation.
4. Complete transfer RPC and tests.
5. Run real-auth browser acceptance before production readiness.
