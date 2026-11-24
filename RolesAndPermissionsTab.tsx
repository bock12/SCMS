import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from './supabaseClient';
import { resolveDataClient } from './supabaseIntegration';
import { getMembers } from './memberService';
import { PERMISSION_LABELS, canManageTargetRoleByScope } from './permissionResolutionService';
import { resolveActorBranchGovernanceScope, type BranchGovernanceScope } from './branchManagementService';
import {
  getProfileRoleData,
  assignProfileRole,
  deactivateProfileRoleAssignment,
  reactivateProfileRoleAssignment,
  updateProfileRoleAssignment,
  deleteProfileRoleAssignment,
  updateRolePermissions,
  type SystemRole,
  type ProfileRoleAssignment
} from './profileRoleAssignmentService';
import type { Profile, ChurchBranch, District } from './types';
import {
  ShieldCheck,
  UserPlus,
  UserMinus,
  UserCheck,
  SlidersHorizontal,
  Search,
  Lock,
  X,
  Check,
  Edit3,
  Trash2,
  ChevronDown,
  ChevronUp
} from 'lucide-react';

interface PermissionRow {
  id: string;
  key: string;
  module: string;
  description: string | null;
}

interface RolePermissionRow {
  role_id: string;
  permission_id: string;
}

const MODULE_LABELS: Record<string, string> = {
  authorization: 'Authorization & Access Control',
  members: 'Members & Transfers',
  finance: 'Finance & Accounting',
  ministries: 'Ministries & Departments',
  events: 'Events & Registration',
  attendance: 'Attendance Tracking',
  resources: 'Church Resources',
  surveys: 'Event Surveys & Feedback',
  streaming: 'Sanctuary Live Streaming',
  welfare: 'Welfare & Care',
  church: 'Branches & Districts',
  audit: 'Audit & Governance'
};

const formatRoleName = (name: string): string =>
  name
    .split('_')
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

const formatModuleName = (moduleKey: string): string =>
  MODULE_LABELS[moduleKey] ||
  moduleKey
    .split('_')
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

export interface RolesAndPermissionsTabProps {
  profile?: Profile | null;
  refreshTrigger?: number;
  onRefreshingChange?: (refreshing: boolean) => void;
}

export const RolesAndPermissionsTab: React.FC<RolesAndPermissionsTabProps> = ({
  profile = null,
  refreshTrigger = 0,
  onRefreshingChange
}) => {
  const [roles, setRoles] = useState<SystemRole[]>([]);
  const [assignments, setAssignments] = useState<ProfileRoleAssignment[]>([]);
  const [permissions, setPermissions] = useState<PermissionRow[]>([]);
  const [rolePermissions, setRolePermissions] = useState<RolePermissionRow[]>([]);
  const [members, setMembers] = useState<Profile[]>([]);
  const [branches, setBranches] = useState<ChurchBranch[]>([]);
  const [districts, setDistricts] = useState<District[]>([]);
  const [actorScope, setActorScope] = useState<BranchGovernanceScope | null>(null);
  const [profileId, setProfileId] = useState('');
  const [roleId, setRoleId] = useState('');
  const [scopeType, setScopeType] = useState<'church' | 'district' | 'branch'>('church');
  const [branchId, setBranchId] = useState('');
  const [districtId, setDistrictId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Role permission customization modal state
  const [editingRole, setEditingRole] = useState<SystemRole | null>(null);
  const [selectedPermissionIds, setSelectedPermissionIds] = useState<Set<string>>(new Set());
  const [initialEditingIds, setInitialEditingIds] = useState<Set<string>>(new Set());
  const [permissionSearch, setPermissionSearch] = useState('');
  const [savingPermissions, setSavingPermissions] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // Mobile/tablet responsive section filter & expandable role permission previews
  const [activeSection, setActiveSection] = useState<'all' | 'roles' | 'assignments'>('all');
  const [expandedRoleIds, setExpandedRoleIds] = useState<Set<string>>(new Set());

  // Member role assignment search, filter, edit, and delete confirmation state
  const [assignmentSearch, setAssignmentSearch] = useState('');
  const [assignmentStatusFilter, setAssignmentStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [editingAssignment, setEditingAssignment] = useState<ProfileRoleAssignment | null>(null);
  const [editRoleId, setEditRoleId] = useState('');
  const [editScopeType, setEditScopeType] = useState<'church' | 'district' | 'branch'>('church');
  const [editBranchId, setEditBranchId] = useState('');
  const [editDistrictId, setEditDistrictId] = useState('');
  const [editModalError, setEditModalError] = useState<string | null>(null);

  const onRefreshingChangeRef = useRef(onRefreshingChange);
  onRefreshingChangeRef.current = onRefreshingChange;

  const refresh = useCallback(async (isManualRefresh = false) => {
    if (isManualRefresh) {
      onRefreshingChangeRef.current?.(true);
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      const client = resolveDataClient(supabase);
      const [roleData, memberData, permissionResult, linkResult, branchResult, districtResult] = await Promise.all([
        getProfileRoleData(),
        getMembers(),
        client.from('permissions').select('*').order('module', { ascending: true }),
        client.from('role_permissions').select('*'),
        client.from('church_branches').select('*').order('name', { ascending: true }),
        client.from('districts').select('*').order('name', { ascending: true })
      ]);
      if (permissionResult.error) throw new Error(permissionResult.error.message);
      if (linkResult.error) throw new Error(linkResult.error.message);
      if (branchResult.error) throw new Error(branchResult.error.message);
      if (districtResult.error) throw new Error(districtResult.error.message);
      const loadedBranches = (branchResult.data || []) as ChurchBranch[];
      const loadedDistricts = (districtResult.data || []) as District[];
      const resolvedScope = profile?.id
        ? await resolveActorBranchGovernanceScope(profile.id, loadedDistricts, loadedBranches)
        : null;
      setRoles(roleData.roles);
      setAssignments(roleData.assignments);
      setMembers(memberData);
      setPermissions((permissionResult.data || []) as PermissionRow[]);
      setRolePermissions((linkResult.data || []) as RolePermissionRow[]);
      setBranches(loadedBranches);
      setDistricts(loadedDistricts);
      setActorScope(resolvedScope);
      const canChurchRoles = resolvedScope ? resolvedScope.hasChurchRoleAccess : true;
      const defaultRole = roleData.roles.find(r => canManageTargetRoleByScope(canChurchRoles, r.name));
      setRoleId(current => {
        if (current && roleData.roles.some(r => r.id === current && canManageTargetRoleByScope(canChurchRoles, r.name))) {
          return current;
        }
        return defaultRole?.id || '';
      });
      setProfileId(current => current || memberData[0]?.id || '');
      if (resolvedScope && !resolvedScope.hasChurchRoleAccess) {
        setScopeType(current => (current === 'church' ? 'branch' : current));
        if (resolvedScope.assignableBranchIds.length > 0) {
          setBranchId(current => current || resolvedScope.assignableBranchIds[0]);
        }
      }
      if (isManualRefresh) {
        setNotice('Roles, permissions, and assignments refreshed.');
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load role and permission data.');
    } finally {
      if (isManualRefresh) {
        onRefreshingChangeRef.current?.(false);
      } else {
        setLoading(false);
      }
    }
  }, [profile?.id]);

  useEffect(() => {
    void refresh(false);
  }, [refresh]);

  useEffect(() => {
    if (refreshTrigger > 0) {
      void refresh(true);
    }
  }, [refreshTrigger, refresh]);

  useEffect(() => {
    if (!editingRole && !editingAssignment) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (editingRole && !savingPermissions) setEditingRole(null);
        if (editingAssignment && !saving) setEditingAssignment(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [editingRole, editingAssignment, savingPermissions, saving]);

  const permissionById = useMemo(() => {
    const map = new Map<string, PermissionRow>();
    permissions.forEach(permission => map.set(permission.id, permission));
    return map;
  }, [permissions]);

  const manageRolesPermissionId = useMemo(
    () => permissions.find(permission => permission.key === 'manage_roles')?.id || null,
    [permissions]
  );

  const rolePermissionIdsMap = useMemo(() => {
    const result = new Map<string, Set<string>>();
    rolePermissions.forEach(link => {
      const current = result.get(link.role_id) || new Set<string>();
      if (permissionById.has(link.permission_id)) {
        current.add(link.permission_id);
      }
      result.set(link.role_id, current);
    });
    return result;
  }, [permissionById, rolePermissions]);

  const rolePermissionsListMap = useMemo(() => {
    const result = new Map<string, PermissionRow[]>();
    roles.forEach(role => {
      const idSet = rolePermissionIdsMap.get(role.id) || new Set<string>();
      const list = permissions.filter(permission => idSet.has(permission.id));
      result.set(role.id, list);
    });
    return result;
  }, [permissions, rolePermissionIdsMap, roles]);

  const filteredPermissionsByModule = useMemo(() => {
    const query = permissionSearch.trim().toLowerCase();
    const groups = new Map<string, PermissionRow[]>();
    permissions.forEach(permission => {
      const label = PERMISSION_LABELS[permission.key] || permission.key;
      if (query) {
        const matches =
          label.toLowerCase().includes(query) ||
          permission.key.toLowerCase().includes(query) ||
          permission.module.toLowerCase().includes(query) ||
          formatModuleName(permission.module).toLowerCase().includes(query) ||
          (permission.description || '').toLowerCase().includes(query);
        if (!matches) return;
      }
      const existing = groups.get(permission.module) || [];
      existing.push(permission);
      groups.set(permission.module, existing);
    });
    return Array.from(groups.entries());
  }, [permissionSearch, permissions]);

  const isLockedPermission = (role: SystemRole | null, permissionId: string): boolean =>
    Boolean(role?.name === 'super_admin' && manageRolesPermissionId && permissionId === manageRolesPermissionId);

  const toggleRoleExpanded = (targetRoleId: string) => {
    setExpandedRoleIds(prev => {
      const next = new Set(prev);
      if (next.has(targetRoleId)) next.delete(targetRoleId);
      else next.add(targetRoleId);
      return next;
    });
  };

  const openCustomizer = (role: SystemRole) => {
    const currentSet = new Set<string>(rolePermissionIdsMap.get(role.id) || []);
    if (role.name === 'super_admin' && manageRolesPermissionId) {
      currentSet.add(manageRolesPermissionId);
    }
    setEditingRole(role);
    setSelectedPermissionIds(currentSet);
    setInitialEditingIds(new Set<string>(currentSet));
    setPermissionSearch('');
    setModalError(null);
  };

  const togglePermission = (permissionId: string) => {
    if (isLockedPermission(editingRole, permissionId)) return;
    setSelectedPermissionIds(prev => {
      const next = new Set(prev);
      if (next.has(permissionId)) {
        next.delete(permissionId);
      } else {
        next.add(permissionId);
      }
      return next;
    });
  };

  const toggleModulePermissions = (modulePermissions: PermissionRow[], selectAll: boolean) => {
    setSelectedPermissionIds(prev => {
      const next = new Set(prev);
      modulePermissions.forEach(permission => {
        if (selectAll) {
          next.add(permission.id);
        } else if (!isLockedPermission(editingRole, permission.id)) {
          next.delete(permission.id);
        }
      });
      return next;
    });
  };

  const selectAllVisibleOrClear = (selectAll: boolean) => {
    setSelectedPermissionIds(prev => {
      const next = new Set(prev);
      const targetList = filteredPermissionsByModule.flatMap(([, items]) => items);
      targetList.forEach(permission => {
        if (selectAll) {
          next.add(permission.id);
        } else if (!isLockedPermission(editingRole, permission.id)) {
          next.delete(permission.id);
        }
      });
      return next;
    });
  };

  const diffCounts = useMemo(() => {
    let added = 0;
    let removed = 0;
    selectedPermissionIds.forEach(id => {
      if (!initialEditingIds.has(id)) added += 1;
    });
    initialEditingIds.forEach(id => {
      if (!selectedPermissionIds.has(id)) removed += 1;
    });
    return { added, removed, changed: added > 0 || removed > 0 };
  }, [initialEditingIds, selectedPermissionIds]);

  const handleSavePermissions = async () => {
    if (!editingRole) return;
    setSavingPermissions(true);
    setModalError(null);
    setNotice(null);
    try {
      const payloadIds = Array.from<string>(selectedPermissionIds);
      await updateRolePermissions(editingRole.id, payloadIds);
      const savedRoleName = formatRoleName(editingRole.name);
      setEditingRole(null);
      setNotice(`Updated permissions for ${savedRoleName} (${payloadIds.length} active).`);
      await refresh();
    } catch (cause) {
      setModalError(cause instanceof Error ? cause.message : 'Unable to save role permissions.');
    } finally {
      setSavingPermissions(false);
    }
  };

  const handleAssign = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!profileId || !roleId) return;
    if (scopeType === 'branch' && !branchId) {
      setError('Select a branch for this assignment.');
      return;
    }
    if (scopeType === 'district' && !districtId) {
      setError('Select a district for this assignment.');
      return;
    }

    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await assignProfileRole({
        profile_id: profileId,
        role_id: roleId,
        scope_type: scopeType,
        branch_id: scopeType === 'branch' ? branchId : null,
        district_id: scopeType === 'district' ? districtId : null
      });
      setNotice('Role assignment saved.');
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save member role assignment.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async (assignment: ProfileRoleAssignment) => {
    setSaving(true);
    setError(null);
    setNotice(null);
    setConfirmDeleteId(null);
    try {
      await deactivateProfileRoleAssignment(assignment.id);
      setNotice('Role assignment deactivated.');
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to deactivate role assignment.');
    } finally {
      setSaving(false);
    }
  };

  const handleReactivate = async (assignment: ProfileRoleAssignment) => {
    setSaving(true);
    setError(null);
    setNotice(null);
    setConfirmDeleteId(null);
    try {
      await reactivateProfileRoleAssignment(assignment.id);
      setNotice('Role assignment reactivated.');
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to reactivate role assignment.');
    } finally {
      setSaving(false);
    }
  };

  const openEditAssignment = (assignment: ProfileRoleAssignment) => {
    setConfirmDeleteId(null);
    setEditingAssignment(assignment);
    setEditRoleId(assignment.role_id);
    setEditScopeType(assignment.scope_type);
    setEditBranchId(assignment.branch_id || '');
    setEditDistrictId(assignment.district_id || '');
    setEditModalError(null);
  };

  const handleSaveAssignmentEdit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editingAssignment || !editRoleId) return;
    if (editScopeType === 'branch' && !editBranchId) {
      setEditModalError('Select a branch for this assignment.');
      return;
    }
    if (editScopeType === 'district' && !editDistrictId) {
      setEditModalError('Select a district for this assignment.');
      return;
    }
    setSaving(true);
    setEditModalError(null);
    setNotice(null);
    try {
      await updateProfileRoleAssignment({
        id: editingAssignment.id,
        role_id: editRoleId,
        scope_type: editScopeType,
        branch_id: editScopeType === 'branch' ? editBranchId : null,
        district_id: editScopeType === 'district' ? editDistrictId : null
      });
      setEditingAssignment(null);
      setNotice('Role assignment updated.');
      await refresh();
    } catch (cause) {
      setEditModalError(cause instanceof Error ? cause.message : 'Unable to update role assignment.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAssignment = async (assignment: ProfileRoleAssignment) => {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await deleteProfileRoleAssignment(assignment.id);
      setConfirmDeleteId(null);
      setNotice('Role assignment removed.');
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to remove role assignment.');
    } finally {
      setSaving(false);
    }
  };

  const memberNames = useMemo(
    () => new Map(members.map(member => [member.id, `${member.first_name} ${member.last_name}`.trim()])),
    [members]
  );

  const assignmentCounts = useMemo(() => {
    let activeCount = 0;
    let inactiveCount = 0;
    const now = Date.now();
    assignments.forEach(assignment => {
      const isActive =
        assignment.is_active &&
        new Date(assignment.assigned_at || 0).getTime() <= now &&
        (!assignment.expires_at || new Date(assignment.expires_at).getTime() > now);
      if (isActive) activeCount += 1;
      else inactiveCount += 1;
    });
    return { total: assignments.length, active: activeCount, inactive: inactiveCount };
  }, [assignments]);

  const filteredAssignments = useMemo(() => {
    const query = assignmentSearch.trim().toLowerCase();
    const now = Date.now();
    return assignments.filter(assignment => {
      const isActive =
        assignment.is_active &&
        new Date(assignment.assigned_at || 0).getTime() <= now &&
        (!assignment.expires_at || new Date(assignment.expires_at).getTime() > now);
      if (assignmentStatusFilter === 'active' && !isActive) return false;
      if (assignmentStatusFilter === 'inactive' && isActive) return false;
      if (!query) return true;
      const memberLabel = (memberNames.get(assignment.profile_id) || assignment.profile_id).toLowerCase();
      const roleObj = roles.find(item => item.id === assignment.role_id);
      const roleLabel = roleObj ? `${formatRoleName(roleObj.name)} ${roleObj.name}`.toLowerCase() : 'unknown role';
      const scopeLabel = (
        assignment.scope_type === 'branch'
          ? branches.find(item => item.id === assignment.branch_id)?.name || 'branch'
          : assignment.scope_type === 'district'
          ? districts.find(item => item.id === assignment.district_id)?.name || 'district'
          : 'church-wide'
      ).toLowerCase();
      return memberLabel.includes(query) || roleLabel.includes(query) || scopeLabel.includes(query);
    });
  }, [assignmentSearch, assignmentStatusFilter, assignments, branches, districts, memberNames, roles]);

  if (loading) return <div className="p-8 text-center text-slate-500">Loading database roles and permissions…</div>;

  return (
    <div className="space-y-5 sm:space-y-6 min-w-0 w-full">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl font-black text-slate-900 flex items-center gap-2"><ShieldCheck className="shrink-0" /> Roles & Permissions</h2>
          <p className="text-sm text-slate-500 mt-1">Customize system role permissions and manage scoped member role assignments.</p>
        </div>
        <div className="w-full sm:w-auto">
          <div className="grid grid-cols-3 sm:inline-flex items-center gap-1 p-1 bg-slate-100 rounded-xl w-full sm:w-auto">
            <button
              type="button"
              onClick={() => setActiveSection('all')}
              className={`min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-bold transition-colors whitespace-nowrap cursor-pointer ${
                activeSection === 'all' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All
            </button>
            <button
              type="button"
              onClick={() => setActiveSection('roles')}
              className={`min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-bold transition-colors whitespace-nowrap tabular-nums cursor-pointer ${
                activeSection === 'roles' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Roles ({roles.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveSection('assignments')}
              className={`min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-bold transition-colors whitespace-nowrap tabular-nums cursor-pointer ${
                activeSection === 'assignments' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Assigned ({assignmentCounts.total})
            </button>
          </div>
        </div>
      </div>

      {error && <div role="alert" className="p-3 rounded-xl bg-rose-50 text-rose-700 border border-rose-200 text-sm">{error}</div>}
      {notice && <div role="status" className="p-3 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 text-sm">{notice}</div>}

      {(() => {
        const hasChurchRoleAccess = actorScope ? actorScope.hasChurchRoleAccess : true;
        const assignableRoles = roles.filter(r => canManageTargetRoleByScope(hasChurchRoleAccess, r.name));
        const scopedBranches = hasChurchRoleAccess
          ? branches
          : branches.filter(b => actorScope?.assignableBranchIds.includes(b.id));
        const scopedDistricts = hasChurchRoleAccess
          ? districts
          : districts.filter(d =>
              assignments.some(
                a =>
                  a.profile_id === profile?.id &&
                  a.is_active &&
                  a.scope_type === 'district' &&
                  a.district_id === d.id
              )
            );
        return (
          <form onSubmit={handleAssign} className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 lg:p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-4">
            <div className="sm:col-span-2 lg:col-span-3">
              <h3 className="font-extrabold text-slate-900 flex items-center gap-2"><UserPlus size={17} className="shrink-0" /> Assign a system role</h3>
              <p className="text-xs text-slate-500 mt-1">Assignments are linked to member profiles, including directory-only members. Login access is not required.</p>
            </div>
            <label className="text-sm font-bold text-slate-700 min-w-0">Member
              <select required value={profileId} onChange={event => setProfileId(event.target.value)} className="mt-1 w-full min-h-[44px] p-2.5 border border-slate-200 rounded-xl bg-white">
                <option value="">Select member</option>
                {members.map(member => <option key={member.id} value={member.id}>{member.first_name} {member.last_name}</option>)}
              </select>
            </label>
            <label className="text-sm font-bold text-slate-700 min-w-0">System role
              <select required value={roleId} onChange={event => setRoleId(event.target.value)} className="mt-1 w-full min-h-[44px] p-2.5 border border-slate-200 rounded-xl bg-white">
                <option value="">Select role</option>
                {assignableRoles.map(role => <option key={role.id} value={role.id}>{formatRoleName(role.name)}</option>)}
              </select>
            </label>
            <label className="text-sm font-bold text-slate-700 min-w-0">Assignment scope
              <select value={scopeType} onChange={event => setScopeType(event.target.value as typeof scopeType)} className="mt-1 w-full min-h-[44px] p-2.5 border border-slate-200 rounded-xl bg-white">
                {hasChurchRoleAccess && <option value="church">Church-wide</option>}
                {(hasChurchRoleAccess || scopedDistricts.length > 0) && <option value="district">District</option>}
                <option value="branch">Branch</option>
              </select>
            </label>
            {scopeType === 'branch' && <label className="text-sm font-bold text-slate-700 min-w-0 sm:col-span-2 lg:col-span-2">Branch
              <select required value={branchId} onChange={event => setBranchId(event.target.value)} className="mt-1 w-full min-h-[44px] p-2.5 border border-slate-200 rounded-xl bg-white">
                <option value="">Select branch</option>
                {scopedBranches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
              </select>
            </label>}
            {scopeType === 'district' && <label className="text-sm font-bold text-slate-700 min-w-0 sm:col-span-2 lg:col-span-2">District
              <select required value={districtId} onChange={event => setDistrictId(event.target.value)} className="mt-1 w-full min-h-[44px] p-2.5 border border-slate-200 rounded-xl bg-white">
                <option value="">Select district</option>
                {scopedDistricts.map(district => <option key={district.id} value={district.id}>{district.name}</option>)}
              </select>
            </label>}
            <div className="sm:col-span-2 lg:col-span-3 flex justify-end pt-1">
              <button disabled={saving || !profileId || !roleId} className="min-h-[44px] w-full sm:w-auto px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold disabled:opacity-50 whitespace-nowrap cursor-pointer flex items-center justify-center">
                {saving ? 'Saving…' : 'Assign Role'}
              </button>
            </div>
          </form>
        );
      })()}

      {(activeSection === 'all' || activeSection === 'roles') && (
        <section className="space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
            <div>
              <h3 className="text-base font-extrabold text-slate-900">Role Permission Profiles</h3>
              <p className="text-xs text-slate-500">Select Customize Permissions on any role to add or remove capabilities across modules.</p>
            </div>
            <span className="text-xs font-bold text-slate-500 tabular-nums whitespace-nowrap">
              {roles.length} roles · {permissions.length} total permissions
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
            {roles.map(role => {
              const rolePerms = rolePermissionsListMap.get(role.id) || [];
              const isExpanded = expandedRoleIds.has(role.id);
              const previewLimit = 6;
              const visiblePerms = isExpanded ? rolePerms : rolePerms.slice(0, previewLimit);
              const hiddenCount = Math.max(0, rolePerms.length - previewLimit);
              return (
                <section key={role.id} className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 flex flex-col justify-between gap-3.5 min-w-0">
                  <div className="flex-1">
                    <div className="min-w-0">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <h4 className="font-extrabold text-slate-900 text-base">{formatRoleName(role.name)}</h4>
                        <span className="text-xs font-semibold text-slate-500 tabular-nums">
                          {rolePerms.length} / {permissions.length} permissions
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">{role.description || 'System role'}</p>
                    </div>

                    <div className="mt-3.5 pt-3 border-t border-slate-100">
                      {rolePerms.length === 0 ? (
                        <span className="text-xs text-slate-400">No permissions assigned</span>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {visiblePerms.map(permission => (
                            <span
                              key={permission.id}
                              title={`${permission.key} (${formatModuleName(permission.module)})`}
                              className="text-[11px] font-medium px-2 py-1 rounded-md bg-slate-50 text-slate-700 border border-slate-200"
                            >
                              {PERMISSION_LABELS[permission.key] || permission.key}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2.5">
                    {rolePerms.length > previewLimit && (
                      <button
                        type="button"
                        onClick={() => toggleRoleExpanded(role.id)}
                        className="min-h-[36px] inline-flex items-center gap-1 text-xs font-bold text-indigo-700 hover:text-indigo-900 cursor-pointer tabular-nums"
                      >
                        {isExpanded ? (
                          <>
                            <ChevronUp size={14} /> Show fewer permissions
                          </>
                        ) : (
                          <>
                            <ChevronDown size={14} /> +{hiddenCount} more permissions
                          </>
                        )}
                      </button>
                    )}
                    {(!actorScope || actorScope.hasChurchRoleAccess) && (
                      <button
                        type="button"
                        onClick={() => openCustomizer(role)}
                        aria-label={`Customize permissions for ${formatRoleName(role.name)}`}
                        className="ml-auto min-h-[44px] px-3.5 py-2 rounded-xl border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <SlidersHorizontal size={14} /> Customize Permissions
                      </button>
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        </section>
      )}

      {(activeSection === 'all' || activeSection === 'assignments') && (
        <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div>
              <h3 className="font-extrabold text-slate-900">Member Role Assignments</h3>
              <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
                {assignmentCounts.active} active · {assignmentCounts.inactive} inactive · {assignmentCounts.total} total
              </p>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 w-full lg:w-auto">
              <label className="relative block w-full sm:flex-1 lg:w-64">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  value={assignmentSearch}
                  onChange={event => setAssignmentSearch(event.target.value)}
                  placeholder="Search member, role, or scope…"
                  className="w-full min-h-[44px] pl-9 pr-3 py-2 rounded-xl border border-slate-200 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </label>
              <div className="grid grid-cols-3 sm:inline-flex items-center gap-1 p-1 bg-slate-100 rounded-xl w-full sm:w-auto shrink-0">
                {(['all', 'active', 'inactive'] as const).map(statusOption => (
                  <button
                    key={statusOption}
                    type="button"
                    onClick={() => setAssignmentStatusFilter(statusOption)}
                    className={`min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-bold transition-colors whitespace-nowrap cursor-pointer ${
                      assignmentStatusFilter === statusOption
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {statusOption === 'all' ? 'All' : statusOption === 'active' ? 'Active' : 'Inactive'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {assignments.length === 0 ? (
            <p className="p-6 text-sm text-slate-500">No role assignments found. Use the form above to assign a role to a member profile.</p>
          ) : filteredAssignments.length === 0 ? (
            <div className="p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <p className="text-sm text-slate-500">No member role assignments match the current filter.</p>
              <button
                type="button"
                onClick={() => {
                  setAssignmentSearch('');
                  setAssignmentStatusFilter('all');
                }}
                className="min-h-[44px] w-full sm:w-auto px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 whitespace-nowrap cursor-pointer"
              >
                Clear Filters
              </button>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {filteredAssignments.map(assignment => {
                const role = roles.find(item => item.id === assignment.role_id);
                const expired = Boolean(assignment.expires_at && new Date(assignment.expires_at).getTime() <= Date.now());
                const futureDated = new Date(assignment.assigned_at || 0).getTime() > Date.now();
                const active = assignment.is_active && !expired && !futureDated;
                const statusLabel = active ? 'Active' : expired ? 'Expired' : futureDated ? 'Scheduled' : 'Inactive';
                const scope = assignment.scope_type === 'branch'
                  ? branches.find(item => item.id === assignment.branch_id)?.name || 'Branch'
                  : assignment.scope_type === 'district'
                  ? districts.find(item => item.id === assignment.district_id)?.name || 'District'
                  : 'Church-wide';
                const isConfirmingDelete = confirmDeleteId === assignment.id;
                return (
                  <div key={assignment.id} className="p-4 sm:px-5 flex flex-col md:flex-row md:items-center justify-between gap-3 hover:bg-slate-50/60 transition-colors">
                    <div className="min-w-0">
                      <div className="font-bold text-slate-900 truncate">
                        {memberNames.get(assignment.profile_id) || assignment.profile_id}
                      </div>
                      <div className="text-xs text-slate-500 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 mt-0.5">
                        <span className="font-semibold text-slate-700">{role ? formatRoleName(role.name) : 'Unknown role'}</span>
                        <span aria-hidden="true">·</span>
                        <span className="truncate max-w-full">{scope}</span>
                        <span aria-hidden="true">·</span>
                        <span className={`font-semibold ${active ? 'text-emerald-700' : 'text-amber-700'}`}>
                          {statusLabel}
                        </span>
                      </div>
                    </div>
                    <div className="w-full md:w-auto shrink-0">
                      {isConfirmingDelete ? (
                        <div className="grid grid-cols-2 sm:flex items-center gap-2">
                          <button
                            type="button"
                            disabled={saving}
                            onClick={() => void handleDeleteAssignment(assignment)}
                            className="min-h-[44px] text-xs px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer disabled:opacity-50"
                          >
                            <Trash2 size={14} /> Confirm Remove
                          </button>
                          <button
                            type="button"
                            disabled={saving}
                            onClick={() => setConfirmDeleteId(null)}
                            className="min-h-[44px] text-xs px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold flex items-center justify-center whitespace-nowrap cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="flex flex-wrap sm:flex-nowrap items-center gap-2">
                          <button
                            type="button"
                            disabled={saving}
                            onClick={() => openEditAssignment(assignment)}
                            className="flex-1 sm:flex-initial min-h-[44px] text-xs px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer disabled:opacity-50"
                          >
                            <Edit3 size={14} /> Edit
                          </button>
                          {active ? (
                            <button
                              type="button"
                              disabled={saving}
                              onClick={() => void handleDeactivate(assignment)}
                              className="flex-1 sm:flex-initial min-h-[44px] text-xs px-3.5 py-2 rounded-xl border border-amber-200 bg-amber-50/50 text-amber-800 hover:bg-amber-100/70 font-bold flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer disabled:opacity-50"
                            >
                              <UserMinus size={14} /> Deactivate
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled={saving}
                              onClick={() => void handleReactivate(assignment)}
                              className="flex-1 sm:flex-initial min-h-[44px] text-xs px-3.5 py-2 rounded-xl border border-emerald-200 bg-emerald-50/60 text-emerald-700 hover:bg-emerald-100/70 font-bold flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer disabled:opacity-50"
                            >
                              <UserCheck size={14} /> Reactivate
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={saving}
                            onClick={() => setConfirmDeleteId(assignment.id)}
                            aria-label={`Remove role assignment for ${memberNames.get(assignment.profile_id) || assignment.profile_id}`}
                            className="flex-1 sm:flex-initial min-h-[44px] text-xs px-3.5 py-2 rounded-xl border border-rose-200 text-rose-700 hover:bg-rose-50 font-bold flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer disabled:opacity-50"
                          >
                            <Trash2 size={14} /> Remove
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {editingAssignment && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 backdrop-blur-[1px] p-0 sm:p-4"
          onClick={() => { if (!saving) setEditingAssignment(null); }}
        >
          <form
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-assignment-title"
            onSubmit={handleSaveAssignmentEdit}
            onClick={event => event.stopPropagation()}
            className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl border border-slate-200 shadow-2xl overflow-hidden"
          >
            <div className="p-4 sm:p-6 border-b border-slate-200 flex items-start justify-between gap-3">
              <div>
                <h3 id="edit-assignment-title" className="text-lg font-black text-slate-900">
                  Edit Role Assignment
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Member: <strong className="text-slate-700">{memberNames.get(editingAssignment.profile_id) || editingAssignment.profile_id}</strong>
                </p>
              </div>
              <button
                type="button"
                disabled={saving}
                onClick={() => setEditingAssignment(null)}
                aria-label="Close edit assignment modal"
                className="min-h-[44px] min-w-[44px] rounded-xl border border-slate-200 text-slate-500 hover:text-slate-900 hover:bg-slate-50 flex items-center justify-center shrink-0 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-4 sm:p-6 space-y-4">
              {editModalError && (
                <div role="alert" className="p-3 rounded-xl bg-rose-50 text-rose-700 border border-rose-200 text-xs font-semibold">
                  {editModalError}
                </div>
              )}

              <label className="block text-sm font-bold text-slate-700">
                System role
                <select
                  required
                  value={editRoleId}
                  onChange={event => setEditRoleId(event.target.value)}
                  className="mt-1 w-full min-h-[44px] p-2.5 border border-slate-200 rounded-xl bg-white"
                >
                  {roles
                    .filter(role => canManageTargetRoleByScope(actorScope ? actorScope.hasChurchRoleAccess : true, role.name))
                    .map(role => (
                      <option key={role.id} value={role.id}>{formatRoleName(role.name)}</option>
                    ))}
                </select>
              </label>

              <label className="block text-sm font-bold text-slate-700">
                Assignment scope
                <select
                  value={editScopeType}
                  onChange={event => setEditScopeType(event.target.value as typeof editScopeType)}
                  className="mt-1 w-full min-h-[44px] p-2.5 border border-slate-200 rounded-xl bg-white"
                >
                  {(!actorScope || actorScope.hasChurchRoleAccess) && <option value="church">Church-wide</option>}
                  <option value="district">District</option>
                  <option value="branch">Branch</option>
                </select>
              </label>

              {editScopeType === 'branch' && (
                <label className="block text-sm font-bold text-slate-700">
                  Branch
                  <select
                    required
                    value={editBranchId}
                    onChange={event => setEditBranchId(event.target.value)}
                    className="mt-1 w-full min-h-[44px] p-2.5 border border-slate-200 rounded-xl bg-white"
                  >
                    <option value="">Select branch</option>
                    {(actorScope && !actorScope.hasChurchRoleAccess
                      ? branches.filter(branch => actorScope.assignableBranchIds.includes(branch.id))
                      : branches
                    ).map(branch => (
                      <option key={branch.id} value={branch.id}>{branch.name}</option>
                    ))}
                  </select>
                </label>
              )}

              {editScopeType === 'district' && (
                <label className="block text-sm font-bold text-slate-700">
                  District
                  <select
                    required
                    value={editDistrictId}
                    onChange={event => setEditDistrictId(event.target.value)}
                    className="mt-1 w-full min-h-[44px] p-2.5 border border-slate-200 rounded-xl bg-white"
                  >
                    <option value="">Select district</option>
                    {(actorScope && !actorScope.hasChurchRoleAccess
                      ? districts.filter(district =>
                          assignments.some(
                            a =>
                              a.profile_id === profile?.id &&
                              a.is_active &&
                              a.scope_type === 'district' &&
                              a.district_id === district.id
                          )
                        )
                      : districts
                    ).map(district => (
                      <option key={district.id} value={district.id}>{district.name}</option>
                    ))}
                  </select>
                </label>
              )}
            </div>

            <div className="p-4 sm:p-5 border-t border-slate-200 bg-slate-50 grid grid-cols-2 sm:flex items-center justify-end gap-2.5">
              <button
                type="button"
                disabled={saving}
                onClick={() => setEditingAssignment(null)}
                className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-sm font-bold text-slate-700 whitespace-nowrap cursor-pointer flex items-center justify-center"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving || !editRoleId}
                className="min-h-[44px] px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-extrabold disabled:opacity-50 flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer"
              >
                <Check size={16} />
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      )}

      {editingRole && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 backdrop-blur-[1px] p-0 sm:p-4"
          onClick={() => { if (!savingPermissions) setEditingRole(null); }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="customize-role-title"
            onClick={event => event.stopPropagation()}
            className="bg-white w-full sm:max-w-3xl max-h-[92dvh] sm:max-h-[86dvh] rounded-t-3xl sm:rounded-3xl border border-slate-200 shadow-2xl flex flex-col overflow-hidden"
          >
            <div className="p-4 sm:p-6 border-b border-slate-200 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-baseline gap-2">
                  <h3 id="customize-role-title" className="text-lg sm:text-xl font-black text-slate-900">
                    Customize {formatRoleName(editingRole.name)} Permissions
                  </h3>
                  <span className="text-xs font-bold text-indigo-700 tabular-nums">
                    {selectedPermissionIds.size} / {permissions.length} enabled
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  {editingRole.description || 'System role'} · Changes apply immediately to members assigned this role.
                </p>
              </div>
              <button
                type="button"
                disabled={savingPermissions}
                onClick={() => setEditingRole(null)}
                aria-label="Close permission customizer"
                className="min-h-[44px] min-w-[44px] rounded-xl border border-slate-200 text-slate-500 hover:text-slate-900 hover:bg-slate-50 flex items-center justify-center shrink-0 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="px-4 sm:px-6 py-3 bg-slate-50 border-b border-slate-200 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
                <label className="relative flex-1 block">
                  <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="search"
                    value={permissionSearch}
                    onChange={event => setPermissionSearch(event.target.value)}
                    placeholder="Search permissions by label, module, or key…"
                    className="w-full min-h-[44px] pl-10 pr-3 py-2 rounded-xl border border-slate-200 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </label>
                <div className="grid grid-cols-2 sm:flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => selectAllVisibleOrClear(true)}
                    className="min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-xs font-bold text-slate-700 whitespace-nowrap cursor-pointer flex items-center justify-center"
                  >
                    Select All
                  </button>
                  <button
                    type="button"
                    onClick={() => selectAllVisibleOrClear(false)}
                    className="min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-xs font-bold text-slate-700 whitespace-nowrap cursor-pointer flex items-center justify-center"
                  >
                    {editingRole.name === 'super_admin' ? 'Clear Optional' : 'Clear All'}
                  </button>
                </div>
              </div>

              {editingRole.name === 'super_admin' && (
                <div className="flex items-center gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                  <Lock size={14} className="shrink-0" />
                  <span>Super Admin retains <strong>Manage roles</strong> at all times so system governance remains accessible.</span>
                </div>
              )}

              {modalError && (
                <div role="alert" className="p-3 rounded-xl bg-rose-50 text-rose-700 border border-rose-200 text-xs font-semibold">
                  {modalError}
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
              {filteredPermissionsByModule.length === 0 ? (
                <div className="text-center py-10 text-sm text-slate-500">
                  No permissions match "{permissionSearch}".
                </div>
              ) : (
                filteredPermissionsByModule.map(([moduleKey, modulePermissions]) => {
                  const moduleSelectedCount = modulePermissions.filter(p => selectedPermissionIds.has(p.id)).length;
                  const allSelectedInModule = moduleSelectedCount === modulePermissions.length;
                  return (
                    <div key={moduleKey} className="border border-slate-200 rounded-2xl overflow-hidden bg-white">
                      <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-extrabold text-sm text-slate-900 truncate">{formatModuleName(moduleKey)}</span>
                          <span className="text-xs font-bold text-slate-500 tabular-nums shrink-0">
                            {moduleSelectedCount} / {modulePermissions.length}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => toggleModulePermissions(modulePermissions, !allSelectedInModule)}
                          className="min-h-[36px] px-3 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-xs font-bold text-indigo-700 whitespace-nowrap cursor-pointer shrink-0"
                        >
                          {allSelectedInModule ? 'Clear module' : 'Select all'}
                        </button>
                      </div>

                      <div className="divide-y divide-slate-100">
                        {modulePermissions.map(permission => {
                          const checked = selectedPermissionIds.has(permission.id);
                          const locked = isLockedPermission(editingRole, permission.id);
                          const label = PERMISSION_LABELS[permission.key] || permission.key;
                          return (
                            <label
                              key={permission.id}
                              className={`min-h-[44px] px-4 py-3 flex items-start gap-3 transition-colors ${
                                locked ? 'bg-slate-50/70 cursor-not-allowed' : 'hover:bg-slate-50 cursor-pointer'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                disabled={locked || savingPermissions}
                                onChange={() => togglePermission(permission.id)}
                                className="mt-0.5 w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 shrink-0"
                              />
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="text-sm font-bold text-slate-900">{label}</span>
                                  <code className="text-[11px] font-mono text-slate-400 break-all">{permission.key}</code>
                                  {locked && (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
                                      <Lock size={10} /> Required
                                    </span>
                                  )}
                                </div>
                                {permission.description && (
                                  <p className="text-xs text-slate-500 mt-0.5">{permission.description}</p>
                                )}
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="p-4 sm:p-5 border-t border-slate-200 bg-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="text-xs font-semibold text-slate-600 tabular-nums">
                {diffCounts.changed ? (
                  <span>
                    Pending changes: <strong className="text-emerald-700">+{diffCounts.added} added</strong> ·{' '}
                    <strong className="text-rose-700">-{diffCounts.removed} removed</strong>
                  </span>
                ) : (
                  <span>No pending changes</span>
                )}
              </div>
              <div className="grid grid-cols-2 sm:flex items-center gap-2.5 w-full sm:w-auto">
                <button
                  type="button"
                  disabled={savingPermissions}
                  onClick={() => setEditingRole(null)}
                  className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-sm font-bold text-slate-700 whitespace-nowrap cursor-pointer flex items-center justify-center"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={savingPermissions || !diffCounts.changed}
                  onClick={() => void handleSavePermissions()}
                  className="min-h-[44px] px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-extrabold disabled:opacity-50 flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer"
                >
                  <Check size={16} />
                  {savingPermissions ? 'Saving…' : 'Save Permissions'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
