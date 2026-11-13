-- SCMS migration preflight: read-only diagnostics.
-- Run this against a disposable Supabase project before testing any migration.
-- This script does not apply migrations, alter data, or expose credentials.

BEGIN TRANSACTION READ ONLY;

SELECT
  current_database() AS database_name,
  current_user AS database_role,
  current_setting('server_version') AS postgres_version,
  now() AS inspected_at;

SELECT
  to_regclass('public.members') AS legacy_members_table,
  to_regclass('public.profiles') AS canonical_profiles_table,
  to_regclass('supabase_migrations.schema_migrations') AS supabase_migration_ledger;

-- Inspect directory columns and constraints without assuming either baseline.
SELECT table_schema, table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE (table_schema, table_name) IN (('public', 'members'), ('public', 'profiles'))
ORDER BY table_name, ordinal_position;

-- Enumerate every foreign key pointing at either directory table, across schemas.
SELECT
  source_ns.nspname AS source_schema,
  source_table.relname AS source_table,
  source_column.attname AS source_column,
  constraint_row.conname AS constraint_name,
  target_ns.nspname AS target_schema,
  target_table.relname AS target_table,
  target_column.attname AS target_column,
  pg_get_constraintdef(constraint_row.oid) AS definition
FROM pg_constraint AS constraint_row
JOIN pg_class AS source_table ON source_table.oid = constraint_row.conrelid
JOIN pg_namespace AS source_ns ON source_ns.oid = source_table.relnamespace
JOIN pg_class AS target_table ON target_table.oid = constraint_row.confrelid
JOIN pg_namespace AS target_ns ON target_ns.oid = target_table.relnamespace
JOIN LATERAL unnest(constraint_row.conkey) WITH ORDINALITY AS source_key(attnum, ord) ON true
JOIN LATERAL unnest(constraint_row.confkey) WITH ORDINALITY AS target_key(attnum, ord)
  ON target_key.ord = source_key.ord
JOIN pg_attribute AS source_column
  ON source_column.attrelid = source_table.oid AND source_column.attnum = source_key.attnum
JOIN pg_attribute AS target_column
  ON target_column.attrelid = target_table.oid AND target_column.attnum = target_key.attnum
WHERE constraint_row.contype = 'f'
  AND target_ns.nspname = 'public'
  AND target_table.relname IN ('members', 'profiles')
ORDER BY target_table.relname, source_ns.nspname, source_table.relname, constraint_row.conname;

-- Report RLS state and policies for both directory tables.
SELECT
  namespace.nspname AS schema_name,
  relation.relname AS table_name,
  relation.relrowsecurity AS rls_enabled,
  relation.relforcerowsecurity AS rls_forced,
  policy.polname AS policy_name,
  policy.polcmd AS policy_command,
  pg_get_userbyid(policy.polowner) AS policy_owner,
  pg_get_expr(policy.polqual, policy.polrelid) AS using_expression,
  pg_get_expr(policy.polwithcheck, policy.polrelid) AS check_expression
FROM pg_class AS relation
JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
LEFT JOIN pg_policy AS policy ON policy.polrelid = relation.oid
WHERE namespace.nspname = 'public'
  AND relation.relname IN ('members', 'profiles')
ORDER BY relation.relname, policy.polname;

-- Safe row-count and duplicate-link diagnostics. Results are NOTICE messages.
DO $preflight$
DECLARE
  member_count BIGINT;
  profile_count BIGINT;
  duplicate_profile_links BIGINT;
BEGIN
  IF to_regclass('public.members') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.members' INTO member_count;
    RAISE NOTICE 'public.members row_count=%', member_count;

    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'members'
        AND column_name = 'profile_id'
    ) THEN
      EXECUTE $query$
        SELECT count(*)
        FROM (
          SELECT profile_id
          FROM public.members
          WHERE profile_id IS NOT NULL
          GROUP BY profile_id
          HAVING count(*) > 1
        ) AS duplicates
      $query$ INTO duplicate_profile_links;
      RAISE NOTICE 'public.members duplicate_non_null_profile_id_groups=%', duplicate_profile_links;
    ELSE
      RAISE NOTICE 'public.members has no profile_id column';
    END IF;
  ELSE
    RAISE NOTICE 'public.members is absent';
  END IF;

  IF to_regclass('public.profiles') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.profiles' INTO profile_count;
    RAISE NOTICE 'public.profiles row_count=%', profile_count;
  ELSE
    RAISE NOTICE 'public.profiles is absent';
  END IF;

  IF to_regclass('supabase_migrations.schema_migrations') IS NULL THEN
    RAISE NOTICE 'Supabase migration ledger is absent; determine how this database was initialized before proceeding';
  ELSE
    RAISE NOTICE 'Supabase migration ledger exists; inspect it separately before applying anything';
  END IF;
END
$preflight$;

COMMIT;
