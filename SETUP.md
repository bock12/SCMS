
# FaithConnect Setup Guide

## 1. Database Configuration
1. Go to your Supabase Dashboard.
2. Open the **SQL Editor**.
3. Copy the content of `schema.sql` into a new query.
4. Run the query to create tables, enums, RLS policies, and RPC functions.

## 2. Storage Buckets
Create the following buckets in Supabase Storage:
- `avatars`: Public access (for user profile pictures).
- `thumbnails`: Public access (for stream thumbnails).
- `private-videos`: Private access (for archived services and private streaming).

## 3. Edge Functions
Deploy the functions located in `edge_functions.ts` (conceptually):
1. Use Supabase CLI: `supabase functions deploy stream-playback-url`
2. Use Supabase CLI: `supabase functions deploy stream-admin`
3. Set secrets for the edge functions:
   ```bash
   supabase secrets set SB_URL=your_url
   supabase secrets set SB_SERVICE_ROLE_KEY=your_key
   ```

## 4. Frontend Environment Variables
Update `supabaseClient.ts` with your project URL and Anon Key.

## 5. Deployment
Build and host the React application using your preferred provider (Vercel, Netlify, or Supabase Hosting).
