import { DepartmentRequisition } from './types';

const STORAGE_KEY = 'faithconnect_department_requisitions_v2';

export const initialRequisitions: DepartmentRequisition[] = [
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
    disbursement_method: 'mobile_money',
    disbursement_account_info: 'Afrimoney Number: 077 123 456 (Hannah Adams - Music Dept)',
    items: [
      { id: 'item-4', item_name: 'Shure SLXD4D Dual Wireless Microphone Receiver Set', quantity: 1, unit_price: 7500, total_price: 7500 },
      { id: 'item-5', item_name: 'Sennheiser Wireless In-Ear Monitor Bodypack Receivers', quantity: 3, unit_price: 1500, total_price: 4500 }
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
