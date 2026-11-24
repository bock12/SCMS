-- MEM-INT-004A: Branch, District & Congregation Membership Architecture Alignment
-- Verifies optional districts, standalone branches, District HQ vs Church Main Branch uniqueness,
-- hierarchical RLS visibility (including empty assigned districts), PII-free governance summaries,
-- role escalation prevention, active-branch registration enforcement, and transfer roster/cell reconciliation.
BEGIN;

SELECT set_config(
  'scms.mem4a_church_admin_auth_id',
  (
    SELECT p.auth_user_id::text
    FROM public.profiles AS p
    JOIN public.profile_role_assignments AS a ON a.profile_id = p.id AND a.is_active
    JOIN public.roles AS r ON r.id = a.role_id AND r.is_active
    WHERE p.auth_user_id IS NOT NULL
      AND p.portal_access_status = 'active'
      AND p.record_status = 'active'
      AND a.scope_type = 'church'
      AND r.name IN ('super_admin', 'admin')
    ORDER BY CASE r.name WHEN 'super_admin' THEN 0 ELSE 1 END
    LIMIT 1
  ),
  true
);

SELECT set_config(
  'scms.mem4a_church_admin_profile_id',
  (
    SELECT id::text
    FROM public.profiles
    WHERE auth_user_id = current_setting('scms.mem4a_church_admin_auth_id')::uuid
    LIMIT 1
  ),
  true
);

DO $preflight$
BEGIN
  IF NULLIF(current_setting('scms.mem4a_church_admin_auth_id', true), '') IS NULL
    OR NULLIF(current_setting('scms.mem4a_church_admin_profile_id', true), '') IS NULL THEN
    RAISE EXCEPTION 'MEM-INT-004A tests require an active church-wide super_admin/admin fixture.';
  END IF;
END;
$preflight$;

-- Fixtures created as table owner, then verified via authenticated / anon roles.
DO $fixtures$
DECLARE
  v_dist_a uuid := gen_random_uuid();
  v_dist_b uuid := gen_random_uuid();
  v_empty_dist uuid := gen_random_uuid();
  v_inactive_branch uuid := gen_random_uuid();
  v_dist_admin_auth_id uuid := gen_random_uuid();
  v_dist_admin_profile_id uuid := gen_random_uuid();
  v_branch_admin_auth_id uuid := gen_random_uuid();
  v_branch_admin_profile_id uuid := gen_random_uuid();
  v_member_auth_id uuid := gen_random_uuid();
  v_member_profile_id uuid := gen_random_uuid();
  v_district_admin_role_id uuid;
  v_admin_role_id uuid;
  v_member_role_id uuid;
BEGIN
  SELECT id INTO v_district_admin_role_id FROM public.roles WHERE name = 'district_admin' AND is_active LIMIT 1;
  SELECT id INTO v_admin_role_id FROM public.roles WHERE name = 'admin' AND is_active LIMIT 1;
  SELECT id INTO v_member_role_id FROM public.roles WHERE name = 'member' AND is_active LIMIT 1;

  IF v_district_admin_role_id IS NULL OR v_admin_role_id IS NULL OR v_member_role_id IS NULL THEN
    RAISE EXCEPTION 'Required roles district_admin, admin, and member must exist.';
  END IF;

  INSERT INTO public.districts (id, name, region, country, description)
  VALUES
    (v_dist_a, 'MEM4A District Alpha', 'North', 'Sierra Leone', 'Primary test district'),
    (v_dist_b, 'MEM4A District Beta', 'South', 'Sierra Leone', 'Secondary test district'),
    (v_empty_dist, 'MEM4A Empty Assigned District', 'East', 'Sierra Leone', 'District with zero branches');

  INSERT INTO public.church_branches (id, district_id, name, code, address, city, state_or_region, country, is_main_branch, status)
  VALUES (
    v_inactive_branch,
    v_dist_a,
    'MEM4A Inactive Branch',
    'M4I' || upper(substr(replace(v_inactive_branch::text, '-', ''), 1, 5)),
    '99 Dormant Rd',
    'Bo',
    'Southern',
    'Sierra Leone',
    false,
    'inactive'
  );

  -- Create a seeded profile anchor in an active branch first, then move actors into isolated test branches.
  INSERT INTO auth.users (id, email, email_confirmed_at, raw_app_meta_data)
  VALUES
    (v_dist_admin_auth_id, 'mem4a-dist-admin@example.invalid', now(), '{}'::jsonb),
    (v_branch_admin_auth_id, 'mem4a-branch-admin@example.invalid', now(), '{}'::jsonb),
    (v_member_auth_id, 'mem4a-member@example.invalid', now(), '{}'::jsonb);

  PERFORM set_config('scms.mem4a_dist_a', v_dist_a::text, true);
  PERFORM set_config('scms.mem4a_dist_b', v_dist_b::text, true);
  PERFORM set_config('scms.mem4a_empty_dist', v_empty_dist::text, true);
  PERFORM set_config('scms.mem4a_inactive_branch', v_inactive_branch::text, true);
  PERFORM set_config('scms.mem4a_dist_admin_auth_id', v_dist_admin_auth_id::text, true);
  PERFORM set_config('scms.mem4a_dist_admin_profile_id', v_dist_admin_profile_id::text, true);
  PERFORM set_config('scms.mem4a_branch_admin_auth_id', v_branch_admin_auth_id::text, true);
  PERFORM set_config('scms.mem4a_branch_admin_profile_id', v_branch_admin_profile_id::text, true);
  PERFORM set_config('scms.mem4a_member_auth_id', v_member_auth_id::text, true);
  PERFORM set_config('scms.mem4a_member_profile_id', v_member_profile_id::text, true);
  PERFORM set_config('scms.mem4a_district_admin_role_id', v_district_admin_role_id::text, true);
  PERFORM set_config('scms.mem4a_admin_role_id', v_admin_role_id::text, true);
  PERFORM set_config('scms.mem4a_member_role_id', v_member_role_id::text, true);
END;
$fixtures$;

-- Scenario A & B: Church-wide admin creates standalone branches, optional districts,
-- and validates District HQ vs standalone Church Main Branch uniqueness.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('scms.mem4a_church_admin_auth_id'), true);

DO $scenario_a_b$
DECLARE
  v_dist_a uuid := current_setting('scms.mem4a_dist_a')::uuid;
  v_dist_b uuid := current_setting('scms.mem4a_dist_b')::uuid;
  v_standalone_1 public.church_branches;
  v_standalone_2 public.church_branches;
  v_branch_a1 public.church_branches;
  v_branch_a2 public.church_branches;
  v_branch_b1 public.church_branches;
  v_updated_dist public.districts;
  v_deleted boolean;
  v_temp_dist public.districts;
BEGIN
  -- 1. Standalone branches (district_id = NULL) succeed for church-wide admin.
  v_standalone_1 := public.create_church_branch(
    NULL, 'MEM4A Standalone Central', '10 Independence Ave', 'Freetown', 'Western Area', true
  );
  IF v_standalone_1.district_id IS NOT NULL OR NOT v_standalone_1.is_main_branch THEN
    RAISE EXCEPTION 'Standalone Church Main Branch was not created with null district_id and is_main_branch=true.';
  END IF;

  -- Creating a second standalone Church Main Branch transfers standalone main status cleanly.
  v_standalone_2 := public.create_church_branch(
    NULL, 'MEM4A Standalone North', '20 Lumley St', 'Freetown', 'Western Area', true
  );
  IF NOT v_standalone_2.is_main_branch THEN
    RAISE EXCEPTION 'Second standalone Church Main Branch did not retain is_main_branch=true.';
  END IF;
  IF (SELECT is_main_branch FROM public.church_branches WHERE id = v_standalone_1.id) THEN
    RAISE EXCEPTION 'Previous standalone Church Main Branch was not demoted cleanly.';
  END IF;

  -- 2. Create district branches and verify per-district HQ isolation.
  v_branch_a1 := public.create_church_branch(
    v_dist_a, 'MEM4A Alpha HQ', '1 Alpha Way', 'Makeni', 'Northern', true
  );
  v_branch_a2 := public.create_church_branch(
    v_dist_a, 'MEM4A Alpha Chapel', '2 Alpha Way', 'Makeni', 'Northern', false
  );
  v_branch_b1 := public.create_church_branch(
    v_dist_b, 'MEM4A Beta HQ', '5 Beta St', 'Kenema', 'Eastern', true
  );

  -- Promoting Beta HQ must NOT demote Alpha HQ or Standalone Main.
  IF NOT (SELECT is_main_branch FROM public.church_branches WHERE id = v_branch_a1.id)
    OR NOT (SELECT is_main_branch FROM public.church_branches WHERE id = v_branch_b1.id)
    OR NOT (SELECT is_main_branch FROM public.church_branches WHERE id = v_standalone_2.id) THEN
    RAISE EXCEPTION 'District HQ and standalone Church Main uniqueness must be isolated per scope.';
  END IF;

  -- update_district transfers District HQ inside District Alpha and leaves Beta untouched.
  v_updated_dist := public.update_district(
    v_dist_a, 'MEM4A District Alpha Renamed', 'North', 'Sierra Leone', 'Updated desc', v_branch_a2.id, true
  );
  IF v_updated_dist.name <> 'MEM4A District Alpha Renamed'
    OR (SELECT is_main_branch FROM public.church_branches WHERE id = v_branch_a1.id)
    OR NOT (SELECT is_main_branch FROM public.church_branches WHERE id = v_branch_a2.id) THEN
    RAISE EXCEPTION 'update_district did not transfer District HQ cleanly.';
  END IF;

  -- Non-empty district deletion must fail (23503); empty district deletion succeeds.
  BEGIN
    PERFORM public.delete_district(v_dist_a);
    RAISE EXCEPTION 'Non-empty district deletion unexpectedly succeeded.';
  EXCEPTION WHEN foreign_key_violation THEN
    NULL;
  END;

  v_temp_dist := public.create_district('MEM4A Temp Empty', 'West', 'Sierra Leone', NULL);
  v_deleted := public.delete_district(v_temp_dist.id);
  IF NOT v_deleted THEN
    RAISE EXCEPTION 'Empty district deletion returned false.';
  END IF;

  -- Attach v_standalone_1 to District Beta (as non-main) and verify detaching back to standalone works.
  v_standalone_1 := public.update_church_branch(
    v_standalone_1.id, v_dist_b, v_standalone_1.name, v_standalone_1.address, v_standalone_1.city, v_standalone_1.state_or_region, false
  );
  IF v_standalone_1.district_id IS DISTINCT FROM v_dist_b THEN
    RAISE EXCEPTION 'Attaching standalone branch to district failed.';
  END IF;
  v_standalone_1 := public.update_church_branch(
    v_standalone_1.id, NULL, v_standalone_1.name, v_standalone_1.address, v_standalone_1.city, v_standalone_1.state_or_region, false
  );
  IF v_standalone_1.district_id IS NOT NULL THEN
    RAISE EXCEPTION 'Detaching branch back to standalone failed.';
  END IF;

  PERFORM set_config('scms.mem4a_standalone_1', v_standalone_1.id::text, true);
  PERFORM set_config('scms.mem4a_standalone_2', v_standalone_2.id::text, true);
  PERFORM set_config('scms.mem4a_branch_a1', v_branch_a1.id::text, true);
  PERFORM set_config('scms.mem4a_branch_a2', v_branch_a2.id::text, true);
  PERFORM set_config('scms.mem4a_branch_b1', v_branch_b1.id::text, true);
END;
$scenario_a_b$;

-- Verify raw SQL partial unique indexes also prevent direct duplicate active HQ / standalone main bypasses.
RESET ROLE;
DO $unique_index_guards$
BEGIN
  BEGIN
    INSERT INTO public.church_branches (district_id, name, code, country, is_main_branch, status)
    VALUES (
      current_setting('scms.mem4a_dist_a')::uuid,
      'MEM4A Raw Duplicate HQ',
      'RAW1',
      'Sierra Leone',
      true,
      'active'
    );
    RAISE EXCEPTION 'Duplicate active HQ per district was allowed by partial unique index.';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;

  BEGIN
    INSERT INTO public.church_branches (district_id, name, code, country, is_main_branch, status)
    VALUES (
      NULL,
      'MEM4A Raw Duplicate Standalone Main',
      'RAW2',
      'Sierra Leone',
      true,
      'active'
    );
    RAISE EXCEPTION 'Duplicate active standalone Church Main Branch was allowed by partial unique index.';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;
END;
$unique_index_guards$;

-- Seed profiles in standalone, District Alpha, District Beta, plus cells and ministries for Scenario C, D, E, F.
DO $seed_members_and_rosters$
DECLARE
  v_standalone_1 uuid := current_setting('scms.mem4a_standalone_1')::uuid;
  v_branch_a1 uuid := current_setting('scms.mem4a_branch_a1')::uuid;
  v_branch_a2 uuid := current_setting('scms.mem4a_branch_a2')::uuid;
  v_branch_b1 uuid := current_setting('scms.mem4a_branch_b1')::uuid;
  v_dist_a uuid := current_setting('scms.mem4a_dist_a')::uuid;
  v_empty_dist uuid := current_setting('scms.mem4a_empty_dist')::uuid;
  v_dist_admin_profile_id uuid := current_setting('scms.mem4a_dist_admin_profile_id')::uuid;
  v_branch_admin_profile_id uuid := current_setting('scms.mem4a_branch_admin_profile_id')::uuid;
  v_member_profile_id uuid := current_setting('scms.mem4a_member_profile_id')::uuid;
  v_standalone_member_id uuid := gen_random_uuid();
  v_transfer_member_id uuid := gen_random_uuid();
  v_beta_member_id uuid := gen_random_uuid();
  v_cell_a1_id uuid := gen_random_uuid();
  v_branch_ministry_id uuid := gen_random_uuid();
  v_church_ministry_id uuid := gen_random_uuid();
  v_pastor_role_id uuid;
BEGIN
  SELECT id INTO v_pastor_role_id FROM public.roles WHERE name = 'pastor' AND is_active LIMIT 1;

  INSERT INTO public.profiles (
    id, auth_user_id, branch_id, first_name, last_name,
    membership_date, membership_status, portal_access_status, record_status
  ) VALUES
    (
      v_dist_admin_profile_id,
      current_setting('scms.mem4a_dist_admin_auth_id')::uuid,
      v_branch_a1, 'MEM4A', 'District Overseer',
      CURRENT_DATE, 'active', 'active', 'active'
    ),
    (
      v_branch_admin_profile_id,
      current_setting('scms.mem4a_branch_admin_auth_id')::uuid,
      v_branch_a1, 'MEM4A', 'Branch Admin',
      CURRENT_DATE, 'active', 'active', 'active'
    ),
    (
      v_member_profile_id,
      current_setting('scms.mem4a_member_auth_id')::uuid,
      v_branch_a1, 'MEM4A', 'Portal Member',
      CURRENT_DATE, 'active', 'active', 'active'
    ),
    (
      v_standalone_member_id, NULL, v_standalone_1, 'MEM4A', 'Standalone Member',
      CURRENT_DATE, 'active', 'not_invited', 'active'
    ),
    (
      v_transfer_member_id, NULL, v_branch_a1, 'MEM4A', 'Transfer Subject',
      CURRENT_DATE, 'active', 'not_invited', 'active'
    ),
    (
      v_beta_member_id, NULL, v_branch_b1, 'MEM4A', 'Beta Member',
      CURRENT_DATE, 'active', 'not_invited', 'active'
    );

  -- Role assignments:
  -- 1) District overseer gets district_admin on District Alpha AND empty assigned district.
  INSERT INTO public.profile_role_assignments (profile_id, role_id, scope_type, district_id, is_active)
  VALUES
    (v_dist_admin_profile_id, current_setting('scms.mem4a_district_admin_role_id')::uuid, 'district', v_dist_a, true),
    (v_dist_admin_profile_id, current_setting('scms.mem4a_district_admin_role_id')::uuid, 'district', v_empty_dist, true);

  -- 2) Branch admin gets admin ONLY on Branch A1.
  INSERT INTO public.profile_role_assignments (profile_id, role_id, scope_type, branch_id, is_active)
  VALUES (v_branch_admin_profile_id, current_setting('scms.mem4a_admin_role_id')::uuid, 'branch', v_branch_a1, true);

  -- 3) Ordinary member gets member role on Branch A1.
  INSERT INTO public.profile_role_assignments (profile_id, role_id, scope_type, branch_id, is_active)
  VALUES (v_member_profile_id, current_setting('scms.mem4a_member_role_id')::uuid, 'branch', v_branch_a1, true);

  -- Cell leadership + membership on Branch A1 (composite FK test on transfer!).
  INSERT INTO public.cells (id, branch_id, name, leader_id, status)
  VALUES (v_cell_a1_id, v_branch_a1, 'MEM4A Cell A1', v_transfer_member_id, 'active');

  INSERT INTO public.cell_members (cell_id, member_id, branch_id, role, status)
  VALUES (v_cell_a1_id, v_transfer_member_id, v_branch_a1, 'leader', 'active');

  -- Branch-scoped ministry + church-wide ministry (both containing v_transfer_member_id).
  INSERT INTO public.ministries (id, branch_id, name, entity_type, status)
  VALUES
    (v_branch_ministry_id, v_branch_a1, 'MEM4A Alpha Choir ' || v_branch_a1::text, 'ministry', 'active'),
    (v_church_ministry_id, NULL, 'MEM4A National Prayer ' || v_branch_a1::text, 'ministry', 'active');

  INSERT INTO public.ministry_members (ministry_id, member_id, role_title, status)
  VALUES
    (v_branch_ministry_id, v_transfer_member_id, 'Department Leader', 'active'),
    (v_church_ministry_id, v_transfer_member_id, 'Team Member', 'active');

  PERFORM set_config('scms.mem4a_pastor_role_id', v_pastor_role_id::text, true);
  PERFORM set_config('scms.mem4a_standalone_member_id', v_standalone_member_id::text, true);
  PERFORM set_config('scms.mem4a_transfer_member_id', v_transfer_member_id::text, true);
  PERFORM set_config('scms.mem4a_beta_member_id', v_beta_member_id::text, true);
  PERFORM set_config('scms.mem4a_cell_a1_id', v_cell_a1_id::text, true);
  PERFORM set_config('scms.mem4a_branch_ministry_id', v_branch_ministry_id::text, true);
  PERFORM set_config('scms.mem4a_church_ministry_id', v_church_ministry_id::text, true);
END;
$seed_members_and_rosters$;

-- Scenario C & D: Hierarchical visibility, empty assigned district read,
-- standalone isolation, PII-free summary RPC, inactive branch guard, and role escalation blocks.
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('scms.mem4a_dist_admin_auth_id'), true);

DO $scenario_c_d_district_admin$
DECLARE
  v_dist_a uuid := current_setting('scms.mem4a_dist_a')::uuid;
  v_dist_b uuid := current_setting('scms.mem4a_dist_b')::uuid;
  v_empty_dist uuid := current_setting('scms.mem4a_empty_dist')::uuid;
  v_standalone_1 uuid := current_setting('scms.mem4a_standalone_1')::uuid;
  v_branch_a1 uuid := current_setting('scms.mem4a_branch_a1')::uuid;
  v_branch_a2 uuid := current_setting('scms.mem4a_branch_a2')::uuid;
  v_branch_b1 uuid := current_setting('scms.mem4a_branch_b1')::uuid;
  v_inactive_branch uuid := current_setting('scms.mem4a_inactive_branch')::uuid;
  v_created_member public.profiles;
  v_created_branch public.church_branches;
  v_summary_count bigint;
  v_alpha_total bigint;
BEGIN
  -- Sees assigned districts even if one has zero branches, and does NOT see unassigned District Beta.
  IF NOT EXISTS (SELECT 1 FROM public.districts WHERE id = v_empty_dist) THEN
    RAISE EXCEPTION 'District admin could not read empty assigned district via districts_authorized_read.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.districts WHERE id = v_dist_b) THEN
    RAISE EXCEPTION 'District admin unexpectedly saw unassigned District Beta.';
  END IF;

  -- Sees District Alpha branches, never sees standalone branches or District Beta branches.
  IF EXISTS (SELECT 1 FROM public.church_branches WHERE id IN (v_standalone_1, v_branch_b1)) THEN
    RAISE EXCEPTION 'District admin unexpectedly read standalone or cross-district branches.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.church_branches WHERE id = v_branch_a2) THEN
    RAISE EXCEPTION 'District admin could not read peer branch in assigned district.';
  END IF;

  -- Sees members in District Alpha only (no standalone or Beta members).
  IF EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id IN (
      current_setting('scms.mem4a_standalone_member_id')::uuid,
      current_setting('scms.mem4a_beta_member_id')::uuid
    )
  ) THEN
    RAISE EXCEPTION 'District admin unexpectedly read standalone or cross-district member profiles.';
  END IF;

  -- PII-free summary RPC matches District Alpha branch counts without leaking outside scopes.
  SELECT count(*), COALESCE(SUM(total_members) FILTER (WHERE branch_id = v_branch_a1), 0)
  INTO v_summary_count, v_alpha_total
  FROM public.get_branch_governance_summaries(v_dist_a);
  IF v_summary_count < 2 OR v_alpha_total < 4 THEN
    RAISE EXCEPTION 'get_branch_governance_summaries returned incomplete counts for District Alpha (count=%, a1=%).', v_summary_count, v_alpha_total;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.get_branch_governance_summaries(NULL)
    WHERE branch_id IN (v_standalone_1, v_branch_b1)
  ) THEN
    RAISE EXCEPTION 'get_branch_governance_summaries leaked standalone or cross-district counts to district_admin.';
  END IF;

  -- District admin CANNOT create standalone branch or branch in another district or HQ branch.
  BEGIN
    PERFORM public.create_church_branch(NULL, 'Illegal Standalone', '1 Rd', 'City', 'ST', false);
    RAISE EXCEPTION 'District admin unexpectedly created a standalone branch.';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  BEGIN
    PERFORM public.create_church_branch(v_dist_a, 'Illegal HQ', '1 Rd', 'City', 'ST', true);
    RAISE EXCEPTION 'District admin unexpectedly created a District HQ branch.';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  -- District admin CAN create non-HQ branch in District Alpha.
  v_created_branch := public.create_church_branch(v_dist_a, 'MEM4A Alpha Annex', '3 Alpha Way', 'Makeni', 'Northern', false);
  IF v_created_branch.district_id <> v_dist_a THEN
    RAISE EXCEPTION 'District admin branch creation did not attach to assigned district.';
  END IF;

  -- District admin cannot detach branch to standalone via update_church_branch.
  BEGIN
    PERFORM public.update_church_branch(v_created_branch.id, NULL, v_created_branch.name, '3 Alpha Way', 'Makeni', 'Northern', false);
    RAISE EXCEPTION 'District admin unexpectedly detached a branch to standalone.';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  -- Creating a member in an INACTIVE branch is rejected with FK error (23503).
  BEGIN
    PERFORM public.create_member_profile(
      pg_catalog.jsonb_build_object(
        'first_name', 'Inactive',
        'last_name', 'Branch Attempt',
        'branch_id', v_inactive_branch,
        'membership_date', CURRENT_DATE::text
      )
    );
    RAISE EXCEPTION 'Creating a member in an inactive branch unexpectedly succeeded.';
  EXCEPTION WHEN foreign_key_violation THEN
    NULL;
  END;

  -- Creating a portal-less member in an ACTIVE branch in-district succeeds.
  v_created_member := public.create_member_profile(
    pg_catalog.jsonb_build_object(
      'first_name', 'MEM4A',
      'last_name', 'NoPortal Alpha',
      'branch_id', v_branch_a2,
      'membership_date', CURRENT_DATE::text
    )
  );
  IF v_created_member.auth_user_id IS NOT NULL OR v_created_member.portal_access_status <> 'not_invited' THEN
    RAISE EXCEPTION 'Portal-less member registration did not keep auth_user_id NULL.';
  END IF;

  -- District admin can assign operational pastor role in District Alpha, but cannot escalate to district_admin/admin.
  PERFORM public.assign_profile_role(
    v_created_member.id,
    current_setting('scms.mem4a_pastor_role_id')::uuid,
    'branch',
    v_branch_a2,
    NULL
  );

  BEGIN
    PERFORM public.assign_profile_role(
      v_created_member.id,
      current_setting('scms.mem4a_district_admin_role_id')::uuid,
      'district',
      NULL,
      v_dist_a
    );
    RAISE EXCEPTION 'District admin unexpectedly escalated a user to district_admin.';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END;
$scenario_c_d_district_admin$;

-- Verify ordinary member sees ONLY their own profile (no cross-member PII leak).
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('scms.mem4a_member_auth_id'), true);

DO $member_isolation$
DECLARE
  v_visible_profiles bigint;
BEGIN
  SELECT count(*) INTO v_visible_profiles FROM public.profiles;
  IF v_visible_profiles <> 1 THEN
    RAISE EXCEPTION 'Expected ordinary member to see strictly 1 profile; saw %.', v_visible_profiles;
  END IF;
END;
$member_isolation$;

-- Verify anon execute is denied on all new/hardened RPCs.
RESET ROLE;
SET LOCAL ROLE anon;
DO $anon_rpc_guards$
DECLARE
  v_sig text;
BEGIN
  FOREACH v_sig IN ARRAY ARRAY[
    'public.create_district(text,text,text,text)',
    'public.update_district(uuid,text,text,text,text,uuid,boolean)',
    'public.delete_district(uuid)',
    'public.create_church_branch(uuid,text,text,text,text,boolean,text,text)',
    'public.update_church_branch(uuid,uuid,text,text,text,text,boolean)',
    'public.get_branch_governance_summaries(uuid)',
    'public.assign_profile_role(uuid,uuid,text,uuid,uuid)',
    'public.update_profile_role_assignment(uuid,uuid,text,uuid,uuid)',
    'public.reactivate_profile_role_assignment(uuid)',
    'public.delete_profile_role_assignment(uuid)'
  ] LOOP
    IF has_function_privilege('anon', v_sig, 'EXECUTE') THEN
      RAISE EXCEPTION 'Anon role unexpectedly holds EXECUTE on %', v_sig;
    END IF;
  END LOOP;
END;
$anon_rpc_guards$;

-- Scenario D2: Role assignment reactivation must preserve expiry and reject inactive targets/scopes.
RESET ROLE;
DO $seed_role_reactivation_guards$
DECLARE
  v_inactive_scope_assignment uuid;
  v_expired_assignment uuid;
  v_archived_member_assignment uuid;
  v_member_profile uuid := current_setting('scms.mem4a_member_profile_id')::uuid;
  v_member_role uuid := current_setting('scms.mem4a_member_role_id')::uuid;
  v_inactive_branch uuid := current_setting('scms.mem4a_inactive_branch')::uuid;
  v_active_branch uuid := current_setting('scms.mem4a_branch_a1')::uuid;
  v_archived_profile uuid := current_setting('scms.mem4a_standalone_member_id')::uuid;
BEGIN
  INSERT INTO public.profile_role_assignments (
    profile_id, role_id, scope_type, branch_id, district_id, is_active
  ) VALUES (
    v_member_profile, v_member_role, 'branch', v_inactive_branch, NULL, false
  ) RETURNING id INTO v_inactive_scope_assignment;

  INSERT INTO public.profile_role_assignments (
    profile_id, role_id, scope_type, branch_id, district_id, is_active, assigned_at, expires_at
  ) VALUES (
    v_member_profile, v_member_role, 'branch', v_active_branch, NULL, false,
    now() - interval '2 days', now() - interval '1 day'
  ) RETURNING id INTO v_expired_assignment;

  UPDATE public.profiles
  SET record_status = 'archived'
  WHERE id = v_archived_profile;

  INSERT INTO public.profile_role_assignments (
    profile_id, role_id, scope_type, branch_id, district_id, is_active
  ) VALUES (
    v_archived_profile, v_member_role, 'branch', v_active_branch, NULL, false
  ) RETURNING id INTO v_archived_member_assignment;

  PERFORM set_config('scms.mem4a_inactive_scope_assignment', v_inactive_scope_assignment::text, true);
  PERFORM set_config('scms.mem4a_expired_assignment', v_expired_assignment::text, true);
  PERFORM set_config('scms.mem4a_archived_member_assignment', v_archived_member_assignment::text, true);
END;
$seed_role_reactivation_guards$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('scms.mem4a_church_admin_auth_id'), true);

DO $role_reactivation_guards$
BEGIN
  BEGIN
    PERFORM public.reactivate_profile_role_assignment(
      current_setting('scms.mem4a_inactive_scope_assignment')::uuid
    );
    RAISE EXCEPTION 'An assignment for an inactive branch was unexpectedly reactivated.' USING ERRCODE = 'P0001';
  EXCEPTION WHEN foreign_key_violation THEN
    NULL;
  END;

  BEGIN
    PERFORM public.reactivate_profile_role_assignment(
      current_setting('scms.mem4a_archived_member_assignment')::uuid
    );
    RAISE EXCEPTION 'An assignment for an archived member was unexpectedly reactivated.' USING ERRCODE = 'P0001';
  EXCEPTION WHEN foreign_key_violation THEN
    NULL;
  END;

  BEGIN
    PERFORM public.reactivate_profile_role_assignment(
      current_setting('scms.mem4a_expired_assignment')::uuid
    );
    RAISE EXCEPTION 'An expired role assignment was unexpectedly made active.' USING ERRCODE = 'P0001';
  EXCEPTION WHEN invalid_parameter_value THEN
    NULL;
  END;

  IF (
    SELECT expires_at
    FROM public.profile_role_assignments
    WHERE id = current_setting('scms.mem4a_expired_assignment')::uuid
  ) IS NULL THEN
    RAISE EXCEPTION 'Role assignment expiry metadata was unexpectedly cleared.';
  END IF;
END;
$role_reactivation_guards$;

-- Seed leadership appointments before the member transfer to verify automatic reconciliation.
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('scms.mem4a_church_admin_auth_id'), true);

DO $seed_transfer_leadership_appointments$
DECLARE
  v_member uuid := current_setting('scms.mem4a_transfer_member_id')::uuid;
  v_branch uuid := current_setting('scms.mem4a_branch_a1')::uuid;
  v_district uuid := current_setting('scms.mem4a_dist_a')::uuid;
  v_branch_appointment public.leadership_appointments;
  v_district_appointment public.leadership_appointments;
BEGIN
  v_branch_appointment := public.create_leadership_appointment(
    v_member, 'branch', v_branch, NULL, 'Branch Pastor', NULL, current_date
  );
  v_district_appointment := public.create_leadership_appointment(
    v_member, 'district', NULL, v_district, 'District Leadership Coordinator', NULL, current_date
  );
  PERFORM set_config('scms.mem4a_transfer_branch_appointment_id', v_branch_appointment.id::text, true);
  PERFORM set_config('scms.mem4a_transfer_district_appointment_id', v_district_appointment.id::text, true);
END;
$seed_transfer_leadership_appointments$;

-- Scenario E & F: Atomic transfer approval moves member, clears current cell leadership,
-- preserves the source cell membership as transferred history, deactivates branch-scoped
-- ministry membership, and preserves church-wide ministry membership.
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('scms.mem4a_church_admin_auth_id'), true);

DO $scenario_e_f_transfer$
DECLARE
  v_transfer public.member_transfers;
  v_transfer_member uuid := current_setting('scms.mem4a_transfer_member_id')::uuid;
  v_branch_a2 uuid := current_setting('scms.mem4a_branch_a2')::uuid;
  v_branch_ministry uuid := current_setting('scms.mem4a_branch_ministry_id')::uuid;
  v_church_ministry uuid := current_setting('scms.mem4a_church_ministry_id')::uuid;
  v_cell_a1 uuid := current_setting('scms.mem4a_cell_a1_id')::uuid;
  v_new_branch uuid;
  v_branch_mm_status text;
  v_church_mm_status text;
  v_cell_leader uuid;
  v_cell_member_count bigint;
  v_cell_member_status text;
  v_cell_member_role text;
  v_source_branch uuid := current_setting('scms.mem4a_branch_a1')::uuid;
  v_branch_appointment_status text;
  v_district_appointment_status text;
  v_role_count bigint;
BEGIN
  v_transfer := public.manage_member_transfer(
    'request', NULL, v_transfer_member, v_branch_a2, 'Moving within District Alpha'
  );
  v_transfer := public.manage_member_transfer('approve', v_transfer.id, NULL, NULL, NULL);

  SELECT branch_id INTO v_new_branch FROM public.profiles WHERE id = v_transfer_member;
  IF v_transfer.status <> 'approved' OR v_new_branch <> v_branch_a2 THEN
    RAISE EXCEPTION 'Transfer approval did not atomically move member branch_id.';
  END IF;

  SELECT status INTO v_branch_appointment_status
  FROM public.leadership_appointments
  WHERE id = current_setting('scms.mem4a_transfer_branch_appointment_id')::uuid;

  SELECT status INTO v_district_appointment_status
  FROM public.leadership_appointments
  WHERE id = current_setting('scms.mem4a_transfer_district_appointment_id')::uuid;

  IF v_branch_appointment_status IS DISTINCT FROM 'ended' THEN
    RAISE EXCEPTION 'Branch leadership appointment was not ended after member transfer.';
  END IF;
  IF v_district_appointment_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'Same-district transfer unexpectedly ended the district leadership appointment.';
  END IF;

  SELECT leader_id INTO v_cell_leader FROM public.cells WHERE id = v_cell_a1;
  SELECT count(*) INTO v_cell_member_count
  FROM public.cell_members
  WHERE member_id = v_transfer_member AND branch_id = v_source_branch;

  SELECT status, role
  INTO v_cell_member_status, v_cell_member_role
  FROM public.cell_members
  WHERE member_id = v_transfer_member
    AND branch_id = v_source_branch;

  IF v_cell_leader IS NOT NULL
    OR v_cell_member_count <> 1
    OR v_cell_member_status IS DISTINCT FROM 'transferred'
    OR v_cell_member_role IS DISTINCT FROM 'leader' THEN
    RAISE EXCEPTION 'Source cell membership history was not preserved as transferred, or current cell leadership was not released.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.cell_members
    WHERE member_id = v_transfer_member
      AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'A transferred member retained an active source cell membership.';
  END IF;

  SELECT status INTO v_branch_mm_status
  FROM public.ministry_members
  WHERE ministry_id = v_branch_ministry AND member_id = v_transfer_member;

  SELECT status INTO v_church_mm_status
  FROM public.ministry_members
  WHERE ministry_id = v_church_ministry AND member_id = v_transfer_member;

  IF v_branch_mm_status IS DISTINCT FROM 'inactive' THEN
    RAISE EXCEPTION 'Source-branch ministry_members row was not marked inactive (got %).', v_branch_mm_status;
  END IF;
  IF v_church_mm_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'Church-wide ministry_members row was not preserved active (got %).', v_church_mm_status;
  END IF;

  -- Confirm ministry appointment never created RBAC profile_role_assignments.
  SELECT count(*) INTO v_role_count
  FROM public.profile_role_assignments
  WHERE profile_id = v_transfer_member;
  IF v_role_count <> 0 THEN
    RAISE EXCEPTION 'Non-portal ministry leader unexpectedly gained system profile_role_assignments.';
  END IF;
END;
$scenario_e_f_transfer$;


-- Scenario G: Leadership appointments are independent of application roles.
-- Includes a directory-only member with no portal/auth account.
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('scms.mem4a_church_admin_auth_id'), true);

DO $leadership_appointment_lifecycle$
DECLARE
  v_standalone_member uuid := current_setting('scms.mem4a_beta_member_id')::uuid;
  v_standalone_branch uuid := current_setting('scms.mem4a_branch_b1')::uuid;
  v_transfer_member uuid := current_setting('scms.mem4a_transfer_member_id')::uuid;
  v_branch_a2 uuid := current_setting('scms.mem4a_branch_a2')::uuid;
  v_dist_a uuid := current_setting('scms.mem4a_dist_a')::uuid;
  v_dist_b uuid := current_setting('scms.mem4a_dist_b')::uuid;
  v_branch_appointment public.leadership_appointments;
  v_district_appointment public.leadership_appointments;
  v_role_count bigint;
BEGIN
  IF (SELECT auth_user_id FROM public.profiles WHERE id = v_standalone_member) IS NOT NULL THEN
    RAISE EXCEPTION 'The directory-only appointment fixture unexpectedly has a portal account.';
  END IF;

  SELECT count(*) INTO v_role_count
  FROM public.profile_role_assignments
  WHERE profile_id = v_standalone_member;

  v_branch_appointment := public.create_leadership_appointment(
    v_standalone_member,
    'branch',
    v_standalone_branch,
    NULL,
    'Congregation Care Coordinator',
    'Coordinates member care and follow-up.',
    current_date
  );

  IF v_branch_appointment.status <> 'active'
    OR v_branch_appointment.scope_type <> 'branch'
    OR v_branch_appointment.profile_id <> v_standalone_member THEN
    RAISE EXCEPTION 'Branch leadership appointment was not created correctly for a directory-only member.';
  END IF;

  IF (SELECT count(*) FROM public.profile_role_assignments WHERE profile_id = v_standalone_member) <> v_role_count THEN
    RAISE EXCEPTION 'Creating a leadership appointment unexpectedly modified RBAC assignments.';
  END IF;

  v_district_appointment := public.create_leadership_appointment(
    v_transfer_member,
    'district',
    NULL,
    v_dist_a,
    'District Outreach Coordinator',
    NULL,
    current_date
  );

  IF v_district_appointment.status <> 'active'
    OR v_district_appointment.scope_type <> 'district'
    OR v_district_appointment.district_id <> v_dist_a THEN
    RAISE EXCEPTION 'District leadership appointment was not created correctly.';
  END IF;

  v_branch_appointment := public.end_leadership_appointment(
    v_branch_appointment.id,
    'Appointment concluded for lifecycle test.'
  );

  IF v_branch_appointment.status <> 'ended'
    OR v_branch_appointment.ended_at IS NULL
    OR v_branch_appointment.ended_by_profile_id IS DISTINCT FROM private.current_profile_id() THEN
    RAISE EXCEPTION 'Ending a leadership appointment did not preserve its lifecycle attribution.';
  END IF;

  BEGIN
    PERFORM public.create_leadership_appointment(
      v_standalone_member,
      'branch',
      v_branch_a2,
      NULL,
      'Invalid Cross-Branch Appointment',
      NULL,
      current_date
    );
    RAISE EXCEPTION 'A member was appointed to a branch they do not belong to.' USING ERRCODE = 'P0001';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  BEGIN
    PERFORM public.create_leadership_appointment(
      v_transfer_member,
      'district',
      NULL,
      v_dist_b,
      'Invalid Cross-District Appointment',
      NULL,
      current_date
    );
    RAISE EXCEPTION 'A member was appointed to a district outside their current branch.' USING ERRCODE = 'P0001';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  IF (SELECT count(*) FROM public.profile_role_assignments WHERE profile_id = v_standalone_member) <> v_role_count THEN
    RAISE EXCEPTION 'Leadership appointment lifecycle changed application RBAC assignments.';
  END IF;
END;
$leadership_appointment_lifecycle$;

-- A district administrator may appoint only within their own district.
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('scms.mem4a_dist_admin_auth_id'), true);

DO $district_leadership_scope$
BEGIN
  BEGIN
    PERFORM public.create_leadership_appointment(
      current_setting('scms.mem4a_beta_member_id')::uuid,
      'district',
      NULL,
      current_setting('scms.mem4a_dist_b')::uuid,
      'Out-of-Scope Overseer',
      NULL,
      current_date
    );
    RAISE EXCEPTION 'District administrator created an appointment outside their assigned district.'
      USING ERRCODE = 'P0001';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END;
$district_leadership_scope$;

ROLLBACK;
