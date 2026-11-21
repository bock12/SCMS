import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ClipboardList, RefreshCw, Search, ShieldCheck } from 'lucide-react';
import { supabase } from './supabaseClient';
import type { ChurchBranch, District, Profile } from './types';
import { getProfileRoleData, type ProfileRoleAssignment, type SystemRole } from './profileRoleAssignmentService';

const formatRoleName = (name: string): string =>
  name
    .split('_')
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

export const AuditLogsAdminTab: React.FC = () => {
  const [assignments, setAssignments] = useState<ProfileRoleAssignment[]>([]);
  const [roles, setRoles] = useState<SystemRole[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [branches, setBranches] = useState<ChurchBranch[]>([]);
  const [districts, setDistricts] = useState<District[]>([]);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadAuditTrail = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const [roleData, profilesRes, branchesRes, districtsRes] = await Promise.all([
        getProfileRoleData(),
        supabase.from('profiles').select('*'),
        supabase.from('church_branches').select('*'),
        supabase.from('districts').select('*')
      ]);
      if (profilesRes.error) throw new Error(profilesRes.error.message);
      if (branchesRes.error) throw new Error(branchesRes.error.message);
      if (districtsRes.error) throw new Error(districtsRes.error.message);
      setRoles(roleData.roles);
      setAssignments(roleData.assignments);
      setProfiles((profilesRes.data || []) as Profile[]);
      setBranches((branchesRes.data || []) as ChurchBranch[]);
      setDistricts((districtsRes.data || []) as District[]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load governance audit records.');
    } finally {
      if (isRefresh) setRefreshing(false);
      else setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAuditTrail(false);
  }, [loadAuditTrail]);

  const profileNameMap = useMemo(() => {
    const map = new Map<string, string>();
    profiles.forEach(p => map.set(p.id, `${p.first_name} ${p.last_name}`.trim()));
    return map;
  }, [profiles]);

  const roleMap = useMemo(() => new Map(roles.map(r => [r.id, r])), [roles]);
  const branchMap = useMemo(() => new Map(branches.map(b => [b.id, b.name])), [branches]);
  const districtMap = useMemo(() => new Map(districts.map(d => [d.id, d.name])), [districts]);

  const filteredEntries = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return [...assignments]
      .sort((a, b) => Date.parse(b.assigned_at || '') - Date.parse(a.assigned_at || ''))
      .filter(entry => {
        if (statusFilter === 'active' && !entry.is_active) return false;
        if (statusFilter === 'inactive' && entry.is_active) return false;
        if (!normalized) return true;
        const memberName = (profileNameMap.get(entry.profile_id) || entry.profile_id).toLowerCase();
        const actorName = (entry.assigned_by_profile_id
          ? profileNameMap.get(entry.assigned_by_profile_id) || entry.assigned_by_profile_id
          : 'system'
        ).toLowerCase();
        const roleName = formatRoleName(roleMap.get(entry.role_id)?.name || 'Unknown role').toLowerCase();
        const scopeLabel = (
          entry.scope_type === 'branch'
            ? branchMap.get(entry.branch_id || '') || 'branch'
            : entry.scope_type === 'district'
            ? districtMap.get(entry.district_id || '') || 'district'
            : 'church-wide'
        ).toLowerCase();
        return (
          memberName.includes(normalized) ||
          actorName.includes(normalized) ||
          roleName.includes(normalized) ||
          scopeLabel.includes(normalized)
        );
      });
  }, [assignments, branchMap, districtMap, profileNameMap, query, roleMap, statusFilter]);

  if (loading) {
    return <div className="p-8 text-center text-slate-500">Loading governance & role audit logs…</div>;
  }

  return (
    <div className="space-y-5 min-w-0 w-full">
      <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
            <ClipboardList size={20} className="text-indigo-600 shrink-0" />
            <span>Governance & Authorization Audit Log</span>
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Review scoped role appointments, deactivations, and administrative oversight trails across church, district, and branch levels.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void loadAuditTrail(true)}
          disabled={refreshing}
          aria-label="Refresh audit log"
          className="min-h-[44px] w-11 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 flex items-center justify-center shrink-0 cursor-pointer disabled:opacity-50"
        >
          <RefreshCw size={16} className={refreshing ? 'animate-spin text-indigo-600' : ''} />
        </button>
      </div>

      {error && <div role="alert" className="p-3 rounded-xl bg-rose-50 text-rose-700 border border-rose-200 text-sm">{error}</div>}

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <label className="relative block w-full sm:max-w-xs">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search member, actor, role, scope…"
              className="w-full min-h-[44px] pl-9 pr-3 py-2 rounded-xl border border-slate-200 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </label>
          <div className="grid grid-cols-3 sm:inline-flex items-center gap-1 p-1 bg-slate-100 rounded-xl w-full sm:w-auto">
            {(['all', 'active', 'inactive'] as const).map(opt => (
              <button
                key={opt}
                type="button"
                onClick={() => setStatusFilter(opt)}
                className={`min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${
                  statusFilter === opt ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {opt === 'all' ? 'All' : opt === 'active' ? 'Active' : 'Inactive'}
              </button>
            ))}
          </div>
        </div>

        {filteredEntries.length === 0 ? (
          <div className="p-6 text-sm text-slate-500">No audit entries match the current filter.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredEntries.map(entry => {
              const memberName = profileNameMap.get(entry.profile_id) || entry.profile_id;
              const actorName = entry.assigned_by_profile_id
                ? profileNameMap.get(entry.assigned_by_profile_id) || entry.assigned_by_profile_id
                : 'System Seed';
              const roleName = formatRoleName(roleMap.get(entry.role_id)?.name || 'Unknown role');
              const scopeName =
                entry.scope_type === 'branch'
                  ? `Branch · ${branchMap.get(entry.branch_id || '') || entry.branch_id}`
                  : entry.scope_type === 'district'
                  ? `District · ${districtMap.get(entry.district_id || '') || entry.district_id}`
                  : 'Church-wide';

              return (
                <div key={entry.id} className="p-4 sm:px-5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-sm">
                  <div className="min-w-0">
                    <div className="font-bold text-slate-900 flex items-center gap-2 flex-wrap">
                      <ShieldCheck size={15} className="text-indigo-600 shrink-0" />
                      <span>{memberName}</span>
                      <span className="text-xs font-semibold text-slate-500">→ {roleName}</span>
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5 flex flex-wrap items-center gap-x-2">
                      <span>Scope: <strong className="text-slate-700">{scopeName}</strong></span>
                      <span>·</span>
                      <span>Assigned by: <strong className="text-slate-700">{actorName}</strong></span>
                      <span>·</span>
                      <span className="tabular-nums">{new Date(entry.assigned_at).toLocaleString()}</span>
                    </div>
                  </div>
                  <span className={`text-xs font-bold shrink-0 ${entry.is_active ? 'text-emerald-700' : 'text-amber-700'}`}>
                    {entry.is_active ? 'Active' : 'Deactivated'}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
