# FIN-INT-001 — Finance integration implementation map

**Reviewed:** 2026-11-18  
**Repository:** `bock12/SCMS`  
**Branch:** `main`  
**Reviewed head:** `585342bb5856120142d051afe1b5e34348acb77b`

## Executive finding

The original Finance Officer Workspace used the legacy `financial_records` model, which is intentionally absent from the PostgreSQL baseline. Main now has a canonical receipt/payment entry path, balanced journal creation, database approval routines, a mock workflow adapter and a Finance Officer approval view. This is a substantial vertical slice, not yet a complete finance-module migration: finance setup is still mock-only, and requisitions, event budgets, department/event balances and several summary/report surfaces still use legacy localStorage or FinancialRecord projections.

Do not reintroduce `financial_records` or grant broad table DML. The intended accounting source of truth is `financial_documents`, `journal_entries` and `journal_lines`, with approval requests and narrow RPC boundaries.

## Current application map

| Area | Current implementation | Integration gap |
|---|---|---|
| Finance Officer Workspace | `FinanceOfficerWorkspace.tsx` mounts `FinanceTransactionEntryWorkspace` and `FinanceDocumentWorkflowWorkspace` for canonical receipts/payments | Main receipt/payment entry and approval path uses RPCs; legacy summary metrics, requisition/event disbursement and some reporting still need migration |
| Giving configuration | `givingConfig.ts`; funds, payment gateways and bank details persisted in localStorage | Funds and financial accounts exist in PostgreSQL; gateway/bank configuration needs a deliberate mapping before migration |
| Requisitions | `requisitionService.ts`; seeded data and localStorage state | No matching requisition domain table found in the baseline; `approval_requests.transaction_type` allows `requisition`, but that alone does not provide a requisition record/workflow |
| Event budget approvals | `eventBudgetService.ts`; localStorage state and local approval/disbursement updates | Baseline has `budgets`/`budget_lines`, approval policies and requests; map event budgets to `budgets` with `budget_type = 'event'` and `event_id` |
| Department ledger | `departmentLedgerService.ts`; per-department localStorage ledger | No department ledger table; must become a view/projection of approved accounting records, not a second ledger |
| Event account/funding | `eventAccountService.ts`; localStorage account balances and transactions | Must derive balances from financial accounts and posted journal lines rather than separately mutating balances |

## Database model and security boundary

The fresh-install baseline defines:

- **Master data:** `chart_of_accounts`, `funds`, `financial_years`, `financial_periods`, `financial_accounts`.
- **Accounting:** `journal_entries` and `journal_lines`; posted journals are immutable, entries must balance in transaction and base currency, and posting checks open periods, active accounts, branch consistency and `post_journals`.
- **Financial source documents:** `financial_documents` for receipts, payments, transfers and adjustments; `giving_records` for giver/fund details.
- **Budgets:** `budgets` and `budget_lines`, including event linkage.
- **Approvals:** `approval_policies`, bands, steps, `approval_requests`, `approval_request_steps` and `approval_decisions`.

For the finance tables reviewed, the baseline revokes table privileges from `anon` and `authenticated`, then grants **SELECT only**. RLS uses `view_finances`, branch scope and, for financial documents, the giver's own profile. Do not grant client-side INSERT/UPDATE/DELETE on these tables.

Privileged finance routines live in the `private` schema, use `SECURITY DEFINER` with an empty search path and perform authentication, profile, permission, workflow and scope checks. Explicit authenticated EXECUTE grants are present for the routines, including:

- `private.submit_financial_document_for_approval(uuid)`
- `private.record_approval_decision(uuid,text,text)`
- `private.attach_journal_to_financial_document(uuid,uuid)`
- `private.post_journal_entry(uuid)`
- `private.submit_journal_entry_for_approval(uuid)`
- `private.reverse_journal_entry(uuid,date,text)`
- `private.submit_budget_for_approval(uuid)`

Approval decisions validate the active step, prior steps, required permission and submitter separation. Journal posting checks the linked document or journal approval result before posting.

## Mock-client boundary

`supabaseClient.ts` preserves the local mock query builder and mock authentication. `mockFinanceRpc.ts` now simulates canonical finance configuration, receipt/payment creation, approval decisions and document listing in an isolated finance store. This is development behavior only; it does not prove live PostgreSQL authorization or persistence. The SQL RPCs are independently exercised by the disposable PostgreSQL 17 workflow.

## First safe implementation sequence

1. **Establish a non-destructive service boundary (first code slice):** add typed finance domain/service contracts and tests for reading the real finance model. No writes or schema/grant changes in this slice.
2. **Read-only ledger projection:** load financial documents, giving records and journal status through permission-filtered SELECTs; replace the `financial_records` loader and demo fallback. Represent source type/status explicitly; do not label an unposted document as a posted ledger transaction.
3. **Transaction creation:** add narrow, reviewed database routines to create a financial document and its balanced draft journal (and giving detail where applicable) atomically. Validate profile, `manage_finances`, branch, currency, account, fund and open period. Add matching mock RPC simulation and negative tests. No direct table DML grants.
4. **Approval and posting:** use the existing submit/decision/post routines; surface pending approval, approved, rejected and posted states from the database. Do not allow the submitter to approve their own request where policy prohibits it.
5. **Budget/event integration:** migrate event budgets to `budgets`/`budget_lines` and existing approval routines; design a real requisition domain before removing its local workflow.
6. **Retire duplicate ledgers:** derive department/event balances from posted journal lines and remove localStorage ledgers only after migration and regression coverage.

## First concrete change — completed

The read-only finance service and workspace ledger migration are now implemented on `main`:

- The workspace reads `financial_documents` and optional `giving_records` through `financeLedgerService.ts`.
- Only receipt and payment documents are projected into the legacy presentation shape; transfers and adjustments are not misrepresented as income or expense.
- The projection preserves the database workflow status in the notes and only marks a record completed when its source document is posted.
- The `financial_records` loader and fabricated demo-ledger fallback have been removed from `FinanceOfficerWorkspace.tsx`.
- Income/expense entry controls are temporarily disabled; approval handlers no longer perform direct table updates; requisition/event disbursement cannot claim ledger persistence while the secure workflow is unavailable.
- Mapping tests cover giving associations, ordering, status mapping and exclusion of unsupported document types.

This is a read-only vertical slice. It intentionally does not invent a transaction-writing RPC contract or add direct table DML grants.

## Validation and non-goals

- Run the existing Bun application tests and Vite production build.
- Run the PostgreSQL 17 fresh-install/security workflow after any SQL change.
- Add regression tests proving authenticated users cannot directly mutate finance tables and that unauthorized/out-of-scope finance RPC operations fail.
- Build success is not browser/runtime verification.
- No live Supabase access, migration, deployment, authentication change or production data operation is part of FIN-INT-001.


## Canonical configuration integration — 2026-11-17

The isolated mock finance state now supports canonical setup through explicit RPC boundaries. The Accounting Setup tab configures currencies/base currency, chart of accounts, financial accounts, funds, financial years/periods and approval policies with amount bands and approver steps. Configuration is stored separately from legacy giving and financial-record state.

The mock validates configuration before persistence and applies the selected amount band when creating a receipt/payment approval workflow. Service, adapter and lifecycle tests cover configuration retrieval/persistence, invalid configuration rollback and uncovered amount bands.

Validation on commit `4268ffcffee0f5f93d3e4ff6dbf2a593a0690b7c`: Bun tests and Vite build passed in SCMS Build Validation run [44187912207](https://github.com/bock12/SCMS/actions/runs/44187912207).

**Remaining:** connect the receipt/payment forms to the canonical account, category, currency and fund selectors; submit through `financeTransactionService.ts`; display approval status and refresh the canonical ledger. Do not enable the existing legacy save handlers or disbursement flows. No live Supabase write, migration replay or deployment was performed.


## Receipt/payment entry and approval queue — 2026-11-18

The canonical receipt/payment entry form and Finance Officer workflow list are now connected on `main`.

Implemented:
- `FinanceTransactionEntryWorkspace.tsx` loads canonical currencies, financial accounts, chart categories and funds; submits receipts/payments only through `financeTransactionService.ts`.
- `FinanceDocumentWorkflowWorkspace.tsx` displays canonical mock financial documents, approval progress, linked-journal state and pending approval actions.
- `financeDocumentWorkflowService.ts` provides the typed document-list and approval-decision boundary.
- `mockFinanceRpc.ts` now implements `get_finance_documents`, returning only branch-visible documents and exposing an actionable approval step only to its assigned approver with `approve_finances`.
- The mock document stores its approval-request ID, and tests cover approval progress, assigned approver action and branch/auth visibility.
- The workflow list is mounted in the Finance Officer Ledger tab. Quick actions route to the canonical entry workspace.
- Legacy demo FinancialRecord save handlers and legacy disbursement persistence remain disabled.

Validation on commit `8c4723ac72ef3f0a5ca56cd9c69a0e50dae058d4`: Bun automated tests and Vite build passed in SCMS Build Validation run [44208093229](https://github.com/bock12/SCMS/actions/runs/44208093229).

**Important boundary:** `get_finance_documents` is currently implemented in the development mock RPC adapter only. The SQL/public API does not yet expose this listing RPC. No live Supabase migration replay, deployment or data writes have occurred. The older summary metrics and legacy requisition/event disbursement surfaces are not yet converted into posted-journal projections.


## Current integration status — 2026-11-18

The receipt/payment vertical slice is implemented on `main`:

- `public.create_financial_document_transaction(...)` creates the source document and balanced two-line draft journal atomically, then submits through the hardened approval policy.
- `public.decide_financial_document_approval(...)` delegates to the existing approval routine and links the pending journal only after final approval.
- The Finance Officer UI uses typed services and the mock finance RPC adapter; it does not create new `FinancialRecord` rows for receipt/payment entry.
- `public.get_finance_documents(uuid)` is now added by `20261118000100_get_finance_documents_read_api.sql`. It applies authentication, finance permission and exact branch-scope checks and returns document/approval progress without direct table DML grants.
- The PostgreSQL 17 workflow applies the finance creation and listing migrations and executes lifecycle and listing authorization fixtures.

Still outstanding:
1. Reconcile approval-model parity: SQL steps are permission-based and support `required_approvals`; the mock currently uses selected `approver_profile_ids` and sequential assigned steps.
2. Add database-backed finance configuration read/write APIs for currencies, chart accounts, financial accounts, funds, periods and approval policies. The Accounting Setup UI currently persists only to the development mock.
3. Migrate event budgets to `budgets`/`budget_lines` and approval routines; design a real requisition domain before retiring the local requisition workflow.
4. Replace department/event local ledgers and legacy summary/report calculations with projections from posted journal lines.

The legacy `financial_records` table remains absent from the PostgreSQL baseline. No direct finance-table DML grants were added. No live Supabase project was connected or changed; CI uses a disposable PostgreSQL 17 database. Build/test success does not establish browser/runtime behavior.


Validation for the database-backed listing increment on commit [585342bb](https://github.com/bock12/SCMS/commit/585342bb5856120142d051afe1b5e34348acb77b):
- [SCMS Build Validation #44274447184](https://github.com/bock12/SCMS/actions/runs/44274447184): passed — Bun tests and Vite production build.
- [PostgreSQL 17 fresh-install/security workflow #44274447182](https://github.com/bock12/SCMS/actions/runs/44274447182): passed — fresh baseline replay, finance migrations, grant/search_path checks, transaction lifecycle and listing authorization tests.

No browser/runtime verification or live Supabase operation was performed.


## Journal posting and posted-ledger projection — 2026-11-18

Implemented on `main`:

- Added `20261118000200_finance_journal_posting_and_ledger_api.sql`.
- `public.post_finance_journal_entry(uuid)` is a narrow authenticated SECURITY DEFINER wrapper with an empty search path. It checks the linked profile and `post_journals` scope, rejects pending/unlinked financial-document journals, verifies an approved document is linked to the exact journal, and delegates balance/account/period/year validation to `private.post_journal_entry(uuid)`.
- The public posting wrapper returns an already-posted result on safe retries without changing the immutable posted journal.
- `public.get_finance_journals(uuid)` returns branch-scoped journal entries and line details. It exposes posting actions only for eligible drafts and authorized actors.
- Account balances are grouped by account and base currency from `journal_entries.status = 'posted'` joined to `journal_lines`. Pending, rejected and approved-but-unposted journals are excluded.
- Added `financeJournalService.ts` and `FinanceJournalWorkspace.tsx`. The workspace distinguishes awaiting approval, rejected, approved-but-unposted and posted journals; it displays posted account balances and exposes a post action only when the API says the current actor can post.
- Replaced the old FinancialRecord-derived summary cards in the Finance Officer ledger view with the posted-journal account-balance projection.
- Extended `mockFinanceRpc.ts` with `get_finance_journals` and `post_finance_journal_entry`; mock posting checks authorization, approval linkage, balanced transaction/base totals, active accounts, branch consistency, exchange rate and open period/year.
- Extended mock lifecycle tests and the PostgreSQL lifecycle fixture for approval-gated posting, safe retries, pending-journal rejection and posted-only balances. CI now applies the migration and checks grants, SECURITY DEFINER/empty-search-path hardening and absence of direct journal-table DML grants.

**Boundary:** This remains an incremental finance integration. The legacy department/event spending chart and PDF/CSV exports still require migration to canonical posted journal projections. Finance configuration remains mock-only. No live Supabase migration, deployment or production data write was performed.


## Posted-journal reporting integration — 2026-11-18

Implemented on `main`:

- Added `financeReportService.ts` with a deterministic report projection built from journal entries and journal lines. It filters to `status = posted` before calculating any report totals.
- Reports aggregate income and expense account balances from base-currency journal line amounts. Revenue, expenses and net operating position are grouped separately by base currency; balances are not added across currencies.
- Added calendar period filters (all time, last seven days, current month, current quarter and current year).
- Added a canonical report panel to `FinanceJournalWorkspace.tsx` with posted-only CSV export, printable/PDF output, income/expense/net summaries and posted expense-account breakdown.
- Removed the old `FinancialRecord`-based CSV and PDF exports and removed the spending chart that combined historical records with approved/disbursed requisition and event-budget amounts.
- Legacy records remain visible as a clearly labelled informational view, but are excluded from official reports and posted ledger balances.
- Requisition and event-budget tabs now state that approval/disbursement workflow statuses do not themselves constitute posted accounting expenditure.

### Remaining source-linking boundary

Department requisitions and event budgets do not yet carry a canonical financial-document/journal relationship. The current disbursement handler deliberately fails closed because `persistDisbursementRecord` is disabled pending canonical payment workflow integration. Consequently, posted journal balances can be reported by chart-of-accounts expense category, but they cannot yet be reliably attributed to a specific requisition, department or event. Do not infer department/event actual expenditure from approved budgets, disbursed workflow flags or legacy records.

Next coherent integration: add explicit source linkage from a requisition/event budget to a canonical payment document and its journal; only after approval/posting should the actual expense appear in the department/event actuals report.
