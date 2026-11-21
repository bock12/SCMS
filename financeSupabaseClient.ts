import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { supabase as mockSupabase } from './supabaseClient';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const publishableKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();
const integrationEnabled = (import.meta.env.VITE_SUPABASE_INTEGRATION || '').toLowerCase() === 'finance';

export const isFinanceSupabaseConfigured = Boolean(supabaseUrl && publishableKey && integrationEnabled);

/** Real, session-aware client for Finance only. Unmigrated modules keep the mock client. */
export const financeSupabase: SupabaseClient = isFinanceSupabaseConfigured
  ? createClient(supabaseUrl!, publishableKey, {
      auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true, flowType: 'pkce' }
    })
  : mockSupabase as unknown as SupabaseClient;
