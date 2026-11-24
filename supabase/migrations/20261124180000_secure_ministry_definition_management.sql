-- MEM-INT-004B: align ministry definition columns with the application and
-- expose scope-checked RPCs instead of direct client writes.

ALTER TABLE public.ministries
  ADD COLUMN IF NOT EXISTS leader_name text NOT NULL DEFAULT 'TBD',
  ADD COLUMN IF NOT EXISTS leader_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS member_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'service_department';

REVOKE ALL ON public.ministries FROM anon, authenticated;
GRANT SELECT ON public.ministries TO authenticated;

DO $ministry_definition_constraints$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.ministries'::regclass
      AND conname = 'ministries_member_count_nonnegative'
  ) THEN
    ALTER TABLE public.ministries
      ADD CONSTRAINT ministries_member_count_nonnegative CHECK (member_count >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.ministries'::regclass
      AND conname = 'ministries_type_check'
  ) THEN
    ALTER TABLE public.ministries
      ADD CONSTRAINT ministries_type_check
      CHECK (type IN ('social_fellowship', 'service_department'));
  END IF;
END;
$ministry_definition_constraints$;

UPDATE public.ministries
SET type = CASE WHEN entity_type = 'fellowship' THEN 'social_fellowship' ELSE 'service_department' END
WHERE type IS NULL OR type NOT IN ('social_fellowship', 'service_department');

UPDATE public.ministries ministry
SET member_count = (
  SELECT count(*)::integer
  FROM public.ministry_members assignment
  WHERE assignment.ministry_id = ministry.id
    AND assignment.status IN ('active', 'on_leave', 'in_training')
);

CREATE INDEX IF NOT EXISTS ix_ministries_leader_id
  ON public.ministries (leader_id)
  WHERE leader_id IS NOT NULL;

-- Backfill existing canonical ministry leader references into the roster.
-- This removes the need to infer membership from a leader-name string or browser cache.
UPDATE public.ministries ministry
SET leader_id = NULL,
    leader_name = 'TBD',
    updated_at = now()
WHERE ministry.status = 'active'
  AND ministry.leader_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.profiles member
    WHERE member.id = ministry.leader_id
      AND member.record_status = 'active'
      AND member.membership_status = 'active'
      AND (ministry.branch_id IS NULL OR member.branch_id = ministry.branch_id)
  );

INSERT INTO public.ministry_members (
  ministry_id, member_id, role_title, duty, status, joined_at
)
SELECT
  ministry.id,
  ministry.leader_id,
  'Department Leader',
  'Ministry leadership and team oversight',
  'active',
  CURRENT_DATE
FROM public.ministries ministry
JOIN public.profiles member
  ON member.id = ministry.leader_id
 AND member.record_status = 'active'
 AND member.membership_status = 'active'
WHERE ministry.status = 'active'
  AND ministry.leader_id IS NOT NULL
  AND (ministry.branch_id IS NULL OR member.branch_id = ministry.branch_id)
ON CONFLICT (ministry_id, member_id)
DO UPDATE SET
  role_title = 'Department Leader',
  duty = coalesce(public.ministry_members.duty, EXCLUDED.duty),
  status = 'active';

-- Managers retain read access to archived ministry definitions and rosters;
-- ordinary authenticated users continue to see active ministries only.
DROP POLICY IF EXISTS ministries_scoped_read ON public.ministries;
CREATE POLICY ministries_scoped_read
ON public.ministries
FOR SELECT TO authenticated
USING (
  (
    status = 'active'
    AND (
      branch_id IS NULL
      OR private.can_access_branch(branch_id)
      OR private.has_permission('view_members', branch_id)
    )
  )
  OR private.has_permission('manage_ministries', branch_id)
);

CREATE OR REPLACE FUNCTION private.refresh_ministry_member_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_ministry_id uuid;
  v_old_ministry_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_ministry_id := OLD.ministry_id;
  ELSE
    v_ministry_id := NEW.ministry_id;
  END IF;

  UPDATE public.ministries ministry
  SET member_count = (
        SELECT count(*)::integer
        FROM public.ministry_members assignment
        WHERE assignment.ministry_id = v_ministry_id
          AND assignment.status IN ('active', 'on_leave', 'in_training')
      ),
      updated_at = now()
  WHERE ministry.id = v_ministry_id;

  IF TG_OP = 'UPDATE' AND OLD.ministry_id IS DISTINCT FROM NEW.ministry_id THEN
    v_old_ministry_id := OLD.ministry_id;
    UPDATE public.ministries ministry
    SET member_count = (
          SELECT count(*)::integer
          FROM public.ministry_members assignment
          WHERE assignment.ministry_id = v_old_ministry_id
            AND assignment.status IN ('active', 'on_leave', 'in_training')
        ),
        updated_at = now()
    WHERE ministry.id = v_old_ministry_id;
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION private.refresh_ministry_member_count()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS refresh_ministry_member_count ON public.ministry_members;
CREATE TRIGGER refresh_ministry_member_count
AFTER INSERT OR UPDATE OF ministry_id, status OR DELETE
ON public.ministry_members
FOR EACH ROW
EXECUTE FUNCTION private.refresh_ministry_member_count();

CREATE OR REPLACE FUNCTION private.clear_transferred_ministry_leader()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.branch_id IS NOT DISTINCT FROM OLD.branch_id THEN
    RETURN NEW;
  END IF;

  UPDATE public.ministries
  SET leader_id = NULL,
      leader_name = 'TBD',
      updated_at = now()
  WHERE leader_id = NEW.id
    AND branch_id IS NOT NULL
    AND branch_id IS DISTINCT FROM NEW.branch_id;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.clear_transferred_ministry_leader()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS clear_transferred_ministry_leader ON public.profiles;
CREATE TRIGGER clear_transferred_ministry_leader
AFTER UPDATE OF branch_id ON public.profiles
FOR EACH ROW
WHEN (OLD.branch_id IS DISTINCT FROM NEW.branch_id)
EXECUTE FUNCTION private.clear_transferred_ministry_leader();

CREATE OR REPLACE FUNCTION private.create_ministry(
  p_branch_id uuid,
  p_name text,
  p_description text DEFAULT NULL,
  p_category text DEFAULT NULL,
  p_meeting_time text DEFAULT NULL,
  p_type text DEFAULT 'service_department',
  p_roles_and_responsibilities jsonb DEFAULT '[]'::jsonb,
  p_leader_id uuid DEFAULT NULL
)
RETURNS public.ministries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_profile_id uuid;
  v_leader public.profiles;
  v_ministry public.ministries;
  v_type text := coalesce(p_type, 'service_department');
  v_entity_type text;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Authentication is required.' USING ERRCODE = '42501';
  END IF;
  v_actor_profile_id := private.current_profile_id();
  IF v_actor_profile_id IS NULL THEN
    RAISE EXCEPTION 'An active linked church profile is required.' USING ERRCODE = '42501';
  END IF;
  IF NOT private.has_permission('manage_ministries', p_branch_id) THEN
    RAISE EXCEPTION 'You do not have permission to create ministries in this scope.' USING ERRCODE = '42501';
  END IF;
  IF length(pg_catalog.btrim(coalesce(p_name, ''))) NOT BETWEEN 2 AND 120 THEN
    RAISE EXCEPTION 'Ministry name must contain between 2 and 120 characters.' USING ERRCODE = '22023';
  END IF;
  IF v_type NOT IN ('social_fellowship', 'service_department') THEN
    RAISE EXCEPTION 'Invalid ministry type.' USING ERRCODE = '22023';
  END IF;
  IF p_roles_and_responsibilities IS NOT NULL
    AND pg_catalog.jsonb_typeof(p_roles_and_responsibilities) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Roles and responsibilities must be a JSON array.' USING ERRCODE = '22023';
  END IF;
  IF p_branch_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.church_branches branch
    WHERE branch.id = p_branch_id AND branch.status = 'active'
  ) THEN
    RAISE EXCEPTION 'The selected branch is unavailable or inactive.' USING ERRCODE = '23503';
  END IF;

  IF p_leader_id IS NOT NULL THEN
    SELECT * INTO v_leader
    FROM public.profiles member
    WHERE member.id = p_leader_id
      AND member.record_status = 'active'
      AND member.membership_status = 'active';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'The selected ministry leader must be an active congregation member.' USING ERRCODE = '23503';
    END IF;
    IF p_branch_id IS NOT NULL AND v_leader.branch_id IS DISTINCT FROM p_branch_id THEN
      RAISE EXCEPTION 'The selected ministry leader must belong to the ministry branch.' USING ERRCODE = '23514';
    END IF;
  END IF;

  v_entity_type := CASE WHEN v_type = 'social_fellowship' THEN 'fellowship' ELSE 'department' END;

  INSERT INTO public.ministries (
    branch_id, name, description, leader_name, leader_id, meeting_time,
    member_count, category, entity_type, type, roles_and_responsibilities,
    status
  )
  VALUES (
    p_branch_id,
    pg_catalog.btrim(p_name),
    coalesce(p_description, ''),
    CASE WHEN p_leader_id IS NULL THEN 'TBD' ELSE pg_catalog.concat_ws(' ', v_leader.first_name, v_leader.last_name) END,
    p_leader_id,
    coalesce(nullif(pg_catalog.btrim(p_meeting_time), ''), 'Weekly Gathering'),
    0,
    coalesce(nullif(pg_catalog.btrim(p_category), ''), 'General'),
    v_entity_type,
    v_type,
    coalesce(p_roles_and_responsibilities, '[]'::jsonb),
    'active'
  )
  RETURNING * INTO v_ministry;

  IF p_leader_id IS NOT NULL THEN
    PERFORM private.manage_ministry_member(
      'add', v_ministry.id, NULL, p_leader_id,
      'Department Leader', 'Ministry leadership and team oversight', 'active', CURRENT_DATE
    );
    SELECT * INTO v_ministry FROM public.ministries WHERE id = v_ministry.id;
  END IF;

  RETURN v_ministry;
END;
$$;

CREATE OR REPLACE FUNCTION private.update_ministry(
  p_ministry_id uuid,
  p_name text,
  p_description text,
  p_category text,
  p_meeting_time text,
  p_type text,
  p_roles_and_responsibilities jsonb,
  p_leader_id uuid
)
RETURNS public.ministries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_profile_id uuid;
  v_ministry public.ministries;
  v_leader public.profiles;
  v_old_leader_id uuid;
  v_entity_type text;
  v_existing_assignment public.ministry_members;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Authentication is required.' USING ERRCODE = '42501';
  END IF;
  v_actor_profile_id := private.current_profile_id();
  IF v_actor_profile_id IS NULL THEN
    RAISE EXCEPTION 'An active linked church profile is required.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_ministry
  FROM public.ministries
  WHERE id = p_ministry_id
  FOR UPDATE;
  IF NOT FOUND OR v_ministry.status <> 'active' THEN
    RAISE EXCEPTION 'The selected ministry is unavailable or inactive.' USING ERRCODE = '23503';
  END IF;
  IF NOT private.has_permission('manage_ministries', v_ministry.branch_id) THEN
    RAISE EXCEPTION 'You do not have permission to update this ministry.' USING ERRCODE = '42501';
  END IF;
  IF length(pg_catalog.btrim(coalesce(p_name, ''))) NOT BETWEEN 2 AND 120 THEN
    RAISE EXCEPTION 'Ministry name must contain between 2 and 120 characters.' USING ERRCODE = '22023';
  END IF;
  IF p_type NOT IN ('social_fellowship', 'service_department') THEN
    RAISE EXCEPTION 'Invalid ministry type.' USING ERRCODE = '22023';
  END IF;
  IF p_roles_and_responsibilities IS NOT NULL
    AND pg_catalog.jsonb_typeof(p_roles_and_responsibilities) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Roles and responsibilities must be a JSON array.' USING ERRCODE = '22023';
  END IF;

  IF p_leader_id IS NOT NULL THEN
    SELECT * INTO v_leader
    FROM public.profiles member
    WHERE member.id = p_leader_id
      AND member.record_status = 'active'
      AND member.membership_status = 'active';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'The selected ministry leader must be an active congregation member.' USING ERRCODE = '23503';
    END IF;
    IF v_ministry.branch_id IS NOT NULL AND v_leader.branch_id IS DISTINCT FROM v_ministry.branch_id THEN
      RAISE EXCEPTION 'The selected ministry leader must belong to the ministry branch.' USING ERRCODE = '23514';
    END IF;
  END IF;

  v_old_leader_id := v_ministry.leader_id;
  v_entity_type := CASE WHEN p_type = 'social_fellowship' THEN 'fellowship' ELSE 'department' END;

  UPDATE public.ministries
  SET name = pg_catalog.btrim(p_name),
      description = coalesce(p_description, ''),
      leader_name = CASE WHEN p_leader_id IS NULL THEN 'TBD' ELSE pg_catalog.concat_ws(' ', v_leader.first_name, v_leader.last_name) END,
      leader_id = p_leader_id,
      meeting_time = coalesce(nullif(pg_catalog.btrim(p_meeting_time), ''), 'Weekly Gathering'),
      category = coalesce(nullif(pg_catalog.btrim(p_category), ''), 'General'),
      entity_type = v_entity_type,
      type = p_type,
      roles_and_responsibilities = coalesce(p_roles_and_responsibilities, '[]'::jsonb),
      updated_at = now()
  WHERE id = p_ministry_id
  RETURNING * INTO v_ministry;

  IF v_old_leader_id IS DISTINCT FROM p_leader_id AND v_old_leader_id IS NOT NULL THEN
    UPDATE public.ministry_members
    SET role_title = 'Team Member',
        duty = coalesce(duty, 'Ministry team member')
    WHERE ministry_id = p_ministry_id
      AND member_id = v_old_leader_id
      AND status <> 'inactive'
      AND role_title = 'Department Leader';
  END IF;

  IF p_leader_id IS NOT NULL THEN
    SELECT * INTO v_existing_assignment
    FROM public.ministry_members
    WHERE ministry_id = p_ministry_id AND member_id = p_leader_id
    FOR UPDATE;

    IF FOUND THEN
      PERFORM private.manage_ministry_member(
        'update', NULL, v_existing_assignment.id, NULL,
        'Department Leader',
        coalesce(v_existing_assignment.duty, 'Ministry leadership and team oversight'),
        'active', NULL
      );
    ELSE
      PERFORM private.manage_ministry_member(
        'add', p_ministry_id, NULL, p_leader_id,
        'Department Leader', 'Ministry leadership and team oversight', 'active', CURRENT_DATE
      );
    END IF;
  END IF;

  SELECT * INTO v_ministry FROM public.ministries WHERE id = p_ministry_id;
  RETURN v_ministry;
END;
$$;

CREATE OR REPLACE FUNCTION private.archive_ministry(p_ministry_id uuid)
RETURNS public.ministries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_ministry public.ministries;
BEGIN
  IF (SELECT auth.uid()) IS NULL OR private.current_profile_id() IS NULL THEN
    RAISE EXCEPTION 'An authenticated active church profile is required.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_ministry
  FROM public.ministries
  WHERE id = p_ministry_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The selected ministry does not exist.' USING ERRCODE = '23503';
  END IF;
  IF NOT private.has_permission('manage_ministries', v_ministry.branch_id) THEN
    RAISE EXCEPTION 'You do not have permission to archive this ministry.' USING ERRCODE = '42501';
  END IF;

  UPDATE public.ministries
  SET status = 'archived',
      updated_at = now()
  WHERE id = p_ministry_id
  RETURNING * INTO v_ministry;

  RETURN v_ministry;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_ministry(
  p_branch_id uuid,
  p_name text,
  p_description text DEFAULT NULL,
  p_category text DEFAULT NULL,
  p_meeting_time text DEFAULT NULL,
  p_type text DEFAULT 'service_department',
  p_roles_and_responsibilities jsonb DEFAULT '[]'::jsonb,
  p_leader_id uuid DEFAULT NULL
)
RETURNS public.ministries
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT private.create_ministry(
    p_branch_id, p_name, p_description, p_category, p_meeting_time,
    p_type, p_roles_and_responsibilities, p_leader_id
  );
$$;

CREATE OR REPLACE FUNCTION public.update_ministry(
  p_ministry_id uuid,
  p_name text,
  p_description text,
  p_category text,
  p_meeting_time text,
  p_type text,
  p_roles_and_responsibilities jsonb,
  p_leader_id uuid
)
RETURNS public.ministries
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT private.update_ministry(
    p_ministry_id, p_name, p_description, p_category,
    p_meeting_time, p_type, p_roles_and_responsibilities, p_leader_id
  );
$$;

CREATE OR REPLACE FUNCTION public.archive_ministry(p_ministry_id uuid)
RETURNS public.ministries
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT private.archive_ministry(p_ministry_id);
$$;

REVOKE ALL ON FUNCTION private.create_ministry(uuid, text, text, text, text, text, jsonb, uuid)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.update_ministry(uuid, text, text, text, text, text, jsonb, uuid)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.archive_ministry(uuid)
  FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.create_ministry(uuid, text, text, text, text, text, jsonb, uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION private.update_ministry(uuid, text, text, text, text, text, jsonb, uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION private.archive_ministry(uuid)
  TO authenticated;

REVOKE ALL ON FUNCTION public.create_ministry(uuid, text, text, text, text, text, jsonb, uuid)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_ministry(uuid, text, text, text, text, text, jsonb, uuid)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.archive_ministry(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_ministry(uuid, text, text, text, text, text, jsonb, uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_ministry(uuid, text, text, text, text, text, jsonb, uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.archive_ministry(uuid)
  TO authenticated;
