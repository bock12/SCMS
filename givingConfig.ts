import { GivingConfig } from './types';

export const DEFAULT_GIVING_CONFIG: GivingConfig = {
  currency_code: 'SLE',
  currency_symbol: 'SLE',
  card_payments_enabled: true,
  allow_custom_funds: true,
  funds: [
    { id: 'f1', name: 'Tithe', description: '10% Covenant Tithe of Increase & Income', is_active: true, is_default: true },
    { id: 'f2', name: 'Sunday Offering', description: 'General Worship & Praise Offering', is_active: true, is_default: true },
    { id: 'f3', name: 'Building & Sanctuary Expansion', description: 'Sanctuary Renovation & Property Acquisition', is_active: true },
    { id: 'f4', name: 'Global Missions & Evangelism', description: 'Outreach, Church Planting & Welfare', is_active: true },
    { id: 'f5', name: 'Special Thanksgiving & Seed', description: 'Prophetic Seed & Testimony Thanksgiving', is_active: true },
    { id: 'f6', name: 'Youth & Children Ministry', description: 'Next Generation Discipleship & Camps', is_active: true }
  ],
  mobile_gateways: [
    {
      id: 'mm-afrimoney',
      provider: 'Afrimoney',
      merchant_number: '077 123 456 (Code: 8812)',
      merchant_name: 'Grace Cathedral Ministry',
      dial_code_instructions: 'Dial *161# on Africell -> Select "Pay Merchant" -> Enter Merchant Code 8812 -> Enter Amount (SLE) -> Enter PIN to Confirm.',
      is_active: true,
      color: 'amber'
    },
    {
      id: 'mm-orange',
      provider: 'Orange Money',
      merchant_number: '078 987 654 (Code: 5543)',
      merchant_name: 'Grace Cathedral Tithes & Giving',
      dial_code_instructions: 'Dial *144# on Orange -> Select "Pay Merchant" -> Enter Merchant Code 5543 -> Enter Amount (SLE) -> Enter PIN to Confirm.',
      is_active: true,
      color: 'orange'
    }
  ],
  bank_details: {
    bank_name: 'Sierra Leone Commercial Bank (SLCB)',
    account_name: 'Grace Cathedral Church Ministries',
    account_number: '0030010023456789',
    swift_code: 'SLCBSLFR',
    branch_code: 'Freetown Main Branch',
    instructions: 'Please put your Full Name and Giving Category (e.g. "Sahr Sesay - Tithe") as the transaction reference.'
  }
};

const STORAGE_KEY = 'faithconnect_church_giving_config';

export const getGivingConfig = (): GivingConfig => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return {
        ...DEFAULT_GIVING_CONFIG,
        ...parsed,
        funds: parsed.funds || DEFAULT_GIVING_CONFIG.funds,
        mobile_gateways: (parsed.mobile_gateways || DEFAULT_GIVING_CONFIG.mobile_gateways).map((g: any, idx: number) => ({
          ...g,
          id: g.id || `mm-${idx + 1}`
        })),
        bank_details: { ...DEFAULT_GIVING_CONFIG.bank_details, ...(parsed.bank_details || {}) }
      };
    }
  } catch (e) {
    console.error("Failed to load giving config from storage", e);
  }
  return DEFAULT_GIVING_CONFIG;
};

export const saveGivingConfig = (config: GivingConfig): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch (e) {
    console.error("Failed to save giving config to storage", e);
  }
};
