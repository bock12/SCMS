
export type AppRole = 'super_admin' | 'admin' | 'district_admin' | 'pastor' | 'finance_officer' | 'leader' | 'worker' | 'member';

export interface Profile {
  id: string;
  branch_id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  avatar_url?: string;
  primary_role: AppRole;
  department_name?: string;
  assigned_department?: string;
  created_at: string;
  is_baptized?: boolean;
  baptism_date?: string;
  baptized_by?: string;
  date_of_birth?: string;
  marital_status?: 'Single' | 'Married' | 'Widowed' | 'Divorced';
  marriage_date?: string;
}

export interface District {
  id: string;
  name: string;
  region: string;
  country: string;
}

export interface ChurchBranch {
  id: string;
  district_id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  is_main_branch: boolean;
  district?: District;
  latitude?: number;
  longitude?: number;
}

export interface ChurchProfile {
  name: string;
  main_title?: string;
  subtle_title?: string;
  senior_pastor: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  state_country: string;
  logo_url: string;
  latitude: number;
  longitude: number;
  service_times: string[];
  website?: string;
  mission_statement?: string;
  primary_color?: string;
  secondary_color?: string;
}

export interface ChurchEvent {
  id: string;
  branch_id?: string;
  title: string;
  description: string;
  category: EventCategory;
  start_time: string;
  end_time: string;
  location: string;
  latitude?: number;
  longitude?: number;
  is_virtual?: boolean;
  virtual_link?: string;
  featured_image?: string;
  organizer_name?: string;
  target_audience?: EventTargetAudience;
  registration_required?: boolean;
  max_attendees?: number;
  registered_count?: number;
  status: 'upcoming' | 'ongoing' | 'completed' | 'cancelled';
  created_at?: string;
  // Recurrence Program support
  recurrence?: EventRecurrence;
  recurrence_pattern?: string;
  recurrence_end_date?: string;
  next_occurrence?: string;
  recurring_funding_allowance?: number;
  recurrence_nth?: number; // 1 = 1st, 2 = 2nd, 3 = 3rd, 4 = 4th, -1 = last
  recurrence_weekday?: number; // 0 = Sun, 1 = Mon, ..., 6 = Sat
  excluded_months?: number[]; // Array of 0-indexed month numbers to skip (e.g. [0] for January)
  recurrence_config?: EventRecurrenceRuleConfig;
  // Dedicated Event Account Link
  has_funding_account?: boolean;
  account_number?: string;
  account_balance?: number;
  // Combined Service & Schedule Preemption
  is_combined_service?: boolean;
  preempts_regular_service?: boolean;
}

export interface Member {
  id: string;
  profile_id?: string;
  branch_id: string;
  first_name: string;
  last_name: string;
  gender: 'male' | 'female' | 'other';
  status: 'active' | 'inactive' | 'suspended' | 'transferred' | 'archived';
  membership_date: string;
  email?: string;
  phone?: string;
  avatar_url?: string;
  is_baptized?: boolean;
  baptism_date?: string;
  baptized_by?: string;
  date_of_birth?: string;
  marital_status?: 'Single' | 'Married' | 'Widowed' | 'Divorced';
  marriage_date?: string;
}

export interface MemberTransfer {
  id: string;
  member_id: string;
  from_branch_id: string;
  to_branch_id: string;
  status: 'pending' | 'approved' | 'rejected';
  request_date: string;
  notes?: string;
  // Joins
  member?: { first_name: string; last_name: string };
  from_branch?: { name: string };
  to_branch?: { name: string };
}

export interface Stream {
  id: string;
  branch_id: string;
  title: string;
  description: string;
  platform: 'youtube' | 'facebook' | 'vimeo' | 'custom' | 'supabase';
  privacy: 'public' | 'members_only' | 'private';
  status: 'scheduled' | 'live' | 'ended' | 'archived';
  embed_url?: string;
  thumbnail_url?: string;
  scheduled_start: string;
  view_count: number;
}

export interface ChatMessage {
  id: string;
  stream_id: string;
  user_id: string;
  message: string;
  created_at: string;
  profile?: {
    first_name: string;
    last_name: string;
    avatar_url?: string;
    primary_role: string;
  };
}

export interface Ministry {
  id: string;
  name: string;
  description: string;
  leader_name: string;
  leader_id?: string;
  meeting_time: string;
  member_count: number;
  category: string;
  type?: 'social_fellowship' | 'service_department';
  roles_and_responsibilities?: string[];
}

export interface FinancialRecord {
  id: string;
  contributor_name: string; // Member, Vendor, Payee, or Beneficiary Name
  user_id?: string;
  type?: 'income' | 'expense'; // Default 'income'
  category: string; // Income: 'Tithe', 'Offering', 'Pledge', 'Building Expansion Fund', custom funds | Expense: 'Pastoral & Staff Stipends', 'Utilities & Electricity', 'Building Maintenance', 'Ministry & Worship Budgets', 'Evangelism & Missions', 'Media & IT Equipment', 'Welfare & Charity'
  amount: number;
  currency?: string; // Default SLE
  date: string;
  payment_method: 'card' | 'bank_transfer' | 'cash' | 'mobile_money' | 'check';
  status?: 'completed' | 'pending_verification' | 'failed' | 'rejected';
  is_recurring?: boolean;
  frequency?: 'one_time' | 'weekly' | 'biweekly' | 'monthly' | 'yearly';
  next_recurring_date?: string;
  notes?: string;
  approved_by?: string; // Authorized by Finance Officer / Treasury
  // Proof & Details for Wire & Mobile Money
  payment_proof_ref?: string; // Receipt / Transfer Slip
  sender_phone?: string; // Mobile money sender number
  transaction_id?: string; // Mobile money transaction ID or Bank wire reference
  payment_date_time?: string;
  card_last4?: string;
  card_brand?: string;
}

export interface GivingFund {
  id: string;
  name: string;
  description?: string;
  is_active: boolean;
  is_default?: boolean;
}

export interface MobileMoneyGateway {
  id?: string;
  provider: string; // e.g. 'Afrimoney', 'Orange Money'
  merchant_number: string;
  merchant_name: string;
  dial_code_instructions: string;
  is_active: boolean;
  color?: string;
}

export interface BankAccountDetails {
  bank_name: string;
  account_name: string;
  account_number: string;
  swift_code?: string;
  branch_code?: string;
  instructions?: string;
}

export interface GivingConfig {
  currency_code: string; // 'SLE'
  currency_symbol: string; // 'SLE'
  funds: GivingFund[];
  mobile_gateways: MobileMoneyGateway[];
  bank_details: BankAccountDetails;
  card_payments_enabled: boolean;
  allow_custom_funds: boolean;
}

export interface PrayerRequest {
  id: string;
  member_name: string;
  request: string;
  date: string;
  is_anonymous: boolean;
  prayed_count: number;
}

export type EventCategory = 
  | 'Worship Service'
  | 'Special Service'
  | 'Conference'
  | 'Youth Event'
  | 'Community Outreach'
  | 'Prayer & Fasting'
  | 'Department Meeting'
  | 'Fellowship & Social';

export type EventTargetAudience = 
  | 'All Congregation'
  | 'Youth & Teens'
  | 'Men'
  | 'Women'
  | 'Leaders & Workers'
  | 'Children';

export interface MonthRecurrenceOverride {
  month: number; // 0-indexed month (0 = January, 1 = February, ..., 11 = December)
  week_number: number; // 1 = 1st, 2 = 2nd, 3 = 3rd, 4 = 4th, 5 = 5th / Last
  weekday?: number; // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  is_skipped?: boolean;
}

export interface EventRecurrenceRuleConfig {
  frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'YEARLY' | 'CUSTOM';
  interval?: number; // Repeat interval e.g. every 1 month or 3 months
  days_of_week?: number[]; // Selected weekdays for weekly events e.g. [0] for Sun, [2] for Tue, [4] for Thu
  pattern?: 'NTH_WEEKDAY' | 'DAY_OF_MONTH' | 'ANCHORED_MONTHS';
  weekday?: number; // 0 = Sunday, ..., 6 = Saturday
  week_number?: number; // Default week occurrence e.g. 2 for 2nd Sunday
  starting_month?: number; // Starting month anchor (e.g., 11 for December)
  anchor_months?: number[]; // Array of 0-indexed month numbers e.g. [2, 5, 8, 11] for Mar, Jun, Sep, Dec
  month_overrides?: MonthRecurrenceOverride[]; // e.g., [{ month: 0, week_number: 1 }] for January = First Sunday
  start_date?: string;
  end_date?: string;
}

export interface EventOccurrence {
  id: string; // e.g. evt-1_2026-11-08
  event_id: string;
  event_title: string;
  occurrence_date: string; // YYYY-MM-DD
  start_time: string; // ISO string
  end_time: string; // ISO string
  status: 'scheduled' | 'cancelled' | 'completed' | 'rescheduled';
  is_modified?: boolean;
  modified_notes?: string;
  override_time?: string;
  override_location?: string;
  attendance_count?: number;
  category: EventCategory;
  location: string;
  organizer_name?: string;
  is_combined_service?: boolean;
  account_number?: string;
}

export interface OccurrenceOverride {
  id: string;
  event_id: string;
  occurrence_date: string; // YYYY-MM-DD
  action: 'cancel' | 'reschedule' | 'modify';
  new_start_time?: string;
  new_end_time?: string;
  new_location?: string;
  notes?: string;
}

export interface ChurchEvent {
  id: string;
  branch_id?: string;
  title: string;
  description: string;
  category: EventCategory;
  start_time: string;
  end_time: string;
  location: string;
  is_virtual?: boolean;
  virtual_link?: string;
  featured_image?: string;
  organizer_name?: string;
  target_audience?: EventTargetAudience;
  registration_required?: boolean;
  max_attendees?: number;
  registered_count?: number;
  status: 'upcoming' | 'ongoing' | 'completed' | 'cancelled';
  created_at?: string;
  // Recurrence Program support
  recurrence?: EventRecurrence;
  recurrence_pattern?: string;
  recurrence_end_date?: string;
  next_occurrence?: string;
  recurring_funding_allowance?: number;
  recurrence_nth?: number; // 1 = 1st, 2 = 2nd, 3 = 3rd, 4 = 4th, -1 = last
  recurrence_weekday?: number; // 0 = Sun, 1 = Mon, ..., 6 = Sat
  excluded_months?: number[]; // Array of 0-indexed month numbers to skip (e.g. [0] for January)
  recurrence_config?: EventRecurrenceRuleConfig;
  // Dedicated Event Account Link
  has_funding_account?: boolean;
  account_number?: string;
  account_balance?: number;
  // Combined Service & Schedule Preemption
  is_combined_service?: boolean;
  preempts_regular_service?: boolean;
}

export interface EventFundingTransaction {
  id: string;
  event_id: string;
  type: 'deposit' | 'treasury_allocation' | 'donation' | 'disbursement';
  amount: number;
  currency: string;
  contributor_or_payee: string;
  source_or_channel: 'church_treasury' | 'bank_wire' | 'mobile_money' | 'cash' | 'card';
  transaction_ref?: string;
  date: string;
  notes?: string;
  recorded_by?: string;
}

export interface EventAccount {
  event_id: string;
  event_title: string;
  account_number: string;
  account_name: string;
  bank_name: string;
  bank_account_number: string;
  mobile_money_merchant: string;
  donor_reference_code: string;
  currency: string;
  current_balance: number;
  target_budget: number;
  total_funded: number;
  total_disbursed: number;
  status: 'active' | 'reconciled' | 'closed';
  created_at: string;
  transactions: EventFundingTransaction[];
}

export interface EventRegistration {
  id: string;
  event_id: string;
  user_id?: string;
  member_id?: string;
  member_name: string;
  email: string;
  phone?: string;
  registered_at: string;
  checked_in_at?: string | null;
  status: 'confirmed' | 'cancelled' | 'waitlist' | 'checked_in' | 'absent' | 'attended';
}

export type EventRoleTitle = 
  | 'Event Manager'
  | 'Worship & Music Lead'
  | 'Logistics & Ushering'
  | 'Media & Live Stream'
  | 'Hospitality & Catering'
  | 'Prayer Coordinator'
  | 'Volunteer Worker';

export interface EventTeamRole {
  id: string;
  event_id: string;
  user_id?: string;
  member_name: string;
  role_title: EventRoleTitle;
  phone?: string;
  email?: string;
  assigned_at: string;
}

export interface EventTask {
  id: string;
  event_id: string;
  title: string;
  assignee_name?: string;
  due_date?: string;
  status: 'todo' | 'in_progress' | 'completed';
}

export interface EventScheduleItem {
  id: string;
  event_id: string;
  time_slot: string;
  activity_title: string;
  leader_or_minister?: string;
  notes?: string;
}

export interface EventExpense {
  id: string;
  event_id: string;
  item_name: string;
  category: string;
  estimated_cost: number;
  actual_cost: number;
  status: 'planned' | 'paid' | 'pending';
}

export type RequisitionStatus = 
  | 'draft'                    // Saved locally by Ministry Lead, not yet submitted for pastoral approval
  | 'pending_pastor_approval'  // Step 1: Submitted by Ministry Lead, awaiting Senior Pastor approval
  | 'pastor_approved'          // Step 2: Approved by Senior Pastor; forwarded to Finance Officer for final disbursement
  | 'pending_approval'         // Under Finance Officer review / triage
  | 'submitted_to_board'       // Escalated to Executive Board
  | 'approved'                 // Fully Authorized for disbursement
  | 'rejected'                 // Rejected with feedback
  | 'disbursed'                // Disbursed into department account by Finance Officer
  | 'reconciled'               // Department submitted spending report & receipts
  | 'settled';                // Finance Officer audited receipts and settled in Good Standing

export interface RequisitionItem {
  id: string;
  item_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
}

export interface DepartmentRequisition {
  id: string;
  requisition_number: string; // e.g. REQ-2026-004
  department_name: string; // e.g. 'Media & IT', 'Worship Team', 'Youth Ministry'
  applicant_id?: string;
  applicant_name: string;
  applicant_role?: string;
  title: string; // e.g. 'Purchase 2x Laptops and 4K Cameras'
  description?: string;
  requested_amount: number; // in SLE
  currency: string; // SLE
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: RequisitionStatus;
  created_at: string;
  needed_by_date?: string;
  items: RequisitionItem[];
  vendor_quote_url?: string;
  disbursement_method?: 'bank_transfer' | 'mobile_money' | 'cash';
  disbursement_account_info?: string;
  transaction_ref?: string;
  disbursed_at?: string;
  disbursed_by?: string;
  admin_notes?: string;

  // Step 1: Senior Pastor Approval
  pastor_approved_by?: string;
  pastor_approved_at?: string;
  pastor_approval_notes?: string;

  // Step 2: Finance Officer Triage & Board Approvals
  finance_officer_review_notes?: string;
  reviewed_at?: string;
  reviewed_by?: string;
  submitted_to_board_at?: string;
  board_approved_by?: string;
  board_approved_at?: string;
  board_notes?: string;

  // Step 3: Department Expenditure & Proof Upload
  actual_amount_spent?: number;
  unspent_balance_returned?: number;
  receipt_proof_url?: string; // Vendor Receipt photo/document
  receipt_notes?: string; // Itemized expenditure report by department
  reconciled_at?: string;
  reconciled_by?: string;

  // Step 4: Audit & Governance Compliance Rating
  audit_status?: 'good_standing' | 'flagged_discrepancy';
  audit_notes?: string;
  settled_at?: string;
  settled_by?: string;
}

export interface DepartmentFinancialStanding {
  department_name: string;
  total_requisitions: number;
  total_disbursed_amount: number;
  total_reconciled_amount: number;
  unspent_returned_amount: number;
  reconciliation_compliance_rate: number; // Percentage e.g. 100
  standing_status: 'Exemplary Standing (100%)' | 'Good Standing (80%+)' | 'Reconciliation Action Needed' | 'New Department';
  badge_color: string;
  pending_receipts_count: number;
}

export type ContributionCategory = 'welfare' | 'monthly_dues' | 'special_support';

export type WelfareReason = 'marriage' | 'burial_bereavement' | 'sickness_medical' | 'naming_ceremony' | 'emergency_hardship' | 'general_welfare';

export interface WelfareCampaignDrive {
  id: string;
  department_name: string;
  beneficiary_member_id?: string;
  beneficiary_member_name: string;
  reason: WelfareReason;
  title: string;
  description?: string;
  expected_amount_per_member: number;
  target_total_amount: number;
  deadline: string;
  status: 'active' | 'completed' | 'closed';
  created_at: string;
  created_by: string;
}

export interface MemberContribution {
  id: string;
  department_name: string;
  campaign_id?: string; // Optional link to dedicated WelfareCampaignDrive
  member_id: string;
  member_name: string;
  welfare_card_number?: string;
  category: ContributionCategory;
  welfare_reason?: WelfareReason;
  special_support_purpose?: string;
  period_month_year?: string;
  amount: number;
  currency: string;
  date: string;
  payment_method: 'cash' | 'mobile_money' | 'bank_transfer' | 'card';
  transaction_ref?: string;
  recorded_by: string;
  notes?: string;
}

export interface MemberWelfareCard {
  card_number: string;
  member_id: string;
  member_name: string;
  department_name: string;
  issued_date: string;
  status: 'Good Standing' | 'Dues Pending' | 'Exempted';
  total_welfare_paid: number;
  total_dues_paid: number;
  total_support_paid: number;
  last_contribution_date?: string;
}

export interface DepartmentLedgerRecord {
  id: string;
  department_name: string;
  type: 'income' | 'expense';
  category: string;
  description: string;
  amount: number;
  currency: string;
  date: string;
  recorded_by: string;
  receipt_image_url?: string; // Scanned physical receipt image data URL or path
  vendor_name?: string;
  payment_method?: string;
  notes?: string;
  // Member Welfare & Contribution extensions
  member_id?: string;
  member_name?: string;
  contribution_category?: ContributionCategory;
  welfare_reason?: WelfareReason;
  welfare_card_number?: string;
}

export type PermissionKey = 
  | 'manage_finances'
  | 'approve_requisitions'
  | 'manage_events'
  | 'manage_event_budgets'
  | 'event_check_in'
  | 'manage_members'
  | 'manage_ministries'
  | 'manage_streams'
  | 'generate_reports';

export interface CustomRole {
  id: string;
  name: string;
  category: 'Spiritual' | 'Administration' | 'Operations' | 'Finance' | 'Creative & Media' | 'Youth & Children';
  ministry_id?: string;
  ministry_name?: string;
  description: string;
  responsibilities: string[];
  permissions: PermissionKey[];
  created_at: string;
  assigned_count?: number;
}

export interface MemberRoleAssignment {
  id: string;
  profile_id?: string;
  member_id?: string;
  member_name: string;
  role_id: string;
  role_name: string;
  ministry_id?: string;
  ministry_name?: string;
  assigned_at: string;
  assigned_by: string;
}

export interface MinistryMember {
  id: string;
  ministry_id: string;
  member_id: string;
  role_title: string;
  duty: string;
  status: 'active' | 'on_leave' | 'in_training' | 'inactive';
  joined_at: string;
  created_by?: string;
}

export interface ProformaLineItem {
  id: string;
  description: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  category?: string;
}

export type EventBudgetApprovalStatus = 'draft' | 'pending_approval' | 'approved' | 'rejected' | 'disbursed';

export interface EventBudgetApproval {
  event_id: string;
  event_title: string;
  status: EventBudgetApprovalStatus;
  total_budget: number;
  total_actual?: number;
  submitted_by: string;
  submitted_at: string;
  approved_by?: string;
  approved_at?: string;
  disbursed_by?: string;
  disbursed_at?: string;
  transaction_ref?: string;
  disbursement_channel?: string;
  rejection_reason?: string;
  notes?: string;
  invoice_number?: string;
  invoice_date?: string;
  items_breakdown?: ProformaLineItem[];
}




