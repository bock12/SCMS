# SCMS database schema

## Live development database

The canonical development database is the hosted Supabase project **SCMS-Development** (project ref: `fpzcwetpcwswhxmyeqzh`, PostgreSQL 17.11).

The live database was provisioned through 22 canonical migrations on 2026-11-14. Their exact names and version IDs are recorded in the Supabase migration ledger. The generated root-level `database.types.ts` is a client type snapshot; it is **not** a SQL baseline.

## Current schema snapshot

The current live schema-only export is stored at `supabase/schema.sql` and was committed on 2026-11-15.

- It reflects the live public/private application DDL at export time.
- It contains no application table data.
- It was generated with PostgreSQL 17 `pg_dump`.
- It currently includes the `extensions` schema, which contains Supabase-managed extension integration functions and platform plumbing.
- It was generated without ownership and privilege statements.

**Important:** Treat this file as a read-only reference snapshot, not as an approved restore script or executable migration. Do not run it against the existing development database. A clean portable baseline still needs to be curated and tested.

## Migration safety and source of truth

The older eight migration files under `supabase/migrations` belong to the earlier legacy schema history. They reference the former `public.members` model and must not be blindly replayed against the already-provisioned SCMS-Development database.

The live project has 22 applied canonical migrations named `scms_001` through `scms_022`. Their migration ledger records are present in Supabase, but the exact SQL source files have not yet been synchronized into this repository. Do not invent or recreate those 22 files from their names alone.

The baseline/migration strategy and supported paths are documented in `docs/architecture/schema-baseline-and-migration-strategy.md`.

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
3. Recover the 22 original canonical migration SQL files if possible.
4. Otherwise, curate a portable baseline that excludes Supabase-managed extension plumbing while retaining required extension declarations and application-owned DDL.
5. Test a clean install on a disposable PostgreSQL 17/Supabase project.
6. Compare the disposable schema and behavior with SCMS-Development.
7. Review RLS, grants, triggers, security-definer functions, and extension dependencies.
8. Obtain explicit approval before any migration-ledger repair or schema deployment to the live project.

No database changes are made by the export workflow or this documentation.
