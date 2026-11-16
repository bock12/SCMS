import { describe, expect, test } from "bun:test";
import { composeBaseline } from "./build-supabase-baseline.mjs";

function fixtures() {
  return Array.from({ length: 22 }, (_, index) => {
    const sequence = String(index + 1).padStart(3, "0");
    return {
      name: `2026111414${String(index).padStart(4, "0")}_scms_${sequence}_fixture.sql`,
      content: "begin;\nselect 1;\ncommit;"
    };
  });
}

describe("composeBaseline", () => {
  test("consolidates all 22 ordered migrations into one transaction", () => {
    const output = composeBaseline(fixtures());
    expect(output.startsWith("-- GENERATED FILE")).toBe(true);
    expect((output.match(/^begin;$/gm) ?? []).length).toBe(1);
    expect((output.match(/^commit;$/gm) ?? []).length).toBe(1);
    expect(output).toContain("-- 20261114140000_scms_001_fixture.sql");
    expect(output).toContain("-- 20261114140021_scms_022_fixture.sql");
  });

  test("normalizes extension installation and conditionally hardens the Supabase event-trigger function", () => {
    const input = fixtures();
    input[0].content = "begin;\ncreate extension if not exists pgcrypto;\ncommit;";
    input[5].content = "begin;\nrevoke execute on function public.rls_auto_enable() from public, anon, authenticated;\ncommit;";
    input[10].content = "begin;\ncreate extension if not exists btree_gist;\ncommit;";
    input[12].content = "begin;\nalter extension btree_gist set schema extensions;\ncommit;";
    const output = composeBaseline(input);
    expect(output).toContain("create extension if not exists pgcrypto with schema extensions;");
    expect(output).toContain("create extension if not exists btree_gist with schema extensions;");
    expect(output).toContain("to_regclass('auth.users') is null");
    expect(output).toContain("to_regprocedure('public.rls_auto_enable()')");
    expect(output).not.toMatch(/alter\s+extension\s+btree_gist\s+set\s+schema/i);
    expect(output).not.toMatch(/create\s+extension\s+if\s+not\s+exists\s+pgcrypto\s*;/i);
  });

  test("rejects an incomplete recovered migration archive", () => {
    expect(() => composeBaseline(fixtures().slice(0, 21))).toThrow("Expected exactly 22");
  });

  test("rejects a migration without its original transaction wrapper", () => {
    const input = fixtures();
    input[3].content = "create table public.invalid(id int);";
    expect(() => composeBaseline(input)).toThrow("BEGIN/COMMIT");
  });

  test("rejects a sequence gap", () => {
    const input = fixtures();
    input[8].name = input[8].name.replace("_scms_009_", "_scms_010_");
    expect(() => composeBaseline(input)).toThrow("sequence is incomplete");
  });

  test("rejects platform event-trigger DDL and the legacy members table", () => {
    const eventTrigger = fixtures();
    eventTrigger[2].content = "begin; create event trigger platform_trigger on ddl_command_end execute function public.some_fn(); commit;";
    expect(() => composeBaseline(eventTrigger)).toThrow("Platform event-trigger DDL");
    const legacy = fixtures();
    legacy[1].content = "begin; create table public.members(id uuid); commit;";
    expect(() => composeBaseline(legacy)).toThrow("Legacy members-table DDL");
  });
});
