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
    requested_at: new Date(Date.now() - 3 * 86400000).toISOString(),
    request_date: new Date(Date.now() - 3 * 86400000).toISOString(),
    notes: 'Relocating to California for employment. Requesting membership transfer.'
  },
  {
    id: 'tr-2',
    member_id: 'usr-leader-1',
    from_branch_id: 'branch-1',
    to_branch_id: 'branch-2',
    status: 'approved',
    requested_at: new Date(Date.now() - 60 * 86400000).toISOString(),
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
      user_metadata: { first_name: 'Daniel', last_name: 'Williams', primary_role: 'admin' }
    },
    'finance@faithconnect.church': {
      id: 'usr-finance-1', email: 'finance@faithconnect.church', password: 'password123',
      user_metadata: { first_name: 'Esther', last_name: 'Kamara', primary_role: 'finance_officer' }
    },
    'worker@faithconnect.church': {
      id: 'usr-worker-1', email: 'worker@faithconnect.church', password: 'password123',
      user_metadata: { first_name: 'Joseph', last_name: 'Conteh', primary_role: 'worker' }
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
  // One-time repair for the reserved development demo accounts. Older browser
  // stores may contain stale passwords from previous demo seeds; align these
  // known demo identities with the documented development password once.
  const demoCredentialVersionKey = 'faithconnect_demo_credentials_version';
  if (localStorage.getItem(demoCredentialVersionKey) !== '2') {
    for (const [email, account] of Object.entries(defaultUsers)) {
      const existing = storedUsers[email];
      if (!existing) continue;
      storedUsers[email] = {
        ...existing,
        password: account.password,
        setup_token: undefined
      };
      changed = true;
    }
    localStorage.setItem(demoCredentialVersionKey, '2');
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

      const migrated = migrateUnifiedDirectoryData(parsed);
      if (migrated.changed || migratedLegacyRoleAssignments || seededMinistryMembers) {
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
    const districts = localDb.districts || [];
    const branches = localDb.church_branches || [];
    state.districts = districts.map((district: any) => ({
      id: district.id,
      name: district.name || district.id,
      status: district.status || 'active'
    }));
    state.branches = branches.map((branch: any) => ({
      id: branch.id,
      district_id: branch.district_id ?? null,
      name: branch.name || branch.id,
      code: branch.code,
      status: branch.status || 'active'
    }));
    const now = Date.now();
    const resolved: Array<{ profile_id: string; permission: string; branch_id: string | null; district_id?: string | null }> = [];
    (localDb.profile_role_assignments || []).forEach((assignment: any) => {
      if (!assignment.is_active || new Date(assignment.assigned_at || 0).getTime() > now ||
          (assignment.expires_at && new Date(assignment.expires_at).getTime() <= now)) return;
      const role = (localDb.roles || []).find((item: any) => item.id === assignment.role_id && item.is_active);
      if (!role) return;
      const permissionIds = (localDb.role_permissions || [])
        .filter((link: any) => link.role_id === role.id)
        .map((link: any) => link.permission_id);
      const permissionKeys: string[] = (localDb.permissions || [])
        .filter((permission: any) => permissionIds.includes(permission.id))
        .map((permission: any) => String(permission.key));
      if (assignment.scope_type === 'district' && assignment.district_id) {
        [...new Set<string>(permissionKeys)].forEach(permission => {
          resolved.push({
            profile_id: assignment.profile_id,
            permission,
            branch_id: null,
            district_id: assignment.district_id
          });
        });
        return;
      }
      const scopedBranches = assignment.scope_type === 'church'
        ? [null]
        : assignment.scope_type === 'branch'
          ? branches.filter((branch: any) => branch.id === assignment.branch_id).map((branch: any) => branch.id)
          : [];
      resolved.push(...expandMockFinancePermissions(assignment.profile_id, permissionKeys, scopedBranches));
    });
    state.permissions = resolved;
    return state;
  },
  save(state) {
    // Profiles, branches, districts and permissions are authoritative in the shared mock directory;
    // only finance configuration and transaction state belong in this store.
    persistedMockFinanceStorage.save({ ...state, profiles: [], permissions: [], ministries: [], branches: [], districts: [] });
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
    let matchingProfile = (localDb.profiles || []).find(
      (p: any) => p.auth_user_id === user.id
    );
    if (!matchingProfile && ['admin', 'finance_officer', 'worker'].includes(user.user_metadata?.primary_role)) {
      const roleName = user.user_metadata.primary_role;
      const role = (localDb.roles || []).find((item: any) => item.name === roleName && item.is_active);
      if (role) {
        const now = new Date().toISOString();
        matchingProfile = sanitizeProfileRecord({
          id: user.id,
          auth_user_id: user.id,
          branch_id: localDb.church_branches?.[0]?.id || 'branch-1',
          first_name: user.user_metadata.first_name || 'Demo',
          last_name: user.user_metadata.last_name || roleName,
          email: user.email,
          phone: '',
          primary_role: roleName,
          status: 'active',
          portal_access_status: 'active',
          membership_status: 'active',
          membership_date: now.slice(0, 10),
          created_at: now
        });
        localDb.profiles = [...(localDb.profiles || []), matchingProfile];
        localDb.profile_role_assignments = [
          ...(localDb.profile_role_assignments || []),
          {
            id: `mock-assignment-${user.id}`,
            profile_id: user.id,
            role_id: role.id,
            scope_type: 'church',
            branch_id: null,
            district_id: null,
            assigned_by_profile_id: 'usr-admin-1',
            assigned_at: now,
            expires_at: null,
            is_active: true
          }
        ];
        saveLocalDatabase(localDb);
      }
    }
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
    if (
      !actor ||
      !actor.auth_user_id ||
      (actor.portal_access_status && (actor.portal_access_status && actor.portal_access_status !== 'active')) ||
      actor.status === 'suspended' ||
      actor.record_status === 'archived'
    ) {
      return { data: null, error: { code: '42501', message: 'An active linked church profile is required.' } };
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

    const canManageMinistryBranch = (branchId: string | null) => {
      const assignments = getActorAssignmentsForPermission('manage_ministries');
      if (!branchId) return assignments.some((item: any) => item.scope_type === 'church');
      const branch = (localDb.church_branches || []).find((item: any) => item.id === branchId);
      return assignments.some((item: any) =>
        item.scope_type === 'church' ||
        (item.scope_type === 'branch' && item.branch_id === branchId) ||
        (item.scope_type === 'district' && Boolean(branch?.district_id) && item.district_id === branch.district_id)
      );
    };

    const normalizeMinistryDefinition = (row: any) => ({
      ...row,
      leader_name: row.leader_name || 'TBD',
      leader_id: row.leader_id || null,
      member_count: Number(row.member_count || 0),
      type: row.type || (row.entity_type === 'fellowship' ? 'social_fellowship' : 'service_department'),
      roles_and_responsibilities: Array.isArray(row.roles_and_responsibilities) ? row.roles_and_responsibilities : []
    });

    if (functionName === 'submit_ministry_join_request') {
      const ministry = (localDb.ministries || []).find((item: any) =>
        item.id === args.p_ministry_id && (item.status || 'active') === 'active'
      );
      if (!actor || actor.record_status === 'archived' || actor.membership_status !== 'active' || (actor.portal_access_status && actor.portal_access_status !== 'active')) {
        return { data: null, error: { code: '42501', message: 'Only active church members with active portal access can submit ministry requests.' } };
      }
      if (!ministry) return { data: null, error: { code: '23503', message: 'The selected ministry is unavailable or inactive.' } };
      if (ministry.branch_id && actor.branch_id !== ministry.branch_id) {
        return { data: null, error: { code: '23514', message: 'You can only request to join ministries available to your current branch.' } };
      }
      const roster = (localDb.ministry_members || []).find((item: any) =>
        item.ministry_id === ministry.id && item.member_id === actor.id && ['active', 'on_leave', 'in_training'].includes(item.status)
      );
      if (roster || ministry.leader_id === actor.id) {
        return { data: null, error: { code: '23505', message: 'You are already on this ministry roster.' } };
      }
      if ((localDb.ministry_join_requests || []).some((item: any) =>
        item.ministry_id === ministry.id && item.member_id === actor.id && item.status === 'pending'
      )) {
        return { data: null, error: { code: '23505', message: 'You already have a pending request to join this ministry.' } };
      }
      const availability = String(args.p_availability || '').trim();
      const phone = String(args.p_applicant_phone || '').trim();
      if (!availability || !phone) return { data: null, error: { code: '22023', message: 'Availability and a contact phone number are required.' } };
      const preferredRoles = Array.isArray(args.p_preferred_roles) && args.p_preferred_roles.length
        ? args.p_preferred_roles
        : ['Open to serving where needed'];
      const request = {
        id: createMockUuid(),
        ministry_id: ministry.id,
        ministry_name: ministry.name,
        member_id: actor.id,
        applicant_name: `${actor.first_name} ${actor.last_name}`.trim(),
        applicant_email: actor.email || '',
        applicant_phone: phone,
        preferred_roles: preferredRoles,
        availability,
        note: String(args.p_note || '').trim(),
        status: 'pending',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      localDb.ministry_join_requests = [...(localDb.ministry_join_requests || []), request];
      saveLocalDatabase(localDb);
      if (typeof window !== 'undefined') window.dispatchEvent(new Event('ministry_join_requests_updated'));
      return { data: request, error: null };
    }

    if (functionName === 'withdraw_ministry_join_request') {
      const request = (localDb.ministry_join_requests || []).find((item: any) =>
        item.id === args.p_request_id && item.member_id === actor.id && item.status === 'pending'
      );
      if (!request) return { data: null, error: { code: '42501', message: 'Only your own pending ministry requests can be withdrawn.' } };
      const updated = { ...request, status: 'withdrawn', updated_at: new Date().toISOString() };
      localDb.ministry_join_requests = (localDb.ministry_join_requests || []).map((item: any) =>
        item.id === request.id ? updated : item
      );
      saveLocalDatabase(localDb);
      if (typeof window !== 'undefined') window.dispatchEvent(new Event('ministry_join_requests_updated'));
      return { data: updated, error: null };
    }

    if (functionName === 'review_ministry_join_request') {
      const request = (localDb.ministry_join_requests || []).find((item: any) => item.id === args.p_request_id);
      if (!request) return { data: null, error: { code: '23503', message: 'The ministry join request does not exist.' } };
      const ministry = (localDb.ministries || []).find((item: any) => item.id === request.ministry_id);
      if (!ministry || !canManageMinistryBranch(ministry.branch_id ?? null)) {
        return { data: null, error: { code: '42501', message: 'You do not have permission to review this ministry request.' } };
      }
      const action = args.p_action;
      const now = new Date().toISOString();
      const reviewerName = `${actor.first_name} ${actor.last_name}`.trim();
      if (action === 'approve') {
        if (request.status !== 'pending' || (ministry.status || 'active') !== 'active') {
          return { data: null, error: { code: '22023', message: 'Only pending requests for active ministries can be approved.' } };
        }
        const member = (localDb.profiles || []).find((item: any) =>
          item.id === request.member_id &&
          item.record_status !== 'archived' &&
          item.membership_status === 'active'
        );
        if (!member) return { data: null, error: { code: '23503', message: 'The applicant is no longer an active congregation member.' } };
        if (ministry.branch_id && member.branch_id !== ministry.branch_id) {
          return { data: null, error: { code: '23514', message: 'The applicant no longer belongs to the ministry branch.' } };
        }
        const memberStatus = args.p_member_status || 'active';
        if (!['active', 'in_training', 'on_leave'].includes(memberStatus)) {
          return { data: null, error: { code: '22023', message: 'Invalid approved ministry membership status.' } };
        }
        const preferred = (request.preferred_roles || []).find((role: string) => role && !role.toLowerCase().startsWith('open to'));
        const roleTitle = String(args.p_role_title || preferred || 'Team Member').trim();
        const duty = String(args.p_duty || request.availability || 'Sunday & Ministry Service Duty').trim();
        let rosterEntry = (localDb.ministry_members || []).find((item: any) =>
          item.ministry_id === ministry.id && item.member_id === member.id
        );
        if (rosterEntry) {
          rosterEntry = { ...rosterEntry, role_title: roleTitle, duty, status: memberStatus };
          localDb.ministry_members = (localDb.ministry_members || []).map((item: any) =>
            item.id === rosterEntry.id ? rosterEntry : item
          );
        } else {
          rosterEntry = {
            id: createMockUuid(),
            ministry_id: ministry.id,
            member_id: member.id,
            role_title: roleTitle,
            duty,
            status: memberStatus,
            joined_at: new Date().toISOString().slice(0, 10),
            created_by_profile_id: actor.id,
            created_at: now
          };
          localDb.ministry_members = [...(localDb.ministry_members || []), rosterEntry];
        }
        ministry.member_count = (localDb.ministry_members || []).filter((item: any) =>
          item.ministry_id === ministry.id && ['active', 'on_leave', 'in_training'].includes(item.status)
        ).length;
        const updatedRequest = {
          ...request,
          status: 'approved',
          updated_at: now,
          reviewed_by_id: actor.id,
          reviewed_by_name: reviewerName,
          reviewed_at: now,
          review_note: String(args.p_review_note || '').trim() || undefined,
          assigned_role_title: roleTitle,
          assigned_duty: duty
        };
        localDb.ministry_join_requests = (localDb.ministry_join_requests || []).map((item: any) =>
          item.id === request.id ? updatedRequest : item
        );
        saveLocalDatabase(localDb);
        if (typeof window !== 'undefined') window.dispatchEvent(new Event('ministry_join_requests_updated'));
        return { data: { request: updatedRequest, roster_entry: rosterEntry }, error: null };
      }
      if (action === 'decline') {
        if (request.status !== 'pending') return { data: null, error: { code: '22023', message: 'Only pending ministry requests can be declined.' } };
        const updatedRequest = {
          ...request,
          status: 'declined',
          updated_at: now,
          reviewed_by_id: actor.id,
          reviewed_by_name: reviewerName,
          reviewed_at: now,
          review_note: String(args.p_review_note || '').trim() || undefined
        };
        localDb.ministry_join_requests = (localDb.ministry_join_requests || []).map((item: any) =>
          item.id === request.id ? updatedRequest : item
        );
        saveLocalDatabase(localDb);
        if (typeof window !== 'undefined') window.dispatchEvent(new Event('ministry_join_requests_updated'));
        return { data: { request: updatedRequest, roster_entry: null }, error: null };
      }
      if (action === 'reopen') {
        if (!['declined', 'withdrawn'].includes(request.status)) return { data: null, error: { code: '22023', message: 'Only declined or withdrawn requests can be reopened.' } };
        const updatedRequest = {
          ...request,
          status: 'pending',
          updated_at: now,
          reviewed_by_id: actor.id,
          reviewed_by_name: reviewerName,
          reviewed_at: undefined,
          review_note: undefined,
          assigned_role_title: undefined,
          assigned_duty: undefined
        };
        localDb.ministry_join_requests = (localDb.ministry_join_requests || []).map((item: any) =>
          item.id === request.id ? updatedRequest : item
        );
        saveLocalDatabase(localDb);
        if (typeof window !== 'undefined') window.dispatchEvent(new Event('ministry_join_requests_updated'));
        return { data: { request: updatedRequest, roster_entry: null }, error: null };
      }
      return { data: null, error: { code: '22023', message: 'Unsupported ministry join request action.' } };
    }

    if (functionName === 'create_ministry') {
      const {
        p_branch_id = null, p_name, p_description = '', p_category = 'General',
        p_meeting_time = 'Weekly Gathering', p_type = 'service_department',
        p_roles_and_responsibilities = [], p_leader_id = null
      } = args;
      const name = String(p_name || '').trim();
      const branch = p_branch_id
        ? (localDb.church_branches || []).find((item: any) => item.id === p_branch_id && (item.status || 'active') === 'active')
        : null;
      if (p_branch_id && !branch) return { data: null, error: { code: '23503', message: 'The selected branch is unavailable or inactive.' } };
      if (!canManageMinistryBranch(p_branch_id)) return { data: null, error: { code: '42501', message: 'You do not have permission to create ministries in this scope.' } };
      if (name.length < 2 || name.length > 120 || !['social_fellowship', 'service_department'].includes(p_type)) {
        return { data: null, error: { code: '22023', message: 'Provide a valid ministry name and type.' } };
      }
      const entityType = p_type === 'social_fellowship' ? 'fellowship' : 'department';
      const duplicate = (localDb.ministries || []).some((item: any) =>
        item.status === 'active' &&
        item.branch_id === p_branch_id &&
        item.entity_type === entityType &&
        String(item.name).toLowerCase() === name.toLowerCase()
      );
      if (duplicate) return { data: null, error: { code: '23505', message: 'An active ministry with this name already exists in the selected scope.' } };
      const leader = p_leader_id
        ? (localDb.profiles || []).find((item: any) =>
            item.id === p_leader_id &&
            item.record_status !== 'archived' &&
            item.membership_status === 'active' &&
            (!p_branch_id || item.branch_id === p_branch_id)
          )
        : null;
      if (p_leader_id && !leader) return { data: null, error: { code: '23514', message: 'The selected leader must be an active member of the ministry branch.' } };
      const created = normalizeMinistryDefinition({
        id: createMockUuid(),
        branch_id: p_branch_id,
        name,
        description: p_description || '',
        leader_name: leader ? `${leader.first_name} ${leader.last_name}`.trim() : 'TBD',
        leader_id: p_leader_id,
        meeting_time: p_meeting_time || 'Weekly Gathering',
        member_count: 0,
        category: p_category || 'General',
        entity_type: entityType,
        type: p_type,
        roles_and_responsibilities: Array.isArray(p_roles_and_responsibilities) ? p_roles_and_responsibilities : [],
        status: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
      localDb.ministries = [...(localDb.ministries || []), created];
      if (leader) {
        const roster = {
          id: createMockUuid(),
          ministry_id: created.id,
          member_id: leader.id,
          role_title: 'Department Leader',
          duty: 'Ministry leadership and team oversight',
          status: 'active',
          joined_at: new Date().toISOString().slice(0, 10),
          created_by_profile_id: actor.id,
          created_at: new Date().toISOString()
        };
        localDb.ministry_members = [...(localDb.ministry_members || []), roster];
        created.member_count = 1;
      }
      saveLocalDatabase(localDb);
      if (typeof window !== 'undefined') window.dispatchEvent(new Event('ministry_definitions_updated'));
      return { data: created, error: null };
    }

    if (functionName === 'update_ministry') {
      const existing = (localDb.ministries || []).find((item: any) => item.id === args.p_ministry_id && item.status === 'active');
      if (!existing) return { data: null, error: { code: '23503', message: 'The selected ministry is unavailable or inactive.' } };
      if (!canManageMinistryBranch(existing.branch_id ?? null)) return { data: null, error: { code: '42501', message: 'You do not have permission to update this ministry.' } };
      const name = String(args.p_name || '').trim();
      const type = args.p_type || 'service_department';
      if (name.length < 2 || name.length > 120 || !['social_fellowship', 'service_department'].includes(type)) {
        return { data: null, error: { code: '22023', message: 'Provide a valid ministry name and type.' } };
      }
      const leader = args.p_leader_id
        ? (localDb.profiles || []).find((item: any) =>
            item.id === args.p_leader_id &&
            item.record_status !== 'archived' &&
            item.membership_status === 'active' &&
            (!existing.branch_id || item.branch_id === existing.branch_id)
          )
        : null;
      if (args.p_leader_id && !leader) return { data: null, error: { code: '23514', message: 'The selected leader must be an active member of the ministry branch.' } };
      const oldLeaderId = existing.leader_id || null;
      const updated = normalizeMinistryDefinition({
        ...existing,
        name,
        description: args.p_description || '',
        category: args.p_category || 'General',
        meeting_time: args.p_meeting_time || 'Weekly Gathering',
        type,
        entity_type: type === 'social_fellowship' ? 'fellowship' : 'department',
        roles_and_responsibilities: Array.isArray(args.p_roles_and_responsibilities) ? args.p_roles_and_responsibilities : [],
        leader_id: args.p_leader_id || null,
        leader_name: leader ? `${leader.first_name} ${leader.last_name}`.trim() : 'TBD',
        updated_at: new Date().toISOString()
      });
      if (oldLeaderId && oldLeaderId !== updated.leader_id) {
        localDb.ministry_members = (localDb.ministry_members || []).map((item: any) =>
          item.ministry_id === existing.id && item.member_id === oldLeaderId && item.role_title === 'Department Leader' && item.status !== 'inactive'
            ? { ...item, role_title: 'Team Member' }
            : item
        );
      }
      if (leader) {
        const current = (localDb.ministry_members || []).find((item: any) =>
          item.ministry_id === existing.id && item.member_id === leader.id
        );
        if (current) {
          localDb.ministry_members = (localDb.ministry_members || []).map((item: any) =>
            item.id === current.id
              ? { ...item, role_title: 'Department Leader', status: 'active', duty: item.duty || 'Ministry leadership and team oversight' }
              : item
          );
        } else {
          localDb.ministry_members = [...(localDb.ministry_members || []), {
            id: createMockUuid(),
            ministry_id: existing.id,
            member_id: leader.id,
            role_title: 'Department Leader',
            duty: 'Ministry leadership and team oversight',
            status: 'active',
            joined_at: new Date().toISOString().slice(0, 10),
            created_by_profile_id: actor.id,
            created_at: new Date().toISOString()
          }];
        }
      }
      updated.member_count = (localDb.ministry_members || []).filter((item: any) =>
        item.ministry_id === existing.id && ['active', 'on_leave', 'in_training'].includes(item.status)
      ).length;
      localDb.ministries = (localDb.ministries || []).map((item: any) => item.id === existing.id ? updated : item);
      saveLocalDatabase(localDb);
      if (typeof window !== 'undefined') window.dispatchEvent(new Event('ministry_definitions_updated'));
      return { data: updated, error: null };
    }

    if (functionName === 'archive_ministry') {
      const existing = (localDb.ministries || []).find((item: any) => item.id === args.p_ministry_id);
      if (!existing) return { data: null, error: { code: '23503', message: 'The selected ministry does not exist.' } };
      if (!canManageMinistryBranch(existing.branch_id ?? null)) return { data: null, error: { code: '42501', message: 'You do not have permission to archive this ministry.' } };
      const updated = { ...existing, status: 'archived', updated_at: new Date().toISOString() };
      localDb.ministries = (localDb.ministries || []).map((item: any) => item.id === existing.id ? updated : item);
      saveLocalDatabase(localDb);
      if (typeof window !== 'undefined') window.dispatchEvent(new Event('ministry_definitions_updated'));
      return { data: updated, error: null };
    }

    if (functionName === 'manage_welfare_case') {
      const { p_action, p_case_id, p_member_id, p_case_type, p_reason, p_restricted_description, p_priority, p_status, p_assigned_to_profile_id } = args;
      const assignments = getActorAssignmentsForPermission('manage_welfare');
      const canManageWelfareBranch = (branchId: string | null | undefined) => {
        if (!branchId) return assignments.some((item: any) => item.scope_type === 'church');
        const branch = (localDb.church_branches || []).find((item: any) => item.id === branchId);
        return assignments.some((item: any) =>
          item.scope_type === 'church' ||
          (item.scope_type === 'branch' && item.branch_id === branchId) ||
          (item.scope_type === 'district' && Boolean(branch?.district_id) && item.district_id === branch.district_id)
        );
      };
      if (p_action === 'create') {
        const member = (localDb.profiles || []).find((item: any) => item.id === (p_member_id || actor.id) && item.record_status !== 'archived');
        if (!member) return { data: null, error: { code: '23503', message: 'The selected church member is unavailable.' } };
        if (member.id !== actor.id && !canManageWelfareBranch(member.branch_id)) return { data: null, error: { code: '42501', message: 'You do not have permission to submit a welfare case for this member.' } };
        if (!String(p_case_type || '').trim() || !String(p_reason || '').trim()) return { data: null, error: { code: '22023', message: 'Welfare case type and reason are required.' } };
        if (!['low', 'normal', 'high', 'urgent'].includes(p_priority || 'normal')) return { data: null, error: { code: '22023', message: 'Invalid welfare case priority.' } };
        const created = { id: createMockUuid(), member_id: member.id, branch_id: member.branch_id || null, case_type: String(p_case_type).trim(), reason: String(p_reason).trim(), restricted_description: p_restricted_description || null, priority: p_priority || 'normal', status: 'submitted', created_by_profile_id: actor.id, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
        localDb.welfare_cases = [...(localDb.welfare_cases || []), created];
        saveLocalDatabase(localDb);
        return { data: created, error: null };
      }
      const existing = (localDb.welfare_cases || []).find((item: any) => item.id === p_case_id);
      if (!existing) return { data: null, error: { code: 'P0002', message: 'The welfare case could not be found.' } };
      if (!canManageWelfareBranch(existing.branch_id)) return { data: null, error: { code: '42501', message: 'You do not have permission to manage this welfare case.' } };
      if (p_status && !['submitted', 'under_review', 'approved', 'rejected', 'completed', 'closed'].includes(p_status)) return { data: null, error: { code: '22023', message: 'Invalid welfare case status.' } };
      if (p_assigned_to_profile_id) {
        const assignee = (localDb.profiles || []).find((item: any) => item.id === p_assigned_to_profile_id && item.record_status !== 'archived');
        if (!assignee || assignee.branch_id !== existing.branch_id) return { data: null, error: { code: '22023', message: 'The assigned welfare officer must be active in the case branch.' } };
      }
      const updated = { ...existing, status: p_status || existing.status, priority: p_priority || existing.priority, assigned_to_profile_id: p_assigned_to_profile_id || existing.assigned_to_profile_id, restricted_description: p_restricted_description === null || p_restricted_description === undefined ? existing.restricted_description : (String(p_restricted_description).trim() || null), updated_at: new Date().toISOString() };
      localDb.welfare_cases = (localDb.welfare_cases || []).map((item: any) => item.id === existing.id ? updated : item);
      saveLocalDatabase(localDb);
      return { data: updated, error: null };
    }

    if (functionName === 'manage_welfare_campaign') {
      const { p_action, p_campaign_id, p_branch_id, p_campaign_name, p_beneficiary, p_purpose, p_target_amount, p_expected_contribution, p_currency_code, p_deadline, p_status } = args;
      const assignments = getActorAssignmentsForPermission('manage_welfare');
      const canManageWelfareBranch = (branchId: string | null | undefined) => {
        if (!branchId) return assignments.some((item: any) => item.scope_type === 'church');
        const branch = (localDb.church_branches || []).find((item: any) => item.id === branchId);
        return assignments.some((item: any) =>
          item.scope_type === 'church' ||
          (item.scope_type === 'branch' && item.branch_id === branchId) ||
          (item.scope_type === 'district' && Boolean(branch?.district_id) && item.district_id === branch.district_id)
        );
      };
      if (p_action === 'create') {
        if (!String(p_campaign_name || '').trim() || p_target_amount === null || Number(p_target_amount) < 0 || Number(p_expected_contribution || 0) < 0) return { data: null, error: { code: '22023', message: 'Campaign name and non-negative target/contribution amounts are required.' } };
        if (!canManageWelfareBranch(p_branch_id)) return { data: null, error: { code: '42501', message: 'You do not have permission to manage welfare campaigns in this scope.' } };
        const created = { id: createMockUuid(), branch_id: p_branch_id || null, campaign_name: String(p_campaign_name).trim(), beneficiary: p_beneficiary || null, purpose: p_purpose || null, target_amount: Number(p_target_amount), expected_contribution: Number(p_expected_contribution || 0), currency_code: p_currency_code || 'SLE', deadline: p_deadline || null, status: p_status || 'draft', created_by_profile_id: actor.id, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
        localDb.welfare_campaigns = [...(localDb.welfare_campaigns || []), created];
        saveLocalDatabase(localDb);
        return { data: created, error: null };
      }
      const existing = (localDb.welfare_campaigns || []).find((item: any) => item.id === p_campaign_id);
      if (!existing) return { data: null, error: { code: 'P0002', message: 'The welfare campaign could not be found.' } };
      if (!canManageWelfareBranch(existing.branch_id)) return { data: null, error: { code: '42501', message: 'You do not have permission to manage this welfare campaign.' } };
      const updated = { ...existing, campaign_name: p_campaign_name || existing.campaign_name, beneficiary: p_beneficiary === null ? existing.beneficiary : p_beneficiary, purpose: p_purpose === null ? existing.purpose : p_purpose, target_amount: p_target_amount ?? existing.target_amount, expected_contribution: p_expected_contribution ?? existing.expected_contribution, deadline: p_deadline ?? existing.deadline, status: p_status || existing.status, updated_at: new Date().toISOString() };
      localDb.welfare_campaigns = (localDb.welfare_campaigns || []).map((item: any) => item.id === existing.id ? updated : item);
      saveLocalDatabase(localDb);
      return { data: updated, error: null };
    }

    if (functionName === 'record_welfare_contribution') {
      const { p_campaign_id, p_financial_document_id, p_contributing_member_id, p_contribution_date } = args;
      const campaign = (localDb.welfare_campaigns || []).find((item: any) => item.id === p_campaign_id && item.status === 'active');
      const assignments = getActorAssignmentsForPermission('manage_welfare');
      const branch = (localDb.church_branches || []).find((item: any) => item.id === campaign?.branch_id);
      const canManage = campaign && assignments.some((item: any) => item.scope_type === 'church' || (item.scope_type === 'branch' && item.branch_id === campaign.branch_id) || (item.scope_type === 'district' && branch?.district_id && item.district_id === branch.district_id));
      if (!campaign) return { data: null, error: { code: '23503', message: 'The welfare campaign is not active.' } };
      if (!canManage) return { data: null, error: { code: '42501', message: 'You do not have permission to record welfare contributions for this campaign.' } };
      const document = (localDb.financial_documents || []).find((item: any) => item.id === p_financial_document_id);
      if (!document || document.status !== 'posted' || !['receipt', 'adjustment'].includes(document.document_type)) return { data: null, error: { code: '23514', message: 'A posted receipt or adjustment document is required for a welfare contribution.' } };
      if (document.currency_code !== campaign.currency_code || (campaign.branch_id && document.branch_id !== campaign.branch_id)) return { data: null, error: { code: '23514', message: 'Contribution currency or branch does not match the campaign.' } };
      const member = p_contributing_member_id ? (localDb.profiles || []).find((item: any) => item.id === p_contributing_member_id) : null;
      if (p_contributing_member_id && (!member || document.profile_id !== member.id || (campaign.branch_id && member.branch_id !== campaign.branch_id))) return { data: null, error: { code: '23514', message: 'The receipt must identify the same member in the campaign branch.' } };
      const created = { id: createMockUuid(), campaign_id: p_campaign_id, contributing_member_id: p_contributing_member_id || null, financial_document_id: p_financial_document_id, contribution_date: p_contribution_date || new Date().toISOString().slice(0, 10), created_at: new Date().toISOString() };
      localDb.welfare_contributions = [...(localDb.welfare_contributions || []), created];
      saveLocalDatabase(localDb);
      return { data: created, error: null };
    }

    if (functionName === 'record_welfare_assistance') {
      const { p_case_id, p_assistance_type, p_financial_document_id, p_description } = args;
      const welfareCase = (localDb.welfare_cases || []).find((item: any) => item.id === p_case_id);
      const assignments = getActorAssignmentsForPermission('manage_welfare');
      const branch = (localDb.church_branches || []).find((item: any) => item.id === welfareCase?.branch_id);
      const canManage = welfareCase && assignments.some((item: any) => item.scope_type === 'church' || (item.scope_type === 'branch' && item.branch_id === welfareCase.branch_id) || (item.scope_type === 'district' && branch?.district_id && item.district_id === branch.district_id));
      if (!welfareCase) return { data: null, error: { code: 'P0002', message: 'The welfare case could not be found.' } };
      if (!canManage) return { data: null, error: { code: '42501', message: 'You do not have permission to record assistance for this case.' } };
      if (!['approved', 'completed'].includes(welfareCase.status)) return { data: null, error: { code: '22023', message: 'Only approved welfare cases can receive assistance.' } };
      const document = (localDb.financial_documents || []).find((item: any) => item.id === p_financial_document_id);
      if (!document || document.status !== 'posted' || !['payment', 'adjustment'].includes(document.document_type) || (welfareCase.branch_id && document.branch_id !== welfareCase.branch_id)) return { data: null, error: { code: '23514', message: 'A posted payment or adjustment document in the case branch is required.' } };
      const created = { id: createMockUuid(), case_id: p_case_id, assistance_type: p_assistance_type, financial_document_id: p_financial_document_id, description: p_description || null, approved_by_profile_id: actor.id, provided_at: new Date().toISOString(), created_at: new Date().toISOString() };
      localDb.welfare_assistance = [...(localDb.welfare_assistance || []), created];
      saveLocalDatabase(localDb);
      return { data: created, error: null };
    }

    if (functionName === 'manage_event_registration') {
      const { p_action, p_event_id, p_registration_id, p_member_id, p_member_name, p_email, p_phone } = args;
      const canManageEventScope = (permissionKey: string, branchId: string | null | undefined) => {
        const assignments = getActorAssignmentsForPermission(permissionKey);
        if (!branchId) return assignments.some((item: any) => item.scope_type === 'church');
        const branch = (localDb.church_branches || []).find((item: any) => item.id === branchId);
        return assignments.some((item: any) =>
          item.scope_type === 'church' ||
          (item.scope_type === 'branch' && item.branch_id === branchId) ||
          (item.scope_type === 'district' && Boolean(branch?.district_id) && item.district_id === branch.district_id)
        );
      };
      if (!['register_member', 'register_guest', 'cancel', 'check_in', 'mark_absent'].includes(p_action)) {
        return { data: null, error: { code: '22023', message: 'Unsupported event registration operation.' } };
      }
      if (p_action === 'register_member' || p_action === 'register_guest') {
        const event = (localDb.events || []).find((item: any) => item.id === p_event_id && ['upcoming', 'ongoing'].includes(item.status || 'upcoming'));
        if (!event) return { data: null, error: { code: '23503', message: 'The event is not available for registration.' } };
        let member: any = null;
        if (p_action === 'register_member') {
          member = (localDb.profiles || []).find((item: any) => item.id === p_member_id && item.membership_status === 'active' && item.record_status !== 'archived');
          if (!member) return { data: null, error: { code: '23503', message: 'The selected active church member could not be found.' } };
          if (event.branch_id && member.branch_id !== event.branch_id) return { data: null, error: { code: '42501', message: 'The selected member does not belong to the event branch.' } };
          if (actor.id === member.id) {
            if (!canManageEventScope('register_for_events', event.branch_id)) return { data: null, error: { code: '42501', message: 'You do not have permission to register for this event.' } };
          } else if (!canManageEventScope('manage_events', event.branch_id)) {
            return { data: null, error: { code: '42501', message: 'You do not have permission to register another member.' } };
          }
          if ((localDb.event_registrations || []).some((item: any) => item.event_id === p_event_id && item.member_id === p_member_id && item.status !== 'cancelled')) {
            return { data: null, error: { code: '23505', message: 'This member already has an active registration for the event.' } };
          }
        } else {
          if (!canManageEventScope('manage_events', event.branch_id)) return { data: null, error: { code: '42501', message: 'Only event managers may register guests.' } };
          if (!String(p_member_name || '').trim()) return { data: null, error: { code: '22023', message: 'A guest name is required.' } };
        }
        const count = (localDb.event_registrations || []).filter((item: any) => item.event_id === p_event_id && ['confirmed', 'checked_in', 'attended'].includes(item.status)).length;
        const status = event.max_attendees && count >= event.max_attendees ? 'waitlist' : 'confirmed';
        const saved = {
          id: createMockUuid(), event_id: p_event_id, member_id: member?.id || null,
          member_name: member ? `${member.first_name} ${member.last_name}`.trim() : String(p_member_name).trim(),
          email: p_email || member?.email || '', phone: p_phone || member?.phone || '',
          registered_at: new Date().toISOString(), registered_by_profile_id: actor.id,
          checked_in_at: null, status
        };
        localDb.event_registrations = [...(localDb.event_registrations || []), saved];
        saveLocalDatabase(localDb);
        return { data: saved, error: null };
      }

      const registration = (localDb.event_registrations || []).find((item: any) => item.id === p_registration_id);
      if (!registration) return { data: null, error: { code: 'P0002', message: 'The event registration could not be found.' } };
      const event = (localDb.events || []).find((item: any) => item.id === registration.event_id);
      if (!event) return { data: null, error: { code: '23503', message: 'The event could not be found.' } };
      if (p_action === 'cancel') {
        if (registration.member_id !== actor.id && !canManageEventScope('manage_events', event.branch_id)) {
          return { data: null, error: { code: '42501', message: 'You do not have permission to cancel this registration.' } };
        }
        if (['cancelled', 'checked_in', 'attended'].includes(registration.status)) return { data: null, error: { code: '22023', message: 'This registration can no longer be cancelled.' } };
        const updated = { ...registration, status: 'cancelled' };
        localDb.event_registrations = (localDb.event_registrations || []).map((item: any) => item.id === registration.id ? updated : item);
        saveLocalDatabase(localDb);
        return { data: updated, error: null };
      }
      if (!canManageEventScope('manage_attendance', event.branch_id) && !canManageEventScope('manage_events', event.branch_id)) {
        return { data: null, error: { code: '42501', message: 'You do not have permission to manage event attendance.' } };
      }
      const now = new Date().toISOString();
      if (p_action === 'check_in' && registration.status === 'waitlist' && event.max_attendees) {
        const activeCount = (localDb.event_registrations || []).filter((item: any) => item.event_id === event.id && ['confirmed', 'checked_in', 'attended'].includes(item.status)).length;
        if (activeCount >= event.max_attendees) return { data: null, error: { code: '22023', message: 'The event is at capacity; this registration remains waitlisted.' } };
      }
      const updated = { ...registration, status: p_action === 'check_in' ? 'checked_in' : 'absent', checked_in_at: p_action === 'check_in' ? now : null };
      if (p_action === 'check_in' && registration.member_id) {
        const member = (localDb.profiles || []).find((item: any) => item.id === registration.member_id);
        if (event.branch_id && member?.branch_id !== event.branch_id) return { data: null, error: { code: '42501', message: 'The member is no longer assigned to the event branch.' } };
        const sessionBranch = event.branch_id || member?.branch_id || actor.branch_id;
        const sessionDate = String(event.start_time || now).slice(0, 10);
        let session = (localDb.attendance_sessions || []).find((item: any) => item.event_id === event.id && item.session_date === sessionDate && item.branch_id === sessionBranch);
        if (!session) {
          session = { id: createMockUuid(), branch_id: sessionBranch, event_id: event.id, title: event.title, session_date: sessionDate, session_type: 'event', created_by_profile_id: actor.id, created_at: now };
          localDb.attendance_sessions = [...(localDb.attendance_sessions || []), session];
        }
        const existingRecord = (localDb.attendance_records || []).find((item: any) => item.session_id === session.id && item.member_id === registration.member_id);
        const record = { ...(existingRecord || {}), id: existingRecord?.id || createMockUuid(), session_id: session.id, member_id: registration.member_id, attendance_status: 'present', check_in_time: now, recorded_by_profile_id: actor.id };
        localDb.attendance_records = existingRecord
          ? (localDb.attendance_records || []).map((item: any) => item.id === existingRecord.id ? record : item)
          : [...(localDb.attendance_records || []), record];
      }
      localDb.event_registrations = (localDb.event_registrations || []).map((item: any) => item.id === registration.id ? updated : item);
      saveLocalDatabase(localDb);
      return { data: updated, error: null };
    }

    if (functionName === 'manage_attendance') {
      const { p_action, p_session_id, p_branch_id, p_title, p_session_date, p_session_type, p_member_id, p_attendance_status, p_notes } = args;
      const attendanceAssignments = getActorAssignmentsForPermission('manage_attendance');
      const canManageAttendanceBranch = (branchId: string | null | undefined) => {
        if (!branchId) return attendanceAssignments.some((item: any) => item.scope_type === 'church');
        const branch = (localDb.church_branches || []).find((item: any) => item.id === branchId);
        return attendanceAssignments.some((item: any) =>
          item.scope_type === 'church' ||
          (item.scope_type === 'branch' && item.branch_id === branchId) ||
          (item.scope_type === 'district' && Boolean(branch?.district_id) && item.district_id === branch.district_id)
        );
      };
      if (p_action === 'create_session') {
        if (!p_branch_id || !String(p_title || '').trim()) return { data: null, error: { code: '22023', message: 'A branch and attendance session title are required.' } };
        if (!canManageAttendanceBranch(p_branch_id)) return { data: null, error: { code: '42501', message: 'You do not have permission to create attendance sessions for this branch.' } };
        const session = { id: createMockUuid(), branch_id: p_branch_id, title: String(p_title).trim(), session_date: p_session_date || new Date().toISOString().slice(0, 10), session_type: p_session_type || 'service', created_by_profile_id: actor.id, created_at: new Date().toISOString() };
        localDb.attendance_sessions = [...(localDb.attendance_sessions || []), session];
        saveLocalDatabase(localDb);
        return { data: session, error: null };
      }
      if (p_action === 'record') {
        const session = (localDb.attendance_sessions || []).find((item: any) => item.id === p_session_id);
        const member = (localDb.profiles || []).find((item: any) => item.id === p_member_id && item.record_status !== 'archived');
        if (!session || !member) return { data: null, error: { code: 'P0002', message: 'The attendance session or member could not be found.' } };
        if (!canManageAttendanceBranch(session.branch_id)) return { data: null, error: { code: '42501', message: 'You do not have permission to record attendance for this branch.' } };
        if (member.branch_id !== session.branch_id) return { data: null, error: { code: '42501', message: 'The selected member is not active in this attendance branch.' } };
        if (!['present', 'absent', 'late', 'excused'].includes(p_attendance_status)) return { data: null, error: { code: '22023', message: 'Invalid attendance status.' } };
        const existing = (localDb.attendance_records || []).find((item: any) => item.session_id === p_session_id && item.member_id === p_member_id);
        const record = { ...(existing || {}), id: existing?.id || createMockUuid(), session_id: p_session_id, member_id: p_member_id, attendance_status: p_attendance_status, check_in_time: ['present', 'late'].includes(p_attendance_status) ? new Date().toISOString() : null, recorded_by_profile_id: actor.id, notes: p_notes || null };
        localDb.attendance_records = existing
          ? (localDb.attendance_records || []).map((item: any) => item.id === existing.id ? record : item)
          : [...(localDb.attendance_records || []), record];
        saveLocalDatabase(localDb);
        return { data: record, error: null };
      }
      return { data: null, error: { code: '22023', message: 'Unsupported attendance operation.' } };
    }

    if (functionName === 'get_member_transfer_directory') {
      const transferAssignments = getActorAssignmentsForPermission('manage_member_transfers');
      const canManageTransferBranch = (branchId: string | null | undefined) => {
        if (!branchId) return transferAssignments.some((item: any) => item.scope_type === 'church');
        const branch = (localDb.church_branches || []).find((item: any) => item.id === branchId);
        return transferAssignments.some((item: any) =>
          item.scope_type === 'church' ||
          (item.scope_type === 'branch' && item.branch_id === branchId) ||
          (item.scope_type === 'district' && Boolean(branch?.district_id) && item.district_id === branch.district_id)
        );
      };
      const districtNameById = new Map<string, string>(
        (localDb.districts || []).map((d: any) => [d.id, d.name])
      );
      const members = (localDb.profiles || [])
        .filter((item: any) =>
          item.record_status !== 'archived' &&
          (item.membership_status || 'active') === 'active' &&
          Boolean(item.branch_id) &&
          canManageTransferBranch(item.branch_id)
        )
        .map((item: any) => ({
          id: item.id,
          first_name: item.first_name,
          last_name: item.last_name,
          branch_id: item.branch_id,
          membership_status: item.membership_status || 'active'
        }))
        .sort((a: any, b: any) => `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`));
      const branches = (localDb.church_branches || [])
        .filter((item: any) =>
          (item.status || 'active') === 'active' &&
          canManageTransferBranch(item.id)
        )
        .map((item: any) => ({
          id: item.id,
          name: item.name,
          district_id: item.district_id ?? null,
          district_name: item.district_id ? (districtNameById.get(item.district_id) ?? null) : null,
          status: item.status || 'active'
        }))
        .sort((a: any, b: any) => a.name.localeCompare(b.name));
      return { data: { members, branches }, error: null };
    }

    if (functionName === 'get_branch_governance_summaries') {
      const { p_district_id = null } = args;
      const hasChurchBranchPerm = actorBranchAssignments.some((a: any) => a.scope_type === 'church');
      const allActorAssignments = (localDb.profile_role_assignments || []).filter((item: any) =>
        item.profile_id === actor.id &&
        item.is_active &&
        new Date(item.assigned_at || 0).getTime() <= Date.now() &&
        (!item.expires_at || new Date(item.expires_at).getTime() > Date.now()) &&
        (localDb.roles || []).some((role: any) => role.id === item.role_id && role.is_active)
      );
      const canSeeBranch = (branch: any) =>
        hasChurchBranchPerm ||
        actorCanManageScopeWith(actorBranchAssignments, 'branch', branch.id, branch.district_id ?? null) ||
        allActorAssignments.some((a: any) =>
          a.scope_type === 'church' ||
          (a.scope_type === 'branch' && a.branch_id === branch.id) ||
          (a.scope_type === 'district' && Boolean(branch.district_id) && a.district_id === branch.district_id)
        );
      const rows = (localDb.church_branches || [])
        .filter((b: any) => (!p_district_id || b.district_id === p_district_id) && canSeeBranch(b))
        .map((b: any) => {
          const branchMembers = (localDb.profiles || []).filter(
            (p: any) => p.branch_id === b.id && p.record_status !== 'archived' && p.membership_status !== 'archived'
          );
          const activeMembers = branchMembers.filter(
            (p: any) => !p.membership_status || p.membership_status === 'active'
          );
          return {
            branch_id: b.id,
            district_id: b.district_id ?? null,
            total_members: branchMembers.length,
            active_members: activeMembers.length
          };
        })
        .sort((a: any, b: any) => String(a.branch_id).localeCompare(String(b.branch_id)));
      return { data: rows, error: null };
    }

    if (functionName === 'manage_member_transfer') {
      const { p_action, p_transfer_id, p_member_id, p_to_branch_id, p_notes } = args;
      if (!['request', 'approve', 'reject', 'cancel'].includes(p_action)) {
        return { data: null, error: { code: '22023', message: 'Unsupported member transfer operation.' } };
      }

      const transferAssignments = getActorAssignmentsForPermission('manage_member_transfers');
      const canManageTransferBranch = (branchId: string | null | undefined) => {
        if (!branchId) return transferAssignments.some((item: any) => item.scope_type === 'church');
        const branch = (localDb.church_branches || []).find((item: any) => item.id === branchId);
        return transferAssignments.some((item: any) =>
          item.scope_type === 'church' ||
          (item.scope_type === 'branch' && item.branch_id === branchId) ||
          (item.scope_type === 'district' && Boolean(branch?.district_id) && item.district_id === branch.district_id)
        );
      };

      if (p_action === 'request') {
        if (!p_to_branch_id) return { data: null, error: { code: '22023', message: 'A destination branch is required.' } };
        const member = (localDb.profiles || []).find((item: any) => item.id === (p_member_id || actor.id));
        const targetBranch = (localDb.church_branches || []).find(
          (item: any) => item.id === p_to_branch_id && (item.status || 'active') === 'active'
        );
        if (!member || member.membership_status !== 'active' || member.record_status === 'archived') {
          return { data: null, error: { code: '23503', message: 'The selected active church member could not be found.' } };
        }
        if (!targetBranch) return { data: null, error: { code: '23503', message: 'The destination branch is unavailable.' } };
        if (member.branch_id === p_to_branch_id) return { data: null, error: { code: '22023', message: 'The member is already assigned to the selected branch.' } };
        if (
          member.id !== actor.id &&
          (!canManageTransferBranch(member.branch_id) || !canManageTransferBranch(p_to_branch_id))
        ) {
          return { data: null, error: { code: '42501', message: 'You do not have permission to request a transfer for this member.' } };
        }
        if ((localDb.member_transfers || []).some((item: any) => item.member_id === member.id && item.status === 'pending')) {
          return { data: null, error: { code: '23505', message: 'This member already has a pending transfer request.' } };
        }
        const created = {
          id: createMockUuid(),
          member_id: member.id,
          from_branch_id: member.branch_id || null,
          to_branch_id: p_to_branch_id,
          status: 'pending',
          requested_at: new Date().toISOString(),
          requested_by_profile_id: actor.id,
          approved_by_profile_id: null,
          approved_at: null,
          notes: String(p_notes || '').trim() || null
        };
        localDb.member_transfers = [...(localDb.member_transfers || []), created];
        saveLocalDatabase(localDb);
        return { data: created, error: null };
      }

      const transfer = (localDb.member_transfers || []).find((item: any) => item.id === p_transfer_id);
      if (!transfer) return { data: null, error: { code: 'P0002', message: 'The member transfer request could not be found.' } };
      if (transfer.status !== 'pending') return { data: null, error: { code: '22023', message: 'Only pending transfer requests can be changed.' } };

      if (p_action === 'cancel') {
        if (transfer.requested_by_profile_id !== actor.id && !canManageTransferBranch(transfer.from_branch_id)) {
          return { data: null, error: { code: '42501', message: 'You do not have permission to cancel this transfer request.' } };
        }
        const updated = { ...transfer, status: 'cancelled' };
        localDb.member_transfers = (localDb.member_transfers || []).map((item: any) => item.id === transfer.id ? updated : item);
        saveLocalDatabase(localDb);
        return { data: updated, error: null };
      }

      if (!canManageTransferBranch(transfer.from_branch_id) || !canManageTransferBranch(transfer.to_branch_id)) {
        return { data: null, error: { code: '42501', message: 'Transfer review requires permission in both the source and destination branches.' } };
      }
      const member = (localDb.profiles || []).find((item: any) => item.id === transfer.member_id);
      if (!member || member.branch_id !== transfer.from_branch_id) {
        return { data: null, error: { code: '23514', message: 'The member branch no longer matches this transfer request.' } };
      }
      const now = new Date().toISOString();
      const updated = {
        ...transfer,
        status: p_action === 'approve' ? 'approved' : 'rejected',
        approved_by_profile_id: actor.id,
        approved_at: now
      };
      if (p_action === 'approve') {
        const activeDest = (localDb.church_branches || []).find(
          (b: any) => b.id === transfer.to_branch_id && (b.status || 'active') === 'active'
        );
        if (!activeDest) {
          return { data: null, error: { code: '23503', message: 'The destination branch is no longer active.' } };
        }

        if (transfer.from_branch_id) {
          const sourceBranchMinistryIds = new Set(
            (localDb.ministries || [])
              .filter((m: any) => m.branch_id && m.branch_id === transfer.from_branch_id)
              .map((m: any) => m.id)
          );
          localDb.ministry_members = (localDb.ministry_members || []).map((mm: any) =>
            mm.member_id === member.id && sourceBranchMinistryIds.has(mm.ministry_id) && mm.status !== 'inactive'
              ? { ...mm, status: 'inactive' }
              : mm
          );
          localDb.ministries = (localDb.ministries || []).map((m: any) => {
            if (m.branch_id !== transfer.from_branch_id) return m;
            const nextCount = (localDb.ministry_members || []).filter(
              (mm: any) => mm.ministry_id === m.id && mm.status !== 'inactive'
            ).length;
            return {
              ...m,
              member_count: nextCount,
              ...(m.leader_id === member.id ? { leader_id: undefined, leader_name: 'TBD' } : {})
            };
          });
          localDb.cells = (localDb.cells || []).map((c: any) =>
            c.branch_id === transfer.from_branch_id && c.leader_id === member.id
              ? { ...c, leader_id: null, updated_at: now }
              : c
          );
          localDb.cell_members = (localDb.cell_members || []).map((cm: any) =>
            cm.member_id === member.id &&
            cm.branch_id === transfer.from_branch_id &&
            cm.status === 'active'
              ? { ...cm, status: 'transferred' }
              : cm
          );
        }

        localDb.profiles = (localDb.profiles || []).map((item: any) =>
          item.id === member.id ? { ...item, branch_id: transfer.to_branch_id, updated_at: now } : item
        );
      }
      localDb.member_transfers = (localDb.member_transfers || []).map((item: any) => item.id === transfer.id ? updated : item);
      saveLocalDatabase(localDb);
      return { data: updated, error: null };
    }

    if (functionName === 'manage_ministry_member') {
      const {
        p_action,
        p_ministry_id,
        p_assignment_id,
        p_member_id,
        p_role_title,
        p_duty,
        p_status,
        p_joined_at
      } = args;
      if (!['add', 'update', 'remove'].includes(p_action)) {
        return { data: null, error: { code: '22023', message: 'Unsupported ministry roster operation.' } };
      }

      const ministryAssignments = getActorAssignmentsForPermission('manage_ministries');
      const canManageMinistryBranch = (branchId: string | null | undefined) => {
        if (!branchId) return ministryAssignments.some((item: any) => item.scope_type === 'church');
        const branch = (localDb.church_branches || []).find((item: any) => item.id === branchId);
        return ministryAssignments.some((item: any) =>
          item.scope_type === 'church' ||
          (item.scope_type === 'branch' && item.branch_id === branchId) ||
          (item.scope_type === 'district' && Boolean(branch?.district_id) && item.district_id === branch.district_id)
        );
      };

      const syncMinistryMemberCount = (ministryId: string) => {
        const ministry = (localDb.ministries || []).find((item: any) => item.id === ministryId);
        if (!ministry) return;
        ministry.member_count = (localDb.ministry_members || []).filter((item: any) =>
          item.ministry_id === ministryId && ['active', 'on_leave', 'in_training'].includes(item.status)
        ).length;
      };

      let ministry: any;
      let existing: any;
      let targetMember: any;
      if (p_action === 'add') {
        ministry = (localDb.ministries || []).find((item: any) => item.id === p_ministry_id && (item.status || 'active') === 'active');
        if (!ministry || !p_member_id) {
          return { data: null, error: { code: '23503', message: 'The selected ministry is unavailable or inactive.' } };
        }
        targetMember = (localDb.profiles || []).find((item: any) => item.id === p_member_id);
        if (
          !targetMember ||
          targetMember.record_status === 'archived' ||
          (targetMember.membership_status || 'active') !== 'active'
        ) {
          return { data: null, error: { code: '23503', message: 'Only active church members can be assigned to a ministry roster.' } };
        }
        if (ministry.branch_id && targetMember.branch_id !== ministry.branch_id) {
          return { data: null, error: { code: '42501', message: 'A member can only join a ministry in their assigned branch.' } };
        }
      } else {
        existing = (localDb.ministry_members || []).find((item: any) => item.id === p_assignment_id);
        ministry = (localDb.ministries || []).find((item: any) => item.id === existing?.ministry_id);
        targetMember = (localDb.profiles || []).find((item: any) => item.id === existing?.member_id);
        if (!existing || !ministry || !targetMember) {
          return { data: null, error: { code: 'P0002', message: 'The ministry roster assignment could not be found.' } };
        }
      }

      if (!canManageMinistryBranch(ministry.branch_id ?? null)) {
        return { data: null, error: { code: '42501', message: 'You do not have permission to manage this ministry roster.' } };
      }
      if (p_status && !['active', 'on_leave', 'in_training', 'inactive'].includes(p_status)) {
        return { data: null, error: { code: '22023', message: 'Invalid ministry membership status.' } };
      }

      if (p_action === 'add') {
        if ((localDb.ministry_members || []).some((item: any) => item.ministry_id === p_ministry_id && item.member_id === p_member_id)) {
          return { data: null, error: { code: '23505', message: 'This member is already assigned to the ministry.' } };
        }
        const saved = {
          id: createMockUuid(),
          ministry_id: p_ministry_id,
          member_id: p_member_id,
          role_title: String(p_role_title || '').trim() || 'Team Member',
          duty: String(p_duty || '').trim() || null,
          status: p_status || 'active',
          joined_at: p_joined_at || new Date().toISOString().slice(0, 10),
          created_by_profile_id: actor.id
        };
        localDb.ministry_members = [...(localDb.ministry_members || []), saved];
        syncMinistryMemberCount(p_ministry_id);
        saveLocalDatabase(localDb);
        return { data: saved, error: null };
      }

      if (p_action === 'update') {
        if ((ministry.status || 'active') !== 'active') {
          return { data: null, error: { code: '23503', message: 'Cannot update roster assignments for an inactive or archived ministry.' } };
        }
        if (
          targetMember.record_status === 'archived' ||
          ['suspended', 'archived'].includes(targetMember.membership_status || 'active')
        ) {
          return { data: null, error: { code: '23503', message: 'Cannot update a suspended or archived church member on a ministry roster.' } };
        }
        if (ministry.branch_id && targetMember.branch_id !== ministry.branch_id) {
          return { data: null, error: { code: '42501', message: 'A member can only maintain an active assignment in their assigned branch.' } };
        }
        const updated = {
          ...existing,
          role_title: String(p_role_title || '').trim() || existing.role_title,
          duty: p_duty === null || p_duty === undefined ? existing.duty : (String(p_duty).trim() || null),
          status: p_status || existing.status
        };
        localDb.ministry_members = (localDb.ministry_members || []).map((item: any) => item.id === p_assignment_id ? updated : item);
        syncMinistryMemberCount(ministry.id);
        saveLocalDatabase(localDb);
        return { data: updated, error: null };
      }

      if ((ministry.status || 'active') === 'archived') {
        return { data: null, error: { code: '23503', message: 'Cannot remove roster assignments from an archived ministry.' } };
      }

      localDb.ministry_members = (localDb.ministry_members || []).filter((item: any) => item.id !== p_assignment_id);
      syncMinistryMemberCount(ministry.id);
      saveLocalDatabase(localDb);
      return { data: null, error: null };
    }

    if (functionName === 'create_leadership_appointment') {
      const {
        p_profile_id,
        p_scope_type,
        p_branch_id = null,
        p_district_id = null,
        p_title = '',
        p_responsibilities = null,
        p_effective_from = new Date().toISOString().slice(0, 10)
      } = args;
      const title = String(p_title || '').trim();
      const member = (localDb.profiles || []).find((item: any) =>
        item.id === p_profile_id &&
        item.record_status !== 'archived' &&
        item.membership_status === 'active'
      );
      if (!member || title.length < 2 || title.length > 100) {
        return { data: null, error: { code: '23503', message: 'Select an active congregation member and a valid leadership title.' } };
      }
      if (p_scope_type === 'branch') {
        const branch = (localDb.church_branches || []).find((item: any) => item.id === p_branch_id && (item.status || 'active') === 'active');
        if (!branch || p_district_id !== null || member.branch_id !== p_branch_id) {
          return { data: null, error: { code: '23514', message: 'The member must belong to the selected active branch.' } };
        }
      } else if (p_scope_type === 'district') {
        const district = (localDb.districts || []).find((item: any) => item.id === p_district_id && (item.status || 'active') === 'active');
        const memberBranch = (localDb.church_branches || []).find((item: any) => item.id === member.branch_id);
        if (!district || p_branch_id !== null || memberBranch?.district_id !== p_district_id) {
          return { data: null, error: { code: '23514', message: 'The member must belong to an active branch in the selected district.' } };
        }
      } else {
        return { data: null, error: { code: '22023', message: 'Leadership appointment scope must be branch or district.' } };
      }
      const scopeBranchId = p_scope_type === 'branch' ? p_branch_id : null;
      const scopeDistrictId = p_scope_type === 'district' ? p_district_id : null;
      if (!actorCanManageScope(p_scope_type, scopeBranchId, scopeDistrictId)) {
        return { data: null, error: { code: '42501', message: 'You do not have permission to manage leadership appointments for this scope.' } };
      }
      const duplicate = (localDb.leadership_appointments || []).some((item: any) =>
        item.status === 'active' &&
        item.profile_id === p_profile_id &&
        item.scope_type === p_scope_type &&
        item.branch_id === scopeBranchId &&
        item.district_id === scopeDistrictId &&
        String(item.title).toLowerCase() === title.toLowerCase()
      );
      if (duplicate) return { data: null, error: { code: '23505', message: 'This member already holds this leadership title in the selected scope.' } };
      const appointment = {
        id: createMockUuid(),
        profile_id: p_profile_id,
        scope_type: p_scope_type,
        branch_id: scopeBranchId,
        district_id: scopeDistrictId,
        title,
        responsibilities: String(p_responsibilities || '').trim() || null,
        status: 'active',
        appointed_by_profile_id: actor.id,
        appointed_at: new Date().toISOString(),
        effective_from: p_effective_from || new Date().toISOString().slice(0, 10),
        effective_to: null,
        ended_by_profile_id: null,
        ended_at: null,
        end_reason: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      localDb.leadership_appointments = [...(localDb.leadership_appointments || []), appointment];
      saveLocalDatabase(localDb);
      if (typeof window !== 'undefined') window.dispatchEvent(new Event('leadership_appointments_updated'));
      return { data: appointment, error: null };
    }

    if (functionName === 'end_leadership_appointment') {
      const appointment = (localDb.leadership_appointments || []).find((item: any) => item.id === args.p_appointment_id);
      if (!appointment) return { data: null, error: { code: '23503', message: 'The selected leadership appointment does not exist.' } };
      if (appointment.status !== 'active') return { data: null, error: { code: '22023', message: 'The leadership appointment is already ended.' } };
      if (!actorCanManageScope(appointment.scope_type, appointment.branch_id, appointment.district_id)) {
        return { data: null, error: { code: '42501', message: 'You do not have permission to end this leadership appointment.' } };
      }
      const today = new Date().toISOString().slice(0, 10);
      const updated = {
        ...appointment,
        status: 'ended',
        ended_by_profile_id: actor.id,
        ended_at: new Date().toISOString(),
        effective_to: appointment.effective_to && appointment.effective_to < today ? appointment.effective_to : today,
        end_reason: String(args.p_end_reason || '').trim() || null,
        updated_at: new Date().toISOString()
      };
      localDb.leadership_appointments = (localDb.leadership_appointments || []).map((item: any) =>
        item.id === appointment.id ? updated : item
      );
      saveLocalDatabase(localDb);
      if (typeof window !== 'undefined') window.dispatchEvent(new Event('leadership_appointments_updated'));
      return { data: updated, error: null };
    }

    if (functionName === 'assign_profile_role') {
      const { p_profile_id, p_role_id, p_scope_type = 'church', p_branch_id = null, p_district_id = null } = args;
      const targetExists = (localDb.profiles || []).some(
        (item: any) => item.id === p_profile_id && item.record_status !== 'archived'
      );
      const role = (localDb.roles || []).find((item: any) => item.id === p_role_id && item.is_active);
      const validScope =
        (p_scope_type === 'church' && p_branch_id === null && p_district_id === null) ||
        (p_scope_type === 'branch' && Boolean(p_branch_id) && p_district_id === null) ||
        (p_scope_type === 'district' && Boolean(p_district_id) && p_branch_id === null);
      if (!actorCanManageScope(p_scope_type, p_branch_id, p_district_id)) {
        return { data: null, error: { code: '42501', message: 'You do not have permission to manage roles for this scope.' } };
      }
      if (
        p_scope_type === 'branch' &&
        !(localDb.church_branches || []).some((b: any) => b.id === p_branch_id && (b.status || 'active') === 'active')
      ) {
        return { data: null, error: { code: '23503', message: 'The selected branch does not exist or is inactive.' } };
      }
      if (
        p_scope_type === 'district' &&
        !(localDb.districts || []).some((d: any) => d.id === p_district_id && (d.status || 'active') === 'active')
      ) {
        return { data: null, error: { code: '23503', message: 'The selected district does not exist or is inactive.' } };
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
      const profile = (localDb.profiles || []).find((item: any) => item.id === assignment.profile_id);
      if (!profile || (profile.record_status && profile.record_status !== 'active') || profile.status === 'archived') {
        return { data: null, error: { code: '23503', message: 'The assigned member profile is no longer active.' } };
      }
      if (assignment.scope_type === 'branch') {
        const branch = (localDb.church_branches || []).find((item: any) => item.id === assignment.branch_id);
        if (!branch || (branch.status || 'active') !== 'active') {
          return { data: null, error: { code: '23503', message: 'The assigned branch is no longer active.' } };
        }
      }
      if (assignment.scope_type === 'district') {
        const district = (localDb.districts || []).find((item: any) => item.id === assignment.district_id);
        if (!district || (district.status || 'active') !== 'active') {
          return { data: null, error: { code: '23503', message: 'The assigned district is no longer active.' } };
        }
      }
      if (assignment.expires_at && new Date(assignment.expires_at).getTime() <= Date.now()) {
        return { data: null, error: { code: '22023', message: 'This role assignment has expired. Create a new assignment with an explicit expiry date.' } };
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

    const normalizeSingleHqPerDistrict = (branches: ChurchBranch[], targetDistrictId: string | null, preferredHqBranchId: string | null) =>
      branches.map((branch: ChurchBranch) => {
        if ((branch.district_id ?? null) !== targetDistrictId) return branch;
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
        p_district_id = null,
        p_name = '',
        p_address = '',
        p_city = '',
        p_state = '',
        p_is_main_branch = false,
        p_code = '',
        p_country = ''
      } = args;
      const normalizedDistrictId = p_district_id ? String(p_district_id) : null;
      const hasChurchBranchPerm = actorBranchAssignments.some((a: any) => a.scope_type === 'church');
      if (!normalizedDistrictId) {
        if (!hasChurchBranchPerm) {
          return { data: null, error: { code: '42501', message: 'Church-wide manage_branches permission is required to create standalone branches without a district.' } };
        }
      } else {
        const district = (localDb.districts || []).find(
          (d: any) => d.id === normalizedDistrictId && (d.status || 'active') === 'active'
        );
        if (!district) {
          return { data: null, error: { code: '23503', message: 'The selected district does not exist or is inactive.' } };
        }
        if (!hasChurchBranchPerm && !actorCanManageScopeWith(actorBranchAssignments, 'district', null, normalizedDistrictId)) {
          return { data: null, error: { code: '42501', message: 'You do not have permission to create branches in this district.' } };
        }
      }
      if (Boolean(p_is_main_branch) && !hasChurchBranchPerm) {
        return { data: null, error: { code: '42501', message: 'Only church-wide administrators may designate a primary headquarters or main branch.' } };
      }
      if (!String(p_name).trim() || !String(p_address).trim() || !String(p_city).trim() || !String(p_state).trim()) {
        return { data: null, error: { code: '22023', message: 'Branch name, address, city, and state/region are required.' } };
      }
      const trimmedState = String(p_state).trim();
      const trimmedName = String(p_name).trim();
      const generatedCode =
        String(p_code || '').trim().toUpperCase() ||
        `${trimmedName.replace(/[^A-Za-z0-9]+/g, '').slice(0, 4).toUpperCase() || 'BR'}-${createMockUuid().slice(0, 6).toUpperCase()}`;
      const branch: ChurchBranch = {
        id: `branch-${createMockUuid().slice(0, 8)}`,
        district_id: normalizedDistrictId,
        name: trimmedName,
        code: generatedCode,
        address: String(p_address).trim(),
        city: String(p_city).trim(),
        state: trimmedState,
        state_or_region: trimmedState,
        country: String(p_country || '').trim() || 'Sierra Leone',
        status: 'active',
        is_main_branch: Boolean(p_is_main_branch)
      };
      let nextBranches = [...(localDb.church_branches || []), branch];
      if (branch.is_main_branch) {
        nextBranches = normalizeSingleHqPerDistrict(nextBranches, branch.district_id, branch.id);
      }
      localDb.church_branches = nextBranches;
      saveLocalDatabase(localDb);
      if (typeof window !== 'undefined') window.dispatchEvent(new Event('church_branches_updated'));
      return { data: branch, error: null };
    }

    if (functionName === 'update_church_branch') {
      const {
        p_branch_id,
        p_district_id = null,
        p_name = '',
        p_address = '',
        p_city = '',
        p_state = '',
        p_is_main_branch = false
      } = args;
      const normalizedDistrictId = p_district_id ? String(p_district_id) : null;
      const existing = (localDb.church_branches || []).find((b: any) => b.id === p_branch_id);
      if (!existing) {
        return { data: null, error: { code: '23503', message: 'The selected branch does not exist.' } };
      }
      if (
        normalizedDistrictId &&
        !(localDb.districts || []).some((d: any) => d.id === normalizedDistrictId && (d.status || 'active') === 'active')
      ) {
        return { data: null, error: { code: '23503', message: 'The selected district does not exist or is inactive.' } };
      }
      const hasChurchBranchPerm = actorBranchAssignments.some((a: any) => a.scope_type === 'church');
      if (!hasChurchBranchPerm) {
        if (!existing.district_id || !normalizedDistrictId) {
          return { data: null, error: { code: '42501', message: 'Only church-wide administrators may manage standalone branches or attach/detach districts.' } };
        }
        const canManageSource = actorCanManageScopeWith(actorBranchAssignments, 'district', null, existing.district_id);
        const canManageTarget = actorCanManageScopeWith(actorBranchAssignments, 'district', null, normalizedDistrictId);
        if (!canManageSource || !canManageTarget) {
          return { data: null, error: { code: '42501', message: 'You do not have permission to update this branch or move it across districts.' } };
        }
        if (Boolean(p_is_main_branch) !== Boolean(existing.is_main_branch)) {
          return { data: null, error: { code: '42501', message: 'Only church-wide administrators may change district HQ or main branch designation.' } };
        }
      }
      if (!String(p_name).trim() || !String(p_address).trim() || !String(p_city).trim() || !String(p_state).trim()) {
        return { data: null, error: { code: '22023', message: 'Branch name, address, city, and state/region are required.' } };
      }
      const trimmedState = String(p_state).trim();
      const updated: ChurchBranch = {
        ...existing,
        district_id: normalizedDistrictId,
        name: String(p_name).trim(),
        address: String(p_address).trim(),
        city: String(p_city).trim(),
        state: trimmedState,
        state_or_region: trimmedState,
        is_main_branch: Boolean(p_is_main_branch)
      };
      let nextBranches = (localDb.church_branches || []).map((b: any) => (b.id === p_branch_id ? updated : b));
      if (updated.is_main_branch) {
        nextBranches = normalizeSingleHqPerDistrict(nextBranches, updated.district_id, updated.id);
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
