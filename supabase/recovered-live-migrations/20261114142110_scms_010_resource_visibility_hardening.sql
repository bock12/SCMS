
begin;
drop policy resources_authenticated_read on public.church_resources;
create policy resources_authenticated_read
on public.church_resources for select to authenticated
using (
  status = 'published'
  and (
    visibility = 'public'
    or (visibility = 'members_only' and private.current_profile_id() is not null)
    or (visibility = 'staff_only'
        and private.has_permission('manage_resources', branch_id))
  )
  and (
    branch_id is null
    or exists (
      select 1 from public.profiles p
      where p.auth_user_id = (select auth.uid())
        and p.branch_id = church_resources.branch_id
    )
    or private.can_access_branch(branch_id)
    or private.has_permission('view_resources', branch_id)
    or private.has_permission('manage_resources', branch_id)
  )
);
commit;