-- Verification for persisted, scope-aware payment-channel settings API.
-- Runs after 20261125000100_add_payment_channel_settings_api.sql.

DO $payment_channel_security_checks$
DECLARE
  v_signature text;
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.payment_channels'::regclass) THEN
    RAISE EXCEPTION 'public.payment_channels must have RLS enabled';
  END IF;

  IF has_table_privilege('authenticated', 'public.payment_channels', 'INSERT')
     OR has_table_privilege('authenticated', 'public.payment_channels', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.payment_channels', 'DELETE') THEN
    RAISE EXCEPTION 'Authenticated role must not have direct DML privileges on public.payment_channels';
  END IF;

  FOREACH v_signature IN ARRAY ARRAY[
    'public.get_payment_channel_configuration(text,uuid)',
    'public.save_payment_channel(text,uuid,jsonb)',
    'public.set_payment_channel_status(uuid,boolean)',
    'public.delete_payment_channel(uuid)',
    'public.get_member_giving_channels(uuid)'
  ] LOOP
    IF NOT has_function_privilege('authenticated', v_signature, 'EXECUTE') THEN
      RAISE EXCEPTION 'Authenticated role is missing RPC execute grant: %', v_signature;
    END IF;
    IF has_function_privilege('anon', v_signature, 'EXECUTE')
       OR has_function_privilege('service_role', v_signature, 'EXECUTE') THEN
      RAISE EXCEPTION 'Untrusted role must not execute RPC: %', v_signature;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_proc p
      WHERE p.oid = to_regprocedure(v_signature)
        AND p.prosecdef
        AND EXISTS (
          SELECT 1 FROM unnest(p.proconfig) setting
          WHERE setting = 'search_path=""'
        )
    ) THEN
      RAISE EXCEPTION 'Payment channel RPC must be SECURITY DEFINER with empty search_path: %', v_signature;
    END IF;
  END LOOP;
END
$payment_channel_security_checks$;
