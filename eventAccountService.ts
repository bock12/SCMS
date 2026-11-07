import { EventAccount, EventFundingTransaction, EventRecurrence, ChurchEvent } from './types';
import { supabase } from './supabaseClient';

const EVENT_ACCOUNTS_STORAGE_KEY = 'faithconnect_event_accounts_v1';

export const INITIAL_EVENT_ACCOUNTS: Record<string, EventAccount> = {
  'evt-1': {
    event_id: 'evt-1',
    event_title: 'Sunday Glorious Worship & Divine Anointing Service',
    account_number: 'EVT-ACC-2026-001',
    account_name: 'FaithConnect - Sunday Worship & Communion Fund',
    bank_name: 'Sierra Leone Commercial Bank (SLCB)',
    bank_account_number: '003-010-994821',
    mobile_money_merchant: 'Afrimoney: 076 892 101 / Orange: #144*4*8891#',
    donor_reference_code: 'EVT-SUN-001',
    currency: 'SLE',
    current_balance: 18500,
    target_budget: 25000,
    total_funded: 28500,
    total_disbursed: 10000,
    status: 'active',
    created_at: new Date(Date.now() - 86400000 * 30).toISOString(),
    transactions: [
      {
        id: 'txn-101',
        event_id: 'evt-1',
        type: 'treasury_allocation',
        amount: 15000,
        currency: 'SLE',
        contributor_or_payee: 'Grace Cathedral Treasury Controller',
        source_or_channel: 'church_treasury',
        transaction_ref: 'TREAS-ALLOC-8891',
        date: new Date(Date.now() - 86400000 * 14).toISOString(),
        notes: 'Monthly Sunday operational worship & media allocation',
        recorded_by: 'Finance Officer'
      },
      {
        id: 'txn-102',
        event_id: 'evt-1',
        type: 'donation',
        amount: 8500,
        currency: 'SLE',
        contributor_or_payee: 'Deacon Sahr Sesay',
        source_or_channel: 'bank_wire',
        transaction_ref: 'SLCB-WIRE-7712',
        date: new Date(Date.now() - 86400000 * 7).toISOString(),
        notes: 'Sponsorship donation for Sunday communion trays & sanctuary flowers',
        recorded_by: 'Finance Officer'
      },
      {
        id: 'txn-103',
        event_id: 'evt-1',
        type: 'deposit',
        amount: 5000,
        currency: 'SLE',
        contributor_or_payee: 'Voices of Grace Support Guild',
        source_or_channel: 'mobile_money',
        transaction_ref: 'AFRI-MM-9921',
        date: new Date(Date.now() - 86400000 * 3).toISOString(),
        notes: 'Choir special anniversary seed for audio production',
        recorded_by: 'Event Manager'
      },
      {
        id: 'txn-104',
        event_id: 'evt-1',
        type: 'disbursement',
        amount: 10000,
        currency: 'SLE',
        contributor_or_payee: 'SoundTech Solutions SL',
        source_or_channel: 'bank_wire',
        transaction_ref: 'DISB-AUDIO-4412',
        date: new Date(Date.now() - 86400000 * 2).toISOString(),
        notes: 'Payment for 2x Shure wireless lapel microphones and audio engineer support',
        recorded_by: 'Finance Officer'
      }
    ]
  },
  'evt-2': {
    event_id: 'evt-2',
    event_title: 'Annual Believers Prophetic Conference 2026',
    account_number: 'EVT-ACC-2026-002',
    account_name: 'FaithConnect - Annual Believers Conference Operational Fund',
    bank_name: 'Sierra Leone Commercial Bank (SLCB)',
    bank_account_number: '003-010-994822',
    mobile_money_merchant: 'Afrimoney: 076 892 102 / Orange: #144*4*8892#',
    donor_reference_code: 'EVT-CONF-002',
    currency: 'SLE',
    current_balance: 34200,
    target_budget: 45000,
    total_funded: 42000,
    total_disbursed: 7800,
    status: 'active',
    created_at: new Date(Date.now() - 86400000 * 20).toISOString(),
    transactions: [
      {
        id: 'txn-201',
        event_id: 'evt-2',
        type: 'treasury_allocation',
        amount: 25000,
        currency: 'SLE',
        contributor_or_payee: 'Grace Cathedral Central Board',
        source_or_channel: 'church_treasury',
        transaction_ref: 'TREAS-CONF-9001',
        date: new Date(Date.now() - 86400000 * 18).toISOString(),
        notes: 'Official executive church grant for conference hosting',
        recorded_by: 'Finance Officer'
      },
      {
        id: 'txn-202',
        event_id: 'evt-2',
        type: 'donation',
        amount: 17000,
        currency: 'SLE',
        contributor_or_payee: 'Grace Partners Corporate Network',
        source_or_channel: 'bank_wire',
        transaction_ref: 'WIRE-CORP-3310',
        date: new Date(Date.now() - 86400000 * 9).toISOString(),
        notes: 'Sponsor donation for guest speaker travel & accommodation',
        recorded_by: 'Event Manager'
      },
      {
        id: 'txn-203',
        event_id: 'evt-2',
        type: 'disbursement',
        amount: 7800,
        currency: 'SLE',
        contributor_or_payee: 'City Print Hub Freetown',
        source_or_channel: 'bank_wire',
        transaction_ref: 'DISB-PRINT-1092',
        date: new Date(Date.now() - 86400000 * 4).toISOString(),
        notes: 'Outdoor highway banners, attendee badges, and conference devotionals',
        recorded_by: 'Finance Officer'
      }
    ]
  },
  'evt-3': {
    event_id: 'evt-3',
    event_title: 'Men of Honor Brotherhood Fellowship Breakfast',
    account_number: 'EVT-ACC-2026-003',
    account_name: 'FaithConnect - Men of Honor Fellowship Fund',
    bank_name: 'Rokel Commercial Bank',
    bank_account_number: '012-004-883910',
    mobile_money_merchant: 'Afrimoney: 077 111 222 / Orange: #144*4*7712#',
    donor_reference_code: 'EVT-MEN-003',
    currency: 'SLE',
    current_balance: 4800,
    target_budget: 6000,
    total_funded: 5500,
    total_disbursed: 700,
    status: 'active',
    created_at: new Date(Date.now() - 86400000 * 15).toISOString(),
    transactions: [
      {
        id: 'txn-301',
        event_id: 'evt-3',
        type: 'treasury_allocation',
        amount: 3000,
        currency: 'SLE',
        contributor_or_payee: 'Grace Cathedral Mens Ministry Grant',
        source_or_channel: 'church_treasury',
        transaction_ref: 'TREAS-MEN-01',
        date: new Date(Date.now() - 86400000 * 10).toISOString(),
        notes: 'Quarterly fellowship seed funding',
        recorded_by: 'Finance Officer'
      },
      {
        id: 'txn-302',
        event_id: 'evt-3',
        type: 'donation',
        amount: 2500,
        currency: 'SLE',
        contributor_or_payee: 'Elder Joseph Bio',
        source_or_channel: 'mobile_money',
        transaction_ref: 'AFRI-MEN-55',
        date: new Date(Date.now() - 86400000 * 5).toISOString(),
        notes: 'Sponsorship donation for breakfast catering',
        recorded_by: 'Event Manager'
      },
      {
        id: 'txn-303',
        event_id: 'evt-3',
        type: 'disbursement',
        amount: 700,
        currency: 'SLE',
        contributor_or_payee: 'Grace Kitchen & Catering',
        source_or_channel: 'cash',
        transaction_ref: 'PETTY-CASH-881',
        date: new Date(Date.now() - 86400000 * 2).toISOString(),
        notes: 'Advance deposit for fresh coffee, tea, and breakfast rolls',
        recorded_by: 'Event Manager'
      }
    ]
  },
  'evt-4': {
    event_id: 'evt-4',
    event_title: 'Kingdom Youth Radical Worship Night',
    account_number: 'EVT-ACC-2026-004',
    account_name: 'FaithConnect - Kingdom Youth Revival Fund',
    bank_name: 'Sierra Leone Commercial Bank (SLCB)',
    bank_account_number: '003-010-994824',
    mobile_money_merchant: 'Afrimoney: 076 892 104 / Orange: #144*4*8894#',
    donor_reference_code: 'EVT-YOUTH-004',
    currency: 'SLE',
    current_balance: 8900,
    target_budget: 12000,
    total_funded: 10000,
    total_disbursed: 1100,
    status: 'active',
    created_at: new Date(Date.now() - 86400000 * 10).toISOString(),
    transactions: [
      {
        id: 'txn-401',
        event_id: 'evt-4',
        type: 'treasury_allocation',
        amount: 6000,
        currency: 'SLE',
        contributor_or_payee: 'Grace Cathedral Youth Development Fund',
        source_or_channel: 'church_treasury',
        transaction_ref: 'TREAS-YOUTH-01',
        date: new Date(Date.now() - 86400000 * 8).toISOString(),
        notes: 'Sanctuary acoustic and lighting allocation for youth rally',
        recorded_by: 'Finance Officer'
      },
      {
        id: 'txn-402',
        event_id: 'evt-4',
        type: 'donation',
        amount: 4000,
        currency: 'SLE',
        contributor_or_payee: 'Alumni Youth Donors',
        source_or_channel: 'card',
        transaction_ref: 'CARD-YOUTH-99',
        date: new Date(Date.now() - 86400000 * 4).toISOString(),
        notes: 'Online donor giving for youth pizza and guest worship band',
        recorded_by: 'Event Manager'
      },
      {
        id: 'txn-403',
        event_id: 'evt-4',
        type: 'disbursement',
        amount: 1100,
        currency: 'SLE',
        contributor_or_payee: 'Freetown Pizza Hub',
        source_or_channel: 'mobile_money',
        transaction_ref: 'ORANGE-MM-4421',
        date: new Date(Date.now() - 86400000 * 1).toISOString(),
        notes: 'Advance deposit for 40x large pizzas for post-worship fellowship',
        recorded_by: 'Event Manager'
      }
    ]
  },
  'evt-5': {
    event_id: 'evt-5',
    event_title: 'Community Thanksgiving Food & Clothing Outreach',
    account_number: 'EVT-ACC-2026-005',
    account_name: 'FaithConnect - Community Outreach & Food Bank Fund',
    bank_name: 'Sierra Leone Commercial Bank (SLCB)',
    bank_account_number: '003-010-994825',
    mobile_money_merchant: 'Afrimoney: 076 892 105 / Orange: #144*4*8895#',
    donor_reference_code: 'EVT-OUTREACH-005',
    currency: 'SLE',
    current_balance: 12500,
    target_budget: 15000,
    total_funded: 12500,
    total_disbursed: 0,
    status: 'active',
    created_at: new Date(Date.now() - 86400000 * 5).toISOString(),
    transactions: [
      {
        id: 'txn-501',
        event_id: 'evt-5',
        type: 'treasury_allocation',
        amount: 7500,
        currency: 'SLE',
        contributor_or_payee: 'Cathedral Benevolence Ministry',
        source_or_channel: 'church_treasury',
        transaction_ref: 'TREAS-BENEV-01',
        date: new Date(Date.now() - 86400000 * 4).toISOString(),
        notes: 'Outreach seed for purchasing 50kg rice bags and cooking oil',
        recorded_by: 'Finance Officer'
      },
      {
        id: 'txn-502',
        event_id: 'evt-5',
        type: 'donation',
        amount: 5000,
        currency: 'SLE',
        contributor_or_payee: 'Community Partners Initiative',
        source_or_channel: 'bank_wire',
        transaction_ref: 'SLCB-WIRE-OUT-01',
        date: new Date(Date.now() - 86400000 * 2).toISOString(),
        notes: 'Direct partner contribution for youth winter blankets',
        recorded_by: 'Event Manager'
      }
    ]
  }
};

export const getAllEventAccounts = (): Record<string, EventAccount> => {
  try {
    const raw = localStorage.getItem(EVENT_ACCOUNTS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...INITIAL_EVENT_ACCOUNTS, ...parsed };
    }
  } catch (e) {
    console.error("Error reading event accounts:", e);
  }
  return INITIAL_EVENT_ACCOUNTS;
};

export const saveEventAccount = (account: EventAccount): void => {
  try {
    const all = getAllEventAccounts();
    all[account.event_id] = account;
    localStorage.setItem(EVENT_ACCOUNTS_STORAGE_KEY, JSON.stringify(all));
    window.dispatchEvent(new CustomEvent('event_accounts_updated', { detail: account }));
  } catch (e) {
    console.error("Error saving event account:", e);
  }
};

export const getEventAccount = (
  eventId: string, 
  eventTitle: string = 'Church Event', 
  targetBudget: number = 10000
): EventAccount => {
  const all = getAllEventAccounts();
  if (all[eventId]) {
    return all[eventId];
  }

  // Generate a dedicated event account if one doesn't exist yet
  const numSuffix = Math.floor(100 + Math.random() * 900);
  const codeSuffix = (eventTitle.replace(/[^A-Za-z]/g, '').slice(0, 4) || 'EVT').toUpperCase();

  const newAccount: EventAccount = {
    event_id: eventId,
    event_title: eventTitle,
    account_number: `EVT-ACC-2026-${numSuffix}`,
    account_name: `FaithConnect - ${eventTitle} Dedicated Fund`,
    bank_name: 'Sierra Leone Commercial Bank (SLCB)',
    bank_account_number: `003-010-${Math.floor(100000 + Math.random() * 900000)}`,
    mobile_money_merchant: `Afrimoney: 076 ${numSuffix} 100 / Orange: #144*4*${numSuffix}#`,
    donor_reference_code: `EVT-${codeSuffix}-${numSuffix}`,
    currency: 'SLE',
    current_balance: 0,
    target_budget: targetBudget || 10000,
    total_funded: 0,
    total_disbursed: 0,
    status: 'active',
    created_at: new Date().toISOString(),
    transactions: []
  };

  saveEventAccount(newAccount);
  return newAccount;
};

export const fundEventAccount = (
  eventId: string,
  amount: number,
  contributor: string,
  source: 'church_treasury' | 'bank_wire' | 'mobile_money' | 'cash' | 'card',
  txnRef?: string,
  notes?: string,
  recordedBy: string = 'Event Manager'
): EventFundingTransaction => {
  const account = getEventAccount(eventId);
  const newTxn: EventFundingTransaction = {
    id: `txn_${Date.now()}`,
    event_id: eventId,
    type: source === 'church_treasury' ? 'treasury_allocation' : 'deposit',
    amount: Number(amount) || 0,
    currency: account.currency || 'SLE',
    contributor_or_payee: contributor.trim() || 'Church Treasury Allocation',
    source_or_channel: source,
    transaction_ref: txnRef?.trim() || `DEP-${Date.now().toString().slice(-6)}`,
    date: new Date().toISOString(),
    notes: notes?.trim() || undefined,
    recorded_by: recordedBy
  };

  account.transactions = [newTxn, ...account.transactions];
  account.total_funded = (account.total_funded || 0) + newTxn.amount;
  account.current_balance = (account.current_balance || 0) + newTxn.amount;

  saveEventAccount(account);
  return newTxn;
};

export const disburseFromEventAccount = (
  eventId: string,
  amount: number,
  payee: string,
  channel: 'church_treasury' | 'bank_wire' | 'mobile_money' | 'cash' | 'card',
  txnRef?: string,
  notes?: string,
  recordedBy: string = 'Finance Officer'
): EventFundingTransaction => {
  const account = getEventAccount(eventId);
  const disburseAmount = Number(amount) || 0;

  const newTxn: EventFundingTransaction = {
    id: `txn_disb_${Date.now()}`,
    event_id: eventId,
    type: 'disbursement',
    amount: disburseAmount,
    currency: account.currency || 'SLE',
    contributor_or_payee: payee.trim() || 'Event Vendor / Service Provider',
    source_or_channel: channel,
    transaction_ref: txnRef?.trim() || `DISB-${Date.now().toString().slice(-6)}`,
    date: new Date().toISOString(),
    notes: notes?.trim() || undefined,
    recorded_by: recordedBy
  };

  account.transactions = [newTxn, ...account.transactions];
  account.total_disbursed = (account.total_disbursed || 0) + disburseAmount;
  account.current_balance = Math.max(0, (account.current_balance || 0) - disburseAmount);

  saveEventAccount(account);
  return newTxn;
};

export const getRecurrenceBadge = (recurrence?: EventRecurrence): { label: string; badgeColor: string; icon: string } => {
  switch (recurrence) {
    case 'weekly':
      return { label: 'Weekly Program', badgeColor: 'bg-purple-100 text-purple-900 border-purple-200', icon: '📅' };
    case 'monthly':
      return { label: 'Monthly Program', badgeColor: 'bg-indigo-100 text-indigo-900 border-indigo-200', icon: '🔄' };
    case 'nth_weekday_monthly':
      return { label: 'Nth Weekday Monthly', badgeColor: 'bg-purple-100 text-purple-900 border-purple-200', icon: '📆' };
    case 'quarterly':
      return { label: 'Quarterly Program', badgeColor: 'bg-amber-100 text-amber-900 border-amber-200', icon: '🏛️' };
    case 'yearly':
      return { label: 'Annual / Yearly Program', badgeColor: 'bg-emerald-100 text-emerald-900 border-emerald-200', icon: '🌟' };
    case 'one_time':
    default:
      return { label: 'One-Time Event', badgeColor: 'bg-slate-100 text-slate-800 border-slate-200', icon: '⚡' };
  }
};

export const getNthWeekdayDate = (
  year: number,
  month: number, // 0 = Jan, 1 = Feb ... 11 = Dec
  nth: number, // 1 = 1st, 2 = 2nd, 3 = 3rd, 4 = 4th, -1 = last
  weekday: number, // 0 = Sunday, 1 = Monday, ... 6 = Saturday
  hours: number = 10,
  minutes: number = 0
): Date => {
  if (nth === -1) {
    // Last weekday of month
    const lastDayNumber = new Date(year, month + 1, 0).getDate();
    let d = new Date(year, month, lastDayNumber, hours, minutes);
    while (d.getDay() !== weekday) {
      d.setDate(d.getDate() - 1);
    }
    return d;
  } else {
    // Nth weekday of month (1st, 2nd, 3rd, 4th)
    let count = 0;
    let d = new Date(year, month, 1, hours, minutes);
    while (d.getMonth() === month) {
      if (d.getDay() === weekday) {
        count++;
        if (count === nth) {
          return d;
        }
      }
      d.setDate(d.getDate() + 1);
    }
    return new Date(year, month, 1, hours, minutes);
  }
};

export const parseRecurrenceRules = (
  patternStr?: string,
  eventObj?: Partial<ChurchEvent>
): { nth: number; weekday: number; excludedMonths: number[] } => {
  let nth = eventObj?.recurrence_nth ?? 2;
  let weekday = eventObj?.recurrence_weekday ?? 0; // Default Sunday
  let excludedMonths = eventObj?.excluded_months ? [...eventObj.excluded_months] : [];

  if (patternStr) {
    const lower = patternStr.toLowerCase();

    // Parse nth
    if (lower.includes('1st') || lower.includes('first')) nth = 1;
    else if (lower.includes('2nd') || lower.includes('second')) nth = 2;
    else if (lower.includes('3rd') || lower.includes('third')) nth = 3;
    else if (lower.includes('4th') || lower.includes('fourth')) nth = 4;
    else if (lower.includes('last')) nth = -1;

    // Parse weekday
    if (lower.includes('sunday') || lower.includes('sun')) weekday = 0;
    else if (lower.includes('monday') || lower.includes('mon')) weekday = 1;
    else if (lower.includes('tuesday') || lower.includes('tue')) weekday = 2;
    else if (lower.includes('wednesday') || lower.includes('wed')) weekday = 3;
    else if (lower.includes('thursday') || lower.includes('thu')) weekday = 4;
    else if (lower.includes('friday') || lower.includes('fri')) weekday = 5;
    else if (lower.includes('saturday') || lower.includes('sat')) weekday = 6;

    // Parse excluded months if pattern mentions "except january" / "skip jan", etc.
    const monthNames = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
    const monthShorts = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

    monthNames.forEach((mName, mIdx) => {
      if ((lower.includes(`except ${mName}`) || lower.includes(`skip ${mName}`) || lower.includes(`no ${mName}`) || lower.includes(`excluding ${mName}`) || lower.includes(`except ${monthShorts[mIdx]}`)) && !excludedMonths.includes(mIdx)) {
        excludedMonths.push(mIdx);
      }
    });
  }

  return { nth, weekday, excludedMonths };
};

export const calculateNextRecurrenceDate = (
  startTimeISO: string,
  endTimeISO: string,
  recurrence?: EventRecurrence,
  eventObj?: Partial<ChurchEvent>
): { nextStartISO: string; nextEndISO: string; formattedNextStart: string; patternNote: string } => {
  if (!recurrence || recurrence === 'one_time') {
    const sDate = new Date(startTimeISO);
    return {
      nextStartISO: startTimeISO,
      nextEndISO: endTimeISO,
      formattedNextStart: isNaN(sDate.getTime()) ? startTimeISO : sDate.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }),
      patternNote: 'One-time event'
    };
  }

  const startDate = new Date(startTimeISO);
  const endDate = new Date(endTimeISO);
  const now = new Date();

  // Duration in milliseconds
  const durationMs = Math.max(0, endDate.getTime() - startDate.getTime());
  const hours = isNaN(startDate.getTime()) ? 10 : startDate.getHours();
  const minutes = isNaN(startDate.getTime()) ? 0 : startDate.getMinutes();

  let nextStart = new Date(isNaN(startDate.getTime()) ? Date.now() : startDate.getTime());

  // Determine recurrence rules
  const { nth, weekday, excludedMonths } = parseRecurrenceRules(eventObj?.recurrence_pattern, eventObj);

  // Check if this is an Nth weekday rule or if pattern contains weekday names
  const patternLower = (eventObj?.recurrence_pattern || '').toLowerCase();
  const isNthWeekdayRule = recurrence === 'nth_weekday_monthly' || (eventObj?.recurrence_nth !== undefined) || 
    patternLower.includes('sunday') || patternLower.includes('monday') || patternLower.includes('tuesday') || 
    patternLower.includes('wednesday') || patternLower.includes('thursday') || patternLower.includes('friday') || patternLower.includes('saturday');

  if (isNthWeekdayRule) {
    let year = nextStart.getFullYear();
    let month = nextStart.getMonth();

    // Advance to next month candidate
    month++;
    if (month > 11) {
      month = 0;
      year++;
    }

    // Skip any excluded months (e.g. January = 0)
    while (excludedMonths.includes(month)) {
      month++;
      if (month > 11) {
        month = 0;
        year++;
      }
    }

    nextStart = getNthWeekdayDate(year, month, nth, weekday, hours, minutes);

    // If candidate nextStart is still in the past, advance to subsequent non-excluded months
    while (nextStart.getTime() <= now.getTime()) {
      month++;
      if (month > 11) {
        month = 0;
        year++;
      }
      while (excludedMonths.includes(month)) {
        month++;
        if (month > 11) {
          month = 0;
          year++;
        }
      }
      nextStart = getNthWeekdayDate(year, month, nth, weekday, hours, minutes);
    }
  } else {
    // Standard weekly / monthly / quarterly / yearly advance
    const advanceDate = (d: Date, rec: EventRecurrence) => {
      switch (rec) {
        case 'weekly':
          d.setDate(d.getDate() + 7);
          break;
        case 'monthly':
          d.setMonth(d.getMonth() + 1);
          break;
        case 'quarterly':
          d.setMonth(d.getMonth() + 3);
          break;
        case 'yearly':
          d.setFullYear(d.getFullYear() + 1);
          break;
        default:
          break;
      }
    };

    advanceDate(nextStart, recurrence);

    // Skip excluded months if specified (for standard monthly/quarterly/yearly)
    while (excludedMonths.includes(nextStart.getMonth()) || nextStart.getTime() <= now.getTime()) {
      advanceDate(nextStart, recurrence);
    }
  }

  const nextEnd = new Date(nextStart.getTime() + (isNaN(durationMs) ? 7200000 : durationMs));

  const formattedNextStart = nextStart.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });

  const nthLabel = nth === 1 ? '1st' : nth === 2 ? '2nd' : nth === 3 ? '3rd' : nth === 4 ? '4th' : 'Last';
  const weekdayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const excludedLabels = excludedMonths.map(m => monthNames[m]).join(', ');

  const patternNote = isNthWeekdayRule 
    ? `${nthLabel} ${weekdayNames[weekday]} of month${excludedLabels ? ` (Except ${excludedLabels})` : ''}`
    : recurrence === 'weekly' ? 'Weekly (+7 days)' :
      recurrence === 'monthly' ? `Monthly${excludedLabels ? ` (Except ${excludedLabels})` : ''}` :
      recurrence === 'quarterly' ? 'Quarterly (+3 months)' :
      recurrence === 'yearly' ? 'Yearly (+1 year)' : '';

  return {
    nextStartISO: nextStart.toISOString(),
    nextEndISO: nextEnd.toISOString(),
    formattedNextStart,
    patternNote
  };
};

export const advanceRecurringEventDate = async (event: ChurchEvent): Promise<ChurchEvent> => {
  const { nextStartISO, nextEndISO } = calculateNextRecurrenceDate(
    event.start_time,
    event.end_time,
    event.recurrence,
    event
  );

  const futureNext = calculateNextRecurrenceDate(nextStartISO, nextEndISO, event.recurrence, event);

  const updatedPayload = {
    start_time: nextStartISO,
    end_time: nextEndISO,
    next_occurrence: futureNext.nextStartISO,
    status: 'upcoming' as const
  };

  try {
    await supabase.from('events').update(updatedPayload).eq('id', event.id);
  } catch (e) {
    console.warn("Error updating recurring event in Supabase:", e);
  }

  return {
    ...event,
    ...updatedPayload
  };
};

export interface ScheduleConflict {
  eventId: string;
  conflictingWithId: string;
  eventTitle: string;
  conflictingTitle: string;
  conflictDate: string;
  conflictType: 'combined_preemption' | 'time_collision';
  message: string;
  preemptedEventId?: string;
}

export const checkEventsOverlap = (evtA: ChurchEvent, evtB: ChurchEvent): boolean => {
  if (evtA.id === evtB.id || evtA.status === 'cancelled' || evtB.status === 'cancelled') return false;
  
  const startA = new Date(evtA.start_time).getTime();
  const endA = new Date(evtA.end_time).getTime();
  const startB = new Date(evtB.start_time).getTime();
  const endB = new Date(evtB.end_time).getTime();

  if (isNaN(startA) || isNaN(endA) || isNaN(startB) || isNaN(endB)) return false;

  // Check if time intervals overlap
  return startA < endB && endA > startB;
};

export const detectScheduleConflicts = (events: ChurchEvent[]): ScheduleConflict[] => {
  const conflicts: ScheduleConflict[] = [];
  const processedPairs = new Set<string>();

  for (let i = 0; i < events.length; i++) {
    for (let j = i + 1; j < events.length; j++) {
      const evtA = events[i];
      const evtB = events[j];
      const pairKey = [evtA.id, evtB.id].sort().join('::');

      if (processedPairs.has(pairKey)) continue;

      if (checkEventsOverlap(evtA, evtB)) {
        processedPairs.add(pairKey);

        const dateStr = new Date(evtA.start_time).toLocaleDateString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          year: 'numeric'
        });

        const isACombined = evtA.is_combined_service || evtA.title.toLowerCase().includes('combined') || evtA.title.toLowerCase().includes('joint');
        const isBCombined = evtB.is_combined_service || evtB.title.toLowerCase().includes('combined') || evtB.title.toLowerCase().includes('joint');

        if (isACombined || isBCombined) {
          const combinedEvt = isACombined ? evtA : evtB;
          const weeklyEvt = isACombined ? evtB : evtA;

          conflicts.push({
            eventId: combinedEvt.id,
            conflictingWithId: weeklyEvt.id,
            eventTitle: combinedEvt.title,
            conflictingTitle: weeklyEvt.title,
            conflictDate: dateStr,
            conflictType: 'combined_preemption',
            preemptedEventId: weeklyEvt.id,
            message: `✨ Combined Service Alignment: "${combinedEvt.title}" takes precedence on ${dateStr}. Standard gathering "${weeklyEvt.title}" is merged into the Combined Service.`
          });
        } else {
          conflicts.push({
            eventId: evtA.id,
            conflictingWithId: evtB.id,
            eventTitle: evtA.title,
            conflictingTitle: evtB.title,
            conflictDate: dateStr,
            conflictType: 'time_collision',
            message: `⚠️ Schedule Collision Warning: "${evtA.title}" and "${evtB.title}" are both scheduled at ${dateStr}.`
          });
        }
      }
    }
  }

  return conflicts;
};

// --- OCCURRENCE OVERRIDES & ATTENDANCE PERSISTENCE ---
const OCCURRENCE_OVERRIDES_KEY = 'faithconnect_occurrence_overrides_v1';
const OCCURRENCE_ATTENDANCE_KEY = 'faithconnect_occurrence_attendance_v1';

export const getOccurrenceOverrides = (): Record<string, OccurrenceOverride> => {
  try {
    const saved = localStorage.getItem(OCCURRENCE_OVERRIDES_KEY);
    return saved ? JSON.parse(saved) : {};
  } catch (e) {
    return {};
  }
};

export const saveOccurrenceOverride = (override: OccurrenceOverride) => {
  const current = getOccurrenceOverrides();
  current[override.id] = override;
  localStorage.setItem(OCCURRENCE_OVERRIDES_KEY, JSON.stringify(current));
};

export const getOccurrenceAttendanceMap = (): Record<string, number> => {
  try {
    const saved = localStorage.getItem(OCCURRENCE_ATTENDANCE_KEY);
    return saved ? JSON.parse(saved) : {};
  } catch (e) {
    return {};
  }
};

export const saveOccurrenceAttendance = (occurrenceId: string, count: number) => {
  const current = getOccurrenceAttendanceMap();
  current[occurrenceId] = count;
  localStorage.setItem(OCCURRENCE_ATTENDANCE_KEY, JSON.stringify(current));
};

// --- DYNAMIC RECURRENCE OCCURRENCE GENERATOR ENGINE ---
export const generateEventOccurrences = (
  event: ChurchEvent,
  rangeStart: Date = new Date(Date.now() - 86400000 * 30),
  rangeEnd: Date = new Date(Date.now() + 86400000 * 180)
): EventOccurrence[] => {
  const occurrences: EventOccurrence[] = [];
  const overrides = getOccurrenceOverrides();
  const attendanceMap = getOccurrenceAttendanceMap();

  const startTimeObj = new Date(event.start_time);
  const endTimeObj = new Date(event.end_time);

  const durationMs = !isNaN(startTimeObj.getTime()) && !isNaN(endTimeObj.getTime())
    ? Math.max(3600000, endTimeObj.getTime() - startTimeObj.getTime())
    : 7200000;

  const hours = isNaN(startTimeObj.getTime()) ? 9 : startTimeObj.getHours();
  const minutes = isNaN(startTimeObj.getTime()) ? 0 : startTimeObj.getMinutes();

  const recurrenceType = event.recurrence || 'one_time';
  const config = event.recurrence_config;

  if (recurrenceType === 'one_time' && !config) {
    const occDateStr = startTimeObj.toISOString().slice(0, 10);
    const occId = `${event.id}_${occDateStr}`;
    const override = overrides[occId];

    occurrences.push({
      id: occId,
      event_id: event.id,
      event_title: event.title,
      occurrence_date: occDateStr,
      start_time: override?.new_start_time || event.start_time,
      end_time: override?.new_end_time || event.end_time,
      status: override?.action === 'cancel' ? 'cancelled' : override?.action === 'reschedule' ? 'rescheduled' : event.status,
      is_modified: Boolean(override),
      modified_notes: override?.notes,
      override_location: override?.new_location || event.location,
      attendance_count: attendanceMap[occId] ?? (event.registered_count || 0),
      category: event.category,
      location: override?.new_location || event.location,
      organizer_name: event.organizer_name,
      is_combined_service: event.is_combined_service,
      account_number: event.account_number
    });
    return occurrences;
  }

  // --- WEEKLY RECURRENCE ---
  if (recurrenceType === 'weekly' || config?.frequency === 'WEEKLY') {
    const targetDays = config?.days_of_week && config.days_of_week.length > 0
      ? config.days_of_week
      : [isNaN(startTimeObj.getTime()) ? 0 : startTimeObj.getDay()];

    const curr = new Date(rangeStart);
    curr.setHours(hours, minutes, 0, 0);

    while (curr.getTime() <= rangeEnd.getTime()) {
      if (targetDays.includes(curr.getDay())) {
        const occDateStr = curr.toISOString().slice(0, 10);
        const occId = `${event.id}_${occDateStr}`;
        const override = overrides[occId];

        const occStart = new Date(curr);
        const occEnd = new Date(occStart.getTime() + durationMs);

        occurrences.push({
          id: occId,
          event_id: event.id,
          event_title: event.title,
          occurrence_date: occDateStr,
          start_time: override?.new_start_time || occStart.toISOString(),
          end_time: override?.new_end_time || occEnd.toISOString(),
          status: override?.action === 'cancel' ? 'cancelled' : override?.action === 'reschedule' ? 'rescheduled' : 'scheduled',
          is_modified: Boolean(override),
          modified_notes: override?.notes,
          override_location: override?.new_location || event.location,
          attendance_count: attendanceMap[occId] ?? 0,
          category: event.category,
          location: override?.new_location || event.location,
          organizer_name: event.organizer_name,
          is_combined_service: event.is_combined_service,
          account_number: event.account_number
        });
      }
      curr.setDate(curr.getDate() + 1);
    }
    return occurrences;
  }

  // --- MONTHLY RECURRENCE (WITH MONTH OVERRIDES) ---
  if (recurrenceType === 'monthly' || recurrenceType === 'nth_weekday_monthly' || config?.frequency === 'MONTHLY') {
    const defaultNth = event.recurrence_nth || config?.week_number || 2;
    const defaultWeekday = event.recurrence_weekday ?? config?.weekday ?? (isNaN(startTimeObj.getTime()) ? 0 : startTimeObj.getDay());
    const monthOverrides = config?.month_overrides || [];

    // Also check pattern string for January override if not in array
    const patternLower = (event.recurrence_pattern || '').toLowerCase();
    const hasJanOverridePattern = patternLower.includes('january') && (patternLower.includes('1st') || patternLower.includes('first'));

    let y = rangeStart.getFullYear();
    let m = rangeStart.getMonth();
    const endY = rangeEnd.getFullYear();
    const endM = rangeEnd.getMonth();

    while (y < endY || (y === endY && m <= endM)) {
      // Check if month is excluded completely
      if (!(event.excluded_months || []).includes(m)) {
        let nthForMonth = defaultNth;
        let weekdayForMonth = defaultWeekday;

        // Check for explicit month override
        const overrideRule = monthOverrides.find(o => o.month === m);
        if (overrideRule) {
          nthForMonth = overrideRule.week_number;
          if (overrideRule.weekday !== undefined) weekdayForMonth = overrideRule.weekday;
        } else if (m === 0 && hasJanOverridePattern) {
          nthForMonth = 1; // January First Sunday exception!
        }

        const occStart = getNthWeekdayDate(y, m, nthForMonth, weekdayForMonth, hours, minutes);

        if (occStart.getTime() >= rangeStart.getTime() && occStart.getTime() <= rangeEnd.getTime()) {
          const occDateStr = occStart.toISOString().slice(0, 10);
          const occId = `${event.id}_${occDateStr}`;
          const override = overrides[occId];
          const occEnd = new Date(occStart.getTime() + durationMs);

          occurrences.push({
            id: occId,
            event_id: event.id,
            event_title: event.title,
            occurrence_date: occDateStr,
            start_time: override?.new_start_time || occStart.toISOString(),
            end_time: override?.new_end_time || occEnd.toISOString(),
            status: override?.action === 'cancel' ? 'cancelled' : override?.action === 'reschedule' ? 'rescheduled' : 'scheduled',
            is_modified: Boolean(override),
            modified_notes: override?.notes,
            override_location: override?.new_location || event.location,
            attendance_count: attendanceMap[occId] ?? 0,
            category: event.category,
            location: override?.new_location || event.location,
            organizer_name: event.organizer_name,
            is_combined_service: event.is_combined_service,
            account_number: event.account_number
          });
        }
      }

      m++;
      if (m > 11) {
        m = 0;
        y++;
      }
    }
    return occurrences;
  }

  // --- QUARTERLY RECURRENCE (ANCHORED MONTHS) ---
  if (recurrenceType === 'quarterly' || config?.frequency === 'QUARTERLY') {
    // Default quarterly anchor months e.g. [2, 5, 8, 11] for Mar, Jun, Sep, Dec (or starting Dec: [11, 2, 5, 8])
    const anchorMonths = config?.anchor_months || [2, 5, 8, 11];
    const nthForQuarter = event.recurrence_nth || config?.week_number || 1;
    const weekdayForQuarter = event.recurrence_weekday ?? config?.weekday ?? 0; // Sunday

    let y = rangeStart.getFullYear();
    let m = rangeStart.getMonth();
    const endY = rangeEnd.getFullYear();
    const endM = rangeEnd.getMonth();

    while (y < endY || (y === endY && m <= endM)) {
      if (anchorMonths.includes(m)) {
        const occStart = getNthWeekdayDate(y, m, nthForQuarter, weekdayForQuarter, hours, minutes);

        if (occStart.getTime() >= rangeStart.getTime() && occStart.getTime() <= rangeEnd.getTime()) {
          const occDateStr = occStart.toISOString().slice(0, 10);
          const occId = `${event.id}_${occDateStr}`;
          const override = overrides[occId];
          const occEnd = new Date(occStart.getTime() + durationMs);

          occurrences.push({
            id: occId,
            event_id: event.id,
            event_title: event.title,
            occurrence_date: occDateStr,
            start_time: override?.new_start_time || occStart.toISOString(),
            end_time: override?.new_end_time || occEnd.toISOString(),
            status: override?.action === 'cancel' ? 'cancelled' : override?.action === 'reschedule' ? 'rescheduled' : 'scheduled',
            is_modified: Boolean(override),
            modified_notes: override?.notes,
            override_location: override?.new_location || event.location,
            attendance_count: attendanceMap[occId] ?? 0,
            category: event.category,
            location: override?.new_location || event.location,
            organizer_name: event.organizer_name,
            is_combined_service: event.is_combined_service,
            account_number: event.account_number
          });
        }
      }

      m++;
      if (m > 11) {
        m = 0;
        y++;
      }
    }
    return occurrences;
  }

  // Fallback default: Return parent start date occurrence
  const occDateStr = startTimeObj.toISOString().slice(0, 10);
  const occId = `${event.id}_${occDateStr}`;
  const override = overrides[occId];

  occurrences.push({
    id: occId,
    event_id: event.id,
    event_title: event.title,
    occurrence_date: occDateStr,
    start_time: override?.new_start_time || event.start_time,
    end_time: override?.new_end_time || event.end_time,
    status: override?.action === 'cancel' ? 'cancelled' : override?.action === 'reschedule' ? 'rescheduled' : event.status,
    is_modified: Boolean(override),
    modified_notes: override?.notes,
    override_location: override?.new_location || event.location,
    attendance_count: attendanceMap[occId] ?? (event.registered_count || 0),
    category: event.category,
    location: override?.new_location || event.location,
    organizer_name: event.organizer_name,
    is_combined_service: event.is_combined_service,
    account_number: event.account_number
  });

  return occurrences;
};

// --- PRECEDENCE & PREEMPTION RESOLUTION ENGINE ---
export const getEventPriorityRank = (occ: EventOccurrence): number => {
  const titleLower = (occ.event_title || '').toLowerCase();
  const categoryLower = (occ.category || '').toLowerCase();
  
  // Rank 1 (Highest Precedence): Monthly Combined Service, Joint Service, or explicit combined flag
  if (occ.is_combined_service || titleLower.includes('combined') || titleLower.includes('joint') || titleLower.includes('monthly combined')) {
    return 1;
  }
  
  // Rank 2: Quarterly Services, Special Conferences, or Youth Rallies
  if (titleLower.includes('quarterly') || titleLower.includes('conference') || titleLower.includes('rally') || categoryLower.includes('special service') || categoryLower.includes('conference')) {
    return 2;
  }
  
  // Rank 3 (Standard): Regular Weekly Services (Sunday Service, Tuesday Service, Thursday Service)
  return 3;
};

export const resolveOccurrencePreemption = (occurrences: EventOccurrence[]): EventOccurrence[] => {
  // Group occurrences by date YYYY-MM-DD
  const occurrencesByDate: Record<string, EventOccurrence[]> = {};
  for (const occ of occurrences) {
    if (!occurrencesByDate[occ.occurrence_date]) {
      occurrencesByDate[occ.occurrence_date] = [];
    }
    occurrencesByDate[occ.occurrence_date].push({ ...occ });
  }

  const resolved: EventOccurrence[] = [];

  for (const dateStr in occurrencesByDate) {
    const dayOccs = occurrencesByDate[dateStr];

    if (dayOccs.length <= 1) {
      resolved.push(...dayOccs);
      continue;
    }

    // Sort day occurrences by priority rank ascending (1 highest, 3 lowest)
    dayOccs.sort((a, b) => getEventPriorityRank(a) - getEventPriorityRank(b));

    const highestPriorityRank = getEventPriorityRank(dayOccs[0]);

    // If we have a higher priority event (Rank 1 or 2) colliding with a lower priority event
    if (highestPriorityRank < 3) {
      const winner = dayOccs[0];

      for (let i = 0; i < dayOccs.length; i++) {
        const item = dayOccs[i];
        const itemRank = getEventPriorityRank(item);

        if (i === 0) {
          // Winner stands active
          resolved.push(item);
        } else if (itemRank > highestPriorityRank) {
          // Lower priority event is automatically preempted by the higher priority winner
          const overrideActionNote = winner.is_combined_service || winner.event_title.toLowerCase().includes('combined')
            ? `Merged into Combined Service (${winner.event_title})`
            : `Preempted by ${winner.event_title}`;

          resolved.push({
            ...item,
            status: 'cancelled',
            is_modified: true,
            modified_notes: overrideActionNote
          });
        } else {
          // Same priority rank keeps its status
          resolved.push(item);
        }
      }
    } else {
      // All items on this date have same rank (e.g. 3)
      resolved.push(...dayOccs);
    }
  }

  resolved.sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
  return resolved;
};



