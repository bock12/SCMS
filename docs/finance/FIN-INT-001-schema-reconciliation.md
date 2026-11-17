# FIN-INT-001 — Finance schema reconciliation

**Reviewed:** 2026-11-17  
**Repository:** `bock12/SCMS`  
**Branch:** `main`

## Finding

The currency-field concern is resolved for the consolidated schema, but a separate migration-history inconsistency was identified and must be resolved before adding transaction-creation SQL.

The current `supabase/schema.sql` definition of `public.financial_documents` includes:

- `exchange_rate_to_base numeric(20,8) NOT NULL DEFAULT 1`
- `base_currency_code character(3) NOT NULL DEFAULT 'SLE'`
- positive-rate and base-currency-rate constraints.

The same consolidated schema defines `journal_entries.exchange_rate_to_base` and `journal_entries.base_currency_code`. Existing routines use these values to verify document/journal currency consistency and calculate base-currency approval amounts.

However, the recovered migration that creates `financial_documents` — `20261114142328_scms_014_financial_documents_budgets_payments.sql` — does not define either of the two currency-conversion columns. The recovered workflow migration `20261114142439_scms_016_financial_approval_and_posting_workflows.sql` reads those columns, and the hardening migration `20261114142506_scms_017_financial_workflow_hardening.sql` continues to read them. The following recovered migration `20261114142536_scms_018_finance_fk_indexes.sql` creates indexes on `financial_documents.base_currency_code`, but does not add the missing columns.

Therefore:

- The consolidated schema snapshot contains the fields needed by the finance routines.
- The generated `supabase/baseline/fresh_install.sql` explicitly says it is built from the 22 recovered SCMS-Development migrations. Its generated financial-document table follows migration 014 and does not contain either conversion column.
- The PostgreSQL 17 CI workflow applies `supabase/baseline/fresh_install.sql`, not the standalone consolidated `supabase/schema.sql` snapshot. Therefore the fresh-install test path is exposed to this migration-history defect.
- Migration 018 creates an index on `financial_documents.base_currency_code`, but does not add the missing column. This makes the omission a concrete replay blocker, not merely a difference between two documentation snapshots.
- This is a migration-history/fresh-replay defect, not a reason to add duplicate fields or change the accounting design.

## Reconciliation implemented in the inactive baseline generator

The recovered archive is explicitly an immutable record of the 22 statements recovered from the live migration ledger. It must not be rewritten to make the fresh-install replay pass. Instead, `scripts/build-supabase-baseline.mjs` now inserts a clearly labelled baseline-only reconciliation immediately after recovered migration 014, before migrations 016 and 018 reference the fields.

The generated baseline adds:

- `exchange_rate_to_base numeric(20,8) NOT NULL DEFAULT 1` with a positive-rate check.
- `base_currency_code char(3) NOT NULL DEFAULT 'SLE'` with a foreign key to `public.currencies(code)`.
- The invariant that the rate must equal 1 when transaction currency equals base currency.

The archive remains unchanged. This repair applies only to the inactive fresh-install baseline; it is not a live migration and is not approved for deployment. A separate reviewed upgrade path would be required for any existing database.

The generator test suite now asserts that the reconciliation is placed after migration 014 and before migration 015.

## Validation still required

1. Run the baseline generator unit tests.
2. Regenerate and verify `supabase/baseline/fresh_install.sql` is reproducible.
3. Run the PostgreSQL 17 fresh-install replay and security tests on disposable infrastructure.
4. Only after replay is clean, implement the atomic financial-document + balanced draft-journal creation operation.

Do not alter live Supabase. Do not grant direct table INSERT/UPDATE/DELETE to authenticated users. Do not relax the currency validation.

## Related source files

- `supabase/schema.sql` — consolidated current schema snapshot.
- `supabase/recovered-live-migrations/20261114142328_scms_014_financial_documents_budgets_payments.sql` — original financial-document table creation.
- `supabase/recovered-live-migrations/20261114142439_scms_016_financial_approval_and_posting_workflows.sql` — approval routine references to base currency and exchange rate.
- `supabase/recovered-live-migrations/20261114142506_scms_017_financial_workflow_hardening.sql` — hardened approval routine still references the same fields.
- `supabase/recovered-live-migrations/20261114142536_scms_018_finance_fk_indexes.sql` — indexes on the base-currency field.
