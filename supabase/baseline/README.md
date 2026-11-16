# Canonical fresh-install baseline

**Status: draft generator; inactive; not approved for deployment.**

This directory is reserved for a clean SCMS fresh-install baseline. The generated SQL is intentionally kept outside `supabase/migrations` so it cannot be applied automatically by the Supabase CLI.

## Generate

From the repository root, with Bun installed:

```sh
bun scripts/build-supabase-baseline.mjs
```

This reads the 22 exact recovered migration files from `supabase/recovered-live-migrations/` and writes:

`supabase/baseline/fresh_install.sql`

Verify that the output is reproducible:

```sh
bun scripts/build-supabase-baseline.mjs --check
bun test scripts/build-supabase-baseline.test.mjs
```

The generator validates the 001–022 sequence and each source file's recorded transaction wrapper. It consolidates the migration bodies into one transaction, installs `pgcrypto` and `btree_gist` in the final `extensions` schema, removes the intermediate extension relocation, and conditionally revokes Data API execution of the Supabase-managed `public.rls_auto_enable()` function if present.

## Supabase platform requirements

The output expects a fresh Supabase database. It requires the Supabase-managed `auth` schema and `auth.users` table, `auth.uid()`, and `anon`, `authenticated`, and `service_role` database roles. It does not create or copy Supabase event triggers, Auth internals, extension internals, API roles, Vault, or other platform plumbing.

The script includes a preflight guard against running over existing SCMS core tables. It is not a database reset tool.

## Seed-data boundaries

The schema baseline retains reusable schema-coupled reference seeds from the recovered migrations:
- SLE currency row.
- System roles and permissions.
- Role-to-permission mappings, including later module permissions.

Church-specific setup is separate. Use `church-bootstrap.template.sql` only after editing its placeholder church and main-branch values. It creates the singleton church settings, main branch, current calendar financial year and its 12 periods. It does **not** create an Auth user or super-admin profile/assignment.

The 45-account starter chart currently in SCMS-Development is a church-specific seed and should be reviewed by the church's finance/accounting reviewer before it is packaged for another installation. It is not copied automatically. Funds and approval thresholds are also deliberately not preconfigured.

## Required validation before activation

1. Generate the SQL and inspect the full diff against the 22-file archive.
2. Run it on a disposable, fresh Supabase project/database using PostgreSQL 17.
3. Verify expected tables, constraints, indexes, functions, triggers, grants, RLS policies and extension placement.
4. Run positive and negative authorization tests, including cross-branch access attempts.
5. Test survey submission, financial approval, journal posting/reversal, document linkage and audit immutability.
6. Compare the disposable catalog with SCMS-Development, excluding account-specific Auth rows and church bootstrap data.
7. Review the finance starter chart and approval threshold policies separately.
8. Only after successful review, decide whether to adopt a versioned baseline migration strategy.

**Never run this draft against SCMS-Development.** The current development database remains the reference environment. The recovered archive remains immutable evidence, and the existing eight legacy migrations remain untouched.
