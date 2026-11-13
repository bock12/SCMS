# SCMS migration safety test harness

This directory contains the first automated guardrails for the member-directory migration work.

## What is included

- `migrationChainSafety.test.ts`: fast repository-level tests that detect the known mismatch between the canonical root schema and the historical migration chain.
- `supabase/tests/migration-preflight.sql`: read-only PostgreSQL diagnostics for a disposable Supabase project. It reports the database identity, migration-ledger presence, directory columns, every foreign key referencing either directory table, RLS/policy state, row counts, and duplicate legacy profile links.

## Run the static guard tests

From the repository root:

```sh
bun test migrationChainSafety.test.ts
```

These tests run in CI as part of the existing `bun run test` command. They do not connect to Supabase and do not apply SQL.

## Run the database preflight

1. Create or select a **disposable Supabase project** with no production data.
2. Open that project's SQL editor.
3. Run `supabase/tests/migration-preflight.sql`.
4. Save the complete result set and NOTICE messages as the pre-migration baseline.
5. Review the migration ledger and every foreign key before choosing a migration path.

The SQL is wrapped in a read-only transaction. It is diagnostic only.

## What is deliberately not automated yet

The repository does not contain a complete, authoritative legacy pre-migration schema fixture. The root `schema.sql` is already based on canonical `profiles`, while the first historical migration expects `public.members`. Later migrations also assume feature tables and enum definitions from an earlier database baseline.

Therefore, an executable "reset database and replay all migrations" test would have to invent missing historical schema and could falsely certify an invalid migration path. This harness intentionally refuses to claim that the current migration chain passes against a disposable database.

Before adding a migration-application test, capture a schema-only export from the actual legacy starting point (or formally define and review a reproducible legacy fixture). Then add a separate disposable-project test for each supported starting point:

- fresh canonical install;
- legacy database with `public.members`;
- already-canonical database without `public.members`;
- supported partial migration checkpoints.

Never point a migration test at production. No migration is run by these tests.
