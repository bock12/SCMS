import { DepartmentRequisition, DepartmentFinancialStanding } from './types';

const STORAGE_KEY = 'faithconnect_department_requisitions_v2';

export const initialRequisitions: DepartmentRequisition[] = [
  {
    id: 'req-7',
    requisition_number: 'REQ-2026-007',
    department_name: 'Media & IT Ministry',
    applicant_name: 'David Koroma',
    applicant_role: 'Media Team Leader',
    title: 'High-Density Live Stream Video Encoder & Backup Uninterruptible Power Supply (UPS)',
    description: 'Requisition submitted for Senior Pastor approval. High-priority encoder for preventing stream dropouts during main service broadcasts.',
    requested_amount: 8500,
    currency: 'SLE',
    priority: 'urgent',
    status: 'pending_pastor_approval',
    created_at: new Date(Date.now() - 3600000 * 4).toISOString(),
    needed_by_date: '2026-11-12',
    vendor_quote_url: 'Freetown_Tech_Proforma_Encoder.pdf',
    disbursement_method: 'bank_transfer',
    disbursement_account_info: 'Sierra Leone Commercial Bank - Acc: 0030019921 (Vendor: TechZone)',
    items: [
      { id: 'item-14', item_name: 'Live stream hardware video encoder box (4K SDI)', quantity: 1, unit_price: 6000, total_price: 6000 },
      { id: 'item-15', item_name: 'Pure Sine Wave 2000VA UPS Battery System', quantity: 1, unit_price: 2500, total_price: 2500 }
    ]
  },
  {
    id: 'req-8',
    requisition_number: 'REQ-2026-008',
    department_name: 'Voices of Grace Choir',
    applicant_name: 'Hannah Adams',
    applicant_role: 'Choir Director',
    title: 'Easter Sunday Special Concert Choir Robes & Music Sheets',
    description: 'Proforma request approved by Senior Pastor. Forwarded to Finance Officer for final invoice processing and treasury disbursement.',
    requested_amount: 6500,
    currency: 'SLE',
    priority: 'high',
    status: 'pastor_approved',
    created_at: new Date(Date.now() - 86400000 * 1).toISOString(),
    needed_by_date: '2026-11-18',
    pastor_approved_by: 'Rev. Sarah Johnson (Senior Pastor)',
    pastor_approved_at: new Date(Date.now() - 3600000 * 2).toISOString(),
    pastor_approval_notes: 'Approved in full. Passed to Finance Officer for final disbursement.',
    disbursement_method: 'mobile_money',
    disbursement_account_info: 'Afrimoney Number: 077 123 456 (Hannah Adams - Music Dept)',
    items: [
      { id: 'item-16', item_name: 'Custom Tailored Easter Choir Robes', quantity: 20, unit_price: 250, total_price: 5000 },
      { id: 'item-17', item_name: 'Printed Gospel Musical Arrangement Sheets', quantity: 50, unit_price: 30, total_price: 1500 }
    ]
  },
  {
    id: 'req-1',
    requisition_number: 'REQ-2026-001',
    department_name: 'Media & IT Ministry',
    applicant_name: 'David Koroma',
    applicant_role: 'Media Team Leader',
    title: 'Purchase 2x High-Performance Video Editing Laptops & 4K Cinema Camera System',
    description: 'Critical hardware requisition for multi-camera live broadcast setup across YouTube/Facebook and fast post-production video editing for Sunday services and revival meetings.',
    requested_amount: 35000,
    currency: 'SLE',
    priority: 'urgent',
    status: 'pending_approval',
    created_at: new Date(Date.now() - 86400000 * 2).toISOString(),
    needed_by_date: '2026-11-15',
    vendor_quote_url: 'Proforma Quote #TECH-SL-9912 (Freetown IT Store)',
    disbursement_method: 'bank_transfer',
    disbursement_account_info: 'Sierra Leone Commercial Bank - Acc: 0030019921 (Vendor: TechZone Freetown)',
    items: [
      { id: 'item-1', item_name: 'Apple MacBook Pro M3 Max 32GB RAM (Video Editing Workstation)', quantity: 2, unit_price: 12500, total_price: 25000 },
      { id: 'item-2', item_name: 'Sony FX3 4K Cinema Camera Unit + XLR Audio Subsystem', quantity: 1, unit_price: 8000, total_price: 8000 },
      { id: 'item-3', item_name: 'Heavy-Duty Fluid Head Tripod & High-Speed SDI Cabling', quantity: 2, unit_price: 1000, total_price: 2000 }
    ]
  },
  {
    id: 'req-3',
    requisition_number: 'REQ-2026-003',
    department_name: 'Youth & Young Adult Ministry',
    applicant_name: 'Samuel Bangura',
    applicant_role: 'Youth Pastor',
    title: 'Annual Youth Empowerment Retreat & Camp Sound Equipment Rental',
    description: 'Requisition for venue booking, camping materials, audio system rental, and catering for 120 youth attendees at the annual wilderness retreat.',
    requested_amount: 18000,
    currency: 'SLE',
    priority: 'high',
    status: 'submitted_to_board',
    created_at: new Date(Date.now() - 86400000 * 4).toISOString(),
    needed_by_date: '2026-11-20',
    finance_officer_review_notes: 'Reviewed by Treasury. Budget exceeds SLE 15,000 threshold. Escalating to Senior Pastor & Executive Board for authorization.',
    reviewed_at: new Date(Date.now() - 86400000 * 3).toISOString(),
    reviewed_by: 'Sahr Sesay (Finance Officer)',
    vendor_quote_url: 'Youth_Retreat_Venue_Proforma_Receipt.pdf',
    disbursement_method: 'bank_transfer',
    disbursement_account_info: 'Rokel Commercial Bank - Acc: 102998341 (Youth Dept)',
    items: [
      { id: 'item-6', item_name: 'Retreat Center Grounds & Hall Booking (3 Days)', quantity: 1, unit_price: 10000, total_price: 10000 },
      { id: 'item-7', item_name: 'Outdoor PA Speaker System & Generator Rental', quantity: 1, unit_price: 5000, total_price: 5000 },
      { id: 'item-8', item_name: 'Youth Camp Materials & T-Shirts (120 units)', quantity: 120, unit_price: 25, total_price: 3000 }
    ]
  },
  {
    id: 'req-2',
    requisition_number: 'REQ-2026-002',
    department_name: 'Worship & Music Ministry',
    applicant_name: 'Hannah Adams',
    applicant_role: 'Choir Director',
    title: 'Digital Wireless Vocal Microphones & In-Ear Monitor Receivers',
    description: 'Replacement of faulty analog vocal mics to eliminate signal interference during choir worship services.',
    requested_amount: 12000,
    currency: 'SLE',
    priority: 'high',
    status: 'approved',
    created_at: new Date(Date.now() - 86400000 * 5).toISOString(),
    needed_by_date: '2026-11-10',
    finance_officer_review_notes: 'Verified priority. Recommended for disbursement.',
    board_approved_by: 'Rev. Sarah Johnson (Senior Pastor)',
    board_approved_at: new Date(Date.now() - 86400000 * 2).toISOString(),
    board_notes: 'Approved in full. Music ministry is in Exemplary Standing (100% past receipts submitted).',
    disbursement_method: 'mobile_money',
    disbursement_account_info: 'Afrimoney Number: 077 123 456 (Hannah Adams - Music Dept)',
    items: [
      { id: 'item-4', item_name: 'Shure SLXD4D Dual Wireless Microphone Receiver Set', quantity: 1, unit_price: 7500, total_price: 7500 },
      { id: 'item-5', item_name: 'Sennheiser Wireless In-Ear Monitor Bodypack Receivers', quantity: 3, unit_price: 1500, total_price: 4500 }
    ]
  },
  {
    id: 'req-4',
    requisition_number: 'REQ-2026-004',
    department_name: 'Evangelism & Outreach Ministry',
    applicant_name: 'Deacon Paul Kamara',
    applicant_role: 'Outreach Coordinator',
    title: 'Community Health Fair & Medical Outreach Supplies',
    description: 'Funds for purchasing over-the-counter medical kits, health screening supplies, and food hampers for 200 underprivileged families.',
    requested_amount: 15000,
    currency: 'SLE',
    priority: 'urgent',
    status: 'disbursed',
    created_at: new Date(Date.now() - 86400000 * 7).toISOString(),
    needed_by_date: '2026-11-05',
    board_approved_by: 'Rev. Sarah Johnson (Senior Pastor)',
    board_approved_at: new Date(Date.now() - 86400000 * 6).toISOString(),
    transaction_ref: 'WIRE-SLCB-882910',
    disbursed_at: new Date(Date.now() - 86400000 * 4).toISOString(),
    disbursed_by: 'Sahr Sesay (Finance Officer)',
    disbursement_method: 'bank_transfer',
    disbursement_account_info: 'SLCB Acc: 004008123 (Outreach Fund)',
    items: [
      { id: 'item-9', item_name: 'Health Screening Kits & BP Monitors', quantity: 10, unit_price: 500, total_price: 5000 },
      { id: 'item-10', item_name: 'Relief Food Packages (Rice, Oil, Sugar)', quantity: 200, unit_price: 50, total_price: 10000 }
    ]
  },
  {
    id: 'req-5',
    requisition_number: 'REQ-2026-005',
    department_name: 'Children & Teens Ministry',
    applicant_name: 'Mary Turay',
    applicant_role: 'Children Ministry Lead',
    title: 'Sunday School Curriculum Workbooks & Crafts Materials',
    description: 'Purchase of quarterly Sunday school learning materials, craft supplies, and snacks for children class.',
    requested_amount: 5000,
    currency: 'SLE',
    priority: 'medium',
    status: 'reconciled',
    created_at: new Date(Date.now() - 86400000 * 12).toISOString(),
    transaction_ref: 'AFRI-MM-99212',
    disbursed_at: new Date(Date.now() - 86400000 * 10).toISOString(),
    disbursed_by: 'Sahr Sesay (Finance Officer)',
    actual_amount_spent: 4750,
    unspent_balance_returned: 250,
    receipt_proof_url: 'Freetown_Bookshop_Receipt_Children_Dept_Signed.pdf',
    receipt_notes: 'Spent SLE 4,750 at Freetown Bookshop for 150 workbooks & craft packs. Returned unspent balance of SLE 250 back to Church Mobile Money account.',
    reconciled_at: new Date(Date.now() - 86400000 * 2).toISOString(),
    reconciled_by: 'Mary Turay',
    items: [
      { id: 'item-11', item_name: 'Quarterly Children Bible Workbooks', quantity: 150, unit_price: 25, total_price: 3750 },
      { id: 'item-12', item_name: 'Coloring Sets & Craft Materials', quantity: 50, unit_price: 25, total_price: 1250 }
    ]
  },
  {
    id: 'req-6',
    requisition_number: 'REQ-2026-006',
    department_name: 'Hospitality & Catering',
    applicant_name: 'Elizabeth Conteh',
    applicant_role: 'Hospitality Coordinator',
    title: 'Sanctuary Refreshments & Guest Speaker Reception',
    description: 'Funding for weekly Sunday service minister tea room & special reception catering for visiting evangelist.',
    requested_amount: 4000,
    currency: 'SLE',
    priority: 'medium',
    status: 'settled',
    created_at: new Date(Date.now() - 86400000 * 15).toISOString(),
    transaction_ref: 'CASH-VOUCH-7712',
    disbursed_at: new Date(Date.now() - 86400000 * 14).toISOString(),
    disbursed_by: 'Sahr Sesay (Finance Officer)',
    actual_amount_spent: 4000,
    unspent_balance_returned: 0,
    receipt_proof_url: 'Supermarket_Tax_Invoice_Hospitality.pdf',
    receipt_notes: 'Purchased tea, coffee, fruit baskets, and catering supplies. All receipts verified.',
    reconciled_at: new Date(Date.now() - 86400000 * 10).toISOString(),
    reconciled_by: 'Elizabeth Conteh',
    audit_status: 'good_standing',
    audit_notes: '100% reconciled on time with valid tax receipts. Requisition settled in Good Standing.',
    settled_at: new Date(Date.now() - 86400000 * 8).toISOString(),
    settled_by: 'Sahr Sesay (Finance Officer)',
    items: [
      { id: 'item-13', item_name: 'Beverages & Catering Provisions', quantity: 1, unit_price: 4000, total_price: 4000 }
    ]
  }
];

export const getRequisitions = (): DepartmentRequisition[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (e) {
    console.error("Error reading requisitions:", e);
  }
  return initialRequisitions;
};

export const saveRequisitions = (reqs: DepartmentRequisition[]): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(reqs));
    window.dispatchEvent(new Event('requisitions_updated'));
  } catch (e) {
    console.error("Error saving requisitions:", e);
  }
};

/**
 * Calculates a department's financial standing and receipt reconciliation compliance rate.
 * This score is displayed on requisition cards to guide Finance Officers and the Board
 * when deciding whether to approve future funding requests.
 */
export const getDepartmentFinancialStanding = (
  deptName: string,
  reqsList?: DepartmentRequisition[]
): DepartmentFinancialStanding => {
  const reqs = reqsList || getRequisitions();
  const deptReqs = reqs.filter(
    r => r.department_name.trim().toLowerCase() === deptName.trim().toLowerCase()
  );

  if (deptReqs.length === 0) {
    return {
      department_name: deptName,
      total_requisitions: 0,
      total_disbursed_amount: 0,
      total_reconciled_amount: 0,
      unspent_returned_amount: 0,
      reconciliation_compliance_rate: 100,
      standing_status: 'New Department',
      badge_color: 'bg-slate-100 text-slate-700 border-slate-200',
      pending_receipts_count: 0
    };
  }

  const disbursedReqs = deptReqs.filter(r => 
    r.status === 'disbursed' || r.status === 'reconciled' || r.status === 'settled'
  );

  const totalDisbursedAmt = disbursedReqs.reduce((sum, r) => sum + (r.requested_amount || 0), 0);
  const totalReconciledAmt = deptReqs
    .filter(r => r.status === 'reconciled' || r.status === 'settled')
    .reduce((sum, r) => sum + (r.actual_amount_spent || r.requested_amount || 0), 0);

  const totalUnspentReturned = deptReqs.reduce((sum, r) => sum + (r.unspent_balance_returned || 0), 0);
  const pendingReceipts = deptReqs.filter(r => r.status === 'disbursed');

  const totalDisbursedCount = disbursedReqs.length;
  const reconciledCount = deptReqs.filter(r => r.status === 'reconciled' || r.status === 'settled').length;

  const complianceRate = totalDisbursedCount > 0 
    ? Math.round((reconciledCount / totalDisbursedCount) * 100) 
    : 100;

  let standing_status: DepartmentFinancialStanding['standing_status'] = 'Exemplary Standing (100%)';
  let badge_color = 'bg-emerald-100 text-emerald-800 border-emerald-300';

  if (pendingReceipts.length > 0 && complianceRate < 80) {
    standing_status = 'Reconciliation Action Needed';
    badge_color = 'bg-amber-100 text-amber-900 border-amber-300';
  } else if (complianceRate >= 80 && complianceRate < 100) {
    standing_status = 'Good Standing (80%+)';
    badge_color = 'bg-indigo-100 text-indigo-900 border-indigo-300';
  } else if (complianceRate < 50) {
    standing_status = 'Reconciliation Action Needed';
    badge_color = 'bg-rose-100 text-rose-900 border-rose-300';
  }

  return {
    department_name: deptName,
    total_requisitions: deptReqs.length,
    total_disbursed_amount: totalDisbursedAmt,
    total_reconciled_amount: totalReconciledAmt,
    unspent_returned_amount: totalUnspentReturned,
    reconciliation_compliance_rate: complianceRate,
    standing_status,
    badge_color,
    pending_receipts_count: pendingReceipts.length
  };
};

export const getAllDepartmentFinancialStandings = (
  reqsList?: DepartmentRequisition[]
): DepartmentFinancialStanding[] => {
  const reqs = reqsList || getRequisitions();
  const deptsSet = new Set<string>();
  reqs.forEach(r => deptsSet.add(r.department_name));
  return Array.from(deptsSet).map(dept => getDepartmentFinancialStanding(dept, reqs));
};

