import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = import.meta.dir;
const read = (path: string) => readFileSync(join(root, path), "utf8");

const schema = read("schema.sql");
const migrations = [
  "supabase/migrations/20261110000100_expand_member_records.sql",
  "supabase/migrations/20261111000100_align_event_registration_attendance.sql",
  "supabase/migrations/20261111000200_create_ministry_membership.sql",
  "supabase/migrations/20261111000300_create_resources_and_event_surveys.sql",
  "supabase/migrations/20261112000100_add_atomic_event_survey_submission.sql",
  "supabase/migrations/20261112000200_enforce_unique_member_profile_link.sql",
  "supabase/migrations/20261112000300_unify_profiles_member_directory.sql",
  "supabase/migrations/20261113000100_secure_explicit_profile_auth_linking.sql",
].map(read);

describe("SCMS migration-chain safety guard", () => {
  test("documents the root schema as a canonical profiles baseline, not a legacy members baseline", () => {
    expect(schema).toMatch(/CREATE TABLE IF NOT EXISTS public\.profiles/i);
    expect(schema).not.toMatch(/CREATE TABLE IF NOT EXISTS public\.members/i);
  });

  test("detects that the first historical migration requires public.members", () => {
    expect(migrations[0]).toMatch(/ALTER TABLE public\.members/i);
    expect(migrations[0]).toMatch(/ALTER TYPE member_status/i);
  });

  test("detects subsequent historical dependencies on the legacy members table", () => {
    expect(migrations[1]).toMatch(/REFERENCES public\.members\(id\)/i);
    expect(migrations[2]).toMatch(/REFERENCES public\.members\(id\)/i);
    expect(migrations[3]).toMatch(/public\.members/i);
    expect(migrations[4]).toMatch(/public\.members/i);
    expect(migrations[5]).toMatch(/public\.members/i);
  });

  test("keeps directory unification after all migrations that require the legacy table", () => {
    expect(migrations[6]).toMatch(/DROP TABLE IF EXISTS public\.members/i);
    expect(migrations[7]).toMatch(/handle_new_user/i);
    expect(migrations[7]).toMatch(/provisioned_profile_id/i);
  });

  test("flags the root schema as incomplete for the feature migration set", () => {
    expect(schema).not.toMatch(/CREATE TABLE IF NOT EXISTS public\.church_resources/i);
    expect(schema).not.toMatch(/CREATE TABLE IF NOT EXISTS public\.event_surveys/i);
    expect(migrations[3]).toMatch(/CREATE TABLE IF NOT EXISTS public\.church_resources/i);
    expect(migrations[3]).toMatch(/CREATE TABLE IF NOT EXISTS public\.event_surveys/i);
  });

  test("does not mistake a passing static guard for a successful database migration test", () => {
    const strategy = read("docs/architecture/schema-baseline-and-migration-strategy.md");
    expect(strategy).toMatch(/disposable/i);
    expect(strategy).toMatch(/No production Supabase migration/i);
  });
});
