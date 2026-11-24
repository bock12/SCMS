import { supabase } from './supabaseClient';

export interface WelfareCaseRecord {
  id: string;
  member_id: string;
  branch_id: string | null;
  case_type: string;
  reason: string;
  restricted_description?: string | null;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  status: 'submitted' | 'under_review' | 'approved' | 'rejected' | 'completed' | 'closed';
  assigned_to_profile_id?: string | null;
  created_by_profile_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface WelfareCampaignRecord {
  id: string;
  branch_id: string | null;
  campaign_name: string;
  beneficiary?: string | null;
  purpose?: string | null;
  target_amount: number;
  expected_contribution: number;
  currency_code: string;
  deadline?: string | null;
  status: 'draft' | 'active' | 'completed' | 'cancelled' | 'archived';
  created_by_profile_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface WelfareContributionRecord {
  id: string;
  campaign_id: string;
  contributing_member_id?: string | null;
  financial_document_id: string;
  contribution_date: string;
  created_at: string;
}

export async function getWelfareCases(): Promise<WelfareCaseRecord[]> {
  const { data, error } = await supabase.from('welfare_cases').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return Array.isArray(data) ? data as WelfareCaseRecord[] : [];
}

export async function createWelfareCase(input: {
  memberId?: string;
  caseType: string;
  reason: string;
  restrictedDescription?: string;
  priority?: WelfareCaseRecord['priority'];
}): Promise<WelfareCaseRecord> {
  const { data, error } = await supabase.rpc('manage_welfare_case', {
    p_action: 'create',
    p_member_id: input.memberId || null,
    p_case_type: input.caseType,
    p_reason: input.reason,
    p_restricted_description: input.restrictedDescription || null,
    p_priority: input.priority || 'normal'
  });
  if (error) throw error;
  if (!data) throw new Error('The welfare case was not saved.');
  return data as WelfareCaseRecord;
}

export async function updateWelfareCase(input: {
  caseId: string;
  status?: WelfareCaseRecord['status'];
  priority?: WelfareCaseRecord['priority'];
  assignedToProfileId?: string;
  restrictedDescription?: string;
}): Promise<WelfareCaseRecord> {
  const { data, error } = await supabase.rpc('manage_welfare_case', {
    p_action: 'update',
    p_case_id: input.caseId,
    p_status: input.status || null,
    p_priority: input.priority || null,
    p_assigned_to_profile_id: input.assignedToProfileId || null,
    p_restricted_description: input.restrictedDescription ?? null
  });
  if (error) throw error;
  if (!data) throw new Error('The welfare case update was not saved.');
  return data as WelfareCaseRecord;
}

export async function getWelfareCampaigns(branchId?: string): Promise<WelfareCampaignRecord[]> {
  let query = supabase.from('welfare_campaigns').select('*').order('created_at', { ascending: false });
  if (branchId) query = query.eq('branch_id', branchId);
  const { data, error } = await query;
  if (error) throw error;
  return Array.isArray(data) ? data as WelfareCampaignRecord[] : [];
}

export async function createWelfareCampaign(input: {
  branchId?: string | null;
  campaignName: string;
  beneficiary?: string;
  purpose?: string;
  targetAmount: number;
  expectedContribution?: number;
  currencyCode: string;
  deadline?: string;
  status?: WelfareCampaignRecord['status'];
}): Promise<WelfareCampaignRecord> {
  const { data, error } = await supabase.rpc('manage_welfare_campaign', {
    p_action: 'create',
    p_branch_id: input.branchId || null,
    p_campaign_name: input.campaignName,
    p_beneficiary: input.beneficiary || null,
    p_purpose: input.purpose || null,
    p_target_amount: input.targetAmount,
    p_expected_contribution: input.expectedContribution ?? 0,
    p_currency_code: input.currencyCode,
    p_deadline: input.deadline || null,
    p_status: input.status || 'draft'
  });
  if (error) throw error;
  if (!data) throw new Error('The welfare campaign was not saved.');
  return data as WelfareCampaignRecord;
}

export async function updateWelfareCampaign(input: {
  campaignId: string;
  campaignName?: string;
  beneficiary?: string;
  purpose?: string;
  targetAmount?: number;
  expectedContribution?: number;
  deadline?: string;
  status?: WelfareCampaignRecord['status'];
}): Promise<WelfareCampaignRecord> {
  const { data, error } = await supabase.rpc('manage_welfare_campaign', {
    p_action: 'update',
    p_campaign_id: input.campaignId,
    p_campaign_name: input.campaignName || null,
    p_beneficiary: input.beneficiary ?? null,
    p_purpose: input.purpose ?? null,
    p_target_amount: input.targetAmount ?? null,
    p_expected_contribution: input.expectedContribution ?? null,
    p_deadline: input.deadline ?? null,
    p_status: input.status ?? null
  });
  if (error) throw error;
  if (!data) throw new Error('The welfare campaign update was not saved.');
  return data as WelfareCampaignRecord;
}

export async function getWelfareContributions(campaignId: string): Promise<WelfareContributionRecord[]> {
  const { data, error } = await supabase.from('welfare_contributions').select('*')
    .eq('campaign_id', campaignId).order('contribution_date', { ascending: false });
  if (error) throw error;
  return Array.isArray(data) ? data as WelfareContributionRecord[] : [];
}

export async function recordWelfareContribution(input: {
  campaignId: string;
  financialDocumentId: string;
  contributingMemberId?: string;
  contributionDate?: string;
}): Promise<WelfareContributionRecord> {
  const { data, error } = await supabase.rpc('record_welfare_contribution', {
    p_campaign_id: input.campaignId,
    p_financial_document_id: input.financialDocumentId,
    p_contributing_member_id: input.contributingMemberId || null,
    p_contribution_date: input.contributionDate || null
  });
  if (error) throw error;
  if (!data) throw new Error('The welfare contribution was not linked to its posted finance receipt.');
  return data as WelfareContributionRecord;
}

export async function recordWelfareAssistance(input: {
  caseId: string;
  assistanceType: string;
  financialDocumentId: string;
  description?: string;
}): Promise<{ id: string; case_id: string; financial_document_id: string }> {
  const { data, error } = await supabase.rpc('record_welfare_assistance', {
    p_case_id: input.caseId,
    p_assistance_type: input.assistanceType,
    p_financial_document_id: input.financialDocumentId,
    p_description: input.description || null
  });
  if (error) throw error;
  if (!data) throw new Error('The welfare assistance was not linked to its posted finance payment.');
  return data as { id: string; case_id: string; financial_document_id: string };
}
