import { useEffect, useState } from 'react';
import { loadPermissionResolution, type PermissionResolution } from './permissionResolutionService';

export interface PermissionResolutionState {
  resolution: PermissionResolution | null;
  loading: boolean;
  error: string | null;
}

/** Loads scoped, database-backed permissions for UI presentation and navigation. */
export function usePermissionResolution(
  profileId?: string | null,
  branchId?: string | null
): PermissionResolutionState {
  const [refreshTick, setRefreshTick] = useState(0);
  const [state, setState] = useState<PermissionResolutionState>({
    resolution: null,
    loading: Boolean(profileId),
    error: null
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleRefresh = () => setRefreshTick(tick => tick + 1);
    window.addEventListener('role_permissions_updated', handleRefresh);
    window.addEventListener('profile_role_assignments_updated', handleRefresh);
    return () => {
      window.removeEventListener('role_permissions_updated', handleRefresh);
      window.removeEventListener('profile_role_assignments_updated', handleRefresh);
    };
  }, []);

  useEffect(() => {
    let active = true;
    if (!profileId) {
      setState({ resolution: null, loading: false, error: null });
      return () => { active = false; };
    }

    setState(prev => ({ resolution: prev.resolution, loading: prev.resolution === null, error: null }));
    loadPermissionResolution(profileId, branchId)
      .then(resolution => {
        if (active) setState({ resolution, loading: false, error: null });
      })
      .catch(error => {
        if (active) setState({
          resolution: null,
          loading: false,
          error: error instanceof Error ? error.message : 'Unable to load permissions.'
        });
      });

    return () => { active = false; };
  }, [profileId, branchId, refreshTick]);

  return state;
}
