-- Remove permissive policies left by the earlier role-name-based resource
-- and survey migrations. The current security contract uses scoped permission
-- checks for reads and the private atomic survey submission routine.

begin;

drop policy if exists "Users can update own profile" on public.profiles;

drop policy if exists "Read published public resources" on public.church_resources;
drop policy if exists "Read published member resources" on public.church_resources;
drop policy if exists "Resource managers manage resources" on public.church_resources;

drop policy if exists "Read published event surveys" on public.event_surveys;
drop policy if exists "Survey managers manage surveys" on public.event_surveys;

drop policy if exists "Read questions for published surveys" on public.event_survey_questions;
drop policy if exists "Survey managers manage questions" on public.event_survey_questions;

drop policy if exists "Members submit own survey responses" on public.event_survey_responses;
drop policy if exists "Survey managers read all responses" on public.event_survey_responses;

drop policy if exists "Members submit answers to own responses" on public.event_survey_answers;
drop policy if exists "Survey managers read all answers" on public.event_survey_answers;

commit;
