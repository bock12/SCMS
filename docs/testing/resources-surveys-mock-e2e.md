# Resources and Event Surveys — Mock E2E Test Plan

## Test environment

- Use the default local mock database and mock authentication.
- Do not set `VITE_SUPABASE_INTEGRATION=enabled`.
- No Supabase URL, key, project, or SQL migration is required.
- Use a clean browser profile or clear the application's local storage before the first test run.
- The seeded member account is `member@faithconnect.church`; use the application's mock sign-in flow.

## Automated coverage

Run:

```bash
bun run test
bun run build
```

The automated integration suite exercises the local mock database through the same resource and survey services used by the UI. It verifies resource draft/published visibility, update and delete, member survey discovery, attendee eligibility, response submission, response reporting, unlinked-member rejection, and dashboard count queries.

## Browser acceptance checklist

### Admin — Church Resources

- [ ] Sign in with an administrator account.
- [ ] Open the Church Resources administration tab.
- [ ] Create a resource in Draft status and verify it is visible in administration.
- [ ] Switch to the member portal and verify the draft is not visible.
- [ ] Publish the resource and verify it appears in the member resource library.
- [ ] Open the resource link and confirm it opens in a separate tab.
- [ ] Edit the resource and verify the updated title/URL is shown.
- [ ] Delete the resource and verify it disappears from administration and the member library.

### Admin — Post-Event Surveys

- [ ] Open Post-Event Surveys administration.
- [ ] Create a draft survey linked to an existing event.
- [ ] Add required and optional questions using short text, long text, single choice, multiple choice, rating, and yes/no types.
- [ ] Save the draft and verify it is not available in the member portal.
- [ ] Publish the survey and verify its status and event association.
- [ ] Set an opening time in the future and verify the survey is not yet available.
- [ ] Move the opening time into the past and verify availability.
- [ ] Set a closing time in the past and verify the survey is no longer available.
- [ ] Verify attendee-only surveys are hidden for members without a qualifying checked-in/attended registration.

### Member — Resources and Surveys

- [ ] Sign in as the seeded member account.
- [ ] Open `/portal/resources` and verify published resources are listed.
- [ ] Confirm draft resources are not listed.
- [ ] Open `/portal/surveys` and verify only eligible, published, in-window surveys are listed.
- [ ] Open a survey and verify all question types render correctly.
- [ ] Attempt to submit with a required answer missing; verify a validation message appears and no response is created.
- [ ] Complete required answers and submit; verify the success message appears.
- [ ] Refresh the survey list and verify the survey is marked as already submitted.
- [ ] Confirm the survey cannot be submitted again through the member UI.

### Admin — Response reporting and dashboard

- [ ] Return to Post-Event Surveys administration.
- [ ] Open the response report for the submitted survey.
- [ ] Verify the member name, submission timestamp, question labels, and submitted answers.
- [ ] Return to the main admin dashboard.
- [ ] Verify Published Resources, Published Surveys, and Survey Responses counts match the mock database.
- [ ] Select each metric card and verify it opens the corresponding administration tab.

## Acceptance criteria

- All automated tests pass.
- The application production build passes.
- All applicable browser checklist items pass using mock authentication.
- No test requires live Supabase access.
- No claim of live RLS or production authentication verification is made from these mock tests.

Record browser-only results in the release/task report after a human runs the checklist in the local browser.
