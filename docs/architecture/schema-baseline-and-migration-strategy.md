# SCMS Schema Baseline and Migration Strategy

- **Status:** Live schema snapshot captured; canonical baseline curation and migration synchronization in progress
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


## 9. Live SCMS-Development baseline evidence (2026-11-15)

The live development project has now been inspected directly and its current application schema exported to `supabase/schema.sql`.

Verified live facts:

- PostgreSQL server version: 17.11.
- Canonical migration ledger contains exactly 22 entries, `scms_001_church_foundation` through `scms_022_journal_approval_enforcement`, all with version IDs beginning `20261114`.
- Application schema contains 50 public tables and 2 private tables.
- The public and private tables have RLS enabled.
- The current live project is already on the canonical `profiles`-based model; it is not an untouched legacy `members` database.
- The original SQL source for all 22 applied migrations has now been recovered directly from the `statements` arrays in the live Supabase migration ledger and archived under `supabase/recovered-live-migrations/`. Each recovered file was checked against its ledger version/name; representative files were byte-for-byte compared with the live ledger output.

The export commit is `caddcf848668fd405de82bcea63d0a80dd39562a`. The workflow run is [Export Supabase Schema #8](https://github.com/bock12/SCMS/actions/runs/43777298275).

### 9.1 Important limitation of the current export

`supabase/schema.sql` is a schema-only snapshot generated with PostgreSQL 17 `pg_dump`. It is useful as evidence of the current live DDL, but **it is not yet approved as a clean, portable fresh-install baseline or as an executable migration**.

The export currently includes the `extensions` schema. A live catalog inspection found 243 functions in that schema, including Supabase-managed extension integration functions, as well as seven database event triggers. Installed extensions include `btree_gist`, `pg_stat_statements`, `pgcrypto`, and `uuid-ossp` in the `extensions` schema, plus Supabase-managed extensions. Copying every object from `extensions` into a new project could duplicate or conflict with platform-managed objects. The export also does not contain custom roles or data, and it was produced without ownership or privilege statements.

Therefore:
- Do not restore `supabase/schema.sql` directly into SCMS-Development or another live project.
- Do not treat it as a migration to be inserted into the migration ledger.
- Do not replay the eight historical repository migrations on SCMS-Development.
- Keep this export as a read-only schema snapshot until a portable baseline has been curated and tested.

Supabase's current CLI documentation recommends `supabase db dump` for schema exports because it excludes Supabase-managed schemas and schemas created by extensions. It also explains that a first `supabase db pull` can establish a baseline migration and record it as already applied, but this project must first reconcile the actual remote migration ledger with the repository. See [Supabase CLI reference](https://supabase.com/docs/reference/cli/introduction) and [local development workflow](https://supabase.com/docs/guides/local-development/cli-workflows).

### 9.2 Migration synchronization decision

The 22 live migration names and versions are now known, but the source SQL for those migrations must be recovered or reconstructed and reviewed before migration history can be considered synchronized.

Preferred next sequence:

1. Preserve `supabase/schema.sql` as a clearly labelled live snapshot.
2. Recover the exact SQL bodies for the 22 applied migrations from the original migration source or deployment artifacts, if available.
3. If the exact source cannot be recovered, create a reviewed canonical baseline from the live schema, excluding Supabase-managed extension plumbing and preserving required application extensions, RLS, grants, functions, and triggers.
4. Validate the baseline against a disposable Supabase-compatible PostgreSQL 17 database; test all functions, policies, triggers, exclusion constraints, and extension dependencies.
5. Establish a migration-ledger adoption plan for SCMS-Development that marks the existing database state as baselined without reapplying existing objects. This is a separate, explicitly reviewed operation.
6. Keep the eight historical `supabase/migrations` files quarantined as legacy history until a tested legacy upgrade path is documented.

**No live database migration, reset, schema modification, or migration-ledger repair was performed during this review.**


## 10. Recovery of the original live migration SQL (2026-11-16)

The earlier repository search did not find the 22 SQL files in GitHub branches or tracked source files. A direct, read-only inspection of the live migration ledger revealed that `supabase_migrations.schema_migrations` stores a `statements text[]` column in addition to version and name.

All 22 records contained exactly one SQL string in `statements[1]`. Those original recorded SQL strings were recovered and committed to:

`supabase/recovered-live-migrations/`

The directory contains 22 timestamped SQL files and a provenance README. Each SQL file preserves the recorded transaction boundaries. The ledger's `rollback` field was null for all 22 records, so no rollback SQL was available.

Verification:
- All 22 ledger versions and migration names were enumerated.
- Every recovered SQL body was checked for `BEGIN;` at the start and `COMMIT;` at the end.
- Three representative migrations (001, 016 and 022) were fetched back from GitHub and compared byte-for-byte with the corresponding ledger statement; all matched.
- Recovery was read-only. No migration was reapplied and no live database object or data was modified.

The files are deliberately stored outside `supabase/migrations`. They are an archival copy of what was applied, not an active deployment sequence. The eight historical files already in `supabase/migrations` must not be combined with these 22 until the fresh-install and legacy-upgrade paths are tested and formally selected.

**Current status:** Original migration-source recovery is complete. The next task is to review the 22-file sequence and prepare a safe, portable fresh-install baseline. The live project migration ledger does not need repair merely to recover these source files.



## 11. Recovered migration sequence review (2026-11-16)

**Review status:** Static SQL review and live catalog comparison completed. A clean fresh-install baseline has not yet been produced or tested.

### 11.1 Scope and verification method

The review covered all 22 archived SQL files in timestamp order, their transaction boundaries, extension dependencies, table and index definitions, role/permission seeds, RLS policies, grants, functions, triggers, and later hardening migrations. Read-only catalog queries were run against SCMS-Development. No DDL, migration, seed, or data changes were made during this review.

Live catalog results:
- PostgreSQL 17.11.
- 50 public application tables and 2 private tables.
- 56 public RLS policies and 2 private RLS policies.
- 18 routines in the private schema.
- RLS enabled on all 52 application tables.
- Extensions relevant to the application: `pgcrypto` and `btree_gist`, both installed in `extensions`.
- The schema snapshot contains extension/platform objects beyond the application schema and is not a portable baseline.

The 22-file sequence accounts for the application tables and core database objects represented in the live catalog. This is a catalog-level consistency review, not a byte-for-byte diff of every generated pg_dump statement against a reconstructed replay in a disposable Supabase instance.

### 11.2 Migration sequence reviewed

| Migration | Reviewed purpose |
|---|---|
| 001 — church foundation | Creates private schema, currencies, singleton church settings, districts and branches; seeds SLE. |
| 002 — unified profiles and transfers | Creates profiles as the single person/member directory, optional auth link, portal and membership states, and transfer history. |
| 003 — database authorization | Creates roles, permissions, role-permission mappings, scoped profile role assignments and trusted permission helper functions. |
| 004 — ministries and cells | Creates unified ministry/department/fellowship structure and branch-consistent cells and memberships. |
| 005 — foundation RLS and grants | Enables RLS, limits grants, and establishes scoped read policies for foundation tables. |
| 006 — security and FK indexes | Revokes Data API execution of the existing Supabase RLS event-trigger function and adds FK indexes. |
| 007 — events and attendance | Creates events, registrations, attendance sessions/records, permissions and scoped read/registration policies. |
| 008 — resources and surveys | Creates resources, event surveys, questions, responses, answers and atomic survey-submission RPC. |
| 009 — streaming | Creates streams/chat and isolates stream credential references in the private schema. |
| 010 — resource visibility hardening | Replaces the initial resource policy so members-only and staff-only visibility require a linked profile or appropriate permission. |
| 011 — finance foundation | Creates chart of accounts, funds, financial years/periods, financial accounts and calendar-period validation. |
| 012 — double-entry journal ledger | Creates journal entries/lines, balance and immutability enforcement, posting and reversal routines. |
| 013 — private schema hardening | Moves btree_gist into extensions and adds deny-all policy for stream credential storage. |
| 014 — financial documents, budgets and payments | Creates financial documents, giving, budgets, payment transactions and private provider payload storage. |
| 015 — threshold approval schema | Creates versioned policies, non-overlapping threshold bands, approval steps, requests, decisions and approval links. |
| 016 — financial approval and posting workflows | Adds approval decisions, document-to-journal linking, posting checks and budget submission routines. |
| 017 — financial workflow hardening | Makes document and budget approval fail closed when no active policy/band exists; hardens financial document and budget-line immutability. |
| 018 — finance FK indexes | Adds remaining FK and lookup indexes. |
| 019 — welfare, notifications and audit | Creates welfare cases/assistance/campaigns/contributions, notifications/recipients and audit log storage. |
| 020 — welfare/audit hardening | Requires welfare financial links to reference posted documents, checks branch/currency consistency, adds role mappings and append-only audit enforcement. |
| 021 — welfare FK indexes | Adds welfare lookup indexes. |
| 022 — journal approval enforcement | Adds explicit journal policy-check state, approval submission, approval-aware posting and approval-routed reversals. |

### 11.3 Findings and implementation implications

1. **The recovered files are an archive, not a ready-to-run baseline.** They assume a Supabase environment with the `auth` schema, `auth.uid()`, Supabase roles, the existing `public.rls_auto_enable()` function and platform-managed schemas. Migration 006 explicitly revokes access to that existing platform function. A generic PostgreSQL 17 instance will not provide all those prerequisites.

2. **Extension placement must be normalized in the baseline.** The application requires `pgcrypto` and `btree_gist`. The live project has both in `extensions`; migration 011 creates btree_gist before migration 013 moves it. A curated baseline should create/use the supported extensions schema and install required extensions in their intended final location, rather than replaying this intermediate placement.

3. **Do not copy the whole `extensions` schema from the pg_dump.** The snapshot includes hundreds of extension/platform integration functions (243 were observed in the prior catalog inspection) and seven event triggers. These are not all SCMS-owned application objects. The baseline must declare required extensions and let the target Supabase platform install/manage its own extension internals and event triggers.

4. **Application writes are not yet a complete authenticated-client API.** The migrations deliberately revoke table privileges and mostly grant SELECT to `authenticated`, with narrow exceptions (event self-registration and notification read marking). They provide a small set of private RPCs for surveys, approvals, journal posting/reversal and financial linking, but do not yet provide the full secure create/update workflows for members, ministries, cells, events, attendance, resources, welfare and financial drafts. This is a security-conscious schema foundation, not an integrated CRUD backend. Do not solve this by granting broad table writes; add scoped, validated RPCs or trusted server-side operations as each module is integrated.

5. **Finance access is assigned narrowly.** The live role-permission mapping gives finance permissions to `finance_officer`. The `super_admin` and `admin` roles have chart-of-accounts and period-management permissions but do not currently have `view_finances`, `manage_finances`, `approve_finances` or `post_journals`. This may be intentional separation of duties, but it means a user assigned only `super_admin` cannot pass the finance read/post permission checks. Confirm the desired policy before changing role mappings.

6. **Threshold approval configuration is intentionally incomplete.** There are currently zero approval policy rows. Migrations 017 and 022 fail closed for financial documents, budgets and non-document journals when the required active policy/band is missing. Finance workflows should remain unavailable for posting until approval thresholds and approver permissions are configured and tested.

7. **Some useful bootstrap data is outside the 22 migration SQL bodies.** Live data currently includes one SLE currency, one church settings row, one main branch, one linked super-admin profile/role assignment, 45 chart-of-account rows, one financial year and 12 periods. The migrations seed currencies and role/permission definitions, but the church/branch/admin setup and the 45-account/2026 period data were separately provisioned. The live project has zero funds, approval policies, events and ministries. A reproducible setup needs a clearly separated, idempotent application seed/bootstrap stage; account-specific Auth users must be provisioned separately and never copied as fixed IDs or passwords.

8. **Audit storage is append-only, but full audit coverage is not automatic.** The schema prevents updates/deletes to audit rows. Module write operations still need to emit trustworthy audit records through database triggers or trusted server-side workflows; the existence of the table alone does not prove all business actions are logged.

9. **RLS coverage is present, but integration tests remain essential.** All 52 application tables have RLS enabled. The tables are not FORCE ROW LEVEL SECURITY; privileged table owners and Supabase service-role operations can bypass RLS by design. No service-role secret may be exposed to a browser. All normal client paths must be tested with real authenticated sessions, scope assignments and negative cross-branch cases.

10. **The resource visibility hardening migration is important.** Migration 008's first authenticated policy allowed any authenticated profile to read published members-only resources; migration 010 replaced it so members-only requires a linked profile and staff-only requires manage_resources. Preserve the final policy, not the intermediate version.

11. **Financial document and journal lifecycle is deliberately strict.** Posted journals and linked posted financial documents are immutable; corrections use reversal entries. Reversal entries are sent through the journal approval workflow. Welfare assistance/contribution links are required to point to posted financial documents after migration 020.

12. **The survey submission RPC is atomic.** It validates respondent eligibility, active survey dates, required questions and survey/question relationships before inserting a response and answers. The client must still validate answer values against each question type; the database routine does not provide comprehensive semantic validation for every JSON answer format.

### 11.4 Live security/performance advisor results

The security advisor returned one warning: **Leaked Password Protection is disabled** in Supabase Auth. This is an Auth dashboard setting, not a schema defect; enable it before production.

The performance advisor returned 125 informational unused-index findings. The application tables are effectively empty, so these findings are expected at this stage and are not a reason to drop the indexes. The previous advisor run found no missing FK indexes.

### 11.5 Baseline preparation decision

The next deliverable should be a curated Supabase-compatible fresh-install baseline and separate idempotent bootstrap data script, with these properties:

- Uses the final canonical `profiles` model only; no legacy `members` table.
- Creates application-owned schemas, tables, constraints, indexes, RLS policies, grants, functions and triggers in dependency order.
- Installs only required extensions in the correct schema; does not dump Supabase-managed extension plumbing.
- Preserves final hardening from migrations 010, 017, 020 and 022 rather than intermediate definitions.
- Separates reusable role/permission seeds from church-specific setup, chart-of-accounts seed data, calendar periods and account-specific Auth bootstrap.
- Documents Supabase platform prerequisites and has no dependency on a developer's personal Auth UUID, password or secret.
- Is tested in a disposable Supabase-compatible PostgreSQL 17 environment before being considered deployable.

**No live database changes were made during this review.** The archived migrations remain outside the active migration directory. No fresh-install baseline has been activated, and no migration ledger changes are authorized by this review.
