import React, { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { 
  ChurchEvent, Profile, EventRegistration, EventTeamRole, 
  EventRoleTitle, EventTask, EventScheduleItem, EventExpense,
  DepartmentRequisition, EventBudgetApproval, ProformaLineItem,
  EventAccount, EventFundingTransaction, EventRecurrence
} from './types';
import { 
  X, Calendar as CalendarIcon, Clock, MapPin, Users, Video, 
  Sparkles, Plus, Trash2, Edit, CheckCircle2, AlertCircle, 
  DollarSign, CheckSquare, Layers, Download, Phone, Mail, 
  UserPlus, ExternalLink, ShieldCheck, RefreshCw, Radio,
  QrCode, ArrowLeft, Printer, Search, Check, FileText,
  Send, TrendingUp, Award, Percent, FileCheck, CheckCircle,
  PieChart, UserCheck, UserX, BarChart3, AlertTriangle,
  Package, MessageSquareText, Star, ThumbsUp, ThumbsDown, Link, Copy, Share2,
  Landmark, Wallet, ArrowDownRight, ArrowUpRight, Receipt, CreditCard, Smartphone, MoreHorizontal
} from 'lucide-react';
import { supabase } from './supabaseClient';
import { getRequisitions, saveRequisitions } from './requisitionService';
import { getEventBudgetApproval, submitEventBudgetForApproval } from './eventBudgetService';
import { getChurchResources, getEventResourceReservations, saveEventResourceReservations, ChurchResource, EventResourceReservation } from './resourceService';
import { getSurveyResponses, saveSurveyResponse, calculateSentimentSummary, SurveyResponse, SentimentSummary } from './surveyService';
import { getEventAccount, fundEventAccount, disburseFromEventAccount, getRecurrenceBadge, calculateNextRecurrenceDate, advanceRecurringEventDate } from './eventAccountService';
import { getChurchProfile } from './churchProfileService';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer 
} from 'recharts';
import { LocationMap } from './LocationMap';

interface EventWorkspaceModalProps {
  event: ChurchEvent;
  members: Profile[];
  registrations: EventRegistration[];
  onClose: () => void;
  onUpdateEvent: (updated: ChurchEvent) => void;
  onRefreshData: () => void;
}

export const EventWorkspaceModal: React.FC<EventWorkspaceModalProps> = ({
  event,
  members,
  registrations,
  onClose,
  onUpdateEvent,
  onRefreshData
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'account' | 'qrpass' | 'team' | 'schedule' | 'tasks' | 'budget' | 'resources' | 'survey' | 'report' | 'rsvps'>('overview');
  const [showMoreMenu, setShowMoreMenu] = useState(false);

  // Local Storage Key for Event Workspace State
  const storageKey = `event_workspace_${event.id}`;
  const reportStorageKey = `event_workspace_report_${event.id}`;

  // State
  const [roles, setRoles] = useState<EventTeamRole[]>([]);
  const [tasks, setTasks] = useState<EventTask[]>([]);
  const [schedule, setSchedule] = useState<EventScheduleItem[]>([]);
  const [expenses, setExpenses] = useState<EventExpense[]>([]);

  // Physical Resources State
  const [churchResources, setChurchResources] = useState<ChurchResource[]>(getChurchResources());
  const [eventReservations, setEventReservations] = useState<EventResourceReservation[]>(getEventResourceReservations(event.id));
  const [showReserveModal, setShowReserveModal] = useState(false);
  const [selectedResourceId, setSelectedResourceId] = useState('');
  const [reserveQty, setReserveQty] = useState<number>(1);
  const [reserveNotes, setReserveNotes] = useState('');
  const [resourceSuccessMsg, setResourceSuccessMsg] = useState<string | null>(null);

  // Post-Event Survey & Sentiment Analytics State
  const [surveyResponses, setSurveyResponses] = useState<SurveyResponse[]>(getSurveyResponses(event.id));
  const [sentimentSummary, setSentimentSummary] = useState<SentimentSummary>(calculateSentimentSummary(event.id));
  const [surveyRespondentName, setSurveyRespondentName] = useState('');
  const [surveyOverall, setSurveyOverall] = useState<number>(5);
  const [surveySpiritual, setSurveySpiritual] = useState<number>(5);
  const [surveySound, setSurveySound] = useState<number>(5);
  const [surveyHospitality, setSurveyHospitality] = useState<number>(5);
  const [surveyFeedbackText, setSurveyFeedbackText] = useState('');
  const [surveySuccessMsg, setSurveySuccessMsg] = useState<string | null>(null);
  const [surveyCopyMsg, setSurveyCopyMsg] = useState<string | null>(null);

  const reloadSurveyData = () => {
    setSurveyResponses(getSurveyResponses(event.id));
    setSentimentSummary(calculateSentimentSummary(event.id));
  };

  const reloadResourceData = () => {
    setChurchResources(getChurchResources());
    setEventReservations(getEventResourceReservations(event.id));
  };

  useEffect(() => {
    reloadResourceData();
    reloadSurveyData();
    const handleRes = () => reloadResourceData();
    const handleSur = () => reloadSurveyData();
    window.addEventListener('resource_reservations_updated', handleRes);
    window.addEventListener('survey_responses_updated', handleSur);
    return () => {
      window.removeEventListener('resource_reservations_updated', handleRes);
      window.removeEventListener('survey_responses_updated', handleSur);
    };
  }, [event.id]);

  // Event Account & Dedicated Treasury Funding State
  const [eventAccount, setEventAccount] = useState<EventAccount>(() => 
    getEventAccount(event.id, event.title, event.recurring_funding_allowance || 15000)
  );
  const [showFundModal, setShowFundModal] = useState(false);
  const [showDisburseModal, setShowDisburseModal] = useState(false);
  const [accountSuccessMsg, setAccountSuccessMsg] = useState<string | null>(null);
  const [accountErrorMsg, setAccountErrorMsg] = useState<string | null>(null);
  const [copyCodeFeedback, setCopyCodeFeedback] = useState<string | null>(null);
  const [recurrenceAdvanceToast, setRecurrenceAdvanceToast] = useState<string | null>(null);

  const handleAdvanceRecurrence = async () => {
    try {
      const updatedEvt = await advanceRecurringEventDate(event);
      onUpdateEvent(updatedEvt);
      setRecurrenceAdvanceToast(`🎉 Event schedule successfully rolled forward to: ${new Date(updatedEvt.start_time).toLocaleString()}!`);
      setTimeout(() => setRecurrenceAdvanceToast(null), 6000);
      onRefreshData();
    } catch (err: any) {
      setAccountErrorMsg(err?.message || 'Error advancing recurrence date');
    }
  };

  // Fund Account Form State
  const [fundAmount, setFundAmount] = useState<string>('5000');
  const [fundSource, setFundSource] = useState<'church_treasury' | 'bank_wire' | 'mobile_money' | 'cash' | 'card'>('church_treasury');
  const [fundContributor, setFundContributor] = useState('Grace Cathedral Treasury Controller');
  const [fundTxnRef, setFundTxnRef] = useState('');
  const [fundNotes, setFundNotes] = useState('');

  // Guest Minister & Hospitality State
  interface GuestMinister {
    id: string;
    name: string;
    ministry: string;
    honorarium: number;
    hotel: string;
    flight_info: string;
    pickup_time: string;
    bio: string;
    is_disbursed: boolean;
  }

  const [guestMinisters, setGuestMinisters] = useState<GuestMinister[]>(() => {
    try {
      const saved = localStorage.getItem(`guest_ministers_${event.id}`);
      return saved ? JSON.parse(saved) : [
        {
          id: 'gm_1',
          name: 'Bishop Dr. David K. Mensah',
          ministry: 'Living Faith Cathedral, Accra',
          honorarium: 5000,
          hotel: 'Radisson Blu Resort, Room 402',
          flight_info: 'Flight KQ-512 Arriving 4:30 PM',
          pickup_time: '3:45 PM (Protocol SUV 1)',
          bio: 'Keynote Speaker for Annual Prophetic Conference',
          is_disbursed: false
        }
      ];
    } catch (e) {
      return [];
    }
  });

  const [showAddMinisterModal, setShowAddMinisterModal] = useState(false);
  const [gmName, setGmName] = useState('');
  const [gmMinistry, setGmMinistry] = useState('');
  const [gmHonorarium, setGmHonorarium] = useState<number>(3000);
  const [gmHotel, setGmHotel] = useState('Radisson Executive Suite');
  const [gmFlight, setGmFlight] = useState('Flight KQ-512 @ 4:30 PM');
  const [gmPickup, setGmPickup] = useState('Protocol Van 1');
  const [gmBio, setGmBio] = useState('Visiting Keynote Minister');

  const saveGuestMinistersToStorage = (updated: GuestMinister[]) => {
    setGuestMinisters(updated);
    localStorage.setItem(`guest_ministers_${event.id}`, JSON.stringify(updated));
  };

  const handleDisburseHonorarium = (gm: GuestMinister) => {
    if (gm.is_disbursed) return;
    const updated = guestMinisters.map(item => item.id === gm.id ? { ...item, is_disbursed: true } : item);
    saveGuestMinistersToStorage(updated);

    // Auto-create itemized expense in budget
    const newExpense: EventExpense = {
      id: `exp_gm_${Date.now()}`,
      description: `Guest Speaker Honorarium: ${gm.name} (${gm.ministry})`,
      quantity: 1,
      unit_price: gm.honorarium,
      total_price: gm.honorarium,
      category: 'Honorarium'
    };
    const updatedExpenses = [newExpense, ...expenses];
    setExpenses(updatedExpenses);
    localStorage.setItem(`${storageKey}_expenses`, JSON.stringify(updatedExpenses));
  };

  // Child Safety Check-In State
  interface ChildSafetyCheckIn {
    id: string;
    child_name: string;
    age: number;
    parent_name: string;
    parent_phone: string;
    security_code: string;
    check_in_time: string;
  }

  const [childSafetyLogs, setChildSafetyLogs] = useState<ChildSafetyCheckIn[]>(() => {
    try {
      const saved = localStorage.getItem(`child_safety_${event.id}`);
      return saved ? JSON.parse(saved) : [
        {
          id: 'cs_1',
          child_name: 'Emmanuel Taylor',
          age: 6,
          parent_name: 'Sarah Taylor',
          parent_phone: '+232 76 543 210',
          security_code: 'SAFE-CHILD-8392',
          check_in_time: '09:15 AM'
        }
      ];
    } catch (e) {
      return [];
    }
  });

  const [showChildCheckInModal, setShowChildCheckInModal] = useState(false);
  const [childName, setChildName] = useState('');
  const [childAge, setChildAge] = useState<number>(5);
  const [childParentName, setChildParentName] = useState('');
  const [childParentPhone, setChildParentPhone] = useState('');
  const [activeSafetyBadge, setActiveSafetyBadge] = useState<ChildSafetyCheckIn | null>(null);

  const handleAddChildCheckIn = (e: React.FormEvent) => {
    e.preventDefault();
    if (!childName || !childParentName) return;
    const randCode = Math.floor(1000 + Math.random() * 9000);
    const newRecord: ChildSafetyCheckIn = {
      id: `cs_${Date.now()}`,
      child_name: childName,
      age: childAge,
      parent_name: childParentName,
      parent_phone: childParentPhone,
      security_code: `SAFE-CHILD-${randCode}`,
      check_in_time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    const updated = [newRecord, ...childSafetyLogs];
    setChildSafetyLogs(updated);
    localStorage.setItem(`child_safety_${event.id}`, JSON.stringify(updated));
    setActiveSafetyBadge(newRecord);
    setChildName('');
    setChildParentName('');
    setChildParentPhone('');
    setShowChildCheckInModal(false);
  };

  // Live Stage Liturgy Timer State
  const [stageTimerActive, setStageTimerActive] = useState(false);
  const [stageTimeSeconds, setStageTimeSeconds] = useState<number>(1200); // 20 mins
  const [activeLiturgyIdx, setActiveLiturgyIdx] = useState<number>(0);

  useEffect(() => {
    let interval: any = null;
    if (stageTimerActive && stageTimeSeconds > 0) {
      interval = setInterval(() => {
        setStageTimeSeconds(prev => prev - 1);
      }, 1000);
    } else if (stageTimeSeconds === 0) {
      setStageTimerActive(false);
    }
  }, [stageTimerActive, stageTimeSeconds]);

  // Disburse Account Form State
  const [disburseAmount, setDisburseAmount] = useState<string>('1500');
  const [disburseChannel, setDisburseChannel] = useState<'church_treasury' | 'bank_wire' | 'mobile_money' | 'cash' | 'card'>('bank_wire');
  const [disbursePayee, setDisbursePayee] = useState('');
  const [disburseTxnRef, setDisburseTxnRef] = useState('');
  const [disburseNotes, setDisburseNotes] = useState('');

  // Sync Event Account on custom event or prop change
  useEffect(() => {
    const handleAccountSync = () => {
      setEventAccount(getEventAccount(event.id, event.title, event.recurring_funding_allowance || 15000));
    };
    window.addEventListener('event_accounts_updated', handleAccountSync);
    return () => window.removeEventListener('event_accounts_updated', handleAccountSync);
  }, [event.id, event.title, event.recurring_funding_allowance]);

  // Handler: Fund Event Account
  const handleFundEventAccount = (e: React.FormEvent) => {
    e.preventDefault();
    setAccountErrorMsg(null);
    const amt = Number(fundAmount);
    if (!amt || amt <= 0) {
      setAccountErrorMsg('Please specify a positive funding amount in SLE.');
      return;
    }
    try {
      fundEventAccount(
        event.id,
        amt,
        fundContributor || 'Church Treasury Board',
        fundSource,
        fundTxnRef,
        fundNotes,
        'Event Manager'
      );
      setEventAccount(getEventAccount(event.id, event.title, event.recurring_funding_allowance || 15000));
      setShowFundModal(false);
      setFundAmount('5000');
      setFundTxnRef('');
      setFundNotes('');
      setAccountSuccessMsg(`🎉 Successfully funded SLE ${amt.toLocaleString()} to ${eventAccount.account_number}!`);
      setTimeout(() => setAccountSuccessMsg(null), 5000);
      onRefreshData();
    } catch (err: any) {
      setAccountErrorMsg(err?.message || 'Error processing funding deposit');
    }
  };

  // Handler: Disburse / Spend from Event Account
  const handleDisburseEventAccount = (e: React.FormEvent) => {
    e.preventDefault();
    setAccountErrorMsg(null);
    const amt = Number(disburseAmount);
    if (!amt || amt <= 0) {
      setAccountErrorMsg('Please enter a positive disbursement amount in SLE.');
      return;
    }
    if (amt > (eventAccount.current_balance || 0)) {
      setAccountErrorMsg(`Insufficient event account balance! Available balance is SLE ${(eventAccount.current_balance || 0).toLocaleString()}.`);
      return;
    }
    if (!disbursePayee.trim()) {
      setAccountErrorMsg('Please enter the payee vendor or service provider name.');
      return;
    }
    try {
      disburseFromEventAccount(
        event.id,
        amt,
        disbursePayee,
        disburseChannel,
        disburseTxnRef,
        disburseNotes,
        'Event Manager'
      );
      setEventAccount(getEventAccount(event.id, event.title, event.recurring_funding_allowance || 15000));
      setShowDisburseModal(false);
      setDisburseAmount('1500');
      setDisbursePayee('');
      setDisburseTxnRef('');
      setDisburseNotes('');
      setAccountSuccessMsg(`✓ Successfully recorded vendor payout of SLE ${amt.toLocaleString()} to "${disbursePayee}"!`);
      setTimeout(() => setAccountSuccessMsg(null), 5000);
      onRefreshData();
    } catch (err: any) {
      setAccountErrorMsg(err?.message || 'Error recording disbursement');
    }
  };

  // Handler: Copy Account Funding Instructions
  const handleCopyFundingInfo = () => {
    const text = `FaithConnect Church - Dedicated Event Funding Details:
Event: ${event.title}
Recurrence: ${event.recurrence ? event.recurrence.toUpperCase() : 'ONE-TIME EVENT'}
Event Account No: ${eventAccount.account_number}
Account Name: ${eventAccount.account_name}
Bank: ${eventAccount.bank_name} (Acc: ${eventAccount.bank_account_number})
Mobile Money: ${eventAccount.mobile_money_merchant}
Donor Reference Code: ${eventAccount.donor_reference_code}
Currency: SLE`;

    navigator.clipboard?.writeText(text);
    setCopyCodeFeedback('Copied event banking & mobile money details to clipboard!');
    setTimeout(() => setCopyCodeFeedback(null), 4000);
  };

  // PDF Report Generator: Event Account Ledger & Audit Statement
  const downloadEventAccountStatementPDF = () => {
    const printWin = window.open('', '_blank');
    if (!printWin) return;
    const cp = getChurchProfile();

    const recBadge = getRecurrenceBadge(event.recurrence);
    const txns = eventAccount.transactions || [];

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>${cp.name} - Event Account Audit Statement (${eventAccount.account_number})</title>
          <style>
            body { font-family: system-ui, -apple-system, sans-serif; margin: 0; padding: 40px; color: #0f172a; background: #fff; }
            .header { border-bottom: 3px solid #1e1b4b; padding-bottom: 20px; margin-bottom: 25px; display: flex; justify-content: space-between; align-items: flex-start; }
            .logo { font-size: 24px; font-weight: 900; color: #1e1b4b; }
            .subtitle { font-size: 12px; color: #64748b; font-weight: 600; margin-top: 4px; }
            .badge { background: #e0e7ff; color: #3730a3; padding: 6px 14px; border-radius: 20px; font-size: 11px; font-weight: 800; text-transform: uppercase; }
            .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 25px; background: #f8fafc; padding: 18px; border-radius: 12px; border: 1px solid #e2e8f0; font-size: 12px; }
            .info-grid p { margin: 4px 0; }
            .cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 25px; }
            .card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px; }
            .card-lbl { font-size: 10px; font-weight: 800; text-transform: uppercase; color: #64748b; }
            .card-val { font-size: 18px; font-weight: 900; margin-top: 4px; }
            .card-green { color: #059669; }
            .card-red { color: #e11d48; }
            .card-indigo { color: #4338ca; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 30px; font-size: 12px; }
            th { background: #0b3866; text-align: left; padding: 10px 12px; font-size: 10px; font-weight: 800; text-transform: uppercase; color: #ffffff; border-bottom: 2px solid #0b3866; }
            td { padding: 10px 12px; border-bottom: 1px solid #e2e8f0; }
            tr:nth-child(even) td { background-color: #f8fafc; }
            .inflow { color: #059669; font-weight: 800; }
            .outflow { color: #e11d48; font-weight: 800; }
            .type-tag { padding: 2px 8px; border-radius: 6px; font-size: 10px; font-weight: 800; text-transform: uppercase; }
            .tag-dep { background: #dcfce7; color: #166534; }
            .tag-disb { background: #ffe4e6; color: #9f1239; }
            .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 50px; border-top: 2px dashed #cbd5e1; padding-top: 25px; font-size: 11px; }
            .line { border-bottom: 1px solid #94a3b8; height: 35px; margin-bottom: 6px; }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <div class="logo">${cp.name.toUpperCase()}</div>
              <div class="subtitle">Official Dedicated Event Account & Financial Treasury Ledger Statement</div>
            </div>
            <div style="text-align: right;">
              <span class="badge">${recBadge.icon} ${recBadge.label}</span>
              <div class="subtitle" style="margin-top: 8px;">Generated: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}</div>
            </div>
          </div>

          <div class="info-grid">
            <div>
              <p><strong>Event Title:</strong> ${event.title}</p>
              <p><strong>Account Number:</strong> <span style="font-family: monospace; font-weight: 800; color: #1e1b4b;">${eventAccount.account_number}</span></p>
              <p><strong>Dedicated Account Name:</strong> ${eventAccount.account_name}</p>
              <p><strong>Donor Reference Code:</strong> <span style="font-family: monospace; font-weight: 800;">${eventAccount.donor_reference_code}</span></p>
            </div>
            <div>
              <p><strong>Bank Details:</strong> ${eventAccount.bank_name} (Acc: ${eventAccount.bank_account_number})</p>
              <p><strong>Mobile Money Merchant:</strong> ${eventAccount.mobile_money_merchant}</p>
              <p><strong>Recurrence Cycle Schedule:</strong> ${event.recurrence_pattern || 'Scheduled Program Occurrence'}</p>
              <p><strong>Status:</strong> ACTIVE DEDICATED FUND</p>
            </div>
          </div>

          <div class="cards">
            <div class="card">
              <div class="card-lbl">Available Balance</div>
              <div class="card-val card-green">SLE ${eventAccount.current_balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
            </div>
            <div class="card">
              <div class="card-lbl">Target Budget / Cycle Allowance</div>
              <div class="card-val card-indigo">SLE ${(event.recurring_funding_allowance || eventAccount.target_budget).toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
            </div>
            <div class="card">
              <div class="card-lbl">Total Funds Deposited</div>
              <div class="card-val card-green">SLE ${eventAccount.total_funded.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
            </div>
            <div class="card">
              <div class="card-lbl">Total Funds Disbursed</div>
              <div class="card-val card-red">SLE ${eventAccount.total_disbursed.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
            </div>
          </div>

          <h3 style="font-size: 14px; margin-bottom: 10px; text-transform: uppercase; color: #1e293b;">
            Itemized Funding & Disbursement Transactions Ledger (${txns.length} records)
          </h3>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Contributor / Payee</th>
                <th>Channel</th>
                <th>Reference Code</th>
                <th>Purpose / Description</th>
                <th style="text-align: right;">Amount (SLE)</th>
              </tr>
            </thead>
            <tbody>
              ${txns.length === 0 ? '<tr><td colspan="7" style="text-align: center; color: #94a3b8; padding: 20px;">No transactions recorded yet in this event funding account.</td></tr>' : ''}
              ${txns.map(t => {
                const isDisb = t.type === 'disbursement';
                return `
                  <tr>
                    <td>${new Date(t.date).toLocaleDateString()}</td>
                    <td>
                      <span class="type-tag ${isDisb ? 'tag-disb' : 'tag-dep'}">
                        ${isDisb ? 'Disbursement' : t.type === 'treasury_allocation' ? 'Treasury Grant' : 'Deposit'}
                      </span>
                    </td>
                    <td><strong>${t.contributor_or_payee}</strong></td>
                    <td style="text-transform: capitalize;">${t.source_or_channel.replace('_', ' ')}</td>
                    <td style="font-family: monospace;">${t.transaction_ref || 'N/A'}</td>
                    <td>${t.notes || 'Official Event Allocation'}</td>
                    <td style="text-align: right;" class="${isDisb ? 'outflow' : 'inflow'}">
                      ${isDisb ? '-' : '+'} SLE ${t.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>

          <div class="signatures">
            <div>
              <div class="line"></div>
              <strong>Event Manager / Committee Chair</strong>
              <p style="color: #64748b; margin-top: 2px;">Name: ${event.organizer_name || 'Event Director'} | Signature & Date</p>
            </div>
            <div>
              <div class="line"></div>
              <strong>Church Treasury Controller / Finance Officer</strong>
              <p style="color: #64748b; margin-top: 2px;">Name: Finance Officer | Grace Cathedral Audit Office</p>
            </div>
          </div>

          <script>
            window.onload = function() {
              window.print();
            };
          </script>
        </body>
      </html>
    `;

    printWin.document.write(htmlContent);
    printWin.document.close();
  };

  // Handler: Reserve Physical Church Resource (Linked to Budget)
  const handleReserveResource = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedResourceId) return;

    const resource = churchResources.find(r => r.id === selectedResourceId);
    if (!resource) return;

    const qty = Number(reserveQty) || 1;
    const totalCost = resource.unit_rental_cost_sle * qty;

    const newResv: EventResourceReservation = {
      id: `resv_${Date.now()}`,
      event_id: event.id,
      event_title: event.title,
      resource_id: resource.id,
      resource_name: resource.name,
      category: resource.category,
      quantity_reserved: qty,
      rental_cost_sle: totalCost,
      status: 'confirmed',
      reserved_at: new Date().toISOString(),
      notes: reserveNotes.trim() || undefined
    };

    const allReservations = getEventResourceReservations();
    saveEventResourceReservations([newResv, ...allReservations]);
    setEventReservations(prev => [newResv, ...prev]);

    // Link directly to Event Budget Expenses
    if (totalCost > 0) {
      const newExp: EventExpense = {
        id: `exp_resv_${Date.now()}`,
        event_id: event.id,
        item_name: `Resource: ${resource.name} (${qty}x)`,
        category: resource.category,
        estimated_cost: totalCost,
        actual_cost: totalCost,
        status: 'planned'
      };
      const updatedExpenses = [newExp, ...expenses];
      setExpenses(updatedExpenses);

      // Persist to workspace storage
      try {
        const saved = localStorage.getItem(storageKey);
        const parsed = saved ? JSON.parse(saved) : {};
        localStorage.setItem(storageKey, JSON.stringify({ ...parsed, expenses: updatedExpenses }));
      } catch (err) {
        console.error("Failed saving expense link", err);
      }
    }

    setResourceSuccessMsg(`🎉 Reserved ${qty}x ${resource.name} (${totalCost.toLocaleString()} SLE linked to budget)!`);
    setShowReserveModal(false);
    setSelectedResourceId('');
    setReserveQty(1);
    setReserveNotes('');
    setTimeout(() => setResourceSuccessMsg(null), 5000);
  };

  // Handler: Cancel / Delete Resource Reservation (Unlinks from Budget)
  const handleCancelReservation = (resvId: string) => {
    const resv = eventReservations.find(r => r.id === resvId);
    if (!resv) return;

    if (!confirm(`Cancel reservation for ${resv.resource_name}? This will also remove its ${resv.rental_cost_sle.toLocaleString()} SLE cost from the event budget.`)) return;

    const allReservations = getEventResourceReservations();
    const updatedReservations = allReservations.filter(r => r.id !== resvId);
    saveEventResourceReservations(updatedReservations);
    setEventReservations(prev => prev.filter(r => r.id !== resvId));

    // Remove corresponding linked expense
    const updatedExpenses = expenses.filter(e => !e.item_name.includes(resv.resource_name));
    setExpenses(updatedExpenses);

    try {
      const saved = localStorage.getItem(storageKey);
      const parsed = saved ? JSON.parse(saved) : {};
      localStorage.setItem(storageKey, JSON.stringify({ ...parsed, expenses: updatedExpenses }));
    } catch (err) {
      console.error("Failed unlinking expense for cancelled reservation", err);
    }

    setResourceSuccessMsg(`Removed ${resv.resource_name} reservation and unlinked costs from Event Budget.`);
    setTimeout(() => setResourceSuccessMsg(null), 4000);
  };

  // Handler: Submit Post-Event Survey Feedback
  const handleSubmitSurveyFeedback = (e: React.FormEvent) => {
    e.preventDefault();
    if (!surveyFeedbackText.trim()) return;

    const sentiment: SurveyResponse['sentiment'] = 
      surveyOverall >= 4 ? 'Positive' : surveyOverall === 3 ? 'Neutral' : 'Constructive';

    const newResponse: SurveyResponse = {
      id: `resp_${Date.now()}`,
      survey_id: `surv_${event.id}`,
      event_id: event.id,
      respondent_name: surveyRespondentName.trim() || 'Anonymous Congregant',
      overall_rating: Number(surveyOverall),
      spiritual_impact_rating: Number(surveySpiritual),
      sound_media_rating: Number(surveySound),
      hospitality_rating: Number(surveyHospitality),
      feedback_text: surveyFeedbackText.trim(),
      submitted_at: new Date().toISOString(),
      sentiment
    };

    saveSurveyResponse(newResponse);
    reloadSurveyData();

    setSurveySuccessMsg("🎉 Thank you! Your feedback has been recorded into the Sentiment Summary.");
    setSurveyRespondentName('');
    setSurveyFeedbackText('');
    setTimeout(() => setSurveySuccessMsg(null), 4000);
  };

  const handleCopySurveyLink = () => {
    const link = `${window.location.origin}/survey/${event.id}`;
    navigator.clipboard.writeText(link);
    setSurveyCopyMsg("📋 Survey link copied to clipboard!");
    setTimeout(() => setSurveyCopyMsg(null), 3000);
  };

  // PDF Report Generator: Post-Event Sentiment Summary Statement
  const downloadSentimentReportPDF = () => {
    const summary = calculateSentimentSummary(event.id);
    const responses = getSurveyResponses(event.id);

    const printWin = window.open('', '_blank');
    if (!printWin) return;
    const cp = getChurchProfile();

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>${cp.name} - Post-Event Sentiment Report (${event.title})</title>
          <style>
            body { font-family: system-ui, -apple-system, sans-serif; margin: 0; padding: 40px; color: #0f172a; background: #fff; }
            .header { border-bottom: 3px solid #1e1b4b; padding-bottom: 20px; margin-bottom: 25px; display: flex; justify-content: space-between; align-items: flex-start; }
            .logo { font-size: 24px; font-weight: 900; color: #1e1b4b; }
            .subtitle { font-size: 12px; color: #64748b; font-weight: 600; margin-top: 4px; }
            .cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 25px; }
            .card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px; }
            .card-lbl { font-size: 10px; font-weight: 800; text-transform: uppercase; color: #64748b; }
            .card-val { font-size: 18px; font-weight: 900; margin-top: 4px; color: #4338ca; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 30px; font-size: 12px; }
            th { background: #f1f5f9; text-align: left; padding: 10px 12px; font-size: 10px; font-weight: 800; text-transform: uppercase; color: #475569; border-bottom: 2px solid #cbd5e1; }
            td { padding: 10px 12px; border-bottom: 1px solid #f1f5f9; }
            .tag-pos { background: #dcfce7; color: #166534; padding: 2px 8px; border-radius: 6px; font-weight: 800; font-size: 10px; }
            .tag-con { background: #fef3c7; color: #92400e; padding: 2px 8px; border-radius: 6px; font-weight: 800; font-size: 10px; }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <div class="logo">${cp.name.toUpperCase()}</div>
              <div class="subtitle">Post-Event Ministry Impact & Congregant Sentiment Audit</div>
            </div>
            <div style="text-align: right;">
              <strong style="color: #059669; font-size: 16px;">${summary.overall_sentiment_label.toUpperCase()}</strong>
              <div class="subtitle">Generated: ${new Date().toLocaleString()}</div>
            </div>
          </div>

          <h2 style="font-size: 18px; margin-bottom: 6px;">POST-EVENT CONGREGANT SENTIMENT SUMMARY REPORT</h2>
          <p style="font-size: 12px; color: #475569; margin-top: 0; margin-bottom: 20px;">
            Event: <strong>${event.title}</strong> • Category: ${event.category} • Date: ${new Date(event.start_time).toLocaleDateString()}
          </p>

          <div class="cards">
            <div class="card">
              <div class="card-lbl">Total Survey Responses</div>
              <div class="card-val">${summary.total_responses} Congregants</div>
            </div>
            <div class="card">
              <div class="card-lbl">Overall Experience Rating</div>
              <div class="card-val">⭐ ${summary.avg_overall_rating} / 5.0</div>
            </div>
            <div class="card">
              <div class="card-lbl">Spiritual Impact Rating</div>
              <div class="card-val">✝ ${summary.avg_spiritual_rating} / 5.0</div>
            </div>
            <div class="card">
              <div class="card-lbl">Positive Feedback Ratio</div>
              <div class="card-val" style="color: #059669;">${summary.positive_percentage}% Positive</div>
            </div>
          </div>

          <h3 style="font-size: 14px; margin-bottom: 10px;">Congregant Survey Feedback Roster</h3>
          <table>
            <thead>
              <tr>
                <th>Respondent</th>
                <th>Overall</th>
                <th>Spiritual Impact</th>
                <th>Sound & Media</th>
                <th>Feedback Notes & Key Highlights</th>
                <th>Sentiment</th>
              </tr>
            </thead>
            <tbody>
              ${responses.map(r => `
                <tr>
                  <td><strong>${r.respondent_name}</strong></td>
                  <td>⭐ ${r.overall_rating}/5</td>
                  <td>✝ ${r.spiritual_impact_rating}/5</td>
                  <td>🎵 ${r.sound_media_rating}/5</td>
                  <td><em>"${r.feedback_text}"</em></td>
                  <td><span class="${r.sentiment === 'Positive' ? 'tag-pos' : 'tag-con'}">${r.sentiment.toUpperCase()}</span></td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          <script>window.onload = function() { window.print(); }</script>
        </body>
      </html>
    `;

    printWin.document.write(htmlContent);
    printWin.document.close();
  };

  // QR Check-In Scanner State
  const [scanInput, setScanInput] = useState('');
  const [selectedScanRegId, setSelectedScanRegId] = useState('');
  const [scanSuccessMessage, setScanSuccessMessage] = useState<string | null>(null);
  const [scanErrorMessage, setScanErrorMessage] = useState<string | null>(null);
  const [isProcessingCheckIn, setIsProcessingCheckIn] = useState(false);
  const [passFilter, setPassFilter] = useState('');

  // Modals & Form Inputs
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [showExpenseModal, setShowExpenseModal] = useState(false);

  // Form State - Team Role
  const [roleTitle, setRoleTitle] = useState<EventRoleTitle>('Event Manager');
  const [roleMemberId, setRoleMemberId] = useState('');
  const [roleCustomName, setRoleCustomName] = useState('');
  const [rolePhone, setRolePhone] = useState('');
  const [roleEmail, setRoleEmail] = useState('');

  // Form State - Task
  const [taskTitle, setTaskTitle] = useState('');
  const [taskAssignee, setTaskAssignee] = useState('');
  const [taskDueDate, setTaskDueDate] = useState('');

  // Form State - Schedule / Run of Show
  const [schedTimeSlot, setSchedTimeSlot] = useState('');
  const [schedTitle, setSchedTitle] = useState('');
  const [schedMinister, setSchedMinister] = useState('');
  const [schedNotes, setSchedNotes] = useState('');

  // Form State - Budget / Expense
  const [expName, setExpName] = useState('');
  const [expCategory, setExpCategory] = useState('Logistics');
  const [expEstCost, setExpEstCost] = useState<number>(100);
  const [expActCost, setExpActCost] = useState<number>(100);
  const [expStatus, setExpStatus] = useState<'planned' | 'paid' | 'pending'>('planned');

  // Funding Request State (Submit Event Funding to Finance Officer)
  const [showFundingModal, setShowFundingModal] = useState(false);
  const [fundingTitle, setFundingTitle] = useState('');
  const [fundingNotes, setFundingNotes] = useState('');
  const [fundingPriority, setFundingPriority] = useState<'low' | 'medium' | 'high' | 'urgent'>('high');
  const [fundingDisbursementMethod, setFundingDisbursementMethod] = useState<'bank_transfer' | 'mobile_money' | 'cash'>('mobile_money');
  const [fundingAccountInfo, setFundingAccountInfo] = useState('');
  const [fundingRequestSuccess, setFundingRequestSuccess] = useState<string | null>(null);

  // Closeout Report State
  const [reportRevenue, setReportRevenue] = useState<number>(15000);
  const [reportNotes, setReportNotes] = useState<string>('');
  const [reportSoulsSaved, setReportSoulsSaved] = useState<number>(12);
  const [reportRecommendations, setReportRecommendations] = useState<string>('');
  const [reportSavedMessage, setReportSavedMessage] = useState<string | null>(null);

  // Multi-Item Proforma Invoice Builder & Printer State
  const [showProformaModal, setShowProformaModal] = useState(false);
  const [proformaItems, setProformaItems] = useState<ProformaLineItem[]>([]);
  const [proformaNotes, setProformaNotes] = useState<string>('Proforma Invoice submitted for event budget authorization prior to disbursement. Terms: Net 30 upon approval.');
  const [proformaInvoiceNo, setProformaInvoiceNo] = useState<string>(`INV-EVT-2026-${Math.floor(100 + Math.random() * 900)}`);
  const [proformaDate, setProformaDate] = useState<string>(new Date().toISOString().split('T')[0]);

  // Automated Budget Approval State
  const [budgetApproval, setBudgetApproval] = useState<EventBudgetApproval | null>(getEventBudgetApproval(event.id));

  const reloadBudgetApproval = () => {
    const app = getEventBudgetApproval(event.id);
    setBudgetApproval(app);
    if (app) {
      if (app.invoice_number) setProformaInvoiceNo(app.invoice_number);
      if (app.invoice_date) setProformaDate(app.invoice_date);
      if (app.notes) setProformaNotes(app.notes);
      if (app.items_breakdown && app.items_breakdown.length > 0) {
        setProformaItems(app.items_breakdown);
      }
    }
  };

  useEffect(() => {
    reloadBudgetApproval();
    const handleBudgetUpdate = () => reloadBudgetApproval();
    window.addEventListener('event_budgets_updated', handleBudgetUpdate);
    return () => window.removeEventListener('event_budgets_updated', handleBudgetUpdate);
  }, [event.id]);

  const handleOpenProformaBuilder = () => {
    const currentApproval = getEventBudgetApproval(event.id);
    if (currentApproval && currentApproval.items_breakdown && currentApproval.items_breakdown.length > 0) {
      setProformaItems(currentApproval.items_breakdown);
      setProformaInvoiceNo(currentApproval.invoice_number || `INV-EVT-2026-${Math.floor(100 + Math.random() * 900)}`);
      if (currentApproval.notes) setProformaNotes(currentApproval.notes);
    } else if (expenses && expenses.length > 0) {
      const converted: ProformaLineItem[] = expenses.map((e, idx) => ({
        id: e.id || `line_${idx}_${Date.now()}`,
        description: e.item_name,
        quantity: 1,
        unit_price: e.estimated_cost || 100,
        total_price: e.estimated_cost || 100,
        category: e.category
      }));
      setProformaItems(converted);
    } else {
      setProformaItems([
        { id: `p_${Date.now()}_1`, description: 'Wireless Microphones & PA Sound System Rental', quantity: 2, unit_price: 2500, total_price: 5000, category: 'Sound' },
        { id: `p_${Date.now()}_2`, description: 'Sanctuary Hall Floral & Banner Stage Decoration', quantity: 1, unit_price: 3500, total_price: 3500, category: 'Decoration' },
        { id: `p_${Date.now()}_3`, description: 'Guest Revival Minister Honorarium & Hospitality', quantity: 1, unit_price: 4500, total_price: 4500, category: 'Honorarium' }
      ]);
    }
    setShowProformaModal(true);
  };

  const handleAddProformaRow = () => {
    setProformaItems(prev => [
      ...prev,
      {
        id: `item_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
        description: '',
        quantity: 1,
        unit_price: 0,
        total_price: 0,
        category: 'General'
      }
    ]);
  };

  const handleUpdateProformaRow = (id: string, field: keyof ProformaLineItem, value: any) => {
    setProformaItems(prev => prev.map(item => {
      if (item.id === id) {
        const updated = { ...item, [field]: value };
        if (field === 'quantity' || field === 'unit_price') {
          const q = Number(field === 'quantity' ? value : item.quantity) || 0;
          const p = Number(field === 'unit_price' ? value : item.unit_price) || 0;
          updated.total_price = q * p;
        }
        return updated;
      }
      return item;
    }));
  };

  const handleDeleteProformaRow = (id: string) => {
    setProformaItems(prev => prev.filter(item => item.id !== id));
  };

  const handleLoadStandardTemplate = () => {
    setProformaItems([
      { id: `tpl_1_${Date.now()}`, description: 'Professional PA Sound System & Wireless Mics Rental', quantity: 1, unit_price: 5000, total_price: 5000, category: 'Sound' },
      { id: `tpl_2_${Date.now()}`, description: 'Sanctuary Stage Lighting & Floral Backdrop Setup', quantity: 1, unit_price: 3500, total_price: 3500, category: 'Decoration' },
      { id: `tpl_3_${Date.now()}`, description: 'Guest Revival Speaker Honorarium & Accommodation', quantity: 1, unit_price: 4500, total_price: 4500, category: 'Honorarium' },
      { id: `tpl_4_${Date.now()}`, description: 'Catering, Banquet Refreshments & Water for Volunteers', quantity: 150, unit_price: 20, total_price: 3000, category: 'Catering' },
      { id: `tpl_5_${Date.now()}`, description: 'Event Printing: Banners, Program Booklets & Flyers', quantity: 200, unit_price: 15, total_price: 3000, category: 'Media' }
    ]);
  };

  const handleSaveAndSubmitProforma = () => {
    const validItems = proformaItems.filter(i => i.description.trim() !== '');
    const grandTotal = validItems.reduce((sum, item) => sum + (item.total_price || 0), 0);
    
    const result = submitEventBudgetForApproval(
      event.id,
      event.title,
      grandTotal > 0 ? grandTotal : 1000,
      event.organizer_name || 'Event Manager',
      validItems,
      proformaNotes,
      proformaInvoiceNo
    );

    const syncedExpenses: EventExpense[] = validItems.map(i => ({
      id: `exp_${i.id}`,
      event_id: event.id,
      item_name: i.description,
      category: i.category || 'Event Expense',
      estimated_cost: i.total_price,
      actual_cost: i.total_price,
      status: 'planned'
    }));
    setExpenses(syncedExpenses);

    try {
      const saved = localStorage.getItem(storageKey);
      const parsed = saved ? JSON.parse(saved) : {};
      localStorage.setItem(storageKey, JSON.stringify({ ...parsed, expenses: syncedExpenses }));
    } catch (err) {
      console.error("Failed saving synced expenses", err);
    }

    setBudgetApproval(result);
    setFundingRequestSuccess(`🎉 Proforma Invoice #${result.invoice_number} with ${validItems.length} items submitted to Finance Officer for approval!`);
    setShowProformaModal(false);
    setTimeout(() => setFundingRequestSuccess(null), 5000);
  };

  const handleSubmitBudgetForFinanceApproval = () => {
    handleOpenProformaBuilder();
  };

  // PDF Print Generator: Official Proforma Invoice matching sample design
  const downloadProformaInvoicePDF = () => {
    const validItems = proformaItems.filter(i => i.description.trim() !== '');
    const subTotal = validItems.reduce((sum, item) => sum + (item.total_price || 0), 0);

    const printWin = window.open('', '_blank');
    if (!printWin) return;

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Proforma Invoice ${proformaInvoiceNo} - ${event.title}</title>
          <style>
            @page { size: A4; margin: 0; }
            body { 
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; 
              margin: 0; 
              padding: 0; 
              color: #1e293b; 
              background: #ffffff;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            .invoice-wrapper {
              width: 100%;
              max-width: 800px;
              margin: 0 auto;
              background: #ffffff;
              box-sizing: border-box;
            }
            .header-banner {
              background: linear-gradient(135deg, #0b3866 0%, #0f4c81 50%, #002060 100%);
              color: #ffffff;
              padding: 36px 48px 30px 48px;
              border-bottom-left-radius: 60px 24px;
              border-bottom-right-radius: 60px 24px;
              display: flex;
              justify-content: space-between;
              align-items: flex-start;
            }
            .invoice-title {
              font-size: 34px;
              font-weight: 900;
              letter-spacing: 2px;
              margin: 0;
              text-transform: uppercase;
            }
            .invoice-number {
              font-size: 14px;
              font-weight: 800;
              letter-spacing: 1px;
              text-align: right;
              opacity: 0.95;
              margin-top: 6px;
            }
            .body-padding {
              padding: 28px 48px 12px 48px;
            }
            .meta-grid {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 24px;
              margin-bottom: 20px;
            }
            .meta-box h4 {
              font-size: 13px;
              font-weight: 800;
              color: #0f172a;
              margin: 0 0 6px 0;
              text-transform: uppercase;
              letter-spacing: 0.5px;
            }
            .meta-box p {
              font-size: 13px;
              color: #475569;
              margin: 2px 0;
              line-height: 1.5;
            }
            .date-row {
              font-size: 13px;
              color: #334155;
              font-weight: 600;
              margin-bottom: 20px;
            }
            table.items-table {
              width: 100%;
              border-collapse: collapse;
              margin-bottom: 20px;
            }
            table.items-table th {
              background-color: #0b3866 !important;
              color: #ffffff !important;
              font-size: 12px;
              font-weight: 800;
              text-align: left;
              padding: 10px 14px;
              border: 1px solid #0b3866;
              text-transform: uppercase;
              letter-spacing: 0.5px;
            }
            table.items-table td {
              padding: 10px 14px;
              font-size: 13px;
              color: #334155;
              border: 1px solid #cbd5e1;
            }
            table.items-table tr:nth-child(even) td {
              background-color: #f8fafc;
            }
            .col-desc { width: 50%; }
            .col-qty { width: 12%; text-align: center; }
            .col-price { width: 18%; text-align: right; }
            .col-total { width: 20%; text-align: right; font-weight: 700; }
            
            .subtotal-container {
              display: flex;
              justify-content: flex-end;
              margin-bottom: 20px;
            }
            .subtotal-box {
              background-color: #0b3866 !important;
              color: #ffffff !important;
              padding: 8px 20px;
              border-radius: 4px;
              display: flex;
              justify-content: space-between;
              align-items: center;
              width: 280px;
              font-size: 14px;
              font-weight: 800;
            }
            .notes-section {
              margin-bottom: 16px;
            }
            .notes-section h5 {
              font-size: 13px;
              font-weight: 800;
              color: #1e293b;
              margin: 0 0 4px 0;
            }
            .notes-lines {
              font-size: 12px;
              color: #64748b;
              border-bottom: 1px dashed #cbd5e1;
              padding-bottom: 8px;
              line-height: 1.5;
            }
            .footer-section {
              padding: 16px 48px 32px 48px;
              border-top: 1px dashed #e2e8f0;
              display: flex;
              justify-content: space-between;
              align-items: flex-end;
            }
            .payment-info h5 {
              font-size: 13px;
              font-weight: 800;
              color: #1e293b;
              margin: 0 0 4px 0;
            }
            .payment-info p {
              font-size: 12px;
              color: #475569;
              margin: 2px 0;
            }
            .thank-you {
              font-size: 28px;
              font-weight: 800;
              color: #1e293b;
              font-style: italic;
              letter-spacing: -0.5px;
            }
          </style>
        </head>
        <body>
          <div class="invoice-wrapper">
            <div>
              <div class="header-banner">
                <div>
                  <h1 class="invoice-title">INVOICE</h1>
                </div>
                <div class="invoice-number">
                  NO: ${proformaInvoiceNo}
                </div>
              </div>

              <div class="body-padding">
                <div class="meta-grid">
                  <div class="meta-box">
                    <h4>Bill To:</h4>
                    <p><strong>${getChurchProfile().name} Treasury</strong></p>
                    <p>Finance & Accounts Division</p>
                    <p>${getChurchProfile().address}</p>
                    <p>${getChurchProfile().phone} • ${getChurchProfile().email}</p>
                  </div>
                  <div class="meta-box" style="text-align: right;">
                    <h4>From:</h4>
                    <p><strong>${event.organizer_name || 'Event Manager'}</strong></p>
                    <p>Department / Event: <strong>${event.title}</strong></p>
                    <p>Category: ${event.category}</p>
                  </div>
                </div>

                <div class="date-row">
                  Date: <strong>${proformaDate || new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</strong>
                </div>

                <table class="items-table">
                  <thead>
                    <tr>
                      <th class="col-desc">Description</th>
                      <th class="col-qty">Qty</th>
                      <th class="col-price">Price</th>
                      <th class="col-total">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${validItems.map(item => `
                      <tr>
                        <td class="col-desc">${item.description}</td>
                        <td class="col-qty">${item.quantity}</td>
                        <td class="col-price">SLE ${(item.unit_price || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                        <td class="col-total">SLE ${(item.total_price || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                      </tr>
                    `).join('')}
                    ${validItems.length === 0 ? `
                      <tr>
                        <td colSpan="4" style="text-align: center; color: #94a3b8; font-style: italic;">No line items provided.</td>
                      </tr>
                    ` : ''}
                  </tbody>
                </table>

                <div class="subtotal-container">
                  <div class="subtotal-box">
                    <span>Sub Total</span>
                    <span>SLE ${subTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                  </div>
                </div>

                <div class="notes-section">
                  <h5>Note:</h5>
                  <div class="notes-lines">
                    ${proformaNotes || 'Proforma Invoice submitted for event budget authorization prior to disbursement. Terms: Net 30.'}
                  </div>
                </div>
              </div>
            </div>

            <div class="footer-section">
              <div class="payment-info">
                <h5>Payment Information:</h5>
                <p><strong>Bank:</strong> Grace Cathedral Treasury Bank</p>
                <p><strong>No Bank:</strong> 123-456-7890-SLE</p>
                <p><strong>Email:</strong> finance@gracecathedral.org</p>
              </div>
              <div class="thank-you">
                Thank You!
              </div>
            </div>
          </div>

          <script>
            window.onload = function() {
              window.print();
            };
          </script>
        </body>
      </html>
    `;

    printWin.document.write(htmlContent);
    printWin.document.close();
  };

  // Manual Attendance Check-In Handler (Present / Absent)
  const handleManualCheckIn = async (regId: string, status: 'checked_in' | 'absent') => {
    try {
      const { error } = await supabase
        .from('event_registrations')
        .update({ 
          status, 
          checked_in_at: status === 'checked_in' ? new Date().toISOString() : null 
        })
        .eq('id', regId);

      if (error) throw error;
      onRefreshData();
    } catch (e: any) {
      console.error("Attendance update error:", e);
    }
  };

  // PDF Report Generator: Budget vs Actual Expenses Variance Report
  const downloadBudgetVsActualPDF = () => {
    const totalEst = expenses.reduce((acc, curr) => acc + (curr.estimated_cost || 0), 0);
    const totalAct = expenses.reduce((acc, curr) => acc + (curr.actual_cost || 0), 0);
    const varianceTotal = totalEst - totalAct;
    const utilizationRate = totalEst > 0 ? Math.round((totalAct / totalEst) * 100) : 100;

    const printWin = window.open('', '_blank');
    if (!printWin) return;
    const cp = getChurchProfile();

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>${cp.name} - Budget vs Actual Report (${event.title})</title>
          <style>
            body { font-family: system-ui, -apple-system, sans-serif; margin: 0; padding: 40px; color: #0f172a; background: #fff; }
            .header { border-bottom: 3px solid #1e1b4b; padding-bottom: 20px; margin-bottom: 25px; display: flex; justify-content: space-between; align-items: flex-start; }
            .logo { font-size: 24px; font-weight: 900; color: #1e1b4b; }
            .subtitle { font-size: 12px; color: #64748b; font-weight: 600; margin-top: 4px; }
            .badge { background: #dcfce7; color: #166534; padding: 6px 14px; border-radius: 20px; font-size: 11px; font-weight: 800; text-transform: uppercase; }
            .cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 25px; }
            .card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px; }
            .card-lbl { font-size: 10px; font-weight: 800; text-transform: uppercase; color: #64748b; }
            .card-val { font-size: 18px; font-weight: 900; margin-top: 4px; }
            .under { color: #059669; }
            .over { color: #e11d48; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 30px; font-size: 12px; }
            th { background: #f1f5f9; text-align: left; padding: 10px 12px; font-size: 10px; font-weight: 800; text-transform: uppercase; color: #475569; border-bottom: 2px solid #cbd5e1; }
            td { padding: 10px 12px; border-bottom: 1px solid #f1f5f9; }
            .status-under { background: #dcfce7; color: #166534; padding: 2px 8px; border-radius: 6px; font-size: 10px; font-weight: 800; }
            .status-over { background: #ffe4e6; color: #9f1239; padding: 2px 8px; border-radius: 6px; font-size: 10px; font-weight: 800; }
            .status-target { background: #f1f5f9; color: #475569; padding: 2px 8px; border-radius: 6px; font-size: 10px; font-weight: 800; }
            .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 50px; border-top: 2px dashed #e2e8f0; padding-top: 25px; font-size: 11px; }
            .line { border-bottom: 1px solid #94a3b8; height: 35px; margin-bottom: 6px; }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <div class="logo">${cp.name.toUpperCase()}</div>
              <div class="subtitle">Treasury Governance & Event Lifecycle Financial Audit Statement</div>
            </div>
            <div style="text-align: right;">
              <span class="badge">${budgetApproval?.status ? budgetApproval.status.toUpperCase() : 'APPROVED'} BUDGET</span>
              <div class="subtitle" style="margin-top: 8px;">Date: ${new Date().toLocaleDateString()}</div>
            </div>
          </div>

          <h2 style="font-size: 18px; margin-bottom: 6px;">BUDGETED EXPENSES VS ACTUAL COSTS REPORT</h2>
          <p style="font-size: 12px; color: #475569; margin-top: 0; margin-bottom: 20px;">
            Event: <strong>${event.title}</strong> (${event.category}) • Location: ${event.location}
          </p>

          <div class="cards">
            <div class="card">
              <div class="card-lbl">Total Estimated Budget</div>
              <div class="card-val">${totalEst.toLocaleString()} SLE</div>
            </div>
            <div class="card">
              <div class="card-lbl">Total Actual Cost Incurred</div>
              <div class="card-val">${totalAct.toLocaleString()} SLE</div>
            </div>
            <div class="card">
              <div class="card-lbl">Net Variance (Budget - Actual)</div>
              <div class="card-val ${varianceTotal >= 0 ? 'under' : 'over'}">
                ${varianceTotal >= 0 ? `+${varianceTotal.toLocaleString()}` : varianceTotal.toLocaleString()} SLE
              </div>
            </div>
            <div class="card">
              <div class="card-lbl">Budget Efficiency Index</div>
              <div class="card-val ${utilizationRate <= 100 ? 'under' : 'over'}">${utilizationRate}% Utilized</div>
            </div>
          </div>

          <h3 style="font-size: 14px; margin-bottom: 10px;">Itemized Budget vs Actual Costs Ledger</h3>
          <table>
            <thead>
              <tr>
                <th>Expense Item Name</th>
                <th>Category</th>
                <th style="text-align: right;">Estimated (SLE)</th>
                <th style="text-align: right;">Actual (SLE)</th>
                <th style="text-align: right;">Variance (SLE)</th>
                <th style="text-align: center;">Variance Status</th>
              </tr>
            </thead>
            <tbody>
              ${expenses.map(e => {
                const varAmt = (e.estimated_cost || 0) - (e.actual_cost || 0);
                const varClass = varAmt > 0 ? 'status-under' : varAmt < 0 ? 'status-over' : 'status-target';
                const varLabel = varAmt > 0 ? 'UNDER BUDGET' : varAmt < 0 ? 'OVER BUDGET' : 'ON TARGET';
                return `
                  <tr>
                    <td><strong>${e.item_name}</strong></td>
                    <td>${e.category}</td>
                    <td style="text-align: right;">${(e.estimated_cost || 0).toLocaleString()} SLE</td>
                    <td style="text-align: right;"><strong>${(e.actual_cost || 0).toLocaleString()} SLE</strong></td>
                    <td style="text-align: right; color: ${varAmt >= 0 ? '#059669' : '#e11d48'}; font-weight: 800;">
                      ${varAmt >= 0 ? `+${varAmt.toLocaleString()}` : varAmt.toLocaleString()}
                    </td>
                    <td style="text-align: center;"><span class="${varClass}">${varLabel}</span></td>
                  </tr>
                `;
              }).join('')}
              <tr style="background: #f8fafc; font-weight: 900; border-top: 2px solid #cbd5e1;">
                <td colSpan="2">TOTALlifecycle AGGREGATE</td>
                <td style="text-align: right;">${totalEst.toLocaleString()} SLE</td>
                <td style="text-align: right;">${totalAct.toLocaleString()} SLE</td>
                <td style="text-align: right; color: ${varianceTotal >= 0 ? '#059669' : '#e11d48'}; font-weight: 900;">
                  ${varianceTotal >= 0 ? `+${varianceTotal.toLocaleString()}` : varianceTotal.toLocaleString()}
                </td>
                <td style="text-align: center;">
                  <span class="${varianceTotal >= 0 ? 'status-under' : 'status-over'}">
                    ${varianceTotal >= 0 ? 'NET SAVINGS' : 'OVER BUDGET'}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>

          <div class="signatures">
            <div>
              <div class="line"></div>
              <strong>Prepared By: Event Manager</strong>
              <div style="color: #64748b;">Event Operations Lead</div>
            </div>
            <div>
              <div class="line"></div>
              <strong>Approved By: Finance Officer</strong>
              <div style="color: #64748b;">Grace Cathedral Treasury Board</div>
            </div>
          </div>

          <script>window.onload = function() { window.print(); }</script>
        </body>
      </html>
    `;

    printWin.document.write(htmlContent);
    printWin.document.close();
  };

  // PDF Report Generator: Attendance Summary Statement
  const downloadAttendanceReportPDF = () => {
    const evtRegistrations = registrations.filter(r => r.event_id === event.id);
    const presentCount = evtRegistrations.filter(r => (r.status === 'checked_in' || r.status === 'attended')).length;
    const absentCount = evtRegistrations.filter(r => r.status === 'absent').length;
    const unconfirmedCount = evtRegistrations.length - (presentCount + absentCount);
    const attendanceRate = evtRegistrations.length > 0 ? Math.round((presentCount / evtRegistrations.length) * 100) : 100;

    const printWin = window.open('', '_blank');
    if (!printWin) return;
    const cp = getChurchProfile();

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>${cp.name} - Sanctuary Attendance Summary (${event.title})</title>
          <style>
            body { font-family: system-ui, -apple-system, sans-serif; margin: 0; padding: 40px; color: #0f172a; background: #fff; }
            .header { border-bottom: 3px solid #1e1b4b; padding-bottom: 20px; margin-bottom: 25px; display: flex; justify-content: space-between; align-items: flex-start; }
            .logo { font-size: 24px; font-weight: 900; color: #1e1b4b; }
            .subtitle { font-size: 12px; color: #64748b; font-weight: 600; margin-top: 4px; }
            .cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 25px; }
            .card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px; }
            .card-lbl { font-size: 10px; font-weight: 800; text-transform: uppercase; color: #64748b; }
            .card-val { font-size: 18px; font-weight: 900; margin-top: 4px; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 30px; font-size: 12px; }
            th { background: #f1f5f9; text-align: left; padding: 10px 12px; font-size: 10px; font-weight: 800; text-transform: uppercase; color: #475569; border-bottom: 2px solid #cbd5e1; }
            td { padding: 10px 12px; border-bottom: 1px solid #f1f5f9; }
            .badge-present { background: #dcfce7; color: #166534; padding: 3px 10px; border-radius: 6px; font-weight: 800; font-size: 10px; }
            .badge-absent { background: #ffe4e6; color: #9f1239; padding: 3px 10px; border-radius: 6px; font-weight: 800; font-size: 10px; }
            .badge-pending { background: #fef3c7; color: #92400e; padding: 3px 10px; border-radius: 6px; font-weight: 800; font-size: 10px; }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <div class="logo">${cp.name.toUpperCase()}</div>
              <div class="subtitle">Sanctuary Attendance & Member Participation Statement</div>
            </div>
            <div style="text-align: right;">
              <strong style="color: #4338ca; font-size: 16px;">${attendanceRate}% ATTENDANCE RATE</strong>
              <div class="subtitle">Generated: ${new Date().toLocaleString()}</div>
            </div>
          </div>

          <h2 style="font-size: 18px; margin-bottom: 6px;">SANCTUARY ATTENDANCE SUMMARY REPORT</h2>
          <p style="font-size: 12px; color: #475569; margin-top: 0; margin-bottom: 20px;">
            Event: <strong>${event.title}</strong> • Target Audience: ${event.target_audience || 'All Congregation'} • Location: ${event.location}
          </p>

          <div class="cards">
            <div class="card">
              <div class="card-lbl">Total Registered RSVPs</div>
              <div class="card-val">${evtRegistrations.length} Congregants</div>
            </div>
            <div class="card">
              <div class="card-lbl">Total Checked-In (Present)</div>
              <div class="card-val" style="color: #059669;">${presentCount} Present</div>
            </div>
            <div class="card">
              <div class="card-lbl">Total Marked Absent</div>
              <div class="card-val" style="color: #e11d48;">${absentCount} Absent</div>
            </div>
            <div class="card">
              <div class="card-lbl">Sanctuary Attendance Rate</div>
              <div class="card-val" style="color: #4338ca;">${attendanceRate}% Rate</div>
            </div>
          </div>

          <h3 style="font-size: 14px; margin-bottom: 10px;">Congregant Door Attendance Roster</h3>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Congregant Member Name</th>
                <th>Contact Email / Phone</th>
                <th>RSVP Timestamp</th>
                <th>Door Attendance Status</th>
              </tr>
            </thead>
            <tbody>
              ${evtRegistrations.map((r, idx) => `
                <tr>
                  <td><strong>${idx + 1}</strong></td>
                  <td><strong>${r.member_name}</strong></td>
                  <td>${r.email} ${r.phone ? `• ${r.phone}` : ''}</td>
                  <td>${new Date(r.registered_at).toLocaleDateString()}</td>
                  <td>
                    <span class="${r.status === 'checked_in' ? 'badge-present' : r.status === 'absent' ? 'badge-absent' : 'badge-pending'}">
                      ${r.status === 'checked_in' ? 'PRESENT (CHECKED IN)' : r.status === 'absent' ? 'ABSENT' : 'REGISTERED (PENDING)'}
                    </span>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          <script>window.onload = function() { window.print(); }</script>
        </body>
      </html>
    `;

    printWin.document.write(htmlContent);
    printWin.document.close();
  };

  // Load Saved Workspace Data or Initialize Defaults
  useEffect(() => {
    let hasLoadedSaved = false;
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.roles) setRoles(parsed.roles);
        if (parsed.tasks) setTasks(parsed.tasks);
        if (parsed.schedule) setSchedule(parsed.schedule);
        if (parsed.expenses) setExpenses(parsed.expenses);
        hasLoadedSaved = true;
      }
    } catch (e) {
      console.error("Failed to load workspace storage", e);
    }

    if (!hasLoadedSaved) {
      // Default Agenda / Run of Show according to Event Category
      let defaultSched: EventScheduleItem[] = [];
      if (event.category === 'Worship Service' || event.category === 'Special Service') {
        defaultSched = [
          { id: '1', event_id: event.id, time_slot: '09:00 AM - 09:15 AM', activity_title: 'Opening Prayer & Devotion', leader_or_minister: 'Prayer Team Lead', notes: 'Sanctuary doors open' },
          { id: '2', event_id: event.id, time_slot: '09:15 AM - 09:45 AM', activity_title: 'Praise & High Worship', leader_or_minister: 'Grace Choir & Band', notes: 'Live stream starts' },
          { id: '3', event_id: event.id, time_slot: '09:45 AM - 10:00 AM', activity_title: 'Welcome, Announcements & Offering', leader_or_minister: 'Pastoral Team', notes: 'Tithes & Thanksgiving' },
          { id: '4', event_id: event.id, time_slot: '10:00 AM - 10:50 AM', activity_title: 'The Prophetic Word & Sermon', leader_or_minister: 'Resident Pastor / Guest Speaker', notes: 'Keynote Message' },
          { id: '5', event_id: event.id, time_slot: '10:50 AM - 11:00 AM', activity_title: 'Altar Call & Benediction', leader_or_minister: 'Senior Pastor', notes: 'First timers reception' }
        ];
      } else if (event.category === 'Conference' || event.category === 'Youth Event') {
        defaultSched = [
          { id: '1', event_id: event.id, time_slot: '08:30 AM - 09:30 AM', activity_title: 'Delegate Registration & Welcome Coffee', leader_or_minister: 'Ushering & Registration Team', notes: 'Collect badge & kit' },
          { id: '2', event_id: event.id, time_slot: '09:30 AM - 10:30 AM', activity_title: 'Keynote Session 1: Empowered for Impact', leader_or_minister: 'Conference Director', notes: 'Plenary Hall' },
          { id: '3', event_id: event.id, time_slot: '10:45 AM - 12:00 PM', activity_title: 'Breakout Workshops & Panel Discussion', leader_or_minister: 'Youth & Ministry Leads', notes: 'Rooms A, B & C' },
          { id: '4', event_id: event.id, time_slot: '12:30 PM - 01:30 PM', activity_title: 'Fellowship Lunch & Networking', leader_or_minister: 'Catering Committee', notes: 'Main Courtyard' }
        ];
      } else {
        defaultSched = [
          { id: '1', event_id: event.id, time_slot: '10:00 AM', activity_title: 'Opening Prayer & Introduction', leader_or_minister: event.organizer_name || 'Ministry Leader', notes: '' },
          { id: '2', event_id: event.id, time_slot: '10:15 AM', activity_title: 'Main Program / Agenda Presentation', leader_or_minister: 'Department Lead', notes: '' },
          { id: '3', event_id: event.id, time_slot: '11:30 AM', activity_title: 'Q&A, Action Items & Closing', leader_or_minister: 'All Members', notes: '' }
        ];
      }

      const defaultTasks: EventTask[] = [
        { id: 't1', event_id: event.id, title: 'Confirm sanctuary audio-visual equipment & mics', assignee_name: 'Media Lead', status: 'completed' },
        { id: 't2', event_id: event.id, title: 'Print program bulletins and QR entry passes', assignee_name: 'Ushering Team', status: 'in_progress' },
        { id: 't3', event_id: event.id, title: 'Send SMS & Email reminder to registered congregants', assignee_name: 'Admin Team', status: 'todo' }
      ];

      const defaultExpenses: EventExpense[] = [
        { id: 'e1', event_id: event.id, item_name: 'Sound System & Microphone Rentals', category: 'Media & Tech', estimated_cost: 250, actual_cost: 250, status: 'paid' },
        { id: 'e2', event_id: event.id, item_name: 'Refreshments & Volunteer Meals', category: 'Catering', estimated_cost: 150, actual_cost: 140, status: 'paid' },
        { id: 'e3', event_id: event.id, item_name: 'Flyers & Banner Printing', category: 'Publicity', estimated_cost: 100, actual_cost: 95, status: 'paid' }
      ];

      setSchedule(defaultSched);
      setTasks(defaultTasks);
      setExpenses(defaultExpenses);
    }

    try {
      const savedRep = localStorage.getItem(reportStorageKey);
      if (savedRep) {
        const parsedRep = JSON.parse(savedRep);
        if (parsedRep.reportRevenue !== undefined) setReportRevenue(parsedRep.reportRevenue);
        if (parsedRep.reportNotes !== undefined) setReportNotes(parsedRep.reportNotes);
        if (parsedRep.reportSoulsSaved !== undefined) setReportSoulsSaved(parsedRep.reportSoulsSaved);
        if (parsedRep.reportRecommendations !== undefined) setReportRecommendations(parsedRep.reportRecommendations);
      }
    } catch (e) {
      console.error("Failed to load report storage", e);
    }
  }, [storageKey, reportStorageKey, event.id, event.category, event.organizer_name]);

  const handleSaveCloseoutReport = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        reportRevenue: Number(reportRevenue) || 0,
        reportNotes,
        reportSoulsSaved: Number(reportSoulsSaved) || 0,
        reportRecommendations,
        updated_at: new Date().toISOString()
      };
      localStorage.setItem(reportStorageKey, JSON.stringify(payload));
      setReportSavedMessage("🎉 Post-Event Closeout Report updated and saved successfully!");
      setTimeout(() => setReportSavedMessage(null), 4000);
    } catch (err) {
      console.error("Error saving closeout report", err);
    }
  };

  const handleCreateEventFundingRequest = (e: React.FormEvent) => {
    e.preventDefault();
    const existingReqs = getRequisitions();
    const count = existingReqs.length + 1;
    const reqNum = `REQ-2026-${count.toString().padStart(3, '0')}`;
    const totalEst = expenses.reduce((acc, curr) => acc + (curr.estimated_cost || 0), 0);

    const reqItems = expenses.length > 0 
      ? expenses.map((exp, idx) => ({
          id: `req_item_${idx}_${Date.now()}`,
          item_name: exp.item_name,
          quantity: 1,
          unit_price: exp.estimated_cost || 100,
          total_price: exp.estimated_cost || 100
        }))
      : [{
          id: `req_item_def_${Date.now()}`,
          item_name: `Budget Requisition for ${event.title}`,
          quantity: 1,
          unit_price: totalEst || 1000,
          total_price: totalEst || 1000
        }];

    const finalAmount = totalEst > 0 ? totalEst : 1000;

    const newReq: DepartmentRequisition = {
      id: `req_evt_${Date.now()}`,
      requisition_number: reqNum,
      department_name: `Event: ${event.title}`,
      applicant_name: 'Event Manager / Committee',
      applicant_role: 'Event Lead',
      title: fundingTitle.trim() || `Event Funding Request: ${event.title}`,
      description: fundingNotes.trim() || `Event operational budget proposal submitted for ${event.title}. Includes logistics, technical setup, honorariums, and hospitality.`,
      requested_amount: finalAmount,
      currency: 'SLE',
      priority: fundingPriority,
      status: 'pending_approval',
      created_at: new Date().toISOString(),
      needed_by_date: event.start_time ? new Date(event.start_time).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
      disbursement_method: fundingDisbursementMethod,
      disbursement_account_info: fundingAccountInfo.trim() || 'Afrimoney: 077 000 111 (Event Logistics Team)',
      items: reqItems
    };

    saveRequisitions([newReq, ...existingReqs]);
    setFundingRequestSuccess(`🎉 Funding Request #${reqNum} for ${finalAmount.toLocaleString()} SLE successfully submitted to the Finance Officer!`);
    setShowFundingModal(false);
    setFundingTitle('');
    setFundingNotes('');
    setFundingAccountInfo('');
  };

  // Persist State to localStorage on changes
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify({
        roles,
        tasks,
        schedule,
        expenses
      }));
    } catch (e) {
      console.error("Failed to save workspace state", e);
    }
  }, [roles, tasks, schedule, expenses, storageKey]);

  // Handler - Appoint Team Member Role
  const handleAddRole = (e: React.FormEvent) => {
    e.preventDefault();
    let name = roleCustomName.trim();
    let phone = rolePhone.trim();
    let email = roleEmail.trim();

    if (roleMemberId) {
      const found = members.find(m => m.id === roleMemberId);
      if (found) {
        name = `${found.first_name} ${found.last_name}`;
        phone = found.phone || phone;
        email = found.email || email;
      }
    }

    if (!name) return;

    const newRole: EventTeamRole = {
      id: `role_${Date.now()}`,
      event_id: event.id,
      user_id: roleMemberId || undefined,
      member_name: name,
      role_title: roleTitle,
      phone: phone || undefined,
      email: email || undefined,
      assigned_at: new Date().toISOString()
    };

    setRoles([...roles.filter(r => r.role_title !== roleTitle || r.member_name !== name), newRole]);
    setRoleMemberId('');
    setRoleCustomName('');
    setRolePhone('');
    setRoleEmail('');
    setShowRoleModal(false);
  };

  const handleDeleteRole = (id: string) => {
    setRoles(roles.filter(r => r.id !== id));
  };

  // Handler - Task
  const handleAddTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskTitle.trim()) return;

    const newTask: EventTask = {
      id: `task_${Date.now()}`,
      event_id: event.id,
      title: taskTitle.trim(),
      assignee_name: taskAssignee.trim() || 'Event Manager',
      due_date: taskDueDate || undefined,
      status: 'todo'
    };

    setTasks([...tasks, newTask]);
    setTaskTitle('');
    setTaskAssignee('');
    setTaskDueDate('');
    setShowTaskModal(false);
  };

  const handleToggleTaskStatus = (taskId: string) => {
    setTasks(tasks.map(t => {
      if (t.id === taskId) {
        const nextStatus = t.status === 'todo' ? 'in_progress' : t.status === 'in_progress' ? 'completed' : 'todo';
        return { ...t, status: nextStatus };
      }
      return t;
    }));
  };

  const handleDeleteTask = (taskId: string) => {
    setTasks(tasks.filter(t => t.id !== taskId));
  };

  // Handler - Run of Show / Schedule
  const handleAddScheduleItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!schedTitle.trim() || !schedTimeSlot.trim()) return;

    const newItem: EventScheduleItem = {
      id: `sched_${Date.now()}`,
      event_id: event.id,
      time_slot: schedTimeSlot.trim(),
      activity_title: schedTitle.trim(),
      leader_or_minister: schedMinister.trim() || undefined,
      notes: schedNotes.trim() || undefined
    };

    setSchedule([...schedule, newItem]);
    setSchedTimeSlot('');
    setSchedTitle('');
    setSchedMinister('');
    setSchedNotes('');
    setShowScheduleModal(false);
  };

  const handleDeleteScheduleItem = (id: string) => {
    setSchedule(schedule.filter(s => s.id !== id));
  };

  // Handler - Budget / Expense
  const handleAddExpense = (e: React.FormEvent) => {
    e.preventDefault();
    if (!expName.trim()) return;

    const newExp: EventExpense = {
      id: `exp_${Date.now()}`,
      event_id: event.id,
      item_name: expName.trim(),
      category: expCategory,
      estimated_cost: Number(expEstCost) || 0,
      actual_cost: Number(expActCost) || 0,
      status: expStatus
    };

    setExpenses([...expenses, newExp]);
    setExpName('');
    setExpCategory('Logistics');
    setExpEstCost(100);
    setExpActCost(100);
    setExpStatus('planned');
    setShowExpenseModal(false);
  };

  const handleDeleteExpense = (id: string) => {
    setExpenses(expenses.filter(e => e.id !== id));
  };

  // Handler - Check-In QR Pass
  const executeCheckInRegistration = async (regToMark: EventRegistration) => {
    setIsProcessingCheckIn(true);
    setScanSuccessMessage(null);
    setScanErrorMessage(null);

    try {
      const nowIso = new Date().toISOString();
      const { error } = await supabase
        .from('event_registrations')
        .update({ status: 'checked_in', checked_in_at: nowIso })
        .eq('id', regToMark.id);

      if (error) throw error;

      setScanSuccessMessage(`🎉 ${regToMark.member_name} successfully checked into ${event.title}!`);
      onRefreshData();
    } catch (e: any) {
      console.error(e);
      setScanErrorMessage(`Check-in failed: ${e?.message || 'Database error'}`);
    } finally {
      setIsProcessingCheckIn(false);
    }
  };

  const handleVerifyScanCode = (e: React.FormEvent) => {
    e.preventDefault();
    setScanSuccessMessage(null);
    setScanErrorMessage(null);

    let codeToVerify = scanInput.trim();
    if (selectedScanRegId) {
      codeToVerify = `EVENT:${event.id}:REG:${selectedScanRegId}`;
    }

    if (!codeToVerify) {
      setScanErrorMessage('Please enter a QR Pass Code or select an attendee from the roster.');
      return;
    }

    const evtRegistrations = registrations.filter(r => r.event_id === event.id);

    // Try matching code by registration ID, code payload, email or member name
    const found = evtRegistrations.find(r => 
      codeToVerify.includes(r.id) || 
      codeToVerify.toLowerCase() === r.email.toLowerCase() ||
      codeToVerify.toLowerCase() === r.member_name.toLowerCase() ||
      `EVENT:${event.id}:REG:${r.id}` === codeToVerify
    );

    if (found) {
      executeCheckInRegistration(found);
      setScanInput('');
      setSelectedScanRegId('');
    } else {
      setScanErrorMessage('No matching congregant RSVP found for this QR Pass Code.');
    }
  };

  // Financial Calculations
  const totalEstimated = expenses.reduce((acc, curr) => acc + (curr.estimated_cost || 0), 0);
  const totalActual = budgetApproval?.status === 'disbursed' && budgetApproval.total_budget 
    ? budgetApproval.total_budget 
    : expenses.reduce((acc, curr) => acc + (curr.actual_cost || 0), 0);

  const evtRegistrations = registrations.filter(r => r.event_id === event.id);
  const registeredCount = event.registered_count || evtRegistrations.length;
  const checkedInCount = evtRegistrations.filter(r => r.status === 'checked_in').length;

  return (
    <div className="w-full max-w-7xl mx-auto min-h-screen bg-slate-50 flex flex-col space-y-4 pb-20 animate-in fade-in duration-200 px-2 sm:px-4">
      
      {/* ULTRA-SLIM STICKY TOP APP HEADER (< 50px tall) */}
      <div className="bg-slate-950/95 text-white rounded-2xl px-3 py-2 sm:px-5 sm:py-2.5 shadow-xl border border-slate-800/90 sticky top-1 z-30 backdrop-blur-md flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            onClick={onClose}
            className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-indigo-300 hover:text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shrink-0 border border-slate-700 min-h-[36px]"
            title="Return to Church Events Calendar"
          >
            <ArrowLeft size={15} />
            <span className="hidden xs:inline">Back</span>
          </button>

          <div className="flex items-center gap-2 min-w-0">
            <span className="font-extrabold text-white text-xs sm:text-sm truncate max-w-[150px] xs:max-w-[220px] sm:max-w-md">
              {event.title}
            </span>
            <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider shrink-0 ${
              event.status === 'upcoming' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' :
              event.status === 'ongoing' ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30 animate-pulse' :
              'bg-slate-800 text-slate-300 border border-slate-700'
            }`}>
              {event.status}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setActiveTab('account')}
            className="flex items-center gap-1.5 font-bold px-2.5 py-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 rounded-xl cursor-pointer transition-all text-xs min-h-[36px]"
            title="Click to view Dedicated Event Treasury Account"
          >
            <Landmark size={14} className="text-emerald-400 shrink-0" />
            <span className="text-emerald-200 font-mono text-[11px] font-bold">SLE {eventAccount.current_balance.toLocaleString()}</span>
          </button>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors cursor-pointer min-w-[36px] min-h-[36px] flex items-center justify-center shrink-0"
            title="Close Workspace View"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* IN-PAGE WORKSPACE HERO BANNER (Unpinned, Scrolls naturally with page) */}
      <div className="bg-gradient-to-r from-slate-950 via-indigo-950 to-slate-900 text-white rounded-3xl p-4 sm:p-6 shadow-xl space-y-4 border border-slate-800/80">
        
        {/* Badges Row */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
            {event.category}
          </span>

          {/* Recurrence Pattern Badge */}
          {(() => {
            const rec = getRecurrenceBadge(event.recurrence);
            return (
              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black tracking-wide border flex items-center gap-1 ${
                event.recurrence === 'weekly' ? 'bg-purple-500/20 text-purple-300 border-purple-500/40' :
                event.recurrence === 'monthly' ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40' :
                event.recurrence === 'quarterly' ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' :
                event.recurrence === 'yearly' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' :
                'bg-slate-700/60 text-slate-300 border-slate-600'
              }`}>
                <span>{rec.icon}</span>
                <span>{rec.label}</span>
              </span>
            );
          })()}

          {event.is_virtual && (
            <span className="px-2.5 py-0.5 bg-rose-500/20 text-rose-300 border border-rose-500/40 rounded-full text-[10px] font-black flex items-center gap-1">
              <Radio size={12} className="animate-pulse" /> Live Stream
            </span>
          )}
        </div>

        {/* Title Banner */}
        <div>
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-black tracking-tight text-white leading-tight">{event.title}</h1>
          <p className="text-[11px] sm:text-xs text-slate-400 mt-1">
            Event Operations, Dedicated Treasury Funding & Committee Workspace
            {event.recurrence_pattern && <span className="text-purple-300 font-bold ml-1.5">• Recurrence: {event.recurrence_pattern}</span>}
          </p>
        </div>

        {/* Quick Context Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs text-slate-300 pt-3 border-t border-slate-800/80">
          <div className="flex items-center gap-1.5 font-medium text-amber-300">
            <Clock size={14} className="shrink-0" />
            <span className="truncate">{new Date(event.start_time).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
          </div>
          <div className="flex items-center gap-1.5 font-medium">
            <MapPin size={14} className="text-indigo-400 shrink-0" />
            <span className="truncate">{event.location}</span>
          </div>
          <div className="flex items-center gap-1.5 font-medium">
            <Users size={14} className="text-emerald-400 shrink-0" />
            <span>{registeredCount} RSVPs ({checkedInCount} Present)</span>
          </div>
          <div className="flex items-center gap-1.5 font-bold text-purple-300">
            <Sparkles size={14} className="shrink-0" />
            <span className="truncate">By {event.organizer_name || 'Pastoral Team'}</span>
          </div>
        </div>

        {/* Account Feedback Toast */}
        {accountSuccessMsg && (
          <div className="p-3 bg-emerald-600/90 text-white rounded-xl text-xs font-bold flex items-center justify-between animate-in fade-in">
            <span>{accountSuccessMsg}</span>
            <button onClick={() => setAccountSuccessMsg(null)} className="text-white/80 hover:text-white">
              <X size={15} />
            </button>
          </div>
        )}
        {accountErrorMsg && (
          <div className="p-3 bg-rose-600/90 text-white rounded-xl text-xs font-bold flex items-center justify-between animate-in fade-in">
            <span>{accountErrorMsg}</span>
            <button onClick={() => setAccountErrorMsg(null)} className="text-white/80 hover:text-white">
              <X size={15} />
            </button>
          </div>
        )}

        {/* WORKSPACE NAVIGATION TABS (DESKTOP) */}
        <div className="pt-2 border-t border-slate-800/80 hidden lg:block">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-1 text-xs font-bold scrollbar-none">
            <button
              onClick={() => setActiveTab('overview')}
              className={`px-3.5 py-2 rounded-xl transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                activeTab === 'overview' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <span>📊 Overview</span>
            </button>
            <button
              onClick={() => setActiveTab('account')}
              className={`px-3.5 py-2 rounded-xl transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                activeTab === 'account' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Landmark size={14} className="shrink-0" />
              <span>Treasury</span>
            </button>
            <button
              onClick={() => setActiveTab('qrpass')}
              className={`px-3.5 py-2 rounded-xl transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                activeTab === 'qrpass' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <QrCode size={14} className="shrink-0" />
              <span>Door QR</span>
            </button>
            <button
              onClick={() => setActiveTab('team')}
              className={`px-3.5 py-2 rounded-xl transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                activeTab === 'team' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Users size={14} className="shrink-0" />
              <span>Committee</span>
            </button>
            <button
              onClick={() => setActiveTab('schedule')}
              className={`px-3.5 py-2 rounded-xl transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                activeTab === 'schedule' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Clock size={14} className="shrink-0" />
              <span>Run of Show</span>
            </button>
            <button
              onClick={() => setActiveTab('tasks')}
              className={`px-3.5 py-2 rounded-xl transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                activeTab === 'tasks' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <CheckSquare size={14} className="shrink-0" />
              <span>Checklist</span>
            </button>
            <button
              onClick={() => setActiveTab('budget')}
              className={`px-3.5 py-2 rounded-xl transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                activeTab === 'budget' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <DollarSign size={14} className="shrink-0" />
              <span>Budget</span>
            </button>
            <button
              onClick={() => setActiveTab('resources')}
              className={`px-3.5 py-2 rounded-xl transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                activeTab === 'resources' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Package size={14} className="shrink-0" />
              <span>Gear</span>
            </button>
            <button
              onClick={() => setActiveTab('survey')}
              className={`px-3.5 py-2 rounded-xl transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                activeTab === 'survey' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <MessageSquareText size={14} className="shrink-0" />
              <span>Survey</span>
            </button>
            <button
              onClick={() => setActiveTab('report')}
              className={`px-3.5 py-2 rounded-xl transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                activeTab === 'report' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <FileText size={14} className="shrink-0" />
              <span>Closeout</span>
            </button>
            <button
              onClick={() => setActiveTab('rsvps')}
              className={`px-3.5 py-2 rounded-xl transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                activeTab === 'rsvps' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <span>RSVPs ({registeredCount})</span>
            </button>
          </div>
        </div>
      </div>

      {/* WORKSPACE TAB BODY CONTENT PAGE CANVAS */}
      <div className="space-y-6">

        {/* TAB 1: OVERVIEW */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Recurring Program Schedule Control Banner */}
            {event.recurrence && event.recurrence !== 'one_time' && (
              <div className="p-5 bg-gradient-to-r from-purple-950 via-indigo-950 to-slate-900 text-white rounded-3xl border border-purple-800 shadow-md flex flex-col md:flex-row md:items-center justify-between gap-4 animate-in fade-in">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-purple-400 text-slate-950">
                      🔄 Recurring Program ({event.recurrence})
                    </span>
                    <span className="text-xs text-purple-200 font-bold">
                      Current: {new Date(event.start_time).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
                    </span>
                  </div>
                  <h4 className="font-extrabold text-white text-sm">Automated Recurrence Cycle Schedule</h4>
                  <p className="text-xs text-purple-200/90">
                    Next Scheduled Occurrence: <strong className="text-amber-300 font-mono text-xs">{calculateNextRecurrenceDate(event.start_time, event.end_time, event.recurrence).formattedNextStart}</strong>
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleAdvanceRecurrence}
                  className="px-4 py-2.5 bg-amber-400 hover:bg-amber-300 text-slate-950 font-black rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer shrink-0"
                >
                  <RefreshCw size={15} />
                  <span>Advance Event Date to Next Occurrence</span>
                </button>
              </div>
            )}

            {recurrenceAdvanceToast && (
              <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-2xl text-xs font-bold flex items-center justify-between shadow-xs animate-in fade-in">
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
                  <span>{recurrenceAdvanceToast}</span>
                </div>
                <button onClick={() => setRecurrenceAdvanceToast(null)} className="text-emerald-600">
                  <X size={14} />
                </button>
              </div>
            )}

            {/* Summary Stats Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-5">
              <div className="p-5 bg-white rounded-3xl border border-slate-200 shadow-xs space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase">Appointed Team</span>
                <div className="text-2xl font-black text-indigo-600">{roles.length}</div>
                <p className="text-[10px] text-slate-500 font-medium">Managers & Committee Leads</p>
              </div>

              <div className="p-5 bg-white rounded-3xl border border-slate-200 shadow-xs space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase">Program Agenda</span>
                <div className="text-2xl font-black text-purple-600">{schedule.length}</div>
                <p className="text-[10px] text-slate-500 font-medium">Timeline schedule items</p>
              </div>

              <div className="p-5 bg-white rounded-3xl border border-slate-200 shadow-xs space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase">QR Check-In Count</span>
                <div className="text-2xl font-black text-emerald-600">{checkedInCount} / {registeredCount}</div>
                <p className="text-[10px] text-slate-500 font-medium">Scanned at sanctuary doors</p>
              </div>

              <div className="p-5 bg-white rounded-3xl border border-slate-200 shadow-xs space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase">Event Cash Balance</span>
                <div className="text-2xl font-black text-emerald-600">SLE {eventAccount.current_balance.toLocaleString()}</div>
                <p className="text-[10px] text-slate-500 font-medium">Account: {eventAccount.account_number}</p>
              </div>
            </div>

            {/* Dedicated Event Treasury Account & Recurrence Spotlight Card */}
            <div className="bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 rounded-3xl p-6 sm:p-7 text-white shadow-lg border border-slate-800 space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      Dedicated Event Treasury Account
                    </span>
                    {(() => {
                      const rec = getRecurrenceBadge(event.recurrence);
                      return (
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black tracking-wide bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 flex items-center gap-1">
                          <span>{rec.icon}</span>
                          <span>{rec.label}</span>
                        </span>
                      );
                    })()}
                  </div>
                  <h3 className="text-xl sm:text-2xl font-black text-white">{eventAccount.account_name}</h3>
                  <p className="text-xs text-slate-300">
                    Auto-provisioned church funding account for deposits, donor sponsorships, and approved vendor disbursements.
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => setShowFundModal(true)}
                    className="px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-xs font-black shadow-md shadow-emerald-900/40 transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <Plus size={15} />
                    <span>+ Deposit Funds</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('account')}
                    className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-indigo-300 hover:text-white rounded-xl text-xs font-bold border border-slate-700 transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <Landmark size={15} />
                    <span>View Treasury Ledger</span>
                  </button>
                </div>
              </div>

              {/* Account Quick Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs pt-3 border-t border-slate-800">
                <div className="p-3 bg-slate-800/60 rounded-2xl border border-slate-700/60">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Account Number</span>
                  <span className="font-mono font-black text-white text-sm mt-0.5 block">{eventAccount.account_number}</span>
                </div>
                <div className="p-3 bg-slate-800/60 rounded-2xl border border-slate-700/60">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Available Cash</span>
                  <span className="font-black text-emerald-400 text-sm mt-0.5 block">SLE {eventAccount.current_balance.toLocaleString()}</span>
                </div>
                <div className="p-3 bg-slate-800/60 rounded-2xl border border-slate-700/60">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Bank Wire Destination</span>
                  <span className="font-bold text-slate-200 text-xs mt-0.5 block truncate">{eventAccount.bank_name}</span>
                </div>
                <div className="p-3 bg-slate-800/60 rounded-2xl border border-slate-700/60">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Mobile Money</span>
                  <span className="font-bold text-slate-200 text-xs mt-0.5 block truncate">{eventAccount.mobile_money_merchant}</span>
                </div>
              </div>
            </div>

            {/* Event Description & Featured Image Split */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 bg-white rounded-3xl p-6 border border-slate-200 shadow-xs space-y-4">
                <div className="flex items-center justify-between border-b pb-3">
                  <h4 className="font-extrabold text-slate-900 text-base">Program Details & Sermon Objectives</h4>
                  <span className="text-xs text-indigo-600 font-bold">Host: {event.organizer_name || 'Pastoral Team'}</span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-line">
                  {event.description || 'No detailed description specified for this church event. Use the edit options in the events roster to update sermon topics or guest speaker announcements.'}
                </p>

                <div className="pt-4 border-t border-slate-100 grid grid-cols-2 sm:grid-cols-3 gap-4 text-xs">
                  <div>
                    <span className="font-bold text-slate-400 uppercase text-[10px]">Target Audience</span>
                    <p className="font-extrabold text-slate-800">{event.target_audience || 'All Congregation'}</p>
                  </div>
                  <div>
                    <span className="font-bold text-slate-400 uppercase text-[10px]">Registration Required</span>
                    <p className="font-extrabold text-slate-800">{event.registration_required ? 'Yes (RSVP Ticketed)' : 'No (Open Entry)'}</p>
                  </div>
                  <div>
                    <span className="font-bold text-slate-400 uppercase text-[10px]">Max Seat Capacity</span>
                    <p className="font-extrabold text-slate-800">{event.max_attendees || 'Unlimited Seats'}</p>
                  </div>
                  <div>
                    <span className="font-bold text-slate-400 uppercase text-[10px]">Program Recurrence</span>
                    <p className="font-extrabold text-indigo-700">{getRecurrenceBadge(event.recurrence).label}</p>
                  </div>
                  {event.recurrence_pattern && (
                    <div className="sm:col-span-2">
                      <span className="font-bold text-slate-400 uppercase text-[10px]">Schedule Pattern</span>
                      <p className="font-extrabold text-slate-800">{event.recurrence_pattern}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Event QR Quick Pass Card */}
              <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs space-y-4 flex flex-col justify-between items-center text-center">
                <div>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-indigo-100 text-indigo-800">
                    Event Master QR Pass
                  </span>
                  <h4 className="font-extrabold text-slate-900 text-sm mt-1">Sanctuary Check-In Poster</h4>
                  <p className="text-[11px] text-slate-500 mt-0.5">Scan to open event registration page</p>
                </div>

                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 shadow-inner flex justify-center">
                  <QRCodeSVG 
                    value={`EVENT:${event.id}:${event.title}`}
                    size={150}
                    level="H"
                    includeMargin
                  />
                </div>

                <button
                  onClick={() => window.print()}
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <Printer size={14} />
                  <span>Print Event Poster QR</span>
                </button>
              </div>
            </div>

            {/* Interactive Venue Location & GPS Map Section */}
            <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold shrink-0">
                    <MapPin size={20} />
                  </div>
                  <div>
                    <h4 className="font-extrabold text-slate-900 text-base">Venue GPS Map & Directions</h4>
                    <p className="text-xs text-slate-500">{event.location || 'Grace Cathedral Main Sanctuary'}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="px-3 py-1 rounded-lg bg-slate-100 text-slate-700 font-mono font-bold text-xs">
                    GPS: {(event.latitude ?? 8.484).toFixed(5)}°, {(event.longitude ?? -13.229).toFixed(5)}°
                  </span>
                </div>
              </div>

              <LocationMap
                latitude={event.latitude ?? 8.484}
                longitude={event.longitude ?? -13.229}
                title={event.title}
                subtitle={event.location || 'Grace Cathedral Main Sanctuary'}
                height="280px"
              />
            </div>
          </div>
        )}

        {/* TAB: DEDICATED EVENT TREASURY ACCOUNT */}
        {activeTab === 'account' && event.has_funding_account === false ? (
          <div className="bg-white rounded-3xl p-8 sm:p-12 border border-slate-200 shadow-xs text-center space-y-5 max-w-2xl mx-auto my-6">
            <div className="w-16 h-16 rounded-3xl bg-slate-100 text-slate-500 flex items-center justify-center mx-auto shadow-inner">
              <Landmark size={32} />
            </div>
            <div className="space-y-2">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-100 text-slate-700 font-extrabold text-xs rounded-full">
                <span>Standard Non-Funded Event</span>
              </div>
              <h3 className="text-2xl font-black text-slate-900 tracking-tight">No Dedicated Treasury Account Configured</h3>
              <p className="text-xs text-slate-500 leading-relaxed max-w-md mx-auto">
                This event or gathering was created without a dedicated financial ledger account. Routine church services, small group huddles, or free fellowship meetings run without vendor disbursement tracking.
              </p>
            </div>
            <div className="pt-2">
              <button
                type="button"
                onClick={() => {
                  const newAccNum = event.account_number || `EVT-ACC-2026-${Math.floor(100 + Math.random() * 900)}`;
                  const updated: ChurchEvent = {
                    ...event,
                    has_funding_account: true,
                    account_number: newAccNum
                  };
                  onUpdateEvent(updated);
                  setEventAccount(getEventAccount(event.id, event.title, event.recurring_funding_allowance || 15000));
                }}
                className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black shadow-md shadow-emerald-100 transition-all inline-flex items-center gap-2 cursor-pointer"
              >
                <Plus size={16} /> Enable Treasury & Create Funding Account Now
              </button>
            </div>
          </div>
        ) : activeTab === 'account' && (
          <div className="space-y-6">
            {/* Top Account & Banking Overview Card */}
            <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-xs space-y-6">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5 pb-6 border-b border-slate-100">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="px-3 py-1 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-black flex items-center gap-1.5">
                      <Landmark size={14} className="text-emerald-600" />
                      <span>Dedicated Event Account</span>
                    </span>
                    {(() => {
                      const rec = getRecurrenceBadge(event.recurrence);
                      return (
                        <span className={`px-3 py-1 rounded-xl text-xs font-black border flex items-center gap-1.5 ${rec.badgeColor}`}>
                          <span>{rec.icon}</span>
                          <span>{rec.label}</span>
                        </span>
                      );
                    })()}
                    <span className="px-2.5 py-1 bg-slate-100 text-slate-700 font-extrabold text-xs rounded-xl">
                      Status: ACTIVE
                    </span>
                  </div>

                  <h2 className="text-2xl font-black text-slate-900 tracking-tight">{eventAccount.account_name}</h2>
                  <p className="text-xs text-slate-500 max-w-2xl">
                    Every church event and recurring program has an autonomous financial ledger. Fund this event directly from Church Treasury allocations, donor sponsorships, or member pledges, and disburse payments directly to vendors.
                  </p>
                </div>

                {/* Actions Bar */}
                <div className="flex items-center gap-2 flex-wrap shrink-0">
                  <button
                    onClick={() => setShowFundModal(true)}
                    className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black shadow-md shadow-emerald-100 transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <Plus size={16} />
                    <span>+ Fund Account</span>
                  </button>
                  <button
                    onClick={() => setShowDisburseModal(true)}
                    className="px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-black shadow-md shadow-rose-100 transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <ArrowUpRight size={16} />
                    <span>- Record Payout</span>
                  </button>
                  <button
                    onClick={downloadEventAccountStatementPDF}
                    className="px-3.5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                    title="Export printable audit statement"
                  >
                    <Printer size={15} />
                    <span>Audit PDF</span>
                  </button>
                  <button
                    onClick={handleCopyFundingInfo}
                    className="px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                    title="Copy details to share with sponsors"
                  >
                    <Copy size={15} />
                    <span>Copy Details</span>
                  </button>
                </div>
              </div>

              {copyCodeFeedback && (
                <div className="p-3 bg-emerald-100 text-emerald-900 rounded-xl text-xs font-bold flex items-center justify-between">
                  <span>✓ {copyCodeFeedback}</span>
                  <button onClick={() => setCopyCodeFeedback(null)} className="text-emerald-700">
                    <X size={14} />
                  </button>
                </div>
              )}

              {/* Metrics Row */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="p-5 bg-emerald-50/60 rounded-3xl border border-emerald-100 space-y-1">
                  <span className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider block">Available Balance</span>
                  <div className="text-2xl sm:text-3xl font-black text-emerald-700">
                    SLE {eventAccount.current_balance.toLocaleString()}
                  </div>
                  <p className="text-[10px] text-emerald-600 font-medium">Ready for disbursement</p>
                </div>

                <div className="p-5 bg-indigo-50/60 rounded-3xl border border-indigo-100 space-y-1">
                  <span className="text-[10px] font-bold text-indigo-800 uppercase tracking-wider block">
                    {event.recurrence && event.recurrence !== 'one_time' ? 'Cycle Budget Allowance' : 'Target Budget'}
                  </span>
                  <div className="text-2xl sm:text-3xl font-black text-indigo-700">
                    SLE {(event.recurring_funding_allowance || eventAccount.target_budget).toLocaleString()}
                  </div>
                  <p className="text-[10px] text-indigo-600 font-medium">
                    {event.recurrence && event.recurrence !== 'one_time' ? `Per ${event.recurrence} cycle` : 'Approved target'}
                  </p>
                </div>

                <div className="p-5 bg-slate-50 rounded-3xl border border-slate-200 space-y-1">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Total Deposits (Inflow)</span>
                  <div className="text-2xl sm:text-3xl font-black text-slate-900">
                    SLE {eventAccount.total_funded.toLocaleString()}
                  </div>
                  <p className="text-[10px] text-slate-500 font-medium">Treasury & Sponsor seeds</p>
                </div>

                <div className="p-5 bg-slate-50 rounded-3xl border border-slate-200 space-y-1">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Total Disbursed (Outflow)</span>
                  <div className="text-2xl sm:text-3xl font-black text-rose-600">
                    SLE {eventAccount.total_disbursed.toLocaleString()}
                  </div>
                  <p className="text-[10px] text-slate-500 font-medium">Paid vendor requisitions</p>
                </div>
              </div>

              {/* Funding Progress Bar */}
              {(() => {
                const target = event.recurring_funding_allowance || eventAccount.target_budget || 1;
                const pct = Math.min(100, Math.round((eventAccount.current_balance / target) * 100));
                return (
                  <div className="space-y-2 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-extrabold text-slate-700 flex items-center gap-1.5">
                        <TrendingUp size={15} className="text-indigo-600" />
                        <span>Funding Goal Fulfillment: {pct}% Funded</span>
                      </span>
                      <span className="font-mono text-slate-500 font-bold">
                        SLE {eventAccount.current_balance.toLocaleString()} / SLE {target.toLocaleString()}
                      </span>
                    </div>
                    <div className="w-full bg-slate-200 rounded-full h-3 overflow-hidden">
                      <div 
                        className={`h-full rounded-full transition-all duration-500 ${pct >= 100 ? 'bg-emerald-500' : 'bg-indigo-600'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })()}

              {/* Banking & Mobile Money Details 2-Column Box */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                <div className="p-5 bg-gradient-to-br from-indigo-50/50 to-white rounded-2xl border border-indigo-100 space-y-2">
                  <div className="flex items-center gap-2 text-indigo-900 font-bold text-xs uppercase">
                    <Landmark size={16} />
                    <span>Bank Wire Credentials</span>
                  </div>
                  <div className="space-y-1 text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Bank:</span>
                      <strong className="text-slate-800">{eventAccount.bank_name}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Account No:</span>
                      <strong className="text-indigo-950 font-mono">{eventAccount.bank_account_number}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Account Title:</span>
                      <strong className="text-slate-800 truncate max-w-[200px]">{eventAccount.account_name}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Currency:</span>
                      <strong className="text-emerald-700">{eventAccount.currency} (Sierra Leone Leones)</strong>
                    </div>
                  </div>
                </div>

                <div className="p-5 bg-gradient-to-br from-amber-50/50 to-white rounded-2xl border border-amber-100 space-y-2">
                  <div className="flex items-center gap-2 text-amber-900 font-bold text-xs uppercase">
                    <Smartphone size={16} />
                    <span>Mobile Money & Donor Reference</span>
                  </div>
                  <div className="space-y-1 text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Merchant Code:</span>
                      <strong className="text-slate-800">{eventAccount.mobile_money_merchant}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Donor Memo Ref:</span>
                      <span className="px-2 py-0.5 bg-amber-100 text-amber-900 font-mono font-black rounded text-[11px]">
                        {eventAccount.donor_reference_code}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Recurrence Pattern:</span>
                      <strong className="text-slate-800">{event.recurrence_pattern || 'Scheduled occurrence'}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Controller:</span>
                      <strong className="text-slate-800">Cathedral Treasury Board</strong>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Itemized Transactions Ledger Table */}
            <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                <div>
                  <h3 className="text-lg font-black text-slate-900">Event Financial Transactions Ledger</h3>
                  <p className="text-xs text-slate-500">Real-time audit log of all deposits, church treasury allocations, and vendor payments.</p>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-400">
                    {eventAccount.transactions?.length || 0} Transactions
                  </span>
                </div>
              </div>

              {(!eventAccount.transactions || eventAccount.transactions.length === 0) ? (
                <div className="py-12 text-center space-y-3">
                  <div className="w-14 h-14 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                    <Receipt size={28} />
                  </div>
                  <h4 className="font-extrabold text-slate-800 text-sm">No Transactions Yet</h4>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto">
                    No deposits or disbursements have been recorded for this event account yet. Click "+ Fund Account" above to log the first church allocation or donor gift.
                  </p>
                  <button
                    onClick={() => setShowFundModal(true)}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-black hover:bg-indigo-700 cursor-pointer"
                  >
                    + Record First Deposit
                  </button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-400 font-extrabold uppercase text-[10px]">
                        <th className="pb-3">Date</th>
                        <th className="pb-3">Type</th>
                        <th className="pb-3">Contributor / Payee</th>
                        <th className="pb-3">Channel</th>
                        <th className="pb-3">Reference #</th>
                        <th className="pb-3">Notes</th>
                        <th className="pb-3 text-right">Amount (SLE)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {eventAccount.transactions.map((txn) => {
                        const isDisb = txn.type === 'disbursement';
                        return (
                          <tr key={txn.id} className="hover:bg-slate-50 transition-colors">
                            <td className="py-3 text-slate-600 font-medium whitespace-nowrap">
                              {new Date(txn.date).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                            </td>
                            <td className="py-3">
                              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase ${
                                isDisb ? 'bg-rose-100 text-rose-800' :
                                txn.type === 'treasury_allocation' ? 'bg-indigo-100 text-indigo-800' :
                                'bg-emerald-100 text-emerald-800'
                              }`}>
                                {isDisb ? 'Disbursement' : txn.type === 'treasury_allocation' ? 'Treasury Grant' : 'Deposit'}
                              </span>
                            </td>
                            <td className="py-3 font-bold text-slate-900">
                              {txn.contributor_or_payee}
                            </td>
                            <td className="py-3 capitalize text-slate-600 font-medium">
                              {txn.source_or_channel.replace('_', ' ')}
                            </td>
                            <td className="py-3 font-mono text-[11px] text-slate-500 font-bold">
                              {txn.transaction_ref || 'N/A'}
                            </td>
                            <td className="py-3 text-slate-500 max-w-xs truncate" title={txn.notes}>
                              {txn.notes || '—'}
                            </td>
                            <td className={`py-3 text-right font-black text-sm whitespace-nowrap ${isDisb ? 'text-rose-600' : 'text-emerald-600'}`}>
                              {isDisb ? '-' : '+'} SLE {txn.amount.toLocaleString()}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* FUND / DEPOSIT MODAL */}
            {showFundModal && (
              <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-[100] flex items-center justify-center p-4 overflow-y-auto">
                <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl border border-slate-200 space-y-5 my-auto animate-in zoom-in-95">
                  <div className="flex justify-between items-center pb-3 border-b border-slate-100">
                    <div>
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800">
                        Event Inflow Deposit
                      </span>
                      <h3 className="text-xl font-black text-slate-900 mt-1">Fund Event Treasury</h3>
                    </div>
                    <button onClick={() => setShowFundModal(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                      <X size={20} />
                    </button>
                  </div>

                  <form onSubmit={handleFundEventAccount} className="space-y-4 text-xs">
                    <div>
                      <label className="font-extrabold text-slate-700 block mb-1">Funding Amount (SLE) *</label>
                      <input
                        type="number"
                        min="1"
                        required
                        value={fundAmount}
                        onChange={e => setFundAmount(e.target.value)}
                        placeholder="e.g. 5000"
                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-base font-black text-slate-900 font-mono outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>

                    <div>
                      <label className="font-extrabold text-slate-700 block mb-1">Funding Source / Channel *</label>
                      <select
                        value={fundSource}
                        onChange={e => setFundSource(e.target.value as any)}
                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold cursor-pointer"
                      >
                        <option value="church_treasury">Church Central Treasury Allocation</option>
                        <option value="bank_wire">Direct Bank Wire / Transfer</option>
                        <option value="mobile_money">Mobile Money (Afrimoney / Orange Money)</option>
                        <option value="cash">Sanctuary Cash Offering / Seed</option>
                        <option value="card">Online Card Donation</option>
                      </select>
                    </div>

                    <div>
                      <label className="font-extrabold text-slate-700 block mb-1">Contributor / Benefactor / Source *</label>
                      <input
                        type="text"
                        required
                        value={fundContributor}
                        onChange={e => setFundContributor(e.target.value)}
                        placeholder="e.g. Grace Cathedral Treasury Board / Deacon Sesay"
                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                      />
                    </div>

                    <div>
                      <label className="font-extrabold text-slate-700 block mb-1">Transaction Ref / Slip Code</label>
                      <input
                        type="text"
                        value={fundTxnRef}
                        onChange={e => setFundTxnRef(e.target.value)}
                        placeholder="e.g. TREAS-ALLOC-2026-09 or WIRE-8812"
                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono"
                      />
                    </div>

                    <div>
                      <label className="font-extrabold text-slate-700 block mb-1">Purpose / Notes</label>
                      <textarea
                        rows={2}
                        value={fundNotes}
                        onChange={e => setFundNotes(e.target.value)}
                        placeholder="e.g. Advance allocation for guest speaker honorarium and media gear"
                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                      />
                    </div>

                    <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() => setShowFundModal(false)}
                        className="px-4 py-2.5 text-slate-500 font-bold hover:bg-slate-100 rounded-xl cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="px-5 py-2.5 bg-emerald-600 text-white rounded-xl font-black hover:bg-emerald-700 shadow-md shadow-emerald-100 cursor-pointer"
                      >
                        Confirm & Deposit Funds
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {/* RECORD DISBURSEMENT / PAYOUT MODAL */}
            {showDisburseModal && (
              <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-[100] flex items-center justify-center p-4 overflow-y-auto">
                <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl border border-slate-200 space-y-5 my-auto animate-in zoom-in-95">
                  <div className="flex justify-between items-center pb-3 border-b border-slate-100">
                    <div>
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-rose-100 text-rose-800">
                        Event Outflow Disbursement
                      </span>
                      <h3 className="text-xl font-black text-slate-900 mt-1">Record Vendor Payout</h3>
                    </div>
                    <button onClick={() => setShowDisburseModal(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                      <X size={20} />
                    </button>
                  </div>

                  <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 text-xs flex justify-between">
                    <span className="text-slate-500">Current Available Balance:</span>
                    <strong className="text-emerald-700 font-mono font-black">
                      SLE {eventAccount.current_balance.toLocaleString()}
                    </strong>
                  </div>

                  <form onSubmit={handleDisburseEventAccount} className="space-y-4 text-xs">
                    <div>
                      <label className="font-extrabold text-slate-700 block mb-1">Disbursement Amount (SLE) *</label>
                      <input
                        type="number"
                        min="1"
                        max={eventAccount.current_balance}
                        required
                        value={disburseAmount}
                        onChange={e => setDisburseAmount(e.target.value)}
                        placeholder="e.g. 1500"
                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-base font-black text-rose-700 font-mono outline-none focus:ring-2 focus:ring-rose-500"
                      />
                    </div>

                    <div>
                      <label className="font-extrabold text-slate-700 block mb-1">Payee Vendor / Recipient *</label>
                      <input
                        type="text"
                        required
                        value={disbursePayee}
                        onChange={e => setDisbursePayee(e.target.value)}
                        placeholder="e.g. SoundTech Solutions SL / Freetown Banners"
                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                      />
                    </div>

                    <div>
                      <label className="font-extrabold text-slate-700 block mb-1">Payment Method / Channel *</label>
                      <select
                        value={disburseChannel}
                        onChange={e => setDisburseChannel(e.target.value as any)}
                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold cursor-pointer"
                      >
                        <option value="bank_wire">Direct Vendor Bank Wire</option>
                        <option value="mobile_money">Mobile Money Transfer</option>
                        <option value="cash">Petty Cash Payout</option>
                        <option value="card">Church Corporate Debit Card</option>
                        <option value="church_treasury">Direct Treasury Check</option>
                      </select>
                    </div>

                    <div>
                      <label className="font-extrabold text-slate-700 block mb-1">Invoice / Receipt / Check Ref #</label>
                      <input
                        type="text"
                        value={disburseTxnRef}
                        onChange={e => setDisburseTxnRef(e.target.value)}
                        placeholder="e.g. INV-2026-004 or CHK-9912"
                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono"
                      />
                    </div>

                    <div>
                      <label className="font-extrabold text-slate-700 block mb-1">Item / Service Description *</label>
                      <textarea
                        rows={2}
                        required
                        value={disburseNotes}
                        onChange={e => setDisburseNotes(e.target.value)}
                        placeholder="e.g. Payment for 2x Shure wireless microphones and sound engineer support"
                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                      />
                    </div>

                    <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() => setShowDisburseModal(false)}
                        className="px-4 py-2.5 text-slate-500 font-bold hover:bg-slate-100 rounded-xl cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="px-5 py-2.5 bg-rose-600 text-white rounded-xl font-black hover:bg-rose-700 shadow-md shadow-rose-100 cursor-pointer"
                      >
                        Record Disbursement
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: QR CHECK-IN PASS & LIVE SCANNER */}
        {activeTab === 'qrpass' && (
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
                <div>
                  <h3 className="text-lg font-black text-slate-900">Sanctuary Door QR Scanner & Check-In Verifier</h3>
                  <p className="text-xs text-slate-500">Scan congregant ticket passes or enter their name/registration ID to confirm entry.</p>
                </div>

                <div className="flex items-center gap-2">
                  <span className="px-3 py-1 bg-emerald-100 text-emerald-800 rounded-xl text-xs font-black flex items-center gap-1.5">
                    <CheckCircle2 size={15} />
                    <span>{checkedInCount} Checked In</span>
                  </span>
                  <span className="px-3 py-1 bg-slate-100 text-slate-700 rounded-xl text-xs font-extrabold">
                    {registeredCount} Total RSVPs
                  </span>
                </div>
              </div>

              {/* Status Banner Feedback Messages */}
              {scanSuccessMessage && (
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-900 font-bold text-xs flex items-center justify-between gap-2 animate-in fade-in">
                  <span className="flex items-center gap-2">
                    <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
                    <span>{scanSuccessMessage}</span>
                  </span>
                  <button onClick={() => setScanSuccessMessage(null)} className="p-1 hover:bg-emerald-100 rounded text-emerald-700">
                    <X size={14} />
                  </button>
                </div>
              )}

              {scanErrorMessage && (
                <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-rose-900 font-bold text-xs flex items-center justify-between gap-2 animate-in fade-in">
                  <span className="flex items-center gap-2">
                    <AlertCircle size={18} className="text-rose-600 shrink-0" />
                    <span>{scanErrorMessage}</span>
                  </span>
                  <button onClick={() => setScanErrorMessage(null)} className="p-1 hover:bg-rose-100 rounded text-rose-700">
                    <X size={14} />
                  </button>
                </div>
              )}

              {/* Verification & Scanner Inputs */}
              <form onSubmit={handleVerifyScanCode} className="grid grid-cols-1 md:grid-cols-3 gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-200 text-xs">
                <div className="md:col-span-1">
                  <label className="font-extrabold text-slate-700 uppercase block mb-1">Select Registered Attendee</label>
                  <select
                    value={selectedScanRegId}
                    onChange={e => {
                      setSelectedScanRegId(e.target.value);
                      if (e.target.value) setScanInput('');
                    }}
                    className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-bold text-slate-800 outline-none focus:border-indigo-500 cursor-pointer"
                  >
                    <option value="">-- Choose from RSVP list --</option>
                    {evtRegistrations.map(r => (
                      <option key={r.id} value={r.id}>
                        {r.member_name} ({r.status === 'checked_in' ? '✓ Checked In' : 'Pending Check-In'})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="md:col-span-1">
                  <label className="font-extrabold text-slate-700 uppercase block mb-1">Or Type QR Pass Code / Email</label>
                  <input
                    type="text"
                    placeholder="Paste QR string or email..."
                    value={scanInput}
                    onChange={e => {
                      setScanInput(e.target.value);
                      if (e.target.value) setSelectedScanRegId('');
                    }}
                    className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-medium text-slate-800 outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="flex items-end">
                  <button
                    type="submit"
                    disabled={isProcessingCheckIn}
                    className="w-full p-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-md shadow-indigo-100 transition-all flex items-center justify-center gap-2 cursor-pointer min-h-[42px]"
                  >
                    {isProcessingCheckIn ? (
                      <RefreshCw size={16} className="animate-spin" />
                    ) : (
                      <QrCode size={16} />
                    )}
                    <span>Verify Pass & Check-In</span>
                  </button>
                </div>
              </form>
            </div>

            {/* Attendance Summary Rate & PDF Export Header */}
            <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                <div>
                  <h4 className="font-extrabold text-slate-900 text-sm flex items-center gap-2">
                    <UserCheck size={18} className="text-indigo-600" />
                    <span>Sanctuary Attendance Rate & Check-In Summary</span>
                  </h4>
                  <p className="text-xs text-slate-500">Live attendance rate for {event.title} • Mark congregants Present or Absent manually below.</p>
                </div>
                <button
                  onClick={downloadAttendanceReportPDF}
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold shadow-md flex items-center gap-1.5 cursor-pointer shrink-0"
                >
                  <Printer size={15} /> Export Attendance Summary PDF
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200">
                  <span className="text-[10px] font-bold text-slate-400 uppercase block">Total Registered</span>
                  <strong className="text-base text-slate-900">{evtRegistrations.length} RSVPs</strong>
                </div>
                <div className="p-3 bg-emerald-50 rounded-2xl border border-emerald-200">
                  <span className="text-[10px] font-bold text-emerald-700 uppercase block">Present (Checked In)</span>
                  <strong className="text-base text-emerald-800">{checkedInCount} Present</strong>
                </div>
                <div className="p-3 bg-rose-50 rounded-2xl border border-rose-200">
                  <span className="text-[10px] font-bold text-rose-700 uppercase block">Marked Absent</span>
                  <strong className="text-base text-rose-800">{evtRegistrations.filter(r => r.status === 'absent').length} Absent</strong>
                </div>
                <div className="p-3 bg-indigo-50 rounded-2xl border border-indigo-200">
                  <span className="text-[10px] font-bold text-indigo-700 uppercase block">Sanctuary Attendance Rate</span>
                  <strong className="text-base text-indigo-900">
                    {evtRegistrations.length > 0 ? Math.round((checkedInCount / evtRegistrations.length) * 100) : 100}%
                  </strong>
                </div>
              </div>

              {/* Attendance Visual Bar */}
              <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden flex">
                <div 
                  className="bg-emerald-500 h-full transition-all duration-300" 
                  style={{ width: `${evtRegistrations.length > 0 ? (checkedInCount / evtRegistrations.length) * 100 : 0}%` }}
                  title="Present Rate"
                />
                <div 
                  className="bg-rose-400 h-full transition-all duration-300" 
                  style={{ width: `${evtRegistrations.length > 0 ? (evtRegistrations.filter(r => r.status === 'absent').length / evtRegistrations.length) * 100 : 0}%` }}
                  title="Absent Rate"
                />
              </div>
            </div>

            {/* Child Safety Drop-Off & Matching Security Badges Kiosk */}
            <div className="bg-gradient-to-br from-indigo-950 via-slate-900 to-indigo-900 text-white p-5 sm:p-6 rounded-3xl border border-indigo-700 shadow-md space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-indigo-800/80">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-amber-500 text-slate-950 font-black flex items-center justify-center shrink-0 shadow-sm">
                    <ShieldCheck size={22} />
                  </div>
                  <div>
                    <h4 className="font-extrabold text-base text-white">Children's Ministry Safety & Matching Badge Kiosk</h4>
                    <p className="text-xs text-indigo-200">Register child drop-offs and generate matching parent security claim badges.</p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowChildCheckInModal(true)}
                  className="px-4 py-2 bg-amber-400 hover:bg-amber-300 text-slate-950 font-extrabold rounded-xl text-xs shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
                >
                  <Plus size={15} /> Check In Child & Issue Badge
                </button>
              </div>

              {/* Logged Child Safety Records Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
                {childSafetyLogs.map((log) => (
                  <div key={log.id} className="p-3.5 bg-slate-900/90 rounded-2xl border border-indigo-800/60 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-extrabold text-white text-xs">{log.child_name} ({log.age} yrs)</span>
                      <span className="px-2 py-0.5 bg-amber-400 text-slate-950 font-mono font-black text-[10px] rounded-lg shadow-2xs">
                        {log.security_code}
                      </span>
                    </div>

                    <div className="text-[11px] text-slate-300 space-y-0.5">
                      <p>Parent: <span className="text-amber-200 font-bold">{log.parent_name}</span> ({log.parent_phone})</p>
                      <p className="text-[10px] text-slate-400">Checked in at {log.check_in_time}</p>
                    </div>

                    <button
                      type="button"
                      onClick={() => setActiveSafetyBadge(log)}
                      className="w-full mt-1 px-2.5 py-1.5 bg-indigo-800/80 hover:bg-indigo-700 text-white rounded-xl text-[10px] font-extrabold transition-all cursor-pointer flex items-center justify-center gap-1"
                    >
                      <Printer size={12} /> Print Safety Receipt Badge
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Generated Congregant Pass Cards Grid */}
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <h4 className="font-extrabold text-slate-900 text-base">All Registered Congregant Entry QR Passes</h4>
                
                <div className="relative min-w-[240px]">
                  <Search size={14} className="absolute left-3 top-3 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search attendee pass..."
                    value={passFilter}
                    onChange={e => setPassFilter(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              {evtRegistrations.length === 0 ? (
                <div className="p-8 text-center bg-slate-50 rounded-2xl border border-slate-200 text-slate-400 text-xs italic">
                  No congregants have registered for this event yet.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {evtRegistrations
                    .filter(r => r.member_name.toLowerCase().includes(passFilter.toLowerCase()) || r.email.toLowerCase().includes(passFilter.toLowerCase()))
                    .map(reg => {
                      const passPayload = `EVENT:${event.id}:REG:${reg.id}`;
                      const isCheckedIn = reg.status === 'checked_in' || reg.status === 'attended';
                      const isAbsent = reg.status === 'absent';

                      return (
                        <div key={reg.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-200 shadow-2xs space-y-3 flex flex-col justify-between hover:border-indigo-300 transition-all">
                          <div className="flex justify-between items-start gap-2">
                            <div>
                              <h5 className="font-extrabold text-slate-900 text-xs">{reg.member_name}</h5>
                              <p className="text-[10px] text-slate-500">{reg.email}</p>
                            </div>
                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${
                              isCheckedIn ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' :
                              isAbsent ? 'bg-rose-100 text-rose-800 border border-rose-200' :
                              'bg-amber-100 text-amber-800 border border-amber-200'
                            }`}>
                              {isCheckedIn ? '✓ Present' : isAbsent ? '✕ Absent' : 'Pending'}
                            </span>
                          </div>

                          <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-2xs flex justify-center my-1">
                            <QRCodeSVG 
                              value={passPayload}
                              size={120}
                              level="M"
                              includeMargin
                            />
                          </div>

                          {/* Manual Attendance Check-In Controls */}
                          <div className="space-y-1.5 pt-1 border-t border-slate-200">
                            <div className="flex items-center justify-between gap-1.5">
                              <button
                                onClick={() => handleManualCheckIn(reg.id, 'checked_in')}
                                className={`flex-1 py-1.5 rounded-lg font-bold text-[10px] transition-all cursor-pointer flex items-center justify-center gap-1 ${
                                  isCheckedIn ? 'bg-emerald-600 text-white shadow-2xs' : 'bg-emerald-100 hover:bg-emerald-200 text-emerald-900'
                                }`}
                              >
                                <UserCheck size={12} /> {isCheckedIn ? 'Present ✓' : 'Mark Present'}
                              </button>

                              <button
                                onClick={() => handleManualCheckIn(reg.id, 'absent')}
                                className={`flex-1 py-1.5 rounded-lg font-bold text-[10px] transition-all cursor-pointer flex items-center justify-center gap-1 ${
                                  isAbsent ? 'bg-rose-600 text-white shadow-2xs' : 'bg-rose-100 hover:bg-rose-200 text-rose-900'
                                }`}
                              >
                                <UserX size={12} /> {isAbsent ? 'Absent ✕' : 'Mark Absent'}
                              </button>
                            </div>

                            <div className="flex items-center justify-between text-[9px] text-slate-400">
                              <span className="font-mono">Pass ID: {reg.id.slice(0, 8)}...</span>
                              {reg.checked_in_at && <span>Scanned: {new Date(reg.checked_in_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: APPOINTED TEAM & COMMITTEE ROLES */}
        {activeTab === 'team' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-5 rounded-3xl border border-slate-200 shadow-xs">
              <div>
                <h4 className="font-black text-slate-900 text-sm">Event Leadership & Committee Appointments</h4>
                <p className="text-xs text-slate-500">Appoint Event Managers, Worship Leads, Logistics Coordinators, and Volunteers.</p>
              </div>
              <button
                onClick={() => setShowRoleModal(true)}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md flex items-center gap-1.5 cursor-pointer shrink-0"
              >
                <UserPlus size={15} /> Appoint Team Member
              </button>
            </div>

            {roles.length === 0 ? (
              <div className="p-8 text-center bg-white rounded-3xl border border-slate-200 space-y-2">
                <Users size={36} className="mx-auto text-slate-300" />
                <p className="font-bold text-slate-700 text-sm">No Committee Roles Appointed Yet</p>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">Appoint congregants and leaders as Event Manager, Worship Lead, or Ushering Coordinator.</p>
                <button
                  onClick={() => setShowRoleModal(true)}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 cursor-pointer inline-flex items-center gap-1.5 mt-2"
                >
                  <UserPlus size={14} /> Appoint Event Manager
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {roles.map(r => (
                  <div key={r.id} className="p-5 bg-white rounded-3xl border border-slate-200 shadow-xs space-y-3 flex flex-col justify-between">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-700 font-black flex items-center justify-center text-sm shrink-0">
                          {r.member_name.charAt(0)}
                        </div>
                        <div>
                          <h5 className="font-extrabold text-slate-900 text-xs">{r.member_name}</h5>
                          <span className="px-2 py-0.5 bg-indigo-50 text-indigo-800 rounded-md text-[10px] font-extrabold border border-indigo-100 block mt-0.5">
                            {r.role_title}
                          </span>
                        </div>
                      </div>

                      <button
                        onClick={() => handleDeleteRole(r.id)}
                        className="p-1 text-slate-300 hover:text-rose-600 rounded transition-colors"
                        title="Remove appointment"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>

                    <div className="space-y-1 text-[11px] text-slate-500 border-t border-slate-100 pt-2">
                      {r.phone && (
                        <div className="flex items-center gap-1.5 font-medium">
                          <Phone size={12} className="text-slate-400" />
                          <span>{r.phone}</span>
                        </div>
                      )}
                      {r.email && (
                        <div className="flex items-center gap-1.5 font-medium truncate">
                          <Mail size={12} className="text-slate-400 shrink-0" />
                          <span className="truncate">{r.email}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Guest Minister & Hospitality Logistics Tracker */}
            <div className="bg-gradient-to-br from-purple-950 via-slate-900 to-indigo-950 text-white p-5 sm:p-6 rounded-3xl border border-purple-800 shadow-md space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-purple-800/80">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-purple-600 text-white font-black flex items-center justify-center shrink-0 shadow-sm">
                    <Award size={22} />
                  </div>
                  <div>
                    <h4 className="font-extrabold text-base text-white">Visiting Guest Ministers & Hospitality Logistics</h4>
                    <p className="text-xs text-purple-200">Manage visiting speakers, hotel lodging, airport protocol pickup, and honorarium payouts.</p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowAddMinisterModal(true)}
                  className="px-4 py-2 bg-purple-500 hover:bg-purple-400 text-white font-extrabold rounded-xl text-xs shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
                >
                  <Plus size={15} /> Add Guest Minister
                </button>
              </div>

              {/* Guest Ministers Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                {guestMinisters.map((gm) => (
                  <div key={gm.id} className="p-4 bg-slate-900/90 rounded-2xl border border-purple-800/60 space-y-3 flex flex-col justify-between">
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <h5 className="font-extrabold text-white text-sm">{gm.name}</h5>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                          gm.is_disbursed ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                        }`}>
                          {gm.is_disbursed ? '✓ Honorarium Paid' : 'Pending Disburse'}
                        </span>
                      </div>
                      <p className="text-purple-300 text-xs font-semibold">{gm.ministry}</p>
                      <p className="text-[11px] text-slate-300 italic">{gm.bio}</p>

                      <div className="pt-2 border-t border-purple-800/40 space-y-1 text-[11px] text-slate-300">
                        <div className="flex items-center gap-1.5">
                          <MapPin size={13} className="text-amber-400 shrink-0" />
                          <span>Hotel: <strong className="text-white">{gm.hotel}</strong></span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Clock size={13} className="text-indigo-400 shrink-0" />
                          <span>Flight / Pickup: <strong className="text-white">{gm.flight_info}</strong> ({gm.pickup_time})</span>
                        </div>
                        <div className="flex items-center gap-1.5 font-mono text-emerald-300 font-extrabold">
                          <DollarSign size={13} className="shrink-0" />
                          <span>Honorarium: SLE {gm.honorarium.toLocaleString()}</span>
                        </div>
                      </div>
                    </div>

                    {!gm.is_disbursed && (
                      <button
                        type="button"
                        onClick={() => handleDisburseHonorarium(gm)}
                        className="w-full mt-2 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-extrabold text-xs transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-xs"
                      >
                        <DollarSign size={14} /> Disburse SLE {gm.honorarium.toLocaleString()} Honorarium
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: RUN OF SHOW (PROGRAM AGENDA) */}
        {activeTab === 'schedule' && (
          <div className="space-y-4">
            {/* Live Stage Countdown Timer Monitor */}
            <div className="bg-gradient-to-r from-slate-950 via-indigo-950 to-slate-900 text-white p-5 rounded-3xl border border-indigo-800 shadow-md flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-rose-600 text-white font-black flex items-center justify-center shrink-0 shadow-md">
                  <Clock size={24} className={stageTimerActive ? 'animate-pulse' : ''} />
                </div>
                <div>
                  <span className="px-2 py-0.5 bg-rose-500/20 text-rose-300 font-mono font-black text-[10px] rounded uppercase border border-rose-500/40">
                    Live Stage Countdown Timer
                  </span>
                  <h4 className="font-extrabold text-base text-white mt-0.5">
                    {schedule[activeLiturgyIdx]?.activity_title || 'Active Liturgy Item'}
                  </h4>
                  <p className="text-xs text-indigo-200">
                    Minister: {schedule[activeLiturgyIdx]?.leader_or_minister || 'Service Leader'}
                  </p>
                </div>
              </div>

              {/* Digital Countdown Display */}
              <div className="flex items-center gap-4">
                <div className="px-5 py-2.5 bg-slate-900 rounded-2xl border border-indigo-700 font-mono font-black text-2xl text-amber-300 tracking-wider shadow-inner">
                  {Math.floor(stageTimeSeconds / 60).toString().padStart(2, '0')}:{(stageTimeSeconds % 60).toString().padStart(2, '0')}
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setStageTimerActive(!stageTimerActive)}
                    className={`px-3.5 py-2 rounded-xl text-xs font-black transition-all cursor-pointer ${
                      stageTimerActive ? 'bg-amber-500 text-slate-950' : 'bg-emerald-600 text-white hover:bg-emerald-500'
                    }`}
                  >
                    {stageTimerActive ? 'Pause' : 'Start Clock'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setStageTimerActive(false);
                      setStageTimeSeconds(1200);
                    }}
                    className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition-all cursor-pointer"
                  >
                    Reset
                  </button>
                  {schedule.length > activeLiturgyIdx + 1 && (
                    <button
                      type="button"
                      onClick={() => {
                        setActiveLiturgyIdx(prev => prev + 1);
                        setStageTimeSeconds(900); // 15 mins
                      }}
                      className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all cursor-pointer"
                    >
                      Next Item →
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-5 rounded-3xl border border-slate-200 shadow-xs">
              <div>
                <h4 className="font-black text-slate-900 text-sm">Run of Show & Order of Service Timeline</h4>
                <p className="text-xs text-slate-500">Configure exact time slots, sermon ministers, and program activities.</p>
              </div>
              <button
                onClick={() => setShowScheduleModal(true)}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md flex items-center gap-1.5 cursor-pointer shrink-0"
              >
                <Plus size={15} /> Add Agenda Slot
              </button>
            </div>

            <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-xs">
              <div className="divide-y divide-slate-100">
                {schedule.map((item, idx) => (
                  <div key={item.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/80 transition-colors">
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-700 font-extrabold flex items-center justify-center text-xs shrink-0 mt-0.5">
                        #{idx + 1}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="px-2 py-0.5 bg-amber-100 text-amber-900 rounded font-black text-[10px]">
                            {item.time_slot}
                          </span>
                          <h5 className="font-extrabold text-slate-900 text-xs">{item.activity_title}</h5>
                        </div>
                        {item.leader_or_minister && (
                          <p className="text-[11px] text-slate-500 mt-1 font-semibold">
                            Minister / Leader: <span className="text-indigo-600 font-bold">{item.leader_or_minister}</span>
                          </p>
                        )}
                        {item.notes && <p className="text-[10px] text-slate-400 italic mt-0.5">{item.notes}</p>}
                      </div>
                    </div>

                    <button
                      onClick={() => handleDeleteScheduleItem(item.id)}
                      className="p-1.5 text-slate-300 hover:text-rose-600 rounded cursor-pointer self-end sm:self-center"
                      title="Remove agenda item"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}

                {schedule.length === 0 && (
                  <p className="p-8 text-center text-slate-400 text-xs italic">No agenda schedule items added yet for this event.</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 5: PREP TASKS & ACTION ITEMS */}
        {activeTab === 'tasks' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-5 rounded-3xl border border-slate-200 shadow-xs">
              <div>
                <h4 className="font-black text-slate-900 text-sm">Event Preparation Tasks & Action Checklist</h4>
                <p className="text-xs text-slate-500">Track logistics, printing, sound checks, and volunteer preparations.</p>
              </div>
              <button
                onClick={() => setShowTaskModal(true)}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md flex items-center gap-1.5 cursor-pointer shrink-0"
              >
                <Plus size={15} /> Add Action Task
              </button>
            </div>

            <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden divide-y divide-slate-100 shadow-xs">
              {tasks.map(task => (
                <div key={task.id} className="p-4 flex items-center justify-between gap-3 hover:bg-slate-50 transition-colors text-xs">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => handleToggleTaskStatus(task.id)}
                      className={`w-6 h-6 rounded-lg flex items-center justify-center transition-colors cursor-pointer shrink-0 ${
                        task.status === 'completed' ? 'bg-emerald-500 text-white' :
                        task.status === 'in_progress' ? 'bg-amber-500 text-white' :
                        'border-2 border-slate-300 hover:border-indigo-500'
                      }`}
                    >
                      {task.status === 'completed' && <CheckCircle2 size={14} />}
                      {task.status === 'in_progress' && <Clock size={12} />}
                    </button>

                    <div>
                      <span className={`font-bold block ${task.status === 'completed' ? 'line-through text-slate-400' : 'text-slate-900'}`}>
                        {task.title}
                      </span>
                      <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-0.5">
                        <span>Assignee: <strong className="text-slate-700">{task.assignee_name || 'Event Manager'}</strong></span>
                        {task.due_date && <span>• Due: {task.due_date}</span>}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${
                      task.status === 'completed' ? 'bg-emerald-100 text-emerald-800' :
                      task.status === 'in_progress' ? 'bg-amber-100 text-amber-800' :
                      'bg-slate-100 text-slate-600'
                    }`}>
                      {task.status}
                    </span>
                    <button onClick={() => handleDeleteTask(task.id)} className="p-1 text-slate-300 hover:text-rose-600 rounded">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}

              {tasks.length === 0 && (
                <p className="p-8 text-center text-slate-400 text-xs italic">No event action tasks created yet.</p>
              )}
            </div>
          </div>
        )}

        {/* TAB 6: BUDGET & EXPENSE TRACKER */}
        {activeTab === 'budget' && (
          <div className="space-y-4">
            {/* Automated Budget Approval Governance Banner */}
            <div className="bg-slate-900 text-white p-5 rounded-3xl border border-slate-800 shadow-md space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-2xl bg-indigo-500/20 text-indigo-300 flex items-center justify-center shrink-0">
                    <ShieldCheck size={20} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black uppercase text-slate-300">Finance Officer Budget Governance</span>
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                        budgetApproval?.status === 'disbursed' ? 'bg-emerald-500 text-slate-950 font-black border border-emerald-400' :
                        budgetApproval?.status === 'approved' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' :
                        budgetApproval?.status === 'rejected' ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' :
                        budgetApproval?.status === 'pending_approval' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30 animate-pulse' :
                        'bg-slate-800 text-slate-300 border border-slate-700'
                      }`}>
                        {budgetApproval?.status === 'disbursed' ? 'APPROVED & DISBURSED ✓' : budgetApproval?.status ? budgetApproval.status.replace('_', ' ') : 'Draft / Unsubmitted'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {budgetApproval?.status === 'disbursed' ? `🎉 Funds disbursed by ${budgetApproval.disbursed_by || 'Finance Officer'}! SLE ${(budgetApproval.total_budget || 0).toLocaleString()} transferred via ${(budgetApproval.disbursement_channel || 'Bank Transfer').toUpperCase()} (Ref: ${budgetApproval.transaction_ref || 'DISB-EVT-9921'}).` :
                       budgetApproval?.status === 'approved' ? `Authorized by ${budgetApproval.approved_by || 'Finance Officer'}. Event funding requests can now be disbursed.` :
                       budgetApproval?.status === 'pending_approval' ? 'Submitted to Finance Officer. Awaiting authorization review before funding disbursement.' :
                       budgetApproval?.status === 'rejected' ? `Budget requires revision. Reason: ${budgetApproval.rejection_reason || 'See Finance notes.'}` :
                       'Formulate itemized event expenses below and submit the overall budget for Finance Officer authorization.'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={handleOpenProformaBuilder}
                    className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold rounded-xl text-xs shadow-md transition-all shrink-0 cursor-pointer flex items-center gap-1.5"
                  >
                    <FileText size={15} /> 
                    <span>{budgetApproval?.status === 'disbursed' || budgetApproval?.status === 'approved' ? 'View / Print Proforma Invoice' : 'Draft / Submit Proforma Invoice'}</span>
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs text-slate-300 pt-1">
                <span>Total Budgeted Allocation: <strong className="text-emerald-400 font-extrabold">{totalEstimated.toLocaleString()} SLE</strong></span>
                <span>Actual Disbursed to Date: <strong className="text-rose-400 font-extrabold">{totalActual.toLocaleString()} SLE</strong></span>
              </div>
            </div>

            {/* DISBURSEMENT CONFIRMATION ALERT BANNER */}
            {budgetApproval?.status === 'disbursed' && (
              <div className="p-4 bg-emerald-950/90 text-emerald-100 border border-emerald-800 rounded-3xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs font-medium shadow-md animate-in fade-in">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 text-emerald-300 flex items-center justify-center shrink-0 mt-0.5">
                    <CheckCircle2 size={20} />
                  </div>
                  <div>
                    <h5 className="font-black text-white text-sm">Funds Disbursed & Treasury Financial Ledger Settled</h5>
                    <p className="text-emerald-200/90 mt-0.5">
                      Finance Officer <strong>{budgetApproval.disbursed_by || 'Emmanuel Sesay'}</strong> processed the full budget disbursement of <strong>SLE {(budgetApproval.total_budget || 0).toLocaleString()}</strong> via <strong className="uppercase">{budgetApproval.disbursement_channel || 'Bank Transfer'}</strong>.
                    </p>
                    <div className="flex items-center gap-3 text-[11px] text-emerald-300 mt-1 font-mono">
                      <span>Transaction Ref: <strong>{budgetApproval.transaction_ref || 'DISB-EVT-9921'}</strong></span>
                      <span>• Timestamp: {budgetApproval.disbursed_at ? new Date(budgetApproval.disbursed_at).toLocaleString() : 'Executed'}</span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={downloadProformaInvoicePDF}
                  className="px-4 py-2.5 bg-emerald-400 hover:bg-emerald-300 text-slate-950 font-black rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer shrink-0 self-start sm:self-auto"
                >
                  <Printer size={15} /> Download Voucher PDF
                </button>
              </div>
            )}

            {fundingRequestSuccess && (
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center justify-between gap-3 text-emerald-800 text-xs font-bold animate-in fade-in">
                <div className="flex items-center gap-2">
                  <CheckCircle size={18} className="text-emerald-600 shrink-0" />
                  <span>{fundingRequestSuccess}</span>
                </div>
                <button onClick={() => setFundingRequestSuccess(null)} className="p-1 hover:bg-emerald-100 rounded text-emerald-600 cursor-pointer">
                  <X size={14} />
                </button>
              </div>
            )}

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-5 rounded-3xl border border-slate-200 shadow-xs">
              <div>
                <h4 className="font-black text-slate-900 text-sm">Budget Allocation & Itemized Expenses</h4>
                <p className="text-xs text-slate-500">Track sound equipment rentals, guest speaker honorariums, and refreshments in SLE.</p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={handleOpenProformaBuilder}
                  className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md flex items-center gap-1.5 cursor-pointer shrink-0"
                >
                  <FileText size={15} /> Multi-Item Proforma Invoice
                </button>
                <button
                  onClick={downloadBudgetVsActualPDF}
                  className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold shadow-md flex items-center gap-1.5 cursor-pointer shrink-0"
                >
                  <Printer size={15} /> Export Budget vs Actual PDF
                </button>
                <button
                  onClick={() => setShowFundingModal(true)}
                  className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md flex items-center gap-1.5 cursor-pointer shrink-0"
                >
                  <Send size={15} /> Request Funding
                </button>
                <button
                  onClick={() => setShowExpenseModal(true)}
                  className="px-3.5 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold shadow-md flex items-center gap-1.5 cursor-pointer shrink-0"
                >
                  <Plus size={15} /> Add Expense Item
                </button>
              </div>
            </div>

            {/* RECHARTS SIDE-BY-SIDE BAR CHART VISUALIZATION */}
            <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                <div>
                  <h4 className="font-extrabold text-slate-900 text-sm flex items-center gap-2">
                    <BarChart3 size={18} className="text-indigo-600" />
                    <span>Budgeted vs. Actual Expenses Variance Chart</span>
                  </h4>
                  <p className="text-xs text-slate-500">Visual side-by-side bar chart comparing allocated budget vs actual costs incurred (in SLE).</p>
                </div>
                <div className="flex items-center gap-3 text-xs font-bold shrink-0">
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-xs bg-indigo-600 inline-block" /> Budgeted (SLE)</span>
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-xs bg-rose-500 inline-block" /> Actual Cost (SLE)</span>
                </div>
              </div>

              {expenses.length === 0 ? (
                <div className="p-8 text-center text-slate-400 italic text-xs bg-slate-50 rounded-2xl">
                  Add expense items to render the side-by-side budget variance chart.
                </div>
              ) : (
                <div className="h-72 w-full pt-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={expenses.map(e => ({
                        name: e.item_name.length > 18 ? `${e.item_name.slice(0, 18)}...` : e.item_name,
                        fullName: e.item_name,
                        category: e.category,
                        Budgeted: e.estimated_cost || 0,
                        Actual: e.actual_cost || 0,
                        Variance: (e.estimated_cost || 0) - (e.actual_cost || 0)
                      }))}
                      margin={{ top: 10, right: 20, left: 0, bottom: 25 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis 
                        dataKey="name" 
                        tick={{ fontSize: 11, fill: '#475569', fontWeight: 600 }} 
                        interval={0}
                        angle={-15}
                        textAnchor="end"
                      />
                      <YAxis 
                        tick={{ fontSize: 11, fill: '#64748b' }} 
                        unit=" SLE"
                      />
                      <Tooltip 
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const data = payload[0].payload;
                            const isUnder = data.Variance >= 0;
                            return (
                              <div className="bg-slate-900 text-white p-3 rounded-xl shadow-xl text-xs space-y-1 border border-slate-700">
                                <strong className="block text-indigo-300 font-extrabold">{data.fullName}</strong>
                                <span className="text-[10px] text-slate-400 block font-bold uppercase">{data.category}</span>
                                <div className="pt-1.5 border-t border-slate-800 space-y-0.5">
                                  <p className="flex justify-between gap-4"><span>Budgeted:</span> <strong className="text-indigo-400">{data.Budgeted.toLocaleString()} SLE</strong></p>
                                  <p className="flex justify-between gap-4"><span>Actual Cost:</span> <strong className="text-rose-400">{data.Actual.toLocaleString()} SLE</strong></p>
                                  <p className="flex justify-between gap-4">
                                    <span>Variance Status:</span> 
                                    <strong className={isUnder ? 'text-emerald-400' : 'text-rose-400'}>
                                      {isUnder ? `+${data.Variance.toLocaleString()} SLE (Under)` : `${data.Variance.toLocaleString()} SLE (Over)`}
                                    </strong>
                                  </p>
                                </div>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <Bar dataKey="Budgeted" fill="#4f46e5" radius={[6, 6, 0, 0]} maxBarSize={40} />
                      <Bar dataKey="Actual" fill="#f43f5e" radius={[6, 6, 0, 0]} maxBarSize={40} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            {/* Expense Table */}
            <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs min-w-[500px]">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-extrabold uppercase text-[10px]">
                      <th className="p-4">Expense Item</th>
                      <th className="p-4">Category</th>
                      <th className="p-4">Estimated (SLE)</th>
                      <th className="p-4">Actual Cost (SLE)</th>
                      <th className="p-4">Payment Status</th>
                      <th className="p-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                    {expenses.map(item => (
                      <tr key={item.id} className="hover:bg-slate-50">
                        <td className="p-4 font-bold text-slate-900">{item.item_name}</td>
                        <td className="p-4"><span className="px-2 py-0.5 bg-slate-100 rounded text-[10px] font-bold">{item.category}</span></td>
                        <td className="p-4 font-bold text-slate-500">{item.estimated_cost?.toLocaleString()} SLE</td>
                        <td className="p-4 font-extrabold text-slate-900">{item.actual_cost?.toLocaleString()} SLE</td>
                        <td className="p-4">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                            item.status === 'paid' ? 'bg-emerald-100 text-emerald-800' :
                            item.status === 'pending' ? 'bg-amber-100 text-amber-800' :
                            'bg-slate-100 text-slate-600'
                          }`}>
                            {item.status}
                          </span>
                        </td>
                        <td className="p-4 text-right">
                          <button onClick={() => handleDeleteExpense(item.id)} className="p-1 text-slate-300 hover:text-rose-600 cursor-pointer">
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                    {expenses.length === 0 && (
                      <tr>
                        <td colSpan={6} className="p-8 text-center text-slate-400 italic">No budget expense items added yet. Click "Add Expense Item" to begin planning.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Submitted Requisitions to Finance Officer */}
            <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs space-y-3">
              <div className="flex items-center justify-between border-b pb-3">
                <h4 className="font-extrabold text-slate-900 text-xs flex items-center gap-2">
                  <FileCheck size={16} className="text-emerald-600" />
                  <span>Submitted Requisitions to Finance Officer</span>
                </h4>
                <span className="text-[11px] text-slate-400 font-bold">Auto-synced with Finance Console</span>
              </div>

              <div className="space-y-2">
                {getRequisitions()
                  .filter(r => r.department_name === `Event: ${event.title}` || r.title.includes(event.title))
                  .map(req => (
                    <div key={req.id} className="p-3 bg-slate-50 rounded-2xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-black text-indigo-700">{req.requisition_number}</span>
                          <span className="font-bold text-slate-800">{req.title}</span>
                        </div>
                        <p className="text-[10px] text-slate-500 mt-0.5">{req.description}</p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="font-extrabold text-slate-900 text-xs">{req.requested_amount.toLocaleString()} SLE</span>
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase ${
                          req.status === 'approved' ? 'bg-emerald-100 text-emerald-800' :
                          req.status === 'disbursed' ? 'bg-blue-100 text-blue-800' :
                          req.status === 'rejected' ? 'bg-rose-100 text-rose-800' :
                          'bg-amber-100 text-amber-800'
                        }`}>
                          {req.status.replace('_', ' ')}
                        </span>
                      </div>
                    </div>
                  ))}

                {getRequisitions().filter(r => r.department_name === `Event: ${event.title}` || r.title.includes(event.title)).length === 0 && (
                  <p className="text-[11px] text-slate-400 italic text-center py-2">No formal funding proposals submitted to Finance yet for this event.</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB: PHYSICAL RESOURCES & INVENTORY ALLOCATION (LINKED TO BUDGET) */}
        {activeTab === 'resources' && (
          <div className="space-y-6">
            {resourceSuccessMsg && (
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center justify-between gap-3 text-emerald-800 text-xs font-bold animate-in fade-in">
                <div className="flex items-center gap-2">
                  <CheckCircle size={18} className="text-emerald-600 shrink-0" />
                  <span>{resourceSuccessMsg}</span>
                </div>
                <button onClick={() => setResourceSuccessMsg(null)} className="p-1 hover:bg-emerald-100 rounded text-emerald-600 cursor-pointer">
                  <X size={14} />
                </button>
              </div>
            )}

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-5 rounded-3xl border border-slate-200 shadow-xs">
              <div>
                <h4 className="font-black text-slate-900 text-sm flex items-center gap-2">
                  <Package size={18} className="text-indigo-600" />
                  <span>Church Physical Resources & Equipment Reservation</span>
                </h4>
                <p className="text-xs text-slate-500">Reserve sanctuary halls, banquet chairs, sound consoles, and power generators. Costs link directly to Event Budget.</p>
              </div>
              <button
                onClick={() => setShowReserveModal(true)}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md flex items-center gap-1.5 cursor-pointer shrink-0"
              >
                <Plus size={15} /> Reserve Church Resource
              </button>
            </div>

            {/* Reserved Resources for this Event */}
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b pb-3">
                <h4 className="font-extrabold text-slate-900 text-xs uppercase tracking-wider text-slate-500">
                  Confirmed Resource Reservations for {event.title}
                </h4>
                <span className="text-[11px] font-black text-indigo-600">
                  Total Equipment Cost: {eventReservations.reduce((sum, r) => sum + r.rental_cost_sle, 0).toLocaleString()} SLE (Auto-posted to Budget)
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {eventReservations.map(resv => (
                  <div key={resv.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-200 shadow-2xs space-y-2 flex flex-col justify-between">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-indigo-100 text-indigo-900">
                          {resv.category}
                        </span>
                        <h5 className="font-extrabold text-slate-900 text-sm mt-1">{resv.resource_name}</h5>
                        {resv.notes && <p className="text-[11px] text-slate-500 italic mt-0.5">{resv.notes}</p>}
                      </div>
                      <span className="px-2.5 py-0.5 bg-emerald-100 text-emerald-800 rounded-full text-[10px] font-black uppercase">
                        ✓ {resv.status}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-200">
                      <span className="font-bold text-slate-700">Reserved Quantity: <strong>{resv.quantity_reserved} units</strong></span>
                      <div className="flex items-center gap-2">
                        <span className="font-black text-emerald-700">{resv.rental_cost_sle.toLocaleString()} SLE</span>
                        <button
                          type="button"
                          onClick={() => handleCancelReservation(resv.id)}
                          className="p-1 text-slate-400 hover:text-rose-600 rounded hover:bg-rose-50 transition-colors cursor-pointer"
                          title="Cancel Reservation & Unlink Cost"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}

                {eventReservations.length === 0 && (
                  <div className="col-span-2 p-8 text-center bg-slate-50 rounded-2xl border border-slate-200 text-slate-400 italic text-xs">
                    No physical church resources reserved yet for this event. Click "Reserve Church Resource" to allocate chairs, sound, or halls.
                  </div>
                )}
              </div>
            </div>

            {/* Church Inventory Catalog */}
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
              <h4 className="font-extrabold text-slate-900 text-xs uppercase tracking-wider text-slate-500">
                Grace Cathedral Master Equipment & Room Inventory Catalog
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
                {churchResources.map(r => (
                  <div key={r.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2 flex flex-col justify-between hover:border-indigo-300 transition-all">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="px-2 py-0.5 bg-slate-200 text-slate-700 rounded text-[9px] font-bold uppercase">{r.category}</span>
                        <span className="text-[10px] font-bold text-emerald-600">{r.available_quantity} / {r.total_quantity} Available</span>
                      </div>
                      <h5 className="font-black text-slate-900 text-xs">{r.name}</h5>
                      <p className="text-[10px] text-slate-400 mt-0.5">Location: {r.location}</p>
                    </div>

                    <div className="pt-2 border-t border-slate-200 flex items-center justify-between">
                      <span className="font-extrabold text-slate-800">{r.unit_rental_cost_sle.toLocaleString()} SLE <span className="text-[9px] font-normal text-slate-400">/unit</span></span>
                      <button
                        onClick={() => {
                          setSelectedResourceId(r.id);
                          setReserveQty(1);
                          setShowReserveModal(true);
                        }}
                        className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg transition-all text-[11px] cursor-pointer"
                      >
                        Reserve Item
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB: POST-EVENT SURVEY & SENTIMENT ANALYTICS */}
        {activeTab === 'survey' && (
          <div className="space-y-6">
            {surveySuccessMsg && (
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center justify-between text-emerald-800 text-xs font-bold animate-in fade-in">
                <span>{surveySuccessMsg}</span>
                <button onClick={() => setSurveySuccessMsg(null)} className="p-1 text-emerald-600"><X size={14} /></button>
              </div>
            )}

            {surveyCopyMsg && (
              <div className="p-4 bg-indigo-50 border border-indigo-200 rounded-2xl flex items-center justify-between text-indigo-800 text-xs font-bold animate-in fade-in">
                <span>{surveyCopyMsg}</span>
                <button onClick={() => setSurveyCopyMsg(null)} className="p-1 text-indigo-600"><X size={14} /></button>
              </div>
            )}

            {/* Automated Survey Distribution Banner */}
            <div className="bg-gradient-to-r from-indigo-900 via-indigo-800 to-indigo-900 text-white p-6 rounded-3xl shadow-xl border border-indigo-700 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-indigo-700 pb-4">
                <div>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-400 text-slate-950">
                    Automated Survey Broadcast Engine
                  </span>
                  <h3 className="text-xl font-black mt-1">Post-Event Congregant Feedback Link</h3>
                  <p className="text-xs text-indigo-200 mt-0.5">
                    Automatically emails/SMS post-event feedback surveys to all checked-in attendees upon event conclusion.
                  </p>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={handleCopySurveyLink}
                    className="px-4 py-2.5 bg-indigo-700 hover:bg-indigo-600 text-white rounded-xl text-xs font-bold shadow-md flex items-center gap-1.5 cursor-pointer transition-all border border-indigo-600"
                  >
                    <Copy size={15} /> Copy Survey Link
                  </button>

                  <button
                    onClick={() => {
                      setSurveySuccessMsg(`🎉 Post-event survey link sent to ${checkedInCount || registeredCount} attendees!`);
                      setTimeout(() => setSurveySuccessMsg(null), 4000);
                    }}
                    className="px-4 py-2.5 bg-amber-400 hover:bg-amber-300 text-slate-950 rounded-xl text-xs font-black shadow-md flex items-center gap-1.5 cursor-pointer transition-all"
                  >
                    <Send size={15} /> Broadcast Survey to Attendees
                  </button>
                </div>
              </div>

              <div className="text-xs text-indigo-200 flex flex-wrap items-center justify-between gap-2 font-mono">
                <span>Direct Survey Link: <strong className="text-white underline">{window.location.origin}/survey/{event.id}</strong></span>
                <span className="font-sans font-bold text-amber-300">{sentimentSummary.total_responses} Responses Received</span>
              </div>
            </div>

            {/* Sentiment Summary Analytics Bar */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Overall Experience</span>
                <div className="text-2xl font-black text-indigo-600">⭐ {sentimentSummary.avg_overall_rating} / 5.0</div>
                <p className="text-[10px] text-slate-500 font-medium">From {sentimentSummary.total_responses} congregants</p>
              </div>

              <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Spiritual Impact Rating</span>
                <div className="text-2xl font-black text-purple-600">✝ {sentimentSummary.avg_spiritual_rating} / 5.0</div>
                <p className="text-[10px] text-slate-500 font-medium">Sermon & altar call score</p>
              </div>

              <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Sound & Media Quality</span>
                <div className="text-2xl font-black text-emerald-600">🎵 {sentimentSummary.avg_sound_rating} / 5.0</div>
                <p className="text-[10px] text-slate-500 font-medium">A/V clarity & choir band</p>
              </div>

              <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Overall Sentiment Index</span>
                <div className="text-xl font-black text-emerald-700">{sentimentSummary.overall_sentiment_label}</div>
                <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase bg-emerald-100 text-emerald-800 inline-block">
                  {sentimentSummary.positive_percentage}% Positive Sentiment
                </span>
              </div>
            </div>

            {/* Sentiment Analysis Ratio Bar & PDF Export */}
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                <div>
                  <h4 className="font-black text-slate-900 text-sm">Aggregated Congregant Sentiment Analysis</h4>
                  <p className="text-xs text-slate-500">Distribution of positive, neutral, and constructive feedback entries.</p>
                </div>
                <button
                  onClick={downloadSentimentReportPDF}
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold shadow-md flex items-center gap-1.5 cursor-pointer shrink-0"
                >
                  <Printer size={15} /> Export Sentiment Report PDF
                </button>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-bold">
                  <span className="text-emerald-700">Positive Feedback: {sentimentSummary.positive_percentage}%</span>
                  <span className="text-amber-700">Neutral Feedback: {sentimentSummary.neutral_percentage}%</span>
                  <span className="text-slate-600">Constructive Suggestions: {sentimentSummary.constructive_percentage}%</span>
                </div>

                <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden flex">
                  <div className="bg-emerald-500 h-full transition-all duration-300" style={{ width: `${sentimentSummary.positive_percentage}%` }} title="Positive" />
                  <div className="bg-amber-400 h-full transition-all duration-300" style={{ width: `${sentimentSummary.neutral_percentage}%` }} title="Neutral" />
                  <div className="bg-slate-400 h-full transition-all duration-300" style={{ width: `${sentimentSummary.constructive_percentage}%` }} title="Constructive" />
                </div>
              </div>
            </div>

            {/* Form: Record New Congregant Feedback & Roster */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-1 bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
                <h4 className="font-extrabold text-slate-900 text-sm border-b pb-3">Submit Congregant Survey Entry</h4>

                <form onSubmit={handleSubmitSurveyFeedback} className="space-y-3 text-xs">
                  <div>
                    <label className="font-extrabold text-slate-700 block mb-1">Congregant Name (Optional)</label>
                    <input
                      type="text"
                      placeholder="e.g. Sister Mary Koroma or Anonymous"
                      value={surveyRespondentName}
                      onChange={e => setSurveyRespondentName(e.target.value)}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="font-extrabold text-slate-700 block mb-1">Overall (1-5 ⭐)</label>
                      <select
                        value={surveyOverall}
                        onChange={e => setSurveyOverall(Number(e.target.value))}
                        className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl font-bold cursor-pointer"
                      >
                        <option value={5}>5 ⭐ (Excellent)</option>
                        <option value={4}>4 ⭐ (Very Good)</option>
                        <option value={3}>3 ⭐ (Average)</option>
                        <option value={2}>2 ⭐ (Fair)</option>
                        <option value={1}>1 ⭐ (Poor)</option>
                      </select>
                    </div>

                    <div>
                      <label className="font-extrabold text-slate-700 block mb-1">Spiritual Impact</label>
                      <select
                        value={surveySpiritual}
                        onChange={e => setSurveySpiritual(Number(e.target.value))}
                        className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl font-bold cursor-pointer"
                      >
                        <option value={5}>5 ✝ (Anointed)</option>
                        <option value={4}>4 ✝ (Inspiring)</option>
                        <option value={3}>3 ✝ (Good)</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="font-extrabold text-slate-700 block mb-1">Sound & Media</label>
                      <select
                        value={surveySound}
                        onChange={e => setSurveySound(Number(e.target.value))}
                        className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl font-bold cursor-pointer"
                      >
                        <option value={5}>5 🎵 (Crystal Clear)</option>
                        <option value={4}>4 🎵 (Good Sound)</option>
                        <option value={3}>3 🎵 (Moderate)</option>
                      </select>
                    </div>

                    <div>
                      <label className="font-extrabold text-slate-700 block mb-1">Hospitality</label>
                      <select
                        value={surveyHospitality}
                        onChange={e => setSurveyHospitality(Number(e.target.value))}
                        className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl font-bold cursor-pointer"
                      >
                        <option value={5}>5 👥 (Welcoming)</option>
                        <option value={4}>4 👥 (Good Care)</option>
                        <option value={3}>3 👥 (Fair)</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="font-extrabold text-slate-700 block mb-1">Feedback Comments & Testimonials *</label>
                    <textarea
                      rows={3}
                      required
                      placeholder="Share highlights, sermon reception, or suggestions for the next program..."
                      value={surveyFeedbackText}
                      onChange={e => setSurveyFeedbackText(e.target.value)}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold rounded-xl shadow-md cursor-pointer transition-all flex items-center justify-center gap-1.5"
                  >
                    <MessageSquareText size={16} /> Submit Feedback Entry
                  </button>
                </form>
              </div>

              {/* Roster of Survey Comments & Quotes */}
              <div className="lg:col-span-2 bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
                <h4 className="font-extrabold text-slate-900 text-sm border-b pb-3">Congregant Survey Feedback Comments Roster</h4>

                <div className="space-y-3 max-h-[460px] overflow-y-auto pr-1">
                  {surveyResponses.map(r => (
                    <div key={r.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-200 text-xs space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <strong className="font-black text-slate-900">{r.respondent_name}</strong>
                          <span className="text-[10px] text-slate-400">• {new Date(r.submitted_at).toLocaleDateString()}</span>
                        </div>
                        <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${
                          r.sentiment === 'Positive' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                        }`}>
                          {r.sentiment}
                        </span>
                      </div>

                      <div className="flex items-center gap-3 text-[10px] font-bold text-slate-600 bg-white p-2 rounded-xl border border-slate-100">
                        <span>Overall: ⭐ {r.overall_rating}/5</span>
                        <span>Spiritual: ✝ {r.spiritual_impact_rating}/5</span>
                        <span>Sound: 🎵 {r.sound_media_rating}/5</span>
                        <span>Hospitality: 👥 {r.hospitality_rating}/5</span>
                      </div>

                      <p className="text-slate-700 italic leading-relaxed font-medium">"{r.feedback_text}"</p>
                    </div>
                  ))}

                  {surveyResponses.length === 0 && (
                    <p className="p-8 text-center text-slate-400 italic text-xs">No congregant survey feedback entries recorded yet for this event.</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 7: POST-EVENT CLOSEOUT REPORT */}
        {activeTab === 'report' && (
          <div className="space-y-6">
            {reportSavedMessage && (
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center justify-between text-emerald-800 text-xs font-bold animate-in fade-in">
                <span>{reportSavedMessage}</span>
                <button onClick={() => setReportSavedMessage(null)} className="p-1 text-emerald-600"><X size={14} /></button>
              </div>
            )}

            {/* Summary Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Total Intakes / Collections</span>
                <div className="text-xl sm:text-2xl font-black text-emerald-600">{reportRevenue.toLocaleString()} SLE</div>
                <p className="text-[10px] text-slate-500">Offerings, tickets & donations</p>
              </div>

              <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Actual Event Expenses</span>
                <div className="text-xl sm:text-2xl font-black text-rose-600">{totalActual.toLocaleString()} SLE</div>
                <p className="text-[10px] text-slate-500">Itemized expenses disbursed</p>
              </div>

              <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Net Operating Position</span>
                <div className={`text-xl sm:text-2xl font-black ${reportRevenue - totalActual >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                  {(reportRevenue - totalActual).toLocaleString()} SLE
                </div>
                <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase inline-block ${
                  reportRevenue - totalActual >= 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                }`}>
                  {reportRevenue - totalActual >= 0 ? 'Surplus' : 'Deficit'}
                </span>
              </div>

              <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Attendance & Converts</span>
                <div className="text-xl sm:text-2xl font-black text-indigo-600">{checkedInCount} Scanned</div>
                <p className="text-[10px] text-slate-500 font-bold text-amber-700">✝ {reportSoulsSaved} Altar Call Converts</p>
              </div>
            </div>

            {/* Editable Closeout Report Form */}
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
                <div>
                  <h3 className="text-base font-black text-slate-900">Post-Event Operational & Financial Closeout Data</h3>
                  <p className="text-xs text-slate-500">Submit final metrics and sermon outcomes for Church Board review.</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => window.print()}
                    className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold shadow-md flex items-center gap-1.5 cursor-pointer"
                  >
                    <Printer size={15} /> Print PDF Closeout Report
                  </button>
                </div>
              </div>

              <form onSubmit={handleSaveCloseoutReport} className="space-y-4 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="font-extrabold text-slate-700 block mb-1">Total Revenue Collections / Intakes (SLE) *</label>
                    <input
                      type="number"
                      min={0}
                      required
                      value={reportRevenue}
                      onChange={e => setReportRevenue(Number(e.target.value))}
                      className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <p className="text-[10px] text-slate-400 mt-1">Sum of altar offerings, ticket passes, pledges & external donations</p>
                  </div>

                  <div>
                    <label className="font-extrabold text-slate-700 block mb-1">New Believers / Altar Call Converts Count *</label>
                    <input
                      type="number"
                      min={0}
                      required
                      value={reportSoulsSaved}
                      onChange={e => setReportSoulsSaved(Number(e.target.value))}
                      className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <p className="text-[10px] text-slate-400 mt-1">First-timers and congregants who surrendered to Christ</p>
                  </div>
                </div>

                <div>
                  <label className="font-extrabold text-slate-700 block mb-1">Spiritual Impact & Sermon Keynote Outcomes</label>
                  <textarea
                    rows={3}
                    placeholder="Describe the spiritual atmosphere, prayer responses, guest speaker reception, and worship highlights..."
                    value={reportNotes}
                    onChange={e => setReportNotes(e.target.value)}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-medium outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="font-extrabold text-slate-700 block mb-1">Lessons Learned & Recommendations for Future Events</label>
                  <textarea
                    rows={3}
                    placeholder="E.g., Start sound check 1 hour earlier; increase ushering team headcount; procure 2 additional microphones..."
                    value={reportRecommendations}
                    onChange={e => setReportRecommendations(e.target.value)}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-medium outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="submit"
                    className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold rounded-xl shadow-md transition-all flex items-center gap-2 cursor-pointer"
                  >
                    <CheckCircle2 size={16} /> Save Closeout Data
                  </button>
                </div>
              </form>
            </div>

            {/* PRINTABLE PDF REPORT CARD PREVIEW */}
            <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-lg space-y-6 print:shadow-none print:border-none">
              <div className="border-b border-slate-200 pb-5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                  <div className="flex items-center gap-2 text-indigo-600 font-black text-sm uppercase tracking-wider">
                    <Sparkles className="w-5 h-5 text-indigo-600" /> GRACE CATHEDRAL DIOCESE
                  </div>
                  <h2 className="text-xl font-black text-slate-900 mt-1">OFFICIAL EVENT CLOSEOUT & AUDIT REPORT</h2>
                  <p className="text-xs text-slate-500">Generated on {new Date().toLocaleDateString('en-US', { dateStyle: 'full' })}</p>
                </div>

                <div className="text-right text-xs space-y-0.5">
                  <p className="font-bold text-slate-800">Event Title: <span className="text-indigo-600">{event.title}</span></p>
                  <p className="text-slate-500">Category: {event.category}</p>
                  <p className="text-slate-500">Date: {new Date(event.start_time).toLocaleDateString()}</p>
                </div>
              </div>

              {/* Attendance & Financial Statement Table */}
              <div className="space-y-4">
                <h4 className="font-black text-xs uppercase tracking-wider text-slate-400">1. Executive Summary & Financial Audit</h4>
                
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-200 text-xs">
                  <div>
                    <span className="text-slate-500 block text-[10px] font-bold">Total RSVPs</span>
                    <strong className="text-slate-900 text-sm">{registeredCount}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px] font-bold">Sanctuary Check-Ins</span>
                    <strong className="text-indigo-600 text-sm">{checkedInCount} ({registeredCount > 0 ? Math.round((checkedInCount / registeredCount) * 100) : 100}%)</strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px] font-bold">Total Intake Revenue</span>
                    <strong className="text-emerald-600 text-sm">{reportRevenue.toLocaleString()} SLE</strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px] font-bold">Net Financial Balance</span>
                    <strong className={`text-sm ${reportRevenue - totalActual >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                      {(reportRevenue - totalActual).toLocaleString()} SLE
                    </strong>
                  </div>
                </div>
              </div>

              {/* Itemized Expenses Breakdown */}
              <div className="space-y-3">
                <h4 className="font-black text-xs uppercase tracking-wider text-slate-400">2. Itemized Expenditure Audit</h4>
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-100 text-slate-600 font-bold uppercase text-[10px]">
                      <th className="p-2">Item Description</th>
                      <th className="p-2">Category</th>
                      <th className="p-2 text-right">Actual Cost (SLE)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {expenses.map((e, idx) => (
                      <tr key={idx}>
                        <td className="p-2 font-medium text-slate-800">{e.item_name}</td>
                        <td className="p-2 text-slate-500">{e.category}</td>
                        <td className="p-2 text-right font-extrabold text-slate-900">{e.actual_cost?.toLocaleString()} SLE</td>
                      </tr>
                    ))}
                    <tr className="bg-slate-50 font-black text-slate-900">
                      <td colSpan={2} className="p-2 text-right uppercase text-[10px]">Total Expenses:</td>
                      <td className="p-2 text-right text-rose-600">{totalActual.toLocaleString()} SLE</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Notes & Recommendations */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs pt-4 border-t border-slate-200">
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-1">
                  <strong className="text-slate-900 font-extrabold block">Spiritual Outcomes & Altar Calls:</strong>
                  <p className="text-slate-600 leading-relaxed italic">{reportNotes || 'Glorious service with heavy presence of God and active congregation participation.'}</p>
                </div>

                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-1">
                  <strong className="text-slate-900 font-extrabold block">Committee Recommendations:</strong>
                  <p className="text-slate-600 leading-relaxed italic">{reportRecommendations || 'Maintain current sound setup and continue early registration check-ins.'}</p>
                </div>
              </div>

              <div className="pt-6 border-t border-slate-200 flex justify-between items-center text-[10px] text-slate-400">
                <span>Grace Cathedral Financial & Event Management System</span>
                <span>Page 1 of 1 • Internal Board Confidential</span>
              </div>
            </div>
          </div>
        )}

        {/* TAB 7: CONGREGANT RSVPS & ATTENDEE LIST */}
        {activeTab === 'rsvps' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-5 rounded-3xl border border-slate-200 shadow-xs">
              <div>
                <h4 className="font-black text-slate-900 text-sm">Congregant RSVP & Seat Registration Roster</h4>
                <p className="text-xs text-slate-500">{registeredCount} Registered Attendees for {event.title}</p>
              </div>
            </div>

            <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden divide-y divide-slate-100 shadow-xs">
              {evtRegistrations.map(reg => (
                <div key={reg.id} className="p-4 flex items-center justify-between text-xs hover:bg-slate-50">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 font-black flex items-center justify-center text-xs shrink-0">
                      {reg.member_name.charAt(0)}
                    </div>
                    <div>
                      <p className="font-extrabold text-slate-900">{reg.member_name}</p>
                      <p className="text-[10px] text-slate-400">{reg.email} {reg.phone ? `• ${reg.phone}` : ''}</p>
                    </div>
                  </div>
                  <span className={`px-2.5 py-0.5 rounded-md text-[10px] font-black uppercase ${
                    (reg.status === 'checked_in' || reg.status === 'attended') ? 'bg-emerald-100 text-emerald-800' : reg.status === 'absent' ? 'bg-rose-100 text-rose-800' : reg.status === 'waitlist' ? 'bg-amber-100 text-amber-800' : 'bg-indigo-100 text-indigo-800'
                  }`}>
                    {reg.status}
                  </span>
                </div>
              ))}

              {evtRegistrations.length === 0 && (
                <p className="p-8 text-center text-slate-400 italic text-xs">No registered RSVPs found yet for this event.</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* MODAL: Appoint Team Role */}
      {showRoleModal && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-[130]">
          <div className="bg-white rounded-3xl p-5 max-w-md w-full border border-slate-200 shadow-2xl space-y-4">
            <div className="flex justify-between items-center pb-2 border-b">
              <h4 className="font-extrabold text-slate-900 text-sm">Appoint Event Committee Role</h4>
              <button onClick={() => setShowRoleModal(false)} className="p-1 text-slate-400"><X size={18} /></button>
            </div>

            <form onSubmit={handleAddRole} className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Appointment Role Title *</label>
                <select
                  value={roleTitle}
                  onChange={e => setRoleTitle(e.target.value as any)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold cursor-pointer"
                >
                  <option value="Event Manager">Event Manager / Director</option>
                  <option value="Worship & Music Lead">Worship & Music Lead</option>
                  <option value="Logistics & Ushering">Logistics & Ushering Coordinator</option>
                  <option value="Media & Live Stream">Media & Live Stream Specialist</option>
                  <option value="Hospitality & Catering">Hospitality & Catering Lead</option>
                  <option value="Prayer Coordinator">Prayer Coordinator</option>
                  <option value="Volunteer Worker">Volunteer Worker</option>
                </select>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Select Existing Congregation Member</label>
                <select
                  value={roleMemberId}
                  onChange={e => {
                    setRoleMemberId(e.target.value);
                    const found = members.find(m => m.id === e.target.value);
                    if (found) {
                      setRoleCustomName(`${found.first_name} ${found.last_name}`);
                      setRolePhone(found.phone || '');
                      setRoleEmail(found.email || '');
                    }
                  }}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium cursor-pointer"
                >
                  <option value="">-- Choose from Roster --</option>
                  {members.map(m => (
                    <option key={m.id} value={m.id}>{m.first_name} {m.last_name} ({m.primary_role})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Appointee Full Name *</label>
                <input
                  type="text"
                  required
                  placeholder="John Doe"
                  value={roleCustomName}
                  onChange={e => setRoleCustomName(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-bold text-slate-500 block mb-1">Phone</label>
                  <input
                    type="text"
                    placeholder="+1 (555) 000-0000"
                    value={rolePhone}
                    onChange={e => setRolePhone(e.target.value)}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-500 block mb-1">Email</label>
                  <input
                    type="email"
                    placeholder="john@example.com"
                    value={roleEmail}
                    onChange={e => setRoleEmail(e.target.value)}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t">
                <button type="button" onClick={() => setShowRoleModal(false)} className="px-3 py-1.5 font-bold text-slate-500 cursor-pointer">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 cursor-pointer">Confirm Appointment</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Add Schedule / Run of Show */}
      {showScheduleModal && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-[130]">
          <div className="bg-white rounded-3xl p-5 max-w-md w-full border border-slate-200 shadow-2xl space-y-4">
            <div className="flex justify-between items-center pb-2 border-b">
              <h4 className="font-extrabold text-slate-900 text-sm">Add Program Schedule Agenda Item</h4>
              <button onClick={() => setShowScheduleModal(false)} className="p-1 text-slate-400 cursor-pointer"><X size={18} /></button>
            </div>

            <form onSubmit={handleAddScheduleItem} className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Time Slot *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 09:30 AM - 10:15 AM"
                  value={schedTimeSlot}
                  onChange={e => setSchedTimeSlot(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Activity / Session Title *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Praise & High Worship Ministration"
                  value={schedTitle}
                  onChange={e => setSchedTitle(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Minister / Leader in Charge</label>
                <input
                  type="text"
                  placeholder="e.g. Grace Choir & Pastor John"
                  value={schedMinister}
                  onChange={e => setSchedMinister(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Special Notes / Stage Instructions</label>
                <input
                  type="text"
                  placeholder="e.g. Turn on altar spotlight and mic 3"
                  value={schedNotes}
                  onChange={e => setSchedNotes(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t">
                <button type="button" onClick={() => setShowScheduleModal(false)} className="px-3 py-1.5 font-bold text-slate-500 cursor-pointer">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 cursor-pointer">Add to Agenda</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Add Action Task */}
      {showTaskModal && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-[130]">
          <div className="bg-white rounded-3xl p-5 max-w-md w-full border border-slate-200 shadow-2xl space-y-4">
            <div className="flex justify-between items-center pb-2 border-b">
              <h4 className="font-extrabold text-slate-900 text-sm">Add Prep Action Task</h4>
              <button onClick={() => setShowTaskModal(false)} className="p-1 text-slate-400 cursor-pointer"><X size={18} /></button>
            </div>

            <form onSubmit={handleAddTask} className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Task Title / Description *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Confirm sound system mic testing"
                  value={taskTitle}
                  onChange={e => setTaskTitle(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Assignee</label>
                <input
                  type="text"
                  placeholder="e.g. Media Lead or Logistics Committee"
                  value={taskAssignee}
                  onChange={e => setTaskAssignee(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Target Due Date</label>
                <input
                  type="date"
                  value={taskDueDate}
                  onChange={e => setTaskDueDate(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t">
                <button type="button" onClick={() => setShowTaskModal(false)} className="px-3 py-1.5 font-bold text-slate-500 cursor-pointer">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 cursor-pointer">Save Task</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Add Expense */}
      {showExpenseModal && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-[130]">
          <div className="bg-white rounded-3xl p-5 max-w-md w-full border border-slate-200 shadow-2xl space-y-4">
            <div className="flex justify-between items-center pb-2 border-b">
              <h4 className="font-extrabold text-slate-900 text-sm">Add Itemized Expense</h4>
              <button onClick={() => setShowExpenseModal(false)} className="p-1 text-slate-400 cursor-pointer"><X size={18} /></button>
            </div>

            <form onSubmit={handleAddExpense} className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Expense Item Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Guest Speaker Honorarium & Lodging"
                  value={expName}
                  onChange={e => setExpName(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Estimated ($)</label>
                  <input
                    type="number"
                    min={0}
                    value={expEstCost}
                    onChange={e => setExpEstCost(Number(e.target.value))}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Actual ($)</label>
                  <input
                    type="number"
                    min={0}
                    value={expActCost}
                    onChange={e => setExpActCost(Number(e.target.value))}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Payment Status</label>
                <select
                  value={expStatus}
                  onChange={e => setExpStatus(e.target.value as any)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold cursor-pointer"
                >
                  <option value="planned">Planned / Quoted</option>
                  <option value="pending">Pending Approval</option>
                  <option value="paid">Paid & Settled</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t">
                <button type="button" onClick={() => setShowExpenseModal(false)} className="px-3 py-1.5 font-bold text-slate-500 cursor-pointer">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 cursor-pointer">Save Expense</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Request Funding from Finance Officer */}
      {showFundingModal && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-[140]">
          <div className="bg-white rounded-3xl p-6 max-w-lg w-full border border-slate-200 shadow-2xl space-y-4 animate-in zoom-in-95">
            <div className="flex justify-between items-center pb-3 border-b">
              <div>
                <h4 className="font-extrabold text-slate-900 text-base flex items-center gap-2">
                  <Send className="w-5 h-5 text-emerald-600" />
                  <span>Submit Event Funding Proposal to Finance</span>
                </h4>
                <p className="text-xs text-slate-500">Transmits itemized event expenses directly to the Finance Officer Console.</p>
              </div>
              <button onClick={() => setShowFundingModal(false)} className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateEventFundingRequest} className="space-y-4 text-xs">
              <div>
                <label className="font-extrabold text-slate-700 block mb-1">Requisition Subject / Title *</label>
                <input
                  type="text"
                  required
                  placeholder={`e.g. Budget Request for ${event.title}`}
                  value={fundingTitle}
                  onChange={e => setFundingTitle(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-extrabold text-slate-700 block mb-1">Total Requested (SLE)</label>
                  <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl font-black text-emerald-800 text-sm">
                    {(totalEstimated > 0 ? totalEstimated : 1000).toLocaleString()} SLE
                  </div>
                </div>

                <div>
                  <label className="font-extrabold text-slate-700 block mb-1">Priority Level</label>
                  <select
                    value={fundingPriority}
                    onChange={e => setFundingPriority(e.target.value as any)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold cursor-pointer"
                  >
                    <option value="low">Low Priority</option>
                    <option value="medium">Medium Priority</option>
                    <option value="high">High Priority</option>
                    <option value="urgent">Urgent / Immediate</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-extrabold text-slate-700 block mb-1">Disbursement Method</label>
                  <select
                    value={fundingDisbursementMethod}
                    onChange={e => setFundingDisbursementMethod(e.target.value as any)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold cursor-pointer"
                  >
                    <option value="mobile_money">Mobile Money (Afrimoney / Orange Money)</option>
                    <option value="bank_transfer">Bank Account Wire / ACH</option>
                    <option value="cash">Cash Voucher</option>
                  </select>
                </div>

                <div>
                  <label className="font-extrabold text-slate-700 block mb-1">Account Info / Phone Number</label>
                  <input
                    type="text"
                    placeholder="e.g. Afrimoney 077 123456"
                    value={fundingAccountInfo}
                    onChange={e => setFundingAccountInfo(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="font-extrabold text-slate-700 block mb-1">Requisition Justification & Breakdown Notes</label>
                <textarea
                  rows={3}
                  placeholder="Detail why funding is required, vendor quotations, and operational timeline..."
                  value={fundingNotes}
                  onChange={e => setFundingNotes(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowFundingModal(false)}
                  className="px-4 py-2 font-bold text-slate-500 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold rounded-xl shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <Send size={15} />
                  <span>Submit Proposal to Finance</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Reserve Physical Church Resource */}
      {showReserveModal && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-[150]">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full border border-slate-200 shadow-2xl space-y-4 animate-in zoom-in-95">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <div>
                <h4 className="font-extrabold text-slate-900 text-base flex items-center gap-2">
                  <Package className="w-5 h-5 text-indigo-600" />
                  <span>Reserve Physical Church Resource</span>
                </h4>
                <p className="text-xs text-slate-500">Allocate equipment, chairs, or sound gear for {event.title}.</p>
              </div>
              <button onClick={() => setShowReserveModal(false)} className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleReserveResource} className="space-y-4 text-xs">
              <div>
                <label className="font-extrabold text-slate-700 block mb-1">Select Equipment or Room *</label>
                <select
                  required
                  value={selectedResourceId}
                  onChange={e => setSelectedResourceId(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                >
                  <option value="">-- Select Resource from Catalog --</option>
                  {churchResources.map(r => (
                    <option key={r.id} value={r.id}>
                      {r.name} ({r.category}) - {r.unit_rental_cost_sle.toLocaleString()} SLE/unit
                    </option>
                  ))}
                </select>
              </div>

              {selectedResourceId && (() => {
                const sel = churchResources.find(r => r.id === selectedResourceId);
                if (!sel) return null;
                const totalCost = sel.unit_rental_cost_sle * (Number(reserveQty) || 1);

                return (
                  <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-2xl space-y-1 text-indigo-950">
                    <p className="font-bold flex justify-between">
                      <span>Unit Rental Cost:</span>
                      <strong className="font-mono">{sel.unit_rental_cost_sle.toLocaleString()} SLE</strong>
                    </p>
                    <p className="font-bold flex justify-between">
                      <span>Location:</span>
                      <span>{sel.location}</span>
                    </p>
                    <p className="font-black text-sm flex justify-between pt-1 border-t border-indigo-200 text-indigo-900">
                      <span>Total Budget Impact:</span>
                      <strong className="font-mono text-emerald-700">{totalCost.toLocaleString()} SLE</strong>
                    </p>
                  </div>
                );
              })()}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-extrabold text-slate-700 block mb-1">Quantity Required *</label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    required
                    value={reserveQty}
                    onChange={e => setReserveQty(Math.max(1, Number(e.target.value)))}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 outline-none"
                  />
                </div>

                <div>
                  <label className="font-extrabold text-slate-700 block mb-1">Allocation Status</label>
                  <div className="p-2.5 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl font-extrabold text-center uppercase text-[10px]">
                    Confirmed
                  </div>
                </div>
              </div>

              <div>
                <label className="font-extrabold text-slate-700 block mb-1">Logistics & Setup Instructions</label>
                <input
                  type="text"
                  placeholder="e.g. Set up stage side sound mics or auditorium rows..."
                  value={reserveNotes}
                  onChange={e => setReserveNotes(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-medium outline-none"
                />
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-[11px] text-slate-600">
                💡 <strong>Automatic Budget Integration:</strong> Reserving this item will create an itemized expense entry in the Event Budget tab automatically.
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowReserveModal(false)}
                  className="px-4 py-2 font-bold text-slate-500 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold rounded-xl shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <CheckCircle size={15} />
                  <span>Confirm Resource Reservation</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Add Guest Minister & Hospitality Details */}
      {showAddMinisterModal && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 z-[150]">
          <div className="bg-white rounded-3xl p-6 max-w-lg w-full border border-slate-200 shadow-2xl space-y-4 animate-in zoom-in-95">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-purple-100 text-purple-700 font-bold flex items-center justify-center shrink-0">
                  <Award size={20} />
                </div>
                <div>
                  <h4 className="font-extrabold text-slate-900 text-base">Add Visiting Guest Minister</h4>
                  <p className="text-xs text-slate-500">Track speaker honorarium, lodging, and airport protocol.</p>
                </div>
              </div>
              <button onClick={() => setShowAddMinisterModal(false)} className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={(e) => {
              e.preventDefault();
              if (!gmName) return;
              const newGm: GuestMinister = {
                id: `gm_${Date.now()}`,
                name: gmName,
                ministry: gmMinistry || 'Guest Ministry',
                honorarium: gmHonorarium,
                hotel: gmHotel,
                flight_info: gmFlight,
                pickup_time: gmPickup,
                bio: gmBio,
                is_disbursed: false
              };
              saveGuestMinistersToStorage([newGm, ...guestMinisters]);
              setGmName('');
              setGmMinistry('');
              setShowAddMinisterModal(false);
            }} className="space-y-3.5 text-xs">
              <div>
                <label className="font-extrabold text-slate-700 block mb-1">Minister Full Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Bishop Dr. David K. Mensah"
                  value={gmName}
                  onChange={e => setGmName(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 outline-none focus:bg-white focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-extrabold text-slate-700 block mb-1">Home Ministry / City</label>
                  <input
                    type="text"
                    placeholder="e.g. Living Faith Cathedral, Accra"
                    value={gmMinistry}
                    onChange={e => setGmMinistry(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-medium outline-none"
                  />
                </div>

                <div>
                  <label className="font-extrabold text-slate-700 block mb-1">Honorarium Amount (SLE)</label>
                  <input
                    type="number"
                    min={100}
                    value={gmHonorarium}
                    onChange={e => setGmHonorarium(Number(e.target.value))}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-extrabold text-slate-700 block mb-1">Hotel Lodging</label>
                  <input
                    type="text"
                    value={gmHotel}
                    onChange={e => setGmHotel(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-medium outline-none"
                  />
                </div>

                <div>
                  <label className="font-extrabold text-slate-700 block mb-1">Flight / Airport Logistics</label>
                  <input
                    type="text"
                    value={gmFlight}
                    onChange={e => setGmFlight(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-medium outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="font-extrabold text-slate-700 block mb-1">Sermon Topic / Bio Notes</label>
                <input
                  type="text"
                  value={gmBio}
                  onChange={e => setGmBio(e.target.value)}
                  placeholder="e.g. Prophetic Keynote Message"
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-medium outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddMinisterModal(false)}
                  className="px-4 py-2 font-bold text-slate-500 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-purple-600 hover:bg-purple-700 text-white font-extrabold rounded-xl shadow-md transition-all cursor-pointer"
                >
                  Save Guest Minister
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Child Safety Check-In Kiosk */}
      {showChildCheckInModal && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 z-[150]">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full border border-slate-200 shadow-2xl space-y-4 animate-in zoom-in-95">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-800 font-bold flex items-center justify-center shrink-0">
                  <ShieldCheck size={20} />
                </div>
                <div>
                  <h4 className="font-extrabold text-slate-900 text-base">Child Safety Check-In</h4>
                  <p className="text-xs text-slate-500">Issue matching safety badges for child and parent.</p>
                </div>
              </div>
              <button onClick={() => setShowChildCheckInModal(false)} className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleAddChildCheckIn} className="space-y-3.5 text-xs">
              <div>
                <label className="font-extrabold text-slate-700 block mb-1">Child Full Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Emmanuel Taylor"
                  value={childName}
                  onChange={e => setChildName(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 outline-none focus:bg-white focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-extrabold text-slate-700 block mb-1">Child Age</label>
                  <input
                    type="number"
                    min={1}
                    max={17}
                    value={childAge}
                    onChange={e => setChildAge(Number(e.target.value))}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 outline-none"
                  />
                </div>

                <div>
                  <label className="font-extrabold text-slate-700 block mb-1">Parent / Guardian Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Sarah Taylor"
                    value={childParentName}
                    onChange={e => setChildParentName(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="font-extrabold text-slate-700 block mb-1">Parent Contact Phone</label>
                <input
                  type="text"
                  placeholder="e.g. +232 76 543 210"
                  value={childParentPhone}
                  onChange={e => setChildParentPhone(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-medium outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowChildCheckInModal(false)}
                  className="px-4 py-2 font-bold text-slate-500 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded-xl shadow-md transition-all cursor-pointer"
                >
                  Issue Safety Badge
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Printable Child Safety Claim Receipt Badge */}
      {activeSafetyBadge && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4 z-[160]">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full border-2 border-amber-400 shadow-2xl space-y-4 animate-in zoom-in-95 text-slate-900">
            <div className="text-center space-y-1 pb-3 border-b border-dashed border-slate-300">
              <div className="inline-flex p-2 bg-amber-100 text-amber-900 rounded-2xl mb-1">
                <ShieldCheck size={28} />
              </div>
              <h3 className="font-black text-lg text-slate-900 uppercase tracking-tight">FAITHCONNECT CATHEDRAL</h3>
              <p className="text-[10px] font-bold text-slate-500 uppercase">Children's Ministry Safety Drop-Off Badge</p>
            </div>

            <div className="p-4 bg-amber-50 rounded-2xl border border-amber-200 text-center space-y-2">
              <span className="text-[10px] font-extrabold uppercase text-amber-800 tracking-wider block">MATCHING CLAIM CODE</span>
              <div className="font-mono text-2xl font-black text-slate-900 tracking-widest bg-white p-2 rounded-xl border border-amber-300 shadow-inner">
                {activeSafetyBadge.security_code}
              </div>
            </div>

            <div className="space-y-1 text-xs text-slate-700 bg-slate-50 p-3.5 rounded-2xl border border-slate-200">
              <p className="flex justify-between"><span>Child:</span><strong className="text-slate-900">{activeSafetyBadge.child_name} ({activeSafetyBadge.age} yrs)</strong></p>
              <p className="flex justify-between"><span>Parent:</span><strong className="text-slate-900">{activeSafetyBadge.parent_name}</strong></p>
              <p className="flex justify-between"><span>Phone:</span><strong>{activeSafetyBadge.parent_phone || 'N/A'}</strong></p>
              <p className="flex justify-between"><span>Time:</span><strong>{activeSafetyBadge.check_in_time}</strong></p>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => window.print()}
                className="flex-1 py-2.5 bg-slate-900 text-white rounded-xl text-xs font-bold shadow-md hover:bg-slate-800 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Printer size={15} /> Print Badge
              </button>
              <button
                type="button"
                onClick={() => setActiveSafetyBadge(null)}
                className="px-4 py-2.5 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-200 cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      {showProformaModal && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 z-[150] overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-4xl w-full border border-slate-200 shadow-2xl space-y-0 my-auto overflow-hidden animate-in zoom-in-95">
            {/* Royal Blue Curved Header Banner */}
            <div className="bg-gradient-to-r from-blue-900 via-blue-800 to-indigo-950 text-white p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-blue-900">
              <div>
                <span className="px-3 py-1 bg-blue-500/30 text-blue-200 rounded-full text-[10px] font-black uppercase tracking-widest border border-blue-400/20">
                  Church Financial Proforma Invoice Engine
                </span>
                <h3 className="text-2xl font-black tracking-tight mt-1">PROFORMA INVOICE BUILDER</h3>
                <p className="text-xs text-blue-200/90 mt-0.5">
                  Configure multi-item event budgets, unit costs, and generate printable invoice reports for Finance.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={downloadProformaInvoicePDF}
                  className="px-4 py-2.5 bg-white text-blue-950 hover:bg-blue-50 font-black rounded-xl text-xs shadow-md transition-all flex items-center gap-2 cursor-pointer"
                >
                  <Printer size={16} className="text-blue-900" />
                  <span>Print Invoice PDF</span>
                </button>
                <button 
                  onClick={() => setShowProformaModal(false)} 
                  className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center cursor-pointer transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
              {/* Invoice Metadata Row */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 bg-slate-50 rounded-2xl border border-slate-200 text-xs">
                <div>
                  <label className="font-extrabold text-slate-700 block mb-1">Invoice Number *</label>
                  <input
                    type="text"
                    value={proformaInvoiceNo}
                    onChange={e => setProformaInvoiceNo(e.target.value)}
                    className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-mono font-bold text-slate-900"
                  />
                </div>

                <div>
                  <label className="font-extrabold text-slate-700 block mb-1">Invoice Date *</label>
                  <input
                    type="date"
                    value={proformaDate}
                    onChange={e => setProformaDate(e.target.value)}
                    className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-bold text-slate-800"
                  />
                </div>

                <div>
                  <label className="font-extrabold text-slate-700 block mb-1">Department / Submitter</label>
                  <div className="p-2.5 bg-white border border-slate-200 rounded-xl font-bold text-slate-800 truncate">
                    {event.organizer_name || 'Event Manager'} ({event.title})
                  </div>
                </div>
              </div>

              {/* Multi-Item Table Builder */}
              <div className="space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h4 className="font-black text-slate-900 text-sm">Multi-Item Expense Breakdown</h4>
                    <p className="text-xs text-slate-500">Add multiple budget items at once with description, quantity, and unit prices in SLE.</p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleLoadStandardTemplate}
                      className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 font-extrabold rounded-xl text-xs transition-colors cursor-pointer flex items-center gap-1.5"
                    >
                      <Sparkles size={14} /> Load Standard Template
                    </button>
                    <button
                      type="button"
                      onClick={handleAddProformaRow}
                      className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold rounded-xl text-xs transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs"
                    >
                      <Plus size={14} /> Add Line Item
                    </button>
                  </div>
                </div>

                <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-900 text-white font-extrabold uppercase text-[10px]">
                        <th className="p-3.5 w-12 text-center">#</th>
                        <th className="p-3.5">Item Name / Description</th>
                        <th className="p-3.5 w-24 text-center">Qty</th>
                        <th className="p-3.5 w-32 text-right">Unit Price (SLE)</th>
                        <th className="p-3.5 w-36 text-right">Line Total (SLE)</th>
                        <th className="p-3.5 w-12 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium">
                      {proformaItems.map((item, idx) => (
                        <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="p-3.5 text-center font-bold text-slate-400">{idx + 1}</td>
                          <td className="p-2.5">
                            <input
                              type="text"
                              placeholder="e.g. PA Sound System Rental, Guest Minister Honorarium..."
                              value={item.description}
                              onChange={e => handleUpdateProformaRow(item.id, 'description', e.target.value)}
                              className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-900 outline-none focus:border-indigo-500"
                            />
                          </td>
                          <td className="p-2.5">
                            <input
                              type="number"
                              min={1}
                              value={item.quantity}
                              onChange={e => handleUpdateProformaRow(item.id, 'quantity', e.target.value)}
                              className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-900 text-center outline-none focus:border-indigo-500"
                            />
                          </td>
                          <td className="p-2.5">
                            <input
                              type="number"
                              min={0}
                              step={10}
                              value={item.unit_price}
                              onChange={e => handleUpdateProformaRow(item.id, 'unit_price', e.target.value)}
                              className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-900 text-right outline-none focus:border-indigo-500 font-mono"
                            />
                          </td>
                          <td className="p-3.5 text-right font-black text-indigo-900 font-mono text-xs">
                            SLE {(item.total_price || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="p-3.5 text-center">
                            <button
                              type="button"
                              onClick={() => handleDeleteProformaRow(item.id)}
                              className="p-1.5 text-slate-300 hover:text-rose-600 rounded-lg transition-colors cursor-pointer"
                              title="Delete line"
                            >
                              <Trash2 size={15} />
                            </button>
                          </td>
                        </tr>
                      ))}

                      {proformaItems.length === 0 && (
                        <tr>
                          <td colSpan={6} className="p-8 text-center text-slate-400 italic">
                            No line items added yet. Click "+ Add Line Item" or "Load Standard Template" to begin.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Subtotal Banner */}
                <div className="flex justify-end p-4 bg-blue-950 text-white rounded-2xl border border-blue-900 shadow-md">
                  <div className="flex items-center gap-6">
                    <span className="text-xs font-extrabold uppercase text-blue-300 tracking-wider">Calculated Sub Total:</span>
                    <strong className="text-xl font-black text-white font-mono">
                      SLE {proformaItems.reduce((acc, curr) => acc + (curr.total_price || 0), 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </strong>
                  </div>
                </div>
              </div>

              {/* Invoice Note / Terms */}
              <div>
                <label className="font-extrabold text-slate-700 block mb-1">Invoice Notes / Terms & Payment Instructions</label>
                <textarea
                  rows={2}
                  value={proformaNotes}
                  onChange={e => setProformaNotes(e.target.value)}
                  placeholder="Terms, payment instructions, or note to Finance Officer..."
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800"
                />
              </div>

              {/* LIVE INVOICE DESIGN PREVIEW (Matching sample image layout) */}
              <div className="space-y-2 pt-2 border-t border-slate-200">
                <div className="flex justify-between items-center">
                  <h4 className="font-black text-slate-900 text-xs uppercase tracking-wider text-slate-500">
                    Live Printable Invoice Design Preview
                  </h4>
                  <span className="text-[11px] text-indigo-600 font-bold">Matches Official Printable Layout</span>
                </div>

                <div className="border border-slate-300 rounded-2xl overflow-hidden shadow-inner bg-slate-100 p-4 sm:p-6">
                  <div className="bg-white rounded-xl shadow-md border border-slate-200 overflow-hidden text-slate-800 text-xs space-y-6 pb-6">
                    {/* Deep Royal Blue Header Curve Banner */}
                    <div className="bg-gradient-to-r from-blue-900 via-blue-800 to-indigo-950 text-white p-6 flex justify-between items-start rounded-b-3xl shadow-sm">
                      <div>
                        <h2 className="text-2xl font-black tracking-widest uppercase">INVOICE</h2>
                      </div>
                      <div className="text-right">
                        <span className="font-extrabold text-sm tracking-wider">NO: {proformaInvoiceNo}</span>
                      </div>
                    </div>

                    <div className="px-6 space-y-6">
                      <div className="grid grid-cols-2 gap-4 text-slate-600">
                        <div>
                          <strong className="text-slate-900 text-xs uppercase font-extrabold block mb-1">Bill To:</strong>
                          <p className="font-bold text-slate-900">FaithConnect Grace Cathedral Treasury</p>
                          <p>Finance & Accounts Division</p>
                          <p>123 Cathedral Way, Freetown</p>
                        </div>
                        <div className="text-right">
                          <strong className="text-slate-900 text-xs uppercase font-extrabold block mb-1">From:</strong>
                          <p className="font-bold text-slate-900">{event.organizer_name || 'Event Manager'}</p>
                          <p>Event: {event.title}</p>
                        </div>
                      </div>

                      <div className="font-bold text-slate-700">
                        Date: {proformaDate}
                      </div>

                      {/* Preview Table */}
                      <div className="border border-slate-300 rounded-lg overflow-hidden">
                        <table className="w-full text-left border-collapse text-xs">
                          <thead>
                            <tr className="bg-blue-900 text-white font-extrabold uppercase">
                              <th className="p-2.5">Description</th>
                              <th className="p-2.5 text-center">Qty</th>
                              <th className="p-2.5 text-right">Price</th>
                              <th className="p-2.5 text-right">Total</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200">
                            {proformaItems.map(item => (
                              <tr key={item.id} className="hover:bg-slate-50">
                                <td className="p-2.5 font-medium">{item.description || '—'}</td>
                                <td className="p-2.5 text-center">{item.quantity}</td>
                                <td className="p-2.5 text-right">SLE {(item.unit_price || 0).toLocaleString()}</td>
                                <td className="p-2.5 text-right font-bold">SLE {(item.total_price || 0).toLocaleString()}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {/* Subtotal Box */}
                      <div className="flex justify-end">
                        <div className="bg-blue-900 text-white px-6 py-2.5 rounded font-extrabold flex justify-between items-center w-64 shadow-xs">
                          <span>Sub Total</span>
                          <span>SLE {proformaItems.reduce((sum, item) => sum + (item.total_price || 0), 0).toLocaleString()}</span>
                        </div>
                      </div>

                      {/* Note & Footer */}
                      <div className="pt-2 border-t border-slate-200 text-slate-500 text-[11px] space-y-1">
                        <strong>Note:</strong> {proformaNotes}
                      </div>

                      <div className="flex justify-between items-end pt-4 border-t border-slate-200 text-[11px]">
                        <div>
                          <strong className="block text-slate-900 font-extrabold mb-0.5">Payment Information:</strong>
                          <p>Bank: Grace Cathedral Treasury Bank</p>
                          <p>No Bank: 123-456-7890-SLE</p>
                          <p>Email: finance@gracecathedral.org</p>
                        </div>
                        <div className="text-2xl font-black italic text-slate-900">
                          Thank You!
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-5 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setShowProformaModal(false)}
                className="px-4 py-2 font-bold text-slate-600 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer text-xs"
              >
                Close
              </button>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={downloadProformaInvoicePDF}
                  className="flex-1 sm:flex-initial px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-extrabold rounded-xl text-xs shadow-md transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Printer size={15} /> Print / Export PDF
                </button>
                <button
                  type="button"
                  onClick={handleSaveAndSubmitProforma}
                  className="flex-1 sm:flex-initial px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold rounded-xl text-xs shadow-md transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Send size={15} /> Submit Proforma Invoice to Finance
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MOBILE & TABLET FIXED BOTTOM NAVIGATION BAR (< 1024px) */}
      {showMoreMenu && (
        <div 
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-[115] lg:hidden"
          onClick={() => setShowMoreMenu(false)}
        />
      )}

      {/* POP-UP / SLIDE-UP MORE MENU WITH WHITE BACKGROUND */}
      {showMoreMenu && (
        <div className="fixed bottom-[70px] right-2 left-2 sm:left-auto sm:right-4 sm:w-80 z-[125] bg-white border border-slate-200 rounded-2xl p-3 shadow-2xl lg:hidden animate-in fade-in slide-in-from-bottom-2 duration-150">
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100 px-1">
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">More Tools & Management</span>
            <button 
              onClick={() => setShowMoreMenu(false)}
              className="p-1 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <X size={16} />
            </button>
          </div>
          <div className="grid grid-cols-1 gap-1 text-xs font-semibold">
            <button
              onClick={() => { setActiveTab('budget'); setShowMoreMenu(false); }}
              className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl transition-all text-left cursor-pointer ${
                activeTab === 'budget' ? 'bg-indigo-600 text-white font-extrabold shadow-md' : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <DollarSign size={16} className={activeTab === 'budget' ? 'text-white' : 'text-emerald-600'} />
              <span>Budget & Expenses</span>
            </button>
            <button
              onClick={() => { setActiveTab('resources'); setShowMoreMenu(false); }}
              className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl transition-all text-left cursor-pointer ${
                activeTab === 'resources' ? 'bg-indigo-600 text-white font-extrabold shadow-md' : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <Package size={16} className={activeTab === 'resources' ? 'text-white' : 'text-amber-600'} />
              <span>Physical Gear</span>
            </button>
            <button
              onClick={() => { setActiveTab('survey'); setShowMoreMenu(false); }}
              className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl transition-all text-left cursor-pointer ${
                activeTab === 'survey' ? 'bg-indigo-600 text-white font-extrabold shadow-md' : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <MessageSquareText size={16} className={activeTab === 'survey' ? 'text-white' : 'text-purple-600'} />
              <span>Post-Event Survey</span>
            </button>
            <button
              onClick={() => { setActiveTab('report'); setShowMoreMenu(false); }}
              className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl transition-all text-left cursor-pointer ${
                activeTab === 'report' ? 'bg-indigo-600 text-white font-extrabold shadow-md' : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <FileText size={16} className={activeTab === 'report' ? 'text-white' : 'text-blue-600'} />
              <span>Closeout Report</span>
            </button>
            <button
              onClick={() => { setActiveTab('rsvps'); setShowMoreMenu(false); }}
              className={`flex items-center justify-between px-3 py-2.5 rounded-xl transition-all text-left cursor-pointer ${
                activeTab === 'rsvps' ? 'bg-indigo-600 text-white font-extrabold shadow-md' : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Users size={16} className={activeTab === 'rsvps' ? 'text-white' : 'text-cyan-600'} />
                <span>Congregant RSVPs</span>
              </div>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                activeTab === 'rsvps' ? 'bg-white/20 text-white' : 'bg-slate-100 text-indigo-700'
              }`}>
                {registeredCount}
              </span>
            </button>
          </div>
        </div>
      )}

      {/* MOBILE & TABLET FIXED BOTTOM NAVIGATION BAR WITH WHITE BACKGROUND (< 1024px) */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-[120] bg-white/95 backdrop-blur-md border-t border-slate-200 px-1 py-1.5 shadow-2xl">
        <div className="grid grid-cols-7 gap-0.5 items-center max-w-xl mx-auto">
          <button
            onClick={() => { setActiveTab('overview'); setShowMoreMenu(false); }}
            className={`flex flex-col items-center justify-center py-1.5 px-0.5 rounded-xl transition-all cursor-pointer min-h-[48px] ${
              activeTab === 'overview' ? 'bg-indigo-600 text-white font-bold shadow-sm' : 'text-slate-600 hover:text-indigo-600 hover:bg-slate-100'
            }`}
          >
            <BarChart3 size={16} />
            <span className="text-[9px] sm:text-[10px] mt-1 truncate w-full text-center leading-tight font-medium">Overview</span>
          </button>

          <button
            onClick={() => { setActiveTab('account'); setShowMoreMenu(false); }}
            className={`flex flex-col items-center justify-center py-1.5 px-0.5 rounded-xl transition-all cursor-pointer min-h-[48px] ${
              activeTab === 'account' ? 'bg-emerald-600 text-white font-bold shadow-sm' : 'text-slate-600 hover:text-emerald-600 hover:bg-slate-100'
            }`}
          >
            <Landmark size={16} className={activeTab === 'account' ? 'text-white' : 'text-emerald-600'} />
            <span className="text-[9px] sm:text-[10px] mt-1 truncate w-full text-center leading-tight font-medium">Treasury</span>
          </button>

          <button
            onClick={() => { setActiveTab('qrpass'); setShowMoreMenu(false); }}
            className={`flex flex-col items-center justify-center py-1.5 px-0.5 rounded-xl transition-all cursor-pointer min-h-[48px] ${
              activeTab === 'qrpass' ? 'bg-indigo-600 text-white font-bold shadow-sm' : 'text-slate-600 hover:text-indigo-600 hover:bg-slate-100'
            }`}
          >
            <QrCode size={16} />
            <span className="text-[9px] sm:text-[10px] mt-1 truncate w-full text-center leading-tight font-medium">Door QR</span>
          </button>

          <button
            onClick={() => { setActiveTab('team'); setShowMoreMenu(false); }}
            className={`flex flex-col items-center justify-center py-1.5 px-0.5 rounded-xl transition-all cursor-pointer min-h-[48px] ${
              activeTab === 'team' ? 'bg-indigo-600 text-white font-bold shadow-sm' : 'text-slate-600 hover:text-indigo-600 hover:bg-slate-100'
            }`}
          >
            <Users size={16} />
            <span className="text-[9px] sm:text-[10px] mt-1 truncate w-full text-center leading-tight font-medium">Committee</span>
          </button>

          <button
            onClick={() => { setActiveTab('schedule'); setShowMoreMenu(false); }}
            className={`flex flex-col items-center justify-center py-1.5 px-0.5 rounded-xl transition-all cursor-pointer min-h-[48px] ${
              activeTab === 'schedule' ? 'bg-indigo-600 text-white font-bold shadow-sm' : 'text-slate-600 hover:text-indigo-600 hover:bg-slate-100'
            }`}
          >
            <Clock size={16} />
            <span className="text-[9px] sm:text-[10px] mt-1 truncate w-full text-center leading-tight font-medium">Run Show</span>
          </button>

          <button
            onClick={() => { setActiveTab('tasks'); setShowMoreMenu(false); }}
            className={`flex flex-col items-center justify-center py-1.5 px-0.5 rounded-xl transition-all cursor-pointer min-h-[48px] ${
              activeTab === 'tasks' ? 'bg-indigo-600 text-white font-bold shadow-sm' : 'text-slate-600 hover:text-indigo-600 hover:bg-slate-100'
            }`}
          >
            <CheckSquare size={16} />
            <span className="text-[9px] sm:text-[10px] mt-1 truncate w-full text-center leading-tight font-medium">Checklist</span>
          </button>

          <button
            onClick={() => setShowMoreMenu(!showMoreMenu)}
            className={`flex flex-col items-center justify-center py-1.5 px-0.5 rounded-xl transition-all cursor-pointer min-h-[48px] relative ${
              showMoreMenu || ['budget', 'resources', 'survey', 'report', 'rsvps'].includes(activeTab)
                ? 'bg-indigo-600 text-white font-bold shadow-sm'
                : 'text-slate-600 hover:text-indigo-600 hover:bg-slate-100'
            }`}
          >
            <MoreHorizontal size={16} />
            <span className="text-[9px] sm:text-[10px] mt-1 truncate w-full text-center leading-tight font-medium">More</span>
            {['budget', 'resources', 'survey', 'report', 'rsvps'].includes(activeTab) && (
              <span className="absolute top-1 right-1.5 w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            )}
          </button>
        </div>
      </div>

    </div>
  );
};
