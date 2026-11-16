# SCMS database schema

## Live development database

The canonical development database is the hosted Supabase project **SCMS-Development** (project ref: `fpzcwetpcwswhxmyeqzh`, PostgreSQL 17.11).

The live database was provisioned through 22 canonical migrations on 2026-11-14. The generated root-level `database.types.ts` is a client type snapshot; it is **not** a SQL baseline.

## Recovered live migrations

The exact SQL statements for all 22 applied canonical migrations were recovered read-only from `supabase_migrations.schema_migrations.statements[1]` and committed under:

`supabase/recovered-live-migrations/`

That directory contains 22 original SQL files and a README documenting provenance, verification and safe-use rules. The recovered archive is historical evidence. Do not replay it against SCMS-Development or move it into the active migration path without a tested migration strategy.

## Canonical fresh-install baseline (draft)

The baseline generator and documentation are under:

- `scripts/build-supabase-baseline.mjs`
- `scripts/build-supabase-baseline.test.mjs`
- `supabase/baseline/README.md`
- `supabase/baseline/church-bootstrap.template.sql`

Generate the consolidated SQL from the exact 22-file archive:

```sh
bun scripts/build-supabase-baseline.mjs
bun scripts/build-supabase-baseline.mjs --check
bun test scripts/build-supabase-baseline.test.mjs
```

The generated `supabase/baseline/fresh_install.sql` is deliberately outside `supabase/migrations`. It has passed a disposable PostgreSQL 17.12 replay using minimal test-only Supabase Auth stubs, including schema-count, RLS, profile isolation and restricted-write smoke tests. This is not a full Supabase platform replay, so a disposable Supabase project replay and broader module tests are still required before activation. It is not a restore script for the live project.

The baseline retains schema-coupled SLE, role and permission seeds. Church-specific settings, main branch and current calendar periods are separated into the editable bootstrap template. The 45-account chart of accounts, funds, approval thresholds and Auth-user bootstrap remain separate review/setup tasks.

## Current schema snapshot

The current live schema-only export is stored at `supabase/schema.sql`. It reflects the live public/private application DDL at export time, contains no application table data, and includes the `extensions` schema with Supabase-managed extension integration functions and platform plumbing. Treat it as a read-only reference snapshot, not an approved restore script.

## Export the live application schema (GitHub Actions)

The repository includes a manual workflow: `.github/workflows/export-supabase-schema.yml`. It runs on a GitHub-hosted Ubuntu runner, installs PostgreSQL 17 client tools, connects through the Supabase Session Pooler, and uses the repository secret `SCMS_DB_PASSWORD` (password only, not a connection URI). The password is never printed. The workflow is manual and does not modify the live database.

## Rules before any database deployment

1. Do not replay the historical migration chain on the canonical development project.
2. Do not restore the current schema snapshot directly into a live project.
3. Keep the recovered migration archive immutable and outside the active migration directory.
4. Generate and inspect the fresh-install baseline; test it only on a disposable Supabase-compatible PostgreSQL 17 target.
5. Test a legacy upgrade path separately against a disposable database.
6. Compare RLS, grants, triggers, functions, extensions and constraints with SCMS-Development.
7. Obtain explicit approval before any migration-ledger repair or schema deployment to the live project.

No database changes are made by the baseline generator or these files.
