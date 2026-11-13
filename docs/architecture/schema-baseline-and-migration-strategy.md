# SCMS Schema Baseline and Migration Strategy

- **Status:** Architecture/deployment decision required; no database changes made
- **Date:** 2026-11-13
- **Scope:** Root `schema.sql` and `supabase/migrations/`
- **Related decisions:** [ADR-0001 — Unified Member Directory](ADR-0001-unified-member-directory.md), [Member Directory RLS Access Matrix](../security/member-directory-rls-access-matrix.md)

## 1. Executive finding

The repository currently contains two different database starting assumptions:

1. The root `schema.sql` defines `public.profiles` as the canonical person/member directory and does not create `public.members`.
2. The timestamped migration chain begins with migrations that alter or reference `public.members`, and the later unification migration assumes that legacy table may exist and eventually drops it.

These paths are not currently a safe, interchangeable fresh-install sequence. The repository does not establish which path has been used by any deployed Supabase project, and repository inspection cannot establish a remote project's migration history or live data.

**Decision:** Do not run the complete migration directory against a database initialized from the current root `schema.sql`. Do not apply the root schema over a database that has already run migrations. First identify the actual database baseline and reconcile the migration history in a disposable database.

## 2. Verified repository facts

### 2.1 Root schema

The root `schema.sql`:

- Creates `public.profiles` with a nullable `auth_user_id` reference to `auth.users`.
- Includes directory and membership fields such as `branch_id`, `primary_role`, `membership_status`, and membership details.
- Creates several tables with foreign keys to `public.profiles`, including ministry membership, transfers, and event registrations.
- Does not create `public.members`.
- Creates the broad `Public read profiles` SELECT policy.
- Defines an own-profile UPDATE policy without column-level restrictions.
- Contains the explicit trusted-metadata auth-linking trigger implementation.

The root schema is therefore a canonical-profile schema snapshot, but it is not currently documented or tested as a complete, versioned fresh-install baseline for every feature created by the timestamped migrations.

### 2.2 Timestamped migration chain

The current migration directory contains these eight migrations:

| Migration | Relevant dependency or effect |
|---|---|
| `20261110000100_expand_member_records.sql` | Alters `public.members`; creates indexes/constraints on that table |
| `20261111000100_align_event_registration_attendance.sql` | Adds an event-registration member reference to `public.members` |
| `20261111000200_create_ministry_membership.sql` | Creates ministry membership with `member_id` referencing `public.members`; other ministry references use `profiles` |
| `20261111000300_create_resources_and_event_surveys.sql` | Creates resource/survey tables and policies that query `public.members` |
| `20261112000100_add_atomic_event_survey_submission.sql` | Function logic queries `public.members` |
| `20261112000200_enforce_unique_member_profile_link.sql` | Checks and adds a unique index on `public.members(profile_id)` |
| `20261112000300_unify_profiles_member_directory.sql` | Merges legacy members into profiles, remaps selected foreign keys and policy/function references, then drops `public.members` |
| `20261113000100_secure_explicit_profile_auth_linking.sql` | Hardens auth-user linking on the canonical `profiles` table |

The first migration's `ALTER TABLE public.members` is not compatible with a database created only from the current root `schema.sql`, because that schema does not create `public.members`. The later migrations also depend on the legacy table before the unification migration retires it.

### 2.3 Current application assumptions

- `memberDirectoryService.ts` reads the canonical `profiles` table and selects all columns.
- `memberService.ts` contains member-directory operations against `profiles`.
- `roleService.ts` stores custom roles and role assignments in browser local storage and derives client-side permissions from profile role data. This is not a trusted authorization source.
- The application includes a local/mock Supabase implementation. Its behavior does not establish the state or security of a remote Supabase database.

## 3. Deployment paths that must not be mixed

### Path A — Fresh database from a canonical baseline

A fresh database must start from one authoritative baseline that creates every table, type, function, trigger, index, grant, and policy required by the application. It must not then replay legacy migrations that expect a separate `public.members` table unless those migrations are deliberately rewritten as part of a tested baseline conversion.

The current root `schema.sql` is not yet certified as that complete baseline. It creates the canonical directory but does not include all objects introduced by the later feature migrations.

### Path B — Existing legacy database

A database that already has a legacy `public.members` table may need the historical migrations in order, followed by the unification and auth-linking migrations. Before that sequence is considered safe, the exact database schema, migration ledger, data, foreign keys, policies, and functions must be inspected.

Do not assume that a database is on this path merely because the repository contains legacy migrations.

### Path C — Existing canonical-profile database

A database initialized from the root schema or manually converted to canonical `profiles` may already have no `public.members` table. It must not replay the legacy member migrations from the beginning. It needs a separately designed and tested forward-only reconciliation path based on its actual migration ledger and schema.

## 4. Required preflight before any migration

For the target Supabase project, collect and review:

1. The complete `supabase_migrations.schema_migrations` history (or the actual migration ledger used by that project).
2. Whether `public.members` exists and, if it does, its columns, constraints, indexes, row count, and duplicate `profile_id` values.
3. The `public.profiles` columns, constraints, indexes, triggers, and row count.
4. Every foreign key in every schema that references `public.members` or `public.profiles`, including references not named in the current unification migration.
5. Existing RLS enablement, policies, grants, and security-definer functions on affected tables.
6. Row counts and key mappings for all dependent records that the unification migration may remap.
7. Whether the root schema or any migrations have previously been applied manually outside the migration ledger.

Do not expose credentials or service-role keys in reports. A schema-only export and redacted metadata report are sufficient for the first review.

## 5. Migration test requirements

Before approving a migration sequence, run it against disposable PostgreSQL/Supabase-compatible databases representing at least:

- A genuinely fresh database.
- A legacy database with `members` and representative dependent records.
- A canonical-profile database without `members`.
- A partially migrated database at each supported migration checkpoint.

Tests must verify:

- All migrations apply in the intended order without missing-table or missing-column errors.
- Every legacy member maps to exactly one canonical profile.
- Duplicate and conflicting profile links are reported and block unsafe conversion.
- All dependent foreign keys are discovered and safely remapped; no unknown reference is silently discarded.
- Pre- and post-migration row counts and key relationships reconcile.
- The migration is transactional where possible and fails safely when preconditions are not met.
- Existing policies and functions remain valid after table/column changes.
- Auth linking remains explicit and cannot be claimed by email matching or user-editable metadata.

## 6. RLS and authorization dependency

Do not implement the final directory RLS replacement until the schema path is known and the trusted authorization model can be tested against it.

In particular:

- The broad `Public read profiles` policy must ultimately be removed.
- An own-row UPDATE policy is not sufficient to protect sensitive columns.
- Role and scope grants must be stored and checked server-side.
- Client-side local storage and the local mock database must never be treated as production authorization.
- Directory queries must move away from unrestricted `select('*')` before restrictive policies are enabled, or legitimate screens may break.

## 7. Recommended sequence

1. Confirm the actual target Supabase project's migration ledger and schema baseline.
2. Build disposable test databases for the supported baseline(s).
3. Choose one canonical fresh-install baseline and document the supported upgrade path(s).
4. Add migration preflight checks, complete foreign-key discovery, conflict reporting, and row-count assertions.
5. Test the complete upgrade and fresh-install paths.
6. Implement trusted server-side staff permission and branch/district scope grants.
7. Move directory consumers to a scoped, minimum-field data path.
8. Add and pass database authorization tests.
9. Only then prepare a restrictive RLS migration for explicit review and approval.

## 8. Current deployment gate

**No production Supabase migration or RLS policy change is authorized by this document.** Repository-only inspection cannot verify a live database's migration history or data. A production change requires a reviewed preflight report, disposable-database test results, a backup/rollback plan, and explicit approval.
