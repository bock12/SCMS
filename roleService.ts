import { CustomRole, MemberRoleAssignment, PermissionKey, Profile } from './types';

const ROLES_STORAGE_KEY = 'faithconnect_custom_roles_v1';
const ASSIGNMENTS_STORAGE_KEY = 'faithconnect_member_role_assignments_v1';

export const ALL_PERMISSIONS: { key: PermissionKey; label: string; description: string }[] = [
  { key: 'manage_finances', label: 'Manage Finances & Giving', description: 'Access financial ledger, record tithes, manage fund categories and payment options.' },
  { key: 'approve_requisitions', label: 'Approve Requisitions & Expenses', description: 'Approve or disburse internal ministry and event funding requests.' },
  { key: 'manage_events', label: 'Manage Church Events & Workspace', description: 'Create events, set order of service, manage run of show and rosters.' },
  { key: 'manage_event_budgets', label: 'Manage & Approve Event Budgets', description: 'Create event budgets and review/approve event financial proposals.' },
  { key: 'event_check_in', label: 'Perform Event Check-Ins', description: 'Mark attendees present/absent via manual roster or QR pass scanner.' },
  { key: 'manage_members', label: 'Manage Congregation Profiles', description: 'View member database, edit roles, baptism details, and contact info.' },
  { key: 'manage_ministries', label: 'Manage Ministry Departments', description: 'Oversee department leads, volunteer teams, and internal requisitions.' },
  { key: 'manage_streams', label: 'Manage Live Broadcasts', description: 'Schedule YouTube/Facebook live streams and moderate chat.' },
  { key: 'generate_reports', label: 'Generate PDF Audit Reports', description: 'Export tax statements, financial audit summaries, and closeout reports.' }
];

export const INITIAL_ROLES: CustomRole[] = [
  {
    id: 'role-1',
    name: 'Senior Pastor & Executive Council',
    category: 'Spiritual',
    ministry_name: 'Executive & Pastoral Council',
    description: 'Overall spiritual oversight, sermon ministry, pastoral care, and final governance.',
    responsibilities: [
      'Lead Sunday worship services and preach the prophetic word',
      'Oversee pastoral care and spiritual counseling',
      'Provide strategic direction for church growth and church planting',
      'Review executive financial reports and approve major capital expenditures'
    ],
    permissions: ['manage_finances', 'approve_requisitions', 'manage_events', 'manage_event_budgets', 'manage_members', 'manage_ministries', 'manage_streams', 'generate_reports'],
    created_at: new Date().toISOString()
  },
  {
    id: 'role-2',
    name: 'Finance Officer / Financial Director',
    category: 'Finance',
    ministry_name: 'Finance & Treasury Department',
    description: 'Responsible for tithes, offerings, ledger bookkeeping, budget approvals, and disbursement invoicing.',
    responsibilities: [
      'Record weekly tithes, offerings, and special giving funds',
      'Manage mobile money and bank transfer payment configuration',
      'Review and approve department internal funding requests & event budgets',
      'Generate monthly, quarterly, and annual PDF audit reports'
    ],
    permissions: ['manage_finances', 'approve_requisitions', 'manage_event_budgets', 'generate_reports'],
    created_at: new Date().toISOString()
  },
  {
    id: 'role-3',
    name: 'Choir Director & Lead Cantor',
    category: 'Spiritual',
    ministry_name: 'Sanctuary Choir & Music Ministry',
    description: 'Directs Sunday praise & worship teams, conducts choir rehearsals, and organizes special musical concerts.',
    responsibilities: [
      'Lead weekly choir vocal rehearsals and instrument soundchecks',
      'Select Sunday service worship setlists and hymn arrangements',
      'Appoint section leaders and soloists'
    ],
    permissions: ['manage_ministries', 'manage_events'],
    created_at: new Date().toISOString()
  },
  {
    id: 'role-4',
    name: 'Protocol & Ushering Captain',
    category: 'Operations',
    ministry_name: 'Ushering & Sanctuary Protocol',
    description: 'Directs door ushering teams, guest welcome reception, seating arrangements, and sanctuary door check-ins.',
    responsibilities: [
      'Manage Sunday service ushering rosters and door greeting teams',
      'Operate sanctuary entrance QR scanner and attendance roster',
      'Maintain order during altar calls and communion'
    ],
    permissions: ['event_check_in', 'manage_events'],
    created_at: new Date().toISOString()
  },
  {
    id: 'role-5',
    name: 'Youth Ministry Coordinator',
    category: 'Youth & Children',
    ministry_name: 'Youth & Young Adult Fellowship',
    description: 'Coordinates Friday youth rallies, campus outreaches, Bible studies, and youth summer retreats.',
    responsibilities: [
      'Plan monthly youth empowerment programs and sports events',
      'Organize youth mentorship circles and campus evangelism',
      'Submit youth ministry budget requests'
    ],
    permissions: ['manage_ministries', 'manage_events', 'approve_requisitions'],
    created_at: new Date().toISOString()
  },
  {
    id: 'role-6',
    name: 'Media Broadcast Specialist',
    category: 'Creative & Media',
    ministry_name: 'Media & Digital Production Team',
    description: 'Manages live stream sanctuary broadcasts, camera switching, audio mixing, and digital screens.',
    responsibilities: [
      'Operate broadcast software for YouTube & Facebook live streams',
      'Manage sanctuary mixing consoles and camera angles',
      'Moderate online sanctuary chat'
    ],
    permissions: ['manage_streams', 'event_check_in'],
    created_at: new Date().toISOString()
  }
];

export const getCustomRoles = (): CustomRole[] => {
  try {
    const raw = localStorage.getItem(ROLES_STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (e) {
    console.error("Error loading custom roles:", e);
  }
  return INITIAL_ROLES;
};

export const saveCustomRoles = (roles: CustomRole[]): void => {
  try {
    localStorage.setItem(ROLES_STORAGE_KEY, JSON.stringify(roles));
    window.dispatchEvent(new Event('custom_roles_updated'));
  } catch (e) {
    console.error("Error saving custom roles:", e);
  }
};

export const getRoleAssignments = (): MemberRoleAssignment[] => {
  try {
    const raw = localStorage.getItem(ASSIGNMENTS_STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (e) {
    console.error("Error loading role assignments:", e);
  }
  return [
    { id: 'asgn-1', profile_id: 'p1', member_name: 'Pastor Samuel Koroma', role_id: 'role-1', role_name: 'Senior Pastor & Executive Council', assigned_at: new Date().toISOString(), assigned_by: 'Super Admin' },
    { id: 'asgn-2', profile_id: 'p2', member_name: 'Emmanuel Sesay', role_id: 'role-2', role_name: 'Finance Officer / Financial Director', assigned_at: new Date().toISOString(), assigned_by: 'Super Admin' }
  ];
};

export const saveRoleAssignments = (assignments: MemberRoleAssignment[]): void => {
  try {
    localStorage.setItem(ASSIGNMENTS_STORAGE_KEY, JSON.stringify(assignments));
    window.dispatchEvent(new Event('role_assignments_updated'));
  } catch (e) {
    console.error("Error saving role assignments:", e);
  }
};

export function getUserPermissions(profile: Profile | null): PermissionKey[] {
  if (!profile) return [];

  const role = profile.primary_role || 'member';

  // Super admins, admins, pastors get full system permissions
  if (['super_admin', 'admin', 'pastor'].includes(role)) {
    return ALL_PERMISSIONS.map(p => p.key);
  }

  const rolePermissionsSet = new Set<PermissionKey>();

  // Add default primary_role permissions
  if (role === 'finance_officer') {
    ['manage_finances', 'approve_requisitions', 'manage_event_budgets', 'generate_reports'].forEach(k => rolePermissionsSet.add(k as PermissionKey));
  } else if (role === 'leader') {
    ['manage_ministries', 'manage_events', 'event_check_in'].forEach(k => rolePermissionsSet.add(k as PermissionKey));
  } else if (role === 'worker') {
    ['event_check_in', 'manage_streams'].forEach(k => rolePermissionsSet.add(k as PermissionKey));
  }

  // Add permissions from custom role assignments in localStorage
  try {
    const assignments = getRoleAssignments();
    const userAssignments = assignments.filter(a => 
      a.profile_id === profile.id || 
      (profile.email && a.member_name.toLowerCase().includes(profile.first_name.toLowerCase()))
    );

    if (userAssignments.length > 0) {
      const customRoles = getCustomRoles();
      userAssignments.forEach(asgn => {
        const customRole = customRoles.find(r => r.id === asgn.role_id);
        if (customRole && customRole.permissions) {
          customRole.permissions.forEach(p => rolePermissionsSet.add(p));
        }
      });
    }
  } catch (e) {
    console.error("Error evaluating user permissions:", e);
  }

  return Array.from(rolePermissionsSet);
}

export function hasPermission(profile: Profile | null, permissionKey: PermissionKey): boolean {
  if (!profile) return false;
  if (['super_admin', 'admin', 'pastor'].includes(profile.primary_role)) return true;
  
  const userPerms = getUserPermissions(profile);
  return userPerms.includes(permissionKey);
}

