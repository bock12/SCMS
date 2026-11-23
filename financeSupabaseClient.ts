import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase as mockSupabase } from './supabaseClient';
import {
  isSupabaseConfigured,
  supabaseDataClient
} from './supabaseIntegration';

const integrationMode = (import.meta.env.VITE_SUPABASE_INTEGRATION || '').trim().toLowerCase();
const integrationEnabled = integrationMode === 'finance';

export const isFinanceSupabaseConfigured = Boolean(
  isSupabaseConfigured && integrationEnabled && supabaseDataClient
);
export const isFinanceSupabaseMockMode = integrationMode === 'mock';

/**
 * Finance and future migrated modules share the same real Supabase client.
 * The mock adapter is retained only for explicitly selected mock development.
 */
export const financeSupabase: SupabaseClient = isFinanceSupabaseConfigured
  ? supabaseDataClient as SupabaseClient
  : mockSupabase as unknown as SupabaseClient;
