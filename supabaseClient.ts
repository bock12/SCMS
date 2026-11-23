import type { Profile, District, ChurchBranch, MemberTransfer, Stream, ChatMessage, Ministry, MinistryJoinRequest, MinistryMember, FinancialRecord, PrayerRequest, ChurchEvent, EventRegistration } from './types';
import { createBrowserMockFinanceStorage, createMockFinanceRpc, expandMockFinancePermissions } from './mockFinanceRpc';

// Storage keys
function createMockUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, character => {
    const random = Math.floor(Math.random() * 16);
    return (character === 'x' ? random : (random & 0x3) | 0x8).toString(16);
  });
}

const DB_STORAGE_KEY = 'faithconnect_db_v2';
const SESSION_STORAGE_KEY = 'faithconnect_auth_session_v2';
const USERS_STORAGE_KEY = 'faithconnect_auth_users_v2';

// Initial pre-seeded mock database
const initialDistricts: District[] = [
  { id: 'dist-1', name: 'Metropolitan Central District', region: 'East Coast', country: 'United States' },
  { id: 'dist-2', name: 'Pacific Coast District', region: 'West Coast', country: 'United States' },
  { id: 'dist-3', name: 'Great Lakes & Midwest District', region: 'Midwest', country: 'United States' }
];

const initialBranches: ChurchBranch[] = [
  { id: 'branch-1', district_id: 'dist-1', name: 'Grace Cathedral (Main Campus)', address: '120 Grace Way', city: 'New York', state: 'NY', is_main_branch: true },
  { id: 'branch-2', district_id: 'dist-1', name: 'Living Waters Sanctuary', address: '45 River Road', city: 'Philadelphia', state: 'PA', is_main_branch: false },
  { id: 'branch-3', district_id: 'dist-2', name: 'New Hope Community Chapel', address: '880 Sunset Blvd', city: 'Los Angeles', state: 'CA', is_main_branch: false },
  { id: 'branch-4', district_id: 'dist-3', name: 'Cornerstone Praise Center', address: '312 Michigan Ave', city: 'Chicago', state: 'IL', is_main_branch: false }
];

const initialSystemRoles = [
  { id: 'mock-role-super-admin', name: 'super_admin', description: 'Church system administrator', is_system: true, is_active: true },
  { id: 'mock-role-admin', name: 'admin', description: 'Church administrator', is_system: true, is_active: true },
  { id: 'mock-role-district-admin', name: 'district_admin', description: 'District administrator', is_system: true, is_active: true },
  { id: 'mock-role-pastor', name: 'pastor', description: 'Pastoral leadership', is_system: true, is_active: true },
  { id: 'mock-role-finance-officer', name: 'finance_officer', description: 'Finance operations', is_system: true, is_active: true },
  { id: 'mock-role-leader', name: 'leader', description: 'Ministry or group leader', is_system: true, is_active: true },
  { id: 'mock-role-worker', name: 'worker', description: 'Church worker', is_system: true, is_active: true },
  { id: 'mock-role-member', name: 'member', description: 'Church member', is_system: true, is_active: true }
];

const initialPermissions = [
  { id: 'mock-perm-view-members', key: 'view_members', module: 'members', description: 'View member directory records' },
  { id: 'mock-perm-manage-members', key: 'manage_members', module: 'members', description: 'Create and manage member records' },
  { id: 'mock-perm-member-transfers', key: 'manage_member_transfers', module: 'members', description: 'Approve and manage branch transfers' },
  { id: 'mock-perm-manage-roles', key: 'manage_roles', module: 'authorization', description: 'Manage role assignments' },
  { id: 'mock-perm-manage-branches', key: 'manage_branches', module: 'church', description: 'Manage districts and branches' },
  { id: 'mock-perm-manage-ministries', key: 'manage_ministries', module: 'ministries', description: 'Manage ministries and departments' },
  { id: 'mock-perm-view-finances', key: 'view_finances', module: 'finance', description: 'View financial information' },
  { id: 'mock-perm-manage-finances', key: 'manage_finances', module: 'finance', description: 'Create financial transactions' },
  { id: 'mock-perm-approve-finances', key: 'approve_finances', module: 'finance', description: 'Approve financial transactions' },
  { id: 'mock-perm-submit-requisitions', key: 'submit_requisitions', module: 'ministries', description: 'Submit department and ministry funding requisitions' },
  { id: 'mock-perm-approve-requisitions', key: 'approve_requisitions', module: 'finance', description: 'Approve or reject department and ministry requisitions' },
  { id: 'mock-perm-post-journals', key: 'post_journals', module: 'finance', description: 'Post accounting journal entries' },
  { id: 'mock-perm-manage-events', key: 'manage_events', module: 'events', description: 'Manage church events' },
  { id: 'mock-perm-submit-event-budgets', key: 'submit_event_budgets', module: 'events', description: 'Submit event budgets for approval and view own submissions' },
  { id: 'mock-perm-manage-attendance', key: 'manage_attendance', module: 'attendance', description: 'Manage attendance' },
  { id: 'mock-perm-manage-welfare', key: 'manage_welfare', module: 'welfare', description: 'Manage welfare cases' },
  { id: 'mock-perm-view-audit-logs', key: 'view_audit_logs', module: 'audit', description: 'View audit history' },
  { id: 'mock-perm-manage-resources', key: 'manage_resources', module: 'resources', description: 'Manage church resources' },
  { id: 'mock-perm-manage-surveys', key: 'manage_surveys', module: 'surveys', description: 'Manage event surveys' },
  { id: 'mock-perm-manage-streams', key: 'manage_streams', module: 'streaming', description: 'Manage live streams' },
  { id: 'mock-perm-view-events', key: 'view_events', module: 'events', description: 'View church events' },
  { id: 'mock-perm-view-attendance', key: 'view_attendance', module: 'attendance', description: 'View attendance records' },
  { id: 'mock-perm-view-resources', key: 'view_resources', module: 'resources', description: 'View published resources' },
  { id: 'mock-perm-view-streams', key: 'view_streams', module: 'streaming', description: 'View live streams' },
  { id: 'mock-perm-view-leader-console', key: 'view_leader_console', module: 'ministries', description: 'Access the assigned ministry leader workspace' },
  { id: 'mock-perm-register-events', key: 'register_for_events', module: 'events', description: 'Register for events' },
  { id: 'mock-perm-stream-chat', key: 'send_stream_chat', module: 'streaming', description: 'Send stream chat messages' }
];

const initialRolePermissions = [
  ['super_admin', ['view_members','manage_members','manage_member_transfers','manage_roles','manage_branches','manage_ministries','manage_events','manage_attendance','view_audit_logs']],
  ['admin', ['view_members','manage_members','manage_member_transfers','manage_roles','manage_branches','manage_ministries','manage_events','manage_attendance','view_audit_logs']],
  ['district_admin', ['view_members','manage_members','manage_member_transfers','manage_roles','manage_branches','manage_ministries','manage_events','manage_attendance']],
  ['pastor', ['view_members','manage_ministries','manage_events','manage_attendance']],
  ['leader', ['submit_requisitions']],
  ['pastor', ['submit_requisitions']],
  ['super_admin', ['approve_requisitions']],
  ['admin', ['approve_requisitions']],
  ['pastor', ['approve_requisitions']],
  ['finance_officer', ['approve_requisitions']],
  ['super_admin', ['submit_event_budgets']],
  ['admin', ['submit_event_budgets']],
  ['district_admin', ['submit_event_budgets']],
  ['pastor', ['submit_event_budgets']],
  ['finance_officer', ['view_finances','manage_finances','approve_finances','post_journals']],
  ['super_admin', ['view_finances','manage_finances','approve_finances','post_journals']],
  ['admin', ['view_finances','manage_finances','approve_finances','post_journals']],
  ['pastor', ['view_finances']],
  ['super_admin', ['manage_resources','manage_surveys','manage_streams']],
  ['admin', ['manage_resources','manage_surveys','manage_streams']],
  ['district_admin', ['manage_resources','manage_surveys','manage_streams']],
  ['pastor', ['manage_resources','manage_surveys','manage_streams']],
  ['super_admin', ['view_events','view_attendance','view_resources','view_streams','register_for_events','send_stream_chat']],
  ['admin', ['view_events','view_attendance','view_resources','view_streams','register_for_events','send_stream_chat']],
  ['district_admin', ['view_events','view_attendance','view_resources','view_streams','register_for_events','send_stream_chat']],
  ['pastor', ['view_events','view_attendance','view_resources','view_streams','register_for_events','send_stream_chat']],
  ['finance_officer', ['view_events','view_attendance','view_resources','view_streams','register_for_events','send_stream_chat']],
  ['leader', ['view_events','view_attendance','view_resources','view_streams','register_for_events','send_stream_chat']],
  ['worker', ['view_events','view_attendance','view_resources','view_streams','register_for_events','send_stream_chat']],
  ['leader', ['view_leader_console']],
  ['worker', ['view_leader_console']],
  ['member', ['view_events','view_resources','view_streams','register_for_events','send_stream_chat']]
].flatMap(([roleName, permissionKeys]: any) => {
  const role = initialSystemRoles.find(item => item.name === roleName);
  return permissionKeys.map((key: string) => ({
    role_id: role?.id,
    permission_id: initialPermissions.find(permission => permission.key === key)?.id
  })).filter(link => link.role_id && link.permission_id);
});

const initialProfiles: Profile[] = [
  {
    id: 'usr-admin-1',
    auth_user_id: 'usr-admin-1',
    branch_id: 'branch-1',
    first_name: 'David',
    last_name: 'Miller',
    email: 'admin@faithconnect.church',
    phone: '+1 (555) 234-5678',
    gender: 'male',
    avatar_url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80',
    primary_role: 'super_admin',
    status: 'active',
    membership_status: 'active',
    membership_date: '2023-01-15',
    created_at: new Date(Date.now() - 365 * 86400000).toISOString(),
    is_baptized: true,
    baptism_date: '2018-10-05',
    baptized_by: 'Bishop Marcus Vance'
  },
  {
    id: 'usr-pastor-1',
    auth_user_id: 'usr-pastor-1',
    branch_id: 'branch-1',
    first_name: 'Sarah',
    last_name: 'Johnson',
    email: 'pastor@faithconnect.church',
    phone: '+1 (555) 345-6789',
    gender: 'female',
    avatar_url: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=200&q=80',
    primary_role: 'pastor',
    status: 'active',
    membership_status: 'active',
    membership_date: '2023-03-20',
    created_at: new Date(Date.now() - 200 * 86400000).toISOString(),
    is_baptized: true,
    baptism_date: '2019-04-20',
    baptized_by: 'Bishop Marcus Vance'
  },
  {
    id: 'usr-bishop-1',
    auth_user_id: 'usr-bishop-1',
    branch_id: 'branch-1',
    first_name: 'Michael',
    last_name: 'Thomas',
    email: 'bishop@faithconnect.church',
    phone: '+1 (555) 456-7890',
    gender: 'male',
    avatar_url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=200&q=80',
    primary_role: 'district_admin',
    status: 'active',
    membership_status: 'active',
    membership_date: '2023-05-10',
    created_at: new Date(Date.now() - 150 * 86400000).toISOString(),
    is_baptized: true,
    baptism_date: '2015-10-12',
    baptized_by: 'Apostle John Miller'
  },
  {
    id: 'usr-leader-1',
    auth_user_id: 'usr-leader-1',
    branch_id: 'branch-2',
    first_name: 'Hannah',
    last_name: 'Adams',
    email: 'worship@faithconnect.church',
    phone: '+1 (555) 567-8901',
    gender: 'female',
    avatar_url: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=200&q=80',
    primary_role: 'leader',
    status: 'active',
    membership_status: 'active',
    membership_date: '2023-06-01',
    created_at: new Date(Date.now() - 90 * 86400000).toISOString(),
    is_baptized: true,
    baptism_date: '2021-06-14',
    baptized_by: 'Rev. Sarah Johnson'
  },
  {
    id: 'usr-member-1',
    auth_user_id: 'usr-member-1',
    branch_id: 'branch-1',
    first_name: 'Grace',
    last_name: 'Campbell',
    email: 'member@faithconnect.church',
    phone: '+1 (555) 678-9012',
    gender: 'female',
    avatar_url: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=200&q=80',
    primary_role: 'member',
    status: 'active',
    membership_status: 'active',
    membership_date: '2023-08-12',
    created_at: new Date(Date.now() - 45 * 86400000).toISOString(),
    is_baptized: true,
    baptism_date: '2022-10-17',
    baptized_by: 'Rev. Sarah Johnson'
  },
  {
    id: 'usr-role-admin-1',
    auth_user_id: 'usr-role-admin-1',
    branch_id: 'branch-1',
    first_name: 'Daniel',
    last_name: 'Williams',
    email: 'churchadmin@faithconnect.church',
    phone: '+232 76 000 001',
    gender: 'male',
    primary_role: 'admin',
    status: 'active',
    membership_status: 'active',
    membership_date: '2024-02-01',
    created_at: '2024-02-01T00:00:00.000Z'
  },
  {
    id: 'usr-finance-1',
    auth_user_id: 'usr-finance-1',
    branch_id: 'branch-1',
    first_name: 'Esther',
    last_name: 'Kamara',
    email: 'finance@faithconnect.church',
    phone: '+232 76 000 002',
    gender: 'female',
    primary_role: 'finance_officer',
    status: 'active',
    membership_status: 'active',
    membership_date: '2024-02-02',
    created_at: '2024-02-02T00:00:00.000Z'
  },
  {
    id: 'usr-worker-1',
    auth_user_id: 'usr-worker-1',
    branch_id: 'branch-1',
    first_name: 'Joseph',
    last_name: 'Conteh',
    email: 'worker@faithconnect.church',
    phone: '+232 76 000 003',
    gender: 'male',
    primary_role: 'worker',
    status: 'active',
    membership_status: 'active',
    membership_date: '2024-02-03',
    created_at: '2024-02-03T00:00:00.000Z'
  },
  {
    id: 'mem-6',
    auth_user_id: null,
    branch_id: 'branch-2',
    first_name: 'Elijah',
    last_name: 'Wright',
    email: 'ewright@gmail.com',
    phone: '+1 (555) 789-0123',
    gender: 'male',
    avatar_url: 'https://picsum.photos/seed/elijah/200/200',
    primary_role: 'member',
    status: 'active',
    membership_status: 'active',
    membership_date: '2023-09-05',
    created_at: '2023-09-05T00:00:00.000Z',
    is_baptized: true,
    baptism_date: '2020-10-10',
    baptized_by: 'Rev. Sarah Johnson'
  },
  {
    id: 'mem-7',
    auth_user_id: null,
    branch_id: 'branch-3',
    first_name: 'Rebecca',
    last_name: 'Foster',
    email: 'rfoster@gmail.com',
    phone: '+1 (555) 890-1234',
    gender: 'female',
    avatar_url: 'https://picsum.photos/seed/rebecca/200/200',
    primary_role: 'member',
    status: 'active',
    membership_status: 'active',
    membership_date: '2023-10-18',
    created_at: '2023-10-18T00:00:00.000Z',
    is_baptized: true,
    baptism_date: '2023-10-22',
    baptized_by: 'Pastor David Miller'
  },
  {
    id: 'mem-8',
    auth_user_id: null,
    branch_id: 'branch-1',
    first_name: 'Samuel',
    last_name: 'Okonkwo',
    email: 'sokonkwo@gmail.com',
    phone: '+1 (555) 901-2345',
    gender: 'male',
    avatar_url: 'https://picsum.photos/seed/samuel/200/200',
    primary_role: 'member',
    status: 'active',
    membership_status: 'transferred',
    membership_date: '2023-11-01',
    created_at: '2023-11-01T00:00:00.000Z',
    is_baptized: true,
    baptism_date: '2021-10-28',
    baptized_by: 'Bishop Marcus Vance'
  },
  {
    id: 'mem-9',
    auth_user_id: null,
    branch_id: 'branch-4',
    first_name: 'Ruth',
    last_name: 'Martinez',
    email: 'rmartinez@gmail.com',
    phone: '+1 (555) 012-3456',
    gender: 'female',
    avatar_url: 'https://picsum.photos/seed/ruth/200/200',
    primary_role: 'member',
    status: 'active',
    membership_status: 'active',
    membership_date: '2024-01-08',
    created_at: '2024-01-08T00:00:00.000Z',
    is_baptized: false
  }
];

const initialTransfers: MemberTransfer[] = [
  {
    id: 'tr-1',
    member_id: 'mem-8',
    from_branch_id: 'branch-1',
    to_branch_id: 'branch-3',
    status: 'pending',
    request_date: new Date(Date.now() - 3 * 86400000).toISOString(),
    notes: 'Relocating to California for employment. Requesting membership transfer.'
  },
  {
    id: 'tr-2',
    member_id: 'usr-leader-1',
    from_branch_id: 'branch-1',
    to_branch_id: 'branch-2',
    status: 'approved',
    request_date: new Date(Date.now() - 60 * 86400000).toISOString(),
    notes: 'Transferred to lead worship ministry at Living Waters.'
  }
];

const initialStreams: Stream[] = [
  {
    id: 'stream-live-1',
    branch_id: 'branch-1',
    title: 'Sunday Morning Worship & Prophetic Word',
    description: 'Join us live for powerful praise, intercession, and uplifting message from Pastor Sarah.',
    platform: 'youtube',
    privacy: 'public',
    status: 'live',
    embed_url: 'https://www.youtube.com/embed/live_stream?channel=faithconnect',
    thumbnail_url: 'https://images.unsplash.com/photo-1510525009512-ad7fc13eefab?auto=format&fit=crop&w=800&q=80',
    scheduled_start: new Date(Date.now() - 30 * 60000).toISOString(),
    view_count: 342
  },
  {
    id: 'stream-sch-1',
    branch_id: 'branch-1',
    title: 'Midweek Communion & Healing Service',
    description: 'An evening consecrated for deeper communion, prayer, and spiritual renewal.',
    platform: 'youtube',
    privacy: 'public',
    status: 'scheduled',
    embed_url: '',
    thumbnail_url: 'https://images.unsplash.com/photo-1544427920-c49ccfb85579?auto=format&fit=crop&w=800&q=80',
    scheduled_start: new Date(Date.now() + 2 * 86400000).toISOString(),
    view_count: 0
  },
  {
    id: 'stream-sch-2',
    branch_id: 'branch-2',
    title: 'Kingdom Youth Fellowship Live',
    description: 'Empowering the next generation with contemporary worship, panel discussion, and community.',
    platform: 'facebook',
    privacy: 'members_only',
    status: 'scheduled',
    embed_url: '',
    thumbnail_url: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=800&q=80',
    scheduled_start: new Date(Date.now() + 5 * 86400000).toISOString(),
    view_count: 0
  },
  {
    id: 'stream-arch-1',
    branch_id: 'branch-1',
    title: 'Faith Over Fear: Walking in Divine Authority',
    description: 'Sermon archive from our Annual Believers Conference.',
    platform: 'youtube',
    privacy: 'public',
    status: 'archived',
    embed_url: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
    thumbnail_url: 'https://images.unsplash.com/photo-1438232992991-995b7058bbb3?auto=format&fit=crop&w=800&q=80',
    scheduled_start: new Date(Date.now() - 7 * 86400000).toISOString(),
    view_count: 1250
  }
];

const initialMessages: ChatMessage[] = [
  {
    id: 'msg-1',
    stream_id: 'stream-live-1',
    user_id: 'usr-admin-1',
    message: 'Welcome everyone to today’s live broadcast! Let us know where you are tuning in from.',
    created_at: new Date(Date.now() - 25 * 60000).toISOString()
  },
  {
    id: 'msg-2',
    stream_id: 'stream-live-1',
    user_id: 'usr-member-1',
    message: 'Good morning church family! Tuning in from Philadelphia with my family. Blessed to be here! 🙏',
    created_at: new Date(Date.now() - 15 * 60000).toISOString()
  },
  {
    id: 'msg-3',
    stream_id: 'stream-live-1',
    user_id: 'usr-leader-1',
    message: 'Amen! The worship has been so anointed this morning!',
    created_at: new Date(Date.now() - 5 * 60000).toISOString()
  }
];

const initialMinistries: Ministry[] = [
  { 
    id: 'min-men-1', 
    name: 'Men of Honor Fellowship', 
    description: 'Empowering men to be spiritual leaders in their homes, church, and marketplace through brotherhood and discipleship.', 
    leader_name: 'David Miller', 
    leader_id: 'usr-admin-1',
    meeting_time: '2nd Saturday 8:00 AM', 
    member_count: 28, 
    category: 'Men',
    type: 'social_fellowship',
    roles_and_responsibilities: [
      'Men\'s Discipleship & Mentorship Lead',
      'Brotherhood Breakfast Coordinator',
      'Community Service & Workday Lead',
      'Fatherhood & Family Devotional Facilitator'
    ]
  },
  { 
    id: 'min-women-1', 
    name: 'Women of Grace Guild', 
    description: 'Fostering spiritual growth, heartfelt sisterhood, prayer partnerships, and compassionate community outreach.', 
    leader_name: 'Sarah Johnson', 
    leader_id: 'usr-pastor-1',
    meeting_time: '3rd Saturday 10:00 AM', 
    member_count: 38, 
    category: 'Women',
    type: 'social_fellowship',
    roles_and_responsibilities: [
      'Sisterhood Mentorship Coordinator',
      'Annual Women\'s Retreat Planning Lead',
      'Family Care & Meal Train Support',
      'Young Women Bible Study Leader'
    ]
  },
  { 
    id: 'min-1', 
    name: 'Voices of Grace Choir', 
    description: 'Leads the congregation into divine praise and worship in every service.', 
    leader_name: 'Hannah Adams', 
    leader_id: 'usr-leader-1',
    meeting_time: 'Thursdays 6:30 PM', 
    member_count: 24, 
    category: 'Worship',
    type: 'service_department',
    roles_and_responsibilities: [
      'Soprano / Alto / Tenor Section Leaders',
      'Communion & Special Soloist Leader',
      'Sunday Service Music Director',
      'Soundcheck & Vocals Coordinator'
    ]
  },
  { 
    id: 'min-2', 
    name: 'Kingdom Youth Fellowship', 
    description: 'Nurturing teen and young adult discipleship, fellowship, and campus outreach.', 
    leader_name: 'Samuel Okonkwo', 
    meeting_time: 'Saturdays 5:00 PM', 
    member_count: 42, 
    category: 'Youth',
    type: 'social_fellowship',
    roles_and_responsibilities: [
      'Campus Outreach Coordinator',
      'Acoustic Youth Worship Leader',
      'Small Group Facilitator',
      'Events & Retreats Planner'
    ]
  },
  { 
    id: 'min-3', 
    name: 'Ushers & Hospitality Guild', 
    description: 'Welcoming worshippers, sanctuary seating, communion logistics, and protocol.', 
    leader_name: 'Elijah Wright', 
    meeting_time: '1st Sunday 8:00 AM', 
    member_count: 18, 
    category: 'Hospitality',
    type: 'service_department',
    roles_and_responsibilities: [
      'Head Usher & Protocol Lead',
      'First-Time Visitor Welcome Liaison',
      'Sanctuary Seating & Collection Usher',
      'Communion Logistics Coordinator'
    ]
  },
  { 
    id: 'min-4', 
    name: 'Intercessory Prayer Ministry', 
    description: 'Fervent prayer and fasting coverage for families, leadership, and church growth.', 
    leader_name: 'Rebecca Foster', 
    meeting_time: 'Tuesdays 6:00 AM', 
    member_count: 15, 
    category: 'Prayer',
    type: 'service_department',
    roles_and_responsibilities: [
      'Morning Prayer Chain Leader',
      'Altar Call Intercessor',
      'Emergency Prayer Line Coordinator',
      'Fasting & Vigil Mobilizer'
    ]
  },
  { 
    id: 'min-5', 
    name: 'Media & Livestream Studio', 
    description: 'Audio engineering, camera operations, RTMP broadcasting, and visual media.', 
    leader_name: 'David Miller', 
    leader_id: 'usr-admin-1',
    meeting_time: 'Sundays 7:30 AM', 
    member_count: 10, 
    category: 'Production',
    type: 'service_department',
    roles_and_responsibilities: [
      'Main Camera Operator',
      'OBS / Live Broadcast Engineer',
      'ProPresenter Slide Operator',
      'Sound Mixing & Microphones Tech'
    ]
  },
  { 
    id: 'min-6', 
    name: 'FaithKids Children Ministry', 
    description: 'Age-graded scripture lessons, songs, and activities for infants through age 12.', 
    leader_name: 'Ruth Martinez', 
    meeting_time: 'Sundays 9:30 AM', 
    member_count: 35, 
    category: 'Children',
    type: 'social_fellowship',
    roles_and_responsibilities: [
      'Children Sunday School Teacher',
      'Nursery Care Attendant',
      'Junior Choir & Drama Director',
      'Child Safety & Check-in Coordinator'
    ]
  }
];

const initialMinistryMembers: MinistryMember[] = [
  {
    id: 'mm-seed-men-leader',
    ministry_id: 'min-men-1',
    member_id: 'usr-admin-1',
    role_title: 'Department Leader',
    duty: 'Men of Honor Fellowship Leadership & Discipleship Oversight',
    status: 'active',
    joined_at: new Date(Date.now() - 300 * 86400000).toISOString(),
    created_by: 'usr-admin-1'
  },
  {
    id: 'mm-seed-women-leader',
    ministry_id: 'min-women-1',
    member_id: 'usr-pastor-1',
    role_title: 'Department Leader',
    duty: 'Women of Grace Guild Leadership & Pastoral Oversight',
    status: 'active',
    joined_at: new Date(Date.now() - 280 * 86400000).toISOString(),
    created_by: 'usr-admin-1'
  },
  {
    id: 'mm-seed-choir-leader',
    ministry_id: 'min-1',
    member_id: 'usr-leader-1',
    role_title: 'Department Leader',
    duty: 'Choir Director & Worship Vocals Oversight',
    status: 'active',
    joined_at: new Date(Date.now() - 240 * 86400000).toISOString(),
    created_by: 'usr-admin-1'
  },
  {
    id: 'mm-seed-choir-member-1',
    ministry_id: 'min-1',
    member_id: 'usr-member-1',
    role_title: 'Soprano Lead',
    duty: 'Sunday Celebration Worship & Thursday Rehearsal Vocals',
    status: 'active',
    joined_at: new Date(Date.now() - 120 * 86400000).toISOString(),
    created_by: 'usr-leader-1'
  },
  {
    id: 'mm-seed-youth-leader',
    ministry_id: 'min-2',
    member_id: 'mem-8',
    role_title: 'Department Leader',
    duty: 'Kingdom Youth Fellowship Leadership',
    status: 'active',
    joined_at: new Date(Date.now() - 220 * 86400000).toISOString(),
    created_by: 'usr-admin-1'
  },
  {
    id: 'mm-seed-ushers-leader',
    ministry_id: 'min-3',
    member_id: 'mem-6',
    role_title: 'Department Leader',
    duty: 'Head Usher & Sanctuary Protocol Oversight',
    status: 'active',
    joined_at: new Date(Date.now() - 210 * 86400000).toISOString(),
    created_by: 'usr-admin-1'
  },
  {
    id: 'mm-seed-prayer-leader',
    ministry_id: 'min-4',
    member_id: 'mem-7',
    role_title: 'Department Leader',
    duty: 'Intercessory Prayer Coordination',
    status: 'active',
    joined_at: new Date(Date.now() - 200 * 86400000).toISOString(),
    created_by: 'usr-admin-1'
  },
  {
    id: 'mm-seed-media-leader',
    ministry_id: 'min-5',
    member_id: 'usr-admin-1',
    role_title: 'Department Leader',
    duty: 'Media & Livestream Studio Technical Direction',
    status: 'active',
    joined_at: new Date(Date.now() - 250 * 86400000).toISOString(),
    created_by: 'usr-admin-1'
  },
  {
    id: 'mm-seed-kids-leader',
    ministry_id: 'min-6',
    member_id: 'mem-9',
    role_title: 'Department Leader',
    duty: 'FaithKids Children Ministry Oversight',
    status: 'active',
    joined_at: new Date(Date.now() - 190 * 86400000).toISOString(),
    created_by: 'usr-admin-1'
  }
];

const initialJoinRequests: MinistryJoinRequest[] = [
  {
    id: 'mjr-seed-1',
    ministry_id: 'min-5',
    ministry_name: 'Media & Livestream Studio',
    member_id: 'mem-6',
    applicant_name: 'Elijah Wright',
    applicant_email: 'ewright@gmail.com',
    applicant_phone: '+1 (555) 789-0123',
    preferred_roles: ['Main Camera Operator', 'ProPresenter Slide Operator'],
    availability: 'Sundays (1st & 2nd Service) and Saturday morning setups',
    note: 'I have 2 years of experience running livestream slides and camera tripods at Living Waters.',
    status: 'pending',
    created_at: new Date(Date.now() - 3600000 * 18).toISOString()
  },
  {
    id: 'mjr-seed-2',
    ministry_id: 'min-1',
    ministry_name: 'Voices of Grace Choir',
    member_id: 'mem-7',
    applicant_name: 'Rebecca Foster',
    applicant_email: 'rfoster@gmail.com',
    applicant_phone: '+1 (555) 890-1234',
    preferred_roles: ['Soprano / Alto / Tenor Section Leaders'],
    availability: 'Thursdays 6:30 PM rehearsals & Sunday morning worship',
    note: 'Sang alto in campus worship fellowship and eager to join Voices of Grace Choir.',
    status: 'pending',
    created_at: new Date(Date.now() - 3600000 * 30).toISOString()
  }
];

const initialFinancials: FinancialRecord[] = [
  { id: 'fin-1', contributor_name: 'David Miller', category: 'tithe', amount: 500, date: new Date(Date.now() - 2 * 86400000).toISOString(), payment_method: 'card', notes: 'Monthly Tithe' },
  { id: 'fin-2', contributor_name: 'Sarah Johnson', category: 'tithe', amount: 450, date: new Date(Date.now() - 3 * 86400000).toISOString(), payment_method: 'bank_transfer', notes: 'Pastoral Tithe' },
  { id: 'fin-3', contributor_name: 'Grace Campbell', category: 'offering', amount: 80, date: new Date(Date.now() - 3 * 86400000).toISOString(), payment_method: 'card', notes: 'Sunday Celebration Offering' },
  { id: 'fin-4', contributor_name: 'Anonymous Partner', category: 'building_fund', amount: 1200, date: new Date(Date.now() - 5 * 86400000).toISOString(), payment_method: 'bank_transfer', notes: 'Sanctuary Renovation Pledge' },
  { id: 'fin-5', contributor_name: 'Hannah Adams', category: 'thanksgiving', amount: 150, date: new Date(Date.now() - 6 * 86400000).toISOString(), payment_method: 'mobile_money', notes: 'Birthday Thanksgiving Offering' },
  { id: 'fin-6', contributor_name: 'Elijah Wright', category: 'missions', amount: 200, date: new Date(Date.now() - 8 * 86400000).toISOString(), payment_method: 'cash', notes: 'Community Outreach & Food Pantry' }
];

const initialPrayers: PrayerRequest[] = [
  { id: 'pray-1', member_name: 'Grace Campbell', request: 'Please pray for my mother as she recovers from hip surgery, and for wisdom for the medical team.', date: new Date(Date.now() - 86400000).toISOString(), is_anonymous: false, prayed_count: 24 },
  { id: 'pray-2', member_name: 'Sister in Faith', request: 'Believing the Lord for guidance and breakthrough in an upcoming career advancement interview.', date: new Date(Date.now() - 2 * 86400000).toISOString(), is_anonymous: true, prayed_count: 31 },
  { id: 'pray-3', member_name: 'Samuel Okonkwo', request: 'Giving glory to God for a new job opportunity and safe relocation to our new home!', date: new Date(Date.now() - 4 * 86400000).toISOString(), is_anonymous: false, prayed_count: 42 }
];

const initialEvents: ChurchEvent[] = [
  {
    id: 'evt-1',
    branch_id: 'branch-1',
    title: 'Sunday Glorious Worship & Divine Anointing Service',
    description: 'Join Grace Cathedral for an anointed atmosphere of vibrant praise, prophetic prayer, communion, and dynamic preaching by Pastor Sarah Johnson.',
    category: 'Worship Service',
    start_time: new Date(Date.now() + 2 * 86400000).toISOString().split('T')[0] + 'T09:00:00',
    end_time: new Date(Date.now() + 2 * 86400000).toISOString().split('T')[0] + 'T11:30:00',
    location: 'Grace Cathedral Main Sanctuary',
    is_virtual: true,
    virtual_link: '/portal/streaming',
    featured_image: 'https://images.unsplash.com/photo-1510525009512-ad7fc13eefab?auto=format&fit=crop&w=1200&q=80',
    organizer_name: 'Grace Cathedral Pastoral Team',
    target_audience: 'All Congregation',
    registration_required: false,
    max_attendees: 500,
    registered_count: 240,
    status: 'upcoming',
    recurrence: 'weekly',
    recurrence_pattern: 'Every Sunday at 9:00 AM (Main Sanctuary)',
    recurring_funding_allowance: 15000,
    account_number: 'EVT-ACC-2026-001',
    account_balance: 18500
  },
  {
    id: 'evt-2',
    branch_id: 'branch-1',
    title: 'Annual Believers Prophetic Conference 2026',
    description: '3 Days of apostolic empowerment, deep scriptural revelation, guest worship ministers, and leadership workshops. Theme: "Walking in Greater Glory".',
    category: 'Conference',
    start_time: new Date(Date.now() + 12 * 86400000).toISOString().split('T')[0] + 'T18:00:00',
    end_time: new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0] + 'T21:00:00',
    location: 'Grace Cathedral Convention Hall & Main Sanctuary',
    is_virtual: true,
    virtual_link: 'https://live.faithconnect.church/conference',
    featured_image: 'https://images.unsplash.com/photo-1475721027785-f74eccf877e2?auto=format&fit=crop&w=1200&q=80',
    organizer_name: 'District Administration & Pastoral Council',
    target_audience: 'All Congregation',
    registration_required: true,
    max_attendees: 350,
    registered_count: 182,
    status: 'upcoming',
    recurrence: 'yearly',
    recurrence_pattern: 'Annual Flagship Spiritual Convention',
    recurring_funding_allowance: 45000,
    account_number: 'EVT-ACC-2026-002',
    account_balance: 34200
  },
  {
    id: 'evt-3',
    branch_id: 'branch-1',
    title: 'Men of Honor Brotherhood Fellowship Breakfast',
    description: 'A monthly gathering for all men in the church. Join us for hearty fellowship, spiritual mentorship, fatherhood Q&A, and delicious hot breakfast.',
    category: 'Fellowship & Social',
    start_time: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0] + 'T08:00:00',
    end_time: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0] + 'T10:30:00',
    location: 'Grace Hall Dining Room',
    is_virtual: false,
    featured_image: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1200&q=80',
    organizer_name: 'Men of Honor Fellowship',
    target_audience: 'Men',
    registration_required: true,
    max_attendees: 60,
    registered_count: 34,
    status: 'upcoming',
    recurrence: 'monthly',
    recurrence_pattern: '1st Saturday of Every Month at 8:00 AM',
    recurring_funding_allowance: 5000,
    account_number: 'EVT-ACC-2026-003',
    account_balance: 4800
  },
  {
    id: 'evt-4',
    branch_id: 'branch-1',
    title: 'Kingdom Youth Radical Worship Night',
    description: 'High-energy acoustic worship, live panel Q&A on faith & campus life, pizza party, and youth fellowship games.',
    category: 'Youth Event',
    start_time: new Date(Date.now() + 15 * 86400000).toISOString().split('T')[0] + 'T18:30:00',
    end_time: new Date(Date.now() + 15 * 86400000).toISOString().split('T')[0] + 'T21:00:00',
    location: 'Grace Youth Auditorium',
    is_virtual: false,
    featured_image: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=1200&q=80',
    organizer_name: 'Kingdom Youth Fellowship',
    target_audience: 'Youth & Teens',
    registration_required: false,
    max_attendees: 120,
    registered_count: 65,
    status: 'upcoming',
    recurrence: 'quarterly',
    recurrence_pattern: 'Quarterly Youth Awakening Rally',
    recurring_funding_allowance: 10000,
    account_number: 'EVT-ACC-2026-004',
    account_balance: 8900
  },
  {
    id: 'evt-5',
    branch_id: 'branch-1',
    title: 'Community Thanksgiving Food & Clothing Outreach',
    description: 'Mobilizing our church family to distribute food boxes, warm winter clothing, and prayer support to 250 local families in need.',
    category: 'Community Outreach',
    start_time: new Date(Date.now() + 20 * 86400000).toISOString().split('T')[0] + 'T10:00:00',
    end_time: new Date(Date.now() + 20 * 86400000).toISOString().split('T')[0] + 'T14:00:00',
    location: 'Grace Cathedral Grounds & Parking Plaza',
    is_virtual: false,
    featured_image: 'https://images.unsplash.com/photo-1488521787991-ed7bbaae773c?auto=format&fit=crop&w=1200&q=80',
    organizer_name: 'Ushers & Hospitality Guild',
    target_audience: 'All Congregation',
    registration_required: true,
    max_attendees: 80,
    registered_count: 45,
    status: 'upcoming'
  },
  {
    id: 'evt-6',
    branch_id: 'branch-1',
    title: 'Midweek Communion & Prayer Warfare Vigil',
    description: 'Midweek spiritual refreshment, corporate intercessory prayer for families and sick congregants, followed by holy communion.',
    category: 'Prayer & Fasting',
    start_time: new Date(Date.now() + 5 * 86400000).toISOString().split('T')[0] + 'T19:00:00',
    end_time: new Date(Date.now() + 5 * 86400000).toISOString().split('T')[0] + 'T20:30:00',
    location: 'Grace Cathedral Sanctuary',
    is_virtual: true,
    virtual_link: '/portal/streaming',
    featured_image: 'https://images.unsplash.com/photo-1544427920-c49ccfb85579?auto=format&fit=crop&w=1200&q=80',
    organizer_name: 'Intercessory Prayer Ministry',
    target_audience: 'All Congregation',
    registration_required: false,
    max_attendees: 300,
    registered_count: 110,
    status: 'upcoming'
  }
];

const initialEventRegistrations: EventRegistration[] = [
  {
    id: 'reg-1',
    event_id: 'evt-2',
    user_id: 'usr-member-1',
    member_id: 'usr-member-1',
    member_name: 'Grace Campbell',
    email: 'member@faithconnect.church',
    phone: '+1 (555) 678-9012',
    registered_at: new Date(Date.now() - 2 * 86400000).toISOString(),
    status: 'confirmed'
  },
  {
    id: 'reg-2',
    event_id: 'evt-2',
    user_id: 'usr-leader-1',
    member_id: 'usr-leader-1',
    member_name: 'Hannah Adams',
    email: 'worship@faithconnect.church',
    phone: '+1 (555) 567-8901',
    registered_at: new Date(Date.now() - 3 * 86400000).toISOString(),
    status: 'confirmed'
  },
  {
    id: 'reg-3',
    event_id: 'evt-3',
    user_id: 'usr-admin-1',
    member_id: 'usr-admin-1',
    member_name: 'David Miller',
    email: 'admin@faithconnect.church',
    phone: '+1 (555) 234-5678',
    registered_at: new Date(Date.now() - 1 * 86400000).toISOString(),
    status: 'confirmed'
  }
];

function sanitizeProfileRecord(rawProfile: any): Profile {
  const {
    temporary_password: _tp,
    login_email: _le,
    has_login_credentials: _hlc,
    ...rest
  } = rawProfile || {};

  const isCanonicalProfile = 'portal_access_status' in rest || 'record_status' in rest;
  return {
    ...rest,
    email: (rest.email || '').trim().toLowerCase(),
    phone: rest.phone || '',
    auth_user_id: rest.auth_user_id !== undefined ? (rest.auth_user_id || null) : null,
    ...(!isCanonicalProfile ? { status: rest.status || 'active' } : {}),
    membership_status: rest.membership_status || 'active',
    membership_date: rest.membership_date || (rest.created_at ? String(rest.created_at).slice(0, 10) : new Date().toISOString().slice(0, 10))
  } as Profile;
}

function getStoredUsersRaw(): Record<string, { id: string; email: string; password?: string; setup_token?: string; user_metadata?: any }> {
  const defaultUsers: Record<string, any> = {
    'admin@faithconnect.church': {
      id: 'usr-admin-1', email: 'admin@faithconnect.church', password: 'password123',
      user_metadata: { first_name: 'David', last_name: 'Miller' }
    },
    'pastor@faithconnect.church': {
      id: 'usr-pastor-1', email: 'pastor@faithconnect.church', password: 'password123',
      user_metadata: { first_name: 'Sarah', last_name: 'Johnson' }
    },
    'bishop@faithconnect.church': {
      id: 'usr-bishop-1', email: 'bishop@faithconnect.church', password: 'password123',
      user_metadata: { first_name: 'Michael', last_name: 'Thomas' }
    },
    'worship@faithconnect.church': {
      id: 'usr-leader-1', email: 'worship@faithconnect.church', password: 'password123',
      user_metadata: { first_name: 'Hannah', last_name: 'Adams' }
    },
    'member@faithconnect.church': {
      id: 'usr-member-1', email: 'member@faithconnect.church', password: 'password123',
      user_metadata: { first_name: 'Grace', last_name: 'Campbell' }
    },
    'churchadmin@faithconnect.church': {
      id: 'usr-role-admin-1', email: 'churchadmin@faithconnect.church', password: 'password123',
      user_metadata: { first_name: 'Daniel', last_name: 'Williams' }
    },
    'finance@faithconnect.church': {
      id: 'usr-finance-1', email: 'finance@faithconnect.church', password: 'password123',
      user_metadata: { first_name: 'Esther', last_name: 'Kamara' }
    },
    'worker@faithconnect.church': {
      id: 'usr-worker-1', email: 'worker@faithconnect.church', password: 'password123',
      user_metadata: { first_name: 'Joseph', last_name: 'Conteh' }
    }
  };

  let storedUsers: Record<string, any> = {};
  try {
    const raw = localStorage.getItem(USERS_STORAGE_KEY);
    if (raw) storedUsers = JSON.parse(raw);
  } catch (e) {
    console.warn('Could not read mock auth users; restoring development seed accounts.', e);
  }

  // Merge missing development accounts without overwriting user-created accounts,
  // changed passwords, or invitation/setup state for existing accounts.
  let changed = false;
  for (const [email, account] of Object.entries(defaultUsers)) {
    if (!storedUsers[email]) {
      storedUsers[email] = account;
      changed = true;
    }
  }
  if (changed || !localStorage.getItem(USERS_STORAGE_KEY)) {
    localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(storedUsers));
  }
  return storedUsers;
}

function migrateUnifiedDirectoryData(parsed: any): { db: any; changed: boolean } {
  let changed = false;
  const profilesList: any[] = Array.isArray(parsed.profiles) ? [...parsed.profiles] : [];
  const legacyMembers: any[] = Array.isArray(parsed.members) ? parsed.members : [];
  const legacyMemberIdToProfileId = new Map<string, string>([
    ['mem-1', 'usr-admin-1'],
    ['mem-2', 'usr-pastor-1'],
    ['mem-3', 'usr-bishop-1'],
    ['mem-4', 'usr-leader-1'],
    ['mem-5', 'usr-member-1']
  ]);

  const storedUsers = getStoredUsersRaw();
  const authUsersById = new Map<string, any>(Object.values(storedUsers).map((u: any) => [u.id, u]));

  if (legacyMembers.length > 0) {
    changed = true;
    for (const member of legacyMembers) {
      if (member.profile_id) {
        legacyMemberIdToProfileId.set(member.id, member.profile_id);
        const idx = profilesList.findIndex(p => p.id === member.profile_id);
        if (idx >= 0) {
          const existing = profilesList[idx];
          profilesList[idx] = {
            ...existing,
            gender: existing.gender || member.gender || 'other',
            membership_status: existing.membership_status || member.status || 'active',
            membership_date: existing.membership_date || member.membership_date,
            phone: existing.phone || member.phone || '',
            avatar_url: existing.avatar_url || member.avatar_url,
            is_baptized: existing.is_baptized ?? member.is_baptized,
            baptism_date: existing.baptism_date || member.baptism_date,
            baptized_by: existing.baptized_by || member.baptized_by,
            date_of_birth: existing.date_of_birth || member.date_of_birth,
            marital_status: existing.marital_status || member.marital_status,
            marriage_date: existing.marriage_date || member.marriage_date
          };
        }
      } else {
        legacyMemberIdToProfileId.set(member.id, member.id);
        if (!profilesList.some(p => p.id === member.id)) {
          profilesList.push({
            id: member.id,
            auth_user_id: null,
            branch_id: member.branch_id || 'branch-1',
            first_name: member.first_name,
            last_name: member.last_name,
            email: member.email || '',
            phone: member.phone || '',
            gender: member.gender || 'other',
            avatar_url: member.avatar_url || '',
            primary_role: 'member',
            status: 'active',
            membership_status: member.status || 'active',
            membership_date: member.membership_date || new Date().toISOString().slice(0, 10),
            created_at: member.created_at || (member.membership_date ? `${member.membership_date}T00:00:00.000Z` : new Date().toISOString()),
            is_baptized: member.is_baptized,
            baptism_date: member.baptism_date,
            baptized_by: member.baptized_by,
            date_of_birth: member.date_of_birth,
            marital_status: member.marital_status,
            marriage_date: member.marriage_date
          });
        }
      }
    }
    delete parsed.members;
  }

  // Ensure every profile has canonical fields & auth_user_id backfilled only if a real auth user exists
  const normalizedProfiles = profilesList.map(raw => {
    const clean = sanitizeProfileRecord(raw);
    if (clean.auth_user_id === null && raw.auth_user_id === undefined) {
      if (authUsersById.has(clean.id)) {
        clean.auth_user_id = clean.id;
        changed = true;
      }
    }
    if (
      raw.temporary_password !== undefined ||
      raw.login_email !== undefined ||
      raw.has_login_credentials !== undefined ||
      raw.auth_user_id === undefined ||
      raw.membership_status === undefined ||
      raw.status === undefined
    ) {
      changed = true;
    }
    return clean;
  });
  parsed.profiles = normalizedProfiles;

  const remapTableMemberIds = (tableKey: string) => {
    if (!Array.isArray(parsed[tableKey])) return;
    parsed[tableKey] = parsed[tableKey].map((row: any) => {
      if (row.member_id && legacyMemberIdToProfileId.has(row.member_id)) {
        const mapped = legacyMemberIdToProfileId.get(row.member_id)!;
        if (mapped !== row.member_id) {
          changed = true;
          return { ...row, member_id: mapped };
        }
      }
      return row;
    });
  };

  remapTableMemberIds('member_transfers');
  remapTableMemberIds('ministry_members');
  remapTableMemberIds('ministry_join_requests');
  remapTableMemberIds('event_registrations');
  remapTableMemberIds('event_survey_responses');

  // Existing demo event IDs (evt-1, etc.) are application identifiers, not
  // PostgreSQL UUIDs. Persist a separate UUID bridge for canonical finance
  // workflows; never cast or reinterpret the application ID.
  if (Array.isArray(parsed.events)) {
    parsed.events = parsed.events.map((event: any) => {
      if (typeof event.finance_event_id === 'string' &&
          /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(event.finance_event_id)) {
        return event;
      }
      changed = true;
      return {
        ...event,
        finance_event_id: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(event.id)
          ? event.id
          : createMockUuid()
      };
    });
  }

  return { db: parsed, changed };
}

// Load or seed local database
function loadLocalDatabase() {
  try {
    const raw = localStorage.getItem(DB_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // Ensure single-church tables are always populated even if old DB exists
      if (!parsed.ministries || parsed.ministries.length === 0) {
        parsed.ministries = initialMinistries;
      } else {
        // Check if Men or Women ministries exist, if not merge them
        const hasMen = parsed.ministries.some((m: any) => m.category?.toLowerCase() === 'men');
        const hasWomen = parsed.ministries.some((m: any) => m.category?.toLowerCase() === 'women');
        if (!hasMen) parsed.ministries.unshift(initialMinistries[0]);
        if (!hasWomen) parsed.ministries.unshift(initialMinistries[1]);

        // Enrich existing ministries with default type and roles_and_responsibilities if missing
        parsed.ministries = parsed.ministries.map((m: any) => {
          let inferredType = m.type;
          if (!inferredType) {
            const cat = (m.category || '').toLowerCase();
            const name = (m.name || '').toLowerCase();
            if (['men', 'women', 'youth', 'children', 'social', 'fellowship', 'guild'].some(k => cat.includes(k) || name.includes(k))) {
              inferredType = 'social_fellowship';
            } else {
              inferredType = 'service_department';
            }
          }
          if (!m.roles_and_responsibilities || m.roles_and_responsibilities.length === 0) {
            const match = initialMinistries.find(i => i.id === m.id || i.name === m.name);
            return {
              ...m,
              type: inferredType,
              roles_and_responsibilities: match?.roles_and_responsibilities || [
                'Department Team Member',
                'Service Duty Volunteer',
                'Ministry Meeting Participant'
              ]
            };
          }
          return {
            ...m,
            type: inferredType
          };
        });
      }
      if (!parsed.financial_records || parsed.financial_records.length === 0) parsed.financial_records = initialFinancials;
      if (!parsed.prayer_requests || parsed.prayer_requests.length === 0) parsed.prayer_requests = initialPrayers;
      if (!parsed.events || parsed.events.length === 0) parsed.events = initialEvents;
      if (!parsed.event_registrations || parsed.event_registrations.length === 0) parsed.event_registrations = initialEventRegistrations;
      if (!Array.isArray(parsed.ministry_members)) parsed.ministry_members = [];
      let seededMinistryMembers = false;
      if (!parsed.ministry_members_seeded_v1) {
        const existingPairs = new Set(
          parsed.ministry_members.map((entry: any) => `${entry.ministry_id}:${entry.member_id}`)
        );
        const missingSeeds = initialMinistryMembers.filter(
          seed => !existingPairs.has(`${seed.ministry_id}:${seed.member_id}`)
        );
        if (missingSeeds.length > 0) {
          parsed.ministry_members = [...parsed.ministry_members, ...missingSeeds];
        }
        parsed.ministry_members_seeded_v1 = true;
        seededMinistryMembers = true;
      }
      if (!Array.isArray(parsed.ministry_join_requests)) {
        let legacyJoinRequests: MinistryJoinRequest[] | null = null;
        try {
          const legacyRaw = localStorage.getItem('faithconnect_ministry_join_requests_v1');
          if (legacyRaw) {
            const legacyParsed = JSON.parse(legacyRaw);
            if (Array.isArray(legacyParsed) && legacyParsed.length > 0) {
              legacyJoinRequests = legacyParsed;
            }
          }
        } catch {
          // Ignore legacy join request parse errors
        }
        parsed.ministry_join_requests = legacyJoinRequests || initialJoinRequests;
      }
      if (!Array.isArray(parsed.church_resources)) parsed.church_resources = [];
      if (!Array.isArray(parsed.event_surveys)) parsed.event_surveys = [];
      if (!Array.isArray(parsed.event_survey_questions)) parsed.event_survey_questions = [];
      if (!Array.isArray(parsed.event_survey_responses)) parsed.event_survey_responses = [];
      if (!Array.isArray(parsed.event_survey_answers)) parsed.event_survey_answers = [];
      if (!Array.isArray(parsed.roles)) parsed.roles = [];
      const existingRoleNames = new Set(parsed.roles.map((role: any) => role.name));
      parsed.roles = [
        ...parsed.roles,
        ...initialSystemRoles.filter(role => !existingRoleNames.has(role.name))
      ];
      if (!Array.isArray(parsed.profiles)) parsed.profiles = [];
      if (!Array.isArray(parsed.permissions)) parsed.permissions = [];
      const existingPermissionKeys = new Set(parsed.permissions.map((permission: any) => permission.key));
      parsed.permissions = [
        ...parsed.permissions,
        ...initialPermissions.filter(permission => !existingPermissionKeys.has(permission.key))
      ];
      if (!Array.isArray(parsed.role_permissions)) parsed.role_permissions = [];
      if (!Array.isArray(parsed.customized_role_permission_ids)) parsed.customized_role_permission_ids = [];
      const customizedRolePermissionIds = new Set<string>(parsed.customized_role_permission_ids);
      const roleIdsByName = new Map((parsed.roles || []).map((role: any) => [role.name, role.id]));
      const permissionIdsByKey = new Map((parsed.permissions || []).map((permission: any) => [permission.key, permission.id]));
      const seededRolePermissionLinks = initialRolePermissions.map(link => {
        const seedRole = initialSystemRoles.find(role => role.id === link.role_id);
        const seedPermission = initialPermissions.find(permission => permission.id === link.permission_id);
        return {
          role_id: seedRole ? roleIdsByName.get(seedRole.name) : null,
          permission_id: seedPermission ? permissionIdsByKey.get(seedPermission.key) : null
        };
      }).filter((link: any) => link.role_id && link.permission_id && !customizedRolePermissionIds.has(link.role_id));
      const existingRolePermissionKeys = new Set(parsed.role_permissions.map((link: any) => `${link.role_id}:${link.permission_id}`));
      parsed.role_permissions = [
        ...parsed.role_permissions,
        ...seededRolePermissionLinks.filter((link: any) => !existingRolePermissionKeys.has(`${link.role_id}:${link.permission_id}`))
      ];
      // Bootstrap legacy role assignments only when the table is absent.
      // An explicit empty array is authoritative: never reconstruct permissions
      // from the compatibility-only profiles.primary_role field.
      let migratedLegacyRoleAssignments = false;
      if (!Array.isArray(parsed.profile_role_assignments)) {
        const roleIds = new Map(initialSystemRoles.map(role => [role.name, role.id]));
        parsed.profile_role_assignments = (parsed.profiles || []).map((profile: any) => {
          const isDistrictAdmin = profile.primary_role === 'district_admin';
          return {
            id: `mock-assignment-${profile.id}`,
            profile_id: profile.id,
            role_id: roleIds.get(profile.primary_role || 'member') || roleIds.get('member'),
            scope_type: isDistrictAdmin ? 'district' : 'church',
            branch_id: null,
            district_id: isDistrictAdmin ? 'dist-1' : null,
            assigned_by_profile_id: 'usr-admin-1',
            assigned_at: profile.created_at || new Date().toISOString(),
            expires_at: null,
            is_active: true
          };
        });
        migratedLegacyRoleAssignments = true;
      }

      // Restore the fixed development identities and their role assignments
      // into existing browser databases without replacing user data.
      let restoredMockRoleProfiles = false;
      const seededLoginProfiles = initialProfiles.filter(profile => profile.auth_user_id);
      const existingProfileIds = new Set((parsed.profiles || []).map((profile: any) => profile.id));
      const existingProfileEmails = new Set((parsed.profiles || []).map((profile: any) => (profile.email || '').toLowerCase()));
      for (const seedProfile of seededLoginProfiles) {
        if (!existingProfileIds.has(seedProfile.id) && !existingProfileEmails.has(seedProfile.email.toLowerCase())) {
          parsed.profiles.push(sanitizeProfileRecord(seedProfile));
          existingProfileIds.add(seedProfile.id);
          existingProfileEmails.add(seedProfile.email.toLowerCase());
          restoredMockRoleProfiles = true;
        }
      }
      const assignmentKeys = new Set((parsed.profile_role_assignments || []).map((item: any) => `${item.profile_id}:${item.role_id}`));
      const seededRoleIdsByName = new Map((parsed.roles || []).map((role: any) => [role.name, role.id]));
      for (const seedProfile of seededLoginProfiles) {
        const roleId = seededRoleIdsByName.get(seedProfile.primary_role);
        if (existingProfileIds.has(seedProfile.id) && roleId && !assignmentKeys.has(`${seedProfile.id}:${roleId}`)) {
          parsed.profile_role_assignments.push({
            id: `mock-assignment-${seedProfile.id}`,
            profile_id: seedProfile.id,
            role_id: roleId,
            scope_type: 'church',
            branch_id: null,
            district_id: null,
            assigned_by_profile_id: 'usr-admin-1',
            assigned_at: seedProfile.created_at,
            expires_at: null,
            is_active: true
          });
          assignmentKeys.add(`${seedProfile.id}:${roleId}`);
          restoredMockRoleProfiles = true;
        }
      }

      const migrated = migrateUnifiedDirectoryData(parsed);
      if (migrated.changed || migratedLegacyRoleAssignments || seededMinistryMembers || restoredMockRoleProfiles) {
        saveLocalDatabase(migrated.db);
      }
      return migrated.db;
    }
  } catch (e) {
    console.warn("Could not read local DB, initializing fresh:", e);
  }

  const initialDb = {
    districts: initialDistricts,
    church_branches: initialBranches,
    profiles: initialProfiles.map(p => sanitizeProfileRecord(p)),
    roles: initialSystemRoles,
    permissions: initialPermissions,
    role_permissions: initialRolePermissions,
    customized_role_permission_ids: [] as string[],
    profile_role_assignments: initialProfiles.map(profile => {
      const isDistrictAdmin = profile.primary_role === 'district_admin';
      return {
        id: `mock-assignment-${profile.id}`,
        profile_id: profile.id,
        role_id: initialSystemRoles.find(role => role.name === profile.primary_role)?.id || 'mock-role-member',
        scope_type: isDistrictAdmin ? 'district' : 'church',
        branch_id: null,
        district_id: isDistrictAdmin ? 'dist-1' : null,
        assigned_by_profile_id: 'usr-admin-1',
        assigned_at: profile.created_at,
        expires_at: null,
        is_active: true
      };
    }),
    member_transfers: initialTransfers,
    streams: initialStreams,
    stream_chat_messages: initialMessages,
    ministries: initialMinistries,
    ministry_members: initialMinistryMembers,
    ministry_members_seeded_v1: true,
    ministry_join_requests: initialJoinRequests,
    church_resources: [],
    event_surveys: [],
    event_survey_questions: [],
    event_survey_responses: [],
    event_survey_answers: [],
    financial_records: initialFinancials,
    prayer_requests: initialPrayers,
    events: initialEvents.map(event => ({
      ...event,
      finance_event_id: event.finance_event_id || createMockUuid()
    })),
    event_registrations: initialEventRegistrations,
    stream_credentials: [
      { id: 'cred-1', branch_id: 'branch-1', rtmp_server: 'rtmp://live.faithconnect.church/live', stream_key: 'sk_live_faithconnect_grace_883' }
    ]
  };

  saveLocalDatabase(initialDb);
  return initialDb;
}

function saveLocalDatabase(db: any) {
  try {
    localStorage.setItem(DB_STORAGE_KEY, JSON.stringify(db));
  } catch (e) {
    console.error("Failed saving local DB:", e);
  }
}

// Global in-memory & synced database
let localDb = loadLocalDatabase();

// Canonical mock finance records are stored separately from legacy demo
// FinancialRecord data. Identity and effective permissions are resolved from
// the existing mock directory/role-assignment tables on every RPC call.
const mockFinanceFallbackValues = new Map<string, string>();
const mockFinanceKeyValueStorage = typeof localStorage !== 'undefined'
  ? localStorage
  : {
      getItem: (key: string) => mockFinanceFallbackValues.get(key) ?? null,
      setItem: (key: string, value: string) => { mockFinanceFallbackValues.set(key, value); }
    };
const persistedMockFinanceStorage = createBrowserMockFinanceStorage(mockFinanceKeyValueStorage);
const mockFinanceRpc = createMockFinanceRpc({
  load() {
    const state = persistedMockFinanceStorage.load();
    // These event rows are local mock application records, not evidence of a
    // corresponding live public.events row. Only their explicit UUID bridge
    // is exposed to the isolated mock finance RPC adapter.
    state.events = (localDb.events || []).map((event: any) => ({
      id: event.finance_event_id,
      branch_id: event.branch_id,
      name: event.title || event.name || 'Church event',
      title: event.title || event.name || 'Church event'
    })).filter((event: any) => typeof event.id === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(event.id));
    state.profiles = (localDb.profiles || []).map((profile: any) => ({
      id: profile.id,
      auth_user_id: profile.auth_user_id || null,
      status: profile.status,
      branch_id: profile.branch_id ?? null,
      first_name: profile.first_name || '',
      last_name: profile.last_name || '',
      membership_status: profile.membership_status || 'active',
      record_status: profile.record_status || 'active'
    }));
    state.ministries = (localDb.ministries || []).map((ministry: any) => ({
      id: ministry.id,
      branch_id: ministry.branch_id ?? null,
      name: ministry.name || ministry.title || 'Ministry',
      entity_type: ministry.entity_type || 'ministry',
      status: ministry.status || 'active'
    }));
    const branches = localDb.church_branches || [];
    const now = Date.now();
    const resolved: Array<{ profile_id: string; permission: string; branch_id: string | null }> = [];
    (localDb.profile_role_assignments || []).forEach((assignment: any) => {
      if (!assignment.is_active || new Date(assignment.assigned_at || 0).getTime() > now ||
          (assignment.expires_at && new Date(assignment.expires_at).getTime() <= now)) return;
      const role = (localDb.roles || []).find((item: any) => item.id === assignment.role_id && item.is_active);
      if (!role) return;
      const permissionIds = (localDb.role_permissions || [])
        .filter((link: any) => link.role_id === role.id)
        .map((link: any) => link.permission_id);
      const permissionKeys = (localDb.permissions || [])
        .filter((permission: any) => permissionIds.includes(permission.id))
        .map((permission: any) => permission.key);
      const scopedBranches = assignment.scope_type === 'church'
        ? [null]
        : assignment.scope_type === 'branch'
          ? branches.filter((branch: any) => branch.id === assignment.branch_id).map((branch: any) => branch.id)
          : assignment.scope_type === 'district'
            ? branches.filter((branch: any) => branch.district_id === assignment.district_id).map((branch: any) => branch.id)
            : [];
      resolved.push(...expandMockFinancePermissions(assignment.profile_id, permissionKeys, scopedBranches));
    });
    state.permissions = resolved;
    return state;
  },
  save(state) {
    // Profiles and permissions are authoritative in the shared mock directory;
    // only finance configuration and transaction state belong in this store.
    persistedMockFinanceStorage.save({ ...state, profiles: [], permissions: [], ministries: [] });
  }
}, () => ({ userId: getCurrentSession()?.user?.id || null }));


// Auth event listeners
type AuthListener = (event: string, session: any) => void;
const authListeners = new Set<AuthListener>();

function notifyAuthChange(event: string, session: any) {
  authListeners.forEach(listener => {
    try {
      listener(event, session);
    } catch (e) {
      console.error("Error in auth listener:", e);
    }
  });
}

// Current session
function getCurrentSession() {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.warn("Error parsing session:", e);
  }
  return null;
}

function setCurrentSession(session: any) {
  if (session) {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  } else {
    localStorage.removeItem(SESSION_STORAGE_KEY);
  }
}

// Local users registered
function getStoredUsers(): Record<string, { id: string; email: string; password?: string; setup_token?: string; user_metadata?: any }> {
  return getStoredUsersRaw();
}

function saveStoredUsers(users: Record<string, any>) {
  localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users));
}

// Realtime Channel subscriptions
type ChannelListener = {
  event: string;
  callback: (payload: any) => void;
};
const channelMap = new Map<string, ChannelListener[]>();

// Query Builder for local DB
class LocalQueryBuilder {
  private tableName: string;
  private filters: ((row: any) => boolean)[] = [];
  private orderField?: string;
  private orderAscending = true;
  private limitCount?: number;
  private isCountExact = false;
  private isHead = false;
  private isSingle = false;
  private isMaybeSingle = false;
  private pendingInsertData?: any;
  private pendingUpdateData?: any;
  private pendingDelete = false;

  constructor(tableName: string) {
    this.tableName = tableName;
  }

  select(_columns = '*', options?: { count?: string; head?: boolean }) {
    if (options?.count === 'exact') this.isCountExact = true;
    if (options?.head) this.isHead = true;
    return this;
  }

  insert(data: any) {
    this.pendingInsertData = Array.isArray(data) ? data : [data];
    return this;
  }

  update(data: any) {
    this.pendingUpdateData = data;
    return this;
  }

  delete() {
    this.pendingDelete = true;
    return this;
  }

  eq(field: string, value: any) {
    this.filters.push(row => row[field] === value);
    return this;
  }

  in(field: string, values: any[]) {
    const accepted = new Set(values);
    this.filters.push(row => accepted.has(row[field]));
    return this;
  }

  ilike(field: string, pattern: string) {
    const cleanPattern = pattern.replace(/%/g, '').toLowerCase();
    this.filters.push(row => {
      const val = String(row[field] || '').toLowerCase();
      return val.includes(cleanPattern);
    });
    return this;
  }

  order(field: string, options?: { ascending?: boolean }) {
    this.orderField = field;
    this.orderAscending = options?.ascending ?? true;
    return this;
  }

  limit(count: number) {
    this.limitCount = count;
    return this;
  }

  single() {
    this.isSingle = true;
    return this;
  }

  maybeSingle() {
    this.isMaybeSingle = true;
    return this;
  }

  // Executes query when awaited
  async then(resolve: (res: { data: any; error: any; count?: number }) => void) {
    localDb = loadLocalDatabase();
    const rows = (localDb[this.tableName] || []) as any[];

    // 1. DELETE
    if (this.pendingDelete) {
      const remaining = rows.filter(row => !this.filters.every(f => f(row)));
      localDb[this.tableName] = remaining;
      saveLocalDatabase(localDb);
      if (typeof window !== 'undefined' && (this.tableName === 'events' || this.tableName === 'event_registrations')) {
        window.dispatchEvent(new CustomEvent('church_events_updated', { detail: { table: this.tableName, action: 'delete' } }));
      }
      if (typeof window !== 'undefined' && ['ministry_members', 'ministries', 'ministry_join_requests', 'profiles'].includes(this.tableName)) {
        window.dispatchEvent(new CustomEvent('ministry_join_requests_updated', { detail: { table: this.tableName, action: 'delete' } }));
      }
      resolve({ data: null, error: null });
      return;
    }

    // 2. UPDATE
    if (this.pendingUpdateData) {
      if (this.tableName === 'profiles' && this.pendingUpdateData.auth_user_id) {
        const incomingAuthId = this.pendingUpdateData.auth_user_id;
        const targetIds = new Set(rows.filter(r => this.filters.every(f => f(r))).map(r => r.id));
        const collision = rows.some(row => !targetIds.has(row.id) && row.auth_user_id === incomingAuthId);
        if (collision) {
          resolve({
            data: null,
            error: {
              code: '23505',
              message: 'duplicate key value violates unique constraint "idx_profiles_auth_user_id_unique"'
            }
          });
          return;
        }
      }

      let updatedCount = 0;
      const updatedRows = rows.map(row => {
        if (this.filters.every(f => f(row))) {
          updatedCount++;
          const merged = { ...row, ...this.pendingUpdateData };
          return this.tableName === 'profiles' ? sanitizeProfileRecord(merged) : merged;
        }
        return row;
      });
      localDb[this.tableName] = updatedRows;
      saveLocalDatabase(localDb);
      if (typeof window !== 'undefined' && (this.tableName === 'events' || this.tableName === 'event_registrations')) {
        window.dispatchEvent(new CustomEvent('church_events_updated', { detail: { table: this.tableName, action: 'update' } }));
      }
      if (typeof window !== 'undefined' && ['ministry_members', 'ministries', 'ministry_join_requests', 'profiles'].includes(this.tableName)) {
        window.dispatchEvent(new CustomEvent('ministry_join_requests_updated', { detail: { table: this.tableName, action: 'update' } }));
      }
      const returnedRows = updatedRows.filter(row => this.filters.every(f => f(row)));
      if (this.isSingle) {
        resolve({ data: returnedRows[0] || null, error: returnedRows[0] ? null : { message: 'Row not found' }, count: updatedCount });
      } else {
        resolve({ data: returnedRows, error: null, count: updatedCount });
      }
      return;
    }

    // 3. INSERT
    if (this.pendingInsertData) {
      if (this.tableName === 'profiles') {
        const incomingAuthIds = this.pendingInsertData
          .map((item: any) => item.auth_user_id)
          .filter((authUserId: string | null | undefined): authUserId is string => Boolean(authUserId));
        const hasDuplicateIncoming = new Set(incomingAuthIds).size !== incomingAuthIds.length;
        const hasExistingLink = incomingAuthIds.some(authUserId => rows.some(row => row.auth_user_id === authUserId));
        if (hasDuplicateIncoming || hasExistingLink) {
          resolve({
            data: null,
            error: {
              code: '23505',
              message: 'duplicate key value violates unique constraint "idx_profiles_auth_user_id_unique"'
            }
          });
          return;
        }
      }
      const inserted = this.pendingInsertData.map((item: any) => {
        const record = {
          id: item.id || `${this.tableName === 'profiles' ? 'per' : 'item'}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          created_at: item.created_at || new Date().toISOString(),
          ...item,
          ...(this.tableName === 'events' ? {
            finance_event_id: item.finance_event_id ||
              (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(item.id || '')
                ? item.id : createMockUuid())
          } : {})
        };
        return this.tableName === 'profiles' ? sanitizeProfileRecord(record) : record;
      });
      localDb[this.tableName] = [...rows, ...inserted];
      saveLocalDatabase(localDb);
      if (typeof window !== 'undefined' && (this.tableName === 'events' || this.tableName === 'event_registrations')) {
        window.dispatchEvent(new CustomEvent('church_events_updated', { detail: { table: this.tableName, action: 'insert' } }));
      }
      if (typeof window !== 'undefined' && ['ministry_members', 'ministries', 'ministry_join_requests', 'profiles'].includes(this.tableName)) {
        window.dispatchEvent(new CustomEvent('ministry_join_requests_updated', { detail: { table: this.tableName, action: 'insert' } }));
      }

      // Trigger realtime handlers if stream chat message
      if (this.tableName === 'stream_chat_messages') {
        inserted.forEach((newMsg: any) => {
          const listeners = channelMap.get(`stream_chat:${newMsg.stream_id}`) || [];
          listeners.forEach(l => {
            if (l.event === 'postgres_changes') {
              l.callback({ eventType: 'INSERT', new: newMsg });
            }
          });
        });
      }

      if (this.isSingle) {
        resolve({ data: inserted[0] || null, error: null });
      } else {
        resolve({ data: inserted, error: null });
      }
      return;
    }

    // 4. SELECT
    let result = rows.filter(row => this.filters.every(f => f(row)));
    const totalCount = result.length;

    if (this.orderField) {
      const field = this.orderField;
      result.sort((a, b) => {
        const valA = a[field];
        const valB = b[field];
        if (valA < valB) return this.orderAscending ? -1 : 1;
        if (valA > valB) return this.orderAscending ? 1 : -1;
        return 0;
      });
    }

    if (this.limitCount !== undefined) {
      result = result.slice(0, this.limitCount);
    }

    // Enrich joins (e.g. district:districts(*), profile:profiles(*), etc.)
    if (this.tableName === 'church_branches') {
      result = result.map(branch => ({
        ...branch,
        district: localDb.districts?.find((d: any) => d.id === branch.district_id) || null
      }));
    } else if (this.tableName === 'member_transfers') {
      result = result.map(transfer => ({
        ...transfer,
        member: localDb.profiles?.find((p: any) => p.id === transfer.member_id) || { first_name: 'Member', last_name: '' },
        from_branch: localDb.church_branches?.find((b: any) => b.id === transfer.from_branch_id) || { name: 'Campus' },
        to_branch: localDb.church_branches?.find((b: any) => b.id === transfer.to_branch_id) || { name: 'Campus' }
      }));
    } else if (this.tableName === 'stream_chat_messages') {
      result = result.map(msg => ({
        ...msg,
        profile: localDb.profiles?.find((p: any) => p.id === msg.user_id) || {
          first_name: 'Congregant',
          last_name: '',
          avatar_url: '',
          primary_role: 'member'
        }
      }));
    }

    if (this.isHead) {
      resolve({ data: null, error: null, count: totalCount });
      return;
    }

    if (this.isSingle) {
      if (result.length === 0) {
        resolve({ data: null, error: { message: 'Row not found' }, count: 0 });
      } else {
        resolve({ data: result[0], error: null, count: 1 });
      }
      return;
    }

    if (this.isMaybeSingle) {
      resolve({ data: result[0] || null, error: null, count: result.length ? 1 : 0 });
      return;
    }

    resolve({ data: result, error: null, count: totalCount });
  }
}

// Local Auth implementation
const localAuth = {
  async getSession() {
    const session = getCurrentSession();
    return { data: { session }, error: null };
  },

  onAuthStateChange(callback: (event: string, session: any) => void) {
    authListeners.add(callback);
    // Initial call if session exists
    const current = getCurrentSession();
    if (current) {
      setTimeout(() => callback('INITIAL_SESSION', current), 10);
    }
    return {
      data: {
        subscription: {
          unsubscribe() {
            authListeners.delete(callback);
          }
        }
      }
    };
  },

  async signUp({ email, password, options }: { email: string; password?: string; options?: { data?: any } }) {
    const normalizedEmail = email.trim().toLowerCase();
    const users = getStoredUsers();

    if (!normalizedEmail || !password) {
      return { data: { user: null, session: null }, error: { message: 'A valid email and password are required.' } };
    }

    if (users[normalizedEmail]) {
      return {
        data: { user: null, session: null },
        error: { message: 'An account with this email already exists. Please sign in instead.' }
      };
    }

    localDb = loadLocalDatabase();
    const existingDirectoryPerson = (localDb.profiles || []).find(
      (p: any) => (p.email || '').trim().toLowerCase() === normalizedEmail
    );
    if (existingDirectoryPerson) {
      return {
        data: { user: null, session: null },
        error: { message: 'A church directory record already uses this email. Please ask a church administrator to provision portal access.' }
      };
    }

    const newId = createMockUuid();
    const userData = {
      id: newId,
      email: normalizedEmail,
      password: password || 'password123',
      user_metadata: options?.data || {}
    };

    users[normalizedEmail] = userData;
    saveStoredUsers(users);

    const firstBranch = localDb.church_branches?.[0]?.id || 'branch-1';
    const newProfile: Profile = sanitizeProfileRecord({
      id: createMockUuid(),
      auth_user_id: newId,
      branch_id: options?.data?.branch_id || firstBranch,
      first_name: options?.data?.first_name || 'Faithful',
      last_name: options?.data?.last_name || 'Member',
      email: normalizedEmail,
      phone: options?.data?.phone || '',
      avatar_url: options?.data?.avatar_url || `https://picsum.photos/seed/${newId}/100/100`,
      primary_role: (options?.data?.primary_role as any) || 'member',
      status: 'active',
      membership_status: 'active',
      membership_date: new Date().toISOString().slice(0, 10),
      created_at: new Date().toISOString()
    });
    localDb.profiles = [...(localDb.profiles || []), newProfile];
    saveLocalDatabase(localDb);

    const session = {
      access_token: `mock_jwt_${newId}`,
      token_type: 'bearer',
      expires_in: 3600,
      user: {
        id: newId,
        email: normalizedEmail,
        user_metadata: options?.data
      }
    };

    setCurrentSession(session);
    notifyAuthChange('SIGNED_IN', session);

    return {
      data: {
        user: session.user,
        session
      },
      error: null
    };
  },

  /**
   * Provisions portal access for an existing canonical person record without
   * storing plaintext passwords on profiles. Generates a one-time setup token
   * so the member can set their own password via /auth.
   */
  async provisionPortalAccess({
    profileId,
    email,
    firstName,
    lastName,
    primaryRole
  }: {
    profileId: string;
    email: string;
    firstName?: string;
    lastName?: string;
    primaryRole?: string;
  }) {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return { data: null, error: { message: 'A valid email address is required to enable portal access.' } };
    }

    localDb = loadLocalDatabase();
    const targetProfile = (localDb.profiles || []).find((p: any) => p.id === profileId);
    if (!targetProfile) {
      return { data: null, error: { message: 'Member directory record not found.' } };
    }

    const users = getStoredUsers();
    const emailConflict = Object.values(users).find(
      (u: any) => u.email === normalizedEmail && u.id !== targetProfile.auth_user_id
    );
    if (emailConflict) {
      return { data: null, error: { message: 'Another portal account already uses this email address.' } };
    }

    const authUserId = targetProfile.auth_user_id || createMockUuid();
    // Remove previous email entry if email changed for the same authUserId
    for (const [key, value] of Object.entries(users)) {
      if (value.id === authUserId && key !== normalizedEmail) {
        delete users[key];
      }
    }

    const setupToken = `setup_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    const existingAuth = users[normalizedEmail];
    users[normalizedEmail] = {
      id: authUserId,
      email: normalizedEmail,
      password: existingAuth?.password,
      setup_token: existingAuth?.password ? undefined : setupToken,
      user_metadata: {
        first_name: firstName ?? targetProfile.first_name,
        last_name: lastName ?? targetProfile.last_name
      }
    };
    saveStoredUsers(users);

    // Ensure uniqueness before linking auth_user_id onto the profile
    const authCollision = (localDb.profiles || []).some(
      (p: any) => p.id !== profileId && p.auth_user_id === authUserId
    );
    if (authCollision) {
      return {
        data: null,
        error: {
          code: '23505',
          message: 'duplicate key value violates unique constraint "idx_profiles_auth_user_id_unique"'
        }
      };
    }

    localDb.profiles = (localDb.profiles || []).map((p: any) =>
      p.id === profileId
        ? sanitizeProfileRecord({
            ...p,
            auth_user_id: authUserId,
            email: normalizedEmail,
            portal_access_status: 'invited',
            status: p.status === 'archived' ? 'active' : (p.status || 'active')
          })
        : p
    );
    saveLocalDatabase(localDb);

    const effectiveToken = users[normalizedEmail].setup_token || setupToken;
    const setupUrl = `/auth?setup=${encodeURIComponent(effectiveToken)}&email=${encodeURIComponent(normalizedEmail)}`;

    return {
      data: {
        authUserId,
        email: normalizedEmail,
        setupToken: effectiveToken,
        setupUrl,
        alreadyActivated: Boolean(existingAuth?.password)
      },
      error: null
    };
  },

  /**
   * Completes password setup for an invited portal account without storing
   * any password on the profiles table.
   */
  async completePasswordSetup({
    email,
    setupToken,
    newPassword
  }: {
    email: string;
    setupToken: string;
    newPassword: string;
  }) {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !setupToken.trim() || !newPassword || newPassword.length < 6) {
      return { data: { user: null, session: null }, error: { message: 'Valid email, activation token, and a password of at least 6 characters are required.' } };
    }

    const users = getStoredUsers();
    const user = users[normalizedEmail];
    if (!user || !user.setup_token || user.setup_token !== setupToken.trim()) {
      return { data: { user: null, session: null }, error: { message: 'Invalid or expired portal activation token.' } };
    }

    localDb = loadLocalDatabase();
    const profile = (localDb.profiles || []).find(
      (p: any) => p.auth_user_id === user.id
    );
    if (!profile) {
      return { data: { user: null, session: null }, error: { message: 'This portal account is not linked to a directory person. Please contact a church administrator.' } };
    }
    if (profile.portal_access_status === 'suspended' || profile.status === 'suspended' || profile.status === 'archived') {
      return { data: { user: null, session: null }, error: { message: 'This portal account is suspended or archived.' } };
    }

    users[normalizedEmail] = {
      ...user,
      password: newPassword,
      setup_token: undefined
    };
    localDb.profiles = (localDb.profiles || []).map((item: any) =>
      item.auth_user_id === user.id
        ? sanitizeProfileRecord({ ...item, portal_access_status: 'active', status: 'active' })
        : item
    );
    saveLocalDatabase(localDb);
    saveStoredUsers(users);

    const session = {
      access_token: `mock_jwt_${user.id}`,
      token_type: 'bearer',
      expires_in: 3600,
      user: {
        id: user.id,
        email: user.email,
        user_metadata: user.user_metadata
      }
    };
    setCurrentSession(session);
    notifyAuthChange('SIGNED_IN', session);
    return { data: { user: session.user, session }, error: null };
  },

  /**
   * Revokes portal access for a canonical person record by removing the auth user
   * and clearing auth_user_id WITHOUT deleting their church membership profile.
   */
  async revokePortalAccess(profileId: string) {
    localDb = loadLocalDatabase();
    const target = (localDb.profiles || []).find((p: any) => p.id === profileId || p.auth_user_id === profileId);
    const authUserId = target?.auth_user_id || profileId;

    const users = getStoredUsers();
    const entry = Object.entries(users).find(([, user]) => user.id === authUserId);
    if (entry) {
      delete users[entry[0]];
      saveStoredUsers(users);
    }

    localDb.profiles = (localDb.profiles || []).map((item: any) =>
      (item.id === profileId || item.auth_user_id === authUserId)
        ? sanitizeProfileRecord({ ...item, auth_user_id: null, portal_access_status: 'not_invited' })
        : item
    );
    saveLocalDatabase(localDb);

    const currentSession = getCurrentSession();
    if (currentSession?.user?.id === authUserId) {
      setCurrentSession(null);
      notifyAuthChange('SIGNED_OUT', null);
    }
    return { error: null };
  },

  /**
   * Creates a demo portal account without signing the administrator out or
   * switching the active demo session to the newly created user.
   */
  async createUser({ email, password, options }: { email: string; password?: string; options?: { data?: any } }) {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      return { data: { user: null }, error: { message: 'Email is required.' } };
    }

    const users = getStoredUsers();
    if (users[normalizedEmail]) {
      return { data: { user: null }, error: { message: 'An account with this email already exists.' } };
    }

    const newId = createMockUuid();
    const userMetadata = options?.data || {};
    const setupToken = password ? undefined : `setup_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    users[normalizedEmail] = {
      id: newId,
      email: normalizedEmail,
      ...(password ? { password } : { setup_token: setupToken }),
      user_metadata: userMetadata
    };
    saveStoredUsers(users);

    localDb = loadLocalDatabase();
    const firstBranch = localDb.church_branches?.[0]?.id || 'branch-1';
    const existingProfileId = userMetadata.profile_id;
    if (existingProfileId) {
      localDb.profiles = (localDb.profiles || []).map((p: any) =>
        p.id === existingProfileId ? sanitizeProfileRecord({ ...p, auth_user_id: newId, email: normalizedEmail }) : p
      );
    } else {
      const newProfile: Profile = sanitizeProfileRecord({
        id: createMockUuid(),
        auth_user_id: newId,
        branch_id: userMetadata.branch_id || firstBranch,
        first_name: userMetadata.first_name || 'Faithful',
        last_name: userMetadata.last_name || 'Member',
        email: normalizedEmail,
        phone: userMetadata.phone || '',
        avatar_url: userMetadata.avatar_url || `https://picsum.photos/seed/${newId}/100/100`,
        primary_role: (userMetadata.primary_role as any) || 'member',
        status: 'active',
        membership_status: 'active',
        membership_date: new Date().toISOString().slice(0, 10),
        department_name: userMetadata.department_name,
        assigned_department: userMetadata.assigned_department,
        created_at: new Date().toISOString()
      });
      localDb.profiles = [...(localDb.profiles || []), newProfile];
    }
    saveLocalDatabase(localDb);

    return {
      data: {
        user: {
          id: newId,
          email: normalizedEmail,
          user_metadata: userMetadata
        },
        setupToken
      },
      error: null
    };
  },

  /**
   * Deleting an auth user must only clear the auth_user_id link on profiles;
   * it must never delete the person's church membership record (ADR-0001).
   */
  async deleteUser({ id }: { id: string }) {
    return this.revokePortalAccess(id);
  },

  async signInWithPassword({ email, password }: { email: string; password?: string }) {
    const normalizedEmail = email.trim().toLowerCase();
    const users = getStoredUsers();
    const user = users[normalizedEmail];

    if (!user) {
      return {
        data: { user: null, session: null },
        error: { message: 'Invalid login credentials. Please check your email and password.' }
      };
    }

    if (user.setup_token && !user.password) {
      return {
        data: { user: null, session: null },
        error: { message: 'Portal invitation pending activation. Please use your activation link to set a password first.' }
      };
    }

    if (!password || !user.password || user.password !== password) {
      return {
        data: { user: null, session: null },
        error: { message: 'Invalid login credentials. Please check your email and password.' }
      };
    }

    localDb = loadLocalDatabase();
    const matchingProfile = (localDb.profiles || []).find(
      (p: any) => p.auth_user_id === user.id
    );
    if (!matchingProfile) {
      return {
        data: { user: null, session: null },
        error: { message: 'This portal account is not linked to a directory person. Please contact a church administrator.' }
      };
    }
    if (matchingProfile.portal_access_status === 'suspended' || matchingProfile.status === 'suspended' || matchingProfile.status === 'archived') {
      return {
        data: { user: null, session: null },
        error: { message: 'Your portal access is currently suspended or archived. Please contact a church administrator.' }
      };
    }

    const session = {
      access_token: `mock_jwt_${user.id}`,
      token_type: 'bearer',
      expires_in: 3600,
      user: {
        id: user.id,
        email: user.email,
        user_metadata: user.user_metadata
      }
    };

    setCurrentSession(session);
    notifyAuthChange('SIGNED_IN', session);

    return { data: { user: session.user, session }, error: null };
  },

  async signOut() {
    setCurrentSession(null);
    notifyAuthChange('SIGNED_OUT', null);
    return { error: null };
  }
};

// Resilient universal client
export const supabase = {
  auth: localAuth,

  from(table: string) {
    return new LocalQueryBuilder(table);
  },

  async rpc(functionName: string, args: Record<string, any> = {}) {
    localDb = loadLocalDatabase();
    const session = getCurrentSession();
    const actor = (localDb.profiles || []).find((item: any) => item.auth_user_id === session?.user?.id);
    if (functionName === 'get_my_finance_scopes' ||
        functionName === 'get_finance_scope_configuration' ||
        functionName === 'get_finance_scope_transaction_options' ||
        functionName === 'save_finance_scope_resources' ||
        functionName === 'save_finance_scope_approval_policies' ||
        functionName === 'get_finance_scope_documents' ||
        functionName === 'get_finance_scope_journals' ||
        functionName === 'create_finance_scope_document_transaction' ||
        functionName === 'get_finance_configuration' ||
        functionName === 'save_finance_configuration' ||
        functionName === 'create_financial_document_transaction_idempotent' ||
        functionName === 'decide_financial_document_approval' ||
        functionName === 'get_finance_documents' ||
        functionName === 'get_finance_journals' ||
        functionName === 'post_finance_journal_entry' ||
        functionName === 'post_journal_entry' ||
        functionName === 'submit_event_budget_for_approval' ||
        functionName === 'decide_event_budget_approval' ||
        functionName === 'create_event_budget_payment' ||
        functionName === 'get_event_budgets') {
      return mockFinanceRpc.rpc(functionName, args);
    }
    if (!actor) {
      return { data: null, error: { code: '42501', message: 'An authenticated church profile is required.' } };
    }

    const getActorAssignmentsForPermission = (permissionKey: string) =>
      (localDb.profile_role_assignments || []).filter((item: any) =>
        item.profile_id === actor.id && item.is_active &&
        new Date(item.assigned_at || 0).getTime() <= Date.now() &&
        (!item.expires_at || new Date(item.expires_at).getTime() > Date.now()) &&
        (localDb.roles || []).some((role: any) => role.id === item.role_id && role.is_active) &&
        (localDb.role_permissions || []).some((link: any) =>
          link.role_id === item.role_id &&
          (localDb.permissions || []).some((permission: any) =>
            permission.id === link.permission_id && permission.key === permissionKey
          )
        )
      );

    const actorAssignments = getActorAssignmentsForPermission('manage_roles');
    const actorBranchAssignments = getActorAssignmentsForPermission('manage_branches');

    const actorCanManageScopeWith = (assignmentsList: any[], scopeType: string, branchId: string | null, districtId: string | null) =>
      assignmentsList.some((assignment: any) => {
        if (assignment.scope_type === 'church') return true;
        if (scopeType === 'church') return false;
        if (scopeType === 'branch') {
          const branch = (localDb.church_branches || []).find((item: any) => item.id === branchId);
          return (assignment.scope_type === 'branch' && assignment.branch_id === branchId) ||
            (assignment.scope_type === 'district' && Boolean(branch?.district_id) && assignment.district_id === branch.district_id);
        }
        if (scopeType === 'district') {
          // A branch-scoped manager may manage that branch, not the whole district.
          return assignment.scope_type === 'district' && assignment.district_id === districtId;
        }
        return false;
      });

    const actorCanManageScope = (scopeType: string, branchId: string | null, districtId: string | null) =>
      actorCanManageScopeWith(actorAssignments, scopeType, branchId, districtId);

    const actorCanManageTargetRole = (roleName: string | undefined) => {
      if (!roleName) return false;
      if (['super_admin', 'admin', 'district_admin'].includes(roleName)) {
        return actorAssignments.some((assignment: any) => assignment.scope_type === 'church');
      }
      return true;
    };

    if (functionName === 'assign_profile_role') {
      const { p_profile_id, p_role_id, p_scope_type = 'church', p_branch_id = null, p_district_id = null } = args;
      const targetExists = (localDb.profiles || []).some((item: any) => item.id === p_profile_id);
      const role = (localDb.roles || []).find((item: any) => item.id === p_role_id && item.is_active);
      const validScope =
        (p_scope_type === 'church' && p_branch_id === null && p_district_id === null) ||
        (p_scope_type === 'branch' && Boolean(p_branch_id) && p_district_id === null) ||
        (p_scope_type === 'district' && Boolean(p_district_id) && p_branch_id === null);
      if (!actorCanManageScope(p_scope_type, p_branch_id, p_district_id)) {
        return { data: null, error: { code: '42501', message: 'You do not have permission to manage roles for this scope.' } };
      }
      if (!targetExists || !role || !validScope) {
        return { data: null, error: { code: '22023', message: 'The selected member, role, or assignment scope is invalid.' } };
      }
      if (!actorCanManageTargetRole(role.name)) {
        return { data: null, error: { code: '42501', message: 'Only church-wide administrators may assign Super Admin, Admin, or District Admin roles.' } };
      }
      const existing = (localDb.profile_role_assignments || []).find((item: any) =>
        item.profile_id === p_profile_id &&
        item.role_id === p_role_id &&
        item.scope_type === p_scope_type &&
        item.branch_id === p_branch_id &&
        item.district_id === p_district_id &&
        item.is_active
      );
      if (existing) return { data: existing, error: null };

      const assignment = {
        id: createMockUuid(),
        profile_id: p_profile_id,
        role_id: p_role_id,
        scope_type: p_scope_type,
        branch_id: p_branch_id,
        district_id: p_district_id,
        assigned_by_profile_id: actor.id,
        assigned_at: new Date().toISOString(),
        expires_at: null,
        is_active: true
      };
      localDb.profile_role_assignments = [...(localDb.profile_role_assignments || []), assignment];
      saveLocalDatabase(localDb);
      if (typeof window !== 'undefined') window.dispatchEvent(new Event('profile_role_assignments_updated'));
      return { data: assignment, error: null };
    }

    if (functionName === 'deactivate_profile_role_assignment') {
      const assignment = (localDb.profile_role_assignments || []).find((item: any) =>
        item.id === args.p_assignment_id && item.is_active
      );
      if (!assignment) return { data: false, error: null };
      if (!actorCanManageScope(assignment.scope_type, assignment.branch_id, assignment.district_id)) {
        return { data: null, error: { code: '42501', message: 'You do not have permission to manage roles for this scope.' } };
      }
      localDb.profile_role_assignments = localDb.profile_role_assignments.map((item: any) =>
        item.id === assignment.id ? { ...item, is_active: false } : item
      );
      saveLocalDatabase(localDb);
      if (typeof window !== 'undefined') window.dispatchEvent(new Event('profile_role_assignments_updated'));
      return { data: true, error: null };
    }

    if (functionName === 'reactivate_profile_role_assignment') {
      const assignment = (localDb.profile_role_assignments || []).find((item: any) => item.id === args.p_assignment_id);
      if (!assignment) {
        return { data: null, error: { code: '23503', message: 'The selected role assignment does not exist.' } };
      }
      if (!actorCanManageScope(assignment.scope_type, assignment.branch_id, assignment.district_id)) {
        return { data: null, error: { code: '42501', message: 'You do not have permission to manage roles for this scope.' } };
      }
      const role = (localDb.roles || []).find((item: any) => item.id === assignment.role_id && item.is_active);
      if (!role) {
        return { data: null, error: { code: '23503', message: 'The assigned role is no longer active.' } };
      }
      if (!actorCanManageTargetRole(role.name)) {
        return { data: null, error: { code: '42501', message: 'Only church-wide administrators may reactivate Super Admin, Admin, or District Admin roles.' } };
      }
      const nowIso = new Date().toISOString();
      const updated = {
        ...assignment,
        is_active: true,
        expires_at: null,
        assigned_at: new Date(assignment.assigned_at || 0).getTime() > Date.now() ? nowIso : assignment.assigned_at,
        assigned_by_profile_id: actor.id
      };
      localDb.profile_role_assignments = localDb.profile_role_assignments.map((item: any) =>
        item.id === assignment.id ? updated : item
      );
      saveLocalDatabase(localDb);
      if (typeof window !== 'undefined') window.dispatchEvent(new Event('profile_role_assignments_updated'));
      return { data: updated, error: null };
    }

    if (functionName === 'update_profile_role_assignment') {
      const {
        p_assignment_id,
        p_role_id,
        p_scope_type = 'church',
        p_branch_id = null,
        p_district_id = null
      } = args;
      const existing = (localDb.profile_role_assignments || []).find((item: any) => item.id === p_assignment_id);
      if (!existing) {
        return { data: null, error: { code: '23503', message: 'The selected role assignment does not exist.' } };
      }
      const validScope =
        (p_scope_type === 'church' && p_branch_id === null && p_district_id === null) ||
        (p_scope_type === 'branch' && Boolean(p_branch_id) && p_district_id === null) ||
        (p_scope_type === 'district' && Boolean(p_district_id) && p_branch_id === null);
      if (!validScope) {
        return { data: null, error: { code: '22023', message: 'Role assignment scope identifiers do not match the selected scope.' } };
      }
      if (!actorCanManageScope(existing.scope_type, existing.branch_id, existing.district_id)) {
        return { data: null, error: { code: '42501', message: 'You do not have permission to manage roles for this scope.' } };
      }
      if (!actorCanManageScope(p_scope_type, p_branch_id, p_district_id)) {
        return { data: null, error: { code: '42501', message: 'You do not have permission to assign roles for the target scope.' } };
      }
      const existingRole = (localDb.roles || []).find((item: any) => item.id === existing.role_id);
      const role = (localDb.roles || []).find((item: any) => item.id === p_role_id && item.is_active);
      if (!role) {
        return { data: null, error: { code: '23503', message: 'The selected role is unavailable.' } };
      }
      if (!actorCanManageTargetRole(existingRole?.name) || !actorCanManageTargetRole(role.name)) {
        return { data: null, error: { code: '42501', message: 'Only church-wide administrators may modify Super Admin, Admin, or District Admin role assignments.' } };
      }
      if (p_scope_type === 'branch' && !(localDb.church_branches || []).some((b: any) => b.id === p_branch_id)) {
        return { data: null, error: { code: '23503', message: 'The selected branch does not exist.' } };
      }
      if (p_scope_type === 'district' && !(localDb.districts || []).some((d: any) => d.id === p_district_id)) {
        return { data: null, error: { code: '23503', message: 'The selected district does not exist.' } };
      }
      const updated = {
        ...existing,
        role_id: p_role_id,
        scope_type: p_scope_type,
        branch_id: p_branch_id,
        district_id: p_district_id,
        assigned_by_profile_id: actor.id
      };
      localDb.profile_role_assignments = localDb.profile_role_assignments.map((item: any) =>
        item.id === existing.id ? updated : item
      );
      saveLocalDatabase(localDb);
      if (typeof window !== 'undefined') window.dispatchEvent(new Event('profile_role_assignments_updated'));
      return { data: updated, error: null };
    }

    if (functionName === 'delete_profile_role_assignment') {
      const assignment = (localDb.profile_role_assignments || []).find((item: any) => item.id === args.p_assignment_id);
      if (!assignment) return { data: false, error: null };
      if (!actorCanManageScope(assignment.scope_type, assignment.branch_id, assignment.district_id)) {
        return { data: null, error: { code: '42501', message: 'You do not have permission to manage roles for this scope.' } };
      }
      const existingRole = (localDb.roles || []).find((item: any) => item.id === assignment.role_id);
      if (!actorCanManageTargetRole(existingRole?.name)) {
        return { data: null, error: { code: '42501', message: 'Only church-wide administrators may remove Super Admin, Admin, or District Admin role assignments.' } };
      }
      localDb.profile_role_assignments = localDb.profile_role_assignments.filter((item: any) => item.id !== assignment.id);
      saveLocalDatabase(localDb);
      if (typeof window !== 'undefined') window.dispatchEvent(new Event('profile_role_assignments_updated'));
      return { data: true, error: null };
    }

    const normalizeSingleHqPerDistrict = (branches: ChurchBranch[], targetDistrictId: string, preferredHqBranchId: string | null) =>
      branches.map((branch: ChurchBranch) => {
        if (branch.district_id !== targetDistrictId) return branch;
        if (!preferredHqBranchId) {
          return branch.is_main_branch ? { ...branch, is_main_branch: false } : branch;
        }
        return {
          ...branch,
          is_main_branch: branch.id === preferredHqBranchId
        };
      });

    if (functionName === 'create_district') {
      const { p_name = '', p_region = '', p_country = '', p_description = '' } = args;
      const hasChurchBranchPerm = actorBranchAssignments.some((a: any) => a.scope_type === 'church');
      if (!hasChurchBranchPerm) {
        return { data: null, error: { code: '42501', message: 'Church-wide manage_branches permission is required to create districts.' } };
      }
      if (!String(p_name).trim() || !String(p_region).trim() || !String(p_country).trim()) {
        return { data: null, error: { code: '22023', message: 'District name, region, and country are required.' } };
      }
      const trimmedDesc = String(p_description || '').trim();
      const district: District = {
        id: `dist-${createMockUuid().slice(0, 8)}`,
        name: String(p_name).trim(),
        region: String(p_region).trim(),
        country: String(p_country).trim(),
        ...(trimmedDesc ? { description: trimmedDesc } : {})
      };
      localDb.districts = [...(localDb.districts || []), district];
      saveLocalDatabase(localDb);
      if (typeof window !== 'undefined') window.dispatchEvent(new Event('church_branches_updated'));
      return { data: district, error: null };
    }

    if (functionName === 'update_district') {
      const {
        p_district_id,
        p_name = '',
        p_region = '',
        p_country = '',
        p_description = '',
        p_hq_branch_id = null,
        p_update_hq = false
      } = args;
      const existing = (localDb.districts || []).find((d: any) => d.id === p_district_id);
      if (!existing) {
        return { data: null, error: { code: '23503', message: 'The selected district does not exist.' } };
      }
      const hasChurchBranchPerm = actorBranchAssignments.some((a: any) => a.scope_type === 'church');
      if (!hasChurchBranchPerm && !actorCanManageScopeWith(actorBranchAssignments, 'district', null, p_district_id)) {
        return { data: null, error: { code: '42501', message: 'You do not have permission to customize this district.' } };
      }
      if (Boolean(p_update_hq) && !hasChurchBranchPerm) {
        return { data: null, error: { code: '42501', message: 'Only church-wide administrators may change district HQ branch designation.' } };
      }
      if (!String(p_name).trim() || !String(p_region).trim() || !String(p_country).trim()) {
        return { data: null, error: { code: '22023', message: 'District name, region, and country are required.' } };
      }
      if (Boolean(p_update_hq) && p_hq_branch_id !== null) {
        const targetBranch = (localDb.church_branches || []).find(
          (b: any) => b.id === p_hq_branch_id && b.district_id === p_district_id
        );
        if (!targetBranch) {
          return { data: null, error: { code: '22023', message: 'The selected HQ branch does not belong to this district.' } };
        }
      }
      const trimmedDesc = String(p_description || '').trim();
      const updatedDistrict: District = {
        ...existing,
        name: String(p_name).trim(),
        region: String(p_region).trim(),
        country: String(p_country).trim(),
        description: trimmedDesc || undefined
      };
      localDb.districts = (localDb.districts || []).map((d: any) => (d.id === p_district_id ? updatedDistrict : d));
      if (Boolean(p_update_hq)) {
        localDb.church_branches = normalizeSingleHqPerDistrict(
          localDb.church_branches || [],
          p_district_id,
          p_hq_branch_id || null
        );
      }
      saveLocalDatabase(localDb);
      if (typeof window !== 'undefined') window.dispatchEvent(new Event('church_branches_updated'));
      return { data: updatedDistrict, error: null };
    }

    if (functionName === 'delete_district') {
      const { p_district_id } = args;
      const hasChurchBranchPerm = actorBranchAssignments.some((a: any) => a.scope_type === 'church');
      if (!hasChurchBranchPerm) {
        return { data: null, error: { code: '42501', message: 'Church-wide manage_branches permission is required to delete districts.' } };
      }
      const exists = (localDb.districts || []).some((d: any) => d.id === p_district_id);
      if (!exists) return { data: false, error: null };
      if ((localDb.church_branches || []).some((b: any) => b.district_id === p_district_id)) {
        return { data: null, error: { code: '23503', message: 'Reassign or remove all branches in this district before deleting it.' } };
      }
      localDb.districts = (localDb.districts || []).filter((d: any) => d.id !== p_district_id);
      saveLocalDatabase(localDb);
      if (typeof window !== 'undefined') window.dispatchEvent(new Event('church_branches_updated'));
      return { data: true, error: null };
    }

    if (functionName === 'create_church_branch') {
      const {
        p_district_id,
        p_name = '',
        p_address = '',
        p_city = '',
        p_state = '',
        p_is_main_branch = false
      } = args;
      if (!(localDb.districts || []).some((d: any) => d.id === p_district_id)) {
        return { data: null, error: { code: '23503', message: 'The selected district does not exist.' } };
      }
      const hasChurchBranchPerm = actorBranchAssignments.some((a: any) => a.scope_type === 'church');
      if (!hasChurchBranchPerm && !actorCanManageScopeWith(actorBranchAssignments, 'district', null, p_district_id)) {
        return { data: null, error: { code: '42501', message: 'You do not have permission to create branches in this district.' } };
      }
      if (Boolean(p_is_main_branch) && !hasChurchBranchPerm) {
        return { data: null, error: { code: '42501', message: 'Only church-wide administrators may designate the district HQ branch.' } };
      }
      if (!String(p_name).trim() || !String(p_address).trim() || !String(p_city).trim() || !String(p_state).trim()) {
        return { data: null, error: { code: '22023', message: 'Branch name, address, city, and state are required.' } };
      }
      const branch: ChurchBranch = {
        id: `branch-${createMockUuid().slice(0, 8)}`,
        district_id: p_district_id,
        name: String(p_name).trim(),
        address: String(p_address).trim(),
        city: String(p_city).trim(),
        state: String(p_state).trim(),
        is_main_branch: Boolean(p_is_main_branch)
      };
      let nextBranches = [...(localDb.church_branches || []), branch];
      if (branch.is_main_branch) {
        nextBranches = normalizeSingleHqPerDistrict(nextBranches, p_district_id, branch.id);
      }
      localDb.church_branches = nextBranches;
      saveLocalDatabase(localDb);
      if (typeof window !== 'undefined') window.dispatchEvent(new Event('church_branches_updated'));
      return { data: branch, error: null };
    }

    if (functionName === 'update_church_branch') {
      const {
        p_branch_id,
        p_district_id,
        p_name = '',
        p_address = '',
        p_city = '',
        p_state = '',
        p_is_main_branch = false
      } = args;
      const existing = (localDb.church_branches || []).find((b: any) => b.id === p_branch_id);
      if (!existing) {
        return { data: null, error: { code: '23503', message: 'The selected branch does not exist.' } };
      }
      if (!(localDb.districts || []).some((d: any) => d.id === p_district_id)) {
        return { data: null, error: { code: '23503', message: 'The selected district does not exist.' } };
      }
      const hasChurchBranchPerm = actorBranchAssignments.some((a: any) => a.scope_type === 'church');
      if (!hasChurchBranchPerm) {
        const canManageSource = actorCanManageScopeWith(actorBranchAssignments, 'district', null, existing.district_id);
        const canManageTarget = actorCanManageScopeWith(actorBranchAssignments, 'district', null, p_district_id);
        if (!canManageSource || !canManageTarget) {
          return { data: null, error: { code: '42501', message: 'You do not have permission to update this branch or move it across districts.' } };
        }
        if (Boolean(p_is_main_branch) !== Boolean(existing.is_main_branch)) {
          return { data: null, error: { code: '42501', message: 'Only church-wide administrators may change district HQ branch designation.' } };
        }
      }
      if (!String(p_name).trim() || !String(p_address).trim() || !String(p_city).trim() || !String(p_state).trim()) {
        return { data: null, error: { code: '22023', message: 'Branch name, address, city, and state are required.' } };
      }
      const updated: ChurchBranch = {
        ...existing,
        district_id: p_district_id,
        name: String(p_name).trim(),
        address: String(p_address).trim(),
        city: String(p_city).trim(),
        state: String(p_state).trim(),
        is_main_branch: Boolean(p_is_main_branch)
      };
      let nextBranches = (localDb.church_branches || []).map((b: any) => (b.id === p_branch_id ? updated : b));
      if (updated.is_main_branch) {
        nextBranches = normalizeSingleHqPerDistrict(nextBranches, p_district_id, updated.id);
      }
      localDb.church_branches = nextBranches;
      saveLocalDatabase(localDb);
      if (typeof window !== 'undefined') window.dispatchEvent(new Event('church_branches_updated'));
      return { data: updated, error: null };
    }

    if (functionName === 'update_role_permissions') {
      const { p_role_id, p_permission_ids = [] } = args;
      const canCustomizeRoles = actorAssignments.some((assignment: any) => assignment.scope_type === 'church');
      if (!canCustomizeRoles) {
        return { data: null, error: { code: '42501', message: 'You need church-wide manage_roles permission to customize role permissions.' } };
      }
      const role = (localDb.roles || []).find((item: any) => item.id === p_role_id && item.is_active);
      if (!role) {
        return { data: null, error: { code: '23503', message: 'The selected role is unavailable.' } };
      }
      if (!Array.isArray(p_permission_ids)) {
        return { data: null, error: { code: '22023', message: 'A valid list of permissions is required.' } };
      }
      const uniquePermissionIds = Array.from(new Set(p_permission_ids.filter((id: unknown) => typeof id === 'string' && id.length > 0)));
      const validPermissionIds = new Set((localDb.permissions || []).map((permission: any) => permission.id));
      if (uniquePermissionIds.some(id => !validPermissionIds.has(id))) {
        return { data: null, error: { code: '23503', message: 'One or more selected permissions do not exist.' } };
      }

      const manageRolesPermission = (localDb.permissions || []).find((permission: any) => permission.key === 'manage_roles');
      if (role.name === 'super_admin' && manageRolesPermission && !uniquePermissionIds.includes(manageRolesPermission.id)) {
        return {
          data: null,
          error: { code: '42501', message: 'Super Admin must retain manage_roles so system governance remains accessible.' }
        };
      }

      const preservedLinks = (localDb.role_permissions || []).filter((link: any) => link.role_id !== p_role_id);
      const updatedLinks = uniquePermissionIds.map(permissionId => ({
        role_id: p_role_id,
        permission_id: permissionId
      }));
      localDb.role_permissions = [...preservedLinks, ...updatedLinks];
      const customized = new Set<string>(Array.isArray(localDb.customized_role_permission_ids) ? localDb.customized_role_permission_ids : []);
      customized.add(p_role_id);
      localDb.customized_role_permission_ids = Array.from(customized);
      saveLocalDatabase(localDb);
      if (typeof window !== 'undefined') window.dispatchEvent(new Event('role_permissions_updated'));
      return { data: updatedLinks, error: null };
    }

    return { data: null, error: { message: `Mock RPC function not implemented: ${functionName}` } };
  },

  channel(channelName: string) {
    const currentListeners: ChannelListener[] = [];
    channelMap.set(channelName, currentListeners);

    const channelObj = {
      on(eventType: string, optionsOrCallback: any, callback?: any) {
        const cb = callback || optionsOrCallback;
        currentListeners.push({ event: eventType, callback: cb });
        return channelObj;
      },
      subscribe(callback?: (status: string) => void) {
        if (callback) callback('SUBSCRIBED');
        return channelObj;
      },
      presenceState() {
        return {
          user1: [{ online_at: new Date().toISOString() }],
          user2: [{ online_at: new Date().toISOString() }],
          user3: [{ online_at: new Date().toISOString() }]
        };
      }
    };
    return channelObj;
  },

  removeChannel(_channel: any) {
    // Clean up channel listeners
    return true;
  },

  functions: {
    async invoke(functionName: string, options?: { body?: any }) {
      const body = options?.body || {};
      if (functionName === 'stream-admin') {
        if (body.action === 'regenerate_key') {
          const newKey = `sk_live_${Math.random().toString(36).slice(2, 10)}`;
          return { data: { streamKey: newKey }, error: null };
        }
        if (body.action === 'start_stream' || body.action === 'stop_stream') {
          return { data: { success: true }, error: null };
        }
        return { data: { streamKey: 'sk_live_faithconnect_883' }, error: null };
      }
      if (functionName === 'stream-playback-url') {
        return { data: { url: 'https://example.com/stream/index.m3u8' }, error: null };
      }
      return { data: {}, error: null };
    }
  }
};

// Set to true so application knows data engine is fully active and ready
export const isConfigured = true;

// Utility to reset local database to fresh state
export function resetLocalDatabase() {
  localStorage.removeItem(DB_STORAGE_KEY);
  localStorage.removeItem(USERS_STORAGE_KEY);
  localStorage.removeItem(SESSION_STORAGE_KEY);
  localDb = loadLocalDatabase();
  window.location.reload();
}
