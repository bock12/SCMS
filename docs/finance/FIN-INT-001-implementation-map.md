# FIN-INT-001 — Finance integration implementation map

**Reviewed:** 2026-11-17  
**Repository:** `bock12/SCMS`  
**Branch:** `main`  
**Reviewed head:** `dd6532f881f68c03aed9c9781847cbf77240a85e`

## Executive finding

The Finance Officer Workspace is not yet integrated with the database-backed accounting model. It still treats the legacy `financial_records` table as its ledger, while the PostgreSQL baseline intentionally does not define that table. The UI silently substitutes in-memory demo records when reads or writes fail. This makes a successful-looking development interaction materially different from a persisted, authorized accounting transaction.

Do not solve this by adding `financial_records` to the baseline or granting broad table DML. The baseline already contains the intended accounting and approval domain.

## Current application map

| Area | Current implementation | Integration gap |
|---|---|---|
| Finance Officer Workspace | `FinanceOfficerWorkspace.tsx`; loads `financial_records`, creates income/expense rows and updates status directly | Legacy schema; direct writes are not permitted by the real baseline; failed inserts are presented as successful local records |
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

`supabaseClient.ts` implements a local mock query builder and has special-case RPC simulation for role assignment. It does not currently simulate the finance routines above. Do not interpret local mock CRUD success or a local fallback record as database authorization or a persisted accounting event. A finance mock adapter must be explicit, deterministic, testable and clearly separated from production RPC semantics.

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
