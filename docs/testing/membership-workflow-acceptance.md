# Membership Workflow Acceptance Checklist

**Scope:** MEM-INT-007 — membership register and portal-account workflow  
**Environment:** local mock authentication and local mock database only  
**Supabase:** must remain disconnected; do not run migrations or use live credentials  
**Test roles:** administrator or pastor, plus a standard member account for access-boundary checks

## Preconditions

- Start the application using the repository's documented local development command.
- Sign in with the mock administrator or pastor account.
- Confirm the app is using the local mock database and that no Supabase project credentials are configured.
- Use clearly identifiable test records prefixed with `MEM-INT-007`; do not use real congregant information.
- Record the starting membership and portal-account counts so cleanup can be verified.

## Acceptance scenarios

### 1. Register a church member without portal access

1. Open **Member Directory** and choose **Register Member (No Login)**.
2. Enter first name, last name, a valid membership date, gender, and optional contact details.
3. Leave **Link an existing portal account** set to **Do not link — membership only**.
4. Submit the form.

**Expected**
- A membership record appears in the unified membership directory.
- The record has no linked portal profile.
- No profile or login identity is created.
- Membership status defaults to Active.
- The new record is searchable by name, email, and phone.

### 2. Link an existing portal account

1. Create or identify a portal profile in the same branch that is not already linked to a membership record.
2. Register a church member and select that existing profile in the optional link selector.
3. Submit.

**Expected**
- The new membership record references the selected profile.
- No second portal profile or credentials are created.
- The linked account appears as linked in the directory.
- Attempting to link the same profile again is rejected with a clear validation message.
- Profiles from a different branch are not accepted.

### 3. Edit membership details

1. Find a membership record and open **Edit Membership**.
2. Change the name, contact details, gender, membership date, and baptism fields.
3. Save and reopen the record.

**Expected**
- Changes persist in the membership record.
- Email is normalized to lowercase and surrounding whitespace is removed.
- Clearing a previously set baptism date removes the stored date when baptism is unchecked.
- Invalid dates, impossible calendar dates, invalid email addresses, and missing names are rejected.
- Validation errors are visible in the form and the modal remains open.

### 4. Change membership status independently of portal access

1. Select a record linked to a portal profile.
2. Change its membership status to Inactive, Suspended, Transferred, or Archived and save.
3. Reopen the linked portal account and inspect its account status and role.
4. If possible, separately suspend or reactivate the portal account.

**Expected**
- Membership status changes only on the membership record.
- Portal account status, role, and login access do not change when membership status changes.
- Portal account suspension or archival does not silently change membership status.
- The directory's membership-status filter reflects the membership status only.

### 5. Search and filter membership records

1. Search by full name, partial name, email, and phone.
2. Apply each membership-status filter.
3. Apply portal access filters: linked, unlinked, enabled, and disabled.
4. Combine search and filters, then clear them.

**Expected**
- Search is case-insensitive and matches the member's name/contact fields.
- Membership-status filters operate on the membership record.
- Portal filters operate on the existence/status of the linked profile, not membership status.
- Clearing filters restores the full set of records.

### 6. Error handling and integrity

- Submit blank names and malformed dates.
- Try an invalid email.
- Try a duplicate profile link.
- Try a profile from a different branch.
- Simulate or inspect a failed save and confirm the user receives a visible error rather than a silent console-only failure.
- Confirm a failed membership synchronization does not close the edit form or falsely report a complete save.

**Expected**
- Invalid writes are rejected before changing stored data.
- Errors are visible and actionable.
- No duplicate membership row is created for a portal profile.
- Membership and portal-account lifecycle remain independent.

## Evidence record

| Scenario | Pass / Fail | Notes or screenshot reference |
|---|---|---|
| Standalone registration | | |
| Existing profile linking | | |
| Membership editing and validation | | |
| Independent membership / portal status | | |
| Search and filters | | |
| Error handling and integrity | | |

## Completion criteria

- All six scenarios pass in the local mock environment.
- Automated membership service tests and the production build pass in CI.
- Any failed scenario is recorded and fixed before acceptance.
- Browser acceptance is marked complete only after a human tester executes the scenarios above; CI success alone does not count as browser acceptance.
