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
  const [state, setState] = useState<PermissionResolutionState>({
    resolution: null,
    loading: Boolean(profileId),
    error: null
  });

  useEffect(() => {
    let active = true;
    if (!profileId) {
      setState({ resolution: null, loading: false, error: null });
      return () => { active = false; };
    }

    setState({ resolution: null, loading: true, error: null });
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
  }, [profileId, branchId]);

  return state;
}
