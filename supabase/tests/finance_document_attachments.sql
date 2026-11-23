-- FIN-INT-004 private attachment storage contract checks.
DO $finance_attachment_contract$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM storage.buckets
    WHERE id = 'scms-finance-private'
      AND name = 'scms-finance-private'
      AND public = false
      AND file_size_limit = 10485760
      AND allowed_mime_types = ARRAY['application/pdf','image/jpeg','image/png']::text[]
  ) THEN
    RAISE EXCEPTION 'Finance attachment bucket must be private and enforce the configured size/type limits.';
  END IF;

  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.financial_document_attachments'::regclass) THEN
    RAISE EXCEPTION 'Finance attachment metadata must have RLS enabled.';
  END IF;

  IF has_table_privilege('authenticated', 'public.financial_document_attachments', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.financial_document_attachments', 'TRUNCATE')
     OR has_table_privilege('anon', 'public.financial_document_attachments', 'SELECT')
     OR has_table_privilege('anon', 'public.financial_document_attachments', 'INSERT') THEN
    RAISE EXCEPTION 'Attachment metadata grants exceed the intended select/insert/delete contract.';
  END IF;

  IF NOT has_table_privilege('authenticated', 'public.financial_document_attachments', 'SELECT')
     OR NOT has_table_privilege('authenticated', 'public.financial_document_attachments', 'INSERT')
     OR NOT has_table_privilege('authenticated', 'public.financial_document_attachments', 'DELETE') THEN
    RAISE EXCEPTION 'Authenticated finance clients are missing required attachment metadata privileges.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'financial_document_attachments'
      AND policyname = 'finance_document_attachments_read'
      AND qual LIKE '%view_finances%'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'financial_document_attachments'
      AND policyname = 'finance_document_attachments_upload'
      AND with_check LIKE '%manage_finances%'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'financial_document_attachments'
      AND policyname = 'finance_document_attachments_delete'
      AND qual LIKE '%manage_finances%'
  ) THEN
    RAISE EXCEPTION 'Attachment metadata policies do not enforce read/manage permission checks.';
  END IF;

  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'storage.objects'::regclass) THEN
    RAISE EXCEPTION 'Storage objects must have RLS enabled in the harness.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'scms_finance_attachment_upload'
      AND with_check LIKE '%manage_finances%'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'scms_finance_attachment_read'
      AND qual LIKE '%view_finances%'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'scms_finance_attachment_delete'
      AND qual LIKE '%manage_finances%'
  ) THEN
    RAISE EXCEPTION 'Storage object policies do not enforce document-linked finance scopes.';
  END IF;
END
$finance_attachment_contract$;
