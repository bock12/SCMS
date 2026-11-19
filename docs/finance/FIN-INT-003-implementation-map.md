# FIN-INT-003 — Finance Module End-to-End Verification

**Reviewed:** 2026-11-19  
**Repository:** `bock12/SCMS`  
**Branch:** `main`  
**Reviewed head before this task record:** `17534d87cfaf39690d712d1abe332f4283953493`

## Objective

Verify that finance operations remain coherent across the application service boundary, canonical mock adapter, PostgreSQL routines, approval workflow, journal posting and ledger/reporting projections.

This task does not authorize live Supabase migration replay, deployment, production data writes or the use of production credentials.

## Verified implementation map

| Workflow | Application/service | Mock RPC | PostgreSQL coverage | Remaining verification |
|---|---|---|---|---|
| Receipt creation | `FinanceTransactionEntryWorkspace.tsx`, `financeTransactionService.ts` | `create_financial_document_transaction` | `finance_transaction_lifecycle.sql` | Browser interaction and persisted UI refresh |
| Payment creation | Same entry workspace/service | Same canonical transaction RPC | `finance_transaction_lifecycle.sql` | Browser interaction and persisted UI refresh |
| Finance approval/rejection | `FinanceDocumentWorkflowWorkspace.tsx`, `financeDocumentWorkflowService.ts` | `decide_financial_document_approval` | `finance_transaction_lifecycle.sql`, `finance_document_listing.sql` | Browser role-switch and decision flow |
| Journal posting | `FinanceJournalWorkspace.tsx`, `financeJournalService.ts` | `post_finance_journal_entry` | `finance_transaction_lifecycle.sql` | Browser posting and refresh |
| Ledger/account balances | `financeJournalService.ts`, `financeReportService.ts` | `get_finance_journals` | Transaction lifecycle SQL | UI report totals and filtering |
| Event budget payment | `eventBudgetFinanceService.ts`, `EventBudgetFinanceWorkspace.tsx` | Event-budget approval/payment RPCs | `event_budget_payment_integration.sql`, `event_budget_submission_permissions.sql` | Browser workflow |
| Department requisition payment | `requisitionService.ts`, `DepartmentRequisitionPaymentWorkspace.tsx` | Requisition and payment RPCs | `department_requisition_approval_lifecycle.sql`, `department_requisition_payment_integration.sql` | Browser workflow |

The mock adapter is instantiated in `supabaseClient.ts` and receives the current mock identity and resolved role permissions on each RPC call. Canonical finance state is stored separately from legacy `FinancialRecord` demo data. Unknown RPCs fail closed.

## Slice 1 — service-to-adapter transaction lifecycle

Added an integration test to `financeTransactionService.test.ts` that composes the typed transaction/approval services with the actual deterministic mock finance RPC adapter.

The test exercises a payment across the service boundary:

1. Creates a canonical payment document.
2. Verifies the balanced draft journal and approval workflow are created.
3. Performs the two ordered approval decisions as distinct approvers.
4. Posts the approved journal using the controlled posting RPC.
5. Reads the ledger projection and verifies posted debit/credit totals.
6. Verifies the canonical payment document reaches `posted` only after journal posting.

This complements, rather than replaces, the existing adapter-level receipt/payment, approval, rejection, branch-scope, closed-period, posting and ledger tests.

### Validation

- SCMS Build Validation: [run 44635598181](https://github.com/bock12/SCMS/actions/runs/44635598181) — success. The complete Bun automated test suite and Vite production build passed for commit `17534d87`.
- PostgreSQL 17 fresh-install/security workflow: [run 44633745214](https://github.com/bock12/SCMS/actions/runs/44633745214) — success. It applied the finance, event-budget and requisition migrations and passed the transaction, listing, approval, source-payment and security integration SQL tests. The SQL schema and migration files have not changed since that run.
- These checks establish automated test/build and disposable PostgreSQL behavior, not browser acceptance or live Supabase behavior.

## Known verification gaps

- The repository's current build workflow runs Bun tests and a Vite production build; it does not run a browser automation suite.
- No Playwright/browser acceptance test has yet exercised the screens as a signed-in Finance Officer, approver and journal poster.
- No real browser session, live Supabase migration replay, live database write or production deployment was performed.
- Event budget and requisition end-to-end behavior is covered by adapter and PostgreSQL integration tests, but not yet by browser acceptance tests.
- Legacy localStorage event-budget and requisition demo data must not be treated as canonical database records or posted expenditure.

## Next implementation slice

Establish a repeatable browser acceptance harness using a disposable local mock environment and deterministic test identities. Cover receipt creation, payment creation, ordered approval/rejection, journal posting, ledger refresh, event-budget payment and requisition partial settlement. Keep this harness isolated from real Supabase credentials and production data.

After browser acceptance is repeatable, perform a separate user-authorized review of the live Supabase migration path. Do not apply migrations or write live data as part of this task without explicit authorization.
