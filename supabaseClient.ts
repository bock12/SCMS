import type { Profile, District, ChurchBranch, MemberTransfer, Stream, ChatMessage, Ministry, FinancialRecord, PrayerRequest, ChurchEvent, EventRegistration } from './types';

// Storage keys
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

  return {
    ...rest,
    email: (rest.email || '').trim().toLowerCase(),
    phone: rest.phone || '',
    auth_user_id: rest.auth_user_id !== undefined ? (rest.auth_user_id || null) : null,
    status: rest.status || 'active',
    membership_status: rest.membership_status || 'active',
    membership_date: rest.membership_date || (rest.created_at ? String(rest.created_at).slice(0, 10) : new Date().toISOString().slice(0, 10))
  } as Profile;
}

function getStoredUsersRaw(): Record<string, { id: string; email: string; password?: string; setup_token?: string; user_metadata?: any }> {
  try {
    const raw = localStorage.getItem(USERS_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {}

  const defaultUsers: Record<string, any> = {
    'admin@faithconnect.church': {
      id: 'usr-admin-1',
      email: 'admin@faithconnect.church',
      password: 'password123',
      user_metadata: { first_name: 'David', last_name: 'Miller' }
    },
    'pastor@faithconnect.church': {
      id: 'usr-pastor-1',
      email: 'pastor@faithconnect.church',
      password: 'password123',
      user_metadata: { first_name: 'Sarah', last_name: 'Johnson' }
    },
    'bishop@faithconnect.church': {
      id: 'usr-bishop-1',
      email: 'bishop@faithconnect.church',
      password: 'password123',
      user_metadata: { first_name: 'Michael', last_name: 'Thomas' }
    },
    'worship@faithconnect.church': {
      id: 'usr-leader-1',
      email: 'worship@faithconnect.church',
      password: 'password123',
      user_metadata: { first_name: 'Hannah', last_name: 'Adams' }
    },
    'member@faithconnect.church': {
      id: 'usr-member-1',
      email: 'member@faithconnect.church',
      password: 'password123',
      user_metadata: { first_name: 'Grace', last_name: 'Campbell' }
    }
  };
  localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(defaultUsers));
  return defaultUsers;
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
  remapTableMemberIds('event_registrations');
  remapTableMemberIds('event_survey_responses');

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
      if (!Array.isArray(parsed.church_resources)) parsed.church_resources = [];
      if (!Array.isArray(parsed.event_surveys)) parsed.event_surveys = [];
      if (!Array.isArray(parsed.event_survey_questions)) parsed.event_survey_questions = [];
      if (!Array.isArray(parsed.event_survey_responses)) parsed.event_survey_responses = [];
      if (!Array.isArray(parsed.event_survey_answers)) parsed.event_survey_answers = [];

      const migrated = migrateUnifiedDirectoryData(parsed);
      if (migrated.changed) {
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
    member_transfers: initialTransfers,
    streams: initialStreams,
    stream_chat_messages: initialMessages,
    ministries: initialMinistries,
    ministry_members: [],
    church_resources: [],
    event_surveys: [],
    event_survey_questions: [],
    event_survey_responses: [],
    event_survey_answers: [],
    financial_records: initialFinancials,
    prayer_requests: initialPrayers,
    events: initialEvents,
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
          ...item
        };
        return this.tableName === 'profiles' ? sanitizeProfileRecord(record) : record;
      });
      localDb[this.tableName] = [...rows, ...inserted];
      saveLocalDatabase(localDb);

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

    const newId = `usr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
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
      id: `per_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
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

    const authUserId = targetProfile.auth_user_id || `usr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
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
            primary_role: primaryRole || p.primary_role || 'member',
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
    if (profile.status === 'suspended' || profile.status === 'archived') {
      return { data: { user: null, session: null }, error: { message: 'This portal account is suspended or archived.' } };
    }

    users[normalizedEmail] = {
      ...user,
      password: newPassword,
      setup_token: undefined
    };
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
        ? sanitizeProfileRecord({ ...item, auth_user_id: null })
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

    const newId = `usr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
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
        id: `per_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
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
    if (matchingProfile.status === 'suspended' || matchingProfile.status === 'archived') {
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
