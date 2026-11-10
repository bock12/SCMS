-- Expand church membership records to hold member-specific details.
-- Login credentials, passwords and application roles remain in public.profiles/auth.
ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS avatar_url TEXT,
  ADD COLUMN IF NOT EXISTS is_baptized BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS baptism_date DATE,
  ADD COLUMN IF NOT EXISTS baptized_by TEXT,
  ADD COLUMN IF NOT EXISTS date_of_birth DATE,
  ADD COLUMN IF NOT EXISTS marital_status TEXT,
  ADD COLUMN IF NOT EXISTS marriage_date DATE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'members_marital_status_check'
      AND conrelid = 'public.members'::regclass
  ) THEN
    ALTER TABLE public.members
      ADD CONSTRAINT members_marital_status_check
      CHECK (marital_status IS NULL OR marital_status IN ('Single', 'Married', 'Widowed', 'Divorced'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_members_profile_id
  ON public.members(profile_id)
  WHERE profile_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_members_status
  ON public.members(status);
