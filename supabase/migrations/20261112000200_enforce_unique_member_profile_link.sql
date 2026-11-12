-- Enforce one church membership record per linked portal profile.
-- Standalone members remain valid because NULL profile_id values are not indexed.
DO $$
BEGIN
  IF EXISTS (
    SELECT profile_id
    FROM public.members
    WHERE profile_id IS NOT NULL
    GROUP BY profile_id
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot enforce unique member profile links: duplicate profile_id values exist in public.members. Resolve duplicates before applying this migration.';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_members_profile_id_unique
  ON public.members(profile_id)
  WHERE profile_id IS NOT NULL;
