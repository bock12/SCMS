# Recovered Live Migrations — Technical Review

- **Date:** 2026-11-16
- **Repository:** `bock12/SCMS`
- **Target inspected:** Supabase project `SCMS-Development`
- **PostgreSQL:** 17.11
- **Review type:** Read-only SQL review and live catalog comparison
- **Status:** Review complete; fresh-install baseline not yet built or tested

## Executive summary

All 22 SQL migration bodies recovered from the live Supabase migration ledger were reviewed in timestamp order. The live catalog is consistent with the recovered application schema at the object-count and table/column level: 50 public tables, 2 private tables, 56 public RLS policies, 2 private RLS policies and 18 private routines. RLS is enabled on all 52 application tables.

The archive is valuable source evidence, but it is **not a portable fresh-install script**. It assumes Supabase Auth schemas/functions/roles and an existing Supabase platform event-trigger function. The current pg_dump snapshot includes extension/platform plumbing that should not be copied wholesale. The next step is to curate a Supabase-compatible baseline and separate bootstrap seed process, then test it against a disposable PostgreSQL 17/Supabase-compatible environment.

No schema or data changes were made during this review.

## 1. Review coverage

Reviewed all files in `supabase/recovered-live-migrations/`:

1. `20261114141712_scms_001_church_foundation.sql`
2. `20261114141729_scms_002_unified_profiles_and_transfers.sql`
3. `20261114141749_scms_003_database_authorization.sql`
4. `20261114141802_scms_004_ministries_and_cells.sql`
5. `20261114141817_scms_005_foundation_rls_and_grants.sql`
6. `20261114141848_scms_006_security_and_fk_indexes.sql`
7. `20261114141944_scms_007_events_and_attendance.sql`
8. `20261114142029_scms_008_resources_and_surveys.sql`
9. `20261114142049_scms_009_streaming.sql`
10. `20261114142110_scms_010_resource_visibility_hardening.sql`
11. `20261114142139_scms_011_finance_foundation.sql`
12. `20261114142211_scms_012_double_entry_journal_ledger.sql`
13. `20261114142259_scms_013_private_schema_hardening.sql`
14. `20261114142328_scms_014_financial_documents_budgets_payments.sql`
15. `20261114142400_scms_015_threshold_approval_schema.sql`
16. `20261114142439_scms_016_financial_approval_and_posting_workflows.sql`
17. `20261114142506_scms_017_financial_workflow_hardening.sql`
18. `20261114142536_scms_018_finance_fk_indexes.sql`
19. `20261114142604_scms_019_welfare_notifications_audit.sql`
20. `20261114142621_scms_020_welfare_audit_hardening.sql`
21. `20261114142647_scms_021_welfare_fk_indexes.sql`
22. `20261114142753_scms_022_journal_approval_enforcement.sql`

The review covered table/column definitions, constraints, indexes, foreign keys, extensions, RLS policies, grants, role/permission seeds, private routines, triggers, workflow hardening and bootstrap-data dependencies. It was a static SQL review plus catalog-level comparison, not a byte-for-byte replay comparison in a disposable Supabase environment.

## 2. Live catalog comparison

| Item | Live result |
|---|---:|
| Public application tables | 50 |
| Private tables | 2 |
| Public RLS policies | 56 |
| Private RLS policies | 2 |
| Private-schema routines | 18 |
| Application tables with RLS enabled | 52 of 52 |
| PostgreSQL version | 17.11 |

The public table/column catalog was queried directly. The live tables align with the recovered sequence's application areas: church foundation, profiles, authorization, ministries/cells, events/attendance, resources/surveys, streaming, finance/approvals, welfare, notifications and audit.

All 22 SQL bodies were previously recovered from `supabase_migrations.schema_migrations.statements[1]`; representative bodies 001, 016 and 022 were compared byte-for-byte with the ledger. The archive README records that provenance.

## 3. Sequence summary

| Range | Main contents |
|---|---|
| 001–004 | Church settings, currencies, districts/branches, unified profiles/transfers, roles/permissions/scopes, ministries and cells. |
| 005–006 | RLS, table grants, scoped read policies, RLS event-trigger execute revocation and FK indexes. |
| 007–010 | Events, registrations, attendance, resources, event surveys, atomic survey submission, streaming, private stream credential references and resource visibility hardening. |
| 011–013 | Chart of accounts, funds, financial years/periods/accounts, double-entry journals, posting/reversal functions and private schema/extension hardening. |
| 014–018 | Financial documents, giving, budgets, payment gateway records, threshold approval schema, approval/posting routines, workflow hardening and FK indexes. |
| 019–022 | Welfare, notifications, audit logs, welfare financial-link hardening, additional indexes and journal approval enforcement. |

Important final-state replacements must be retained: migration 010 replaces the initial resource visibility policy; migration 017 changes financial-document and budget approval to fail closed; migration 020 hardens welfare financial links and makes audit rows append-only; migration 022 enforces explicit journal policy checks and approval-routed reversals.

## 4. Findings

### F-01 — Not directly portable to generic PostgreSQL

The migration sequence assumes Supabase platform objects, including `auth.users`, `auth.uid()`, Supabase database roles, and `public.rls_auto_enable()`. Migration 006 revokes EXECUTE on the latter; it does not create that platform function. A generic PostgreSQL 17 database will not have these prerequisites. A fresh-install baseline must explicitly document Supabase platform prerequisites and test against a compatible target.

### F-02 — Extension and platform dump contamination

The application requires `pgcrypto` and `btree_gist`. The live project has them in the `extensions` schema. Migration 011 creates `btree_gist` before migration 013 moves it to `extensions`. The pg_dump snapshot also includes extension/platform functions and seven event triggers; 243 functions were previously observed in the extensions schema. Do not replay all of `extensions` or copy Supabase-managed event triggers into a new project. The baseline should declare only the required extensions in their final schema and leave platform internals to Supabase.

### F-03 — Authenticated CRUD backend is incomplete

Most tables have RLS and SELECT grants but no authenticated INSERT/UPDATE/DELETE grants. There are narrow exceptions and specific private RPCs for survey submission, approvals, journal posting/reversal and financial-document linking. There are not yet complete trusted create/update workflows for all modules. This is a secure foundation, not a fully integrated CRUD API. Do not fix it with broad table grants. Add validated, scope-aware RPCs or trusted server-side handlers per module.

### F-04 — Finance role mapping requires a product decision

The live mapping assigns finance permissions (`view_finances`, `manage_finances`, `approve_finances`, `post_journals`) to `finance_officer`. `super_admin` and `admin` have chart-of-accounts and financial-period management permissions but do not have those four finance permissions. A user with only `super_admin` therefore cannot pass the finance read/post checks. This may be intentional separation of duties; confirm before changing the mapping.

### F-05 — No approval policies have been configured

The live `approval_policies` table has zero rows. This is consistent with the unresolved threshold amounts. Migrations 017 and 022 deliberately fail closed if a required policy or threshold band is missing. Do not enable financial posting until policies, thresholds, approval permissions and end-to-end tests are in place.

### F-06 — Bootstrap data is not fully represented by migrations

Live data counts at review time:

| Data | Rows |
|---|---:|
| Currencies | 1 |
| Church settings | 1 |
| Districts | 0 |
| Branches | 1 |
| Profiles | 1 |
| Profile role assignments | 1 |
| Chart of accounts | 45 |
| Funds | 0 |
| Financial years | 1 |
| Financial periods | 12 |
| Approval policies | 0 |
| Events | 0 |
| Ministries | 0 |

The migrations seed SLE and role/permission definitions, but the church settings, main branch, super-admin profile/assignment, 45 chart-of-account rows and 2026 financial year/periods were separately provisioned. The live database has no funds or approval policies yet. Create a separate idempotent bootstrap seed stage for reusable baseline data and church-specific initial setup. Auth users must be provisioned separately; never hard-code personal Auth UUIDs or passwords into a baseline.

### F-07 — Audit table is append-only but does not prove complete audit coverage

Migration 020 prevents updates/deletes to audit rows. Every business write path must still emit an audit event through a trusted trigger or server-side workflow. Do not claim complete audit coverage until those paths are implemented and tested.

### F-08 — Survey answer JSON still needs semantic validation

The private survey RPC atomically checks respondent eligibility, active dates, required question presence and survey/question ownership. The client should validate answer value formats against question types. The RPC does not comprehensively validate every answer's semantic format.

### F-09 — Resource policy hardening must be preserved

Migration 008's initial authenticated policy was too broad for members-only resources. Migration 010 replaces it: members-only requires a linked profile, and staff-only requires `manage_resources`. A baseline must use the final migration-010 policy only.

### F-10 — RLS enabled, but not FORCE RLS

All 52 application tables have RLS enabled. They do not have FORCE ROW LEVEL SECURITY. Table owners and privileged Supabase service-role operations can bypass RLS by design. Never expose a service-role/secret key to the browser; normal application paths must use authenticated sessions and be tested with positive and negative branch-scope cases.

### F-11 — Financial posting and reversals are intentionally strict

Posted journals and posted financial documents are immutable. Corrections use reversal entries, and reversals go through journal approval. Migration 020 also requires welfare assistance/contribution links to posted financial documents. Preserve these rules in the baseline.

## 5. Advisor results

- **Security:** one warning — Supabase Auth Leaked Password Protection is disabled. Enable this in Auth settings before production. It is not a schema defect.
- **Performance:** 125 informational unused-index findings. The application tables are largely empty, so these are expected at this stage; do not drop indexes based only on this early signal.
- The previous advisor run reported no missing FK indexes.

## 6. Recommended fresh-install baseline plan

1. Keep all 22 recovered migrations archived outside `supabase/migrations`.
2. Build one canonical baseline from the final schema, not by replaying both the legacy eight-migration chain and the recovered archive.
3. Use only the final hardened definitions from migrations 010, 017, 020 and 022.
4. Include application-owned schemas, tables, constraints, indexes, functions, triggers, grants and RLS.
5. Declare required extensions in their final schema; exclude Supabase-managed extension internals and event triggers.
6. Separate generic role/permission/currency seeds from church-specific church/branch, chart-of-accounts, fund and calendar setup.
7. Keep Auth user creation and initial account linking as a documented, manual/bootstrap workflow with no embedded credentials.
8. Test the complete baseline and negative authorization cases in a disposable Supabase-compatible PostgreSQL 17 environment before designating it deployable.

## 7. Current deployment gate

No live DDL, data changes, migration replay or migration-ledger changes were performed for this review. The recovered files remain archival evidence only. The current schema snapshot remains read-only and is not a restore script. The clean baseline has not yet been created or validated.
