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
export const isSupabaseConfigured = Boolean(supabaseUrl && publishableKey);
export const supabaseIntegrationEnabled =
  integrationMode === 'enabled' || integrationMode === 'finance';

if (supabaseIntegrationEnabled && !isSupabaseConfigured) {
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
      'Supabase integration is disabled. Set VITE_SUPABASE_INTEGRATION=finance (or enabled) to enable it.'
    );
  }
  if (!supabaseDataClient) {
    throw new Error(
      'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.'
    );
  }
  return supabaseDataClient;
}
