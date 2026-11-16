import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from './supabaseClient';
import { getMembers } from './memberService';
import {
  getProfileRoleData,
  assignProfileRole,
  deactivateProfileRoleAssignment,
  type SystemRole,
  type ProfileRoleAssignment
} from './profileRoleAssignmentService';
import type { Profile, ChurchBranch, District } from './types';
import { ShieldCheck, UserPlus, UserMinus, RefreshCw } from 'lucide-react';

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

  const rolePermissionMap = useMemo(() => {
    const result = new Map<string, string[]>();
    rolePermissions.forEach(link => {
      const key = permissions.find(permission => permission.id === link.permission_id)?.key;
      if (!key) return;
      result.set(link.role_id, [...(result.get(link.role_id) || []), key]);
    });
    return result;
  }, [permissions, rolePermissions]);

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
      setError(cause instanceof Error ? cause.message : 'Unable to assign role.');
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
          <p className="text-sm text-slate-500 mt-1">System roles and effective permissions are maintained in the database.</p>
        </div>
        <button type="button" onClick={() => void refresh()} className="px-3 py-2 rounded-xl border border-slate-200 font-bold text-sm flex items-center gap-2"><RefreshCw size={15} /> Refresh</button>
      </div>

      {error && <div role="alert" className="p-3 rounded-xl bg-rose-50 text-rose-700 border border-rose-200 text-sm">{error}</div>}
      {notice && <div role="status" className="p-3 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 text-sm">{notice}</div>}

      <form onSubmit={handleAssign} className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="md:col-span-2">
          <h3 className="font-extrabold text-slate-900 flex items-center gap-2"><UserPlus size={17} /> Assign a system role</h3>
          <p className="text-xs text-slate-500 mt-1">Assignments are linked to member profiles, including directory-only members. Login access is not required.</p>
        </div>
        <label className="text-sm font-bold text-slate-700">Member
          <select required value={profileId} onChange={event => setProfileId(event.target.value)} className="mt-1 w-full p-2.5 border border-slate-200 rounded-xl bg-white">
            <option value="">Select member</option>
            {members.map(member => <option key={member.id} value={member.id}>{member.first_name} {member.last_name}</option>)}
          </select>
        </label>
        <label className="text-sm font-bold text-slate-700">System role
          <select required value={roleId} onChange={event => setRoleId(event.target.value)} className="mt-1 w-full p-2.5 border border-slate-200 rounded-xl bg-white">
            <option value="">Select role</option>
            {roles.map(role => <option key={role.id} value={role.id}>{role.name}</option>)}
          </select>
        </label>
        <label className="text-sm font-bold text-slate-700">Assignment scope
          <select value={scopeType} onChange={event => setScopeType(event.target.value as typeof scopeType)} className="mt-1 w-full p-2.5 border border-slate-200 rounded-xl bg-white">
            <option value="church">Church-wide</option>
            <option value="district">District</option>
            <option value="branch">Branch</option>
          </select>
        </label>
        {scopeType === 'branch' && <label className="text-sm font-bold text-slate-700">Branch
          <select required value={branchId} onChange={event => setBranchId(event.target.value)} className="mt-1 w-full p-2.5 border border-slate-200 rounded-xl bg-white">
            <option value="">Select branch</option>
            {branches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
          </select>
        </label>}
        {scopeType === 'district' && <label className="text-sm font-bold text-slate-700">District
          <select required value={districtId} onChange={event => setDistrictId(event.target.value)} className="mt-1 w-full p-2.5 border border-slate-200 rounded-xl bg-white">
            <option value="">Select district</option>
            {districts.map(district => <option key={district.id} value={district.id}>{district.name}</option>)}
          </select>
        </label>}
        <div className="md:col-span-2 flex justify-end">
          <button disabled={saving || !profileId || !roleId} className="px-5 py-2.5 rounded-xl bg-indigo-600 text-white font-extrabold disabled:opacity-50"> {saving ? 'Saving…' : 'Assign Role'} </button>
        </div>
      </form>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {roles.map(role => (
          <section key={role.id} className="bg-white border border-slate-200 rounded-2xl p-4">
            <div className="font-extrabold text-slate-900">{role.name}</div>
            <p className="text-xs text-slate-500 mt-1">{role.description || 'System role'}</p>
            <div className="flex flex-wrap gap-1.5 mt-3">
              {(rolePermissionMap.get(role.id) || []).map(key => <span key={key} className="text-[10px] px-2 py-1 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-100">{key}</span>)}
              {(rolePermissionMap.get(role.id) || []).length === 0 && <span className="text-xs text-slate-400">No permissions assigned</span>}
            </div>
          </section>
        ))}
      </div>

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
                    <div className="font-bold text-slate-900">{memberNames.get(assignment.profile_id) || assignment.profile_id} · {role?.name || 'Unknown role'}</div>
                    <div className="text-xs text-slate-500">{scope} · {active ? 'Active' : 'Inactive / expired'}</div>
                  </div>
                  {active && <button type="button" disabled={saving} onClick={() => void handleDeactivate(assignment)} className="text-xs px-3 py-2 rounded-lg border border-rose-200 text-rose-700 font-bold flex items-center gap-1"><UserMinus size={14} /> Deactivate</button>}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};
