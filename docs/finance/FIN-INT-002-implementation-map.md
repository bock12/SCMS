# FIN-INT-002 — Department and Event Payment Integration

**Reviewed:** 2026-11-19  
**Repository:** `bock12/SCMS`  
**Branch:** `main`  
**Reviewed head:** `6a745e89f318970b540514de5bf65e6b7eec359e`

## Objective

Connect approved department requisitions and event budgets to the canonical finance workflow. A source workflow status is not an accounting transaction. A source's actual expenditure must be derived only from its linked canonical payment journal after that journal is posted.

This task does not authorize live Supabase access, migration replay, deployment, or production data writes. SQL changes must be validated through the disposable PostgreSQL CI workflow.

## Current application findings

| Area | Current implementation | Integration gap |
|---|---|---|
| Department requisitions | `requisitionService.ts`; seeded records and localStorage under `faithconnect_department_requisitions_v2` | No requisition domain table was found in the current database baseline. IDs are application strings (for example `req-7`), not durable database UUIDs. |
| Event budget approvals | `eventBudgetService.ts`; localStorage under `faithconnect_event_budget_approvals_v1` | Database has `budgets` and `budget_lines`, but this UI/service does not use them. Existing `event_id` is an application string in the client model; database `budgets.event_id` is a UUID FK to `events`. |
| Requisition disbursement | `FinanceOfficerWorkspace.tsx` builds a legacy `FinancialRecord` and calls `persistDisbursementRecord` | The persistence function intentionally throws. The handler must not mark a requisition disbursed or claim ledger persistence. |
| Event budget disbursement | Same workspace builds a legacy `FinancialRecord`, then calls `disburseEventBudget` | The persistence function intentionally throws before the local event budget is marked disbursed. |
| Canonical payments | `financeTransactionService.ts` calls `create_financial_document_transaction` | Supports payment creation, balanced draft journal creation, and finance approval; it has no source-record parameters yet. |
| Canonical posting | `financeJournalService.ts` and `20261118000200_finance_journal_posting_and_ledger_api.sql` | Posting is separate from approval. Only posted journal lines count as actual expenditure. |

## Relevant database model

The existing baseline defines:

- `public.budgets`: UUID primary key, `budget_type` including `event` and `department`, optional `event_id` FK, branch, financial period, currency and approval status.
- `public.budget_lines`: UUID primary key, budget FK, optional chart account and fund, description and allocated amount.
- `public.financial_documents`: canonical receipt/payment/transfer/adjustment document, amount/currency, party, financial account, workflow status and optional journal link.
- `public.journal_entries` and `public.journal_lines`: canonical double-entry accounting records; posting is controlled separately.
- Existing approval policies, approval requests, request steps and decision routines.

Finance tables use narrow RPC boundaries and do not grant client-side table INSERT/UPDATE/DELETE. New source-linking work must preserve that model.

## Required source-linking design

A canonical payment must have an explicit, durable source relationship. Do not infer the relationship from free-text descriptions, transaction references, localStorage IDs, department names or event titles.

The preferred database contract is a constrained source relationship on the canonical financial document (or a dedicated relation table if the resulting constraints are clearer):

- One payment can be linked to at most one source.
- A source can have at most one active canonical payment, enforced by a database unique constraint/index.
- Event budget links must reference a durable `public.budgets.id` whose `budget_type = 'event'` and whose status is approved.
- Department requisition links require a new durable requisition domain record and line-item representation before they can be supported. Existing localStorage requisition IDs must not be cast to UUIDs or treated as authoritative database identifiers.
- Source and payment must have the same branch and currency. Amount must not exceed the approved source amount unless a separately approved variation model is introduced.
- Only `payment` documents may carry these source links.
- The source link is created atomically with the canonical payment and draft journal. If payment creation or approval submission fails, the source link, document and journal must all roll back.
- Approval of the payment does not mark the source as disbursed and does not count as actual expenditure. A source can be shown as paid only after the payment document is approved and its journal is posted.
- Retry behavior must be idempotent. Repeating a payment request for an already-linked source must return a safe conflict/already-linked result and must not create a second document or journal.

The payment creation RPC must verify the source's persisted approval state and permissions itself. Client-side checks against localStorage are not an authorization boundary.

## Implementation sequence

### Slice 1 — contract and safety boundary (this change)

- Record current service, database and UI boundaries.
- Keep legacy disbursement handlers fail-closed.
- Establish the durable source relationship and idempotency requirements before enabling source payments.

### Slice 2 — event-budget database integration

- Add a typed event-budget service over `budgets` and `budget_lines`.
- Use the existing budget approval workflow where compatible; inspect and test the exact approval state transition before wiring it to the UI.
- Resolve event IDs against persisted `events.id` UUIDs.
- Add source-linked canonical payment creation and database-level duplicate prevention for approved event budgets.
- Update event budget status only after canonical payment creation succeeds; expose posted actuals only after journal posting.
- Keep the current localStorage event budget records informational during transition; do not silently import seeded demo approvals as real approved budgets.

### Slice 3 — department requisition persistence

- Design a real requisition table and requisition-line table with UUID IDs, branch, applicant profile, amount, currency, item lines, approval state and audit timestamps.
- Migrate the approval workflow into database-controlled, permission-checked transitions.
- Do not migrate legacy seeded/localStorage disbursement and reconciliation claims as actual payments.
- Add source-linked canonical payment creation with the same idempotency, branch, currency and approved-amount checks.

### Slice 4 — source actuals and reporting

- Add source-specific reports joining source records to their linked financial document and journal.
- Count actuals only from journal lines whose journal entry is `posted`.
- Keep requested/approved budgets, payment approval amounts and posted actuals as distinct measures.
- Report by source, department/event, chart account, fund, branch and currency without combining unlike currencies.
- Retire localStorage disbursement ledger behavior only after tests and UI migration are complete.

## Acceptance tests

- Unauthorized actor and wrong-branch source cannot create a payment.
- Missing, rejected, draft or otherwise unapproved source cannot create a payment.
- Event source must resolve to an approved event budget; requisition source must resolve to an approved persisted requisition.
- Source and payment branch/currency must match; payment amount must be positive and within approved amount.
- Duplicate source payment is prevented under concurrent/retried requests.
- Payment creation and source linking are atomic with the balanced draft journal and approval request.
- Approval and rejection preserve correct document/source states.
- Approved-but-unposted journals do not contribute to source actuals.
- Posted journal contributes once to the correct source actuals and currency.
- Legacy localStorage demo records and `FinancialRecord` data are excluded from official actuals.
- Existing finance direct-table-DML restrictions and RPC grants remain intact.

## Validation boundary

Run Bun tests, Vite production build and the PostgreSQL 17 fresh-install/security workflow after implementation. Build/test success is not browser/runtime verification. No live Supabase migration replay, deployment or production data operation is included.


## Slice 2 progress — event budget database workflow

Migration `supabase/migrations/20261119000100_add_event_budget_approval_and_payment_rpc.sql` now establishes the first database-controlled event-budget path:

- Adds `financial_documents.source_budget_id` with a restrictive FK to `budgets.id`.
- Restricts source-linked documents to payment documents and enforces one canonical payment per event budget with a partial unique index.
- Adds `submit_event_budget_for_approval`: verifies authenticated profile and branch `manage_finances`, persisted event, open financial period/year, valid currency/base rate, active expense accounts/funds, non-zero budget total, active `budget` approval policy and matching threshold band. It creates the budget, lines, approval request and ordered approval steps atomically.
- Adds `decide_event_budget_approval`: accepts only a submitted event-budget approval request and delegates the decision to the existing ordered approval engine, which persists approved/rejected state.
- Adds `create_event_budget_payment`: locks the approved event budget, checks branch permission, persisted approval state, approved amount, currency/rate and budget-line account/fund match; then calls the existing canonical payment RPC and links the resulting document to the budget in the same transaction.
- The existing financial-document approval and journal posting lifecycle remains unchanged. The event budget stays approved while its payment awaits approval; actual expenditure remains zero until the linked journal is posted.
- No direct authenticated DML grants are introduced. New public RPCs use SECURITY DEFINER with an empty search_path and narrowly scoped authenticated grants.

The PostgreSQL 17 workflow now applies the migration and checks function grants, function hardening, and absence of direct table DML. `supabase/tests/event_budget_payment_integration.sql` exercises event budget submission, separate approval, canonical payment linkage, duplicate prevention, unapproved-budget rejection, exclusion of approved-but-unposted amounts from actuals, and inclusion after controlled posting.

**Important UI boundary:** this slice adds and tests the database RPC contract only. `eventBudgetService.ts` and the Finance Officer event-budget screens still use the legacy localStorage model. They are not yet connected to these RPCs, and their historical seeded records are not automatically imported. Keep the old UI disbursement path fail-closed until the mock adapter, service and UI are migrated to the same source-linked workflow.

**Requisition boundary:** department requisitions still have no durable requisition domain tables. They remain out of scope for this event-budget database slice.


### Slice 2 validation result

The disposable PostgreSQL 17 fresh-install workflow passed after isolating the event-budget fixture UUIDs from the existing finance-document listing fixture and running the event-budget integration test after the listing test:

- Commit under test: `1d42ffffd8aafcb67f30ebde9e0f446b998e882c`
- PostgreSQL 17 fresh-install/security workflow: [run 44500256248](https://github.com/bock12/SCMS/actions/runs/44500256248) — success.
- SCMS Build Validation: [run 44500254952](https://github.com/bock12/SCMS/actions/runs/44500254952) — success.

The successful SQL test verifies the complete event-budget submit → approve → canonical payment → controlled journal posting path. The UI and mock adapter are still not wired to these RPCs; no claim of end-to-end browser workflow is made.
