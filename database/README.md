# SCMS database schema

## Live development database

The canonical development database is the hosted Supabase project **SCMS-Development** (project ref: `fpzcwetpcwswhxmyeqzh`, PostgreSQL 17).

The live database was provisioned through 22 canonical migrations on 2026-11-14. Their exact names and versions are recorded in Supabase migration history. The generated root-level `database.types.ts` is a client type snapshot; it is **not** a schema baseline.

## Migration safety

The older migration files under `supabase/migrations` belong to the earlier legacy schema history. They reference the former `members` model and must not be blindly replayed against the already-provisioned SCMS-Development database.

Do not reset or migrate the live database to reconstruct history. A fresh-install baseline and a legacy-upgrade path are separate deliverables and must be reviewed independently.

## Export the live application schema (Windows, no Docker)

A schema-only export is needed to preserve the actual database definitions (tables, constraints, indexes, functions, triggers and RLS policies) in version control. The repository includes this PowerShell helper:

```powershell
./scripts/export-supabase-schema.ps1
```

Prerequisites:

- PostgreSQL 17 or newer command-line client tools, including `pg_dump`, available on `PATH`.
- A Supabase database connection URI supplied through the `SCMS_DATABASE_URL` environment variable in the current terminal session.
- Network access to the Supabase database.

Set the environment variable securely in your own terminal/session or secret manager. **Never commit the URI, database password, service-role key, or other credentials. Do not paste them into chat.** Use the direct connection URI when your network supports it; otherwise use the Supabase session pooler connection URI.

The helper exports only the application-owned `public`, `private`, and `extensions` schemas to `supabase/schema.sql`. It does not export table data or Supabase-managed `auth`/storage schemas. Docker is not required. The export is not automatically committed; inspect it first.

## After export

1. Review the dump for secrets, environment-specific grants, and unexpected Supabase-managed objects.
2. Compare the exported DDL with the 22 applied canonical migration records in Supabase.
3. Add a documented fresh-install baseline only after review.
4. Keep legacy upgrades separate; test them against a disposable database before proposing any production change.
5. Regenerate `database.types.ts` after approved schema changes.

No command in this guide changes the live database. The export is read-only.


## Export from GitHub (no local project copy required)

If you do not have the repository checked out locally, use the hosted workflow instead:

1. In GitHub, open **Settings → Secrets and variables → Actions** for this repository.
2. Create a repository secret named `SCMS_DATABASE_URL`.
3. Set its value to the Supabase PostgreSQL connection URI. Prefer the direct connection URI if your network route supports it; otherwise use the session pooler URI. Do not use an anon key or service-role key.
4. Open **Actions → Export Supabase Schema → Run workflow** and run it on `main`.
5. On success, the workflow commits the generated `supabase/schema.sql` file to `main`.

The workflow runs on a GitHub-hosted Ubuntu runner, installs PostgreSQL 17 client tools, and exports only `public`, `private`, and `extensions`. The database URI is read from the Actions secret and is not printed. The workflow does not modify the live database.

After the first successful run, the generated SQL file can be reviewed directly in GitHub. Do not enable automatic schema exports on a schedule until the first export has been reviewed.
