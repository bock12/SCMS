# FIN-INT-001 — Secure transaction-entry workflow design

**Status:** Database RPC first slice implemented on `main`; mock adapter, behavior-level PostgreSQL tests and UI integration remain pending. Not deployed to live Supabase.

## Scope

Replace the Finance Officer Workspace's disabled income/expense actions with a database-owned transaction workflow. Preserve the existing mock client during development. Do not add direct authenticated INSERT/UPDATE/DELETE grants to finance tables.

The first supported transaction types are **receipt** and **payment**. Transfers, adjustments, giving-specific capture, gateway payments, budgets and requisitions remain separate follow-up slices.

## Confirmed database contract

The canonical finance schema stores transactions in `financial_documents`, journals in `journal_entries` and `journal_lines`, and approval state in `approval_requests` / `approval_request_steps`.

The hardened workflow requires an active, applicable approval policy and a matching amount band. Missing policy/band is an error; it must not silently approve a transaction. A band with zero approval steps can produce immediate approval.

The existing sequence is:
1. `submit_financial_document_for_approval(document_id)` accepts a draft or rejected, unlinked document and creates an approval request or immediately approves it.
2. `record_approval_decision(step_id, decision, comments)` advances or rejects the request and updates the document.
3. `attach_journal_to_financial_document(document_id, journal_id)` accepts only an approved document and a draft journal with matching branch/currency/rate.
4. `post_journal_entry(journal_id)` enforces open periods, active accounts, branch consistency, balanced transaction/base amounts and approved document linkage.

## RPC exposure and approval-completion boundary

The application uses the Supabase client RPC surface. The `private` schema is an internal implementation boundary and must not be made publicly exposed merely to let the browser call its functions. The browser should call only narrow `public` API wrappers:

- `public.create_financial_document_transaction(...)` — authenticated, SECURITY DEFINER, empty search path, explicit `auth.uid()` / linked-profile / `manage_finances` branch-scope checks; creates document and journal atomically, then submits through the private approval routine.
- `public.decide_financial_document_approval(...)` — authenticated, SECURITY DEFINER, empty search path; delegates the decision to `private.record_approval_decision`. When the decision completes approval, it verifies the pending journal marker and attaches that exact journal to the approved document before returning.
- The approval-completion wrapper must not require the approver to have `manage_finances` merely to perform the mechanical journal attachment. The attachment authorization boundary needs a deliberate, narrow rule for an actor who has `approve_finances` at the document scope, while preserving the existing requirement for the source document to be approved and the journal to be a matching draft. Do not weaken this by granting table writes.

Both wrappers must revoke EXECUTE from PUBLIC and anon and grant only authenticated. Private helper routines remain non-exposed and retain their own explicit grants/revokes. The mock client must implement these public RPC names explicitly and mirror their authorization and lifecycle behavior. No UI transaction action is enabled until database tests and mock adapter tests cover both immediate and multi-step approval paths.

## Proposed transaction creation boundary

Expose a narrowly granted SECURITY DEFINER API function in the `public` schema, with an empty search path, because ordinary Supabase Data API RPC calls do not expose the `private` schema by default. Keep implementation helpers and existing workflow routines in `private`; the public function is only a narrow authenticated entry point. Revoke EXECUTE from PUBLIC and anon, then grant it only to authenticated. The wrapper must explicitly validate `auth.uid()`, linked profile, permission and branch scope before invoking private routines. Do not expose the private schema or add direct table DML grants.

The public entry point should create the document and its two-line balanced draft journal in one database transaction, then submit the document through the existing private approval routine. A second narrow public approval-decision entry point should call the existing private decision routine and, when the final decision approves the document, attach the exact pending journal in the same transaction.

The RPC must:
- Require `auth.uid()`, a linked current profile and `manage_finances` at the requested branch scope.
- Accept only `receipt` or `payment`, positive amount, valid currency, nonblank counterparty and description, and an allowed payment method.
- Validate active currency, church base currency, exchange rate, financial account currency/branch, active asset account, active income/expense category account, optional active fund, and an open financial period/year for the transaction date.
- Reject inactive or control accounts for the category side.
- Use the financial account's linked chart account as the cash/bank/mobile-money side.
- Create two equal transaction-currency lines and equal base-currency lines using the recorded exchange rate.
- Assign the optional fund to the income/expense category line, not the cash/bank line.
- Keep the journal unlinked while approval is pending. Never set `financial_documents.journal_entry_id` before approval.

### Pending journal lifecycle

Because the document's public journal link must remain null until approval, the creation RPC should mark the draft journal with an internal pending source marker (for example, `source_type = 'financial_document_pending'`, `source_id = document.id`). This marker must not satisfy the existing posting routine's `financial_document` linkage check.

When approval completes:
- On immediate approval, attach the journal within the creation RPC.
- On later approval, call the existing attach routine from a narrow orchestration RPC that verifies the document is approved and that the pending journal marker points back to that exact document.
- On rejection, retain the unlinked draft for auditability but make it non-postable. A dedicated cleanup/cancellation operation may be added later; it must only act on a pending-marker journal for a rejected document and must remove its draft lines and entry atomically. Do not delete or mutate posted journals.

## Journal line convention

For a receipt:
- Debit the financial account's asset chart account.
- Credit the selected income chart account.

For a payment:
- Debit the selected expense chart account.
- Credit the financial account's asset chart account.

For both lines, set branch to the document branch. Set transaction amount on one side only and compute the matching base amount with the same exchange rate and four-decimal rounding used by the posting validator.

## Required regression coverage before enabling UI writes

- Unauthenticated call rejected.
- Missing profile rejected.
- Missing `manage_finances` permission and wrong branch scope rejected.
- Invalid type, amount, date, currency, rate, account, category, fund and payment method rejected.
- Closed/missing financial period or year rejected.
- Missing approval policy/band rejected with no partial document/journal rows.
- Receipt and payment produce the correct debit/credit orientation and balanced base amounts.
- Pending approval leaves `journal_entry_id` null and journal unpostable.
- Immediate approval links the journal only after approval.
- Final approval permits linking; rejection does not.
- Direct authenticated DML on protected finance tables remains denied.
- Existing posting and reversal rules remain unchanged.

## Client integration boundary

The Finance Officer Workspace should call the new RPC and display the returned document, journal and approval identifiers/status. It should refresh the canonical ledger after successful creation. It must not write finance tables directly or infer approval from a successful create response.

The mock client needs an explicit finance-RPC adapter and deterministic test fixtures before these actions are enabled in the mock UI. Until both the database migration and mock adapter are implemented and tested, transaction-entry controls remain disabled.

## Pending-journal posting guard

The generated inactive fresh-install baseline now includes a defensive trigger on `journal_entries`: a draft whose `source_type` is `financial_document_pending` cannot transition to `posted`. The trigger function is not executable by application roles. This is a baseline-only safety patch; it does not alter the immutable recovered migration archive and is not a live Supabase migration.

Before any production deployment, the same guard must be represented as a reviewed forward migration and tested against the target schema. The eventual transaction-creation RPC will set the pending marker only after creating the draft journal. A separate approval-completion operation must verify the marker and source document before calling the existing attachment routine.


## Implementation checkpoint — 2026-11-17

The first database implementation is committed in
`supabase/migrations/20261117000500_create_secure_financial_document_transactions.sql`.

Implemented:
- `public.create_financial_document_transaction(...)` creates a receipt/payment document and its two-line balanced draft journal in one transaction.
- It validates the authenticated linked profile, `manage_finances` branch permission, account/category types and active state, optional fund, currency/rate and open financial period/year.
- It submits through `private.submit_financial_document_for_approval`; missing policy/band errors roll back the document and journal.
- Immediate approval attaches the exact pending journal. Multi-step approval uses `public.decide_financial_document_approval(...)` and attaches only after the existing approval routine returns approved.
- A private attachment helper permits the approval orchestration to link the journal without requiring the approver to also hold `manage_finances`; it is not executable by client roles.
- The pending-journal posting guard is now represented in the forward migration as well as the generated fresh-install baseline.

Validation on commit `75b0c1e1a888ba2955177841e54f2550d819eb62`:
- PostgreSQL 17 fresh-install replay and finance RPC grant/direct-DML security smoke checks: passed.
- SCMS Build Validation: passed.

Important limitation: the current PostgreSQL workflow verifies migration replay, function grants, private-helper isolation and absence of direct finance-table DML grants. It does not yet exercise receipt/payment creation, branch-denial, approval/rejection, balanced journal contents or rollback behavior with fixtures. Those behavior-level tests are required before the UI can be enabled.

Remaining before enabling transaction entry:
1. Add a deterministic mock-client adapter for both public RPC names and tests for authorization, balances, approval/rejection and immediate/multi-step paths.
2. Add behavior-level PostgreSQL fixtures and regression tests for the same lifecycle, including missing policy/band rollback and out-of-scope access.
3. Add a typed finance transaction service and connect the existing receipt/payment forms only after both test layers pass.
4. Keep all transaction-entry buttons disabled until those steps are complete.

## Client service checkpoint — 2026-11-17

Added `financeTransactionService.ts` as a typed boundary for the two public finance RPCs. It normalizes optional values and text fields, maps the UI-facing input to the exact SQL parameter names, and returns database errors without fabricating success. The service does not write finance data to localStorage or attempt to emulate accounting logic.

Added `financeTransactionService.test.ts` covering receipt payload mapping, payment payload mapping with optional member/fund and exchange rate, propagation of permission errors, and approval-decision payload mapping.

Validation on commit `36fa89abd9aca4fbd53d0d499fe73e022d081349`:
- Bun automated tests: passed.
- SCMS Build Validation: passed.

The mock `supabaseClient.rpc` intentionally still returns a not-implemented error for these two finance RPCs. This is fail-closed: no simulated receipt/payment is persisted and the UI remains disabled. The next safe slice is to implement and test a deterministic mock finance adapter against explicit fixture data, then add PostgreSQL lifecycle fixtures before wiring forms.
