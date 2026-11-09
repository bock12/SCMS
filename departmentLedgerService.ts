import { DepartmentLedgerRecord } from './types';

const getStorageKey = (deptName: string) => `faithconnect_dept_ledger_${deptName.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;

const getInitialSeedRecords = (deptName: string): DepartmentLedgerRecord[] => [
  {
    id: `drec-1-${Date.now()}`,
    department_name: deptName,
    type: 'income',
    category: 'Department Offering & Dues',
    description: 'Weekly Department Fellowship Offering & Member Contributions',
    amount: 2500,
    currency: 'SLE',
    date: new Date(Date.now() - 86400000 * 3).toISOString(),
    recorded_by: 'Department Secretary',
    payment_method: 'cash',
    notes: 'Collected during weekly Tuesday department rehearsal & prayer meeting.'
  },
  {
    id: `drec-2-${Date.now()}`,
    department_name: deptName,
    type: 'expense',
    category: 'Refreshments & Hospitality',
    description: 'Sunday Choir & Media Technical Team Post-Service Refreshments',
    amount: 850,
    currency: 'SLE',
    date: new Date(Date.now() - 86400000 * 2).toISOString(),
    recorded_by: 'Ministry Lead',
    payment_method: 'mobile_money',
    vendor_name: 'Freetown Supermarket & Bakery',
    receipt_image_url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400" viewBox="0 0 300 400" fill="none"><rect width="300" height="400" rx="12" fill="%23ffffff" stroke="%23cbd5e1" stroke-width="4"/><rect x="20" y="20" width="260" height="50" rx="8" fill="%230f172a"/><text x="150" y="48" fill="%23ffffff" font-family="sans-serif" font-size="14" font-weight="bold" text-anchor="middle">OFFICIAL TAX RECEIPT</text><text x="30" y="100" fill="%23334155" font-family="sans-serif" font-size="12" font-weight="bold">VENDOR: Freetown Supermarket</text><text x="30" y="120" fill="%2364748b" font-family="sans-serif" font-size="11">DATE: 2026-11-05 • TAX ID: SL-99128</text><line x1="30" y1="135" x2="270" y2="135" stroke="%23cbd5e1" stroke-dasharray="4 4"/><text x="30" y="160" fill="%230f172a" font-family="sans-serif" font-size="12">1. Bottled Water & Juice Packs (x20)</text><text x="270" y="160" fill="%230f172a" font-family="sans-serif" font-size="12" text-anchor="end">450 SLE</text><text x="30" y="185" fill="%230f172a" font-family="sans-serif" font-size="12">2. Fresh Pastries & Sandwiches</text><text x="270" y="185" fill="%230f172a" font-family="sans-serif" font-size="12" text-anchor="end">400 SLE</text><line x1="30" y1="210" x2="270" y2="210" stroke="%230f172a" stroke-width="2"/><text x="30" y="240" fill="%230f172a" font-family="sans-serif" font-size="14" font-weight="bold">TOTAL PAID:</text><text x="270" y="240" fill="%23059669" font-family="sans-serif" font-size="16" font-weight="bold" text-anchor="end">850 SLE</text><rect x="30" y="270" width="240" height="70" rx="8" fill="%23f1f5f9" stroke="%2394a3b8"/><text x="150" y="300" fill="%23475569" font-family="sans-serif" font-size="10" text-anchor="middle">VERIFIED DOCUMENT SCANNER STAMP</text><text x="150" y="320" fill="%234338ca" font-family="sans-serif" font-size="11" font-weight="bold" text-anchor="middle">STATUS: AUDITED & PAID IN FULL</text></svg>',
    notes: 'Purchased refreshments for 25 volunteers during extended live broadcast.'
  },
  {
    id: `drec-3-${Date.now()}`,
    department_name: deptName,
    type: 'income',
    category: 'Event Ticket Registrations',
    description: 'Special Department Workshop & Retreat Participant Registration Fees',
    amount: 1800,
    currency: 'SLE',
    date: new Date(Date.now() - 86400000 * 5).toISOString(),
    recorded_by: 'Finance Delegate',
    payment_method: 'mobile_money',
    notes: 'Registration fees collected for upcoming leadership workshop.'
  },
  {
    id: `drec-4-${Date.now()}`,
    department_name: 'Media & IT Ministry',
    type: 'expense',
    category: 'Equipment Maintenance & Supplies',
    description: 'High-Speed SDI Video Cables & HDMI Splitters for Sanctuary Switcher',
    amount: 1200,
    currency: 'SLE',
    date: new Date(Date.now() - 86400000 * 8).toISOString(),
    recorded_by: 'David Koroma',
    vendor_name: 'Freetown IT Store',
    receipt_image_url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400" viewBox="0 0 300 400" fill="none"><rect width="300" height="400" rx="12" fill="%23ffffff" stroke="%23cbd5e1" stroke-width="4"/><rect x="20" y="20" width="260" height="50" rx="8" fill="%234338ca"/><text x="150" y="48" fill="%23ffffff" font-family="sans-serif" font-size="14" font-weight="bold" text-anchor="middle">TECHSTORE INVOICE RECEIPT</text><text x="30" y="100" fill="%23334155" font-family="sans-serif" font-size="12" font-weight="bold">VENDOR: TechZone Freetown</text><text x="30" y="120" fill="%2364748b" font-family="sans-serif" font-size="11">DATE: 2026-11-01 • REF: TECH-991</text><line x1="30" y1="135" x2="270" y2="135" stroke="%23cbd5e1" stroke-dasharray="4 4"/><text x="30" y="160" fill="%230f172a" font-family="sans-serif" font-size="12">1. 4K High-Speed SDI Cable (x4)</text><text x="270" y="160" fill="%230f172a" font-family="sans-serif" font-size="12" text-anchor="end">800 SLE</text><text x="30" y="185" fill="%230f172a" font-family="sans-serif" font-size="12">2. Dual 4K HDMI Switcher Unit</text><text x="270" y="185" fill="%230f172a" font-family="sans-serif" font-size="12" text-anchor="end">400 SLE</text><line x1="30" y1="210" x2="270" y2="210" stroke="%230f172a" stroke-width="2"/><text x="30" y="240" fill="%230f172a" font-family="sans-serif" font-size="14" font-weight="bold">TOTAL PAID:</text><text x="270" y="240" fill="%234338ca" font-family="sans-serif" font-size="16" font-weight="bold" text-anchor="end">1,200 SLE</text></svg>',
    payment_method: 'bank_transfer'
  }
];

export const getDepartmentLedgerRecords = (deptName: string): DepartmentLedgerRecord[] => {
  try {
    const key = getStorageKey(deptName);
    const raw = localStorage.getItem(key);
    if (raw) {
      return JSON.parse(raw);
    }
    const seed = getInitialSeedRecords(deptName);
    localStorage.setItem(key, JSON.stringify(seed));
    return seed;
  } catch (e) {
    console.error('Error reading department ledger records:', e);
    return getInitialSeedRecords(deptName);
  }
};

export const saveDepartmentLedgerRecord = (record: DepartmentLedgerRecord): void => {
  try {
    const key = getStorageKey(record.department_name);
    const existing = getDepartmentLedgerRecords(record.department_name);
    const updated = [record, ...existing];
    localStorage.setItem(key, JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent('dept_ledger_updated', { detail: { department: record.department_name } }));
  } catch (e) {
    console.error('Error saving department ledger record:', e);
  }
};

export const deleteDepartmentLedgerRecord = (recordId: string, deptName: string): void => {
  try {
    const key = getStorageKey(deptName);
    const existing = getDepartmentLedgerRecords(deptName);
    const updated = existing.filter(r => r.id !== recordId);
    localStorage.setItem(key, JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent('dept_ledger_updated', { detail: { department: deptName } }));
  } catch (e) {
    console.error('Error deleting department ledger record:', e);
  }
};

export const getDepartmentLedgerSummary = (deptName: string) => {
  const records = getDepartmentLedgerRecords(deptName);
  const totalIncome = records
    .filter(r => r.type === 'income')
    .reduce((sum, r) => sum + (Number(r.amount) || 0), 0);

  const totalExpenses = records
    .filter(r => r.type === 'expense')
    .reduce((sum, r) => sum + (Number(r.amount) || 0), 0);

  const netBalance = totalIncome - totalExpenses;

  return {
    totalIncome,
    totalExpenses,
    netBalance,
    recordsCount: records.length,
    records
  };
};
