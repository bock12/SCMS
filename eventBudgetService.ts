import { EventBudgetApproval, EventBudgetApprovalStatus, ProformaLineItem } from './types';

const BUDGET_STORAGE_KEY = 'faithconnect_event_budget_approvals_v1';

export const INITIAL_BUDGET_APPROVALS: EventBudgetApproval[] = [
  {
    event_id: 'evt-1',
    event_title: 'Annual Harvest & Thanksgiving Revival',
    status: 'approved',
    total_budget: 15500,
    total_actual: 14200,
    submitted_by: 'Event Manager',
    submitted_at: new Date(Date.now() - 86400000 * 4).toISOString(),
    approved_by: 'Emmanuel Sesay (Finance Officer)',
    approved_at: new Date(Date.now() - 86400000 * 3).toISOString(),
    invoice_number: 'INV-EVT-2026-108',
    invoice_date: new Date(Date.now() - 86400000 * 4).toISOString().split('T')[0],
    notes: 'Approved after verification of guest minister lodging quote and sound system rental terms.',
    items_breakdown: [
      { id: 'p1', description: 'Wireless Lapel Microphones & Digital Audio Mixer', quantity: 2, unit_price: 3500, total_price: 7000, category: 'Sound & Media' },
      { id: 'p2', description: 'Sanctuary Stage Lighting & Floral Decoration', quantity: 1, unit_price: 4500, total_price: 4500, category: 'Decoration' },
      { id: 'p3', description: 'Guest Revival Minister Honorarium & Accommodation', quantity: 1, unit_price: 4000, total_price: 4000, category: 'Honorarium' }
    ]
  }
];

export const getEventBudgetApprovals = (): EventBudgetApproval[] => {
  try {
    const raw = localStorage.getItem(BUDGET_STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (e) {
    console.error("Error reading event budget approvals:", e);
  }
  return INITIAL_BUDGET_APPROVALS;
};

export const saveEventBudgetApprovals = (approvals: EventBudgetApproval[]): void => {
  try {
    localStorage.setItem(BUDGET_STORAGE_KEY, JSON.stringify(approvals));
    window.dispatchEvent(new Event('event_budgets_updated'));
  } catch (e) {
    console.error("Error saving event budget approvals:", e);
  }
};

export const getEventBudgetApproval = (eventId: string): EventBudgetApproval | null => {
  const all = getEventBudgetApprovals();
  return all.find(b => b.event_id === eventId) || null;
};

export const submitEventBudgetForApproval = (
  eventId: string, 
  eventTitle: string, 
  totalBudget: number, 
  submittedBy: string = 'Event Manager',
  itemsBreakdown?: ProformaLineItem[],
  notes?: string,
  invoiceNoCustom?: string
): EventBudgetApproval => {
  const all = getEventBudgetApprovals();
  const existingIndex = all.findIndex(b => b.event_id === eventId);
  const invoiceNo = invoiceNoCustom || `INV-EVT-2026-${Math.floor(100 + Math.random() * 900)}`;

  const approvalItem: EventBudgetApproval = {
    event_id: eventId,
    event_title: eventTitle,
    status: 'pending_approval',
    total_budget: totalBudget,
    submitted_by: submittedBy,
    submitted_at: new Date().toISOString(),
    invoice_number: invoiceNo,
    invoice_date: new Date().toISOString().split('T')[0],
    items_breakdown: itemsBreakdown || [],
    notes
  };

  if (existingIndex >= 0) {
    all[existingIndex] = approvalItem;
  } else {
    all.unshift(approvalItem);
  }

  saveEventBudgetApprovals(all);
  return approvalItem;
};

export const approveEventBudget = (eventId: string, approvedBy: string = 'Finance Officer', notes?: string): void => {
  const all = getEventBudgetApprovals();
  const item = all.find(b => b.event_id === eventId);
  if (item) {
    item.status = 'approved';
    item.approved_by = approvedBy;
    item.approved_at = new Date().toISOString();
    if (notes) item.notes = notes;
    saveEventBudgetApprovals(all);
  }
};

export const rejectEventBudget = (eventId: string, rejectedBy: string = 'Finance Officer', reason?: string): void => {
  const all = getEventBudgetApprovals();
  const item = all.find(b => b.event_id === eventId);
  if (item) {
    item.status = 'rejected';
    item.approved_by = rejectedBy;
    item.approved_at = new Date().toISOString();
    item.rejection_reason = reason || 'Budget requires revision by event manager.';
    saveEventBudgetApprovals(all);
  }
};

export const disburseEventBudget = (
  eventId: string, 
  disbursedBy: string = 'Finance Officer', 
  txnRef?: string, 
  channel?: string, 
  notes?: string
): void => {
  const all = getEventBudgetApprovals();
  const item = all.find(b => b.event_id === eventId);
  if (item) {
    item.status = 'disbursed';
    item.disbursed_by = disbursedBy;
    item.disbursed_at = new Date().toISOString();
    if (!item.approved_by) item.approved_by = disbursedBy;
    if (!item.approved_at) item.approved_at = new Date().toISOString();
    if (txnRef) item.transaction_ref = txnRef;
    if (channel) item.disbursement_channel = channel;
    if (notes) item.notes = notes;
    saveEventBudgetApprovals(all);
  }
};
