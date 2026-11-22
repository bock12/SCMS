import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  Crown,
  Users,
  ArrowRight,
  ArrowLeft,
  GitBranch,
  LayoutGrid
} from 'lucide-react';
import type { ChurchBranch, District, Profile } from './types';
import {
  getBranchGovernanceData,
  createDistrict,
  updateDistrict,
  deleteDistrict,
  createChurchBranch,
  updateChurchBranch,
  resolveActorBranchGovernanceScope,
  buildDistrictPortalSummaries,
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

  const [portalView, setPortalView] = useState<'portal' | 'hierarchy'>('portal');
  const [searchQuery, setSearchQuery] = useState('');
  const [districtFilter, setDistrictFilter] = useState<string>('all');
  const [confirmRemoveAssignmentId, setConfirmRemoveAssignmentId] = useState<string | null>(null);
  const [confirmDeleteDistrictId, setConfirmDeleteDistrictId] = useState<string | null>(null);
  const workspaceBodyRef = useRef<HTMLDivElement | null>(null);

  // District Modal State (Create / Customize)
  const [showDistrictModal, setShowDistrictModal] = useState(false);
  const [editingDistrict, setEditingDistrict] = useState<District | null>(null);
  const [districtName, setDistrictName] = useState('');
  const [districtRegion, setDistrictRegion] = useState('');
  const [districtCountry, setDistrictCountry] = useState('United States');
  const [districtDescription, setDistrictDescription] = useState('');
  const [districtHqBranchId, setDistrictHqBranchId] = useState('');
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

  const districtPortalSummaries = useMemo(
    () =>
      buildDistrictPortalSummaries({
        districts,
        branches,
        profiles,
        assignments,
        roles
      }),
    [assignments, branches, districts, profiles, roles]
  );

  const filteredDistrictPortalSummaries = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return districtPortalSummaries.filter(summary => {
      if (districtFilter !== 'all' && summary.district.id !== districtFilter) return false;
      if (!query) return true;
      const inDistrict =
        summary.district.name.toLowerCase().includes(query) ||
        summary.district.region.toLowerCase().includes(query) ||
        summary.district.country.toLowerCase().includes(query) ||
        (summary.district.description || '').toLowerCase().includes(query);
      const inOverseers = summary.overseerNames.some(name => name.toLowerCase().includes(query));
      const inBranches = summary.branchSummaries.some(
        bs =>
          bs.branch.name.toLowerCase().includes(query) ||
          bs.branch.city.toLowerCase().includes(query) ||
          bs.branch.state.toLowerCase().includes(query)
      );
      return inDistrict || inOverseers || inBranches;
    });
  }, [districtFilter, districtPortalSummaries, searchQuery]);

  const stats = useMemo(() => {
    const branchIdsWithPastor = new Set(
      activeAssignments
        .filter(a => a.scope_type === 'branch' && a.branch_id && roleById.get(a.role_id)?.name === 'pastor')
        .map(a => a.branch_id as string)
    );
    const totalBranchLeaders = activeAssignments.filter(a => a.scope_type === 'branch' && a.branch_id).length;
    const totalBranchMembers = districtPortalSummaries.reduce((sum, s) => sum + s.totalMembers, 0);
    const designatedHqCount = districtPortalSummaries.filter(s => Boolean(s.hqBranch)).length;
    return {
      districtCount: districts.length,
      branchCount: branches.length,
      branchesWithPastor: branchIdsWithPastor.size,
      totalBranchLeaders,
      totalBranchMembers,
      designatedHqCount
    };
  }, [activeAssignments, branches.length, districtPortalSummaries, districts.length, roleById]);

  const openDistrictHierarchy = (districtId: string) => {
    setDistrictFilter(districtId);
    setSearchQuery('');
    setPortalView('hierarchy');
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    requestAnimationFrame(() => {
      workspaceBodyRef.current?.scrollIntoView({
        behavior: prefersReducedMotion ? 'auto' : 'smooth',
        block: 'nearest'
      });
    });
  };

  const openCreateDistrict = () => {
    setEditingDistrict(null);
    setDistrictName('');
    setDistrictRegion('');
    setDistrictCountry('United States');
    setDistrictDescription('');
    setDistrictHqBranchId('');
    setDistrictModalError(null);
    setShowDistrictModal(true);
  };

  const openEditDistrict = (district: District) => {
    const currentHq = branches.find(b => b.district_id === district.id && b.is_main_branch);
    setEditingDistrict(district);
    setDistrictName(district.name);
    setDistrictRegion(district.region);
    setDistrictCountry(district.country);
    setDistrictDescription(district.description || '');
    setDistrictHqBranchId(currentHq?.id || '');
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
      if (editingDistrict) {
        const updated = await updateDistrict({
          id: editingDistrict.id,
          name: districtName,
          region: districtRegion,
          country: districtCountry,
          description: districtDescription,
          hq_branch_id: scope.hasChurchBranchAccess ? (districtHqBranchId || null) : undefined,
          update_hq: scope.hasChurchBranchAccess
        });
        setShowDistrictModal(false);
        setNotice(`Customized district "${updated.name}".`);
      } else {
        const created = await createDistrict({
          name: districtName,
          region: districtRegion,
          country: districtCountry,
          description: districtDescription
        });
        setShowDistrictModal(false);
        setNotice(`Created district "${created.name}".`);
      }
      await loadData(true);
    } catch (cause) {
      setDistrictModalError(cause instanceof Error ? cause.message : 'Unable to save district.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteDistrict = async (district: District) => {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await deleteDistrict(district.id);
      setConfirmDeleteDistrictId(null);
      if (districtFilter === district.id) {
        setDistrictFilter('all');
      }
      setNotice(`Deleted district "${district.name}".`);
      await loadData(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to delete district.');
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
          <div className="text-xs font-bold text-slate-500">Districts</div>
          <div className="text-2xl font-black text-slate-900 mt-1 tabular-nums">{stats.districtCount}</div>
          <div className="text-xs text-slate-500 mt-0.5 tabular-nums">
            {stats.designatedHqCount} with District HQ
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-4">
          <div className="text-xs font-bold text-slate-500">Church Branches</div>
          <div className="text-2xl font-black text-slate-900 mt-1 tabular-nums">{stats.branchCount}</div>
          <div className="text-xs text-slate-500 mt-0.5 tabular-nums">
            {stats.branchesWithPastor} / {stats.branchCount} with Pastor
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-4">
          <div className="text-xs font-bold text-slate-500">Members Across Branches</div>
          <div className="text-2xl font-black text-emerald-700 mt-1 tabular-nums">
            {stats.totalBranchMembers}
          </div>
          <div className="text-xs text-slate-500 mt-0.5">Active district congregation</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-4">
          <div className="text-xs font-bold text-slate-500">Branch Leadership</div>
          <div className="text-2xl font-black text-indigo-700 mt-1 tabular-nums">{stats.totalBranchLeaders}</div>
          <div className="text-xs text-slate-500 mt-0.5">Active scoped appointments</div>
        </div>
      </div>

      {error && <div role="alert" className="p-3 rounded-xl bg-rose-50 text-rose-700 border border-rose-200 text-sm">{error}</div>}
      {notice && <div role="status" className="p-3 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 text-sm">{notice}</div>}

      {/* Internal Portal View Switcher & Filter Toolbar */}
      <div
        ref={workspaceBodyRef}
        className="bg-white border border-slate-200 rounded-2xl p-3.5 sm:p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3"
      >
        <div
          role="tablist"
          aria-label="Branches and Districts workspace views"
          className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-xl w-full sm:w-auto shrink-0"
        >
          <button
            type="button"
            role="tab"
            aria-selected={portalView === 'portal'}
            onClick={() => setPortalView('portal')}
            className={`flex-1 sm:flex-initial min-h-[40px] px-3.5 py-2 rounded-lg text-xs sm:text-sm font-bold inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
              portalView === 'portal'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <LayoutGrid size={15} />
            <span>District Portal</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={portalView === 'hierarchy'}
            onClick={() => setPortalView('hierarchy')}
            className={`flex-1 sm:flex-initial min-h-[40px] px-3.5 py-2 rounded-lg text-xs sm:text-sm font-bold inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
              portalView === 'hierarchy'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <GitBranch size={15} />
            <span>Branch Hierarchy</span>
          </button>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-3 flex-1 lg:justify-end">
          <label className="relative block w-full sm:flex-1 sm:max-w-xs">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder={
                portalView === 'portal'
                  ? 'Search district, HQ branch, or city…'
                  : 'Search branch, city, or assigned leader…'
              }
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
              className="w-full sm:w-56 min-h-[44px] px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-800"
            >
              <option value="all">All Districts ({districts.length})</option>
              {districts.map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Internal District Portal View */}
      {portalView === 'portal' && (
        <div role="tabpanel" aria-label="District Portal Summary" className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="text-base font-extrabold text-slate-900">District Summary Portal</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Compare member distribution, designated District HQ campuses, and open each district&apos;s branch hierarchy.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setDistrictFilter('all');
                setPortalView('hierarchy');
              }}
              className="self-start sm:self-auto text-xs font-bold text-indigo-700 hover:text-indigo-800 inline-flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <span>Explore Full Branch Hierarchy</span>
              <ArrowRight size={14} />
            </button>
          </div>

          {filteredDistrictPortalSummaries.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-3">
              <p className="text-sm font-semibold text-slate-700">
                {districts.length === 0
                  ? 'No districts have been established yet.'
                  : 'No districts match your current search or filter.'}
              </p>
              {districts.length === 0 && scope.canCreateDistrict ? (
                <button
                  type="button"
                  onClick={openCreateDistrict}
                  className="min-h-[40px] px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus size={14} /> Create First District
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setDistrictFilter('all');
                  }}
                  className="min-h-[40px] px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs cursor-pointer"
                >
                  Reset Filters
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              {filteredDistrictPortalSummaries.map(summary => {
                const { district, hqBranch, branchSummaries } = summary;
                const canManageThisDistrict =
                  scope.hasChurchBranchAccess || scope.manageableDistrictIds.includes(district.id);
                const hqBranchSummary = hqBranch
                  ? branchSummaries.find(bs => bs.branch.id === hqBranch.id)
                  : undefined;

                return (
                  <article
                    key={district.id}
                    className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col justify-between gap-4 min-w-0"
                  >
                    {/* Card Header & Quick-Action Link */}
                    <div className="space-y-4">
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h4 className="text-lg font-extrabold text-slate-900 truncate">
                            {district.name}
                          </h4>
                          <div className="text-xs text-slate-500 mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                            <span>{district.region}, {district.country}</span>
                            <span aria-hidden="true">·</span>
                            <span>
                              Oversight:{' '}
                              {summary.overseerNames.length > 0
                                ? summary.overseerNames.join(', ')
                                : 'No district admin assigned'}
                            </span>
                          </div>
                          {district.description && (
                            <p className="text-xs text-slate-600 mt-1.5 line-clamp-2">
                              {district.description}
                            </p>
                          )}
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {canManageThisDistrict && (
                            <button
                              type="button"
                              onClick={() => openEditDistrict(district)}
                              aria-label={`Customize ${district.name}`}
                              title={`Customize ${district.name}`}
                              className="min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                            >
                              <Edit3 size={13} /> Customize
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => openDistrictHierarchy(district.id)}
                            className="min-h-[40px] px-3.5 py-2 rounded-xl border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                          >
                            <span>Manage Branch Hierarchy</span>
                            <ArrowRight size={14} />
                          </button>
                        </div>
                      </div>

                      {/* District Member & Coverage Summary Strip */}
                      <div className="grid grid-cols-3 gap-3 py-3 border-t border-b border-slate-100">
                        <div>
                          <div className="text-xs font-semibold text-slate-500 flex items-center gap-1.5">
                            <Users size={13} className="text-slate-400 shrink-0" />
                            <span>Total Members</span>
                          </div>
                          <div className="text-xl font-black text-slate-900 mt-1 tabular-nums">
                            {summary.totalMembers}
                          </div>
                          <div className="text-xs text-slate-500 mt-0.5 tabular-nums">
                            {summary.activeMembers !== summary.totalMembers
                              ? `${summary.activeMembers} active across branches`
                              : `Across ${summary.totalBranches} ${summary.totalBranches === 1 ? 'branch' : 'branches'}`}
                          </div>
                        </div>

                        <div>
                          <div className="text-xs font-semibold text-slate-500 flex items-center gap-1.5">
                            <Building2 size={13} className="text-slate-400 shrink-0" />
                            <span>Branches</span>
                          </div>
                          <div className="text-xl font-black text-slate-900 mt-1 tabular-nums">
                            {summary.totalBranches}
                          </div>
                          <div className="text-xs text-slate-500 mt-0.5 tabular-nums">
                            {summary.branchesWithPastor} w/ Pastor
                          </div>
                        </div>

                        <div>
                          <div className="text-xs font-semibold text-slate-500 flex items-center gap-1.5">
                            <ShieldCheck size={13} className="text-slate-400 shrink-0" />
                            <span>Leaders</span>
                          </div>
                          <div className="text-xl font-black text-indigo-700 mt-1 tabular-nums">
                            {summary.totalBranchLeaders}
                          </div>
                          <div className="text-xs text-slate-500 mt-0.5">
                            Scoped appointments
                          </div>
                        </div>
                      </div>

                      {/* Visual HQ Branch Indicator */}
                      {hqBranch ? (
                        <div className="flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl bg-amber-50/75 border border-amber-200/80">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                              <Crown size={16} />
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs font-extrabold text-amber-800">
                                  District HQ
                                </span>
                                <span className="text-sm font-extrabold text-slate-900 truncate">
                                  {hqBranch.name}
                                </span>
                              </div>
                              <div className="text-xs text-slate-600 truncate">
                                {hqBranch.address}, {hqBranch.city}, {hqBranch.state}
                              </div>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="text-xs font-bold text-amber-900 tabular-nums whitespace-nowrap">
                              {hqBranchSummary?.memberCount ?? 0}{' '}
                              {(hqBranchSummary?.memberCount ?? 0) === 1 ? 'member' : 'members'}
                            </div>
                            <div className="text-[11px] text-amber-700 tabular-nums whitespace-nowrap">
                              {hqBranchSummary?.leaderCount ?? 0}{' '}
                              {(hqBranchSummary?.leaderCount ?? 0) === 1 ? 'leader' : 'leaders'}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200/80">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-8 h-8 rounded-lg bg-slate-200/70 text-slate-500 flex items-center justify-center shrink-0">
                              <Crown size={15} />
                            </div>
                            <div className="min-w-0">
                              <div className="text-xs font-bold text-slate-700">
                                No District HQ Designated
                              </div>
                              <div className="text-xs text-slate-500">
                                {summary.totalBranches > 0
                                  ? 'Designate one branch as this district’s HQ.'
                                  : 'Add a branch first to assign a District HQ.'}
                              </div>
                            </div>
                          </div>
                          {scope.hasChurchBranchAccess && summary.totalBranches > 0 && (
                            <button
                              type="button"
                              onClick={() => openEditDistrict(district)}
                              className="min-h-[36px] px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 font-bold text-xs whitespace-nowrap shrink-0 cursor-pointer"
                            >
                              Assign HQ
                            </button>
                          )}
                        </div>
                      )}

                      {/* Compact Branch Hierarchy Breakdown */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-slate-600">
                            Branch Roster ({branchSummaries.length})
                          </span>
                          <span className="text-slate-400">Members per branch</span>
                        </div>

                        {branchSummaries.length === 0 ? (
                          <div className="py-3 flex items-center justify-between gap-3 border-t border-slate-100 text-xs text-slate-500">
                            <span>No branches established in this district yet.</span>
                            {canManageThisDistrict && (
                              <button
                                type="button"
                                onClick={() => openCreateBranch(district.id)}
                                className="font-bold text-indigo-700 hover:text-indigo-800 whitespace-nowrap shrink-0 cursor-pointer"
                              >
                                + Add Branch
                              </button>
                            )}
                          </div>
                        ) : (
                          <ul className="divide-y divide-slate-100 border-t border-slate-100">
                            {branchSummaries.map(bs => {
                              const sharePercent =
                                summary.totalMembers > 0
                                  ? Math.round((bs.memberCount / summary.totalMembers) * 100)
                                  : 0;
                              return (
                                <li
                                  key={bs.branch.id}
                                  className="py-2 flex items-center justify-between gap-3 text-xs"
                                >
                                  <div className="flex items-center gap-2 min-w-0">
                                    {bs.branch.is_main_branch ? (
                                      <Crown
                                        size={13}
                                        className="text-amber-600 shrink-0"
                                        aria-label="District HQ branch"
                                      />
                                    ) : (
                                      <MapPin size={13} className="text-slate-400 shrink-0" />
                                    )}
                                    <span className="font-semibold text-slate-800 truncate">
                                      {bs.branch.name}
                                    </span>
                                    {bs.branch.is_main_branch && (
                                      <span className="text-[11px] font-bold text-amber-700 shrink-0">
                                        HQ
                                      </span>
                                    )}
                                    <span className="text-slate-400 hidden sm:inline truncate">
                                      · {bs.branch.city}, {bs.branch.state}
                                    </span>
                                  </div>

                                  <div className="flex items-center gap-2.5 shrink-0">
                                    <div
                                      className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden hidden sm:block"
                                      aria-hidden="true"
                                    >
                                      <div
                                        className={`h-full rounded-full ${
                                          bs.branch.is_main_branch ? 'bg-amber-500' : 'bg-indigo-500'
                                        }`}
                                        style={{ width: `${Math.max(sharePercent, bs.memberCount > 0 ? 12 : 0)}%` }}
                                      />
                                    </div>
                                    <span className="font-bold text-slate-700 tabular-nums whitespace-nowrap w-20 text-right">
                                      {bs.memberCount} {bs.memberCount === 1 ? 'member' : 'members'}
                                    </span>
                                  </div>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Detailed Branch Hierarchy View */}
      {portalView === 'hierarchy' && (
        <div role="tabpanel" aria-label="Branch Hierarchy Management" className="space-y-6">
          {districtFilter !== 'all' && (
            <div className="bg-white border border-slate-200 rounded-2xl px-4 py-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs sm:text-sm text-slate-700">
                <GitBranch size={15} className="text-indigo-600 shrink-0" />
                <span>
                  Managing hierarchy for{' '}
                  <strong className="text-slate-900">
                    {districts.find(d => d.id === districtFilter)?.name || 'selected district'}
                  </strong>
                </span>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setDistrictFilter('all')}
                  className="text-xs font-bold text-slate-600 hover:text-slate-900 whitespace-nowrap cursor-pointer"
                >
                  Show All Districts
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDistrictFilter('all');
                    setPortalView('portal');
                  }}
                  className="min-h-[36px] px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold text-xs inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                >
                  <ArrowLeft size={13} /> Back to District Portal
                </button>
              </div>
            </div>
          )}

          {/* District Sections & Branch Cards */}
          <div className="space-y-6">
        {visibleDistricts.map(district => {
          const allDistrictBranches = branches.filter(b => b.district_id === district.id);
          const districtHqBranch = allDistrictBranches.find(b => b.is_main_branch) || null;
          const query = searchQuery.trim().toLowerCase();
          const districtBranches = allDistrictBranches.filter(b => {
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
          const isConfirmingDistrictDelete = confirmDeleteDistrictId === district.id;

          if (query && districtBranches.length === 0) return null;

          return (
            <section key={district.id} className="space-y-3">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-2.5 border-b border-slate-200">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-base font-extrabold text-slate-900">{district.name}</h3>
                    <span className="text-xs font-semibold text-slate-500 tabular-nums">
                      · {district.region}, {district.country} · {allDistrictBranches.length} {allDistrictBranches.length === 1 ? 'branch' : 'branches'}
                    </span>
                    {districtHqBranch ? (
                      <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-700">
                        <Crown size={12} /> District HQ: {districtHqBranch.name}
                      </span>
                    ) : (
                      <span className="text-xs font-semibold text-slate-400">
                        No District HQ assigned
                      </span>
                    )}
                  </div>
                  {district.description && (
                    <p className="text-xs text-slate-600 mt-1">{district.description}</p>
                  )}
                  <div className="text-xs text-slate-500 mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
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
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => openEditDistrict(district)}
                      className="min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs inline-flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer"
                    >
                      <Edit3 size={14} /> Customize District
                    </button>

                    <button
                      type="button"
                      onClick={() => openCreateBranch(district.id)}
                      className="min-h-[40px] px-3.5 py-2 rounded-xl border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs inline-flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer"
                    >
                      <Plus size={14} /> Add Branch to District
                    </button>

                    {scope.canCreateDistrict && (
                      isConfirmingDistrictDelete ? (
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            disabled={saving}
                            onClick={() => void handleDeleteDistrict(district)}
                            className="min-h-[40px] px-3 py-2 rounded-xl bg-rose-600 text-white font-bold text-xs cursor-pointer disabled:opacity-50"
                          >
                            Confirm Delete
                          </button>
                          <button
                            type="button"
                            disabled={saving}
                            onClick={() => setConfirmDeleteDistrictId(null)}
                            className="min-h-[40px] px-2.5 py-2 rounded-xl border border-slate-200 bg-white text-slate-600 font-semibold text-xs cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          disabled={saving || allDistrictBranches.length > 0}
                          onClick={() => setConfirmDeleteDistrictId(district.id)}
                          aria-label={`Delete district ${district.name}`}
                          title={
                            allDistrictBranches.length > 0
                              ? 'Move or remove all branches before deleting this district'
                              : `Delete ${district.name}`
                          }
                          className="min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-500 hover:text-rose-600 hover:border-rose-200 hover:bg-rose-50 font-bold text-xs inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <Trash2 size={14} /> Delete
                        </button>
                      )
                    )}
                  </div>
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
                                    <Crown size={12} /> District HQ
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
        </div>
      )}

      {/* Create / Customize District Modal */}
      {showDistrictModal && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 backdrop-blur-[1px] p-0 sm:p-4"
          onClick={() => { if (!saving) setShowDistrictModal(false); }}
        >
          <form
            role="dialog"
            aria-modal="true"
            aria-labelledby="district-modal-title"
            onSubmit={handleSaveDistrict}
            onClick={e => e.stopPropagation()}
            className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl border border-slate-200 shadow-2xl overflow-hidden max-h-[90dvh] flex flex-col"
          >
            <div className="p-4 sm:p-6 border-b border-slate-200 flex items-center justify-between shrink-0">
              <h3 id="district-modal-title" className="text-lg font-black text-slate-900">
                {editingDistrict ? 'Customize District' : 'Create District'}
              </h3>
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
            <div className="p-4 sm:p-6 space-y-4 overflow-y-auto">
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
              <label className="block text-sm font-bold text-slate-700">
                Description <span className="text-xs font-normal text-slate-400">(optional)</span>
                <textarea
                  rows={2}
                  value={districtDescription}
                  onChange={e => setDistrictDescription(e.target.value)}
                  placeholder="Regional coverage, parish grouping, or oversight notes"
                  className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-xl bg-white font-medium text-sm resize-y"
                />
              </label>

              {editingDistrict && scope.hasChurchBranchAccess && (() => {
                const candidateBranches = branches.filter(b => b.district_id === editingDistrict.id);
                return (
                  <div className="pt-1 space-y-1.5">
                    <label className="block text-sm font-bold text-slate-700">
                      District HQ Branch
                      <select
                        value={districtHqBranchId}
                        onChange={e => setDistrictHqBranchId(e.target.value)}
                        disabled={candidateBranches.length === 0}
                        className="mt-1 w-full min-h-[44px] px-3 py-2 border border-slate-200 rounded-xl bg-white font-medium disabled:bg-slate-50 disabled:text-slate-400"
                      >
                        <option value="">No HQ designated</option>
                        {candidateBranches.map(b => (
                          <option key={b.id} value={b.id}>
                            {b.name} ({b.city}, {b.state})
                          </option>
                        ))}
                      </select>
                    </label>
                    <p className="text-xs text-slate-500">
                      {candidateBranches.length === 0
                        ? 'Add a branch to this district first to assign its District HQ.'
                        : 'Only one branch per district can be designated as District HQ. Choosing a new branch replaces the previous HQ automatically.'}
                    </p>
                  </div>
                );
              })()}
            </div>
            <div className="p-4 sm:p-6 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2 shrink-0">
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
                {saving ? 'Saving…' : editingDistrict ? 'Save District Changes' : 'Create District'}
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

              {scope.hasChurchBranchAccess && (() => {
                const otherHqBranch = branches.find(
                  b =>
                    b.district_id === branchDistrictId &&
                    b.is_main_branch &&
                    b.id !== editingBranch?.id
                );
                return (
                  <div className="space-y-1.5 pt-1">
                    <label className="flex items-center gap-2.5 text-sm font-bold text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={branchIsMain}
                        onChange={e => setBranchIsMain(e.target.checked)}
                        className="w-4 h-4 accent-indigo-600 rounded"
                      />
                      <span>Designate as District HQ Branch</span>
                    </label>
                    {branchIsMain && otherHqBranch && (
                      <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                        Selecting this transfers District HQ status from <strong>{otherHqBranch.name}</strong> (only one HQ branch per district).
                      </p>
                    )}
                  </div>
                );
              })()}
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
