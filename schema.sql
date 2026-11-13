-- FaithConnect Church Management System - Database Schema
-- Run this in your Supabase SQL Editor if connecting a dedicated Supabase project

-- 1. ENUMS
DO $$ BEGIN
  CREATE TYPE app_role AS ENUM (
    'super_admin',
    'admin',
    'district_admin',
    'pastor',
    'leader',
    'worker',
    'member',
    'finance_officer'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE member_status AS ENUM (
    'active',
    'inactive',
    'suspended',
    'transferred',
    'archived'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE stream_platform AS ENUM (
    'youtube',
    'facebook',
    'vimeo',
    'custom',
    'supabase'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE stream_privacy AS ENUM (
    'public',
    'members_only',
    'private'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE stream_status AS ENUM (
    'scheduled',
    'live',
    'ended',
    'archived'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 2. DISTRICTS TABLE
CREATE TABLE IF NOT EXISTS public.districts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  region TEXT NOT NULL,
  country TEXT NOT NULL DEFAULT 'United States',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. CHURCH BRANCHES TABLE
CREATE TABLE IF NOT EXISTS public.church_branches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  district_id UUID REFERENCES public.districts(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  address TEXT NOT NULL DEFAULT 'Main Campus',
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  is_main_branch BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. CANONICAL PROFILES / MEMBER DIRECTORY TABLE (Optional auth.users link via auth_user_id)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  branch_id UUID REFERENCES public.church_branches(id) ON DELETE SET NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  gender TEXT CHECK (gender IN ('male', 'female', 'other')) DEFAULT 'other',
  avatar_url TEXT DEFAULT '',
  primary_role app_role DEFAULT 'member',
  status TEXT CHECK (status IN ('active', 'suspended', 'archived')) DEFAULT 'active',
  membership_status member_status DEFAULT 'active',
  membership_date DATE DEFAULT CURRENT_DATE,
  department_name TEXT,
  assigned_department TEXT,
  is_baptized BOOLEAN DEFAULT false,
  baptism_date DATE,
  baptized_by TEXT,
  date_of_birth DATE,
  marital_status TEXT CHECK (marital_status IN ('Single', 'Married', 'Widowed', 'Divorced')),
  marriage_date DATE,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_auth_user_id_unique
  ON public.profiles(auth_user_id)
  WHERE auth_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_membership_status
  ON public.profiles(membership_status);

-- 5. MINISTRIES AND MINISTRY MEMBERSHIP
CREATE TABLE IF NOT EXISTS public.ministries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT DEFAULT '',
  leader_name TEXT DEFAULT '',
  leader_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  meeting_time TEXT DEFAULT '',
  member_count INTEGER NOT NULL DEFAULT 0 CHECK (member_count >= 0),
  category TEXT NOT NULL DEFAULT 'General',
  type TEXT CHECK (type IN ('social_fellowship', 'service_department')) DEFAULT 'service_department',
  roles_and_responsibilities TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ministry_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ministry_id UUID NOT NULL REFERENCES public.ministries(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role_title TEXT NOT NULL DEFAULT 'Team Member',
  duty TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK (status IN ('active', 'on_leave', 'in_training', 'inactive')) DEFAULT 'active',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  UNIQUE (ministry_id, member_id)
);

CREATE INDEX IF NOT EXISTS idx_ministry_members_ministry_id ON public.ministry_members(ministry_id);
CREATE INDEX IF NOT EXISTS idx_ministry_members_member_id ON public.ministry_members(member_id);

-- 6. MEMBER TRANSFERS TABLE
CREATE TABLE IF NOT EXISTS public.member_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  from_branch_id UUID NOT NULL REFERENCES public.church_branches(id),
  to_branch_id UUID NOT NULL REFERENCES public.church_branches(id),
  status TEXT CHECK (status IN ('pending', 'approved', 'rejected')) DEFAULT 'pending',
  request_date TIMESTAMPTZ DEFAULT now(),
  notes TEXT DEFAULT ''
);

-- 7. STREAMS TABLE
CREATE TABLE IF NOT EXISTS public.streams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID REFERENCES public.church_branches(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  platform stream_platform DEFAULT 'youtube',
  privacy stream_privacy DEFAULT 'public',
  status stream_status DEFAULT 'scheduled',
  embed_url TEXT DEFAULT '',
  thumbnail_url TEXT DEFAULT '',
  scheduled_start TIMESTAMPTZ NOT NULL,
  view_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 8. STREAM CHAT MESSAGES
CREATE TABLE IF NOT EXISTS public.stream_chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stream_id UUID NOT NULL REFERENCES public.streams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 9. STREAM CREDENTIALS (RTMP Keys)
CREATE TABLE IF NOT EXISTS public.stream_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID NOT NULL REFERENCES public.church_branches(id) ON DELETE CASCADE,
  rtmp_server TEXT DEFAULT 'rtmp://live.faithconnect.church/live',
  stream_key TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 10. EVENTS TABLE
CREATE TABLE IF NOT EXISTS public.events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID REFERENCES public.church_branches(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  category TEXT NOT NULL DEFAULT 'Worship Service',
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  location TEXT DEFAULT 'Main Sanctuary',
  is_virtual BOOLEAN DEFAULT false,
  virtual_link TEXT DEFAULT '',
  featured_image TEXT DEFAULT '',
  organizer_name TEXT DEFAULT 'Grace Cathedral Leadership',
  target_audience TEXT DEFAULT 'All Congregation',
  registration_required BOOLEAN DEFAULT false,
  max_attendees INTEGER DEFAULT 100,
  registered_count INTEGER DEFAULT 0,
  status TEXT CHECK (status IN ('upcoming', 'ongoing', 'completed', 'cancelled')) DEFAULT 'upcoming',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 11. EVENT REGISTRATIONS TABLE
CREATE TABLE IF NOT EXISTS public.event_registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  member_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  member_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT DEFAULT '',
  registered_at TIMESTAMPTZ DEFAULT now(),
  checked_in_at TIMESTAMPTZ,
  status TEXT CHECK (
    status IN ('confirmed', 'cancelled', 'waitlist', 'checked_in', 'absent', 'attended')
  ) DEFAULT 'confirmed'
);

-- 12. ROW LEVEL SECURITY (RLS) POLICIES
ALTER TABLE public.districts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.church_branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.streams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stream_chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stream_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_registrations ENABLE ROW LEVEL SECURITY;

-- Allow public read access to districts, branches, public streams, events
CREATE POLICY "Public read districts" ON public.districts FOR SELECT USING (true);
CREATE POLICY "Public read branches" ON public.church_branches FOR SELECT USING (true);
CREATE POLICY "Public read streams" ON public.streams FOR SELECT USING (true);
CREATE POLICY "Public read profiles" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Public read events" ON public.events FOR SELECT USING (true);
CREATE POLICY "Public read event registrations" ON public.event_registrations FOR SELECT USING (true);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = auth_user_id);
CREATE POLICY "Public read chat messages" ON public.stream_chat_messages FOR SELECT USING (true);
CREATE POLICY "Authenticated users can send chat messages" ON public.stream_chat_messages FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can read transfers" ON public.member_transfers FOR SELECT USING (auth.role() = 'authenticated');

-- 13. Explicit portal identity linking
-- A portal account may link to an existing directory person only when a trusted
-- server-side provisioning flow sets auth.users.raw_app_meta_data.provisioned_profile_id.
-- raw_app_meta_data is controlled by the Supabase service role; client-editable
-- user_metadata and matching email addresses are never sufficient authorization.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_profile_id UUID;
BEGIN
  IF COALESCE(NEW.raw_app_meta_data->>'provisioned_profile_id', '') = '' THEN
    -- Unprovisioned sign-ups remain unlinked and cannot access the member portal.
    RETURN NEW;
  END IF;

  BEGIN
    v_profile_id := (NEW.raw_app_meta_data->>'provisioned_profile_id')::UUID;
  EXCEPTION
    WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'Invalid provisioned profile reference.'
        USING ERRCODE = '22023';
  END;

  UPDATE public.profiles
  SET auth_user_id = NEW.id
  WHERE id = v_profile_id
    AND auth_user_id IS NULL
    AND lower(btrim(email)) = lower(btrim(COALESCE(NEW.email, '')));

  IF NOT FOUND THEN
    RAISE EXCEPTION 'The requested directory person is unavailable for portal linking.'
      USING ERRCODE = '23505';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM anon, authenticated;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
