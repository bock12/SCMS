# FIN-INT-001 — Secure transaction-entry workflow design

**Status:** Secure receipt/payment creation, approval, document listing, controlled journal posting, posted-ledger projection, PostgreSQL lifecycle tests, deterministic mock finance adapter and development accounting setup UI are implemented on `main`. Not deployed to live Supabase.

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
- The approval-completion wrapper does not require the approver to have `manage_finances` merely to perform the mechanical journal attachment. It delegates authorization to the approval workflow, then attaches only the matching pending draft journal after the document is approved. The helper is private and is not executable by client roles. Do not weaken this by granting table writes.

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

The generated inactive fresh-install baseline now includes a defensive trigger on `journal_entries`: a draft whose `source_type` is `financial_document_pending` cannot transition to `posted`. The trigger function is not executable by application roles. The forward migration `20261117000500_create_secure_financial_document_transactions.sql` also installs this guard for migration-based deployments. Neither the baseline nor the forward migration has been deployed to live Supabase.

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

The PostgreSQL workflow now applies the canonical fresh-install baseline and finance migration, verifies RPC grants and direct-table security boundaries, and executes behavior-level lifecycle fixtures. The fixtures cover missing-policy and missing-band rollback, branch-scope denial, receipt/payment journal orientation and balance, multi-step approval, final journal attachment, rejection, and prevention of posting an unapproved pending journal.

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


## PostgreSQL lifecycle test checkpoint — 2026-11-17

Added `supabase/tests/finance_transaction_lifecycle.sql` and wired the PostgreSQL 17 workflow to run it whenever SQL test fixtures change.

The fixture verifies:
- Missing approval policy and missing amount-band failures leave no partial financial document.
- A branch-scoped finance actor cannot create a transaction in another branch.
- Receipt and payment journal lines have the correct debit/credit account orientation and balance in transaction and base currency.
- A first approval in a two-step policy leaves the document pending and journal unlinked.
- Final approval changes the document to approved and links the exact pending journal.
- Rejection changes the document to rejected and leaves the journal unlinked with its pending marker.
- An unapproved pending journal cannot be posted.

The first fixture run found that it attempted to create a second active main branch. The fixture was corrected to reuse the existing CI main branch; the database's one-main-branch constraint was preserved.

Validation on commit `fc8fff29287791e1477f0340a155a37dd7af35b8`:
- PostgreSQL 17 fresh-install, security and transaction lifecycle workflow: passed.
- SCMS Build Validation: passed.

The CI workflow path filter now includes `supabase/tests/**`, so future fixture-only changes trigger the PostgreSQL job.


## Canonical mock finance configuration checkpoint — 2026-11-17

The development mock now exposes two additional RPC operations:
- `get_finance_configuration` reads the canonical configuration from the isolated finance store.
- `save_finance_configuration` validates and persists currencies/base currency, chart accounts, financial accounts, funds, financial years/periods, approval policies, amount bands and approval steps.

The mock client resolves the finance configuration permission keys from active role assignments. Configuration writes require the current actor's scoped `manage_finances` permission; reads require an active finance permission. Configuration is stored separately from legacy `GivingConfig` and `FinancialRecord` data. The mock storage namespace was versioned for the expanded canonical state.

The mock transaction workflow now evaluates configured approval amount bands against the transaction's base-currency amount and creates approval steps from the matching band's configured approvers. It does not flatten multiple bands into one unlimited policy.

Added:
- `financeConfigurationService.ts` and service contract tests.
- `FinanceConfigurationWorkspace.tsx`, integrated as the Accounting Setup tab in `FinanceOfficerWorkspace.tsx`.
- Mock RPC tests for configuration validation, persistence, retrieval and uncovered amount-band rejection.

Validation on commit `4268ffcffee0f5f93d3e4ff6dbf2a593a0690b7c`:
- Bun automated tests: passed.
- Vite application build: passed.
- SCMS Build Validation run [44187912207](https://github.com/bock12/SCMS/actions/runs/44187912207): success.

This is a development mock implementation. It does not perform live Supabase writes or add direct finance-table DML privileges. The production database remains protected by the reviewed read-only table grants and narrow RPC boundary. The receipt/payment entry forms remain disabled until they are connected to the canonical configuration selectors and transaction service.


## UI integration checkpoint — 2026-11-18

The development UI now submits receipts and payments through the canonical transaction service and presents their canonical document/approval state in the Finance Officer Ledger tab.

- The entry form uses canonical setup selectors and calls `create_financial_document_transaction`; it does not write legacy FinancialRecord/localStorage entries.
- The workflow list shows document type, counterparty, date, amount, payment method, reference, approval-step progress and whether the draft journal has been linked.
- Approve/reject actions call `decide_financial_document_approval` with the currently assigned pending step. The mock RPC rechecks identity, approver assignment, branch permission and step order.
- At this checkpoint, approval queue listing was provided by mock-only `get_finance_documents`; the secure SQL/public listing API is implemented in the database-listing checkpoint below.
- Approval decisions update the document workflow; this does not itself post the journal. Journal posting remains a separate controlled operation.

Validation on `8c4723ac72ef3f0a5ca56cd9c69a0e50dae058d4`: automated tests passed and the Vite production build passed in [SCMS Build Validation run 44208093229](https://github.com/bock12/SCMS/actions/runs/44208093229).

No live Supabase migration replay, deployment, production authentication change or database writes were performed.


## Database-backed document listing API — 2026-11-18

Added `supabase/migrations/20261118000100_get_finance_documents_read_api.sql` with the narrow public RPC `get_finance_documents(uuid)`, matching the existing client service name.

The RPC:
- Requires `auth.uid()`, a linked profile and one of `view_finances`, `manage_finances` or `approve_finances` at the exact requested branch scope.
- Returns only receipt/payment documents for that exact branch (or church-wide documents when the requested branch is null).
- Includes canonical document fields, linked/pending journal state, approval request state, ordered approval-step progress and the current actionable step.
- Exposes an actionable step only when the request is pending, all earlier steps are approved, the actor holds that step's required permission, submitter separation permits it, and the actor has not already decided that step.
- Uses `SECURITY DEFINER` with an empty search path because it reads protected approval metadata; it revokes EXECUTE from PUBLIC, anon and service_role and grants only authenticated.
- Adds no direct INSERT, UPDATE or DELETE privileges on finance tables.

Added `supabase/tests/finance_document_listing.sql` and wired the PostgreSQL 17 workflow to apply the migration and test creator visibility, submitter separation, scoped approver visibility, completed approval/journal linkage, missing permission, cross-branch access and unauthenticated denial. The workflow also checks the function's security-definer/search-path contract and confirms no DML grants were introduced.

The Finance Workflow DTO now allows nullable branch/approver metadata returned by the canonical schema. The transaction-entry confirmation message now distinguishes immediate approval from pending approval; approval still does not mean the journal has been posted.

**Approval-model parity gap to resolve before live use:** the recovered PostgreSQL schema authorizes approvers by the step's required permission and `required_approvals`; it does not store fixed approver assignments. The development mock currently stores `approver_profile_ids` and restricts actions to those selected profiles. The SQL RPC follows the existing database permission-based contract. The mock/configuration contract must be aligned with that model, or explicit assignee persistence must be added to the database, before treating mock and live approval behavior as interchangeable.

No live Supabase project was connected, migrated or deployed. Browser/runtime verification was not performed.


Validation on commit [585342bb](https://github.com/bock12/SCMS/commit/585342bb5856120142d051afe1b5e34348acb77b):
- [SCMS Build Validation #44274447184](https://github.com/bock12/SCMS/actions/runs/44274447184): passed; Bun automated tests and Vite production build completed successfully.
- [PostgreSQL 17 fresh-install/security workflow #44274447182](https://github.com/bock12/SCMS/actions/runs/44274447182): passed; the baseline replay, finance transaction/listing migrations, grant checks, lifecycle tests and branch/auth listing tests all completed successfully.

These are automated build and disposable-database results only. The UI was not exercised in a browser, and no live Supabase project was connected or changed.


## Journal posting and posted-ledger checkpoint — 2026-11-18

The next lifecycle boundary is now implemented:

1. The browser calls `public.post_finance_journal_entry(uuid)`; it does not call the private schema or update journal tables directly.
2. The public wrapper requires an authenticated linked profile and `post_journals` at the journal's branch scope. It rejects a pending financial-document marker and verifies that a financial-document journal is linked to an approved source document.
3. The wrapper delegates final accounting validation to `private.post_journal_entry(uuid)`, which checks draft state, open period/year, active chart accounts, branch consistency, transaction/base currency balance and exchange-rate calculations.
4. A repeated request for an already-posted journal returns its posted state without attempting a second mutation.
5. `public.get_finance_journals(uuid)` returns the branch journal register, line details and account balances. Balance aggregation includes only entries whose status is `posted`.
6. The development mock exposes matching `get_finance_journals` and `post_finance_journal_entry` operations. It remains a local simulation, not a live database connection.

The Finance Officer ledger now includes a journal register, explicit posting controls and posted-only account balances. Approved journals remain visible as unposted drafts; pending and rejected journals cannot be posted. The former summary cards based on the legacy FinancialRecord projection have been removed.

The CI lifecycle fixture posts an immediately approved receipt through the public API, checks its immutable posted state and posted-only account balance, checks a safe repeat call, and verifies a rejected pending-marker journal cannot be posted. No direct journal-table DML grant was introduced.

Remaining: move the legacy department/event spending analytics and PDF/CSV reporting onto canonical posted journal lines; add database-backed finance configuration APIs; and reconcile the mock's fixed approver assignments with the permission-based SQL approval model before treating the two implementations as behaviorally interchangeable.


## Posted-journal reporting checkpoint — 2026-11-18

Official CSV and printable/PDF reporting now uses `buildPostedFinanceReport` from `financeReportService.ts`. It selects posted journals first, then calculates base-currency revenue, expenses, net operating position and account balances from their journal lines. It supports all-time, last-seven-days, current-month, current-quarter and current-year periods. Currency totals remain separated by base currency.

The Finance Officer ledger's old FinancialRecord-based CSV/PDF export actions have been removed. The previous spending chart, which mixed recorded legacy expenses with approved/disbursed department and event budget amounts, has also been removed. Legacy financial records remain visible for reference with a warning that they are not the accounting ledger and are excluded from official reports.

Department requisition and event-budget approval/disbursement screens now explain that their workflow statuses are not accounting postings. The disbursement handlers continue to fail closed while the legacy persistence function is disabled. There is currently no canonical source relationship linking a department requisition or event budget to a financial document and journal. Therefore, department/event actual expenditure cannot be accurately derived yet; chart-of-accounts expense balances are the supported posted accounting projection until that source-linking task is completed.

Tests cover posted-only inclusion, draft/rejected exclusion, income/expense balance arithmetic, calendar period filtering and separation of base currencies.


## Approval-model parity checkpoint — 2026-11-19

The receipt/payment development mock now follows the canonical PostgreSQL approval-step contract rather than assigning each approval step to a fixed profile:

- Financial-document policy steps are defined by `required_permission_key`, `required_approvals` and `prohibit_submitter_approval`.
- An eligible active profile may decide a pending step when they hold the required permission at the document branch. The submitter is excluded when the step requires separation of duties.
- Approval decisions are recorded per profile and step. The same profile cannot satisfy multiple approvals for one step; the step advances only after its configured number of distinct approvals is reached.
- Ordered approval steps must complete in sequence. Only completion of the final step changes the document to approved and links its exact pending draft journal.
- A policy with a matching amount band and zero approval steps is an explicit immediate-approval configuration. Missing policies and uncovered amount bands fail closed.
- The finance configuration UI now asks for the number of distinct approvals for receipts/payments rather than a fixed named approver. The separate event-budget configuration path retains its existing assigned-approver input.
- Mock document listing now treats a null branch filter as church-wide scope only; it no longer broadens the result to every branch visible to the actor.

Regression tests cover distinct approvers for a multi-approval step, duplicate-decision denial, immediate approval, missing policy/band failures and exact branch filtering.

Validation on commit `be4abfa27ae5a6c898ad2fc205312cdaca9c19e4`:
- [SCMS Build Validation #44554299682](https://github.com/bock12/SCMS/actions/runs/44554299682): passed; automated tests and Vite production build succeeded.

No SQL migration was changed in this checkpoint, so the PostgreSQL workflow was not rerun. Its earlier successful transaction lifecycle/security runs remain the evidence for the SQL layer. No live Supabase project was connected, migrated or changed, and no browser/runtime test was performed.

### Remaining before production use

1. Add narrow database-backed read/write APIs for finance configuration (currencies, accounts, funds, periods, approval policies, amount bands and steps). The current configuration workspace persists to the development mock store only.
2. Perform browser/runtime acceptance testing against the mock workflow.
3. Review and approve deployment of the already-tested SQL migrations separately. Do not infer live deployment from CI.
