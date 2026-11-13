# Unified Member Directory — Acceptance Checklist

**Scope:** ADR-0001 unified person directory with optional portal access  
**Environment:** local mock authentication and local mock database only  
**Supabase:** keep disconnected for this checklist; do not run migrations or use live credentials  
**Test roles:** administrator or pastor, plus a standard member account for access-boundary checks

## Preconditions

- Start the application using the repository's documented local development command.
- Sign in with the mock administrator or pastor account.
- Confirm the app is using the local mock database and that no Supabase project credentials are configured.
- Use clearly identifiable test records; do not use real congregant information.
- Record starting directory and portal-account counts so cleanup can be verified.

## Acceptance scenarios

### 1. Register a person without portal access

1. Open **Member Directory** and choose **Add New Member**.
2. Enter the required name, branch, and membership date; add optional contact and membership details.
3. Leave portal access disabled and submit.

**Expected**
- Exactly one canonical person record is created in `profiles`.
- `auth_user_id` remains null; no auth account or credentials are created.
- The person appears in the directory and can be searched by name and available contact details.
- Membership status defaults to Active.

### 2. Register a person with optional portal access

1. Open **Add New Member**.
2. Enter the required person and membership details, a valid email address, and enable portal access.
3. Submit and inspect the invitation/setup result.

**Expected**
- Exactly one canonical person record is created.
- Portal provisioning explicitly links the created auth identity to that person's stable profile ID.
- The setup token is required to activate the portal account; no plaintext password is stored in `profiles`.
- The linked identity is unique and is not selected by matching email alone.

### 3. Prevent unauthorized identity claiming

1. Create a directory person with portal access disabled.
2. Attempt public sign-up using that person's email address.
3. Attempt sign-in with an unknown email address.

**Expected**
- Public sign-up cannot claim or link the existing directory person by email.
- Unknown-email sign-in fails without creating an auth account or directory person.
- An auth account without trusted provisioning metadata remains unlinked and cannot enter the member portal.
- A trusted provisioning request must identify the exact profile ID and the email must match that profile.

### 4. Edit a person and validate data

1. Find a directory person and open the single edit flow.
2. Change name, contact details, gender, membership date, and baptism fields.
3. Save and reopen the record.

**Expected**
- Changes persist on the same canonical profile ID.
- Email is normalized to lowercase and surrounding whitespace is removed.
- Invalid dates, impossible calendar dates, invalid email addresses, and missing names are rejected.
- Validation errors remain visible and do not silently close the form.

### 5. Change membership and portal status independently

1. Select a record linked to a portal account.
2. Change membership status to Inactive, Suspended, Transferred, or Archived.
3. Separately suspend or reactivate portal access where supported.

**Expected**
- Membership status changes only the church-membership lifecycle.
- Portal status and auth linkage remain independent of membership status.
- Suspending or archiving portal access does not silently alter membership status.

### 6. Search, filters, and integrity

- Search by full name, partial name, email, and phone.
- Apply membership-status and portal-access filters separately and together.
- Attempt duplicate email/phone registration and duplicate auth-user linking.
- Simulate a failed save and confirm the error is visible and actionable.
- Verify ministry, transfer, event-registration, and survey references still resolve to the same canonical person IDs.

**Expected**
- Search and filters operate on the unified directory and the correct independent lifecycle fields.
- Duplicate contacts and duplicate non-null `auth_user_id` values are rejected.
- Failed writes do not leave duplicate or partially linked records.
- Dependent module references remain intact.

## Evidence record

| Scenario | Pass / Fail | Notes or screenshot reference |
|---|---|---|
| Directory-only registration | | |
| Optional portal provisioning | | |
| Unauthorized identity-claim prevention | | |
| Person editing and validation | | |
| Independent membership / portal status | | |
| Search, filters, and dependent references | | |

## Completion criteria

- All six scenarios pass in the local mock environment.
- Automated membership service tests and the production build pass in CI.
- SQL trigger behavior is verified against a disposable Supabase-compatible PostgreSQL test project before any production deployment.
- Production migration history and schema baseline are confirmed by the project owner before applying migrations.
- Browser acceptance is marked complete only after a human tester executes the scenarios; CI success alone does not count as browser acceptance.

## Deployment dependency

The SQL trigger now expects trusted portal provisioning to set
`auth.users.raw_app_meta_data.provisioned_profile_id` using a server-side
service-role operation. The current browser mock implements a simulated
provisioning flow; it is not a production service-role implementation. Do not
enable live Supabase portal invitations until that server-side operation exists
and is tested.
