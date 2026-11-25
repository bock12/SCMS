# FIN-INT-004 — Internal Financial Transfers

**Status:** Design baseline / implementation map  
**Repository:** `bock12/SCMS`  
**Target branch:** `main`  
**Reviewed checkpoint:** `0da8cfe651513abfce94629c4ac07fe48d1c3c3a`  
**Date:** 2026-11-25

## Objective

Add an auditable internal transfer workflow for moving church-owned funds between financial accounts. The first release must support both transfers between accounts belonging to the same branch and transfers between two different branches.

This is a distinct workflow. It must not be represented as a receipt plus a payment, because that would incorrectly inflate income and expenditure and would not provide one atomic transfer lifecycle.

## Current implementation findings

- `financial_accounts` identifies a chart-of-accounts asset account, currency, active state and branch ownership. Later migrations add district ownership.
- `financial_documents` permits the values `receipt`, `payment`, `transfer` and `adjustment`, but its current shape has only one `financial_account_id`.
- The secure transaction-creation RPC accepts only receipt and payment. Its idempotent, scope-aware version retains the same receipt/payment model.
- The canonical finance document listing filters to receipts and payments.
- Approval request transaction types currently cover financial documents, journal entries, budgets and requisitions. Approval decision and journal-attachment logic is specialized for financial documents.
- Journal entries have one header scope, while journal lines carry their own branch dimension. Existing branch-scoped posting and ledger APIs must be reviewed before relying on a cross-branch, multi-branch journal.
- The current journal posting API posts one journal entry per call. Two independent calls would not guarantee an atomic inter-branch transfer.
- The mock finance adapter mirrors the current receipt/payment lifecycle and must be extended in parallel with PostgreSQL.

## Accounting behavior

### Same-branch transfer

For a transfer from Account A to Account B within one branch, create one balanced journal:

- Debit the destination financial account's asset chart account.
- Credit the source financial account's asset chart account.

This is a balance-sheet movement. It must not create income, expense or fund contribution activity.

### Cross-branch transfer

For a transfer from Branch A to Branch B, create two balanced, linked branch journals:

**Branch A (sending branch)**
- Debit the configured inter-branch receivable / due-from account.
- Credit the source financial account's asset chart account.

**Branch B (receiving branch)**
- Debit the destination financial account's asset chart account.
- Credit the configured inter-branch payable / due-to account.

The reciprocal clearing balances must be equal in the church-wide consolidated view. Each branch ledger must show its own cash/bank movement and its corresponding inter-branch balance. The transfer must never be partially posted: both branch journals and the transfer's posted status change in one database transaction.

The first release should require the source and destination accounts to use the same transaction currency. Cross-currency transfers require an explicit FX gain/loss and rate policy and are out of scope until that accounting behavior is designed.

## Proposed canonical model

Introduce a dedicated `financial_transfers` record rather than overloading `financial_documents`. It should contain:

- stable UUID and generated transfer number;
- transaction date, amount, currency, exchange rate to church base currency and base currency;
- source and destination financial-account IDs;
- source and destination branch IDs (and derived district IDs where applicable);
- external reference and description;
- status and creator/timestamps;
- approval linkage for the sending and receiving branch;
- journal linkage for the sending and receiving branch;
- idempotency key and request fingerprint.

For a same-branch transfer, only one branch approval chain and one journal are required. For a cross-branch transfer, each branch must approve its side under its own applicable `financial_transfer` approval policy; both approvals are required before posting. A rejection by either branch rejects the transfer and leaves all journals unposted.

Add explicit branch clearing-account configuration for cross-branch transfers. The sending branch must have an active asset-type due-from chart account and the receiving branch an active liability-type due-to chart account. Do not silently select arbitrary chart accounts or auto-create accounts.

## Authorization and invariants

The database RPCs, not the UI, must enforce all of the following:

1. Authenticated active profile and explicit finance permission for the source branch and destination branch.
2. The actor must be authorized for both branches to submit a cross-branch transfer.
3. Both financial accounts exist, are active, belong to the selected branches, and use the same currency.
4. Source and destination account IDs differ; source and destination branch IDs differ for inter-branch transfers.
5. Amount and exchange rate are positive; base-currency transfers use rate 1.
6. Transaction date falls within an open financial year and period.
7. The applicable approval policy and amount band exist for every branch requiring approval. Missing policy coverage fails closed.
8. Approval steps retain the existing distinct-approver and submitter restrictions.
9. Neither journal can be posted independently through the ordinary single-journal endpoint while it belongs to an unposted transfer.
10. Posting both linked journals and marking the transfer posted is atomic and idempotent.
11. Rejected, pending, or partially approved transfers cannot affect posted ledger balances.
12. All state changes preserve auditability and cannot be edited after posting.

## Implementation sequence

1. **Database design and security:** migration for transfer and branch clearing configuration; transfer approval lifecycle; scoped read API; transfer-specific atomic posting RPC; grants and RLS/private routine boundaries.
2. **Database tests:** same-branch, cross-branch, approval/rejection, branch-scope authorization, invalid accounts/currencies/periods, idempotent retry, and all-or-nothing posting.
3. **Mock parity and services:** typed transfer service and mock RPC behavior matching the SQL contract, with deterministic fixtures and rollback-on-error behavior.
4. **UI:** dedicated Internal Transfer workspace with source/destination branch and account selectors, review of both branch sides, status/approval progress, and clear posting state.
5. **Browser acceptance:** same-branch and cross-branch scenarios, including attempts by an actor authorized for only one branch and checks that ledger balances change only after atomic posting.
6. **Validation:** full Bun tests, Vite build, PostgreSQL 17 fresh-install/security workflow, and finance browser validation.

## Explicit non-goals for this release

- Cross-currency transfers and FX gain/loss recognition.
- Transfers to or from external parties.
- Fund-to-fund reclassification.
- Inter-branch allocation or expense sharing.
- Automatic creation of chart accounts or silent fallback clearing accounts.
- Live Supabase migration replay, production data writes or deployment without separate explicit authorization.

## Important compatibility note

The existing receipt/payment creation, approval, journal posting and ledger workflows must remain unchanged. Transfer support is additive and must use dedicated RPC boundaries and tests. The application remains in its current mock-auth development mode; database authorization is still the canonical future production boundary.
