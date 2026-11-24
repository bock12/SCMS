-- Keep the legacy trusted auth-linking trigger consistent with the
-- canonical portal lifecycle: a newly linked Auth identity is invited, not
-- implicitly active. Email confirmation activates it via the portal trigger.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_profile_id uuid;
BEGIN
  IF COALESCE(NEW.raw_app_meta_data->>'provisioned_profile_id', '') = '' THEN
    RETURN NEW;
  END IF;

  BEGIN
    v_profile_id := (NEW.raw_app_meta_data->>'provisioned_profile_id')::uuid;
  EXCEPTION
    WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'Invalid provisioned profile reference.'
        USING ERRCODE = '22023';
  END;

  UPDATE public.profiles
  SET auth_user_id = NEW.id,
      portal_access_status = 'invited',
      updated_at = now()
  WHERE id = v_profile_id
    AND auth_user_id IS NULL
    AND portal_access_status = 'not_invited'
    AND lower(btrim(email)) = lower(btrim(COALESCE(NEW.email, '')));

  IF NOT FOUND THEN
    RAISE EXCEPTION 'The requested directory person is unavailable for portal linking.'
      USING ERRCODE = '23505';
  END IF;

  RETURN NEW;
END;
$function$;
