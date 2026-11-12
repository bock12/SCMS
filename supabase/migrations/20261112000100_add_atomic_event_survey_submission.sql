-- RES-INT-001: atomic member survey submission.
-- SECURITY INVOKER is intentional: table grants and RLS policies remain in force.
-- A failed answer insert rolls back the response insert as part of the same RPC transaction.

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

  SELECT m.id
    INTO v_member_id
    FROM public.members AS m
   WHERE m.profile_id = auth.uid()
     AND m.status = 'active'
   LIMIT 1;

  IF v_member_id IS NULL THEN
    RAISE EXCEPTION 'The authenticated user is not linked to an active member record.'
      USING ERRCODE = '42501';
  END IF;

  -- Reject malformed, duplicate, or foreign question IDs before inserting.
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

  -- Required-question validation is enforced by the database, not just the UI.
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

  -- RLS on both tables validates survey publication, time window, member
  -- ownership, and respondent eligibility. Any failure rolls back all writes.
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
