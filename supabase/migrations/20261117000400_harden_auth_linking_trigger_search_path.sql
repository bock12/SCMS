-- The explicit auth-to-directory linking trigger is introduced by
-- 20261113000100_secure_explicit_profile_auth_linking.sql. Its table references
-- are schema-qualified, so an empty function search_path is safe and preferred.
ALTER FUNCTION public.handle_new_user() SET search_path = '';

-- Trigger invocation does not require client EXECUTE. Preserve deny-by-default
-- direct invocation for both anonymous and authenticated API roles.
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
