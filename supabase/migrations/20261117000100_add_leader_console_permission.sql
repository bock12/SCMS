-- Give leaders and workers an explicit, database-backed capability to enter the ministry workspace.
-- Department labels on profiles are descriptive metadata and must not grant console access.

insert into public.permissions (key, module, description)
values (
  'view_leader_console',
  'ministries',
  'Access the assigned ministry leader workspace'
)
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key = 'view_leader_console'
where r.name in ('leader', 'worker')
on conflict do nothing;
