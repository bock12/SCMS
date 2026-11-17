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

## Safe next action

Before adding a transaction-creation RPC, reconcile the migration chain with the consolidated schema:

1. Identify the canonical source/order used by the PostgreSQL 17 fresh-install workflow.
2. Confirm whether the currency fields were introduced by an omitted migration or were added only to the consolidated snapshot.
3. If no migration exists, add a forward-only migration that adds both fields with the intended defaults, NOT NULL and constraints, and make sure it runs before workflow routines and indexes reference them. If migration ordering makes that impossible without changing historical files, add the corrective migration at the end and ensure no earlier migration references the absent columns.
4. Run the exact fresh-install migration replay and finance SQL tests on disposable PostgreSQL 17.
5. Only after replay is clean, implement the atomic financial-document + balanced draft-journal creation operation.

Do not alter live Supabase. Do not grant direct table INSERT/UPDATE/DELETE to authenticated users. Do not relax the currency validation.

## Related source files

- `supabase/schema.sql` — consolidated current schema snapshot.
- `supabase/recovered-live-migrations/20261114142328_scms_014_financial_documents_budgets_payments.sql` — original financial-document table creation.
- `supabase/recovered-live-migrations/20261114142439_scms_016_financial_approval_and_posting_workflows.sql` — approval routine references to base currency and exchange rate.
- `supabase/recovered-live-migrations/20261114142506_scms_017_financial_workflow_hardening.sql` — hardened approval routine still references the same fields.
- `supabase/recovered-live-migrations/20261114142536_scms_018_finance_fk_indexes.sql` — indexes on the base-currency field.
