-- MIN-INT-001: persist ministry definitions and member participation.
-- Apply to an existing SCMS Supabase database before enabling live ministry roster writes.

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
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  role_title TEXT NOT NULL DEFAULT 'Team Member',
  duty TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK (status IN ('active', 'on_leave', 'in_training', 'inactive')) DEFAULT 'active',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  CONSTRAINT ministry_members_ministry_member_unique UNIQUE (ministry_id, member_id)
);

CREATE INDEX IF NOT EXISTS idx_ministry_members_ministry_id ON public.ministry_members(ministry_id);
CREATE INDEX IF NOT EXISTS idx_ministry_members_member_id ON public.ministry_members(member_id);
