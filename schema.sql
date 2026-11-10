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
    'member'
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

-- 4. PROFILES TABLE (Linked with auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES public.church_branches(id) ON DELETE SET NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT DEFAULT '',
  avatar_url TEXT DEFAULT '',
  primary_role app_role DEFAULT 'member',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 5. MEMBERS TABLE
CREATE TABLE IF NOT EXISTS public.members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  branch_id UUID NOT NULL REFERENCES public.church_branches(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  gender TEXT CHECK (gender IN ('male', 'female', 'other')) DEFAULT 'male',
  status member_status DEFAULT 'active',
  membership_date DATE DEFAULT CURRENT_DATE,
  email TEXT,
  phone TEXT,
  avatar_url TEXT,
  is_baptized BOOLEAN DEFAULT false,
  baptism_date DATE,
  baptized_by TEXT,
  date_of_birth DATE,
  marital_status TEXT CHECK (marital_status IN ('Single', 'Married', 'Widowed', 'Divorced')),
  marriage_date DATE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 6. MEMBER TRANSFERS TABLE
CREATE TABLE IF NOT EXISTS public.member_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
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
  member_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT DEFAULT '',
  registered_at TIMESTAMPTZ DEFAULT now(),
  status TEXT CHECK (status IN ('confirmed', 'cancelled', 'attended')) DEFAULT 'confirmed'
);

-- 12. ROW LEVEL SECURITY (RLS) POLICIES
ALTER TABLE public.districts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.church_branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;
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
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Public read chat messages" ON public.stream_chat_messages FOR SELECT USING (true);
CREATE POLICY "Authenticated users can send chat messages" ON public.stream_chat_messages FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can read members" ON public.members FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can read transfers" ON public.member_transfers FOR SELECT USING (auth.role() = 'authenticated');

-- 11. AUTOMATIC PROFILE TRIGGER ON SIGN UP
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, first_name, last_name, email, primary_role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'first_name', 'Faithful'),
    COALESCE(NEW.raw_user_meta_data->>'last_name', 'Member'),
    NEW.email,
    'member'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
