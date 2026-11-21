import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from './supabaseClient';
import { getMembers } from './memberService';
import { PERMISSION_LABELS } from './permissionResolutionService';
import {
  getProfileRoleData,
  assignProfileRole,
  deactivateProfileRoleAssignment,
  updateRolePermissions,
  type SystemRole,
  type ProfileRoleAssignment
} from './profileRoleAssignmentService';
import type { Profile, ChurchBranch, District } from './types';
import {
  ShieldCheck,
  UserPlus,
  UserMinus,
  RefreshCw,
  SlidersHorizontal,
  Search,
  Lock,
  X,
  Check
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

export const RolesAndPermissionsTab: React.FC = () => {
  const [roles, setRoles] = useState<SystemRole[]>([]);
  const [assignments, setAssignments] = useState<ProfileRoleAssignment[]>([]);
  const [permissions, setPermissions] = useState<PermissionRow[]>([]);
  const [rolePermissions, setRolePermissions] = useState<RolePermissionRow[]>([]);
  const [members, setMembers] = useState<Profile[]>([]);
  const [branches, setBranches] = useState<ChurchBranch[]>([]);
  const [districts, setDistricts] = useState<District[]>([]);
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

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const [roleData, memberData, permissionResult, linkResult, branchResult, districtResult] = await Promise.all([
        getProfileRoleData(),
        getMembers(),
        supabase.from('permissions').select('*').order('module', { ascending: true }),
        supabase.from('role_permissions').select('*'),
        supabase.from('church_branches').select('*').order('name', { ascending: true }),
        supabase.from('districts').select('*').order('name', { ascending: true })
      ]);
      if (permissionResult.error) throw new Error(permissionResult.error.message);
      if (linkResult.error) throw new Error(linkResult.error.message);
      if (branchResult.error) throw new Error(branchResult.error.message);
      if (districtResult.error) throw new Error(districtResult.error.message);
      setRoles(roleData.roles);
      setAssignments(roleData.assignments);
      setMembers(memberData);
      setPermissions((permissionResult.data || []) as PermissionRow[]);
      setRolePermissions((linkResult.data || []) as RolePermissionRow[]);
      setBranches((branchResult.data || []) as ChurchBranch[]);
      setDistricts((districtResult.data || []) as District[]);
      setRoleId(current => current || roleData.roles[0]?.id || '');
      setProfileId(current => current || memberData[0]?.id || '');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load role and permission data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void refresh(); }, []);

  useEffect(() => {
    if (!editingRole) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !savingPermissions) {
        setEditingRole(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [editingRole, savingPermissions]);

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

  const memberNames = new Map(members.map(member => [
    member.id,
    `${member.first_name} ${member.last_name}`.trim()
  ]));

  if (loading) return <div className="p-8 text-center text-slate-500">Loading database roles and permissions…</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-black text-slate-900 flex items-center gap-2"><ShieldCheck /> Roles & Permissions</h2>
          <p className="text-sm text-slate-500 mt-1">Customize system role permissions and manage scoped member role assignments.</p>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 font-bold text-sm flex items-center gap-2 whitespace-nowrap cursor-pointer"
        >
          <RefreshCw size={15} /> Refresh
        </button>
      </div>

      {error && <div role="alert" className="p-3 rounded-xl bg-rose-50 text-rose-700 border border-rose-200 text-sm">{error}</div>}
      {notice && <div role="status" className="p-3 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 text-sm">{notice}</div>}

      <form onSubmit={handleAssign} className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="md:col-span-2">
          <h3 className="font-extrabold text-slate-900 flex items-center gap-2"><UserPlus size={17} /> Assign a system role</h3>
          <p className="text-xs text-slate-500 mt-1">Assignments are linked to member profiles, including directory-only members. Login access is not required.</p>
        </div>
        <label className="text-sm font-bold text-slate-700">Member
          <select required value={profileId} onChange={event => setProfileId(event.target.value)} className="mt-1 w-full min-h-[44px] p-2.5 border border-slate-200 rounded-xl bg-white">
            <option value="">Select member</option>
            {members.map(member => <option key={member.id} value={member.id}>{member.first_name} {member.last_name}</option>)}
          </select>
        </label>
        <label className="text-sm font-bold text-slate-700">System role
          <select required value={roleId} onChange={event => setRoleId(event.target.value)} className="mt-1 w-full min-h-[44px] p-2.5 border border-slate-200 rounded-xl bg-white">
            <option value="">Select role</option>
            {roles.map(role => <option key={role.id} value={role.id}>{formatRoleName(role.name)}</option>)}
          </select>
        </label>
        <label className="text-sm font-bold text-slate-700">Assignment scope
          <select value={scopeType} onChange={event => setScopeType(event.target.value as typeof scopeType)} className="mt-1 w-full min-h-[44px] p-2.5 border border-slate-200 rounded-xl bg-white">
            <option value="church">Church-wide</option>
            <option value="district">District</option>
            <option value="branch">Branch</option>
          </select>
        </label>
        {scopeType === 'branch' && <label className="text-sm font-bold text-slate-700">Branch
          <select required value={branchId} onChange={event => setBranchId(event.target.value)} className="mt-1 w-full min-h-[44px] p-2.5 border border-slate-200 rounded-xl bg-white">
            <option value="">Select branch</option>
            {branches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
          </select>
        </label>}
        {scopeType === 'district' && <label className="text-sm font-bold text-slate-700">District
          <select required value={districtId} onChange={event => setDistrictId(event.target.value)} className="mt-1 w-full min-h-[44px] p-2.5 border border-slate-200 rounded-xl bg-white">
            <option value="">Select district</option>
            {districts.map(district => <option key={district.id} value={district.id}>{district.name}</option>)}
          </select>
        </label>}
        <div className="md:col-span-2 flex justify-end">
          <button disabled={saving || !profileId || !roleId} className="min-h-[44px] px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold disabled:opacity-50 whitespace-nowrap cursor-pointer">
            {saving ? 'Saving…' : 'Assign Role'}
          </button>
        </div>
      </form>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-extrabold text-slate-900">Role Permission Profiles</h3>
            <p className="text-xs text-slate-500">Select Customize Permissions on any role to add or remove capabilities across modules.</p>
          </div>
          <span className="text-xs font-bold text-slate-500 tabular-nums">
            {roles.length} roles · {permissions.length} total permissions
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {roles.map(role => {
            const rolePerms = rolePermissionsListMap.get(role.id) || [];
            return (
              <section key={role.id} className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 flex flex-col justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-extrabold text-slate-900 text-base">{formatRoleName(role.name)}</h4>
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 tabular-nums">
                          {rolePerms.length} / {permissions.length}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">{role.description || 'System role'}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => openCustomizer(role)}
                      aria-label={`Customize permissions for ${formatRoleName(role.name)}`}
                      className="min-h-[44px] px-3.5 py-2 rounded-xl border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <SlidersHorizontal size={14} /> Customize Permissions
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-1.5 mt-4">
                    {rolePerms.map(permission => (
                      <span
                        key={permission.id}
                        title={`${permission.key} (${formatModuleName(permission.module)})`}
                        className="text-[11px] font-semibold px-2 py-1 rounded-md bg-slate-50 text-slate-700 border border-slate-200"
                      >
                        {PERMISSION_LABELS[permission.key] || permission.key}
                      </span>
                    ))}
                    {rolePerms.length === 0 && (
                      <span className="text-xs text-slate-400">No permissions assigned</span>
                    )}
                  </div>
                </div>
              </section>
            );
          })}
        </div>
      </section>

      <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="p-4 border-b border-slate-100 font-extrabold text-slate-900">Member role assignments</div>
        {assignments.length === 0 ? <p className="p-5 text-sm text-slate-500">No role assignments found.</p> : (
          <div className="divide-y divide-slate-100">
            {assignments.map(assignment => {
              const role = roles.find(item => item.id === assignment.role_id);
              const active = assignment.is_active && (!assignment.expires_at || new Date(assignment.expires_at).getTime() > Date.now());
              const scope = assignment.scope_type === 'branch'
                ? branches.find(item => item.id === assignment.branch_id)?.name || 'Branch'
                : assignment.scope_type === 'district'
                ? districts.find(item => item.id === assignment.district_id)?.name || 'District'
                : 'Church-wide';
              return (
                <div key={assignment.id} className="p-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="font-bold text-slate-900">{memberNames.get(assignment.profile_id) || assignment.profile_id} · {role ? formatRoleName(role.name) : 'Unknown role'}</div>
                    <div className="text-xs text-slate-500">{scope} · {active ? 'Active' : 'Inactive / expired'}</div>
                  </div>
                  {active && (
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => void handleDeactivate(assignment)}
                      className="min-h-[44px] text-xs px-3.5 py-2 rounded-xl border border-rose-200 text-rose-700 hover:bg-rose-50 font-bold flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                    >
                      <UserMinus size={14} /> Deactivate
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

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
            className="bg-white w-full sm:max-w-3xl max-h-[92vh] sm:max-h-[86vh] rounded-t-3xl sm:rounded-3xl border border-slate-200 shadow-2xl flex flex-col overflow-hidden"
          >
            <div className="p-4 sm:p-6 border-b border-slate-200 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 id="customize-role-title" className="text-lg sm:text-xl font-black text-slate-900">
                    Customize {formatRoleName(editingRole.name)} Permissions
                  </h3>
                  <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200 tabular-nums">
                    {selectedPermissionIds.size} of {permissions.length} enabled
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
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => selectAllVisibleOrClear(true)}
                    className="min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-xs font-bold text-slate-700 whitespace-nowrap cursor-pointer"
                  >
                    Select All
                  </button>
                  <button
                    type="button"
                    onClick={() => selectAllVisibleOrClear(false)}
                    className="min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-xs font-bold text-slate-700 whitespace-nowrap cursor-pointer"
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
                        <div className="flex items-center gap-2">
                          <span className="font-extrabold text-sm text-slate-900">{formatModuleName(moduleKey)}</span>
                          <span className="text-xs font-bold text-slate-500 tabular-nums">
                            {moduleSelectedCount} / {modulePermissions.length}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => toggleModulePermissions(modulePermissions, !allSelectedInModule)}
                          className="min-h-[36px] px-3 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-xs font-bold text-indigo-700 whitespace-nowrap cursor-pointer"
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
                                  <code className="text-[11px] font-mono text-slate-400">{permission.key}</code>
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

            <div className="p-4 sm:p-5 border-t border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-3">
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
              <div className="flex items-center gap-2.5 ml-auto">
                <button
                  type="button"
                  disabled={savingPermissions}
                  onClick={() => setEditingRole(null)}
                  className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-sm font-bold text-slate-700 whitespace-nowrap cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={savingPermissions || !diffCounts.changed}
                  onClick={() => void handleSavePermissions()}
                  className="min-h-[44px] px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-extrabold disabled:opacity-50 flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
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
