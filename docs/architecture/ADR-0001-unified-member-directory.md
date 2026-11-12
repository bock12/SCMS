# ADR-0001: Unified Member Directory and Optional Portal Access

- **Status:** Accepted
- **Date:** 2026-11-12
- **Scope:** SCMS current single-church, single-branch mock-authentication implementation
- **Decision owner:** Project owner

## Context

The application currently maintains person information in two places:

- `profiles` stores portal identity, application role, and contact details. Its primary key currently references `auth.users`.
- `members` stores church membership, contact details, baptism details, membership status, and an optional `profile_id` link.

The UI consequently has two registration paths and synchronizes overlapping personal information between the two tables. This creates duplicate data, dual-write failure cases, and unnecessary workflow complexity.

The existing **Add New Member** form already contains an optional **Create Login Account for Member** control. It should be the single registration form.

## Decision

Use `profiles` as the canonical person/member directory. Every person managed by the church has one stable profile/person record, whether or not that person can sign in.

Portal access is optional and is represented by a nullable, unique `auth_user_id` reference to `auth.users`. The profile/person primary key remains stable and is not the authentication user ID.

The canonical profile record owns:

- Identity and contact details: first name, last name, email, phone, avatar, date of birth, gender, and marital status.
- Church membership details: membership date, membership status, baptism status/date/officiant, and marriage date.
- Portal authorization metadata: application role and portal-account status. These fields do not determine church membership status.

The following rules apply:

1. One person has one canonical profile/person record.
2. A person can be registered without an email address or portal login.
3. Enabling portal access requires the information and authentication workflow needed to create or link an auth user. A profile row alone must never be represented as proof that login credentials exist.
4. `auth_user_id` is nullable and unique. Removing an auth user must not delete the person's church membership record; the auth link is cleared.
5. Membership lifecycle and portal-account lifecycle remain independent.
6. Personal identity/contact/membership details are written once. Do not synchronize copies between `profiles` and `members`.
7. The Member Directory reads from `profiles` only.
8. The existing Add New Member form is the only staff registration form. Remove the separate no-login registration form after the unified workflow is implemented.
9. Do not store plaintext passwords, temporary passwords, or other credentials in `profiles` or browser local storage.
10. Membership-related relationships (ministry membership, transfers, event attendance/registration, welfare/member contributions, and similar records) must reference the canonical profile/person ID before the `members` table is retired.

## Data model direction

`profiles` becomes a person-first table with a generated stable primary key and an optional authentication link:

- `id`: stable person/profile ID, primary key.
- `auth_user_id`: nullable unique foreign key to `auth.users(id)`.
- `branch_id`: church branch.
- Identity, contact, membership, and authorization fields described above.

The separate `members` table is a migration source and compatibility boundary only during the transition. It is not a second long-term source of truth.

## Registration experience

The Add New Member form will collect the person's details once. Portal access is an optional section/toggle:

- **Portal access off:** create the person/member record only; email is optional; do not create auth credentials.
- **Portal access on:** require a valid email and use the supported auth invitation/account-creation flow; link the resulting auth user to the existing person record.
- A member's membership status can change without suspending or deleting portal access, and portal access can be suspended without changing membership status.

## Migration and implementation safeguards

Implement in small, reviewable stages:

1. Inventory every `members` and `profiles` consumer, foreign key, mock-auth assumption, and test.
2. Extend the canonical profile type and mock database with person, membership, and optional-auth-link fields.
3. Update the single Add New Member form and directory to read/write canonical profiles only.
4. Update member-dependent services and relationships to use profile/person IDs.
5. Add a forward-only Supabase migration that safely backfills existing member records, preserves links and dependent references, and only then retires obsolete member storage.
6. Update schema documentation and tests; verify build and test suite.

The project currently uses mock authentication and a local mock database. Supabase remains unconnected. Migration files may be authored and reviewed, but **must not be executed** until the project owner explicitly approves connecting and migrating the Supabase project.

## Consequences

### Benefits

- One registration form and one directory.
- One canonical copy of personal and membership information.
- Members without portal access are first-class directory records.
- No profile/member dual-write synchronization.
- Independent membership and portal-access lifecycles.

### Trade-offs

- Authentication identity must be decoupled from the stable person ID.
- Existing member-related foreign keys and service APIs need a coordinated migration.
- The mock authentication layer and sign-in profile lookup must resolve profiles through `auth_user_id`.
- Existing data must be backfilled before the old `members` table can be retired.
