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


## Slice 3 progress — explicit event finance identity

The local event model now carries an optional `finance_event_id` UUID bridge. Existing friendly IDs such as `evt-1` remain unchanged for event registrations, recurrence and other UI relationships. During local mock database initialization, existing events receive a stable UUID bridge once; new mock event inserts receive one as well. If an event's own ID is already a UUID, that UUID is reused.

The helper in `eventFinanceIdentity.ts` accepts only a UUID event identity or an explicit UUID bridge. It deliberately rejects friendly IDs and malformed values rather than casting them to UUIDs. This is a local mock identity bridge only; a live database integration must resolve the actual persisted `public.events.id`, not reuse a browser-generated UUID as if it existed in Supabase.

Validation added for direct UUID IDs, explicit bridge resolution, and rejection of friendly IDs without a bridge. This slice does not yet enable event-budget submission, approval or payment in the UI.
## Slice 3 progress — deterministic event-budget mock RPC adapter

The browser mock now exposes the event-budget lifecycle through the same canonical finance RPC boundary as the database implementation:

- `submit_event_budget_for_approval` validates the authenticated profile, branch `manage_finances` permission, open financial period/year, supported currency and base exchange rate, active expense accounts/funds, positive budget total, active budget approval policy, threshold band and configured approvers. It persists a mock budget, budget lines, approval request and ordered approval steps together.
- `decide_event_budget_approval` enforces assigned approver identity, branch permission, configured submitter prohibition, ordered approval steps, required approvals, and approved/rejected source status.
- `create_event_budget_payment` requires the persisted approved budget and approval request, checks the source amount/currency/rate/account/fund, rejects duplicates, and creates the canonical payment document, draft journal and source link in one mock-state save.
- `get_event_budgets` reports source budget lines and linked payment. Event actuals are derived only from expense debits on the linked journal after it is posted; pending or approved-but-unposted payments remain zero actual.
- Mock finance state now stores events, event budgets and budget lines in the isolated finance store. Older `scms_mock_finance_v2` stores are normalized with empty arrays for the new collections.
- The mock adapter resolves local event rows through their explicit `finance_event_id` UUID bridge. These local rows are not evidence that a corresponding row exists in live Supabase.
- Typed service methods are available in `eventBudgetFinanceService.ts` for submission, approval decisions, canonical payment creation and listing.

Validation coverage is added in `eventBudgetMockRpc.test.ts` for submission, branch restrictions, missing approval policy, rejection, payment eligibility, duplicate prevention, currency/account/fund mismatches, persistence, and posted-only actuals.

**UI boundary:** Event budget screens still use the legacy localStorage workflow and have not yet been connected to these RPCs. Legacy seeded approvals remain informational and are not imported as approved database/mock finance budgets. The existing disbursement path remains fail-closed. The next UI slice must explicitly map local event IDs to the UUID bridge and must not mark a budget paid merely because a payment document was created or approved.

**Configuration boundary:** The mock adapter supports a separate `budget` approval policy when that policy and its bands/steps are present in finance configuration. The current Accounting Setup UI still needs a dedicated budget-policy configuration path before ordinary users can configure this workflow through the UI.
## Slice 3 progress — budget policy and Finance Officer UI

- Accounting Setup now lets authorized finance administrators create distinct approval policies for receipts/payments and event budgets. Both policy types share the existing threshold-band and ordered-approver configuration model; the database routine remains the authority for permission checks.
- The Finance Officer event-budget tab now includes a canonical workflow workspace. It can submit a budget against a saved event identity, an open financial period, supported currency, active expense account and optional fund. Submission goes through `submit_event_budget_for_approval`; it does not mark a legacy localStorage proposal as approved.
- Canonical budgets list their approval steps and only show approval/rejection actions to the profile assigned to a pending step. Decisions call `decide_event_budget_approval` and are validated again by the RPC.
- An approved canonical event budget can create one linked payment through `create_event_budget_payment`. The UI requires a matching currency financial account and an approved budget line. The resulting payment enters its own finance-document approval workflow; event actuals remain zero until its journal is posted.
- The legacy localStorage event proposal list is explicitly informational. Its old approve/reject buttons no longer mutate approval status, and its disbursement handler now fails closed instead of inserting a legacy `FinancialRecord` as an expense.

**Remaining boundary:** Event Manager's original budget submission form still writes legacy localStorage proposals. Those records are not automatically imported, approved, or converted. Finance Officers can submit a new canonical budget from the canonical workspace by selecting a saved event. A future pass should move the Event Manager submission form to this same service and remove the duplicate legacy submission path. The canonical budget listing RPC is currently implemented by the mock adapter; a database listing RPC and full live Supabase parity are still required before production use.

**Validation:** SCMS Build Validation run 44513693652 completed successfully for commit `f85d993b405b2fa0346105cc5dea079dc01b399b`; automated tests and application build passed. No live Supabase migration or database write was performed.


## Slice 4 progress — Event Manager submission UI

- The Event Manager's event workspace now embeds the shared canonical event-budget workflow with the current event preselected. It resolves the event through the existing UUID identity bridge and submits through `submit_event_budget_for_approval`; the Event Manager no longer creates a new localStorage approval record through the Proforma Invoice submit action.
- The canonical submission form requires an open financial period, configured currency and exchange rate, an active expense account, and an optional active fund. It creates the canonical budget, approval request and ordered approval steps through the existing service/RPC path.
- The event-scoped workspace is submission-only: it does not expose Finance Officer approval or payment actions. The legacy localStorage proposal banner is labelled read-only; existing records are retained and are not imported, approved or treated as canonical budgets.
- The existing Proforma Invoice builder remains available for print/reference, but its legacy submit handler now fails closed and directs users to the canonical workflow.
- The signed-in profile ID is passed from the Events admin page into the event workspace so the shared workflow can identify the actor.

**Permission and live-schema boundary:** The current database/mock submit RPC requires branch `manage_finances`, while Event Managers may only have `manage_events`. The current listing/configuration calls also use finance-scoped access. Therefore this UI integration is usable only for profiles that already have the required finance permissions; it does not yet grant ordinary Event Managers a narrowly scoped submission-only permission or configuration read. A follow-up security slice must add a least-privilege event-budget submission configuration/listing path and permit authorized event managers to submit without granting broad finance access. The canonical event-budget listing remains mock-only; full live Supabase parity is not complete.

**Validation:** SCMS Build Validation run 44529182175 completed successfully for commit `5602f6641277f03b0f6ddab26863e3df012b7e7a`; automated tests and application build passed. No browser/runtime test was performed. No live Supabase migration, deployment or database write was performed.

**Next:** add least-privilege Event Manager authorization and read APIs, then proceed to department requisition database/payment integration.
