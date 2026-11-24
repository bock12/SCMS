-- MEM-INT-004C: branch-scoped welfare case, campaign and finance-link APIs.

CREATE OR REPLACE FUNCTION private.manage_welfare_campaign(p_action text, p_campaign_id uuid DEFAULT NULL::uuid, p_branch_id uuid DEFAULT NULL::uuid, p_campaign_name text DEFAULT NULL::text, p_beneficiary text DEFAULT NULL::text, p_purpose text DEFAULT NULL::text, p_target_amount numeric DEFAULT NULL::numeric, p_expected_contribution numeric DEFAULT 0, p_currency_code character DEFAULT 'SLE'::bpchar, p_deadline date DEFAULT NULL::date, p_status text DEFAULT NULL::text)
 RETURNS welfare_campaigns
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_actor_id uuid;
  v_campaign public.welfare_campaigns;
  v_result public.welfare_campaigns;
  v_branch_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501'; END IF;
  v_actor_id := private.current_profile_id();
  IF v_actor_id IS NULL THEN RAISE EXCEPTION 'An active linked church profile is required.' USING ERRCODE = '42501'; END IF;
  IF p_action NOT IN ('create', 'update') THEN RAISE EXCEPTION 'Unsupported welfare campaign operation.' USING ERRCODE = '22023'; END IF;

  IF p_action = 'create' THEN
    IF NULLIF(pg_catalog.btrim(p_campaign_name), '') IS NULL OR p_target_amount IS NULL OR p_target_amount < 0
      OR p_expected_contribution < 0 THEN
      RAISE EXCEPTION 'Campaign name and non-negative target/contribution amounts are required.' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.currencies c WHERE c.code = p_currency_code) THEN
      RAISE EXCEPTION 'Select a supported campaign currency.' USING ERRCODE = '22023';
    END IF;
    IF p_branch_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.church_branches b WHERE b.id=p_branch_id AND b.status='active') THEN
      RAISE EXCEPTION 'The campaign branch is unavailable.' USING ERRCODE = '23503';
    END IF;
    IF NOT private.has_permission('manage_welfare', p_branch_id) THEN
      RAISE EXCEPTION 'You do not have permission to manage welfare campaigns in this scope.' USING ERRCODE = '42501';
    END IF;
    INSERT INTO public.welfare_campaigns (
      branch_id, campaign_name, beneficiary, purpose, target_amount, expected_contribution,
      currency_code, deadline, status, created_by_profile_id
    ) VALUES (
      p_branch_id, pg_catalog.btrim(p_campaign_name), NULLIF(pg_catalog.btrim(p_beneficiary), ''),
      NULLIF(pg_catalog.btrim(p_purpose), ''), p_target_amount, COALESCE(p_expected_contribution,0),
      p_currency_code, p_deadline, COALESCE(p_status,'draft'), v_actor_id
    ) RETURNING * INTO v_result;
    RETURN v_result;
  END IF;

  IF p_campaign_id IS NULL THEN RAISE EXCEPTION 'A welfare campaign is required.' USING ERRCODE = '22023'; END IF;
  SELECT * INTO v_campaign FROM public.welfare_campaigns WHERE id=p_campaign_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'The welfare campaign could not be found.' USING ERRCODE = 'P0002'; END IF;
  IF NOT private.has_permission('manage_welfare', v_campaign.branch_id) THEN
    RAISE EXCEPTION 'You do not have permission to manage this welfare campaign.' USING ERRCODE = '42501';
  END IF;
  IF p_status IS NOT NULL AND p_status NOT IN ('draft','active','completed','cancelled','archived') THEN
    RAISE EXCEPTION 'Invalid welfare campaign status.' USING ERRCODE = '22023';
  END IF;
  IF p_target_amount IS NOT NULL AND p_target_amount < 0 OR p_expected_contribution < 0 THEN
    RAISE EXCEPTION 'Campaign target and expected contribution cannot be negative.' USING ERRCODE = '22023';
  END IF;
  UPDATE public.welfare_campaigns
  SET campaign_name = COALESCE(NULLIF(pg_catalog.btrim(p_campaign_name), ''), campaign_name),
      beneficiary = CASE WHEN p_beneficiary IS NULL THEN beneficiary ELSE NULLIF(pg_catalog.btrim(p_beneficiary), '') END,
      purpose = CASE WHEN p_purpose IS NULL THEN purpose ELSE NULLIF(pg_catalog.btrim(p_purpose), '') END,
      target_amount = COALESCE(p_target_amount, target_amount),
      expected_contribution = COALESCE(p_expected_contribution, expected_contribution),
      deadline = COALESCE(p_deadline, deadline),
      status = COALESCE(p_status, status),
      updated_at = now()
  WHERE id=p_campaign_id
  RETURNING * INTO v_result;
  RETURN v_result;
END;
$function$


CREATE OR REPLACE FUNCTION private.manage_welfare_case(p_action text, p_case_id uuid DEFAULT NULL::uuid, p_member_id uuid DEFAULT NULL::uuid, p_case_type text DEFAULT NULL::text, p_reason text DEFAULT NULL::text, p_restricted_description text DEFAULT NULL::text, p_priority text DEFAULT 'normal'::text, p_status text DEFAULT NULL::text, p_assigned_to_profile_id uuid DEFAULT NULL::uuid)
 RETURNS welfare_cases
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_actor_id uuid;
  v_member public.profiles;
  v_case public.welfare_cases;
  v_result public.welfare_cases;
  v_branch_id uuid;
  v_assignee_branch_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501'; END IF;
  v_actor_id := private.current_profile_id();
  IF v_actor_id IS NULL THEN RAISE EXCEPTION 'An active linked church profile is required.' USING ERRCODE = '42501'; END IF;
  IF p_action NOT IN ('create', 'update') THEN RAISE EXCEPTION 'Unsupported welfare case operation.' USING ERRCODE = '22023'; END IF;

  IF p_action = 'create' THEN
    SELECT * INTO v_member FROM public.profiles
    WHERE id = COALESCE(p_member_id, v_actor_id) AND record_status = 'active'
    FOR KEY SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'The selected church member is unavailable.' USING ERRCODE = '23503'; END IF;
    IF v_member.id <> v_actor_id AND NOT private.has_permission('manage_welfare', v_member.branch_id) THEN
      RAISE EXCEPTION 'You do not have permission to submit a welfare case for this member.' USING ERRCODE = '42501';
    END IF;
    IF NULLIF(pg_catalog.btrim(p_case_type), '') IS NULL OR NULLIF(pg_catalog.btrim(p_reason), '') IS NULL THEN
      RAISE EXCEPTION 'Welfare case type and reason are required.' USING ERRCODE = '22023';
    END IF;
    IF p_priority NOT IN ('low', 'normal', 'high', 'urgent') THEN RAISE EXCEPTION 'Invalid welfare case priority.' USING ERRCODE = '22023'; END IF;
    INSERT INTO public.welfare_cases (
      member_id, branch_id, case_type, reason, restricted_description, priority,
      status, created_by_profile_id
    ) VALUES (
      v_member.id, v_member.branch_id, pg_catalog.btrim(p_case_type), pg_catalog.btrim(p_reason),
      NULLIF(pg_catalog.btrim(p_restricted_description), ''), p_priority, 'submitted', v_actor_id
    ) RETURNING * INTO v_result;
    RETURN v_result;
  END IF;

  IF p_case_id IS NULL THEN RAISE EXCEPTION 'A welfare case is required.' USING ERRCODE = '22023'; END IF;
  SELECT * INTO v_case FROM public.welfare_cases WHERE id = p_case_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'The welfare case could not be found.' USING ERRCODE = 'P0002'; END IF;
  IF NOT private.has_permission('manage_welfare', v_case.branch_id) THEN
    RAISE EXCEPTION 'You do not have permission to manage this welfare case.' USING ERRCODE = '42501';
  END IF;
  IF p_status IS NOT NULL AND p_status NOT IN ('submitted', 'under_review', 'approved', 'rejected', 'completed', 'closed') THEN
    RAISE EXCEPTION 'Invalid welfare case status.' USING ERRCODE = '22023';
  END IF;
  IF p_priority IS NOT NULL AND p_priority NOT IN ('low', 'normal', 'high', 'urgent') THEN
    RAISE EXCEPTION 'Invalid welfare case priority.' USING ERRCODE = '22023';
  END IF;
  IF p_assigned_to_profile_id IS NOT NULL THEN
    SELECT branch_id INTO v_assignee_branch_id FROM public.profiles
    WHERE id = p_assigned_to_profile_id AND record_status = 'active';
    IF NOT FOUND OR v_assignee_branch_id IS DISTINCT FROM v_case.branch_id THEN
      RAISE EXCEPTION 'The assigned welfare officer must be active in the case branch.' USING ERRCODE = '22023';
    END IF;
  END IF;
  UPDATE public.welfare_cases
  SET status = COALESCE(p_status, status),
      priority = COALESCE(p_priority, priority),
      assigned_to_profile_id = CASE WHEN p_assigned_to_profile_id IS NULL THEN assigned_to_profile_id ELSE p_assigned_to_profile_id END,
      restricted_description = CASE WHEN p_restricted_description IS NULL THEN restricted_description ELSE NULLIF(pg_catalog.btrim(p_restricted_description), '') END,
      updated_at = now()
  WHERE id = p_case_id
  RETURNING * INTO v_result;
  RETURN v_result;
END;
$function$


CREATE OR REPLACE FUNCTION private.record_welfare_assistance(p_case_id uuid, p_assistance_type text, p_financial_document_id uuid, p_description text DEFAULT NULL::text)
 RETURNS welfare_assistance
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_actor_id uuid;
  v_case public.welfare_cases;
  v_document public.financial_documents;
  v_result public.welfare_assistance;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501'; END IF;
  v_actor_id := private.current_profile_id();
  IF v_actor_id IS NULL THEN RAISE EXCEPTION 'An active linked church profile is required.' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_case FROM public.welfare_cases WHERE id=p_case_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'The welfare case could not be found.' USING ERRCODE = 'P0002'; END IF;
  IF NOT private.has_permission('manage_welfare', v_case.branch_id) THEN
    RAISE EXCEPTION 'You do not have permission to record assistance for this case.' USING ERRCODE = '42501';
  END IF;
  IF v_case.status NOT IN ('approved','completed') THEN
    RAISE EXCEPTION 'Only approved welfare cases can receive assistance.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_document FROM public.financial_documents WHERE id=p_financial_document_id FOR KEY SHARE;
  IF NOT FOUND OR v_document.status <> 'posted' OR v_document.document_type NOT IN ('payment','adjustment') THEN
    RAISE EXCEPTION 'A posted payment or adjustment document is required for welfare assistance.' USING ERRCODE = '23514';
  END IF;
  IF v_case.branch_id IS NOT NULL AND v_document.branch_id IS DISTINCT FROM v_case.branch_id THEN
    RAISE EXCEPTION 'Welfare assistance and payment branches must match.' USING ERRCODE = '23514';
  END IF;
  INSERT INTO public.welfare_assistance (
    case_id, assistance_type, financial_document_id, description, approved_by_profile_id, provided_at
  ) VALUES (
    p_case_id, pg_catalog.btrim(p_assistance_type), p_financial_document_id,
    NULLIF(pg_catalog.btrim(p_description), ''), v_actor_id, now()
  ) RETURNING * INTO v_result;
  RETURN v_result;
END;
$function$


CREATE OR REPLACE FUNCTION private.record_welfare_contribution(p_campaign_id uuid, p_financial_document_id uuid, p_contributing_member_id uuid DEFAULT NULL::uuid, p_contribution_date date DEFAULT CURRENT_DATE)
 RETURNS welfare_contributions
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_actor_id uuid;
  v_campaign public.welfare_campaigns;
  v_document public.financial_documents;
  v_member public.profiles;
  v_result public.welfare_contributions;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501'; END IF;
  v_actor_id := private.current_profile_id();
  IF v_actor_id IS NULL THEN RAISE EXCEPTION 'An active linked church profile is required.' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_campaign FROM public.welfare_campaigns WHERE id=p_campaign_id AND status='active' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'The welfare campaign is not active.' USING ERRCODE = '23503'; END IF;
  IF NOT private.has_permission('manage_welfare', v_campaign.branch_id) THEN
    RAISE EXCEPTION 'You do not have permission to record welfare contributions for this campaign.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_document FROM public.financial_documents WHERE id=p_financial_document_id FOR KEY SHARE;
  IF NOT FOUND OR v_document.status <> 'posted' OR v_document.document_type NOT IN ('receipt','adjustment') THEN
    RAISE EXCEPTION 'A posted receipt or adjustment document is required for a welfare contribution.' USING ERRCODE = '23514';
  END IF;
  IF v_document.currency_code <> v_campaign.currency_code THEN
    RAISE EXCEPTION 'Contribution currency must match the campaign currency.' USING ERRCODE = '23514';
  END IF;
  IF v_campaign.branch_id IS NOT NULL AND v_document.branch_id IS DISTINCT FROM v_campaign.branch_id THEN
    RAISE EXCEPTION 'Contribution and campaign branches must match.' USING ERRCODE = '23514';
  END IF;
  IF p_contributing_member_id IS NOT NULL THEN
    SELECT * INTO v_member FROM public.profiles WHERE id=p_contributing_member_id AND record_status='active';
    IF NOT FOUND THEN RAISE EXCEPTION 'The contributing member is unavailable.' USING ERRCODE = '23503'; END IF;
    IF v_document.profile_id IS DISTINCT FROM v_member.id THEN
      RAISE EXCEPTION 'The financial receipt must identify the same contributing member.' USING ERRCODE = '23514';
    END IF;
    IF v_campaign.branch_id IS NOT NULL AND v_member.branch_id IS DISTINCT FROM v_campaign.branch_id THEN
      RAISE EXCEPTION 'The contributing member must belong to the campaign branch.' USING ERRCODE = '23514';
    END IF;
  END IF;
  INSERT INTO public.welfare_contributions (
    campaign_id, contributing_member_id, financial_document_id, contribution_date
  ) VALUES (
    p_campaign_id, p_contributing_member_id, p_financial_document_id, COALESCE(p_contribution_date,CURRENT_DATE)
  ) RETURNING * INTO v_result;
  RETURN v_result;
END;
$function$


CREATE OR REPLACE FUNCTION public.manage_welfare_campaign(p_action text, p_campaign_id uuid DEFAULT NULL::uuid, p_branch_id uuid DEFAULT NULL::uuid, p_campaign_name text DEFAULT NULL::text, p_beneficiary text DEFAULT NULL::text, p_purpose text DEFAULT NULL::text, p_target_amount numeric DEFAULT NULL::numeric, p_expected_contribution numeric DEFAULT 0, p_currency_code character DEFAULT 'SLE'::bpchar, p_deadline date DEFAULT NULL::date, p_status text DEFAULT NULL::text)
 RETURNS welfare_campaigns
 LANGUAGE sql
 SET search_path TO ''
AS $function$ SELECT private.manage_welfare_campaign(p_action,p_campaign_id,p_branch_id,p_campaign_name,p_beneficiary,p_purpose,p_target_amount,p_expected_contribution,p_currency_code,p_deadline,p_status); $function$


CREATE OR REPLACE FUNCTION public.manage_welfare_case(p_action text, p_case_id uuid DEFAULT NULL::uuid, p_member_id uuid DEFAULT NULL::uuid, p_case_type text DEFAULT NULL::text, p_reason text DEFAULT NULL::text, p_restricted_description text DEFAULT NULL::text, p_priority text DEFAULT 'normal'::text, p_status text DEFAULT NULL::text, p_assigned_to_profile_id uuid DEFAULT NULL::uuid)
 RETURNS welfare_cases
 LANGUAGE sql
 SET search_path TO ''
AS $function$ SELECT private.manage_welfare_case(p_action,p_case_id,p_member_id,p_case_type,p_reason,p_restricted_description,p_priority,p_status,p_assigned_to_profile_id); $function$


CREATE OR REPLACE FUNCTION public.record_welfare_assistance(p_case_id uuid, p_assistance_type text, p_financial_document_id uuid, p_description text DEFAULT NULL::text)
 RETURNS welfare_assistance
 LANGUAGE sql
 SET search_path TO ''
AS $function$ SELECT private.record_welfare_assistance(p_case_id,p_assistance_type,p_financial_document_id,p_description); $function$


CREATE OR REPLACE FUNCTION public.record_welfare_contribution(p_campaign_id uuid, p_financial_document_id uuid, p_contributing_member_id uuid DEFAULT NULL::uuid, p_contribution_date date DEFAULT CURRENT_DATE)
 RETURNS welfare_contributions
 LANGUAGE sql
 SET search_path TO ''
AS $function$ SELECT private.record_welfare_contribution(p_campaign_id,p_financial_document_id,p_contributing_member_id,p_contribution_date); $function$



REVOKE ALL ON FUNCTION private.manage_welfare_case(text,uuid,uuid,text,text,text,text,text,uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.manage_welfare_campaign(text,uuid,uuid,text,text,text,numeric,numeric,character,date,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.record_welfare_contribution(uuid,uuid,uuid,date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.record_welfare_assistance(uuid,text,uuid,text) FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.manage_welfare_case(text,uuid,uuid,text,text,text,text,text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.manage_welfare_campaign(text,uuid,uuid,text,text,text,numeric,numeric,character,date,text) TO authenticated;
GRANT EXECUTE ON FUNCTION private.record_welfare_contribution(uuid,uuid,uuid,date) TO authenticated;
GRANT EXECUTE ON FUNCTION private.record_welfare_assistance(uuid,text,uuid,text) TO authenticated;

REVOKE ALL ON FUNCTION public.manage_welfare_case(text,uuid,uuid,text,text,text,text,text,uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.manage_welfare_campaign(text,uuid,uuid,text,text,text,numeric,numeric,character,date,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.record_welfare_contribution(uuid,uuid,uuid,date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.record_welfare_assistance(uuid,text,uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.manage_welfare_case(text,uuid,uuid,text,text,text,text,text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.manage_welfare_campaign(text,uuid,uuid,text,text,text,numeric,numeric,character,date,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_welfare_contribution(uuid,uuid,uuid,date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_welfare_assistance(uuid,text,uuid,text) TO authenticated;
