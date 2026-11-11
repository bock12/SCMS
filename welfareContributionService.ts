import { MemberContribution, MemberWelfareCard, ContributionCategory, WelfareReason, WelfareCampaignDrive } from './types';
import { saveDepartmentLedgerRecord } from './departmentLedgerService';

const getStorageKey = (deptName: string) => `faithconnect_welfare_contrib_${deptName.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
const getCampaignKey = (deptName: string) => `faithconnect_welfare_campaigns_${deptName.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;

export const getWelfareReasonLabel = (reason?: WelfareReason): string => {
  switch (reason) {
    case 'marriage': return '💍 Wedding & Marriage Celebration';
    case 'burial_bereavement': return '🕊️ Burial & Bereavement Support';
    case 'sickness_medical': return '🏥 Sickness & Medical Relief';
    case 'naming_ceremony': return '👶 Child Naming Ceremony';
    case 'emergency_hardship': return '🚨 Emergency Welfare Relief';
    default: return '🤝 General Welfare Contribution';
  }
};

export const getCategoryBadgeColor = (category: ContributionCategory): string => {
  switch (category) {
    case 'welfare': return 'bg-purple-100 text-purple-900 border-purple-200';
    case 'monthly_dues': return 'bg-emerald-100 text-emerald-900 border-emerald-200';
    case 'special_support': return 'bg-blue-100 text-blue-900 border-blue-200';
  }
};

export const generateWelfareCardNumber = (deptName: string, memberId: string): string => {
  const acronym = deptName.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 4) || 'DEPT';
  const cleanId = memberId.replace(/[^a-zA-Z0-9]/g, '').slice(-4).toUpperCase() || '001';
  return `WEL-${acronym}-2026-${cleanId}`;
};

const getSeedCampaigns = (deptName: string): WelfareCampaignDrive[] => [
  {
    id: `camp-1-${Date.now()}`,
    department_name: deptName,
    beneficiary_member_id: 'r-1',
    beneficiary_member_name: 'Brother David Koroma',
    reason: 'marriage',
    title: "David Koroma's Wedding Celebration Support Drive",
    description: "Blessing drive for Brother David Koroma's upcoming church wedding and family gift basket.",
    expected_amount_per_member: 200,
    target_total_amount: 3000,
    deadline: new Date(Date.now() + 86400000 * 14).toISOString().slice(0, 10),
    status: 'active',
    created_at: new Date(Date.now() - 86400000 * 5).toISOString(),
    created_by: 'Ministry Secretary'
  },
  {
    id: `camp-2-${Date.now()}`,
    department_name: deptName,
    beneficiary_member_id: 'r-2',
    beneficiary_member_name: 'Sister Sarah Bangura',
    reason: 'naming_ceremony',
    title: "Sarah Bangura's Newborn Child Naming Gift Drive",
    description: "Department welfare token and gift support for Sister Sarah's newborn baby naming ceremony.",
    expected_amount_per_member: 150,
    target_total_amount: 1800,
    deadline: new Date(Date.now() + 86400000 * 7).toISOString().slice(0, 10),
    status: 'active',
    created_at: new Date(Date.now() - 86400000 * 8).toISOString(),
    created_by: 'Ministry Lead'
  }
];

export const getWelfareCampaigns = (deptName: string): WelfareCampaignDrive[] => {
  try {
    const key = getCampaignKey(deptName);
    const raw = localStorage.getItem(key);
    if (raw) {
      return JSON.parse(raw);
    }
    const seed = getSeedCampaigns(deptName);
    localStorage.setItem(key, JSON.stringify(seed));
    return seed;
  } catch (e) {
    console.error('Error fetching welfare campaign drives:', e);
    return getSeedCampaigns(deptName);
  }
};

export const saveWelfareCampaign = (campaign: WelfareCampaignDrive): void => {
  try {
    const key = getCampaignKey(campaign.department_name);
    const existing = getWelfareCampaigns(campaign.department_name);
    const updated = [campaign, ...existing];
    localStorage.setItem(key, JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent('dept_welfare_updated', { detail: { department: campaign.department_name } }));
  } catch (e) {
    console.error('Error saving welfare campaign:', e);
  }
};

const getSeedContributions = (deptName: string): MemberContribution[] => [
  {
    id: `contrib-1-${Date.now()}`,
    department_name: deptName,
    campaign_id: `camp-1-${Date.now()}`,
    member_id: 'r-1',
    member_name: 'David Koroma',
    welfare_card_number: generateWelfareCardNumber(deptName, 'r-1'),
    category: 'welfare',
    welfare_reason: 'marriage',
    amount: 500,
    currency: 'SLE',
    date: new Date(Date.now() - 86400000 * 4).toISOString(),
    payment_method: 'mobile_money',
    transaction_ref: 'MM-WEL-8812',
    recorded_by: 'Ministry Secretary',
    notes: "Member contribution towards David Koroma's wedding gift drive."
  },
  {
    id: `contrib-2-${Date.now()}`,
    department_name: deptName,
    member_id: 'r-1',
    member_name: 'David Koroma',
    welfare_card_number: generateWelfareCardNumber(deptName, 'r-1'),
    category: 'monthly_dues',
    period_month_year: '2026-11',
    amount: 200,
    currency: 'SLE',
    date: new Date(Date.now() - 86400000 * 2).toISOString(),
    payment_method: 'cash',
    recorded_by: 'Department Financial Lead',
    notes: 'November 2026 official monthly dues.'
  },
  {
    id: `contrib-3-${Date.now()}`,
    department_name: deptName,
    campaign_id: `camp-2-${Date.now()}`,
    member_id: 'r-2',
    member_name: 'Sarah Bangura',
    welfare_card_number: generateWelfareCardNumber(deptName, 'r-2'),
    category: 'welfare',
    welfare_reason: 'naming_ceremony',
    amount: 350,
    currency: 'SLE',
    date: new Date(Date.now() - 86400000 * 6).toISOString(),
    payment_method: 'mobile_money',
    transaction_ref: 'MM-WEL-9901',
    recorded_by: 'Ministry Lead',
    notes: "Welfare gift support for Sister Sarah's newborn baby naming ceremony drive."
  },
  {
    id: `contrib-4-${Date.now()}`,
    department_name: deptName,
    member_id: 'r-2',
    member_name: 'Sarah Bangura',
    welfare_card_number: generateWelfareCardNumber(deptName, 'r-2'),
    category: 'special_support',
    special_support_purpose: 'Sanctuary Audio Equipment Upgrade Pledge',
    amount: 600,
    currency: 'SLE',
    date: new Date(Date.now() - 86400000 * 1).toISOString(),
    payment_method: 'bank_transfer',
    transaction_ref: 'BANK-PLG-0021',
    recorded_by: 'Ministry Secretary',
    notes: 'Special task pledge fulfillment for department audio equipment.'
  }
];

export const getMemberContributions = (deptName: string): MemberContribution[] => {
  try {
    const key = getStorageKey(deptName);
    const raw = localStorage.getItem(key);
    if (raw) {
      return JSON.parse(raw);
    }
    const seed = getSeedContributions(deptName);
    localStorage.setItem(key, JSON.stringify(seed));
    return seed;
  } catch (e) {
    console.error('Error fetching member contributions:', e);
    return getSeedContributions(deptName);
  }
};

export const saveMemberContribution = (contrib: MemberContribution): void => {
  try {
    const key = getStorageKey(contrib.department_name);
    const existing = getMemberContributions(contrib.department_name);
    const updated = [contrib, ...existing];
    localStorage.setItem(key, JSON.stringify(updated));

    // Automatically sync into Department Income Ledger
    let categoryTitle = 'Member Contributions & Welfare';
    let desc = `${contrib.member_name} — `;
    if (contrib.category === 'welfare') {
      categoryTitle = 'Welfare Contributions';
      desc += getWelfareReasonLabel(contrib.welfare_reason);
    } else if (contrib.category === 'monthly_dues') {
      categoryTitle = 'Monthly Membership Dues';
      desc += `Monthly Dues (${contrib.period_month_year || 'Current Month'})`;
    } else {
      categoryTitle = 'Special Task & Project Support';
      desc += contrib.special_support_purpose || 'Special Support';
    }

    saveDepartmentLedgerRecord({
      id: `drec-auto-${contrib.id}`,
      department_name: contrib.department_name,
      type: 'income',
      category: categoryTitle,
      description: desc,
      amount: contrib.amount,
      currency: contrib.currency || 'SLE',
      date: contrib.date,
      recorded_by: contrib.recorded_by,
      payment_method: contrib.payment_method,
      notes: contrib.notes,
      member_id: contrib.member_id,
      member_name: contrib.member_name,
      contribution_category: contrib.category,
      welfare_reason: contrib.welfare_reason,
      welfare_card_number: contrib.welfare_card_number,
      drive_id: contrib.campaign_id
    });

    window.dispatchEvent(new CustomEvent('dept_welfare_updated', { detail: { department: contrib.department_name } }));
  } catch (e) {
    console.error('Error saving member contribution:', e);
  }
};

export const getMemberWelfareCard = (memberId: string, memberName: string, deptName: string): MemberWelfareCard => {
  const allContribs = getMemberContributions(deptName);
  const memberContribs = allContribs.filter(c => c.member_id === memberId || c.member_name.toLowerCase() === memberName.toLowerCase());

  const totalWelfare = memberContribs.filter(c => c.category === 'welfare').reduce((s, c) => s + Number(c.amount), 0);
  const totalDues = memberContribs.filter(c => c.category === 'monthly_dues').reduce((s, c) => s + Number(c.amount), 0);
  const totalSupport = memberContribs.filter(c => c.category === 'special_support').reduce((s, c) => s + Number(c.amount), 0);

  const lastContrib = memberContribs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];

  const cardNumber = lastContrib?.welfare_card_number || generateWelfareCardNumber(deptName, memberId);

  return {
    card_number: cardNumber,
    member_id: memberId,
    member_name: memberName,
    department_name: deptName,
    issued_date: '2026-01-10',
    status: totalDues > 0 || totalWelfare > 0 ? 'Good Standing' : 'Dues Pending',
    total_welfare_paid: totalWelfare,
    total_dues_paid: totalDues,
    total_support_paid: totalSupport,
    last_contribution_date: lastContrib?.date
  };
};

export const getDeptWelfareSummary = (deptName: string) => {
  const contribs = getMemberContributions(deptName);
  const totalWelfare = contribs.filter(c => c.category === 'welfare').reduce((s, c) => s + Number(c.amount), 0);
  const totalMonthlyDues = contribs.filter(c => c.category === 'monthly_dues').reduce((s, c) => s + Number(c.amount), 0);
  const totalSpecialSupport = contribs.filter(c => c.category === 'special_support').reduce((s, c) => s + Number(c.amount), 0);

  return {
    totalContributions: totalWelfare + totalMonthlyDues + totalSpecialSupport,
    totalWelfare,
    totalMonthlyDues,
    totalSpecialSupport,
    recordCount: contribs.length
  };
};

export const getCampaignProgress = (campaign: WelfareCampaignDrive, deptName: string) => {
  const contribs = getMemberContributions(deptName).filter(c => c.campaign_id === campaign.id);
  const totalRaised = contribs.reduce((s, c) => s + Number(c.amount), 0);
  const contributorsCount = new Set(contribs.map(c => c.member_id || c.member_name)).size;
  const percentage = campaign.target_total_amount > 0 ? Math.min(100, Math.round((totalRaised / campaign.target_total_amount) * 100)) : 100;

  return {
    totalRaised,
    contributorsCount,
    percentage,
    contribs
  };
};
