import { createClient } from '@supabase/supabase-js';

/**
 * Shared browser-side Supabase connection for SCMS.
 *
 * This client uses only the public publishable key. Database access is
 * authorized by a real Supabase Auth session and PostgreSQL RLS; the
 * application's mock development identity is never treated as a DB session.
 */
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim() ?? '';
const publishableKey = (
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ||
  import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ||
  ''
);

const integrationMode = import.meta.env.VITE_SUPABASE_INTEGRATION?.trim().toLowerCase() ?? '';
// Database integration and authentication are intentionally independent during development.
// Mock login remains the default until real Supabase Auth is explicitly enabled.
const authMode = import.meta.env.VITE_SUPABASE_AUTH?.trim().toLowerCase() ?? '';
const memberIntegrationMode = import.meta.env.VITE_SUPABASE_MEMBER_INTEGRATION?.trim().toLowerCase() ?? '';
export const isSupabaseConfigured = Boolean(supabaseUrl && publishableKey);
// Keep non-finance modules on the local mock adapter when VITE_SUPABASE_INTEGRATION=finance.
// Full live integration across non-finance modules only activates when set to "enabled".
export const supabaseIntegrationEnabled = integrationMode === 'enabled';
export const supabaseAuthEnabled = authMode === 'enabled';
/**
 * Congregation, member directory, transfers, ministry rosters and leadership
 * use a separate switch so they can move to the live database without silently
 * switching every other application module away from its mock adapter.
 */
export const supabaseMemberIntegrationEnabled = memberIntegrationMode === 'enabled';

if ((supabaseIntegrationEnabled || integrationMode === 'finance' || supabaseMemberIntegrationEnabled) && !isSupabaseConfigured) {
  console.warn(
    'Supabase integration is enabled, but VITE_SUPABASE_URL or a publishable key is missing.'
  );
}

/** One shared client keeps the Supabase Auth session consistent across modules. */
export const supabaseDataClient = isSupabaseConfigured
  ? createClient(supabaseUrl, publishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: 'pkce'
      }
    })
  : null;

export function requireSupabaseDataClient() {
  if (!supabaseIntegrationEnabled) {
    throw new Error(
      'Supabase integration is disabled. Set VITE_SUPABASE_INTEGRATION=enabled to enable it.'
    );
  }
  if (!supabaseDataClient) {
    throw new Error(
      'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.'
    );
  }
  return supabaseDataClient;
}

export function resolveMemberDataClient<T>(mockClient: T): T {
  return (supabaseMemberIntegrationEnabled && supabaseAuthEnabled && supabaseDataClient
    ? supabaseDataClient
    : mockClient) as T;
}

export function resolveDataClient<T>(mockClient: T): T {
  return (supabaseIntegrationEnabled && supabaseAuthEnabled && supabaseDataClient
    ? supabaseDataClient
    : mockClient) as T;
}
