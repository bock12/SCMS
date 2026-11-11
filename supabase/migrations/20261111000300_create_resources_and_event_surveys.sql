-- RES-INT-001: church resource library and event-linked surveys.
-- Apply after the existing SCMS baseline schema. No branch/tenant expansion is introduced.

CREATE TABLE IF NOT EXISTS public.church_resources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'General',
  resource_type TEXT NOT NULL CHECK (resource_type IN ('document', 'video', 'audio', 'image', 'link')) DEFAULT 'document',
  resource_url TEXT NOT NULL,
  visibility TEXT NOT NULL CHECK (visibility IN ('public', 'members_only')) DEFAULT 'members_only',
  status TEXT NOT NULL CHECK (status IN ('draft', 'published', 'archived')) DEFAULT 'draft',
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_church_resources_status_category
  ON public.church_resources(status, category);

CREATE TABLE IF NOT EXISTS public.event_surveys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  respondent_scope TEXT NOT NULL CHECK (respondent_scope IN ('all_members', 'registrants', 'attendees')) DEFAULT 'attendees',
  status TEXT NOT NULL CHECK (status IN ('draft', 'published', 'closed')) DEFAULT 'draft',
  opens_at TIMESTAMPTZ,
  closes_at TIMESTAMPTZ,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT event_surveys_window_valid CHECK (
    opens_at IS NULL OR closes_at IS NULL OR closes_at > opens_at
  )
);

CREATE INDEX IF NOT EXISTS idx_event_surveys_event_id ON public.event_surveys(event_id);

CREATE TABLE IF NOT EXISTS public.event_survey_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id UUID NOT NULL REFERENCES public.event_surveys(id) ON DELETE CASCADE,
  question_text TEXT NOT NULL,
  question_type TEXT NOT NULL CHECK (
    question_type IN ('short_text', 'long_text', 'single_choice', 'multiple_choice', 'rating', 'yes_no')
  ),
  is_required BOOLEAN NOT NULL DEFAULT false,
  options JSONB NOT NULL DEFAULT '[]'::jsonb,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_event_survey_questions_survey_order
  ON public.event_survey_questions(survey_id, sort_order);

CREATE TABLE IF NOT EXISTS public.event_survey_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id UUID NOT NULL REFERENCES public.event_surveys(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT event_survey_one_response_per_member UNIQUE (survey_id, member_id)
);

CREATE TABLE IF NOT EXISTS public.event_survey_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  response_id UUID NOT NULL REFERENCES public.event_survey_responses(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES public.event_survey_questions(id) ON DELETE CASCADE,
  answer_value JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT event_survey_one_answer_per_question UNIQUE (response_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_event_survey_responses_survey ON public.event_survey_responses(survey_id);
CREATE INDEX IF NOT EXISTS idx_event_survey_answers_response ON public.event_survey_answers(response_id);

ALTER TABLE public.church_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_surveys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_survey_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_survey_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_survey_answers ENABLE ROW LEVEL SECURITY;

-- Resource metadata is readable when published and public, or by signed-in members.
CREATE POLICY "Read published public resources"
  ON public.church_resources FOR SELECT
  USING (status = 'published' AND visibility = 'public');

CREATE POLICY "Read published member resources"
  ON public.church_resources FOR SELECT TO authenticated
  USING (status = 'published' AND visibility = 'members_only');

CREATE POLICY "Resource managers manage resources"
  ON public.church_resources FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.primary_role IN ('super_admin', 'admin', 'pastor')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.primary_role IN ('super_admin', 'admin', 'pastor')
  ));

CREATE POLICY "Read published event surveys"
  ON public.event_surveys FOR SELECT
  USING (status = 'published');

CREATE POLICY "Survey managers manage surveys"
  ON public.event_surveys FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.primary_role IN ('super_admin', 'admin', 'pastor')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.primary_role IN ('super_admin', 'admin', 'pastor')
  ));

CREATE POLICY "Read questions for published surveys"
  ON public.event_survey_questions FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.event_surveys s
    WHERE s.id = survey_id AND s.status = 'published'
  ));

CREATE POLICY "Survey managers manage questions"
  ON public.event_survey_questions FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.primary_role IN ('super_admin', 'admin', 'pastor')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.primary_role IN ('super_admin', 'admin', 'pastor')
  ));

CREATE POLICY "Members read own survey responses"
  ON public.event_survey_responses FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.members m
    WHERE m.id = member_id AND m.profile_id = auth.uid()
  ));

CREATE POLICY "Members submit own survey responses"
  ON public.event_survey_responses FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.members m
    WHERE m.id = member_id AND m.profile_id = auth.uid() AND m.status = 'active'
  ));

CREATE POLICY "Survey managers read all responses"
  ON public.event_survey_responses FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.primary_role IN ('super_admin', 'admin', 'pastor')
  ));

CREATE POLICY "Members read own survey answers"
  ON public.event_survey_answers FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1
    FROM public.event_survey_responses r
    JOIN public.members m ON m.id = r.member_id
    WHERE r.id = event_survey_answers.response_id AND m.profile_id = auth.uid()
  ));

CREATE POLICY "Members submit answers to own responses"
  ON public.event_survey_answers FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1
    FROM public.event_survey_responses r
    JOIN public.members m ON m.id = r.member_id
    JOIN public.event_surveys s ON s.id = r.survey_id
    WHERE r.id = event_survey_answers.response_id
      AND m.profile_id = auth.uid()
      AND s.status = 'published'
      AND (s.opens_at IS NULL OR s.opens_at <= now())
      AND (s.closes_at IS NULL OR s.closes_at > now())
      AND EXISTS (
        SELECT 1 FROM public.event_survey_questions q
        WHERE q.id = event_survey_answers.question_id AND q.survey_id = s.id
      )
  ));

CREATE POLICY "Survey managers read all answers"
  ON public.event_survey_answers FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.primary_role IN ('super_admin', 'admin', 'pastor')
  ));
