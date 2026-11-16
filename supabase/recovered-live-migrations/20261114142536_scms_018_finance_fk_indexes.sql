
begin;

create index if not exists ix_private_payment_gateway_payloads_transaction
  on private.payment_gateway_payloads (transaction_id);
create index if not exists ix_private_stream_credentials_stream
  on private.stream_credentials (stream_id);
create index if not exists ix_private_stream_credentials_created_by
  on private.stream_credentials (created_by_profile_id)
  where created_by_profile_id is not null;

create index if not exists ix_approval_policies_branch
  on public.approval_policies (branch_id)
  where branch_id is not null;
create index if not exists ix_approval_policies_created_by
  on public.approval_policies (created_by_profile_id)
  where created_by_profile_id is not null;
create index if not exists ix_approval_policy_steps_permission
  on public.approval_policy_steps (required_permission_key);
create index if not exists ix_approval_request_steps_permission
  on public.approval_request_steps (required_permission_key);
create index if not exists ix_approval_requests_policy
  on public.approval_requests (policy_id)
  where policy_id is not null;
create index if not exists ix_approval_requests_band
  on public.approval_requests (band_id)
  where band_id is not null;

create index if not exists ix_budgets_approval_request
  on public.budgets (approval_request_id)
  where approval_request_id is not null;
create index if not exists ix_budgets_base_currency
  on public.budgets (base_currency_code);
create index if not exists ix_budgets_currency
  on public.budgets (currency_code);

create index if not exists ix_event_survey_answers_response_survey
  on public.event_survey_answers (response_id, survey_id);

create index if not exists ix_financial_documents_approval_request
  on public.financial_documents (approval_request_id)
  where approval_request_id is not null;
create index if not exists ix_financial_documents_base_currency
  on public.financial_documents (base_currency_code);
create index if not exists ix_financial_documents_currency
  on public.financial_documents (currency_code);

create index if not exists ix_journal_entries_approval_request
  on public.journal_entries (approval_request_id)
  where approval_request_id is not null;
create index if not exists ix_journal_entries_base_currency
  on public.journal_entries (base_currency_code);

create index if not exists ix_payment_gateway_currency
  on public.payment_gateway_transactions (currency_code);

commit;