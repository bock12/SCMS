# SCMS database schema

## Live development database

The canonical development database is the hosted Supabase project **SCMS-Development** (project ref: `fpzcwetpcwswhxmyeqzh`, PostgreSQL 17.11).

The live database was provisioned through 22 canonical migrations on 2026-11-14. The generated root-level `database.types.ts` is a client type snapshot; it is **not** a SQL baseline.

## Recovered live migrations

The exact SQL statements for all 22 applied canonical migrations were recovered read-only from `supabase_migrations.schema_migrations.statements[1]` and committed under:

`supabase/recovered-live-migrations/`

That directory contains:
- 22 original SQL files in ledger version order.
- A README documenting provenance, verification and safe-use rules.

The recovered statements match the SQL stored in the live migration ledger. Three representative files were verified byte-for-byte. The ledger contains no rollback statements for these migrations.

**Important:** This is an archival source directory, not the active Supabase CLI migration directory. Do not move these files into `supabase/migrations` or replay them against SCMS-Development. The eight older files already in `supabase/migrations` belong to a different legacy migration path. A clean install and legacy upgrade strategy must be tested separately before changing the active migration path.

## Current schema snapshot

The current live schema-only export is stored at `supabase/schema.sql`.

- It reflects the live public/private application DDL at export time.
- It contains no application table data.
- It was generated with PostgreSQL 17 `pg_dump`.
- It includes the `extensions` schema, which contains Supabase-managed extension integration functions and platform plumbing.
- It was generated without ownership and privilege statements.

Treat this file as a read-only reference snapshot, not as an approved restore script or executable migration. A clean portable baseline still needs to be curated and tested.

## Export the live application schema (GitHub Actions)

The repository includes a manual workflow:

`.github/workflows/export-supabase-schema.yml`

It runs on a GitHub-hosted Ubuntu runner, installs PostgreSQL 17 client tools, connects through the Supabase Session Pooler, and uses the repository secret `SCMS_DB_PASSWORD` (password only, not a connection URI). The connection host, port, database and project-specific pooler username are configured in the workflow. The password is never printed.

To run it:

1. Open **GitHub → Actions → Export Supabase Schema**.
2. Select **Run workflow** on branch `main`.
3. Wait for the run to complete.
4. Review the resulting `supabase/schema.sql` diff.

The workflow is manual and commits changed snapshots to `main`. It does not modify the live database.

## Local export helper

For a local Windows environment, `scripts/export-supabase-schema.ps1` is available. It requires PostgreSQL 17+ client tools and a connection URI in `SCMS_DATABASE_URL` in the local shell. Keep the URI in a secure local environment variable; never commit it or paste it into chat.

## Rules before any database deployment

1. Do not replay the historical migration chain on the canonical development project.
2. Do not restore the current schema snapshot directly into a live project.
3. Use the recovered live SQL files as migration provenance, not as a sequence to replay on the already-provisioned database.
4. Curate and test a clean fresh-install baseline, preserving required application extensions, DDL, RLS, grants, functions and triggers.
5. Test a legacy upgrade path separately against a disposable database.
6. Compare the disposable schema and behavior with SCMS-Development.
7. Review RLS, grants, triggers, security-definer functions, and extension dependencies.
8. Obtain explicit approval before any migration-ledger repair or schema deployment to the live project.

No database changes are made by the export workflow or this documentation.
