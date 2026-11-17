# FIN-INT-001 — Finance schema reconciliation

**Reviewed:** 2026-11-17  
**Repository:** `bock12/SCMS`  
**Branch:** `main`

## Finding and correction

The earlier baseline-only currency-column reconciliation was incorrect and has been removed.

The recovered migration sequence already adds `financial_documents.exchange_rate_to_base` and `base_currency_code` in its approval-workflow schema step, together with the approval-request foreign key. The baseline generator had inserted a duplicate pair of columns immediately after migration 014, before that later migration ran. PostgreSQL 17 correctly rejected the replay with:

`column "exchange_rate_to_base" of relation "financial_documents" already exists`.

The generated baseline is composed from the complete ordered migration archive; the currency fields must be added exactly once by that archive. No historical recovered migration is modified, and no baseline-only duplicate column patch is appropriate.

The baseline-only pending-journal posting guard remains, but its trigger function must use a valid PostgreSQL dollar-quoted body (`$$ ... $$`). Its replay is covered by the PostgreSQL 17 fresh-install workflow.

## Validation required

1. Run baseline-generator unit tests and reproducibility checks.
2. Regenerate the baseline from all 22 recovered migrations.
3. Run PostgreSQL 17 fresh-install replay and security tests.
4. Only after replay is clean, continue with the atomic receipt/payment creation operation.

Do not alter live Supabase. Do not grant direct table INSERT/UPDATE/DELETE to authenticated users. Do not modify the recovered migration archive.
