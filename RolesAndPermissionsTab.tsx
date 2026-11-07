import React, { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import { CustomRole, MemberRoleAssignment, PermissionKey, Profile, Ministry } from './types';
import { 
  getCustomRoles, saveCustomRoles, getRoleAssignments, saveRoleAssignments, ALL_PERMISSIONS 
} from './roleService';
import { 
  Shield, ShieldCheck, UserCheck, Plus, Trash2, Edit, Check, X, Search, 
  Users, Layers, Award, Sparkles, CheckCircle2, FileText, Calendar, Building2, Filter
} from 'lucide-react';

export const DEFAULT_MINISTRY_SCOPES = [
  'All Ministries / Global Scope',
  'Sanctuary Choir & Music Ministry',
  'Youth & Young Adult Fellowship',
  'Ushering & Sanctuary Protocol',
  'Media & Digital Production Team',
  'Finance & Treasury Department',
  "Women's Fellowship & Caring Hands",
  "Men's Ministry & Brotherhood",
  "Children's Church & Sunday School",
  'Intercessory Prayer & Deliverance'
];

export const RolesAndPermissionsTab: React.FC = () => {
  const [roles, setRoles] = useState<CustomRole[]>(getCustomRoles());
  const [assignments, setAssignments] = useState<MemberRoleAssignment[]>(getRoleAssignments());
  const [members, setMembers] = useState<Profile[]>([]);
  const [ministries, setMinistries] = useState<Ministry[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeSubTab, setActiveSubTab] = useState<'roles' | 'assignments'>('roles');
  const [selectedMinistryFilter, setSelectedMinistryFilter] = useState<string>('All');

  // Modal State - Create/Edit Role
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [roleName, setRoleName] = useState('');
  const [roleCategory, setRoleCategory] = useState<CustomRole['category']>('Operations');
  const [roleMinistryName, setRoleMinistryName] = useState(DEFAULT_MINISTRY_SCOPES[0]);
  const [customMinistryInput, setCustomMinistryInput] = useState('');
  const [roleDesc, setRoleDesc] = useState('');
  const [roleRespText, setRoleRespText] = useState('');
  const [selectedPermissions, setSelectedPermissions] = useState<PermissionKey[]>([]);

  // Modal State - Assign Member
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedProfileId, setSelectedProfileId] = useState('');
  const [selectedRoleId, setSelectedRoleId] = useState('');
  const [assignMinistryName, setAssignMinistryName] = useState(DEFAULT_MINISTRY_SCOPES[1]);
  const [assignmentSuccess, setAssignmentSuccess] = useState<string | null>(null);
  const [memberFilter, setMemberFilter] = useState('');

  const fetchMembersAndMinistries = async () => {
    setLoading(true);
    const { data: pData } = await supabase.from('profiles').select('*').order('first_name', { ascending: true });
    if (pData && pData.length > 0) {
      setMembers(pData as Profile[]);
    } else {
      setMembers([
        { id: 'p1', branch_id: 'b1', first_name: 'Pastor Samuel', last_name: 'Koroma', email: 'samuel@gracecathedral.org', phone: '+232 76 111 222', primary_role: 'pastor', created_at: new Date().toISOString() },
        { id: 'p2', branch_id: 'b1', first_name: 'Emmanuel', last_name: 'Sesay', email: 'emmanuel@gracecathedral.org', phone: '+232 77 333 444', primary_role: 'finance_officer', created_at: new Date().toISOString() },
        { id: 'p3', branch_id: 'b1', first_name: 'David', last_name: 'Koroma', email: 'david@gracecathedral.org', phone: '+232 78 555 666', primary_role: 'leader', created_at: new Date().toISOString() },
        { id: 'p4', branch_id: 'b1', first_name: 'Hannah', last_name: 'Adams', email: 'hannah@gracecathedral.org', phone: '+232 79 777 888', primary_role: 'leader', created_at: new Date().toISOString() }
      ]);
    }

    const { data: mData } = await supabase.from('ministries').select('*');
    if (mData && mData.length > 0) {
      setMinistries(mData as Ministry[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchMembersAndMinistries();
  }, []);

  const availableMinistryOptions = Array.from(new Set([
    ...DEFAULT_MINISTRY_SCOPES,
    ...ministries.map(m => m.name)
  ]));

  const handleOpenAddRole = () => {
    setEditingRoleId(null);
    setRoleName('');
    setRoleCategory('Operations');
    setRoleMinistryName(DEFAULT_MINISTRY_SCOPES[0]);
    setCustomMinistryInput('');
    setRoleDesc('');
    setRoleRespText('');
    setSelectedPermissions(['manage_events', 'event_check_in']);
    setShowRoleModal(true);
  };

  const handleOpenEditRole = (r: CustomRole) => {
    setEditingRoleId(r.id);
    setRoleName(r.name);
    setRoleCategory(r.category);
    setRoleMinistryName(r.ministry_name || DEFAULT_MINISTRY_SCOPES[0]);
    setRoleDesc(r.description);
    setRoleRespText(r.responsibilities.join('\n'));
    setSelectedPermissions(r.permissions || []);
    setShowRoleModal(true);
  };

  const handleTogglePermission = (permKey: PermissionKey) => {
    if (selectedPermissions.includes(permKey)) {
      setSelectedPermissions(selectedPermissions.filter(p => p !== permKey));
    } else {
      setSelectedPermissions([...selectedPermissions, permKey]);
    }
  };

  const handleSaveRole = (e: React.FormEvent) => {
    e.preventDefault();
    if (!roleName.trim()) return;

    const targetMinistry = roleMinistryName === 'custom' ? customMinistryInput.trim() || 'Custom Department' : roleMinistryName;

    const respList = roleRespText
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);

    let updatedRoles = [...roles];

    if (editingRoleId) {
      updatedRoles = updatedRoles.map(r => r.id === editingRoleId ? {
        ...r,
        name: roleName.trim(),
        category: roleCategory,
        ministry_name: targetMinistry,
        description: roleDesc.trim(),
        responsibilities: respList,
        permissions: selectedPermissions
      } : r);
    } else {
      const newRole: CustomRole = {
        id: `role-${Date.now()}`,
        name: roleName.trim(),
        category: roleCategory,
        ministry_name: targetMinistry,
        description: roleDesc.trim() || 'Custom ministry-specific leadership role.',
        responsibilities: respList.length > 0 ? respList : ['Execute assigned department duties', 'Support church leadership'],
        permissions: selectedPermissions,
        created_at: new Date().toISOString()
      };
      updatedRoles.push(newRole);
    }

    setRoles(updatedRoles);
    saveCustomRoles(updatedRoles);
    setShowRoleModal(false);
  };

  const handleDeleteRole = (roleId: string) => {
    if (!confirm("Are you sure you want to remove this custom role definition?")) return;
    const updated = roles.filter(r => r.id !== roleId);
    setRoles(updated);
    saveCustomRoles(updated);
  };

  const handleAssignMemberRole = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProfileId || !selectedRoleId) return;

    const member = members.find(m => m.id === selectedProfileId);
    const roleObj = roles.find(r => r.id === selectedRoleId);
    if (!member || !roleObj) return;

    const memberName = `${member.first_name} ${member.last_name}`;
    const targetMinistry = assignMinistryName || roleObj.ministry_name || 'All Ministries';

    const newAssignment: MemberRoleAssignment = {
      id: `asgn-${Date.now()}`,
      profile_id: selectedProfileId,
      member_name: memberName,
      role_id: roleObj.id,
      role_name: roleObj.name,
      ministry_name: targetMinistry,
      assigned_at: new Date().toISOString(),
      assigned_by: 'Administrator'
    };

    const existingFiltered = assignments.filter(a => a.profile_id !== selectedProfileId || a.role_id !== selectedRoleId);
    const updated = [newAssignment, ...existingFiltered];

    setAssignments(updated);
    saveRoleAssignments(updated);

    // Update primary_role in Supabase profiles
    supabase.from('profiles').update({ primary_role: 'leader' }).eq('id', selectedProfileId);

    setAssignmentSuccess(`🎉 ${memberName} appointed as "${roleObj.name}" in ${targetMinistry}!`);
    setShowAssignModal(false);
    setSelectedProfileId('');
    setSelectedRoleId('');
    setTimeout(() => setAssignmentSuccess(null), 5000);
  };

  const handleRemoveAssignment = (assignmentId: string) => {
    if (!confirm("Remove this member's custom role assignment?")) return;
    const updated = assignments.filter(a => a.id !== assignmentId);
    setAssignments(updated);
    saveRoleAssignments(updated);
  };

  // Filter roles by ministry
  const filteredRoles = roles.filter(r => {
    if (selectedMinistryFilter === 'All') return true;
    return (r.ministry_name || 'All Ministries').toLowerCase().includes(selectedMinistryFilter.toLowerCase());
  });

  const filteredAssignments = assignments.filter(a => 
    a.member_name.toLowerCase().includes(memberFilter.toLowerCase()) || 
    a.role_name.toLowerCase().includes(memberFilter.toLowerCase()) ||
    (a.ministry_name && a.ministry_name.toLowerCase().includes(memberFilter.toLowerCase()))
  );

  return (
    <div className="space-y-4 sm:space-y-6">
      {assignmentSuccess && (
        <div className="p-3.5 sm:p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center justify-between text-emerald-900 font-bold text-xs animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
            <span>{assignmentSuccess}</span>
          </div>
          <button onClick={() => setAssignmentSuccess(null)} className="p-1 hover:bg-emerald-100 rounded text-emerald-700 cursor-pointer">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Header Banner */}
      <div className="bg-white p-4 sm:p-6 rounded-2xl sm:rounded-3xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-indigo-100 text-indigo-900 flex items-center gap-1">
                <ShieldCheck size={12} className="text-indigo-700" />
                Ministry-Specific RBAC Governance
              </span>
              <span className="text-xs text-slate-400 font-semibold">• Grace Cathedral Departments</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">Ministry Roles, Responsibilities & Permissions</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Define department-scoped leadership titles (Choir Lead, Usher Captain, Youth Coordinator), assign duties, and configure permissions.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap w-full lg:w-auto">
            <button
              onClick={() => setShowAssignModal(true)}
              className="flex-1 sm:flex-initial px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold rounded-xl text-xs shadow-md shadow-emerald-100 flex items-center justify-center gap-2 cursor-pointer transition-all whitespace-nowrap"
            >
              <UserCheck size={16} />
              <span>Appoint Department Role</span>
            </button>

            <button
              onClick={handleOpenAddRole}
              className="flex-1 sm:flex-initial px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold rounded-xl text-xs shadow-md shadow-indigo-100 flex items-center justify-center gap-2 cursor-pointer transition-all whitespace-nowrap"
            >
              <Plus size={16} />
              <span>Create Ministry Role</span>
            </button>
          </div>
        </div>

        {/* Sub Navigation Bar - Side-By-Side across all screens */}
        <div className="flex flex-row items-center gap-2 pt-1 w-full sm:w-auto overflow-x-auto pb-0.5">
          <button
            onClick={() => setActiveSubTab('roles')}
            className={`flex-1 sm:flex-initial px-3 sm:px-4 py-2.5 sm:py-2 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center justify-center sm:justify-start gap-1.5 sm:gap-2 shrink-0 ${
              activeSubTab === 'roles' ? 'bg-slate-900 text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:text-slate-900'
            }`}
          >
            <Shield size={14} className="shrink-0" />
            <span className="truncate">Defined Roles & Permissions</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-800 text-slate-200 shrink-0">{roles.length}</span>
          </button>

          <button
            onClick={() => setActiveSubTab('assignments')}
            className={`flex-1 sm:flex-initial px-3 sm:px-4 py-2.5 sm:py-2 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center justify-center sm:justify-start gap-1.5 sm:gap-2 shrink-0 ${
              activeSubTab === 'assignments' ? 'bg-indigo-600 text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:text-slate-900'
            }`}
          >
            <Users size={14} className="shrink-0" />
            <span className="truncate">Appointed Member Roster</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-indigo-800 text-indigo-100 shrink-0">{assignments.length}</span>
          </button>
        </div>
      </div>

      {/* SUB-TAB 1: ROLES & PERMISSIONS MATRIX WITH MINISTRY FILTER */}
      {activeSubTab === 'roles' && (
        <div className="space-y-4">
          {/* Department Filter Bar */}
          <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs font-bold">
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Filter size={15} className="text-slate-400 shrink-0" />
              <span className="text-slate-500 uppercase tracking-wider text-[10px] font-extrabold shrink-0">Department Scope:</span>
              <select
                value={selectedMinistryFilter}
                onChange={(e) => setSelectedMinistryFilter(e.target.value)}
                className="bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl font-bold text-xs text-slate-800 outline-none cursor-pointer w-full sm:w-auto min-w-[200px]"
              >
                <option value="All">All Department Scopes ({roles.length})</option>
                {availableMinistryOptions.map(mOpt => (
                  <option key={mOpt} value={mOpt}>{mOpt}</option>
                ))}
              </select>
            </div>

            <span className="text-slate-400 text-[11px] font-semibold">
              Showing {filteredRoles.length} of {roles.length} defined role titles
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
            {filteredRoles.map(r => {
              const assignedMembers = assignments.filter(a => a.role_id === r.id);

              return (
                <div key={r.id} className="bg-white p-4.5 sm:p-6 rounded-2xl sm:rounded-3xl border border-slate-200 shadow-xs space-y-4 flex flex-col justify-between hover:border-indigo-300 transition-all">
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-slate-100 text-slate-700">
                            {r.category}
                          </span>
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-indigo-50 text-indigo-800 border border-indigo-100 flex items-center gap-1">
                            <Building2 size={11} className="text-indigo-600" />
                            <span>{r.ministry_name || 'All Ministries'}</span>
                          </span>
                        </div>
                        <h3 className="text-base sm:text-lg font-black text-slate-900 truncate">{r.name}</h3>
                        <p className="text-xs text-slate-500 leading-relaxed">{r.description}</p>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => handleOpenEditRole(r)}
                          className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-slate-100 rounded-xl cursor-pointer transition-colors"
                          title="Edit Role & Permissions"
                        >
                          <Edit size={16} />
                        </button>
                        <button
                          onClick={() => handleDeleteRole(r.id)}
                          className="p-2 text-slate-400 hover:text-rose-600 hover:bg-slate-100 rounded-xl cursor-pointer transition-colors"
                          title="Delete Role Definition"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>

                    {/* Responsibilities Section */}
                    <div className="space-y-1.5 bg-slate-50 p-3.5 rounded-2xl border border-slate-100 text-xs">
                      <strong className="text-slate-800 font-extrabold uppercase text-[10px] tracking-wider block">Key Responsibilities & Duties:</strong>
                      <ul className="space-y-1 text-slate-600 pl-4 list-disc font-medium">
                        {r.responsibilities.map((resp, idx) => (
                          <li key={idx} className="leading-snug">{resp}</li>
                        ))}
                      </ul>
                    </div>

                    {/* Permissions Badges */}
                    <div className="space-y-1.5">
                      <strong className="text-slate-400 font-extrabold uppercase text-[10px] tracking-wider block">Granted Permission Rights:</strong>
                      <div className="flex flex-wrap gap-1.5">
                        {r.permissions.map(pKey => {
                          const info = ALL_PERMISSIONS.find(p => p.key === pKey);
                          return (
                            <span key={pKey} className="px-2.5 py-1 bg-indigo-50 border border-indigo-200 text-indigo-900 rounded-lg text-[10px] font-bold flex items-center gap-1">
                              <Check size={12} className="text-indigo-600 shrink-0" />
                              <span>{info?.label || pKey}</span>
                            </span>
                          );
                        })}
                        {r.permissions.length === 0 && (
                          <span className="text-xs text-slate-400 italic">No special administrative permissions granted.</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Assigned Members Footer */}
                  <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                    <span className="font-medium">Appointed Leaders: <strong className="text-slate-900">{assignedMembers.length}</strong></span>
                    <div className="flex -space-x-1.5">
                      {assignedMembers.map((a, i) => (
                        <div key={i} className="w-6 h-6 rounded-full bg-indigo-600 text-white font-bold flex items-center justify-center text-[10px] border border-white shrink-0" title={`${a.member_name} (${a.ministry_name || 'Global'})`}>
                          {a.member_name.charAt(0)}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* SUB-TAB 2: MEMBER ROLE ASSIGNMENTS (Mobile & Tablet Cards + Desktop Table) */}
      {activeSubTab === 'assignments' && (
        <div className="bg-white rounded-2xl sm:rounded-3xl border border-slate-200 p-4 sm:p-6 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
            <div>
              <h3 className="text-base sm:text-lg font-black text-slate-900">Appointed Department Leadership Roster</h3>
              <p className="text-xs text-slate-500">All congregation members currently holding ministry-specific leadership roles and responsibilities.</p>
            </div>

            <div className="relative w-full sm:w-auto sm:min-w-[260px]">
              <Search size={14} className="absolute left-3 top-3 text-slate-400" />
              <input
                type="text"
                placeholder="Search member, role, or ministry..."
                value={memberFilter}
                onChange={e => setMemberFilter(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* MOBILE & TABLET CARD VIEW (< lg) */}
          <div className="block lg:hidden space-y-3">
            {filteredAssignments.map(a => (
              <div key={a.id} className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3">
                <div className="flex justify-between items-start gap-2">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-indigo-100 text-indigo-700 font-black flex items-center justify-center text-sm shrink-0">
                      {a.member_name.charAt(0)}
                    </div>
                    <div>
                      <h4 className="font-extrabold text-slate-900 text-sm">{a.member_name}</h4>
                      <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase bg-indigo-100 text-indigo-900">
                          {a.role_name}
                        </span>
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-700">
                          {a.ministry_name || 'All Ministries'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => handleRemoveAssignment(a.id)}
                    className="p-2 text-slate-400 hover:text-rose-600 rounded-xl hover:bg-rose-50 cursor-pointer transition-colors"
                    title="Revoke Role Appointment"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-[11px] text-slate-500">
                  <span className="flex items-center gap-1">
                    <Calendar size={12} className="text-slate-400" />
                    <span>Appointed {new Date(a.assigned_at).toLocaleDateString()}</span>
                  </span>
                  <span>By: <strong className="text-slate-700 font-semibold">{a.assigned_by}</strong></span>
                </div>
              </div>
            ))}

            {filteredAssignments.length === 0 && (
              <div className="p-8 text-center text-slate-400 italic text-xs bg-slate-50 rounded-2xl border border-slate-100">
                No members have been assigned to custom department roles yet.
              </div>
            )}
          </div>

          {/* DESKTOP TABLE VIEW (lg+) */}
          <div className="hidden lg:block overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-extrabold uppercase text-[10px]">
                  <th className="p-3.5">Member Name</th>
                  <th className="p-3.5">Assigned Role Title</th>
                  <th className="p-3.5">Department / Ministry Scope</th>
                  <th className="p-3.5">Appointment Date</th>
                  <th className="p-3.5">Assigned By</th>
                  <th className="p-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {filteredAssignments.map(a => (
                  <tr key={a.id} className="hover:bg-slate-50 transition-colors">
                    <td className="p-3.5 font-bold text-slate-900 flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 font-black flex items-center justify-center text-xs shrink-0">
                        {a.member_name.charAt(0)}
                      </div>
                      <span>{a.member_name}</span>
                    </td>
                    <td className="p-3.5">
                      <span className="px-2.5 py-0.5 rounded-md text-[10px] font-black uppercase bg-indigo-100 text-indigo-900">
                        {a.role_name}
                      </span>
                    </td>
                    <td className="p-3.5">
                      <span className="px-2.5 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-800 flex items-center gap-1 w-fit">
                        <Building2 size={11} className="text-slate-500" />
                        <span>{a.ministry_name || 'All Ministries'}</span>
                      </span>
                    </td>
                    <td className="p-3.5 text-slate-500">{new Date(a.assigned_at).toLocaleDateString()}</td>
                    <td className="p-3.5 text-slate-500 font-semibold">{a.assigned_by}</td>
                    <td className="p-3.5 text-right">
                      <button
                        onClick={() => handleRemoveAssignment(a.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg cursor-pointer transition-colors"
                        title="Revoke Role Appointment"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}

                {filteredAssignments.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-slate-400 italic">No members have been assigned to custom department roles yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL: CREATE / EDIT ROLE */}
      {showRoleModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-[120] flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-6 max-w-xl w-full max-h-[92vh] overflow-y-auto shadow-2xl border border-slate-200 space-y-4">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <div>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-indigo-100 text-indigo-900">
                  Ministry Role Builder
                </span>
                <h3 className="text-base sm:text-lg font-black text-slate-900 mt-0.5">
                  {editingRoleId ? 'Edit Department Role Definition' : 'Define New Department Role'}
                </h3>
              </div>
              <button onClick={() => setShowRoleModal(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer p-1">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveRole} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-extrabold text-slate-700 block mb-1">Role Title / Position Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Choir Director or Protocol Lead"
                    value={roleName}
                    onChange={e => setRoleName(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="font-extrabold text-slate-700 block mb-1">Department Category *</label>
                  <select
                    value={roleCategory}
                    onChange={e => setRoleCategory(e.target.value as any)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold cursor-pointer text-slate-900"
                  >
                    <option value="Spiritual">Spiritual & Pastoral</option>
                    <option value="Administration">Administration & Care</option>
                    <option value="Operations">Operations & Ushering</option>
                    <option value="Finance">Finance & Treasury</option>
                    <option value="Creative & Media">Creative & Media</option>
                    <option value="Youth & Children">Youth & Children</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="font-extrabold text-slate-700 block mb-1">Target Ministry / Department Scope *</label>
                <select
                  value={roleMinistryName}
                  onChange={e => setRoleMinistryName(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold cursor-pointer text-slate-900"
                >
                  {availableMinistryOptions.map(mOpt => (
                    <option key={mOpt} value={mOpt}>{mOpt}</option>
                  ))}
                  <option value="custom">+ Add Custom Department Scope...</option>
                </select>

                {roleMinistryName === 'custom' && (
                  <input
                    type="text"
                    required
                    placeholder="Enter custom department name..."
                    value={customMinistryInput}
                    onChange={e => setCustomMinistryInput(e.target.value)}
                    className="w-full mt-2 p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                )}
              </div>

              <div>
                <label className="font-extrabold text-slate-700 block mb-1">Role Purpose Description</label>
                <input
                  type="text"
                  placeholder="e.g. Oversees choir vocal rehearsals, instrument soundchecks, and Sunday sets."
                  value={roleDesc}
                  onChange={e => setRoleDesc(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="font-extrabold text-slate-700 block mb-1">Defined Responsibilities & Duties (One per line) *</label>
                <textarea
                  rows={3}
                  required
                  placeholder={`Lead Sunday choir rehearsal at 8:00 AM\nSelect Sunday setlist and song sheets\nCoordinate with sanctuary audio team`}
                  value={roleRespText}
                  onChange={e => setRoleRespText(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Granular Permission Checkboxes */}
              <div>
                <label className="font-extrabold text-slate-800 block mb-2">Granular System Permissions Matrix</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-slate-50 p-3 rounded-2xl border border-slate-200">
                  {ALL_PERMISSIONS.map(p => {
                    const isChecked = selectedPermissions.includes(p.key);
                    return (
                      <label 
                        key={p.key} 
                        onClick={() => handleTogglePermission(p.key)}
                        className={`p-2.5 sm:p-3 rounded-xl border transition-all cursor-pointer flex items-start gap-2.5 ${
                          isChecked ? 'bg-indigo-50 border-indigo-300 text-indigo-950' : 'bg-white border-slate-200 text-slate-600'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {}}
                          className="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                        />
                        <div>
                          <strong className="block text-[11px] font-bold">{p.label}</strong>
                          <p className="text-[10px] text-slate-500 leading-tight">{p.description}</p>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowRoleModal(false)}
                  className="w-full sm:w-auto px-4 py-2.5 font-bold text-slate-500 hover:bg-slate-100 rounded-xl cursor-pointer text-center"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="w-full sm:w-auto px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold rounded-xl shadow-md cursor-pointer text-center"
                >
                  Save Department Role
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ASSIGN MEMBER TO ROLE */}
      {showAssignModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-[120] flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-6 max-w-md w-full shadow-2xl border border-slate-200 space-y-4">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <div>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-900">
                  Leadership Appointment
                </span>
                <h3 className="text-base sm:text-lg font-black text-slate-900 mt-0.5">Appoint Member to Department Role</h3>
              </div>
              <button onClick={() => setShowAssignModal(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer p-1">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleAssignMemberRole} className="space-y-4 text-xs">
              <div>
                <label className="font-extrabold text-slate-700 block mb-1">Select Congregation Member *</label>
                <select
                  required
                  value={selectedProfileId}
                  onChange={e => setSelectedProfileId(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold cursor-pointer text-slate-900"
                >
                  <option value="">-- Choose Member from Roster --</option>
                  {members.map(m => (
                    <option key={m.id} value={m.id}>
                      {m.first_name} {m.last_name} ({m.email})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-extrabold text-slate-700 block mb-1">Assign Leadership Role Title *</label>
                <select
                  required
                  value={selectedRoleId}
                  onChange={e => {
                    setSelectedRoleId(e.target.value);
                    const found = roles.find(r => r.id === e.target.value);
                    if (found && found.ministry_name) {
                      setAssignMinistryName(found.ministry_name);
                    }
                  }}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold cursor-pointer text-slate-900"
                >
                  <option value="">-- Choose Department Role Definition --</option>
                  {roles.map(r => (
                    <option key={r.id} value={r.id}>
                      {r.name} ({r.ministry_name || r.category})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-extrabold text-slate-700 block mb-1">Department / Ministry Scope *</label>
                <select
                  value={assignMinistryName}
                  onChange={e => setAssignMinistryName(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold cursor-pointer text-slate-900"
                >
                  {availableMinistryOptions.map(mOpt => (
                    <option key={mOpt} value={mOpt}>{mOpt}</option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAssignModal(false)}
                  className="w-full sm:w-auto px-4 py-2.5 font-bold text-slate-500 hover:bg-slate-100 rounded-xl cursor-pointer text-center"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="w-full sm:w-auto px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold rounded-xl shadow-md cursor-pointer text-center"
                >
                  Confirm Appointment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
