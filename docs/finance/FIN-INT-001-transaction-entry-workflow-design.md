# FIN-INT-001 — Secure transaction-entry workflow design

**Status:** Design checkpoint; not a deployable migration.

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

## Proposed transaction creation boundary

Add one narrowly granted SECURITY DEFINER RPC in the private schema, with an empty search path. It should create the document and its two-line balanced draft journal in one database transaction, then submit the document through the existing approval routine.

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
