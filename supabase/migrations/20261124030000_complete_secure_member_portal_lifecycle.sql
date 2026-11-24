-- MEM-INT-003: complete secure Member Directory reads and portal lifecycle.
-- Portal provisioning is authorized by the caller's real Auth session and the
-- target member's branch scope. Privileged Auth operations stay in an Edge Function.

CREATE OR REPLACE FUNCTION private.current_profile_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT p.id
  FROM public.profiles AS p
  WHERE p.auth_user_id = (SELECT auth.uid())
    AND p.portal_access_status = 'active'
    AND p.record_status = 'active'
  LIMIT 1;
$function$;

CREATE OR REPLACE FUNCTION private.profile_has_permission(
  p_profile_id uuid,
  p_permission_key text,
  p_branch_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT p_profile_id IS NOT NULL
    AND p_branch_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.profile_role_assignments AS a
      JOIN public.roles AS r ON r.id = a.role_id AND r.is_active
      JOIN public.role_permissions AS rp ON rp.role_id = r.id
      JOIN public.permissions AS perm ON perm.id = rp.permission_id
      JOIN public.church_branches AS b ON b.id = p_branch_id
      WHERE a.profile_id = p_profile_id
        AND a.is_active
        AND a.assigned_at <= now()
        AND (a.expires_at IS NULL OR a.expires_at > now())
        AND perm.key = p_permission_key
        AND (
          a.scope_type = 'church'
          OR (a.scope_type = 'branch' AND a.branch_id = p_branch_id)
          OR (a.scope_type = 'district' AND a.district_id = b.district_id)
        )
    );
$function$;

REVOKE ALL ON FUNCTION private.profile_has_permission(uuid, text, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.authorize_member_portal_action(
  p_profile_id uuid,
  p_action text,
  p_email text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor_profile_id uuid;
  v_target public.profiles%ROWTYPE;
  v_email text;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501';
  END IF;

  v_actor_profile_id := private.current_profile_id();
  IF v_actor_profile_id IS NULL THEN
    RAISE EXCEPTION 'An active authenticated church profile is required.' USING ERRCODE = '42501';
  END IF;

  IF p_profile_id IS NULL OR p_action NOT IN ('invite', 'activate', 'suspend', 'revoke') THEN
    RAISE EXCEPTION 'A member and supported portal action are required.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_target
  FROM public.profiles
  WHERE id = p_profile_id
  FOR SHARE;

  IF NOT FOUND OR v_target.record_status <> 'active' OR v_target.branch_id IS NULL THEN
    RAISE EXCEPTION 'The active member directory record was not found.' USING ERRCODE = '23503';
  END IF;

  IF NOT private.has_permission('manage_members', v_target.branch_id) THEN
    RAISE EXCEPTION 'You do not have permission to manage portal access for this member.' USING ERRCODE = '42501';
  END IF;

  IF p_action = 'invite' THEN
    IF v_target.auth_user_id IS NOT NULL THEN
      IF v_target.portal_access_status IN ('invited', 'active', 'suspended') THEN
        RETURN jsonb_build_object(
          'already_done', true,
          'action', p_action,
          'profile_id', v_target.id,
          'auth_user_id', v_target.auth_user_id,
          'portal_access_status', v_target.portal_access_status
        );
      END IF;
      RAISE EXCEPTION 'This member is already linked to a portal account.' USING ERRCODE = '23505';
    END IF;

    IF v_target.portal_access_status <> 'not_invited' THEN
      RAISE EXCEPTION 'The member portal state must be reset before a new invitation.' USING ERRCODE = '22023';
    END IF;

    v_email := pg_catalog.lower(pg_catalog.btrim(COALESCE(p_email, '')));
    IF v_email = '' OR v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
      RAISE EXCEPTION 'A valid email address is required to invite this member.' USING ERRCODE = '22023';
    END IF;
    PERFORM private.assert_unique_profile_contacts(v_email, NULL, p_profile_id);
  ELSIF p_action = 'activate' THEN
    IF v_target.auth_user_id IS NULL THEN
      RAISE EXCEPTION 'This member has no linked portal account to activate.' USING ERRCODE = '23503';
    END IF;
    IF v_target.portal_access_status = 'active' THEN
      RETURN jsonb_build_object('already_done', true, 'action', p_action,
        'profile_id', v_target.id, 'auth_user_id', v_target.auth_user_id,
        'portal_access_status', v_target.portal_access_status);
    END IF;
    IF v_target.portal_access_status <> 'suspended' THEN
      RAISE EXCEPTION 'Only a suspended portal account can be reactivated.' USING ERRCODE = '22023';
    END IF;
  ELSIF p_action = 'suspend' THEN
    IF v_target.auth_user_id IS NULL THEN
      RAISE EXCEPTION 'This member has no linked portal account to suspend.' USING ERRCODE = '23503';
    END IF;
    IF v_target.portal_access_status = 'suspended' THEN
      RETURN jsonb_build_object('already_done', true, 'action', p_action,
        'profile_id', v_target.id, 'auth_user_id', v_target.auth_user_id,
        'portal_access_status', v_target.portal_access_status);
    END IF;
    IF v_target.portal_access_status NOT IN ('invited', 'active') THEN
      RAISE EXCEPTION 'This portal account cannot be suspended from its current state.' USING ERRCODE = '22023';
    END IF;
  ELSIF p_action = 'revoke' THEN
    IF v_target.auth_user_id IS NULL THEN
      IF v_target.portal_access_status = 'not_invited' THEN
        RETURN jsonb_build_object('already_done', true, 'action', p_action,
          'profile_id', v_target.id, 'auth_user_id', NULL,
          'portal_access_status', v_target.portal_access_status);
      END IF;
      RAISE EXCEPTION 'The member portal link is inconsistent and requires review.' USING ERRCODE = '22023';
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'already_done', false,
    'action', p_action,
    'actor_profile_id', v_actor_profile_id,
    'profile_id', v_target.id,
    'auth_user_id', v_target.auth_user_id,
    'branch_id', v_target.branch_id,
    'email', CASE WHEN p_action = 'invite' THEN v_email ELSE v_target.email END,
    'first_name', v_target.first_name,
    'last_name', v_target.last_name,
    'portal_access_status', v_target.portal_access_status
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.complete_member_portal_action(
  p_actor_profile_id uuid,
  p_profile_id uuid,
  p_action text,
  p_auth_user_id uuid DEFAULT NULL,
  p_email text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_target public.profiles%ROWTYPE;
  v_email text;
BEGIN
  IF COALESCE((SELECT auth.jwt() ->> 'role'), current_setting('request.jwt.claim.role', true), '') <> 'service_role' THEN
    RAISE EXCEPTION 'This operation is restricted to the trusted portal provisioning service.' USING ERRCODE = '42501';
  END IF;

  IF p_actor_profile_id IS NULL OR p_profile_id IS NULL
     OR p_action NOT IN ('invite', 'activate', 'suspend', 'revoke') THEN
    RAISE EXCEPTION 'A valid actor, member and portal action are required.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_target
  FROM public.profiles
  WHERE id = p_profile_id
  FOR UPDATE;

  IF NOT FOUND OR v_target.record_status <> 'active' OR v_target.branch_id IS NULL THEN
    RAISE EXCEPTION 'The active member directory record was not found.' USING ERRCODE = '23503';
  END IF;

  IF NOT private.profile_has_permission(p_actor_profile_id, 'manage_members', v_target.branch_id) THEN
    RAISE EXCEPTION 'The provisioning actor no longer has permission for this member branch.' USING ERRCODE = '42501';
  END IF;

  IF p_action = 'invite' THEN
    v_email := pg_catalog.lower(pg_catalog.btrim(COALESCE(p_email, '')));
    IF p_auth_user_id IS NULL OR v_email = ''
       OR v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
      RAISE EXCEPTION 'A valid invited Auth identity and email are required.' USING ERRCODE = '22023';
    END IF;
    IF v_target.auth_user_id IS NOT NULL OR v_target.portal_access_status <> 'not_invited' THEN
      RAISE EXCEPTION 'The member already has a portal account or invitation.' USING ERRCODE = '23505';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM auth.users AS u
      WHERE u.id = p_auth_user_id
        AND pg_catalog.lower(pg_catalog.btrim(u.email)) = v_email
    ) THEN
      RAISE EXCEPTION 'The invited Auth identity does not match the requested email.' USING ERRCODE = '23503';
    END IF;
    PERFORM private.assert_unique_profile_contacts(v_email, NULL, p_profile_id);

    UPDATE public.profiles
    SET email = v_email,
        auth_user_id = p_auth_user_id,
        portal_access_status = 'invited',
        updated_at = now()
    WHERE id = p_profile_id;

  ELSIF p_action = 'activate' THEN
    IF v_target.auth_user_id IS NULL OR v_target.auth_user_id IS DISTINCT FROM p_auth_user_id
       OR v_target.portal_access_status <> 'suspended' THEN
      RAISE EXCEPTION 'The suspended portal account changed before activation completed.' USING ERRCODE = '40001';
    END IF;
    UPDATE public.profiles
    SET portal_access_status = 'active', updated_at = now()
    WHERE id = p_profile_id;

  ELSIF p_action = 'suspend' THEN
    IF v_target.auth_user_id IS NULL OR v_target.auth_user_id IS DISTINCT FROM p_auth_user_id
       OR v_target.portal_access_status NOT IN ('active', 'invited', 'suspended') THEN
      RAISE EXCEPTION 'The portal account changed before suspension completed.' USING ERRCODE = '40001';
    END IF;
    UPDATE public.profiles
    SET portal_access_status = 'suspended', updated_at = now()
    WHERE id = p_profile_id;

  ELSIF p_action = 'revoke' THEN
    IF v_target.auth_user_id IS NULL OR v_target.auth_user_id IS DISTINCT FROM p_auth_user_id
       OR v_target.portal_access_status <> 'suspended' THEN
      RAISE EXCEPTION 'The portal account must be suspended before its link can be revoked.' USING ERRCODE = '40001';
    END IF;
    UPDATE public.profiles
    SET auth_user_id = NULL,
        portal_access_status = 'not_invited',
        updated_at = now()
    WHERE id = p_profile_id;
  END IF;

  INSERT INTO public.audit_logs (
    actor_profile_id, action, entity_type, entity_id, branch_id, details
  ) VALUES (
    p_actor_profile_id,
    'member.portal_access.' || p_action,
    'member_profile',
    p_profile_id,
    v_target.branch_id,
    pg_catalog.jsonb_build_object(
      'auth_user_id', p_auth_user_id,
      'email', CASE WHEN p_action = 'invite' THEN v_email ELSE v_target.email END
    )
  );

  RETURN jsonb_build_object(
    'profile_id', p_profile_id,
    'auth_user_id', CASE WHEN p_action = 'revoke' THEN NULL ELSE COALESCE(p_auth_user_id, v_target.auth_user_id) END,
    'portal_access_status', CASE p_action
      WHEN 'invite' THEN 'invited'
      WHEN 'activate' THEN 'active'
      WHEN 'suspend' THEN 'suspended'
      WHEN 'revoke' THEN 'not_invited'
    END
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.authorize_member_portal_action(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.authorize_member_portal_action(uuid, text, text) TO authenticated;
REVOKE ALL ON FUNCTION public.complete_member_portal_action(uuid, uuid, text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_member_portal_action(uuid, uuid, text, uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION private.activate_member_portal_after_email_confirmation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_profile public.profiles%ROWTYPE;
BEGIN
  IF NEW.email_confirmed_at IS NOT NULL
     AND OLD.email_confirmed_at IS DISTINCT FROM NEW.email_confirmed_at THEN
    UPDATE public.profiles
    SET portal_access_status = 'active',
        updated_at = now()
    WHERE auth_user_id = NEW.id
      AND portal_access_status = 'invited'
      AND record_status = 'active'
    RETURNING * INTO v_profile;

    IF FOUND THEN
      INSERT INTO public.audit_logs (
        actor_profile_id, action, entity_type, entity_id, branch_id, details
      ) VALUES (
        v_profile.id,
        'member.portal_access.invitation_accepted',
        'member_profile',
        v_profile.id,
        v_profile.branch_id,
        pg_catalog.jsonb_build_object('auth_user_id', NEW.id)
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_activate_member_portal_after_email_confirmation ON auth.users;
CREATE TRIGGER trg_activate_member_portal_after_email_confirmation
AFTER UPDATE OF email_confirmed_at ON auth.users
FOR EACH ROW
EXECUTE FUNCTION private.activate_member_portal_after_email_confirmation();

REVOKE ALL ON FUNCTION private.activate_member_portal_after_email_confirmation() FROM PUBLIC, anon, authenticated;
