# SCMS / FaithConnect setup

## 1. Development modes

The application continues to use its local mock database and mock authentication by default. This preserves the demonstration experience and does not require a Supabase project.

A separate Supabase client is available for controlled online integration and authentication testing. It is not yet the application's default data backend. Do not assume that existing screens or mock-auth sessions are protected by Supabase Row Level Security.

## 2. Configure an online Supabase project

1. Create or select a Supabase project.
2. In **Project Settings → API**, copy the Project URL and the publishable/anon client key.
3. Copy `.env.example` to `.env.local`.
4. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env.local`.
5. Keep `VITE_SUPABASE_INTEGRATION=disabled` until the specific module has been migrated and tested. To enable the explicitly exported online client for integration work, set `VITE_SUPABASE_INTEGRATION=enabled`.
6. Restart the Vite development server after changing environment variables.

Only a public/publishable client key belongs in frontend environment variables. **Never put a Supabase service-role key or database password in a VITE_ variable, browser code, or a committed file.**

The online client is exported from `supabaseIntegration.ts` as `supabaseDataClient`. When configuration is missing it is `null`; check `isSupabaseConfigured` before using it. Its authentication session is separate from the existing mock-auth session.

## 3. Database migrations

Apply the SQL migrations in `supabase/migrations` to the online project in filename order, using the Supabase SQL Editor or a controlled migration process. Review the target project and take a backup before applying schema changes.

The resource and event-survey migration adds RLS policies. The survey submission RPC is designed to run as the calling authenticated user (not with elevated service-role privileges). It must be tested with real Supabase users linked to active member records before member survey submissions are considered production-ready.

## 4. Storage and Edge Functions

Create storage buckets only when the corresponding feature is ready and its access policies have been reviewed. Keep private media in private buckets.

Deploy Edge Functions through the Supabase CLI when required. Store service-role credentials only as server-side Edge Function secrets; never expose them to the browser.

## 5. Current integration status

- Mock database and mock authentication remain the default application experience.
- A separately configured online Supabase client is available for integration work.
- Existing application services have not yet been migrated wholesale to the online database.
- Supabase migrations must still be applied and verified against the actual project.
- Do not mark database integration or RLS verification complete based solely on a successful frontend build.
