import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Building2,
  Map as MapIcon,
  MapPin,
  Plus,
  Edit3,
  UserPlus,
  Trash2,
  Search,
  ShieldCheck,
  X,
  RefreshCw,
  Crown
} from 'lucide-react';
import type { ChurchBranch, District, Profile } from './types';
import {
  getBranchGovernanceData,
  createDistrict,
  createChurchBranch,
  updateChurchBranch,
  resolveActorBranchGovernanceScope,
  type BranchGovernanceScope
} from './branchManagementService';
import {
  assignProfileRole,
  deleteProfileRoleAssignment,
  type ProfileRoleAssignment,
  type SystemRole
} from './profileRoleAssignmentService';
import { canManageTargetRoleByScope } from './permissionResolutionService';

const formatRoleName = (name: string): string =>
  name
    .split('_')
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

export interface BranchesAndDistrictsTabProps {
  profile: Profile | null;
}

export const BranchesAndDistrictsTab: React.FC<BranchesAndDistrictsTabProps> = ({ profile }) => {
  const [districts, setDistricts] = useState<District[]>([]);
  const [branches, setBranches] = useState<ChurchBranch[]>([]);
  const [roles, setRoles] = useState<SystemRole[]>([]);
  const [assignments, setAssignments] = useState<ProfileRoleAssignment[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [scope, setScope] = useState<BranchGovernanceScope>({
    canCreateDistrict: false,
    hasChurchBranchAccess: false,
    hasChurchRoleAccess: false,
    manageableDistrictIds: [],
    manageableBranchIds: [],
    assignableBranchIds: []
  });

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [districtFilter, setDistrictFilter] = useState<string>('all');
  const [confirmRemoveAssignmentId, setConfirmRemoveAssignmentId] = useState<string | null>(null);

  // District Modal State
  const [showDistrictModal, setShowDistrictModal] = useState(false);
  const [districtName, setDistrictName] = useState('');
  const [districtRegion, setDistrictRegion] = useState('');
  const [districtCountry, setDistrictCountry] = useState('United States');
  const [districtModalError, setDistrictModalError] = useState<string | null>(null);

  // Branch Modal State (Create / Edit)
  const [showBranchModal, setShowBranchModal] = useState(false);
  const [editingBranch, setEditingBranch] = useState<ChurchBranch | null>(null);
  const [branchDistrictId, setBranchDistrictId] = useState('');
  const [branchName, setBranchName] = useState('');
  const [branchAddress, setBranchAddress] = useState('');
  const [branchCity, setBranchCity] = useState('');
  const [branchState, setBranchState] = useState('');
  const [branchIsMain, setBranchIsMain] = useState(false);
  const [branchModalError, setBranchModalError] = useState<string | null>(null);

  // Assign Branch Leadership Modal State
  const [leadershipTargetBranch, setLeadershipTargetBranch] = useState<ChurchBranch | null>(null);
  const [leaderProfileId, setLeaderProfileId] = useState('');
  const [leaderRoleId, setLeaderRoleId] = useState('');
  const [leaderModalError, setLeaderModalError] = useState<string | null>(null);

  const loadData = useCallback(async (isBackgroundRefresh = false) => {
    if (isBackgroundRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      const data = await getBranchGovernanceData();
      const resolvedScope = await resolveActorBranchGovernanceScope(
        profile?.id,
        data.districts,
        data.branches
      );
      setDistricts(data.districts);
      setBranches(data.branches);
      setRoles(data.roles);
      setAssignments(data.assignments);
      setProfiles(data.profiles);
      setScope(resolvedScope);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load districts and branches.');
    } finally {
      if (isBackgroundRefresh) {
        setRefreshing(false);
      } else {
        setLoading(false);
      }
    }
  }, [profile?.id]);

  useEffect(() => {
    void loadData(false);
  }, [loadData]);

  useEffect(() => {
    const handleSync = () => {
      void loadData(true);
    };
    window.addEventListener('church_branches_updated', handleSync);
    window.addEventListener('profile_role_assignments_updated', handleSync);
    window.addEventListener('role_permissions_updated', handleSync);
    return () => {
      window.removeEventListener('church_branches_updated', handleSync);
      window.removeEventListener('profile_role_assignments_updated', handleSync);
      window.removeEventListener('role_permissions_updated', handleSync);
    };
  }, [loadData]);

  const profileById = useMemo(() => {
    const map = new Map<string, Profile>();
    profiles.forEach(p => map.set(p.id, p));
    return map;
  }, [profiles]);

  const roleById = useMemo(() => {
    const map = new Map<string, SystemRole>();
    roles.forEach(r => map.set(r.id, r));
    return map;
  }, [roles]);

  const assignableLeadershipRoles = useMemo(() => {
    const order = ['pastor', 'finance_officer', 'leader', 'worker', 'district_admin', 'admin', 'super_admin', 'member'];
    return [...roles]
      .filter(role => canManageTargetRoleByScope(scope.hasChurchRoleAccess, role.name))
      .sort((a, b) => {
        const idxA = order.indexOf(a.name);
        const idxB = order.indexOf(b.name);
        return (idxA === -1 ? 99 : idxA) - (idxB === -1 ? 99 : idxB);
      });
  }, [roles, scope.hasChurchRoleAccess]);

  const activeAssignments = useMemo(() => {
    const nowMs = Date.now();
    return assignments.filter(a => {
      if (!a.is_active) return false;
      const assignedAt = Date.parse(a.assigned_at);
      if (!Number.isFinite(assignedAt) || assignedAt > nowMs) return false;
      if (a.expires_at) {
        const expiresAt = Date.parse(a.expires_at);
        if (!Number.isFinite(expiresAt) || expiresAt <= nowMs) return false;
      }
      return true;
    });
  }, [assignments]);

  const branchLeadershipMap = useMemo(() => {
    const map = new Map<string, ProfileRoleAssignment[]>();
    activeAssignments.forEach(a => {
      if (a.scope_type !== 'branch' || !a.branch_id) return;
      const list = map.get(a.branch_id) || [];
      list.push(a);
      map.set(a.branch_id, list);
    });
    return map;
  }, [activeAssignments]);

  const districtOverseersMap = useMemo(() => {
    const map = new Map<string, ProfileRoleAssignment[]>();
    activeAssignments.forEach(a => {
      if (a.scope_type !== 'district' || !a.district_id) return;
      const list = map.get(a.district_id) || [];
      list.push(a);
      map.set(a.district_id, list);
    });
    return map;
  }, [activeAssignments]);

  const manageableDistricts = useMemo(() => {
    const allowed = new Set(scope.manageableDistrictIds);
    return districts.filter(d => scope.hasChurchBranchAccess || allowed.has(d.id));
  }, [districts, scope]);

  const visibleDistricts = useMemo(() => {
    if (districtFilter !== 'all') {
      return districts.filter(d => d.id === districtFilter);
    }
    return districts;
  }, [districts, districtFilter]);

  const stats = useMemo(() => {
    const branchIdsWithPastor = new Set(
      activeAssignments
        .filter(a => a.scope_type === 'branch' && a.branch_id && roleById.get(a.role_id)?.name === 'pastor')
        .map(a => a.branch_id as string)
    );
    const totalBranchLeaders = activeAssignments.filter(a => a.scope_type === 'branch' && a.branch_id).length;
    return {
      districtCount: districts.length,
      branchCount: branches.length,
      branchesWithPastor: branchIdsWithPastor.size,
      totalBranchLeaders
    };
  }, [activeAssignments, branches.length, districts.length, roleById]);

  const openCreateDistrict = () => {
    setDistrictName('');
    setDistrictRegion('');
    setDistrictCountry('United States');
    setDistrictModalError(null);
    setShowDistrictModal(true);
  };

  const openCreateBranch = (presetDistrictId?: string) => {
    setEditingBranch(null);
    const defaultDist =
      presetDistrictId ||
      manageableDistricts[0]?.id ||
      districts[0]?.id ||
      '';
    setBranchDistrictId(defaultDist);
    setBranchName('');
    setBranchAddress('');
    setBranchCity('');
    setBranchState('');
    setBranchIsMain(false);
    setBranchModalError(null);
    setShowBranchModal(true);
  };

  const openEditBranch = (branch: ChurchBranch) => {
    setEditingBranch(branch);
    setBranchDistrictId(branch.district_id);
    setBranchName(branch.name);
    setBranchAddress(branch.address);
    setBranchCity(branch.city);
    setBranchState(branch.state);
    setBranchIsMain(branch.is_main_branch);
    setBranchModalError(null);
    setShowBranchModal(true);
  };

  const openAssignLeadership = (branch: ChurchBranch) => {
    setLeadershipTargetBranch(branch);
    const branchMember = profiles.find(p => p.branch_id === branch.id) || profiles[0];
    setLeaderProfileId(branchMember?.id || '');
    const defaultPastorRole =
      assignableLeadershipRoles.find(r => r.name === 'pastor') || assignableLeadershipRoles[0];
    setLeaderRoleId(defaultPastorRole?.id || '');
    setLeaderModalError(null);
  };

  const handleSaveDistrict = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setDistrictModalError(null);
    setNotice(null);
    try {
      const created = await createDistrict({
        name: districtName,
        region: districtRegion,
        country: districtCountry
      });
      setShowDistrictModal(false);
      setNotice(`Created district "${created.name}".`);
      await loadData(true);
    } catch (cause) {
      setDistrictModalError(cause instanceof Error ? cause.message : 'Unable to create district.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveBranch = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setBranchModalError(null);
    setNotice(null);
    try {
      if (editingBranch) {
        const updated = await updateChurchBranch({
          id: editingBranch.id,
          district_id: branchDistrictId,
          name: branchName,
          address: branchAddress,
          city: branchCity,
          state: branchState,
          is_main_branch: branchIsMain
        });
        setShowBranchModal(false);
        setNotice(`Updated branch "${updated.name}".`);
      } else {
        const created = await createChurchBranch({
          district_id: branchDistrictId,
          name: branchName,
          address: branchAddress,
          city: branchCity,
          state: branchState,
          is_main_branch: branchIsMain
        });
        setShowBranchModal(false);
        setNotice(`Created branch "${created.name}".`);
      }
      await loadData(true);
    } catch (cause) {
      setBranchModalError(cause instanceof Error ? cause.message : 'Unable to save branch.');
    } finally {
      setSaving(false);
    }
  };

  const handleAssignBranchLeader = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!leadershipTargetBranch || !leaderProfileId || !leaderRoleId) return;
    setSaving(true);
    setLeaderModalError(null);
    setNotice(null);
    try {
      await assignProfileRole({
        profile_id: leaderProfileId,
        role_id: leaderRoleId,
        scope_type: 'branch',
        branch_id: leadershipTargetBranch.id,
        district_id: null
      });
      const member = profileById.get(leaderProfileId);
      const role = roleById.get(leaderRoleId);
      const branchLabel = leadershipTargetBranch.name;
      setLeadershipTargetBranch(null);
      setNotice(
        `Assigned ${member ? `${member.first_name} ${member.last_name}` : 'member'} as ${
          role ? formatRoleName(role.name) : 'leader'
        } for ${branchLabel}.`
      );
      await loadData(true);
    } catch (cause) {
      setLeaderModalError(cause instanceof Error ? cause.message : 'Unable to assign branch leadership.');
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveBranchAssignment = async (assignment: ProfileRoleAssignment) => {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await deleteProfileRoleAssignment(assignment.id);
      setConfirmRemoveAssignmentId(null);
      setNotice('Branch leadership assignment removed.');
      await loadData(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to remove assignment.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-slate-500">Loading districts, branches, and leadership…</div>;
  }

  return (
    <div className="space-y-5 sm:space-y-6 min-w-0 w-full">
      {/* Header & Governance Summary */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
            <Building2 size={20} className="text-indigo-600 shrink-0" />
            <span>Branches & District Governance</span>
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            {scope.hasChurchBranchAccess
              ? 'Church-wide administration: create districts, establish branches, and appoint branch or district leadership.'
              : 'District oversight: create and manage branches inside your assigned district and appoint branch leadership.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => void loadData(true)}
            disabled={refreshing}
            aria-label="Refresh branches and districts"
            title="Refresh branches and districts"
            className="min-h-[44px] w-11 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 flex items-center justify-center cursor-pointer disabled:opacity-50"
          >
            <RefreshCw size={16} className={refreshing ? 'animate-spin text-indigo-600' : ''} />
          </button>

          {scope.canCreateDistrict && (
            <button
              type="button"
              onClick={openCreateDistrict}
              className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 font-bold text-xs sm:text-sm flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
            >
              <MapIcon size={15} /> New District
            </button>
          )}

          {manageableDistricts.length > 0 && (
            <button
              type="button"
              onClick={() => openCreateBranch()}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs sm:text-sm flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
            >
              <Plus size={15} /> New Branch
            </button>
          )}
        </div>
      </div>

      {/* KPI Metrics Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white border border-slate-200 rounded-2xl p-4">
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">Districts</div>
          <div className="text-2xl font-black text-slate-900 mt-1 tabular-nums">{stats.districtCount}</div>
          <div className="text-xs text-slate-400 mt-0.5">Regional groupings</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-4">
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">Church Branches</div>
          <div className="text-2xl font-black text-slate-900 mt-1 tabular-nums">{stats.branchCount}</div>
          <div className="text-xs text-slate-400 mt-0.5">Active local campuses</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-4">
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">Branches w/ Pastor</div>
          <div className="text-2xl font-black text-emerald-700 mt-1 tabular-nums">
            {stats.branchesWithPastor} / {stats.branchCount}
          </div>
          <div className="text-xs text-slate-400 mt-0.5">Active branch pastoral lead</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-4">
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">Branch Leadership</div>
          <div className="text-2xl font-black text-indigo-700 mt-1 tabular-nums">{stats.totalBranchLeaders}</div>
          <div className="text-xs text-slate-400 mt-0.5">Active scoped appointments</div>
        </div>
      </div>

      {error && <div role="alert" className="p-3 rounded-xl bg-rose-50 text-rose-700 border border-rose-200 text-sm">{error}</div>}
      {notice && <div role="status" className="p-3 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 text-sm">{notice}</div>}

      {/* Filter Toolbar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <label className="relative block w-full sm:flex-1 sm:max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search branch, city, or assigned leader…"
            className="w-full min-h-[44px] pl-9 pr-3 py-2 rounded-xl border border-slate-200 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </label>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <label className="text-xs font-bold text-slate-500 shrink-0" htmlFor="district-filter-select">
            District:
          </label>
          <select
            id="district-filter-select"
            value={districtFilter}
            onChange={e => setDistrictFilter(e.target.value)}
            className="w-full sm:w-64 min-h-[44px] px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-800"
          >
            <option value="all">All Districts ({districts.length})</option>
            {districts.map(d => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* District Sections & Branch Cards */}
      <div className="space-y-6">
        {visibleDistricts.map(district => {
          const query = searchQuery.trim().toLowerCase();
          const districtBranches = branches.filter(b => {
            if (b.district_id !== district.id) return false;
            if (!query) return true;
            const leaders = branchLeadershipMap.get(b.id) || [];
            const leaderMatch = leaders.some(l => {
              const member = profileById.get(l.profile_id);
              const fullName = member ? `${member.first_name} ${member.last_name}`.toLowerCase() : '';
              return fullName.includes(query);
            });
            return (
              b.name.toLowerCase().includes(query) ||
              b.city.toLowerCase().includes(query) ||
              b.state.toLowerCase().includes(query) ||
              b.address.toLowerCase().includes(query) ||
              leaderMatch
            );
          });

          const canManageThisDistrict =
            scope.hasChurchBranchAccess || scope.manageableDistrictIds.includes(district.id);
          const overseers = districtOverseersMap.get(district.id) || [];

          if (query && districtBranches.length === 0) return null;

          return (
            <section key={district.id} className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-200">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-base font-extrabold text-slate-900">{district.name}</h3>
                    <span className="text-xs font-semibold text-slate-500 tabular-nums">
                      · {district.region}, {district.country} · {districtBranches.length} {districtBranches.length === 1 ? 'branch' : 'branches'}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className="font-semibold text-slate-600">District Oversight:</span>
                    {overseers.length === 0 ? (
                      <span className="text-slate-400">No district admin assigned</span>
                    ) : (
                      overseers.map((o, idx) => {
                        const member = profileById.get(o.profile_id);
                        const role = roleById.get(o.role_id);
                        return (
                          <span key={o.id} className="text-slate-700 font-medium">
                            {idx > 0 ? ', ' : ''}
                            {member ? `${member.first_name} ${member.last_name}` : o.profile_id} ({role ? formatRoleName(role.name) : 'Overseer'})
                          </span>
                        );
                      })
                    )}
                  </div>
                </div>

                {canManageThisDistrict && (
                  <button
                    type="button"
                    onClick={() => openCreateBranch(district.id)}
                    className="min-h-[40px] px-3.5 py-2 rounded-xl border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs inline-flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer self-start sm:self-auto"
                  >
                    <Plus size={14} /> Add Branch to District
                  </button>
                )}
              </div>

              {districtBranches.length === 0 ? (
                <div className="bg-white border border-dashed border-slate-300 rounded-2xl p-6 text-center text-sm text-slate-500">
                  No branches registered in this district yet.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {districtBranches.map(branch => {
                    const leaders = branchLeadershipMap.get(branch.id) || [];
                    const canEditBranch = scope.manageableBranchIds.includes(branch.id);
                    const canAssignLeadership = scope.assignableBranchIds.includes(branch.id);

                    return (
                      <article
                        key={branch.id}
                        className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 flex flex-col justify-between gap-4 min-w-0"
                      >
                        <div className="space-y-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <h4 className="font-extrabold text-slate-900 text-base">{branch.name}</h4>
                                {branch.is_main_branch && (
                                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700">
                                    <Crown size={12} /> Main HQ
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-slate-500 mt-1 flex items-center gap-1.5">
                                <MapPin size={13} className="shrink-0 text-slate-400" />
                                <span>{branch.address}, {branch.city}, {branch.state}</span>
                              </p>
                            </div>
                          </div>

                          {/* Assigned Branch Leadership */}
                          <div className="pt-3 border-t border-slate-100 space-y-2">
                            <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                              <ShieldCheck size={13} className="text-indigo-600" />
                              <span>Branch Leadership ({leaders.length})</span>
                            </div>

                            {leaders.length === 0 ? (
                              <p className="text-xs text-slate-400">
                                No branch-scoped pastor or leaders assigned yet.
                              </p>
                            ) : (
                              <div className="space-y-1.5">
                                {leaders.map(assignment => {
                                  const member = profileById.get(assignment.profile_id);
                                  const role = roleById.get(assignment.role_id);
                                  const canManageThisRole =
                                    canAssignLeadership &&
                                    role &&
                                    canManageTargetRoleByScope(scope.hasChurchRoleAccess, role.name);
                                  const isConfirming = confirmRemoveAssignmentId === assignment.id;

                                  return (
                                    <div
                                      key={assignment.id}
                                      className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-slate-50 border border-slate-200/80 text-xs"
                                    >
                                      <div className="min-w-0">
                                        <span className="font-bold text-slate-900 block truncate">
                                          {member ? `${member.first_name} ${member.last_name}` : assignment.profile_id}
                                        </span>
                                        <span className="text-slate-500 font-semibold">
                                          {role ? formatRoleName(role.name) : 'Assigned Leader'}
                                        </span>
                                      </div>

                                      {canManageThisRole && (
                                        isConfirming ? (
                                          <div className="flex items-center gap-1.5 shrink-0">
                                            <button
                                              type="button"
                                              disabled={saving}
                                              onClick={() => void handleRemoveBranchAssignment(assignment)}
                                              className="px-2.5 py-1 rounded-lg bg-rose-600 text-white font-bold text-[11px] cursor-pointer"
                                            >
                                              Confirm
                                            </button>
                                            <button
                                              type="button"
                                              disabled={saving}
                                              onClick={() => setConfirmRemoveAssignmentId(null)}
                                              className="px-2 py-1 rounded-lg border border-slate-200 bg-white text-slate-600 font-semibold text-[11px] cursor-pointer"
                                            >
                                              Cancel
                                            </button>
                                          </div>
                                        ) : (
                                          <button
                                            type="button"
                                            disabled={saving}
                                            onClick={() => setConfirmRemoveAssignmentId(assignment.id)}
                                            aria-label={`Remove ${member ? member.first_name : 'leader'} from ${branch.name}`}
                                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer shrink-0"
                                          >
                                            <Trash2 size={14} />
                                          </button>
                                        )
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Card Footer Actions */}
                        <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                          {canEditBranch && (
                            <button
                              type="button"
                              onClick={() => openEditBranch(branch)}
                              className="min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                            >
                              <Edit3 size={14} /> Edit Branch
                            </button>
                          )}

                          {canAssignLeadership && (
                            <button
                              type="button"
                              onClick={() => openAssignLeadership(branch)}
                              className="ml-auto min-h-[44px] px-3.5 py-2 rounded-xl border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                            >
                              <UserPlus size={14} /> Assign Leadership
                            </button>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          );
        })}
      </div>

      {/* Create District Modal */}
      {showDistrictModal && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 backdrop-blur-[1px] p-0 sm:p-4"
          onClick={() => { if (!saving) setShowDistrictModal(false); }}
        >
          <form
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-district-title"
            onSubmit={handleSaveDistrict}
            onClick={e => e.stopPropagation()}
            className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl border border-slate-200 shadow-2xl overflow-hidden"
          >
            <div className="p-4 sm:p-6 border-b border-slate-200 flex items-center justify-between">
              <h3 id="create-district-title" className="text-lg font-black text-slate-900">Create District</h3>
              <button
                type="button"
                disabled={saving}
                onClick={() => setShowDistrictModal(false)}
                className="p-2 text-slate-400 hover:text-slate-700 rounded-xl cursor-pointer"
                aria-label="Close modal"
              >
                <X size={18} />
              </button>
            </div>
            <div className="p-4 sm:p-6 space-y-4">
              {districtModalError && (
                <div role="alert" className="p-3 rounded-xl bg-rose-50 text-rose-700 border border-rose-200 text-xs font-semibold">
                  {districtModalError}
                </div>
              )}
              <label className="block text-sm font-bold text-slate-700">
                District Name
                <input
                  required
                  type="text"
                  value={districtName}
                  onChange={e => setDistrictName(e.target.value)}
                  placeholder="e.g. Southern Heritage District"
                  className="mt-1 w-full min-h-[44px] px-3 py-2 border border-slate-200 rounded-xl bg-white font-medium"
                />
              </label>
              <label className="block text-sm font-bold text-slate-700">
                Region
                <input
                  required
                  type="text"
                  value={districtRegion}
                  onChange={e => setDistrictRegion(e.target.value)}
                  placeholder="e.g. Southeast"
                  className="mt-1 w-full min-h-[44px] px-3 py-2 border border-slate-200 rounded-xl bg-white font-medium"
                />
              </label>
              <label className="block text-sm font-bold text-slate-700">
                Country
                <input
                  required
                  type="text"
                  value={districtCountry}
                  onChange={e => setDistrictCountry(e.target.value)}
                  placeholder="e.g. United States"
                  className="mt-1 w-full min-h-[44px] px-3 py-2 border border-slate-200 rounded-xl bg-white font-medium"
                />
              </label>
            </div>
            <div className="p-4 sm:p-6 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => setShowDistrictModal(false)}
                className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 text-sm font-bold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="min-h-[44px] px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-extrabold cursor-pointer disabled:opacity-50"
              >
                {saving ? 'Creating…' : 'Create District'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Create / Edit Branch Modal */}
      {showBranchModal && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 backdrop-blur-[1px] p-0 sm:p-4"
          onClick={() => { if (!saving) setShowBranchModal(false); }}
        >
          <form
            role="dialog"
            aria-modal="true"
            aria-labelledby="branch-modal-title"
            onSubmit={handleSaveBranch}
            onClick={e => e.stopPropagation()}
            className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl border border-slate-200 shadow-2xl overflow-hidden max-h-[90dvh] flex flex-col"
          >
            <div className="p-4 sm:p-6 border-b border-slate-200 flex items-center justify-between shrink-0">
              <h3 id="branch-modal-title" className="text-lg font-black text-slate-900">
                {editingBranch ? 'Edit Church Branch' : 'Create Church Branch'}
              </h3>
              <button
                type="button"
                disabled={saving}
                onClick={() => setShowBranchModal(false)}
                className="p-2 text-slate-400 hover:text-slate-700 rounded-xl cursor-pointer"
                aria-label="Close modal"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-4 sm:p-6 space-y-4 overflow-y-auto">
              {branchModalError && (
                <div role="alert" className="p-3 rounded-xl bg-rose-50 text-rose-700 border border-rose-200 text-xs font-semibold">
                  {branchModalError}
                </div>
              )}

              <label className="block text-sm font-bold text-slate-700">
                District
                <select
                  required
                  value={branchDistrictId}
                  onChange={e => setBranchDistrictId(e.target.value)}
                  className="mt-1 w-full min-h-[44px] px-3 py-2 border border-slate-200 rounded-xl bg-white font-medium"
                >
                  <option value="">Select district</option>
                  {manageableDistricts.map(d => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </label>

              <label className="block text-sm font-bold text-slate-700">
                Branch Name
                <input
                  required
                  type="text"
                  value={branchName}
                  onChange={e => setBranchName(e.target.value)}
                  placeholder="e.g. Harbor Light Chapel"
                  className="mt-1 w-full min-h-[44px] px-3 py-2 border border-slate-200 rounded-xl bg-white font-medium"
                />
              </label>

              <label className="block text-sm font-bold text-slate-700">
                Street Address
                <input
                  required
                  type="text"
                  value={branchAddress}
                  onChange={e => setBranchAddress(e.target.value)}
                  placeholder="e.g. 410 Harbor Boulevard"
                  className="mt-1 w-full min-h-[44px] px-3 py-2 border border-slate-200 rounded-xl bg-white font-medium"
                />
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="block text-sm font-bold text-slate-700">
                  City
                  <input
                    required
                    type="text"
                    value={branchCity}
                    onChange={e => setBranchCity(e.target.value)}
                    placeholder="e.g. Newark"
                    className="mt-1 w-full min-h-[44px] px-3 py-2 border border-slate-200 rounded-xl bg-white font-medium"
                  />
                </label>
                <label className="block text-sm font-bold text-slate-700">
                  State / Province
                  <input
                    required
                    type="text"
                    value={branchState}
                    onChange={e => setBranchState(e.target.value)}
                    placeholder="e.g. NJ"
                    className="mt-1 w-full min-h-[44px] px-3 py-2 border border-slate-200 rounded-xl bg-white font-medium"
                  />
                </label>
              </div>

              {scope.hasChurchBranchAccess && (
                <label className="flex items-center gap-2.5 text-sm font-bold text-slate-700 pt-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={branchIsMain}
                    onChange={e => setBranchIsMain(e.target.checked)}
                    className="w-4 h-4 accent-indigo-600 rounded"
                  />
                  <span>Designate as Main HQ Branch</span>
                </label>
              )}
            </div>

            <div className="p-4 sm:p-6 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2 shrink-0">
              <button
                type="button"
                disabled={saving}
                onClick={() => setShowBranchModal(false)}
                className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 text-sm font-bold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="min-h-[44px] px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-extrabold cursor-pointer disabled:opacity-50"
              >
                {saving ? 'Saving…' : editingBranch ? 'Save Branch' : 'Create Branch'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Assign Branch Leadership Modal */}
      {leadershipTargetBranch && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 backdrop-blur-[1px] p-0 sm:p-4"
          onClick={() => { if (!saving) setLeadershipTargetBranch(null); }}
        >
          <form
            role="dialog"
            aria-modal="true"
            aria-labelledby="assign-branch-leader-title"
            onSubmit={handleAssignBranchLeader}
            onClick={e => e.stopPropagation()}
            className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl border border-slate-200 shadow-2xl overflow-hidden"
          >
            <div className="p-4 sm:p-6 border-b border-slate-200 flex items-start justify-between gap-3">
              <div>
                <h3 id="assign-branch-leader-title" className="text-lg font-black text-slate-900">
                  Assign Branch Leadership
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Branch scope: <strong className="text-slate-800">{leadershipTargetBranch.name}</strong>
                </p>
              </div>
              <button
                type="button"
                disabled={saving}
                onClick={() => setLeadershipTargetBranch(null)}
                className="p-2 text-slate-400 hover:text-slate-700 rounded-xl cursor-pointer"
                aria-label="Close modal"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-4 sm:p-6 space-y-4">
              {leaderModalError && (
                <div role="alert" className="p-3 rounded-xl bg-rose-50 text-rose-700 border border-rose-200 text-xs font-semibold">
                  {leaderModalError}
                </div>
              )}

              <label className="block text-sm font-bold text-slate-700">
                Member Profile
                <select
                  required
                  value={leaderProfileId}
                  onChange={e => setLeaderProfileId(e.target.value)}
                  className="mt-1 w-full min-h-[44px] px-3 py-2 border border-slate-200 rounded-xl bg-white font-medium"
                >
                  <option value="">Select member</option>
                  {profiles.map(member => (
                    <option key={member.id} value={member.id}>
                      {member.first_name} {member.last_name} ({member.email || 'Directory profile'})
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-sm font-bold text-slate-700">
                Leadership Role
                <select
                  required
                  value={leaderRoleId}
                  onChange={e => setLeaderRoleId(e.target.value)}
                  className="mt-1 w-full min-h-[44px] px-3 py-2 border border-slate-200 rounded-xl bg-white font-medium"
                >
                  <option value="">Select role</option>
                  {assignableLeadershipRoles.map(role => (
                    <option key={role.id} value={role.id}>
                      {formatRoleName(role.name)}
                    </option>
                  ))}
                </select>
              </label>

              {!scope.hasChurchRoleAccess && (
                <p className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-xl p-3">
                  Your district assignment permits appointing operational branch roles (Pastor, Finance Officer, Leader, Worker, Member) for branches in your district.
                </p>
              )}
            </div>

            <div className="p-4 sm:p-6 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => setLeadershipTargetBranch(null)}
                className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 text-sm font-bold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving || !leaderProfileId || !leaderRoleId}
                className="min-h-[44px] px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-extrabold cursor-pointer disabled:opacity-50"
              >
                {saving ? 'Assigning…' : 'Assign Branch Leader'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
