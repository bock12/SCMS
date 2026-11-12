import { createClient } from '@supabase/supabase-js';

/**
 * Isolated online Supabase connection for controlled integration work.
 *
 * The application's existing `supabase` export remains the local mock
 * database/authentication adapter. Do not treat mock sessions as Supabase
 * sessions: Supabase RLS requires a real authenticated Supabase user.
 */
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim() ?? '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? '';

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);
export const supabaseIntegrationEnabled =
  import.meta.env.VITE_SUPABASE_INTEGRATION?.trim().toLowerCase() === 'enabled';

if (supabaseIntegrationEnabled && !isSupabaseConfigured) {
  console.warn(
    'Supabase integration is enabled, but VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is missing.'
  );
}

/**
 * Uses only the public/publishable anon key. Authorization must be enforced
 * by Supabase Auth and database RLS, never by trusting client-side role data.
 */
export const supabaseDataClient = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: 'scms_supabase_auth_v1'
      }
    })
  : null;

export function requireSupabaseDataClient() {
  if (!supabaseIntegrationEnabled) {
    throw new Error('Supabase integration is disabled. Set VITE_SUPABASE_INTEGRATION=enabled to enable it.');
  }
  if (!supabaseDataClient) {
    throw new Error('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
  }
  return supabaseDataClient;
}
