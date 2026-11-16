# Recovered live Supabase migrations

**Status:** Archived source recovery; not currently an executable migration directory.

These 22 SQL files were recovered directly from the `statements` arrays in the SCMS-Development project's `supabase_migrations.schema_migrations` ledger on 2026-11-16. Each ledger record contained exactly one SQL statement string. The files preserve that recorded SQL text, including its explicit transaction boundaries.

## Provenance

- Supabase project: SCMS-Development (`fpzcwetpcwswhxmyeqzh`)
- PostgreSQL server: 17.11
- Ledger records: 22
- Version range: `20261114141712`–`20261114142753`
- Migration names: `scms_001_church_foundation` through `scms_022_journal_approval_enforcement`
- Recovery source: `supabase_migrations.schema_migrations.statements[1]`
- Recovery date: 2026-11-16

The SQL was retrieved read-only. No migration was re-applied and no live schema or data was changed.

## Important: do not replay from this directory

This directory is intentionally named `recovered-live-migrations`, not `migrations`. Supabase CLI will not treat it as the project's active migration directory by default.

Do **not** move or copy these files into `supabase/migrations` until the canonical migration strategy has been reviewed. The repository already has eight older migrations in `supabase/migrations` that represent a legacy `members`-based path. A fresh-install sequence combining those eight with the recovered 22 may not be valid without a separately tested baseline and upgrade plan.

These recovered files document what was applied to the live project. They are not an instruction to reapply it to that project.

## Verification notes

- Each recovered SQL body was checked to start with `BEGIN;` and end with `COMMIT;`.
- The recorded migration versions and names were matched against the Supabase migration ledger.
- The ledger's `rollback` field was null for all 22 records; no rollback scripts were recovered.
- These files preserve recorded migration statements, but they do not include deployment environment configuration, extension installation performed outside these statements, or application data.

## Next steps

1. Review the recovered SQL in version order.
2. Compare the final resulting DDL against `supabase/schema.sql`.
3. Determine the correct fresh-install baseline and a separate legacy upgrade path.
4. Test on a disposable PostgreSQL 17/Supabase project.
5. Only after those checks, decide how to adopt the files or a baseline in the active `supabase/migrations` directory.
6. Do not repair or rewrite the live project's migration ledger without a reviewed plan and explicit approval.
