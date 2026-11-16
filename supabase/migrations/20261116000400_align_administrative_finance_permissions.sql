-- Preserve the established administrative finance-console access while keeping
-- all grants explicit in the database role-permission model.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in (
  'view_finances', 'manage_finances', 'approve_finances', 'post_journals'
)
where r.name in ('super_admin', 'admin')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key = 'view_finances'
where r.name = 'pastor'
on conflict do nothing;
