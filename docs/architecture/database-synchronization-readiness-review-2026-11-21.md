# SCMS Database Synchronization and Readiness Review

- Date: 2026-11-21
- Repository: `bock12/SCMS`, branch `main`
- Reviewed revision: `ac5f7d88e350d506cfb67fb3b736b8b6da824bf0`
- Review type: Read-only repository, migration, baseline and CI review
- Live database changes: None
- Status: Repository review complete; live ledger reconciliation remains open

## Executive summary

The last recorded live inspection (2026-11-16) found SCMS-Development on PostgreSQL 17.11 with 22 recovered SCMS migration bodies, 50 public tables, 2 private tables, RLS enabled on all 52 application tables, 56 public policies, 2 private policies and 18 private routines. The church, one branch, linked Super Admin, 2026 financial year/periods and 45 Chart of Accounts entries were provisioned.

The current repository contains 29 timestamped SQL files in `supabase/migrations/`, including later finance, event-budget and department-requisition workflows. This review did not connect to the live database, so the exact current applied migration set is unknown.

**Do not run every file in `supabase/migrations/` against SCMS-Development.** The repository contains distinct historical/forward migration assumptions. Earlier migration files reference the legacy `members` model, while the recovered live foundation uses canonical `profiles`. The repository's own migration strategy warns that these paths are not interchangeable.

## 1. Repository migration and baseline inventory

- `supabase/recovered-live-migrations/`: 22 archived SQL migration bodies, SCMS 001–022, recovered from the live migration ledger. This is historical evidence, not the forward migration directory.
- `supabase/migrations/`: 29 timestamped SQL files as of this review. They cover membership/events/resources, auth and authorization hardening, finance transaction/document/journal APIs, event budgets, finance configuration, department requisitions and payment linkage, idempotency and document numbering.
- `supabase/baseline/fresh_install.sql`: generated from the 22 recovered files only. The generator requires exactly 22 source migrations.
- `supabase/baseline/README.md`: explicitly labels the baseline inactive and not approved for deployment.
- `supabase/baseline/church-bootstrap.template.sql`: separate church-specific bootstrap; does not create an Auth user or first Super Admin assignment.

The baseline expects Supabase Auth prerequisites, excludes Supabase platform internals, and deliberately separates church-specific bootstrap data. The 45-account chart, funds and approval thresholds are not automatically seeded.

## 2. Disposable PostgreSQL validation

Latest database baseline workflow found:
- [Test SCMS Baseline on PostgreSQL 17 #44893843310](https://github.com/bock12/SCMS/actions/runs/44893843310)
- Result: success; tested revision `e3b940b2).
- Environment: disposable PostgreSQL 17 with minimal test-only Supabase Auth stand-ins.

The workflow applied the 22-file baseline, then a curated set of auth-linking, authorization, finance transaction/idempotency/document-read/journal APIs, event-budget, finance configuration and department-requisition migrations. All job steps passed, including finance transaction lifecycle, document listing/scope isolation, event budget payment/posted actuals, Event Manager submission restrictions, requisition approval/payment settlement and journal API grants/security.

This is meaningful disposable-PostgreSQL validation of the curated baseline-plus-forward-migrations path. It is not a live Supabase replay and does not prove that SCMS-Development has the same migration versions.

Latest app checks at review time:
- [Build Validation #44910829679](https://github.com/bock12/SCMS/actions/runs/44910829679): success.
- [Finance Browser Validation #44910829688](https://github.com/bock12/SCMS/actions/runs/44910829688): success.

These validate the app build and mock/browser finance workflow, not live DB synchronization.

## 3. Schema snapshot status

The checked-in `supabase/schema.sql` is a PostgreSQL 17.11 schema-only export. Its latest Git history entry is 2026-11-15 (`caddcf84`). It predates later finance and requisition work now present in `main`. It contains some finance fields (including `document_number` and `idempotency_key`) but not the later requisition/event-budget objects and RPCs reviewed in current migrations. It is not a complete current-main schema snapshot.

The export workflow is manual and uses the repository secret `SCMS_DB_PASSWORD`. It was not triggered during this read-only review.

## 4. Live database facts versus unknowns

Historical live facts (2026-11-16):
- PostgreSQL 17.11; 22 recovered migration bodies.
- 50 public tables, 2 private tables; RLS on all 52.
- 56 public policies, 2 private policies, 18 private routines.
- Church settings 1; branches 1; profiles 1; profile role assignments 1.
- Chart of Accounts 45; financial years 1; periods 12.
- Approval policies 0; funds 0.

These are historical counts, not a fresh statement of the live database on 2026-11-21.

Not verified:
- Current `supabase_migrations.schema_migrations` rows.
- Which of the 29 timestamped migrations have since been applied live.
- Current live policies, grants, RPC definitions and table inventory.
- Whether finance configuration, event budget and requisition objects exist live.
- Whether live data changed after the last recorded bootstrap.
- Whether the frontend is connected to Supabase; last recorded frontend state used mock auth/localStorage.

## 5. Required live read-only reconciliation

Run the following in the SCMS-Development SQL Editor and preserve the outputs. These queries are read-only.

First inspect ledger columns:

```sql
select column_name, data_type
from information_schema.columns
where table_schema = 'supabase_migrations'
  and table_name = 'schema_migrations'
order by ordinal_position;
```

Then list applied versions:

```sql
begin transaction read only;
select version
from supabase_migrations.schema_migrations
order by version;
commit;
```

Capture database identity, table/RLS inventory, policies and routines:

```sql
begin transaction read only;

select current_database() as database_name,
       current_user as database_role,
       current_setting('server_version') as postgres_version,
       now() as inspected_at;

select n.nspname as schema_name,
       count(*) filter (where c.relkind in ('r','p')) as table_count,
       count(*) filter (where c.relkind in ('r','p') and c.relrowsecurity) as tables_with_rls
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname in ('public','private')
group by n.nspname
order by n.nspname;

select schemaname, tablename, policyname, permissive, roles, cmd
from pg_policies
where schemaname in ('public','private')
order by schemaname, tablename, policyname;

select n.nspname as schema_name,
       p.proname as routine_name,
       pg_get_function_identity_arguments(p.oid) as arguments,
       p.prosecdef as security_definer,
       p.proconfig as function_settings
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname in ('public','private')
order by n.nspname, p.proname;

commit;
```

Also run the existing read-only `supabase/tests/migration-preflight.sql` for the member-directory/FK/RLS diagnostics. Do not run migration repair, DDL, schema replay, bootstrap or write operations during this inspection.

## 6. Readiness decision

| Area | Status |
|---|---|
| Historical live schema recovery | Complete at last recorded checkpoint |
| Core live bootstrap | Complete at last recorded checkpoint |
| Current repository migration work | Advanced; live application status unknown |
| Fresh-install baseline | Draft/inactive; not approved for deployment |
| Disposable PostgreSQL validation | Passing for curated path |
| Current app build | Passing |
| Finance browser validation | Passing |
| Current live schema parity | Not verified |
| Real Supabase app integration | Not complete per last recorded state |
| Production readiness | Not ready |

## 7. Next safe action

Obtain the live read-only ledger and catalog outputs, compare them with the curated CI migration path, and only then prepare a controlled migration plan.

Do not apply all files in `supabase/migrations/`, apply `fresh_install.sql` to SCMS-Development, use `schema.sql` as a restore script, or mark migrations applied manually to silence drift.

**Conclusion:** SCMS does not need to start its database setup over. It has a substantial provisioned development database and a passing disposable PostgreSQL validation path. The remaining task is to reconcile the live migration ledger and catalog with the current repository state before authorizing any live migration.
