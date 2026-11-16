-- Complete the permission catalog used by the existing RLS policies and UI modules.
-- Keep authorization data in roles/permissions/role_permissions; never infer it from profiles.primary_role.

insert into public.permissions (key, module, description) values
  ('manage_resources', 'resources', 'Create, update, publish, and remove church resources'),
  ('manage_surveys', 'surveys', 'Create, publish, close, and administer event surveys'),
  ('manage_streams', 'streaming', 'Manage live stream configuration and broadcasts'),
  ('view_events', 'events', 'View church events'),
  ('view_attendance', 'attendance', 'View attendance records'),
  ('view_resources', 'resources', 'View published church resources'),
  ('view_streams', 'streaming', 'View available live streams'),
  ('register_for_events', 'events', 'Register for eligible church events'),
  ('send_stream_chat', 'streaming', 'Send messages in permitted live stream chats')
on conflict (key) do nothing;

-- Administrative roles receive management permissions only through explicit role links.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in (
  'manage_resources', 'manage_surveys', 'manage_streams'
)
where r.name in ('super_admin', 'admin', 'district_admin', 'pastor')
on conflict do nothing;

-- Church staff may view operational content within the scope of their assignment.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in (
  'view_events', 'view_attendance', 'view_resources', 'view_streams',
  'register_for_events', 'send_stream_chat'
)
where r.name in (
  'super_admin', 'admin', 'district_admin', 'pastor',
  'finance_officer', 'leader', 'worker', 'member'
)
on conflict do nothing;
