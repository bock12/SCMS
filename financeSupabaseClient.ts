import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { supabase as mockSupabase } from './supabaseClient';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim() || 'https://fpzcwetpcwswhxmyeqzh.supabase.co';
const publishableKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_ef4t5uj_SD_eF8D1bWuHkw_EaeLR2kx').trim();
const integrationMode = (import.meta.env.VITE_SUPABASE_INTEGRATION || 'finance').toLowerCase();
const integrationEnabled = integrationMode === 'finance';

export const isFinanceSupabaseConfigured = Boolean(supabaseUrl && publishableKey && integrationEnabled);
export const isFinanceSupabaseMockMode = (import.meta.env.VITE_SUPABASE_INTEGRATION || '').toLowerCase() === 'mock';

/** Real, session-aware client for Finance only. Unmigrated modules keep the mock client. */
export const financeSupabase: SupabaseClient = isFinanceSupabaseConfigured
  ? createClient(supabaseUrl!, publishableKey, {
      auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true, flowType: 'pkce' }
    })
  : mockSupabase as unknown as SupabaseClient;
