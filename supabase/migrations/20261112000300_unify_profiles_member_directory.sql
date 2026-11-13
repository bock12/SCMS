-- ADR-0001: Unify profiles and members into a single canonical Member Directory (public.profiles)
-- with optional portal authentication via nullable unique auth_user_id.
-- Forward-only migration: DO NOT execute until Supabase connection is enabled.

ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'finance_officer';

-- 1. Decouple public.profiles.id from auth.users(id) and add canonical directory + optional auth columns.
DO $$
DECLARE
  fk RECORD;
BEGIN
  FOR fk IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.profiles'::regclass
      AND contype = 'f'
      AND confrelid = 'auth.users'::regclass
  LOOP
    EXECUTE format('ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS %I', fk.conname);
  END LOOP;
END $$;

ALTER TABLE public.profiles
  ALTER COLUMN id SET DEFAULT gen_random_uuid(),
  ALTER COLUMN email DROP NOT NULL,
  ALTER COLUMN email SET DEFAULT '';

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS auth_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS gender TEXT DEFAULT 'other',
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS membership_status public.member_status DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS membership_date DATE DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS department_name TEXT,
  ADD COLUMN IF NOT EXISTS assigned_department TEXT,
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
    WHERE conname = 'profiles_gender_check'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_gender_check
      CHECK (gender IS NULL OR gender IN ('male', 'female', 'other'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_portal_status_check'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_portal_status_check
      CHECK (status IN ('active', 'suspended', 'archived'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_marital_status_check'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_marital_status_check
      CHECK (marital_status IS NULL OR marital_status IN ('Single', 'Married', 'Widowed', 'Divorced'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_auth_user_id_unique
  ON public.profiles(auth_user_id)
  WHERE auth_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_membership_status
  ON public.profiles(membership_status);

-- Backfill auth_user_id for pre-migration profile rows whose PK matched auth.users(id).
UPDATE public.profiles p
SET auth_user_id = p.id
FROM auth.users u
WHERE p.auth_user_id IS NULL
  AND u.id = p.id;

-- 2. Merge public.members into public.profiles and record old_member_id -> canonical_profile_id map.
DO $$
DECLARE
  m RECORD;
  v_target_id UUID;
BEGIN
  IF to_regclass('public.members') IS NOT NULL THEN
    CREATE TEMP TABLE IF NOT EXISTS pg_temp.member_id_map (
      old_member_id UUID PRIMARY KEY,
      canonical_profile_id UUID NOT NULL
    ) ON COMMIT DROP;

    TRUNCATE TABLE pg_temp.member_id_map;

    FOR m IN SELECT * FROM public.members LOOP
      IF m.profile_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = m.profile_id) THEN
        v_target_id := m.profile_id;

        UPDATE public.profiles p
        SET
          branch_id = COALESCE(p.branch_id, m.branch_id),
          first_name = COALESCE(NULLIF(btrim(p.first_name), ''), m.first_name),
          last_name = COALESCE(NULLIF(btrim(p.last_name), ''), m.last_name),
          email = COALESCE(NULLIF(btrim(p.email), ''), COALESCE(NULLIF(btrim(m.email), ''), '')),
          phone = COALESCE(NULLIF(btrim(p.phone), ''), COALESCE(m.phone, '')),
          avatar_url = COALESCE(NULLIF(btrim(p.avatar_url), ''), COALESCE(m.avatar_url, '')),
          gender = COALESCE(m.gender, p.gender, 'other'),
          membership_status = COALESCE(m.status, p.membership_status, 'active'::public.member_status),
          membership_date = COALESCE(m.membership_date, p.membership_date, CURRENT_DATE),
          is_baptized = COALESCE(m.is_baptized, p.is_baptized, false),
          baptism_date = COALESCE(m.baptism_date, p.baptism_date),
          baptized_by = COALESCE(m.baptized_by, p.baptized_by),
          date_of_birth = COALESCE(m.date_of_birth, p.date_of_birth),
          marital_status = COALESCE(m.marital_status, p.marital_status),
          marriage_date = COALESCE(m.marriage_date, p.marriage_date)
        WHERE p.id = v_target_id;
      ELSE
        IF EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = m.id) THEN
          v_target_id := gen_random_uuid();
        ELSE
          v_target_id := m.id;
        END IF;

        INSERT INTO public.profiles (
          id,
          auth_user_id,
          branch_id,
          first_name,
          last_name,
          email,
          phone,
          avatar_url,
          primary_role,
          status,
          gender,
          membership_status,
          membership_date,
          is_baptized,
          baptism_date,
          baptized_by,
          date_of_birth,
          marital_status,
          marriage_date,
          created_at
        ) VALUES (
          v_target_id,
          NULL,
          m.branch_id,
          m.first_name,
          m.last_name,
          COALESCE(NULLIF(btrim(m.email), ''), ''),
          COALESCE(m.phone, ''),
          COALESCE(m.avatar_url, ''),
          'member',
          'active',
          COALESCE(m.gender, 'other'),
          COALESCE(m.status, 'active'::public.member_status),
          COALESCE(m.membership_date, CURRENT_DATE),
          COALESCE(m.is_baptized, false),
          m.baptism_date,
          m.baptized_by,
          m.date_of_birth,
          m.marital_status,
          m.marriage_date,
          COALESCE(m.created_at, now())
        );
      END IF;

      INSERT INTO pg_temp.member_id_map (old_member_id, canonical_profile_id)
      VALUES (m.id, v_target_id)
      ON CONFLICT (old_member_id) DO UPDATE SET canonical_profile_id = EXCLUDED.canonical_profile_id;
    END LOOP;

    -- 3. Drop all foreign keys still pointing at public.members, remap member_id values,
    --    and repoint those foreign keys to public.profiles(id).
    DECLARE
      ref RECORD;
    BEGIN
      FOR ref IN
        SELECT conrelid::regclass AS tbl, conname
        FROM pg_constraint
        WHERE contype = 'f'
          AND confrelid = 'public.members'::regclass
      LOOP
        EXECUTE format('ALTER TABLE %s DROP CONSTRAINT IF EXISTS %I', ref.tbl, ref.conname);
      END LOOP;
    END;

    IF to_regclass('public.ministry_members') IS NOT NULL THEN
      UPDATE public.ministry_members mm
      SET member_id = map.canonical_profile_id
      FROM pg_temp.member_id_map map
      WHERE mm.member_id = map.old_member_id
        AND mm.member_id <> map.canonical_profile_id;

      ALTER TABLE public.ministry_members
        ADD CONSTRAINT ministry_members_member_id_fkey
        FOREIGN KEY (member_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
    END IF;

    IF to_regclass('public.member_transfers') IS NOT NULL THEN
      UPDATE public.member_transfers mt
      SET member_id = map.canonical_profile_id
      FROM pg_temp.member_id_map map
      WHERE mt.member_id = map.old_member_id
        AND mt.member_id <> map.canonical_profile_id;

      ALTER TABLE public.member_transfers
        ADD CONSTRAINT member_transfers_member_id_fkey
        FOREIGN KEY (member_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
    END IF;

    IF to_regclass('public.event_registrations') IS NOT NULL THEN
      UPDATE public.event_registrations er
      SET member_id = map.canonical_profile_id
      FROM pg_temp.member_id_map map
      WHERE er.member_id = map.old_member_id
        AND er.member_id <> map.canonical_profile_id;

      ALTER TABLE public.event_registrations
        ADD CONSTRAINT event_registrations_member_id_fkey
        FOREIGN KEY (member_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
    END IF;

    IF to_regclass('public.event_survey_responses') IS NOT NULL THEN
      UPDATE public.event_survey_responses esr
      SET member_id = map.canonical_profile_id
      FROM pg_temp.member_id_map map
      WHERE esr.member_id = map.old_member_id
        AND esr.member_id <> map.canonical_profile_id;

      ALTER TABLE public.event_survey_responses
        ADD CONSTRAINT event_survey_responses_member_id_fkey
        FOREIGN KEY (member_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

-- 4. Update RLS policies and RPCs to resolve authenticated members via auth_user_id and profiles.
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = auth_user_id);

DROP POLICY IF EXISTS "Read published member resources" ON public.church_resources;
CREATE POLICY "Read published member resources"
  ON public.church_resources FOR SELECT TO authenticated
  USING (
    status = 'published'
    AND visibility = 'members_only'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.auth_user_id = auth.uid() AND p.membership_status = 'active'
    )
  );

DROP POLICY IF EXISTS "Resource managers manage resources" ON public.church_resources;
CREATE POLICY "Resource managers manage resources"
  ON public.church_resources FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.auth_user_id = auth.uid() AND p.primary_role IN ('super_admin', 'admin', 'pastor')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.auth_user_id = auth.uid() AND p.primary_role IN ('super_admin', 'admin', 'pastor')
  ));

DROP POLICY IF EXISTS "Read published event surveys" ON public.event_surveys;
CREATE POLICY "Read published event surveys"
  ON public.event_surveys FOR SELECT TO authenticated
  USING (
    status = 'published'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.auth_user_id = auth.uid() AND p.membership_status = 'active'
    )
  );

DROP POLICY IF EXISTS "Survey managers manage surveys" ON public.event_surveys;
CREATE POLICY "Survey managers manage surveys"
  ON public.event_surveys FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.auth_user_id = auth.uid() AND p.primary_role IN ('super_admin', 'admin', 'pastor')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.auth_user_id = auth.uid() AND p.primary_role IN ('super_admin', 'admin', 'pastor')
  ));

DROP POLICY IF EXISTS "Read questions for published surveys" ON public.event_survey_questions;
CREATE POLICY "Read questions for published surveys"
  ON public.event_survey_questions FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.event_surveys s
      WHERE s.id = survey_id AND s.status = 'published'
    )
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.auth_user_id = auth.uid() AND p.membership_status = 'active'
    )
  );

DROP POLICY IF EXISTS "Survey managers manage questions" ON public.event_survey_questions;
CREATE POLICY "Survey managers manage questions"
  ON public.event_survey_questions FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.auth_user_id = auth.uid() AND p.primary_role IN ('super_admin', 'admin', 'pastor')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.auth_user_id = auth.uid() AND p.primary_role IN ('super_admin', 'admin', 'pastor')
  ));

DROP POLICY IF EXISTS "Members read own survey responses" ON public.event_survey_responses;
CREATE POLICY "Members read own survey responses"
  ON public.event_survey_responses FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = member_id AND p.auth_user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "Members submit own survey responses" ON public.event_survey_responses;
CREATE POLICY "Members submit own survey responses"
  ON public.event_survey_responses FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.event_surveys s ON s.id = event_survey_responses.survey_id
    WHERE p.id = event_survey_responses.member_id
      AND p.auth_user_id = auth.uid()
      AND p.membership_status = 'active'
      AND s.status = 'published'
      AND (s.opens_at IS NULL OR s.opens_at <= now())
      AND (s.closes_at IS NULL OR s.closes_at > now())
      AND (
        s.respondent_scope = 'all_members'
        OR EXISTS (
          SELECT 1
          FROM public.event_registrations er
          WHERE er.event_id = s.event_id
            AND er.member_id = p.id
            AND (
              (s.respondent_scope = 'registrants' AND er.status IN ('confirmed', 'checked_in', 'attended', 'absent'))
              OR (s.respondent_scope = 'attendees' AND er.status IN ('checked_in', 'attended'))
            )
        )
      )
  ));

DROP POLICY IF EXISTS "Survey managers read all responses" ON public.event_survey_responses;
CREATE POLICY "Survey managers read all responses"
  ON public.event_survey_responses FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.auth_user_id = auth.uid() AND p.primary_role IN ('super_admin', 'admin', 'pastor')
  ));

DROP POLICY IF EXISTS "Members read own survey answers" ON public.event_survey_answers;
CREATE POLICY "Members read own survey answers"
  ON public.event_survey_answers FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1
    FROM public.event_survey_responses r
    JOIN public.profiles p ON p.id = r.member_id
    WHERE r.id = event_survey_answers.response_id AND p.auth_user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "Members submit answers to own responses" ON public.event_survey_answers;
CREATE POLICY "Members submit answers to own responses"
  ON public.event_survey_answers FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1
    FROM public.event_survey_responses r
    JOIN public.profiles p ON p.id = r.member_id
    JOIN public.event_surveys s ON s.id = r.survey_id
    WHERE r.id = event_survey_answers.response_id
      AND p.auth_user_id = auth.uid()
      AND s.status = 'published'
      AND (s.opens_at IS NULL OR s.opens_at <= now())
      AND (s.closes_at IS NULL OR s.closes_at > now())
      AND p.membership_status = 'active'
      AND (
        s.respondent_scope = 'all_members'
        OR EXISTS (
          SELECT 1
          FROM public.event_registrations er
          WHERE er.event_id = s.event_id
            AND er.member_id = p.id
            AND (
              (s.respondent_scope = 'registrants' AND er.status IN ('confirmed', 'checked_in', 'attended', 'absent'))
              OR (s.respondent_scope = 'attendees' AND er.status IN ('checked_in', 'attended'))
            )
        )
      )
      AND EXISTS (
        SELECT 1 FROM public.event_survey_questions q
        WHERE q.id = event_survey_answers.question_id AND q.survey_id = s.id
      )
  ));

DROP POLICY IF EXISTS "Survey managers read all answers" ON public.event_survey_answers;
CREATE POLICY "Survey managers read all answers"
  ON public.event_survey_answers FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.auth_user_id = auth.uid() AND p.primary_role IN ('super_admin', 'admin', 'pastor')
  ));

CREATE OR REPLACE FUNCTION public.submit_event_survey_response(
  p_survey_id UUID,
  p_answers JSONB
)
RETURNS public.event_survey_responses
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_member_id UUID;
  v_response public.event_survey_responses;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication is required to submit a survey.'
      USING ERRCODE = '42501';
  END IF;

  IF jsonb_typeof(p_answers) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Survey answers must be provided as a JSON array.'
      USING ERRCODE = '22023';
  END IF;

  SELECT p.id
    INTO v_member_id
    FROM public.profiles AS p
   WHERE p.auth_user_id = auth.uid()
     AND p.membership_status = 'active'
   LIMIT 1;

  IF v_member_id IS NULL THEN
    RAISE EXCEPTION 'The authenticated user is not linked to an active member record.'
      USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM jsonb_array_elements(p_answers) AS submitted(answer)
     WHERE submitted.answer->>'question_id' IS NULL
        OR submitted.answer->'answer_value' IS NULL
        OR submitted.answer->'answer_value' = 'null'::jsonb
        OR NOT EXISTS (
          SELECT 1
            FROM public.event_survey_questions AS q
           WHERE q.id::text = submitted.answer->>'question_id'
             AND q.survey_id = p_survey_id
        )
  ) THEN
    RAISE EXCEPTION 'One or more answers are invalid for this survey.'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT submitted.answer->>'question_id'
      FROM jsonb_array_elements(p_answers) AS submitted(answer)
     GROUP BY submitted.answer->>'question_id'
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'A survey question can only be answered once.'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.event_survey_questions AS q
     WHERE q.survey_id = p_survey_id
       AND q.is_required
       AND NOT EXISTS (
         SELECT 1
           FROM jsonb_array_elements(p_answers) AS submitted(answer)
          WHERE submitted.answer->>'question_id' = q.id::text
            AND submitted.answer->'answer_value' IS NOT NULL
            AND submitted.answer->'answer_value' <> 'null'::jsonb
            AND NOT (
              (jsonb_typeof(submitted.answer->'answer_value') = 'string'
                AND btrim(submitted.answer->>'answer_value') = '')
              OR (jsonb_typeof(submitted.answer->'answer_value') = 'array'
                AND jsonb_array_length(submitted.answer->'answer_value') = 0)
            )
       )
  ) THEN
    RAISE EXCEPTION 'Please answer every required survey question.'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.event_survey_responses (survey_id, member_id, submitted_at)
  VALUES (p_survey_id, v_member_id, now())
  RETURNING * INTO v_response;

  INSERT INTO public.event_survey_answers (response_id, question_id, answer_value)
  SELECT
    v_response.id,
    (submitted.answer->>'question_id')::uuid,
    submitted.answer->'answer_value'
  FROM jsonb_array_elements(p_answers) AS submitted(answer);

  RETURN v_response;
END;
$function$;

REVOKE ALL ON FUNCTION public.submit_event_survey_response(UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_event_survey_response(UUID, JSONB) TO authenticated;

-- 5. Explicit auth-to-person linking.
-- Only a trusted service-role provisioning flow may set
-- auth.users.raw_app_meta_data.provisioned_profile_id. Email equality alone
-- must never claim an existing church directory record.
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
    -- No directory row is created for an unprovisioned auth account.
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

-- 6. Retire obsolete public.members table only after all rows and foreign keys have been migrated.
DROP TABLE IF EXISTS public.members;
