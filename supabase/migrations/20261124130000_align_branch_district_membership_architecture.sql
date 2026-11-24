-- MEM-INT-004A: Branch, District & Congregation Membership Architecture Alignment
-- 1. Aligns organizational structure so districts are optional groupings of branches
--    (church_branches.district_id nullable, standalone branches supported).
-- 2. Clarifies and enforces District HQ uniqueness (uq_church_branches_one_active_hq_per_district)
--    distinct from standalone Church Main Branch uniqueness (uq_church_branches_one_active_standalone_main).
-- 3. Provides hardened, schema-aligned create/update/delete district & branch RPCs
--    targeting fresh_install.sql columns (state_or_region, code, country, status).
-- 4. Exposes a narrowly scoped, PII-free governance summary RPC (get_branch_governance_summaries)
--    so branch/district overview dashboards retain accurate counts under strict profiles RLS.
-- 5. Hardens atomic member transfer approval to reconcile branch-scoped ministry_members
--    (marking old branch assignments inactive while preserving history and church-wide teams)
--    and clean up branch-coupled cell assignments/leadership prior to branch reassignment.

-- Ensure district_admin holds manage_branches and manage_roles cleanly.
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles AS r
JOIN public.permissions AS p ON p.key IN ('manage_branches', 'manage_roles')
WHERE r.name = 'district_admin'
ON CONFLICT DO NOTHING;

-- Replace global single-main-branch index with per-district HQ uniqueness
-- plus optional single active standalone Church Main Branch uniqueness.
DROP INDEX IF EXISTS public.uq_church_branches_one_active_main;

CREATE UNIQUE INDEX IF NOT EXISTS uq_church_branches_one_active_hq_per_district
  ON public.church_branches (district_id)
  WHERE is_main_branch = true AND status = 'active' AND district_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_church_branches_one_active_standalone_main
  ON public.church_branches (is_main_branch)
  WHERE is_main_branch = true AND status = 'active' AND district_id IS NULL;

-- District-scoped permission helper (never matches NULL district_id for district-scoped roles).
CREATE OR REPLACE FUNCTION private.has_district_permission(
  p_permission_key text,
  p_district_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profile_role_assignments AS a
    JOIN public.roles AS r ON r.id = a.role_id AND r.is_active
    JOIN public.role_permissions AS rp ON rp.role_id = r.id
    JOIN public.permissions AS perm ON perm.id = rp.permission_id
    WHERE a.profile_id = private.current_profile_id()
      AND a.is_active
      AND a.assigned_at <= now()
      AND (a.expires_at IS NULL OR a.expires_at > now())
      AND perm.key = p_permission_key
      AND (
        a.scope_type = 'church'
        OR (
          p_district_id IS NOT NULL
          AND a.scope_type = 'district'
          AND a.district_id = p_district_id
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION private.has_district_permission(text, uuid) FROM PUBLIC, anon, authenticated;

-- Helper ensuring district-level managers can see an assigned district even before its first branch is created.
CREATE OR REPLACE FUNCTION private.can_access_district(
  p_district_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p_district_id IS NOT NULL AND (
    private.has_permission('manage_branches', NULL)
    OR EXISTS (
      SELECT 1
      FROM public.church_branches AS b
      WHERE b.district_id = p_district_id
        AND private.can_access_branch(b.id)
    )
    OR EXISTS (
      SELECT 1
      FROM public.profile_role_assignments AS a
      WHERE a.profile_id = private.current_profile_id()
        AND a.is_active
        AND a.assigned_at <= now()
        AND (a.expires_at IS NULL OR a.expires_at > now())
        AND (
          a.scope_type = 'church'
          OR (a.scope_type = 'district' AND a.district_id = p_district_id)
        )
    )
  );
$$;

REVOKE ALL ON FUNCTION private.can_access_district(uuid) FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.can_access_district(uuid) TO authenticated;

DROP POLICY IF EXISTS districts_authorized_read ON public.districts;
CREATE POLICY districts_authorized_read
ON public.districts
FOR SELECT
TO authenticated
USING (private.can_access_district(id));

-- Privilege-escalation guard for high-privilege governance roles.
CREATE OR REPLACE FUNCTION private.can_manage_target_role(
  p_role_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_role_name text;
BEGIN
  SELECT r.name
  INTO v_role_name
  FROM public.roles AS r
  WHERE r.id = p_role_id;

  IF v_role_name IS NULL THEN
    RETURN false;
  END IF;

  IF v_role_name IN ('super_admin', 'admin', 'district_admin') THEN
    RETURN private.has_permission('manage_roles', NULL);
  END IF;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION private.can_manage_target_role(uuid) FROM PUBLIC, anon, authenticated;

-- Drop older/incompatible branch & district RPC overloads so canonical signatures remain unambiguous.
DROP FUNCTION IF EXISTS public.create_district(text, text, text);
DROP FUNCTION IF EXISTS public.create_district(text, text, text, text);
DROP FUNCTION IF EXISTS public.update_district(uuid, text, text, text, text, uuid, boolean);
DROP FUNCTION IF EXISTS public.delete_district(uuid);
DROP FUNCTION IF EXISTS public.create_church_branch(uuid, text, text, text, text, boolean);
DROP FUNCTION IF EXISTS public.update_church_branch(uuid, uuid, text, text, text, text, boolean);

CREATE OR REPLACE FUNCTION public.create_district(
  p_name text,
  p_region text,
  p_country text,
  p_description text DEFAULT NULL
)
RETURNS public.districts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_profile_id uuid;
  v_district public.districts;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Authentication is required.' USING ERRCODE = '42501';
  END IF;

  v_actor_profile_id := private.current_profile_id();
  IF v_actor_profile_id IS NULL THEN
    RAISE EXCEPTION 'An active linked church profile is required.' USING ERRCODE = '42501';
  END IF;

  IF NOT private.has_permission('manage_branches', NULL) THEN
    RAISE EXCEPTION 'Church-wide manage_branches permission is required to create districts.'
      USING ERRCODE = '42501';
  END IF;

  IF NULLIF(pg_catalog.btrim(COALESCE(p_name, '')), '') IS NULL
    OR NULLIF(pg_catalog.btrim(COALESCE(p_region, '')), '') IS NULL
    OR NULLIF(pg_catalog.btrim(COALESCE(p_country, '')), '') IS NULL THEN
    RAISE EXCEPTION 'District name, region, and country are required.'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.districts (name, region, country, description)
  VALUES (
    pg_catalog.btrim(p_name),
    pg_catalog.btrim(p_region),
    pg_catalog.btrim(p_country),
    NULLIF(pg_catalog.btrim(COALESCE(p_description, '')), '')
  )
  RETURNING * INTO v_district;

  RETURN v_district;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_district(
  p_district_id uuid,
  p_name text,
  p_region text,
  p_country text,
  p_description text DEFAULT NULL,
  p_hq_branch_id uuid DEFAULT NULL,
  p_update_hq boolean DEFAULT false
)
RETURNS public.districts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_profile_id uuid;
  v_district public.districts;
  v_has_church_scope boolean;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Authentication is required.' USING ERRCODE = '42501';
  END IF;

  v_actor_profile_id := private.current_profile_id();
  IF v_actor_profile_id IS NULL THEN
    RAISE EXCEPTION 'An active linked church profile is required.' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.districts AS d WHERE d.id = p_district_id) THEN
    RAISE EXCEPTION 'The selected district does not exist.' USING ERRCODE = '23503';
  END IF;

  v_has_church_scope := private.has_permission('manage_branches', NULL);
  IF NOT v_has_church_scope AND NOT private.has_district_permission('manage_branches', p_district_id) THEN
    RAISE EXCEPTION 'You do not have permission to customize this district.' USING ERRCODE = '42501';
  END IF;

  IF COALESCE(p_update_hq, false) AND NOT v_has_church_scope THEN
    RAISE EXCEPTION 'Only church-wide administrators may change district HQ branch designation.'
      USING ERRCODE = '42501';
  END IF;

  IF NULLIF(pg_catalog.btrim(COALESCE(p_name, '')), '') IS NULL
    OR NULLIF(pg_catalog.btrim(COALESCE(p_region, '')), '') IS NULL
    OR NULLIF(pg_catalog.btrim(COALESCE(p_country, '')), '') IS NULL THEN
    RAISE EXCEPTION 'District name, region, and country are required.' USING ERRCODE = '22023';
  END IF;

  IF COALESCE(p_update_hq, false) AND p_hq_branch_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.church_branches AS b
      WHERE b.id = p_hq_branch_id
        AND b.district_id = p_district_id
        AND b.status = 'active'
    ) THEN
      RAISE EXCEPTION 'The selected HQ branch must be an active branch belonging to this district.'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  UPDATE public.districts
  SET
    name = pg_catalog.btrim(p_name),
    region = pg_catalog.btrim(p_region),
    country = pg_catalog.btrim(p_country),
    description = NULLIF(pg_catalog.btrim(COALESCE(p_description, '')), ''),
    updated_at = now()
  WHERE id = p_district_id
  RETURNING * INTO v_district;

  IF COALESCE(p_update_hq, false) THEN
    UPDATE public.church_branches
    SET is_main_branch = false, updated_at = now()
    WHERE district_id = p_district_id
      AND is_main_branch = true
      AND (p_hq_branch_id IS NULL OR id <> p_hq_branch_id);

    IF p_hq_branch_id IS NOT NULL THEN
      UPDATE public.church_branches
      SET is_main_branch = true, updated_at = now()
      WHERE id = p_hq_branch_id AND district_id = p_district_id;
    END IF;
  END IF;

  RETURN v_district;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_district(
  p_district_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_profile_id uuid;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Authentication is required.' USING ERRCODE = '42501';
  END IF;

  v_actor_profile_id := private.current_profile_id();
  IF v_actor_profile_id IS NULL THEN
    RAISE EXCEPTION 'An active linked church profile is required.' USING ERRCODE = '42501';
  END IF;

  IF NOT private.has_permission('manage_branches', NULL) THEN
    RAISE EXCEPTION 'Church-wide manage_branches permission is required to delete districts.'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.districts AS d WHERE d.id = p_district_id) THEN
    RETURN false;
  END IF;

  IF EXISTS (SELECT 1 FROM public.church_branches AS b WHERE b.district_id = p_district_id) THEN
    RAISE EXCEPTION 'Reassign or detach all branches in this district before deleting it.'
      USING ERRCODE = '23503';
  END IF;

  DELETE FROM public.districts WHERE id = p_district_id;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_church_branch(
  p_district_id uuid DEFAULT NULL,
  p_name text DEFAULT NULL,
  p_address text DEFAULT NULL,
  p_city text DEFAULT NULL,
  p_state text DEFAULT NULL,
  p_is_main_branch boolean DEFAULT false,
  p_code text DEFAULT NULL,
  p_country text DEFAULT 'Sierra Leone'
)
RETURNS public.church_branches
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_profile_id uuid;
  v_branch public.church_branches;
  v_has_church_scope boolean;
  v_code text;
  v_prefix text;
  v_district_country text;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Authentication is required.' USING ERRCODE = '42501';
  END IF;

  v_actor_profile_id := private.current_profile_id();
  IF v_actor_profile_id IS NULL THEN
    RAISE EXCEPTION 'An active linked church profile is required.' USING ERRCODE = '42501';
  END IF;

  v_has_church_scope := private.has_permission('manage_branches', NULL);

  IF p_district_id IS NULL THEN
    IF NOT v_has_church_scope THEN
      RAISE EXCEPTION 'Church-wide manage_branches permission is required to create standalone branches without a district.'
        USING ERRCODE = '42501';
    END IF;
  ELSE
    SELECT d.country
    INTO v_district_country
    FROM public.districts AS d
    WHERE d.id = p_district_id AND d.status = 'active';

    IF NOT FOUND THEN
      RAISE EXCEPTION 'The selected district does not exist or is inactive.' USING ERRCODE = '23503';
    END IF;

    IF NOT v_has_church_scope AND NOT private.has_district_permission('manage_branches', p_district_id) THEN
      RAISE EXCEPTION 'You do not have permission to create branches in this district.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF COALESCE(p_is_main_branch, false) AND NOT v_has_church_scope THEN
    RAISE EXCEPTION 'Only church-wide administrators may designate a primary headquarters or main branch.'
      USING ERRCODE = '42501';
  END IF;

  IF NULLIF(pg_catalog.btrim(COALESCE(p_name, '')), '') IS NULL
    OR NULLIF(pg_catalog.btrim(COALESCE(p_address, '')), '') IS NULL
    OR NULLIF(pg_catalog.btrim(COALESCE(p_city, '')), '') IS NULL
    OR NULLIF(pg_catalog.btrim(COALESCE(p_state, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Branch name, address, city, and state/region are required.'
      USING ERRCODE = '22023';
  END IF;

  v_code := NULLIF(pg_catalog.upper(pg_catalog.btrim(COALESCE(p_code, ''))), '');
  IF v_code IS NULL THEN
    v_prefix := COALESCE(
      NULLIF(pg_catalog.upper(pg_catalog.left(pg_catalog.regexp_replace(p_name, '[^A-Za-z0-9]+', '', 'g'), 4)), ''),
      'BR'
    );
    v_code := v_prefix || '-' || pg_catalog.upper(pg_catalog.substr(pg_catalog.replace(gen_random_uuid()::text, '-', ''), 1, 6));
  END IF;

  -- Enforce strictly one active main/HQ branch within the target scope.
  IF COALESCE(p_is_main_branch, false) THEN
    IF p_district_id IS NOT NULL THEN
      UPDATE public.church_branches
      SET is_main_branch = false, updated_at = now()
      WHERE district_id = p_district_id
        AND is_main_branch = true;
    ELSE
      UPDATE public.church_branches
      SET is_main_branch = false, updated_at = now()
      WHERE district_id IS NULL
        AND is_main_branch = true;
    END IF;
  END IF;

  INSERT INTO public.church_branches (
    district_id, name, code, address, city, state_or_region, country, is_main_branch
  )
  VALUES (
    p_district_id,
    pg_catalog.btrim(p_name),
    v_code,
    pg_catalog.btrim(p_address),
    pg_catalog.btrim(p_city),
    pg_catalog.btrim(p_state),
    COALESCE(NULLIF(pg_catalog.btrim(COALESCE(p_country, '')), ''), v_district_country, 'Sierra Leone'),
    COALESCE(p_is_main_branch, false)
  )
  RETURNING * INTO v_branch;

  RETURN v_branch;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_church_branch(
  p_branch_id uuid,
  p_district_id uuid DEFAULT NULL,
  p_name text DEFAULT NULL,
  p_address text DEFAULT NULL,
  p_city text DEFAULT NULL,
  p_state text DEFAULT NULL,
  p_is_main_branch boolean DEFAULT false
)
RETURNS public.church_branches
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_profile_id uuid;
  v_existing public.church_branches;
  v_updated public.church_branches;
  v_has_church_scope boolean;
  v_next_is_main boolean;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Authentication is required.' USING ERRCODE = '42501';
  END IF;

  v_actor_profile_id := private.current_profile_id();
  IF v_actor_profile_id IS NULL THEN
    RAISE EXCEPTION 'An active linked church profile is required.' USING ERRCODE = '42501';
  END IF;

  SELECT b.*
  INTO v_existing
  FROM public.church_branches AS b
  WHERE b.id = p_branch_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'The selected branch does not exist.' USING ERRCODE = '23503';
  END IF;

  IF p_district_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.districts AS d WHERE d.id = p_district_id AND d.status = 'active'
  ) THEN
    RAISE EXCEPTION 'The selected district does not exist or is inactive.' USING ERRCODE = '23503';
  END IF;

  v_has_church_scope := private.has_permission('manage_branches', NULL);
  IF NOT v_has_church_scope THEN
    IF v_existing.district_id IS NULL OR p_district_id IS NULL THEN
      RAISE EXCEPTION 'Only church-wide administrators may manage standalone branches or attach/detach districts.'
        USING ERRCODE = '42501';
    END IF;
    IF NOT private.has_district_permission('manage_branches', v_existing.district_id)
      OR NOT private.has_district_permission('manage_branches', p_district_id) THEN
      RAISE EXCEPTION 'You do not have permission to update this branch or move it across districts.'
        USING ERRCODE = '42501';
    END IF;
    IF COALESCE(p_is_main_branch, false) IS DISTINCT FROM v_existing.is_main_branch THEN
      RAISE EXCEPTION 'Only church-wide administrators may change district HQ or main branch designation.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF NULLIF(pg_catalog.btrim(COALESCE(p_name, '')), '') IS NULL
    OR NULLIF(pg_catalog.btrim(COALESCE(p_address, '')), '') IS NULL
    OR NULLIF(pg_catalog.btrim(COALESCE(p_city, '')), '') IS NULL
    OR NULLIF(pg_catalog.btrim(COALESCE(p_state, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Branch name, address, city, and state/region are required.'
      USING ERRCODE = '22023';
  END IF;

  v_next_is_main := COALESCE(p_is_main_branch, false);

  -- Enforce strictly one active main/HQ branch in the target scope.
  IF v_next_is_main THEN
    IF p_district_id IS NOT NULL THEN
      UPDATE public.church_branches
      SET is_main_branch = false, updated_at = now()
      WHERE district_id = p_district_id
        AND id <> p_branch_id
        AND is_main_branch = true;
    ELSE
      UPDATE public.church_branches
      SET is_main_branch = false, updated_at = now()
      WHERE district_id IS NULL
        AND id <> p_branch_id
        AND is_main_branch = true;
    END IF;
  END IF;

  UPDATE public.church_branches
  SET
    district_id = p_district_id,
    name = pg_catalog.btrim(p_name),
    address = pg_catalog.btrim(p_address),
    city = pg_catalog.btrim(p_city),
    state_or_region = pg_catalog.btrim(p_state),
    is_main_branch = v_next_is_main,
    updated_at = now()
  WHERE id = p_branch_id
  RETURNING * INTO v_updated;

  RETURN v_updated;
END;
$$;

REVOKE ALL ON FUNCTION public.create_district(text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_district(uuid, text, text, text, text, uuid, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.delete_district(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_church_branch(uuid, text, text, text, text, boolean, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_church_branch(uuid, uuid, text, text, text, text, boolean) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.create_district(text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_district(uuid, text, text, text, text, uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_district(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_church_branch(uuid, text, text, text, text, boolean, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_church_branch(uuid, uuid, text, text, text, text, boolean) TO authenticated;

-- PII-free aggregate governance summary RPC for branch & district management dashboards.
CREATE OR REPLACE FUNCTION private.get_branch_governance_summaries(
  p_district_id uuid DEFAULT NULL
)
RETURNS TABLE (
  branch_id uuid,
  district_id uuid,
  total_members bigint,
  active_members bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Authentication is required.' USING ERRCODE = '42501';
  END IF;

  IF private.current_profile_id() IS NULL THEN
    RAISE EXCEPTION 'An active linked church profile is required.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    b.id AS branch_id,
    b.district_id,
    COUNT(p.id) FILTER (WHERE p.record_status = 'active' AND p.membership_status <> 'archived')::bigint AS total_members,
    COUNT(p.id) FILTER (WHERE p.record_status = 'active' AND p.membership_status = 'active')::bigint AS active_members
  FROM public.church_branches AS b
  LEFT JOIN public.profiles AS p ON p.branch_id = b.id
  WHERE (p_district_id IS NULL OR b.district_id = p_district_id)
    AND (
      private.can_access_branch(b.id)
      OR private.has_permission('manage_branches', b.id)
      OR private.has_permission('manage_branches', NULL)
    )
  GROUP BY b.id, b.district_id
  ORDER BY b.name;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_branch_governance_summaries(
  p_district_id uuid DEFAULT NULL
)
RETURNS TABLE (
  branch_id uuid,
  district_id uuid,
  total_members bigint,
  active_members bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT * FROM private.get_branch_governance_summaries(p_district_id);
$$;

REVOKE ALL ON FUNCTION private.get_branch_governance_summaries(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_branch_governance_summaries(uuid) FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.get_branch_governance_summaries(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_branch_governance_summaries(uuid) TO authenticated;

-- Include derived district names in the least-privilege transfer directory RPC.
CREATE OR REPLACE FUNCTION private.get_member_transfer_directory()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid;
  v_result jsonb;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501';
  END IF;
  v_actor_id := private.current_profile_id();
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'An active linked church profile is required.' USING ERRCODE = '42501';
  END IF;

  SELECT pg_catalog.jsonb_build_object(
    'members',
    COALESCE((
      SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', p.id, 'first_name', p.first_name, 'last_name', p.last_name,
        'branch_id', p.branch_id, 'membership_status', p.membership_status
      ) ORDER BY p.first_name, p.last_name)
      FROM public.profiles AS p
      WHERE p.record_status = 'active' AND p.membership_status = 'active'
        AND p.branch_id IS NOT NULL
        AND private.has_permission('manage_member_transfers', p.branch_id)
    ), '[]'::jsonb),
    'branches',
    COALESCE((
      SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', b.id,
        'name', b.name,
        'district_id', b.district_id,
        'district_name', d.name,
        'status', b.status
      ) ORDER BY b.name)
      FROM public.church_branches AS b
      LEFT JOIN public.districts AS d ON d.id = b.district_id
      WHERE b.status = 'active'
        AND private.has_permission('manage_member_transfers', b.id)
    ), '[]'::jsonb)
  ) INTO v_result;
  RETURN v_result;
END;
$$;

-- Reconcile branch-scoped ministry rosters and cell references atomically on transfer approval.
CREATE OR REPLACE FUNCTION private.manage_member_transfer(
  p_action text,
  p_transfer_id uuid DEFAULT NULL::uuid,
  p_member_id uuid DEFAULT NULL::uuid,
  p_to_branch_id uuid DEFAULT NULL::uuid,
  p_notes text DEFAULT NULL::text
)
RETURNS public.member_transfers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor_profile_id uuid;
  v_transfer public.member_transfers;
  v_member public.profiles;
  v_result public.member_transfers;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'An authenticated session is required.' USING ERRCODE = '42501';
  END IF;
  v_actor_profile_id := private.current_profile_id();
  IF v_actor_profile_id IS NULL THEN
    RAISE EXCEPTION 'An active linked church profile is required.' USING ERRCODE = '42501';
  END IF;
  IF p_action NOT IN ('request', 'approve', 'reject', 'cancel') THEN
    RAISE EXCEPTION 'Unsupported member transfer operation.' USING ERRCODE = '22023';
  END IF;

  IF p_action = 'request' THEN
    IF p_to_branch_id IS NULL THEN
      RAISE EXCEPTION 'A destination branch is required.' USING ERRCODE = '22023';
    END IF;
    SELECT * INTO v_member
    FROM public.profiles
    WHERE id = COALESCE(p_member_id, v_actor_profile_id)
      AND record_status = 'active'
      AND membership_status = 'active'
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'The selected active church member could not be found.' USING ERRCODE = '23503';
    END IF;
    IF v_member.branch_id IS NOT DISTINCT FROM p_to_branch_id THEN
      RAISE EXCEPTION 'The member is already assigned to the selected branch.' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.church_branches AS b
      WHERE b.id = p_to_branch_id AND b.status = 'active'
    ) THEN
      RAISE EXCEPTION 'The destination branch is unavailable.' USING ERRCODE = '23503';
    END IF;
    IF v_member.id <> v_actor_profile_id
      AND (
        NOT private.has_permission('manage_member_transfers', v_member.branch_id)
        OR NOT private.has_permission('manage_member_transfers', p_to_branch_id)
      ) THEN
      RAISE EXCEPTION 'You do not have permission to request a transfer for this member.' USING ERRCODE = '42501';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.member_transfers AS t
      WHERE t.member_id = v_member.id AND t.status = 'pending'
    ) THEN
      RAISE EXCEPTION 'This member already has a pending transfer request.' USING ERRCODE = '23505';
    END IF;
    INSERT INTO public.member_transfers (
      member_id, from_branch_id, to_branch_id, status, requested_by_profile_id, notes
    ) VALUES (
      v_member.id, v_member.branch_id, p_to_branch_id, 'pending', v_actor_profile_id,
      NULLIF(pg_catalog.btrim(p_notes), '')
    ) RETURNING * INTO v_result;
    RETURN v_result;
  END IF;

  IF p_transfer_id IS NULL THEN
    RAISE EXCEPTION 'A member transfer request is required.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_transfer
  FROM public.member_transfers
  WHERE id = p_transfer_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The member transfer request could not be found.' USING ERRCODE = 'P0002';
  END IF;
  IF v_transfer.status <> 'pending' THEN
    RAISE EXCEPTION 'Only pending transfer requests can be changed.' USING ERRCODE = '22023';
  END IF;

  IF p_action = 'cancel' THEN
    IF v_transfer.requested_by_profile_id <> v_actor_profile_id
      AND NOT private.has_permission('manage_member_transfers', v_transfer.from_branch_id) THEN
      RAISE EXCEPTION 'You do not have permission to cancel this transfer request.' USING ERRCODE = '42501';
    END IF;
    UPDATE public.member_transfers
    SET status = 'cancelled'
    WHERE id = p_transfer_id
    RETURNING * INTO v_result;
    RETURN v_result;
  END IF;

  IF NOT private.has_permission('manage_member_transfers', v_transfer.from_branch_id)
    OR NOT private.has_permission('manage_member_transfers', v_transfer.to_branch_id) THEN
    RAISE EXCEPTION 'Transfer review requires permission in both the source and destination branches.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_member
  FROM public.profiles
  WHERE id = v_transfer.member_id
  FOR UPDATE;
  IF NOT FOUND OR v_member.branch_id IS DISTINCT FROM v_transfer.from_branch_id THEN
    RAISE EXCEPTION 'The member branch no longer matches this transfer request.' USING ERRCODE = '23514';
  END IF;

  IF p_action = 'approve' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.church_branches AS b
      WHERE b.id = v_transfer.to_branch_id AND b.status = 'active'
    ) THEN
      RAISE EXCEPTION 'The destination branch is no longer active.' USING ERRCODE = '23503';
    END IF;

    -- Release previous branch cell leadership/membership before moving branch_id so composite FKs stay consistent.
    IF v_transfer.from_branch_id IS NOT NULL THEN
      UPDATE public.cells
      SET leader_id = NULL, updated_at = now()
      WHERE branch_id = v_transfer.from_branch_id
        AND leader_id = v_transfer.member_id;

      DELETE FROM public.cell_members
      WHERE member_id = v_transfer.member_id
        AND branch_id = v_transfer.from_branch_id;

      -- Deactivate source-branch ministry participation while preserving roster history and church-wide teams (branch_id IS NULL).
      UPDATE public.ministry_members AS mm
      SET status = 'inactive'
      FROM public.ministries AS m
      WHERE m.id = mm.ministry_id
        AND mm.member_id = v_transfer.member_id
        AND m.branch_id = v_transfer.from_branch_id
        AND mm.status IS DISTINCT FROM 'inactive';
    END IF;

    UPDATE public.profiles
    SET branch_id = v_transfer.to_branch_id,
        updated_at = now()
    WHERE id = v_transfer.member_id;

    UPDATE public.member_transfers
    SET status = 'approved',
        approved_by_profile_id = v_actor_profile_id,
        approved_at = now()
    WHERE id = p_transfer_id
    RETURNING * INTO v_result;
    RETURN v_result;
  ELSE
    UPDATE public.member_transfers
    SET status = 'rejected',
        approved_by_profile_id = v_actor_profile_id,
        approved_at = now()
    WHERE id = p_transfer_id
    RETURNING * INTO v_result;
    RETURN v_result;
  END IF;
END;
$function$;

-- Enforce role escalation & district scope checks consistently on profile role assignment RPCs.
CREATE OR REPLACE FUNCTION public.assign_profile_role(
  p_profile_id uuid,
  p_role_id uuid,
  p_scope_type text DEFAULT 'church',
  p_branch_id uuid DEFAULT NULL,
  p_district_id uuid DEFAULT NULL
)
RETURNS public.profile_role_assignments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_profile_id uuid;
  v_assignment public.profile_role_assignments;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Authentication is required.' USING ERRCODE = '42501';
  END IF;

  v_actor_profile_id := private.current_profile_id();
  IF v_actor_profile_id IS NULL THEN
    RAISE EXCEPTION 'An active linked church profile is required.' USING ERRCODE = '42501';
  END IF;

  IF p_scope_type NOT IN ('church', 'district', 'branch') THEN
    RAISE EXCEPTION 'Unsupported role assignment scope.' USING ERRCODE = '22023';
  END IF;

  IF (p_scope_type = 'church' AND (p_branch_id IS NOT NULL OR p_district_id IS NOT NULL))
    OR (p_scope_type = 'district' AND (p_district_id IS NULL OR p_branch_id IS NOT NULL))
    OR (p_scope_type = 'branch' AND (p_branch_id IS NULL OR p_district_id IS NOT NULL)) THEN
    RAISE EXCEPTION 'Role assignment scope identifiers do not match the selected scope.'
      USING ERRCODE = '22023';
  END IF;

  IF p_scope_type = 'church' AND NOT private.has_permission('manage_roles', NULL) THEN
    RAISE EXCEPTION 'You do not have permission to manage church-wide roles.' USING ERRCODE = '42501';
  ELSIF p_scope_type = 'branch' AND NOT private.has_permission('manage_roles', p_branch_id) THEN
    RAISE EXCEPTION 'You do not have permission to manage roles for this branch.' USING ERRCODE = '42501';
  ELSIF p_scope_type = 'district'
    AND NOT private.has_district_permission('manage_roles', p_district_id) THEN
    RAISE EXCEPTION 'You do not have permission to manage roles for this district.' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles AS p
    WHERE p.id = p_profile_id AND p.record_status = 'active'
  ) THEN
    RAISE EXCEPTION 'The selected active church member does not exist.' USING ERRCODE = '23503';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.roles AS r WHERE r.id = p_role_id AND r.is_active) THEN
    RAISE EXCEPTION 'The selected role is unavailable.' USING ERRCODE = '23503';
  END IF;

  IF p_scope_type = 'branch' AND NOT EXISTS (
    SELECT 1 FROM public.church_branches AS b WHERE b.id = p_branch_id AND b.status = 'active'
  ) THEN
    RAISE EXCEPTION 'The selected branch does not exist or is inactive.' USING ERRCODE = '23503';
  END IF;

  IF p_scope_type = 'district' AND NOT EXISTS (
    SELECT 1 FROM public.districts AS d WHERE d.id = p_district_id AND d.status = 'active'
  ) THEN
    RAISE EXCEPTION 'The selected district does not exist or is inactive.' USING ERRCODE = '23503';
  END IF;

  IF NOT private.can_manage_target_role(p_role_id) THEN
    RAISE EXCEPTION 'Only church-wide administrators may assign Super Admin, Admin, or District Admin roles.'
      USING ERRCODE = '42501';
  END IF;

  SELECT a.*
  INTO v_assignment
  FROM public.profile_role_assignments AS a
  WHERE a.profile_id = p_profile_id
    AND a.role_id = p_role_id
    AND a.scope_type = p_scope_type
    AND a.branch_id IS NOT DISTINCT FROM p_branch_id
    AND a.district_id IS NOT DISTINCT FROM p_district_id
    AND a.is_active
    AND a.assigned_at <= now()
    AND (a.expires_at IS NULL OR a.expires_at > now())
  ORDER BY a.assigned_at DESC
  LIMIT 1;

  IF FOUND THEN
    RETURN v_assignment;
  END IF;

  INSERT INTO public.profile_role_assignments (
    profile_id, role_id, scope_type, branch_id, district_id, assigned_by_profile_id
  ) VALUES (
    p_profile_id, p_role_id, p_scope_type, p_branch_id, p_district_id, v_actor_profile_id
  )
  RETURNING * INTO v_assignment;

  RETURN v_assignment;
END;
$$;

CREATE OR REPLACE FUNCTION public.reactivate_profile_role_assignment(
  p_assignment_id uuid
)
RETURNS public.profile_role_assignments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_profile_id uuid;
  v_assignment public.profile_role_assignments;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Authentication is required.' USING ERRCODE = '42501';
  END IF;

  v_actor_profile_id := private.current_profile_id();
  IF v_actor_profile_id IS NULL THEN
    RAISE EXCEPTION 'An active linked church profile is required.' USING ERRCODE = '42501';
  END IF;

  SELECT a.*
  INTO v_assignment
  FROM public.profile_role_assignments AS a
  WHERE a.id = p_assignment_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'The selected role assignment does not exist.' USING ERRCODE = '23503';
  END IF;

  IF v_assignment.scope_type = 'church'
    AND NOT private.has_permission('manage_roles', NULL) THEN
    RAISE EXCEPTION 'You do not have permission to manage church-wide roles.' USING ERRCODE = '42501';
  ELSIF v_assignment.scope_type = 'branch'
    AND NOT private.has_permission('manage_roles', v_assignment.branch_id) THEN
    RAISE EXCEPTION 'You do not have permission to manage roles for this branch.' USING ERRCODE = '42501';
  ELSIF v_assignment.scope_type = 'district'
    AND NOT private.has_district_permission('manage_roles', v_assignment.district_id) THEN
    RAISE EXCEPTION 'You do not have permission to manage roles for this district.' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.roles AS r WHERE r.id = v_assignment.role_id AND r.is_active) THEN
    RAISE EXCEPTION 'The assigned role is no longer active.' USING ERRCODE = '23503';
  END IF;

  IF NOT private.can_manage_target_role(v_assignment.role_id) THEN
    RAISE EXCEPTION 'Only church-wide administrators may reactivate Super Admin, Admin, or District Admin roles.'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.profile_role_assignments
  SET
    is_active = true,
    expires_at = NULL,
    assigned_at = LEAST(assigned_at, now()),
    assigned_by_profile_id = v_actor_profile_id
  WHERE id = p_assignment_id
  RETURNING * INTO v_assignment;

  RETURN v_assignment;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_profile_role_assignment(
  p_assignment_id uuid,
  p_role_id uuid,
  p_scope_type text DEFAULT 'church',
  p_branch_id uuid DEFAULT NULL,
  p_district_id uuid DEFAULT NULL
)
RETURNS public.profile_role_assignments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_profile_id uuid;
  v_existing public.profile_role_assignments;
  v_updated public.profile_role_assignments;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Authentication is required.' USING ERRCODE = '42501';
  END IF;

  v_actor_profile_id := private.current_profile_id();
  IF v_actor_profile_id IS NULL THEN
    RAISE EXCEPTION 'An active linked church profile is required.' USING ERRCODE = '42501';
  END IF;

  IF p_scope_type NOT IN ('church', 'district', 'branch') THEN
    RAISE EXCEPTION 'Unsupported role assignment scope.' USING ERRCODE = '22023';
  END IF;

  IF (p_scope_type = 'church' AND (p_branch_id IS NOT NULL OR p_district_id IS NOT NULL))
    OR (p_scope_type = 'district' AND (p_district_id IS NULL OR p_branch_id IS NOT NULL))
    OR (p_scope_type = 'branch' AND (p_branch_id IS NULL OR p_district_id IS NOT NULL)) THEN
    RAISE EXCEPTION 'Role assignment scope identifiers do not match the selected scope.'
      USING ERRCODE = '22023';
  END IF;

  SELECT a.*
  INTO v_existing
  FROM public.profile_role_assignments AS a
  WHERE a.id = p_assignment_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'The selected role assignment does not exist.' USING ERRCODE = '23503';
  END IF;

  IF v_existing.scope_type = 'church'
    AND NOT private.has_permission('manage_roles', NULL) THEN
    RAISE EXCEPTION 'You do not have permission to manage church-wide roles.' USING ERRCODE = '42501';
  ELSIF v_existing.scope_type = 'branch'
    AND NOT private.has_permission('manage_roles', v_existing.branch_id) THEN
    RAISE EXCEPTION 'You do not have permission to manage roles for this branch.' USING ERRCODE = '42501';
  ELSIF v_existing.scope_type = 'district'
    AND NOT private.has_district_permission('manage_roles', v_existing.district_id) THEN
    RAISE EXCEPTION 'You do not have permission to manage roles for this district.' USING ERRCODE = '42501';
  END IF;

  IF p_scope_type = 'church'
    AND NOT private.has_permission('manage_roles', NULL) THEN
    RAISE EXCEPTION 'You do not have permission to assign church-wide roles.' USING ERRCODE = '42501';
  ELSIF p_scope_type = 'branch'
    AND NOT private.has_permission('manage_roles', p_branch_id) THEN
    RAISE EXCEPTION 'You do not have permission to assign roles for this branch.' USING ERRCODE = '42501';
  ELSIF p_scope_type = 'district'
    AND NOT private.has_district_permission('manage_roles', p_district_id) THEN
    RAISE EXCEPTION 'You do not have permission to assign roles for this district.' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.roles AS r WHERE r.id = p_role_id AND r.is_active) THEN
    RAISE EXCEPTION 'The selected role is unavailable.' USING ERRCODE = '23503';
  END IF;

  IF NOT private.can_manage_target_role(v_existing.role_id)
    OR NOT private.can_manage_target_role(p_role_id) THEN
    RAISE EXCEPTION 'Only church-wide administrators may modify Super Admin, Admin, or District Admin role assignments.'
      USING ERRCODE = '42501';
  END IF;

  IF p_scope_type = 'branch'
    AND NOT EXISTS (SELECT 1 FROM public.church_branches AS b WHERE b.id = p_branch_id AND b.status = 'active') THEN
    RAISE EXCEPTION 'The selected branch does not exist or is inactive.' USING ERRCODE = '23503';
  END IF;

  IF p_scope_type = 'district'
    AND NOT EXISTS (SELECT 1 FROM public.districts AS d WHERE d.id = p_district_id AND d.status = 'active') THEN
    RAISE EXCEPTION 'The selected district does not exist or is inactive.' USING ERRCODE = '23503';
  END IF;

  UPDATE public.profile_role_assignments
  SET
    role_id = p_role_id,
    scope_type = p_scope_type,
    branch_id = p_branch_id,
    district_id = p_district_id,
    assigned_by_profile_id = v_actor_profile_id
  WHERE id = p_assignment_id
  RETURNING * INTO v_updated;

  RETURN v_updated;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_profile_role_assignment(
  p_assignment_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_profile_id uuid;
  v_assignment public.profile_role_assignments;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Authentication is required.' USING ERRCODE = '42501';
  END IF;

  v_actor_profile_id := private.current_profile_id();
  IF v_actor_profile_id IS NULL THEN
    RAISE EXCEPTION 'An active linked church profile is required.' USING ERRCODE = '42501';
  END IF;

  SELECT a.*
  INTO v_assignment
  FROM public.profile_role_assignments AS a
  WHERE a.id = p_assignment_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF v_assignment.scope_type = 'church'
    AND NOT private.has_permission('manage_roles', NULL) THEN
    RAISE EXCEPTION 'You do not have permission to manage church-wide roles.' USING ERRCODE = '42501';
  ELSIF v_assignment.scope_type = 'branch'
    AND NOT private.has_permission('manage_roles', v_assignment.branch_id) THEN
    RAISE EXCEPTION 'You do not have permission to manage roles for this branch.' USING ERRCODE = '42501';
  ELSIF v_assignment.scope_type = 'district'
    AND NOT private.has_district_permission('manage_roles', v_assignment.district_id) THEN
    RAISE EXCEPTION 'You do not have permission to manage roles for this district.' USING ERRCODE = '42501';
  END IF;

  IF NOT private.can_manage_target_role(v_assignment.role_id) THEN
    RAISE EXCEPTION 'Only church-wide administrators may remove Super Admin, Admin, or District Admin role assignments.'
      USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.profile_role_assignments
  WHERE id = p_assignment_id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.assign_profile_role(uuid, uuid, text, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reactivate_profile_role_assignment(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_profile_role_assignment(uuid, uuid, text, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.delete_profile_role_assignment(uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.assign_profile_role(uuid, uuid, text, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reactivate_profile_role_assignment(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_profile_role_assignment(uuid, uuid, text, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_profile_role_assignment(uuid) TO authenticated;
