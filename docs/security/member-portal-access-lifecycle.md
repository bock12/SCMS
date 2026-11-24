# Member Portal Access Lifecycle (MEM-INT-003)

## Security boundary

The browser calls the `member-portal-access` Supabase Edge Function with the signed-in user's access token. The function verifies that token with Supabase Auth and calls `authorize_member_portal_action` using the caller's JWT.

The database authorization RPC requires:
- An active authenticated church profile
- An active target member-directory record with a branch
- Trusted `manage_members` permission covering the target branch

The Edge Function uses the server-side Supabase Auth Admin API. Its secret/service-role key is read only from Edge Function environment variables and is never exposed to the browser. The database completion RPC is executable only by `service_role`.

## State transitions

| Action | Member portal state | Auth operation |
| --- | --- | --- |
| Invite | `not_invited -> invited` | Send Supabase Auth invitation email and link the new Auth user |
| Email confirmation | `invited -> active` | Auth confirmation trigger activates the linked profile |
| Suspend | `active/invited -> suspended` | Save the blocked profile state, then apply a long Auth ban |
| Reactivate | `suspended -> active` | Remove the Auth ban, then restore active profile resolution |
| Revoke | `suspended -> not_invited` | Delete the Auth identity and unlink it from the member |

Suspension changes the profile state before the Auth ban is applied. This blocks profile resolution and profile-scoped RLS even for an access token that has not yet expired. Revocation also removes the Auth identity; Supabase access tokens already issued remain stateless until expiry, so protected SCMS access must continue to rely on the active profile resolver and RLS policies.

If Auth deletion fails because the user owns Storage objects, the member remains suspended. The operation is retryable after the Storage ownership issue is resolved. The completion RPC also handles the profile foreign key's `ON DELETE SET NULL` behavior.

## Independent lifecycles

Portal operations update only `auth_user_id` and `portal_access_status` (plus the invitation email where needed). They do not change:
- `membership_status` or `membership_date`
- Role assignments or custom permissions
- Branch assignment or member transfer history

A revoked member remains in the church directory with `portal_access_status = 'not_invited'` and no linked Auth user.

## Application mode

The existing mock login remains the development default. Live member reads and portal lifecycle actions require both:
- `VITE_SUPABASE_INTEGRATION=enabled` (or the existing `finance` integration mode)
- `VITE_SUPABASE_AUTH=enabled`

Do not put Supabase secret/service-role keys in any `VITE_*` browser variable. The Edge Function uses the project-provided server-side Supabase secret environment.

## Email configuration

Invitations use Supabase Auth's configured email template and project Site URL. Configure the correct Site URL / allowed redirect URLs and a production SMTP provider in Supabase Auth before relying on member invitations outside development. The application displays an email-sent confirmation for live invitations; it does not expose an invitation token or generate a client-side activation link.

## Regression coverage

`supabase/tests/member-portal-lifecycle.sql` is a transaction-scoped PostgreSQL regression test. It covers branch-scoped member and role reads, cross-branch isolation, invitation authorization, email-confirmation activation, suspension, reactivation, Auth deletion/revocation retry, self-read/update denial while suspended, and preservation of membership status and role assignments. All fixtures are rolled back.
