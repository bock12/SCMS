-- Phase 2 security: require explicit trusted auth-to-person linking.
-- This is a forward-only migration. Do not run until the deployed schema baseline
-- and migration history have been verified against the target Supabase project.
--
-- A trusted server-side provisioning operation must set
-- auth.users.raw_app_meta_data.provisioned_profile_id to the exact canonical
-- public.profiles.id. Email equality alone is never authorization to claim a person.
--
-- Unprovisioned auth users are deliberately left without a directory identity;
-- the application auth resolver must reject them. This migration does not create
-- directory records for public sign-ups and does not provision users itself.

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

-- Trigger invocation does not require clients to call this function directly.
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM anon, authenticated;

-- Keep the existing trigger attached to auth.users; CREATE OR REPLACE FUNCTION
-- changes its implementation without introducing a second trigger.
