
begin;
alter extension btree_gist set schema extensions;
create policy stream_credentials_deny_all
on private.stream_credentials
for all to public
using (false)
with check (false);
commit;