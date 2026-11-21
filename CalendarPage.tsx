import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import {
  AlertCircle,
  Calendar,
  CalendarCheck,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  ExternalLink,
  Filter,
  History,
  Landmark,
  LocateFixed,
  MapPin,
  Navigation,
  Printer,
  QrCode,
  Radio,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Users,
  Video,
  X
} from 'lucide-react';
import { supabase } from './supabaseClient';
import {
  formatLocalDateKey,
  generateEventOccurrences,
  getEventAccount,
  getEventTemporalStatus,
  getRecurrenceBadge,
  resolveOccurrencePreemption,
  syncPastRecurringEventsAutomatically
} from './eventAccountService';
import {
  formatDistanceLabel,
  getChurchProfile,
  getConfiguredGeofenceRadius,
  GpsAccessError,
  verifyGeofencePresence,
  type GeofenceVerificationResult
} from './churchProfileService';
import { GeofenceD3Map } from './GeofenceD3Map';
import { LocationMap } from './LocationMap';
import type { ChurchEvent, EventOccurrence, EventRegistration, Profile } from './types';

interface CalendarPageProps {
  profile: Profile | null;
}

interface CalendarOccurrenceEntry {
  occ: EventOccurrence;
  event: ChurchEvent;
}

const BASE_CATEGORIES = [
  'All',
  'Worship Service',
  'Special Service',
  'Conference',
  'Youth Event',
  'Community Outreach',
  'Prayer & Fasting',
  'Department Meeting',
  'Fellowship & Social'
];

const BASE_AUDIENCES = [
  'All',
  'All Congregation',
  'Youth & Teens',
  'Men',
  'Women',
  'Leaders & Workers',
  'Children'
];

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December'
];

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function getEventCoordinates(evt: ChurchEvent): { lat: number; lng: number } | null {
  if (evt.latitude === null || evt.latitude === undefined || (evt.latitude as unknown) === '') {
    return null;
  }
  if (evt.longitude === null || evt.longitude === undefined || (evt.longitude as unknown) === '') {
    return null;
  }
  const lat = Number(evt.latitude);
  const lng = Number(evt.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

function getGoogleMapsHref(evt: ChurchEvent, fallbackLoc: string): string {
  const coords = getEventCoordinates(evt);
  if (coords) {
    return `https://www.google.com/maps/search/?api=1&query=${coords.lat},${coords.lng}`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fallbackLoc)}`;
}

function getEventGeofenceTarget(evt: ChurchEvent): {
  lat: number;
  lng: number;
  source: 'event' | 'church_profile';
  label: string;
} {
  const coords = getEventCoordinates(evt);
  if (coords) {
    return {
      lat: coords.lat,
      lng: coords.lng,
      source: 'event',
      label: evt.location || 'Event Venue'
    };
  }
  const cp = getChurchProfile();
  return {
    lat: Number.isFinite(Number(cp.latitude)) ? Number(cp.latitude) : 8.484,
    lng: Number.isFinite(Number(cp.longitude)) ? Number(cp.longitude) : -13.229,
    source: 'church_profile',
    label: cp.name || evt.location || 'Church Premises'
  };
}

function toLocalDateKey(input: Date | string): string {
  const dt = typeof input === 'string' ? new Date(input) : input;
  if (Number.isNaN(dt.getTime())) return '';
  return formatLocalDateKey(dt);
}

function isSessionOnEventDay(startIso: string, endIso: string, todayDateKey: string): boolean {
  const startKey = toLocalDateKey(startIso);
  if (!startKey) return false;
  const endKey = toLocalDateKey(endIso) || startKey;
  return startKey <= todayDateKey && todayDateKey <= endKey;
}

function getStartOfWeek(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() - d.getDay());
  return d;
}

function formatReadableDate(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  if (!y || !m || !d) return dateKey;
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

function formatTimeRange(startIso: string, endIso: string): string {
  const start = new Date(startIso);
  const end = new Date(endIso);
  if (Number.isNaN(start.getTime())) return '';
  const sStr = start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (Number.isNaN(end.getTime())) return sStr;
  const eStr = end.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return `${sStr} – ${eStr}`;
}

const EventCoverImage: React.FC<{
  src?: string;
  title: string;
  className?: string;
}> = ({ src, title, className = '' }) => {
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setHasError(false);
  }, [src]);

  if (!src || hasError) {
    return (
      <div
        className={`w-full h-full bg-gradient-to-br from-slate-800 via-indigo-900 to-slate-900 flex flex-col items-center justify-center p-4 text-center ${className}`}
      >
        <Calendar size={28} className="text-indigo-200/70 mb-1.5" />
        <span className="text-xs font-semibold text-indigo-100/80 line-clamp-1 max-w-[85%]">
          {title}
        </span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={title}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setHasError(true)}
      className={`w-full h-full object-cover ${className}`}
    />
  );
};

export const CalendarPage: React.FC<CalendarPageProps> = ({ profile }) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [events, setEvents] = useState<ChurchEvent[]>([]);
  const [registrations, setRegistrations] = useState<EventRegistration[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncTick, setSyncTick] = useState(0);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 60000);
    return () => window.clearInterval(timer);
  }, []);

  const today = useMemo(() => new Date(nowMs), [nowMs]);
  const todayKey = useMemo(() => toLocalDateKey(today), [today]);

  const [viewMode, setViewMode] = useState<'calendar' | 'agenda' | 'week'>('calendar');
  const [currentMonthDate, setCurrentMonthDate] = useState(
    () => new Date(today.getFullYear(), today.getMonth(), 1)
  );
  const [selectedDateKey, setSelectedDateKey] = useState<string>(() => toLocalDateKey(today));
  const [weekAnchorDate, setWeekAnchorDate] = useState<Date>(() => getStartOfWeek(today));
  const [selectedWeekDayKey, setSelectedWeekDayKey] = useState<string>('all');

  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [selectedAudience, setSelectedAudience] = useState<string>('All');
  const [onlyMyRsvps, setOnlyMyRsvps] = useState<boolean>(false);
  const [showPastEvents, setShowPastEvents] = useState<boolean>(false);
  const [search, setSearch] = useState('');
  const [configuredRadiusMeters, setConfiguredRadiusMeters] = useState<number>(() =>
    getConfiguredGeofenceRadius()
  );

  const [toastMessage, setToastMessage] = useState<{ text: string; tone: 'info' | 'error' } | null>(null);
  const [busyEventId, setBusyEventId] = useState<string | null>(null);
  const [showQRPass, setShowQRPass] = useState<{ event: ChurchEvent; reg: EventRegistration; occurrence?: EventOccurrence } | null>(null);
  const [selectedEventDetail, setSelectedEventDetail] = useState<{ event: ChurchEvent; occurrence?: EventOccurrence } | null>(null);
  const [selectedMapLocation, setSelectedMapLocation] = useState<{
    event: ChurchEvent;
    locationName: string;
    occurrence?: EventOccurrence;
  } | null>(null);
  const [checkInModal, setCheckInModal] = useState<{
    event: ChurchEvent;
    occurrence?: EventOccurrence;
    locationName: string;
    target: { lat: number; lng: number; source: 'event' | 'church_profile'; label: string };
    radiusMeters: number;
    phase: 'verifying' | 'verified' | 'outside' | 'error';
    result?: GeofenceVerificationResult;
    checkedInAt?: string;
    errorMessage?: string;
    errorCode?: string;
  } | null>(null);
  const [showDetailMap, setShowDetailMap] = useState<boolean>(true);

  const dayScheduleRef = useRef<HTMLElement | null>(null);
  const appliedDeepLinkRef = useRef<string | null>(null);

  const showToast = (text: string, tone: 'info' | 'error' = 'info') => {
    setToastMessage({ text, tone });
  };

  useEffect(() => {
    if (!toastMessage) return;
    const timer = setTimeout(() => setToastMessage(null), 4000);
    return () => clearTimeout(timer);
  }, [toastMessage]);

  useEffect(() => {
    const syncRadius = () => setConfiguredRadiusMeters(getConfiguredGeofenceRadius());
    window.addEventListener('church-profile-updated', syncRadius);
    window.addEventListener('storage', syncRadius);
    return () => {
      window.removeEventListener('church-profile-updated', syncRadius);
      window.removeEventListener('storage', syncRadius);
    };
  }, []);

  useEffect(() => {
    if (selectedEventDetail) {
      setShowDetailMap(true);
    }
  }, [selectedEventDetail?.event.id]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (checkInModal) {
          if (checkInModal.phase !== 'verifying') setCheckInModal(null);
        } else if (showQRPass) setShowQRPass(null);
        else if (selectedMapLocation) setSelectedMapLocation(null);
        else if (selectedEventDetail) setSelectedEventDetail(null);
      }
    };
    if (checkInModal || showQRPass || selectedEventDetail || selectedMapLocation) {
      document.addEventListener('keydown', onKeyDown);
      return () => document.removeEventListener('keydown', onKeyDown);
    }
  }, [checkInModal, showQRPass, selectedEventDetail, selectedMapLocation]);

  const fetchEvents = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [evtRes, regRes] = await Promise.all([
        supabase.from('events').select('*').order('start_time', { ascending: true }),
        supabase.from('event_registrations').select('*')
      ]);
      const rawEvents = (evtRes.data || []) as ChurchEvent[];
      const loadedEvents = await syncPastRecurringEventsAutomatically(rawEvents);
      const loadedRegs = (regRes.data || []) as EventRegistration[];
      setEvents(loadedEvents);
      setRegistrations(loadedRegs);
      setSyncTick(t => t + 1);

      setSelectedEventDetail(prev => {
        if (!prev) return null;
        const fresh = loadedEvents.find(e => e.id === prev.event.id && e.status !== 'cancelled');
        return fresh ? { event: fresh, occurrence: prev.occurrence } : null;
      });
      setSelectedMapLocation(prev => {
        if (!prev) return null;
        const fresh = loadedEvents.find(e => e.id === prev.event.id && e.status !== 'cancelled');
        if (!fresh) return null;
        return {
          event: fresh,
          locationName: prev.occurrence?.override_location || prev.occurrence?.location || fresh.location,
          occurrence: prev.occurrence
        };
      });
    } catch (err) {
      console.error('Unable to load events:', err);
      if (!silent) {
        showToast('Unable to load church calendar events. Please try again.', 'error');
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEvents(false);

    const handleLiveSync = () => {
      fetchEvents(true);
    };
    const handleStorageSync = (e: StorageEvent) => {
      if (
        e.key === 'faithconnect_db_v2' ||
        e.key === 'faithconnect_occurrence_overrides_v1' ||
        e.key === 'faithconnect_event_accounts_v1'
      ) {
        fetchEvents(true);
      }
    };

    window.addEventListener('church_events_updated', handleLiveSync);
    window.addEventListener('event_accounts_updated', handleLiveSync);
    window.addEventListener('storage', handleStorageSync);
    return () => {
      window.removeEventListener('church_events_updated', handleLiveSync);
      window.removeEventListener('event_accounts_updated', handleLiveSync);
      window.removeEventListener('storage', handleStorageSync);
    };
  }, [fetchEvents]);

  const activeEvents = useMemo(
    () => events.filter(evt => evt.status !== 'cancelled'),
    [events]
  );

  // Build dynamic filter lists so custom categories/audiences created by Admin never get hidden
  const categoriesList = useMemo(() => {
    const extras = activeEvents
      .map(e => e.category)
      .filter((c): c is string => Boolean(c && !BASE_CATEGORIES.includes(c)));
    return [...BASE_CATEGORIES, ...Array.from(new Set(extras))];
  }, [activeEvents]);

  const audienceList = useMemo(() => {
    const extras = activeEvents
      .map(e => e.target_audience)
      .filter((a): a is string => Boolean(a && !BASE_AUDIENCES.includes(a)));
    return [...BASE_AUDIENCES, ...Array.from(new Set(extras))];
  }, [activeEvents]);

  const getEventUserReg = useCallback(
    (evt: ChurchEvent): EventRegistration | undefined => {
      const userEmail = profile?.email || 'member@faithconnect.church';
      return registrations.find(
        r =>
          r.event_id === evt.id &&
          (r.user_id === profile?.id ||
            (profile?.auth_user_id && r.user_id === profile.auth_user_id) ||
            r.member_id === profile?.id ||
            r.email === userEmail)
      );
    },
    [registrations, profile?.id, profile?.auth_user_id, profile?.email]
  );

  // Handle deep-link ?event=<id>&date=<YYYY-MM-DD> from Overview or Notifications
  useEffect(() => {
    const paramEventId = searchParams.get('event');
    const paramDate = searchParams.get('date');
    const token = `${paramEventId || ''}|${paramDate || ''}`;
    if (!paramEventId || loading || appliedDeepLinkRef.current === token) return;

    const targetEvent = activeEvents.find(e => e.id === paramEventId);
    if (!targetEvent) return;

    appliedDeepLinkRef.current = token;

    if (paramDate && /^\d{4}-\d{2}-\d{2}$/.test(paramDate)) {
      const [y, m, d] = paramDate.split('-').map(Number);
      const targetDt = new Date(y, m - 1, d, 12, 0, 0, 0);
      setCurrentMonthDate(new Date(y, m - 1, 1));
      setSelectedDateKey(paramDate);
      setWeekAnchorDate(getStartOfWeek(targetDt));

      const occs = resolveOccurrencePreemption(
        activeEvents.flatMap(ev =>
          generateEventOccurrences(
            ev,
            new Date(y, m - 1, d, 0, 0, 0, 0),
            new Date(y, m - 1, d, 23, 59, 59, 999)
          )
        )
      );
      const matchingOcc = occs.find(o => o.event_id === targetEvent.id && o.occurrence_date === paramDate);
      setSelectedEventDetail({ event: targetEvent, occurrence: matchingOcc });
    } else {
      const dt = new Date(targetEvent.start_time);
      if (!Number.isNaN(dt.getTime())) {
        setCurrentMonthDate(new Date(dt.getFullYear(), dt.getMonth(), 1));
        setSelectedDateKey(toLocalDateKey(dt));
      }
      setSelectedEventDetail({ event: targetEvent });
    }

    // Clear query params cleanly after opening so reload/back doesn't lock state
    setSearchParams({}, { replace: true });
  }, [searchParams, activeEvents, loading, setSearchParams]);

  const handleRSVPToggle = async (evt: ChurchEvent) => {
    if (busyEventId === evt.id) return;
    setBusyEventId(evt.id);

    const userEmail = profile?.email || 'member@faithconnect.church';
    const userName = profile
      ? `${profile.first_name} ${profile.last_name}`.trim()
      : 'Grace Cathedral Member';

    try {
      const existingReg = getEventUserReg(evt);

      if (existingReg) {
        if (existingReg.status === 'checked_in' || existingReg.status === 'attended') {
          showToast(`You have already checked in to "${evt.title}".`);
          return;
        }

        const { error: deleteError } = await supabase
          .from('event_registrations')
          .delete()
          .eq('id', existingReg.id);
        if (deleteError) throw deleteError;

        if (existingReg.status === 'confirmed') {
          const newCount = Math.max(0, (evt.registered_count || 1) - 1);
          const { error: countError } = await supabase
            .from('events')
            .update({ registered_count: newCount })
            .eq('id', evt.id);
          if (countError) throw countError;
        }
        showToast(`Your RSVP for "${evt.title}" has been cancelled.`);
      } else {
        const isAtCapacity = (evt.registered_count || 0) >= (evt.max_attendees || 9999);
        const regStatus: EventRegistration['status'] = isAtCapacity ? 'waitlist' : 'confirmed';

        const newReg: Omit<EventRegistration, 'id'> = {
          event_id: evt.id,
          user_id: profile?.auth_user_id || profile?.id,
          member_id: profile?.id,
          member_name: userName,
          email: userEmail,
          phone: profile?.phone || '',
          registered_at: new Date().toISOString(),
          status: regStatus
        };

        const { error: registrationError } = await supabase
          .from('event_registrations')
          .insert(newReg);
        if (registrationError) throw registrationError;

        if (!isAtCapacity) {
          const newCount = (evt.registered_count || 0) + 1;
          const { error: countError } = await supabase
            .from('events')
            .update({ registered_count: newCount })
            .eq('id', evt.id);
          if (countError) throw countError;
          showToast(`Seat confirmed for "${evt.title}".`);
        } else {
          showToast(`"${evt.title}" is at capacity — you have been added to the waitlist.`);
        }
      }

      await fetchEvents(true);
    } catch (error: any) {
      console.error('Event RSVP update failed:', error);
      showToast(error?.message || 'Unable to update your registration. Please try again.', 'error');
    } finally {
      setBusyEventId(null);
    }
  };

  const runGeofenceVerification = async (
    evt: ChurchEvent,
    locationName: string,
    target: { lat: number; lng: number; source: 'event' | 'church_profile'; label: string },
    occurrence?: EventOccurrence
  ) => {
    const activeRadius = getConfiguredGeofenceRadius();
    setConfiguredRadiusMeters(activeRadius);

    setCheckInModal({
      event: evt,
      occurrence,
      locationName,
      target,
      radiusMeters: activeRadius,
      phase: 'verifying'
    });

    try {
      const geoRes = await verifyGeofencePresence(
        target.lat,
        target.lng,
        target.source,
        activeRadius
      );

      if (!geoRes.allowed) {
        setCheckInModal({
          event: evt,
          occurrence,
          locationName,
          target,
          radiusMeters: geoRes.radiusMeters,
          phase: 'outside',
          result: geoRes
        });
        return;
      }

      const nowIso = new Date().toISOString();
      const existingReg = getEventUserReg(evt);
      const userEmail = profile?.email || 'member@faithconnect.church';
      const userName = profile
        ? `${profile.first_name} ${profile.last_name}`.trim()
        : 'Grace Cathedral Member';

      if (existingReg) {
        const { error: updateErr } = await supabase
          .from('event_registrations')
          .update({
            status: 'checked_in',
            checked_in_at: nowIso
          })
          .eq('id', existingReg.id);
        if (updateErr) throw updateErr;
      } else {
        const walkInReg: Omit<EventRegistration, 'id'> = {
          event_id: evt.id,
          user_id: profile?.auth_user_id || profile?.id,
          member_id: profile?.id,
          member_name: userName,
          email: userEmail,
          phone: profile?.phone || '',
          registered_at: nowIso,
          checked_in_at: nowIso,
          status: 'checked_in'
        };
        const { error: insertErr } = await supabase
          .from('event_registrations')
          .insert(walkInReg);
        if (insertErr) throw insertErr;

        const newCount = (evt.registered_count || 0) + 1;
        await supabase.from('events').update({ registered_count: newCount }).eq('id', evt.id);
      }

      await fetchEvents(true);
      setCheckInModal({
        event: evt,
        occurrence,
        locationName,
        target,
        radiusMeters: geoRes.radiusMeters,
        phase: 'verified',
        result: geoRes,
        checkedInAt: nowIso
      });
      showToast(`Checked in at ${locationName} (${formatDistanceLabel(geoRes.distanceMeters)} from venue).`);
    } catch (err: any) {
      const code = err instanceof GpsAccessError ? err.code : 'UNAVAILABLE';
      setCheckInModal({
        event: evt,
        occurrence,
        locationName,
        target,
        radiusMeters: activeRadius,
        phase: 'error',
        errorCode: code,
        errorMessage:
          err?.message ||
          'Unable to verify your device GPS location. Enable Location permissions and try again.'
      });
    }
  };

  const canCheckInSessionToday = useCallback(
    (evt: ChurchEvent, occurrence?: EventOccurrence): boolean => {
      const effStart = occurrence?.start_time || evt.start_time;
      const effEnd = occurrence?.end_time || evt.end_time;
      const effStatus = occurrence?.status || evt.status;
      if (effStatus === 'cancelled') return false;
      const temporal = getEventTemporalStatus(effStart, effEnd, nowMs, effStatus);
      if (temporal === 'past') return false;
      return isSessionOnEventDay(effStart, effEnd, todayKey);
    },
    [nowMs, todayKey]
  );

  const startGeofenceCheckIn = (evt: ChurchEvent, occurrence?: EventOccurrence) => {
    const effStart = occurrence?.start_time || evt.start_time;
    const effEnd = occurrence?.end_time || evt.end_time;
    const effStatus = occurrence?.status || evt.status;
    const temporal = getEventTemporalStatus(effStart, effEnd, nowMs, effStatus);

    if (temporal === 'past' || effStatus === 'cancelled') {
      showToast('Check-in is closed because this session has ended or been cancelled.', 'error');
      return;
    }

    if (!isSessionOnEventDay(effStart, effEnd, todayKey)) {
      showToast('GPS check-in is only active on the event day.', 'error');
      return;
    }

    const userReg = getEventUserReg(evt);
    if (userReg?.status === 'checked_in' || userReg?.status === 'attended') {
      showToast(`You are already checked in to "${evt.title}".`);
      return;
    }
    if (userReg?.status === 'waitlist') {
      showToast('Waitlisted seats cannot check in until a seat opens up.', 'error');
      return;
    }

    const locationName = occurrence?.override_location || occurrence?.location || evt.location || 'Church Sanctuary';
    const target = getEventGeofenceTarget(evt);
    void runGeofenceVerification(evt, locationName, target, occurrence);
  };

  const downloadICS = (evt: ChurchEvent, occ?: EventOccurrence) => {
    const formatICSDate = (dtStr: string) => {
      const dt = new Date(dtStr);
      return dt.toISOString().replace(/-|:|\.\d\d\d/g, '');
    };

    const startStr = occ?.start_time || evt.start_time;
    const endStr = occ?.end_time || evt.end_time;
    const locStr = occ?.override_location || occ?.location || evt.location || 'Grace Cathedral Sanctuary';

    const icsContent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//FaithConnect Grace Cathedral//EN',
      'BEGIN:VEVENT',
      `SUMMARY:${evt.title}`,
      `DESCRIPTION:${(evt.description || '').replace(/\n/g, ' ')}`,
      `LOCATION:${locStr}`,
      `DTSTART:${formatICSDate(startStr)}`,
      `DTEND:${formatICSDate(endStr)}`,
      'STATUS:CONFIRMED',
      'END:VEVENT',
      'END:VCALENDAR'
    ].join('\r\n');

    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${evt.title.replace(/\s+/g, '_').toLowerCase()}.ics`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const myRsvpCount = useMemo(
    () => activeEvents.filter(evt => Boolean(getEventUserReg(evt))).length,
    [activeEvents, getEventUserReg]
  );

  const filteredEvents = useMemo(() => {
    const q = search.trim().toLowerCase();
    return activeEvents.filter(evt => {
      const matchesSearch =
        !q ||
        evt.title.toLowerCase().includes(q) ||
        (evt.description || '').toLowerCase().includes(q) ||
        (evt.location || '').toLowerCase().includes(q) ||
        (evt.organizer_name || '').toLowerCase().includes(q);
      const matchesCategory = selectedCategory === 'All' || evt.category === selectedCategory;
      const matchesAudience = selectedAudience === 'All' || evt.target_audience === selectedAudience;
      const matchesMyRsvp = !onlyMyRsvps || Boolean(getEventUserReg(evt));
      return matchesSearch && matchesCategory && matchesAudience && matchesMyRsvp;
    });
  }, [activeEvents, search, selectedCategory, selectedAudience, onlyMyRsvps, getEventUserReg]);

  const filteredEventIdSet = useMemo(
    () => new Set(filteredEvents.map(e => e.id)),
    [filteredEvents]
  );

  const activeEventMap = useMemo(
    () => new Map(activeEvents.map(e => [e.id, e])),
    [activeEvents]
  );

  // Upcoming horizon occurrences (now -> +180 days) so each program knows its real next upcoming/live date
  const nextOccurrenceByEventId = useMemo(() => {
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0);
    const horizonEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 180, 23, 59, 59, 999);

    const raw = activeEvents.flatMap(ev => generateEventOccurrences(ev, startOfToday, horizonEnd));
    const resolved = resolveOccurrencePreemption(raw).filter(
      occ => occ.status !== 'cancelled' && new Date(occ.end_time || occ.start_time).getTime() >= nowMs
    );

    const map = new Map<string, EventOccurrence>();
    resolved.forEach(occ => {
      const prev = map.get(occ.event_id);
      if (!prev || new Date(occ.start_time).getTime() < new Date(prev.start_time).getTime()) {
        map.set(occ.event_id, occ);
      }
    });
    return map;
  }, [activeEvents, today, nowMs, syncTick]);

  // Sort Program Roster: ongoing & upcoming soonest-first, followed by recently passed one-time events
  const orderedFilteredEvents = useMemo(() => {
    return [...filteredEvents].sort((a, b) => {
      const nextA = nextOccurrenceByEventId.get(a.id);
      const nextB = nextOccurrenceByEventId.get(b.id);
      const temporalA = nextA
        ? getEventTemporalStatus(nextA.start_time, nextA.end_time, nowMs, nextA.status)
        : getEventTemporalStatus(a.start_time, a.end_time, nowMs, a.status);
      const temporalB = nextB
        ? getEventTemporalStatus(nextB.start_time, nextB.end_time, nowMs, nextB.status)
        : getEventTemporalStatus(b.start_time, b.end_time, nowMs, b.status);

      const isActiveA = temporalA !== 'past';
      const isActiveB = temporalB !== 'past';
      if (isActiveA !== isActiveB) return isActiveA ? -1 : 1;

      const timeA = new Date(nextA?.start_time || a.start_time).getTime();
      const timeB = new Date(nextB?.start_time || b.start_time).getTime();
      return isActiveA ? timeA - timeB : timeB - timeA;
    });
  }, [filteredEvents, nextOccurrenceByEventId, nowMs]);

  const { upcomingFilteredEvents, pastFilteredEvents } = useMemo(() => {
    const upcoming: ChurchEvent[] = [];
    const past: ChurchEvent[] = [];
    for (const evt of orderedFilteredEvents) {
      const nextOcc = nextOccurrenceByEventId.get(evt.id);
      const temporal = nextOcc
        ? getEventTemporalStatus(nextOcc.start_time, nextOcc.end_time, nowMs, nextOcc.status)
        : getEventTemporalStatus(evt.start_time, evt.end_time, nowMs, evt.status);
      if (temporal === 'past') {
        past.push(evt);
      } else {
        upcoming.push(evt);
      }
    }
    return { upcomingFilteredEvents: upcoming, pastFilteredEvents: past };
  }, [orderedFilteredEvents, nextOccurrenceByEventId, nowMs]);

  const displayedRosterEvents = useMemo(
    () => (showPastEvents ? [...upcomingFilteredEvents, ...pastFilteredEvents] : upcomingFilteredEvents),
    [showPastEvents, upcomingFilteredEvents, pastFilteredEvents]
  );

  const year = currentMonthDate.getFullYear();
  const month = currentMonthDate.getMonth();
  const firstDayOfMonth = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Month Matrix Occurrences (preemption resolved across ALL active events, then filtered)
  const monthOccurrencesByDate = useMemo(() => {
    const rangeStart = new Date(year, month, 1, 0, 0, 0, 0);
    const rangeEnd = new Date(year, month + 1, 0, 23, 59, 59, 999);

    const raw = activeEvents.flatMap(ev => generateEventOccurrences(ev, rangeStart, rangeEnd));
    const resolved = resolveOccurrencePreemption(raw);

    const map = new Map<string, CalendarOccurrenceEntry[]>();
    resolved.forEach(occ => {
      if (!filteredEventIdSet.has(occ.event_id)) return;
      const parent = activeEventMap.get(occ.event_id);
      if (!parent) return;

      // Group under effective local date (important if rescheduled across days)
      const effectiveKey = toLocalDateKey(occ.start_time) || occ.occurrence_date;
      if (!effectiveKey) return;
      const bucket = map.get(effectiveKey) || [];
      bucket.push({ occ, event: parent });
      map.set(effectiveKey, bucket);
    });

    map.forEach(entries => {
      entries.sort((a, b) => {
        if (a.occ.status === 'cancelled' && b.occ.status !== 'cancelled') return 1;
        if (a.occ.status !== 'cancelled' && b.occ.status === 'cancelled') return -1;
        return new Date(a.occ.start_time).getTime() - new Date(b.occ.start_time).getTime();
      });
    });

    return map;
  }, [activeEvents, activeEventMap, filteredEventIdSet, year, month, syncTick]);

  const monthActiveProgramCount = useMemo(() => {
    let count = 0;
    monthOccurrencesByDate.forEach(entries => {
      count += entries.filter(item => item.occ.status !== 'cancelled').length;
    });
    return count;
  }, [monthOccurrencesByDate]);

  // Keep selectedDateKey synced to a meaningful day when switching months or when new events arrive
  useEffect(() => {
    if (loading || filteredEvents.length === 0) return;
    const monthPrefix = `${year}-${String(month + 1).padStart(2, '0')}`;
    const currentEntries = (monthOccurrencesByDate.get(selectedDateKey) || []).filter(
      item => item.occ.status !== 'cancelled'
    );
    if (selectedDateKey.startsWith(monthPrefix) && currentEntries.length > 0) {
      return;
    }

    if (todayKey.startsWith(monthPrefix)) {
      const todayEntries = (monthOccurrencesByDate.get(todayKey) || []).filter(
        item => item.occ.status !== 'cancelled'
      );
      if (todayEntries.length > 0) {
        setSelectedDateKey(todayKey);
        return;
      }
    }

    const sortedMonthKeys: string[] = [];
    monthOccurrencesByDate.forEach((entries, k) => {
      if (k.startsWith(monthPrefix) && entries.some(item => item.occ.status !== 'cancelled')) {
        sortedMonthKeys.push(k);
      }
    });
    sortedMonthKeys.sort();
    const firstActiveKey = sortedMonthKeys[0];

    if (firstActiveKey) {
      setSelectedDateKey(firstActiveKey);
    } else if (!selectedDateKey.startsWith(monthPrefix)) {
      setSelectedDateKey(`${monthPrefix}-01`);
    }
  }, [year, month, loading, filteredEvents.length, monthOccurrencesByDate, todayKey]);

  const selectedDayEntries = monthOccurrencesByDate.get(selectedDateKey) || [];
  const selectedDayActiveCount = selectedDayEntries.filter(item => item.occ.status !== 'cancelled').length;

  const jumpToEventOnCalendar = (evt: ChurchEvent, occ?: EventOccurrence) => {
    const startDt = new Date(occ?.start_time || evt.start_time);
    if (Number.isNaN(startDt.getTime())) return;
    const dateKey = toLocalDateKey(startDt);
    setViewMode('calendar');
    setCurrentMonthDate(new Date(startDt.getFullYear(), startDt.getMonth(), 1));
    setSelectedDateKey(dateKey);
    setWeekAnchorDate(getStartOfWeek(startDt));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const nextUpcomingProgram = useMemo(() => {
    for (const evt of orderedFilteredEvents) {
      const occ = nextOccurrenceByEventId.get(evt.id);
      if (occ) return { event: evt, occ };
    }
    return orderedFilteredEvents[0] ? { event: orderedFilteredEvents[0], occ: undefined } : null;
  }, [orderedFilteredEvents, nextOccurrenceByEventId]);

  const jumpToNextEvent = () => {
    if (!nextUpcomingProgram) return;
    jumpToEventOnCalendar(nextUpcomingProgram.event, nextUpcomingProgram.occ);
  };

  // Week computation for 'week' view using recurring occurrences engine
  const weekOccurrencesByDate = useMemo(() => {
    const rangeStart = new Date(
      weekAnchorDate.getFullYear(),
      weekAnchorDate.getMonth(),
      weekAnchorDate.getDate(),
      0,
      0,
      0,
      0
    );
    const rangeEnd = new Date(
      weekAnchorDate.getFullYear(),
      weekAnchorDate.getMonth(),
      weekAnchorDate.getDate() + 6,
      23,
      59,
      59,
      999
    );

    const raw = activeEvents.flatMap(ev => generateEventOccurrences(ev, rangeStart, rangeEnd));
    const resolved = resolveOccurrencePreemption(raw);

    const map = new Map<string, CalendarOccurrenceEntry[]>();
    resolved.forEach(occ => {
      if (!filteredEventIdSet.has(occ.event_id)) return;
      const parent = activeEventMap.get(occ.event_id);
      if (!parent) return;
      const effectiveKey = toLocalDateKey(occ.start_time) || occ.occurrence_date;
      if (!effectiveKey) return;
      const bucket = map.get(effectiveKey) || [];
      bucket.push({ occ, event: parent });
      map.set(effectiveKey, bucket);
    });

    map.forEach(entries => {
      entries.sort((a, b) => new Date(a.occ.start_time).getTime() - new Date(b.occ.start_time).getTime());
    });

    return map;
  }, [activeEvents, activeEventMap, filteredEventIdSet, weekAnchorDate, syncTick]);

  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }).map((_, idx) => {
      const dt = new Date(weekAnchorDate.getFullYear(), weekAnchorDate.getMonth(), weekAnchorDate.getDate() + idx);
      const key = toLocalDateKey(dt);
      const entries = weekOccurrencesByDate.get(key) || [];
      return {
        date: dt,
        key,
        dayShort: WEEKDAY_SHORT[dt.getDay()],
        dayNum: dt.getDate(),
        entries,
        activeCount: entries.filter(e => e.occ.status !== 'cancelled').length
      };
    });
  }, [weekAnchorDate, weekOccurrencesByDate]);

  const weekFilteredEntries = useMemo(() => {
    if (selectedWeekDayKey !== 'all') {
      return weekOccurrencesByDate.get(selectedWeekDayKey) || [];
    }
    return weekDays.flatMap(d => d.entries);
  }, [weekDays, selectedWeekDayKey, weekOccurrencesByDate]);

  const weekRangeLabel = useMemo(() => {
    const start = weekDays[0]?.date;
    const end = weekDays[6]?.date;
    if (!start || !end) return '';
    const sameMonth = start.getMonth() === end.getMonth();
    const startFmt = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const endFmt = end.toLocaleDateString('en-US', {
      month: sameMonth ? undefined : 'short',
      day: 'numeric',
      year: 'numeric'
    });
    return `${startFmt} – ${endFmt}`;
  }, [weekDays]);

  const featuredEvent = useMemo(() => {
    const sourcePool = orderedFilteredEvents.length > 0 ? orderedFilteredEvents : activeEvents;
    const upcomingPool = sourcePool.filter(e => {
      const nextOcc = nextOccurrenceByEventId.get(e.id);
      const temporal = nextOcc
        ? getEventTemporalStatus(nextOcc.start_time, nextOcc.end_time, nowMs, nextOcc.status)
        : getEventTemporalStatus(e.start_time, e.end_time, nowMs, e.status);
      return temporal !== 'past';
    });
    if (upcomingPool.length === 0) return null;
    return (
      upcomingPool.find(e => e.category === 'Conference' || e.is_combined_service || e.registration_required) ||
      upcomingPool[0]
    );
  }, [orderedFilteredEvents, activeEvents, nextOccurrenceByEventId, nowMs]);

  const hasActiveFilters =
    search.trim().length > 0 ||
    selectedCategory !== 'All' ||
    selectedAudience !== 'All' ||
    onlyMyRsvps;

  const resetAllFilters = () => {
    setSearch('');
    setSelectedCategory('All');
    setSelectedAudience('All');
    setOnlyMyRsvps(false);
  };

  const renderEventActionButton = (
    evt: ChurchEvent,
    fullWidth = false,
    occurrence?: EventOccurrence
  ) => {
    const userReg = getEventUserReg(evt);
    const isFull = (evt.registered_count || 0) >= (evt.max_attendees || 9999);
    const isBusy = busyEventId === evt.id;

    const effectiveOcc = occurrence || nextOccurrenceByEventId.get(evt.id);
    const temporal = effectiveOcc
      ? getEventTemporalStatus(effectiveOcc.start_time, effectiveOcc.end_time, nowMs, effectiveOcc.status)
      : getEventTemporalStatus(evt.start_time, evt.end_time, nowMs, evt.status);

    const isCheckedIn = userReg?.status === 'checked_in' || userReg?.status === 'attended';

    if (temporal === 'past') {
      return (
        <button
          type="button"
          disabled
          className={`${fullWidth ? 'w-full' : ''} min-h-[44px] sm:min-h-[40px] px-4 py-2 rounded-xl text-xs font-semibold bg-slate-100 text-slate-500 border border-slate-200 flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 cursor-not-allowed`}
        >
          <History size={15} />
          <span>
            {isCheckedIn
              ? 'Checked In · Ended'
              : userReg
              ? 'Reserved · Ended'
              : occurrence
              ? 'Session Ended'
              : 'Event Ended'}
          </span>
        </button>
      );
    }

    if (isCheckedIn) {
      return (
        <button
          type="button"
          disabled
          className={`${fullWidth ? 'w-full' : ''} min-h-[44px] sm:min-h-[40px] px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 text-white flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 cursor-default`}
        >
          <ShieldCheck size={15} />
          <span>Checked In</span>
        </button>
      );
    }

    return (
      <button
        type="button"
        disabled={isBusy}
        onClick={() => handleRSVPToggle(evt)}
        className={`${fullWidth ? 'w-full' : ''} min-h-[44px] sm:min-h-[40px] px-4 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 disabled:opacity-60 ${
          userReg
            ? userReg.status === 'waitlist'
              ? 'bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300'
              : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200'
            : isFull
            ? 'bg-amber-500 hover:bg-amber-600 text-slate-950'
            : 'bg-indigo-600 hover:bg-indigo-700 text-white'
        }`}
      >
        {userReg ? (
          userReg.status === 'waitlist' ? <Clock size={15} /> : <Check size={15} />
        ) : (
          <CalendarCheck size={15} />
        )}
        <span>
          {isBusy
            ? 'Updating...'
            : userReg
            ? userReg.status === 'waitlist'
              ? 'Waitlisted'
              : 'Reserved'
            : isFull
            ? 'Join Waitlist'
            : 'Reserve Seat'}
        </span>
      </button>
    );
  };

  if (loading && events.length === 0) {
    return (
      <div className="space-y-5 pb-12 animate-pulse">
        <div className="bg-white rounded-2xl sm:rounded-3xl border border-slate-200 p-5 sm:p-6 h-32" />
        <div className="bg-slate-200 rounded-2xl sm:rounded-3xl h-64 sm:h-72" />
        <div className="bg-white rounded-2xl border border-slate-200 p-4 h-28" />
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-5">
          {[1, 2, 3].map(n => (
            <div key={n} className="bg-white rounded-2xl border border-slate-200 h-72" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 sm:space-y-6 pb-20 md:pb-12 min-w-0">
      {/* Page Header & Segmented View Switcher */}
      <header className="bg-white p-4 sm:p-6 rounded-2xl sm:rounded-3xl border border-slate-200 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500 font-medium">
            <span className="text-indigo-700 font-semibold">Grace Cathedral</span>
            <span aria-hidden="true">·</span>
            <span>Faith &amp; Fellowship Schedule</span>
            <span aria-hidden="true">·</span>
            <span className="tabular-nums text-slate-700 font-semibold">
              {activeEvents.length} Active {activeEvents.length === 1 ? 'Program' : 'Programs'}
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight [text-wrap:balance]">
            Church Events &amp; Calendar
          </h1>
          <p className="text-slate-600 text-[13px] sm:text-sm leading-relaxed">
            Browse services, conferences, and ministry gatherings, reserve seats, and save check-in passes.
          </p>
        </div>

        <div
          role="tablist"
          aria-label="Calendar view mode"
          className="grid grid-cols-3 sm:inline-flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 w-full sm:w-auto shrink-0"
        >
          <button
            type="button"
            role="tab"
            aria-selected={viewMode === 'calendar'}
            onClick={() => setViewMode('calendar')}
            className={`min-h-[44px] sm:min-h-[40px] px-2.5 sm:px-4 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 flex items-center justify-center ${
              viewMode === 'calendar'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Month Grid
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={viewMode === 'agenda'}
            onClick={() => setViewMode('agenda')}
            className={`min-h-[44px] sm:min-h-[40px] px-2.5 sm:px-4 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 flex items-center justify-center ${
              viewMode === 'agenda'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Program List
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={viewMode === 'week'}
            onClick={() => setViewMode('week')}
            className={`min-h-[44px] sm:min-h-[40px] px-2.5 sm:px-4 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 flex items-center justify-center ${
              viewMode === 'week'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            This Week
          </button>
        </div>
      </header>

      {/* Toast Feedback Banner */}
      {toastMessage && (
        <div
          role="status"
          className={`p-3.5 sm:p-4 rounded-2xl text-xs sm:text-sm font-semibold flex items-center justify-between gap-3 border ${
            toastMessage.tone === 'error'
              ? 'bg-rose-50 text-rose-800 border-rose-200'
              : 'bg-slate-900 text-white border-slate-800'
          }`}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <CheckCircle2
              size={18}
              className={toastMessage.tone === 'error' ? 'text-rose-600 shrink-0' : 'text-emerald-400 shrink-0'}
            />
            <span className="leading-snug">{toastMessage.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setToastMessage(null)}
            aria-label="Dismiss message"
            className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg opacity-80 hover:opacity-100 cursor-pointer shrink-0"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Featured Church Program Hero (Full-width stacked on Mobile & 768px Tablet, 12-col on Desktop) */}
      {featuredEvent && (() => {
        const featReg = getEventUserReg(featuredEvent);
        const featNextOcc = nextOccurrenceByEventId.get(featuredEvent.id);
        const featStart = featNextOcc?.start_time || featuredEvent.start_time;
        const featEnd = featNextOcc?.end_time || featuredEvent.end_time;
        const featLoc = featNextOcc?.override_location || featNextOcc?.location || featuredEvent.location;
        const featTemporal = getEventTemporalStatus(featStart, featEnd, nowMs, featNextOcc?.status || featuredEvent.status);
        const featIsPast = featTemporal === 'past';
        const featIsLive = featTemporal === 'ongoing';
        const maxAtt = featuredEvent.max_attendees || 350;
        const regCount = featuredEvent.registered_count || 0;
        const isFull = regCount >= maxAtt;
        const fillPct = Math.min(100, Math.round((regCount / maxAtt) * 100));
        const rec = getRecurrenceBadge(featuredEvent.recurrence);
        const acc = getEventAccount(
          featuredEvent.id,
          featuredEvent.title,
          featuredEvent.recurring_funding_allowance,
          featuredEvent.account_number
        );

        return (
          <section className={`relative rounded-2xl sm:rounded-3xl overflow-hidden bg-slate-900 text-white border border-slate-800 ${featIsPast ? 'opacity-90' : ''}`}>
            <div className="absolute inset-0">
              <EventCoverImage
                src={featuredEvent.featured_image}
                title={featuredEvent.title}
                className={featIsPast ? 'opacity-25 grayscale' : 'opacity-35'}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/80 to-slate-950/40" />
            </div>

            <div className="relative p-5 sm:p-7 grid grid-cols-1 lg:grid-cols-12 gap-5 lg:gap-6 items-stretch">
              {/* Left Narrative Column */}
              <div className="lg:col-span-7 xl:col-span-8 flex flex-col justify-between gap-4 min-w-0">
                <div className="space-y-2.5">
                  <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-amber-200">
                    {featIsLive ? (
                      <span className="inline-flex items-center gap-1.5 font-bold text-rose-300">
                        <Radio size={13} className="animate-pulse" />
                        Happening Now
                      </span>
                    ) : featIsPast ? (
                      <span className="inline-flex items-center gap-1.5 font-bold text-slate-300">
                        <History size={13} />
                        Past Program · Ended
                      </span>
                    ) : (
                      <span className="font-bold text-amber-300">Featured Program</span>
                    )}
                    <span aria-hidden="true" className="text-slate-400">·</span>
                    <span className="text-slate-200">{rec.label}</span>
                    <span aria-hidden="true" className="text-slate-400">·</span>
                    <span className="tabular-nums text-white font-semibold">
                      {new Date(featStart).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric'
                      })}
                    </span>
                    {!featIsPast && isFull && (
                      <>
                        <span aria-hidden="true" className="text-slate-400">·</span>
                        <span className="text-rose-300 font-semibold">Waitlist Open</span>
                      </>
                    )}
                  </div>

                  <h2 className="text-xl sm:text-2xl xl:text-3xl font-bold tracking-tight leading-snug text-white [text-wrap:balance]">
                    {featuredEvent.title}
                  </h2>

                  <p className="text-[13px] sm:text-sm text-slate-200 leading-relaxed line-clamp-2 max-w-2xl">
                    {featuredEvent.description}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-200 pt-1">
                  <span className="inline-flex items-center gap-1.5 tabular-nums">
                    <Clock size={14} className="text-amber-300 shrink-0" />
                    <span>{formatTimeRange(featStart, featEnd)}</span>
                  </span>
                  <span className="inline-flex items-center gap-1.5 min-w-0">
                    <MapPin size={14} className="text-amber-300 shrink-0" />
                    <span className="truncate">{featLoc}</span>
                  </span>
                  {featuredEvent.organizer_name && (
                    <span className="inline-flex items-center gap-1.5 min-w-0">
                      <Users size={14} className="text-amber-300 shrink-0" />
                      <span className="truncate">{featuredEvent.organizer_name}</span>
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-emerald-300">
                    <Landmark size={13} className="shrink-0" />
                    <span>{featuredEvent.account_number || acc.account_number}</span>
                  </span>
                </div>
              </div>

              {/* Right Action & Capacity Panel */}
              <div className="lg:col-span-5 xl:col-span-4 bg-white/10 backdrop-blur-md p-4 sm:p-5 rounded-2xl border border-white/15 flex flex-col justify-between gap-4 min-w-0">
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-amber-200 font-semibold">Seats &amp; Capacity</span>
                    <span className="tabular-nums font-bold text-white">
                      {regCount} / {maxAtt}
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-white/15 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        featIsPast ? 'bg-slate-400' : isFull ? 'bg-amber-400' : 'bg-emerald-400'
                      }`}
                      style={{ width: `${fillPct}%` }}
                    />
                  </div>
                  <p className="text-[11px] text-slate-300 tabular-nums">
                    {featIsPast
                      ? 'This program date has concluded'
                      : isFull
                      ? 'Main capacity reached — waitlist active'
                      : `${maxAtt - regCount} seats remaining`}
                  </p>
                </div>

                <div className="space-y-2">
                  {featIsPast ? (
                    <button
                      type="button"
                      disabled
                      className="w-full min-h-[44px] px-4 py-2.5 rounded-xl text-xs font-bold bg-white/15 text-slate-300 border border-white/15 flex items-center justify-center gap-2 whitespace-nowrap cursor-not-allowed"
                    >
                      <History size={16} />
                      <span>
                        {featReg?.status === 'checked_in' || featReg?.status === 'attended'
                          ? 'Checked In · Event Ended'
                          : featReg
                          ? 'Reserved · Event Ended'
                          : 'Event Ended'}
                      </span>
                    </button>
                  ) : (
                    <>
                      {featReg?.status === 'checked_in' || featReg?.status === 'attended' ? (
                        <button
                          type="button"
                          disabled
                          className="w-full min-h-[44px] px-4 py-2.5 rounded-xl text-xs font-bold bg-emerald-600 text-white flex items-center justify-center gap-2 whitespace-nowrap cursor-default"
                        >
                          <ShieldCheck size={16} />
                          <span>Checked In on Premises</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={busyEventId === featuredEvent.id}
                          onClick={() => handleRSVPToggle(featuredEvent)}
                          className={`w-full min-h-[44px] px-4 py-2.5 rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center justify-center gap-2 whitespace-nowrap ${
                            featReg
                              ? featReg.status === 'waitlist'
                                ? 'bg-amber-600 hover:bg-amber-700 text-white'
                                : 'bg-emerald-500 hover:bg-emerald-600 text-white'
                              : 'bg-amber-400 hover:bg-amber-300 text-slate-950'
                          }`}
                        >
                          {featReg ? (
                            featReg.status === 'waitlist' ? <Clock size={16} /> : <CheckCircle2 size={16} />
                          ) : (
                            <CalendarCheck size={16} />
                          )}
                          <span>
                            {featReg
                              ? featReg.status === 'waitlist'
                                ? 'Waitlisted (Cancel)'
                                : 'Reserved (Cancel)'
                              : isFull
                              ? 'Join Waitlist'
                              : 'Reserve Seat'}
                          </span>
                        </button>
                      )}

                      {canCheckInSessionToday(featuredEvent, featNextOcc) &&
                        featReg?.status !== 'waitlist' &&
                        featReg?.status !== 'checked_in' &&
                        featReg?.status !== 'attended' && (
                          <button
                            type="button"
                            onClick={() => startGeofenceCheckIn(featuredEvent, featNextOcc)}
                            className="w-full min-h-[44px] px-4 py-2.5 rounded-xl text-xs font-bold bg-indigo-500 hover:bg-indigo-400 text-white transition-colors cursor-pointer flex items-center justify-center gap-2 whitespace-nowrap"
                          >
                            <LocateFixed size={15} />
                            <span>GPS Check-In (On Premises)</span>
                          </button>
                        )}
                    </>
                  )}

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => downloadICS(featuredEvent, featNextOcc)}
                      className="min-h-[44px] sm:min-h-[40px] px-3 py-2 bg-white/15 hover:bg-white/25 text-white rounded-xl text-xs font-semibold transition-colors cursor-pointer flex items-center justify-center gap-1.5 whitespace-nowrap"
                    >
                      <Download size={14} />
                      <span>Save .ics</span>
                    </button>
                    {featReg ? (
                      <button
                        type="button"
                        onClick={() => setShowQRPass({ event: featuredEvent, reg: featReg, occurrence: featNextOcc })}
                        className="min-h-[44px] sm:min-h-[40px] px-3 py-2 bg-white/15 hover:bg-white/25 text-white rounded-xl text-xs font-semibold transition-colors cursor-pointer flex items-center justify-center gap-1.5 whitespace-nowrap"
                      >
                        <QrCode size={14} />
                        <span>QR Pass</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setSelectedEventDetail({ event: featuredEvent, occurrence: featNextOcc })}
                        className="min-h-[44px] sm:min-h-[40px] px-3 py-2 bg-white/15 hover:bg-white/25 text-white rounded-xl text-xs font-semibold transition-colors cursor-pointer flex items-center justify-center gap-1.5 whitespace-nowrap"
                      >
                        <span>Program Details</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </section>
        );
      })()}

      {/* Search & Thumb-Friendly Filter Bar */}
      <section className="bg-white p-4 sm:p-5 rounded-2xl sm:rounded-3xl border border-slate-200 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-2.5">
          {/* Search Input (14px on mobile/tablet to prevent iOS zoom & maximize readability) */}
          <div className="relative sm:col-span-2 lg:col-span-6">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Search program, topic, or venue..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full min-h-[44px] pl-10 pr-10 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-900 placeholder:text-slate-400 outline-none focus:border-indigo-500 focus:bg-white transition-colors"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                aria-label="Clear search"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 min-h-[36px] min-w-[36px] flex items-center justify-center text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X size={15} />
              </button>
            )}
          </div>

          {/* Audience Select */}
          <div className="lg:col-span-3 flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 rounded-xl min-h-[44px]">
            <Users size={15} className="text-slate-400 shrink-0" />
            <select
              aria-label="Filter by audience"
              value={selectedAudience}
              onChange={e => setSelectedAudience(e.target.value)}
              className="bg-transparent text-sm font-semibold text-slate-800 outline-none w-full min-h-[42px] cursor-pointer"
            >
              {audienceList.map(a => (
                <option key={a} value={a}>
                  {a === 'All' ? 'All Audiences' : a}
                </option>
              ))}
            </select>
          </div>

          {/* My RSVPs Toggle */}
          <button
            type="button"
            onClick={() => setOnlyMyRsvps(prev => !prev)}
            className={`lg:col-span-3 min-h-[44px] px-3.5 py-2 rounded-xl border text-xs sm:text-[13px] font-semibold transition-colors cursor-pointer flex items-center justify-center gap-2 whitespace-nowrap ${
              onlyMyRsvps
                ? 'bg-indigo-600 border-indigo-600 text-white'
                : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700'
            }`}
          >
            <CalendarCheck size={15} />
            <span>My RSVPs</span>
            <span
              className={`tabular-nums text-xs font-bold ${
                onlyMyRsvps ? 'text-indigo-100' : 'text-slate-500'
              }`}
            >
              ({myRsvpCount})
            </span>
          </button>
        </div>

        {/* Horizontal Scrollable Category Filter Strip */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
          <span className="hidden lg:inline-flex items-center gap-1 text-xs font-semibold text-slate-400 pr-1.5 shrink-0">
            <Filter size={13} />
            Category:
          </span>
          {categoriesList.map(category => {
            const active = selectedCategory === category;
            return (
              <button
                key={category}
                type="button"
                onClick={() => setSelectedCategory(category)}
                className={`min-h-[42px] sm:min-h-[36px] px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  active
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
              >
                {category === 'All' ? 'All Programs' : category}
              </button>
            );
          })}
        </div>
      </section>

      {/* VIEW MODE 1: RESPONSIVE MONTH MATRIX + SELECTED DAY AGENDA */}
      {viewMode === 'calendar' && (
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Month Grid */}
          <div className="lg:col-span-7 xl:col-span-8 bg-white rounded-2xl sm:rounded-3xl border border-slate-200 p-4 sm:p-6 space-y-4 min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
              <div className="min-w-0 space-y-0.5">
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
                  <h2 className="font-bold text-slate-900 text-lg sm:text-xl tabular-nums">
                    {MONTH_NAMES[month]} {year}
                  </h2>
                  <span className="text-xs font-semibold text-indigo-700 tabular-nums">
                    {monthActiveProgramCount} {monthActiveProgramCount === 1 ? 'session' : 'sessions'}
                  </span>
                </div>
                <p className="text-xs sm:text-[13px] text-slate-500">
                  Tap any highlighted date to inspect its full schedule
                </p>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setCurrentMonthDate(new Date(year, month - 1, 1))}
                  aria-label="Previous month"
                  className="min-h-[44px] min-w-[44px] sm:min-h-[40px] sm:min-w-[40px] flex items-center justify-center rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer transition-colors"
                >
                  <ChevronLeft size={18} />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const now = new Date();
                    setCurrentMonthDate(new Date(now.getFullYear(), now.getMonth(), 1));
                    setSelectedDateKey(toLocalDateKey(now));
                  }}
                  className="min-h-[44px] sm:min-h-[40px] px-3.5 rounded-xl bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 text-slate-800 text-xs font-semibold cursor-pointer transition-colors whitespace-nowrap"
                >
                  Today
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentMonthDate(new Date(year, month + 1, 1))}
                  aria-label="Next month"
                  className="min-h-[44px] min-w-[44px] sm:min-h-[40px] sm:min-w-[40px] flex items-center justify-center rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer transition-colors"
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            </div>

            {/* Weekday Column Headers */}
            <div className="grid grid-cols-7 text-center font-semibold text-slate-500 text-xs py-1 border-b border-slate-100">
              {WEEKDAY_SHORT.map(d => (
                <div key={d} className="py-1">
                  <span className="sm:hidden">{d.slice(0, 2)}</span>
                  <span className="hidden sm:inline">{d}</span>
                </div>
              ))}
            </div>

            {/* Calendar Grid Cells */}
            <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
              {Array.from({ length: firstDayOfMonth }).map((_, idx) => (
                <div
                  key={`blank-${idx}`}
                  className="min-h-[54px] sm:min-h-[84px] lg:min-h-[96px] rounded-xl bg-slate-50/60 border border-slate-100/80 opacity-50"
                />
              ))}

              {Array.from({ length: daysInMonth }).map((_, idx) => {
                const dayNum = idx + 1;
                const dateObj = new Date(year, month, dayNum);
                const dateKey = toLocalDateKey(dateObj);
                const isToday = dateKey === todayKey;
                const isPastDay = dateKey < todayKey;
                const isSelected = dateKey === selectedDateKey;
                const dayEntries = (monthOccurrencesByDate.get(dateKey) || []).filter(
                  item => item.occ.status !== 'cancelled'
                );
                const hasEvents = dayEntries.length > 0;

                return (
                  <button
                    key={dateKey}
                    type="button"
                    onClick={() => {
                      setSelectedDateKey(dateKey);
                      if (typeof window !== 'undefined' && window.innerWidth < 1024 && dayEntries.length > 0) {
                        dayScheduleRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                      }
                    }}
                    aria-label={`${formatReadableDate(dateKey)}, ${dayEntries.length} events${isPastDay ? ', past date' : ''}`}
                    className={`min-h-[54px] sm:min-h-[84px] lg:min-h-[96px] rounded-xl border p-1 sm:p-1.5 flex flex-col justify-between text-left transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                      isSelected
                        ? 'bg-indigo-50 border-indigo-500 ring-1 ring-indigo-500'
                        : isToday
                        ? 'bg-indigo-50/40 border-indigo-300'
                        : isPastDay
                        ? 'bg-slate-50/75 border-slate-100 hover:border-slate-300'
                        : hasEvents
                        ? 'bg-white border-slate-200 hover:border-indigo-300'
                        : 'bg-slate-50/40 border-slate-100 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full gap-1">
                      <span
                        className={`text-[13px] sm:text-xs font-bold tabular-nums w-6 h-6 rounded-full flex items-center justify-center ${
                          isToday
                            ? 'bg-indigo-600 text-white'
                            : isSelected
                            ? 'text-indigo-900'
                            : isPastDay
                            ? 'text-slate-400 font-semibold'
                            : 'text-slate-800'
                        }`}
                      >
                        {dayNum}
                      </span>
                      {hasEvents && (
                        <span
                          className={`hidden sm:inline-block text-[11px] font-bold tabular-nums pr-0.5 ${
                            isPastDay ? 'text-slate-400' : 'text-indigo-700'
                          }`}
                        >
                          {dayEntries.length}
                        </span>
                      )}
                    </div>

                    {/* Mobile Compact Dots (< sm) */}
                    {hasEvents && (
                      <div className="flex sm:hidden items-center justify-center gap-1 pt-1 w-full">
                        {dayEntries.slice(0, 3).map(({ occ, event }) => {
                          const reg = getEventUserReg(event);
                          const isSpecial = occ.is_combined_service || event.is_combined_service;
                          const temporal = getEventTemporalStatus(occ.start_time, occ.end_time, nowMs, occ.status);
                          const isPastOcc = temporal === 'past';
                          const isLiveOcc = temporal === 'ongoing';
                          return (
                            <span
                              key={occ.id}
                              className={`w-1.5 h-1.5 rounded-full ${
                                isLiveOcc
                                  ? 'bg-rose-500 ring-2 ring-rose-200'
                                  : isPastOcc
                                  ? reg
                                    ? 'bg-emerald-300'
                                    : isSpecial
                                    ? 'bg-amber-300'
                                    : 'bg-slate-300'
                                  : reg
                                  ? 'bg-emerald-600'
                                  : isSpecial
                                  ? 'bg-amber-500'
                                  : 'bg-indigo-600'
                              }`}
                            />
                          );
                        })}
                        {dayEntries.length > 3 && (
                          <span
                            className={`text-[10px] font-bold tabular-nums ${
                              isPastDay ? 'text-slate-400' : 'text-indigo-700'
                            }`}
                          >
                            +{dayEntries.length - 3}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Tablet & Desktop Event Chips (sm+) — Google Calendar muted treatment for passed events */}
                    {hasEvents && (
                      <div className="hidden sm:block space-y-1 w-full overflow-hidden">
                        {dayEntries.slice(0, 2).map(({ occ, event }) => {
                          const reg = getEventUserReg(event);
                          const isSpecial = occ.is_combined_service || event.is_combined_service;
                          const temporal = getEventTemporalStatus(occ.start_time, occ.end_time, nowMs, occ.status);
                          const isPastOcc = temporal === 'past';
                          const isLiveOcc = temporal === 'ongoing';

                          const chipStyle = isPastOcc
                            ? reg
                              ? 'bg-emerald-50 text-emerald-700/80 border border-emerald-200/80'
                              : isSpecial
                              ? 'bg-amber-50 text-amber-800/80 border border-amber-200/80'
                              : occ.status === 'rescheduled'
                              ? 'bg-purple-50 text-purple-700/80 border border-purple-200/80'
                              : 'bg-slate-100 text-slate-500 border border-slate-200/90'
                            : reg
                            ? 'bg-emerald-600 text-white'
                            : isSpecial
                            ? 'bg-amber-500 text-slate-950'
                            : occ.status === 'rescheduled'
                            ? 'bg-purple-600 text-white'
                            : 'bg-indigo-600 text-white';

                          return (
                            <div
                              key={occ.id}
                              className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-md truncate flex items-center gap-1 ${chipStyle}`}
                              title={`${event.title}${isPastOcc ? ' (Ended)' : isLiveOcc ? ' (Happening Now)' : ''}`}
                            >
                              {isLiveOcc && (
                                <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse shrink-0" />
                              )}
                              <span
                                className={`truncate ${
                                  isPastOcc ? 'line-through decoration-slate-500/85' : ''
                                }`}
                              >
                                {event.title}
                              </span>
                            </div>
                          );
                        })}
                        {dayEntries.length > 2 && (
                          <div
                            className={`text-[11px] font-bold text-right pr-0.5 tabular-nums ${
                              isPastDay ? 'text-slate-400' : 'text-indigo-700'
                            }`}
                          >
                            +{dayEntries.length - 2} more
                          </div>
                        )}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Clean Color Legend */}
            <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-600">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-indigo-600 shrink-0" />
                <span>Scheduled</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 shrink-0" />
                <span>Registered</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0" />
                <span>Combined / Special</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-purple-600 shrink-0" />
                <span>Rescheduled</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shrink-0" />
                <span>Happening Now</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-slate-200 border border-slate-300 shrink-0" />
                <span>Past / Ended</span>
              </span>
            </div>
          </div>

          {/* Selected Day Schedule Panel (Directly below Grid on Mobile/Tablet, Right Column on Desktop) */}
          <aside
            ref={dayScheduleRef}
            className="lg:col-span-5 xl:col-span-4 bg-white rounded-2xl sm:rounded-3xl border border-slate-200 p-4 sm:p-6 space-y-4 min-w-0"
          >
            <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-100">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-indigo-700">Selected Date</p>
                <h3 className="text-base sm:text-lg font-bold text-slate-900 leading-snug">
                  {formatReadableDate(selectedDateKey)}
                </h3>
              </div>
              <span className="text-xs font-semibold text-slate-600 tabular-nums shrink-0 pt-0.5">
                {selectedDayActiveCount}{' '}
                {selectedDayActiveCount === 1 ? 'Program' : 'Programs'}
              </span>
            </div>

            {selectedDayEntries.length === 0 ? (
              <div className="py-6 text-center space-y-3">
                <Calendar size={28} className="mx-auto text-slate-300" />
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-slate-800">No programs on this date</p>
                  <p className="text-xs sm:text-[13px] text-slate-500">
                    Select another highlighted day or jump straight to the next upcoming service.
                  </p>
                </div>
                {nextUpcomingProgram && (
                  <button
                    type="button"
                    onClick={jumpToNextEvent}
                    className="min-h-[44px] sm:min-h-[40px] px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold cursor-pointer transition-colors inline-flex items-center gap-1.5"
                  >
                    <span>Jump to Next Program</span>
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {selectedDayEntries.map(({ occ, event: evt }) => {
                  const userReg = getEventUserReg(evt);
                  const isCancelledOcc = occ.status === 'cancelled';
                  const temporal = getEventTemporalStatus(occ.start_time, occ.end_time, nowMs, occ.status);
                  const isPastOcc = temporal === 'past' && !isCancelledOcc;
                  const isLiveOcc = temporal === 'ongoing' && !isCancelledOcc;
                  const displayLoc = occ.override_location || occ.location || evt.location;

                  return (
                    <div
                      key={occ.id}
                      className={`p-3.5 sm:p-4 rounded-2xl border space-y-3 transition-colors ${
                        isCancelledOcc
                          ? 'bg-slate-50/70 border-slate-200 opacity-75'
                          : isPastOcc
                          ? 'bg-slate-50/60 border-slate-200/80 opacity-80'
                          : isLiveOcc
                          ? 'bg-emerald-50/35 border-emerald-300'
                          : 'bg-slate-50 border-slate-200'
                      }`}
                    >
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-medium text-slate-500">
                          <span className={`font-semibold ${isPastOcc ? 'text-slate-500' : 'text-indigo-700'}`}>
                            {evt.category}
                          </span>
                          {isCancelledOcc ? (
                            <span className="font-bold text-slate-600">Updated / Merged</span>
                          ) : isPastOcc ? (
                            <span className="inline-flex items-center gap-1 font-bold text-slate-500">
                              <History size={12} />
                              <span>{userReg ? 'Registered · Ended' : 'Ended'}</span>
                            </span>
                          ) : isLiveOcc ? (
                            <span className="inline-flex items-center gap-1 font-bold text-rose-600">
                              <Radio size={12} className="animate-pulse" />
                              <span>Happening Now</span>
                            </span>
                          ) : occ.status === 'rescheduled' ? (
                            <span className="font-bold text-purple-700">Rescheduled</span>
                          ) : userReg ? (
                            <span
                              className={`font-bold ${
                                userReg.status === 'waitlist' ? 'text-amber-700' : 'text-emerald-700'
                              }`}
                            >
                              {userReg.status === 'waitlist' ? 'Waitlisted' : 'Registered'}
                            </span>
                          ) : null}
                        </div>
                        <button
                          type="button"
                          onClick={() => setSelectedEventDetail({ event: evt, occurrence: occ })}
                          className={`text-left font-bold text-sm sm:text-base leading-snug cursor-pointer transition-colors ${
                            isCancelledOcc
                              ? 'line-through text-slate-500'
                              : isPastOcc
                              ? 'line-through decoration-slate-400 text-slate-500 hover:text-slate-800'
                              : 'text-slate-900 hover:text-indigo-700'
                          }`}
                        >
                          {evt.title}
                        </button>
                        {occ.modified_notes && (
                          <p className="text-xs font-medium text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 flex items-start gap-1.5">
                            <AlertCircle size={13} className="shrink-0 mt-0.5 text-amber-700" />
                            <span>{occ.modified_notes}</span>
                          </p>
                        )}
                      </div>

                      <div className={`space-y-1 text-xs sm:text-[13px] ${isPastOcc ? 'text-slate-500' : 'text-slate-700'}`}>
                        <div className="flex items-center gap-2 tabular-nums">
                          <Clock size={14} className={`${isPastOcc ? 'text-slate-400' : 'text-indigo-600'} shrink-0`} />
                          <span>{formatTimeRange(occ.start_time, occ.end_time)}</span>
                        </div>
                        <div className="flex items-center justify-between gap-2 min-w-0">
                          <div className="flex items-center gap-2 min-w-0">
                            <MapPin size={14} className={`${isPastOcc ? 'text-slate-400' : 'text-indigo-600'} shrink-0`} />
                            <span className="truncate">{displayLoc}</span>
                          </div>
                          {(displayLoc || getEventCoordinates(evt)) && (
                            <button
                              type="button"
                              onClick={() =>
                                setSelectedMapLocation({
                                  event: evt,
                                  locationName: displayLoc || 'Event Venue',
                                  occurrence: occ
                                })
                              }
                              className="text-xs font-semibold text-indigo-700 hover:underline shrink-0 whitespace-nowrap cursor-pointer"
                            >
                              Map
                            </button>
                          )}
                        </div>
                      </div>

                      {!isCancelledOcc && (
                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          <div className="flex-1 min-w-[140px]">
                            {renderEventActionButton(evt, true, occ)}
                          </div>
                          {canCheckInSessionToday(evt, occ) &&
                            userReg?.status !== 'waitlist' &&
                            userReg?.status !== 'checked_in' &&
                            userReg?.status !== 'attended' && (
                              <button
                                type="button"
                                onClick={() => startGeofenceCheckIn(evt, occ)}
                                className="min-h-[44px] sm:min-h-[40px] px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold cursor-pointer transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
                                title="Verify physical presence via GPS and check in"
                              >
                                <LocateFixed size={14} />
                                <span>Check In</span>
                              </button>
                            )}
                          <button
                            type="button"
                            onClick={() => setSelectedEventDetail({ event: evt, occurrence: occ })}
                            className="min-h-[44px] sm:min-h-[40px] px-3 py-2 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-xl text-xs font-semibold cursor-pointer transition-colors whitespace-nowrap"
                          >
                            Details
                          </button>
                          {userReg && (
                            <button
                              type="button"
                              onClick={() => setShowQRPass({ event: evt, reg: userReg, occurrence: occ })}
                              aria-label="View check-in QR pass"
                              className="min-h-[44px] min-w-[44px] sm:min-h-[40px] sm:min-w-[40px] flex items-center justify-center bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl cursor-pointer transition-colors"
                              title="View Check-In QR Pass"
                            >
                              <QrCode size={16} />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </aside>
        </section>
      )}

      {/* VIEW MODE 2: THIS WEEK TIMELINE PLANNER */}
      {viewMode === 'week' && (
        <section className="bg-white rounded-2xl sm:rounded-3xl border border-slate-200 p-4 sm:p-6 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
            <div>
              <h2 className="font-bold text-slate-900 text-lg sm:text-xl">
                Weekly Worship &amp; Ministry Schedule
              </h2>
              <p className="text-xs sm:text-[13px] text-slate-500 tabular-nums mt-0.5">{weekRangeLabel}</p>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => {
                  const prev = new Date(weekAnchorDate);
                  prev.setDate(prev.getDate() - 7);
                  setWeekAnchorDate(prev);
                  setSelectedWeekDayKey('all');
                }}
                aria-label="Previous week"
                className="min-h-[44px] min-w-[44px] sm:min-h-[40px] sm:min-w-[40px] flex items-center justify-center rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer transition-colors"
              >
                <ChevronLeft size={18} />
              </button>
              <button
                type="button"
                onClick={() => {
                  setWeekAnchorDate(getStartOfWeek(new Date()));
                  setSelectedWeekDayKey('all');
                }}
                className="min-h-[44px] sm:min-h-[40px] px-3.5 rounded-xl bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 text-slate-800 text-xs font-semibold cursor-pointer transition-colors whitespace-nowrap"
              >
                This Week
              </button>
              <button
                type="button"
                onClick={() => {
                  const next = new Date(weekAnchorDate);
                  next.setDate(next.getDate() + 7);
                  setWeekAnchorDate(next);
                  setSelectedWeekDayKey('all');
                }}
                aria-label="Next week"
                className="min-h-[44px] min-w-[44px] sm:min-h-[40px] sm:min-w-[40px] flex items-center justify-center rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer transition-colors"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>

          {/* 7-Day Interactive Selector Bar */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500">Filter by day</span>
              {selectedWeekDayKey !== 'all' && (
                <button
                  type="button"
                  onClick={() => setSelectedWeekDayKey('all')}
                  className="text-xs font-semibold text-indigo-700 hover:underline cursor-pointer"
                >
                  Show all 7 days
                </button>
              )}
            </div>

            <div className="grid grid-cols-7 gap-1 sm:gap-2">
              {weekDays.map(day => {
                const isSelected = selectedWeekDayKey === day.key;
                const isToday = day.key === todayKey;
                const isPastDay = day.key < todayKey;
                const hasEvents = day.activeCount > 0;
                return (
                  <button
                    key={day.key}
                    type="button"
                    onClick={() =>
                      setSelectedWeekDayKey(prev => (prev === day.key ? 'all' : day.key))
                    }
                    className={`min-h-[60px] sm:min-h-[66px] p-1.5 sm:p-2 rounded-xl border flex flex-col items-center justify-center gap-1 transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-indigo-600 border-indigo-600 text-white'
                        : isToday
                        ? 'bg-indigo-50 border-indigo-300 text-indigo-950'
                        : isPastDay
                        ? 'bg-slate-50/50 hover:bg-slate-100 border-slate-100 text-slate-400'
                        : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-800'
                    }`}
                  >
                    <span
                      className={`text-[11px] sm:text-xs font-semibold ${
                        isSelected ? 'text-indigo-100' : isPastDay ? 'text-slate-400' : 'text-slate-500'
                      }`}
                    >
                      {day.dayShort}
                    </span>
                    <span className="text-sm sm:text-base font-bold tabular-nums leading-none">
                      {day.dayNum}
                    </span>
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        hasEvents
                          ? isSelected
                            ? 'bg-amber-300'
                            : isPastDay
                            ? 'bg-slate-300'
                            : 'bg-indigo-600'
                          : 'bg-transparent'
                      }`}
                    />
                  </button>
                );
              })}
            </div>
          </div>

          {/* Weekly Events List */}
          {weekFilteredEntries.length === 0 ? (
            <div className="py-10 text-center space-y-3 bg-slate-50 rounded-2xl border border-slate-200">
              <Calendar size={32} className="mx-auto text-slate-300" />
              <div className="space-y-1 px-4">
                <p className="text-sm font-bold text-slate-800">
                  No programs scheduled for this {selectedWeekDayKey === 'all' ? 'week' : 'day'}
                </p>
                <p className="text-xs sm:text-[13px] text-slate-500">
                  Use the arrows above to browse adjacent weeks or switch to Program List.
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2">
                {selectedWeekDayKey !== 'all' && (
                  <button
                    type="button"
                    onClick={() => setSelectedWeekDayKey('all')}
                    className="min-h-[44px] sm:min-h-[40px] px-4 py-2 bg-white border border-slate-200 hover:bg-slate-100 text-slate-800 rounded-xl text-xs font-semibold cursor-pointer"
                  >
                    View Entire Week
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setViewMode('agenda')}
                  className="min-h-[44px] sm:min-h-[40px] px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold cursor-pointer"
                >
                  Browse All Programs
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {weekFilteredEntries.map(({ occ, event: evt }) => {
                const startDate = new Date(occ.start_time);
                const userReg = getEventUserReg(evt);
                const isCancelledOcc = occ.status === 'cancelled';
                const temporal = getEventTemporalStatus(occ.start_time, occ.end_time, nowMs, occ.status);
                const isPastOcc = temporal === 'past' && !isCancelledOcc;
                const isLiveOcc = temporal === 'ongoing' && !isCancelledOcc;
                const displayLoc = occ.override_location || occ.location || evt.location;

                return (
                  <div
                    key={occ.id}
                    className={`p-4 rounded-2xl border flex flex-col lg:flex-row lg:items-center justify-between gap-4 transition-colors ${
                      isCancelledOcc
                        ? 'bg-slate-50/70 border-slate-200 opacity-75'
                        : isPastOcc
                        ? 'bg-slate-50/60 border-slate-200/80 opacity-80'
                        : isLiveOcc
                        ? 'bg-emerald-50/35 border-emerald-300'
                        : 'bg-slate-50 border-slate-200 hover:border-indigo-300'
                    }`}
                  >
                    <div className="flex items-start gap-3.5 min-w-0">
                      <div
                        className={`w-14 h-14 rounded-2xl flex flex-col items-center justify-center shrink-0 tabular-nums px-2 py-1.5 ${
                          isPastOcc || isCancelledOcc
                            ? 'bg-slate-200 text-slate-600'
                            : 'bg-indigo-600 text-white'
                        }`}
                      >
                        <span
                          className={`text-[11px] font-semibold uppercase leading-none ${
                            isPastOcc || isCancelledOcc ? 'text-slate-500' : 'text-indigo-100'
                          }`}
                        >
                          {startDate.toLocaleDateString('en-US', { weekday: 'short' })}
                        </span>
                        <span className="text-lg font-bold leading-tight mt-0.5">
                          {startDate.getDate()}
                        </span>
                      </div>

                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 font-medium">
                          <span className={`font-semibold ${isPastOcc ? 'text-slate-500' : 'text-indigo-700'}`}>
                            {evt.category}
                          </span>
                          {isCancelledOcc ? (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="font-bold text-slate-600">Updated / Merged</span>
                            </>
                          ) : isPastOcc ? (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="inline-flex items-center gap-1 font-bold text-slate-500">
                                <History size={12} />
                                <span>{userReg ? 'Registered · Ended' : 'Ended'}</span>
                              </span>
                            </>
                          ) : isLiveOcc ? (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="inline-flex items-center gap-1 font-bold text-rose-600">
                                <Radio size={12} className="animate-pulse" />
                                <span>Happening Now</span>
                              </span>
                            </>
                          ) : occ.status === 'rescheduled' ? (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="font-bold text-purple-700">Rescheduled</span>
                            </>
                          ) : userReg ? (
                            <>
                              <span aria-hidden="true">·</span>
                              <span
                                className={`font-bold ${
                                  userReg.status === 'waitlist' ? 'text-amber-700' : 'text-emerald-700'
                                }`}
                              >
                                {userReg.status === 'waitlist' ? 'Waitlisted' : 'Registered'}
                              </span>
                            </>
                          ) : null}
                        </div>
                        <button
                          type="button"
                          onClick={() => setSelectedEventDetail({ event: evt, occurrence: occ })}
                          className={`text-left font-bold text-sm sm:text-base leading-snug cursor-pointer ${
                            isCancelledOcc
                              ? 'line-through text-slate-500'
                              : isPastOcc
                              ? 'line-through decoration-slate-400 text-slate-500 hover:text-slate-800'
                              : 'text-slate-900 hover:text-indigo-700'
                          }`}
                        >
                          {evt.title}
                        </button>
                        {occ.modified_notes && (
                          <p className="text-xs text-amber-800 font-medium">{occ.modified_notes}</p>
                        )}
                        <div className={`flex flex-wrap items-center gap-x-4 gap-y-1 text-xs sm:text-[13px] pt-0.5 ${isPastOcc ? 'text-slate-500' : 'text-slate-700'}`}>
                          <span className="inline-flex items-center gap-1.5 tabular-nums">
                            <Clock size={13} className={`${isPastOcc ? 'text-slate-400' : 'text-indigo-600'} shrink-0`} />
                            <span>{formatTimeRange(occ.start_time, occ.end_time)}</span>
                          </span>
                          <span className="inline-flex items-center gap-1.5 min-w-0">
                            <MapPin size={13} className={`${isPastOcc ? 'text-slate-400' : 'text-indigo-600'} shrink-0`} />
                            <span className="truncate">{displayLoc}</span>
                            {(displayLoc || getEventCoordinates(evt)) && (
                              <button
                                type="button"
                                onClick={() =>
                                  setSelectedMapLocation({
                                    event: evt,
                                    locationName: displayLoc || 'Event Venue',
                                    occurrence: occ
                                  })
                                }
                                className="text-xs font-semibold text-indigo-700 hover:underline shrink-0 whitespace-nowrap ml-1 cursor-pointer"
                              >
                                Map
                              </button>
                            )}
                          </span>
                        </div>
                      </div>
                    </div>

                    {!isCancelledOcc && (
                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <div className="flex-1 sm:flex-initial min-w-[140px]">
                          {renderEventActionButton(evt, true, occ)}
                        </div>
                        {canCheckInSessionToday(evt, occ) &&
                          userReg?.status !== 'waitlist' &&
                          userReg?.status !== 'checked_in' &&
                          userReg?.status !== 'attended' && (
                            <button
                              type="button"
                              onClick={() => startGeofenceCheckIn(evt, occ)}
                              className="min-h-[44px] sm:min-h-[40px] px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold cursor-pointer transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
                              title="Verify physical presence via GPS and check in"
                            >
                              <LocateFixed size={14} />
                              <span>Check In</span>
                            </button>
                          )}
                        <button
                          type="button"
                          onClick={() => setSelectedEventDetail({ event: evt, occurrence: occ })}
                          className="min-h-[44px] sm:min-h-[40px] px-3.5 py-2 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-xl text-xs font-semibold cursor-pointer transition-colors whitespace-nowrap"
                        >
                          Details
                        </button>
                        {userReg && (
                          <button
                            type="button"
                            onClick={() => setShowQRPass({ event: evt, reg: userReg, occurrence: occ })}
                            aria-label="View check-in QR pass"
                            className="min-h-[44px] min-w-[44px] sm:min-h-[40px] sm:min-w-[40px] flex items-center justify-center bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl cursor-pointer transition-colors"
                            title="QR Pass"
                          >
                            <QrCode size={16} />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => downloadICS(evt, occ)}
                          aria-label="Download calendar invite"
                          title="Add to Calendar (.ics)"
                          className="min-h-[44px] min-w-[44px] sm:min-h-[40px] sm:min-w-[40px] flex items-center justify-center bg-white hover:bg-slate-100 border border-slate-200 text-slate-600 rounded-xl cursor-pointer transition-colors"
                        >
                          <Download size={16} />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* VIEW MODE 3: UPCOMING PROGRAM ROSTER (Tablet Horizontal Split + Responsive Mobile/Desktop Cards) */}
      {(viewMode === 'agenda' || viewMode === 'calendar') && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-200">
            <h2 className="font-bold text-slate-900 text-lg sm:text-xl">
              Program Roster
            </h2>
            <div className="flex flex-wrap items-center gap-2.5 sm:gap-3 text-xs sm:text-[13px] text-slate-600 font-semibold tabular-nums">
              <span>
                {upcomingFilteredEvents.length}{' '}
                {upcomingFilteredEvents.length === 1 ? 'Upcoming' : 'Upcoming'}
                {showPastEvents && pastFilteredEvents.length > 0
                  ? ` · ${pastFilteredEvents.length} Past`
                  : ''}
              </span>

              {(pastFilteredEvents.length > 0 || showPastEvents) && (
                <button
                  type="button"
                  onClick={() => setShowPastEvents(prev => !prev)}
                  aria-pressed={showPastEvents}
                  className={`min-h-[36px] px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors cursor-pointer inline-flex items-center gap-1.5 whitespace-nowrap ${
                    showPastEvents
                      ? 'bg-slate-900 border-slate-900 text-white'
                      : 'bg-white hover:bg-slate-100 border-slate-200 text-slate-700'
                  }`}
                >
                  <History size={13} />
                  <span>
                    {showPastEvents
                      ? `Hide Past Events (${pastFilteredEvents.length})`
                      : `View Past Events (${pastFilteredEvents.length})`}
                  </span>
                </button>
              )}

              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={resetAllFilters}
                  className="text-indigo-700 hover:underline inline-flex items-center gap-1 cursor-pointer"
                >
                  <RotateCcw size={13} />
                  <span>Reset</span>
                </button>
              )}
            </div>
          </div>

          {displayedRosterEvents.length === 0 ? (
            <div className="bg-white rounded-2xl sm:rounded-3xl border border-slate-200 p-8 sm:p-10 text-center space-y-3">
              <Calendar size={36} className="mx-auto text-slate-300" />
              <div className="space-y-1 max-w-md mx-auto">
                <h3 className="text-base font-bold text-slate-900">
                  {!showPastEvents && pastFilteredEvents.length > 0
                    ? 'No upcoming church programs listed'
                    : 'No matching church programs found'}
                </h3>
                <p className="text-[13px] sm:text-sm text-slate-500">
                  {!showPastEvents && pastFilteredEvents.length > 0
                    ? `Past events are hidden from the active list. You can view ${pastFilteredEvents.length} completed ${
                        pastFilteredEvents.length === 1 ? 'program' : 'programs'
                      } or adjust your filters.`
                    : 'Try clearing your search term or switching category, audience, or RSVP filters.'}
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2">
                {!showPastEvents && pastFilteredEvents.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowPastEvents(true)}
                    className="min-h-[44px] sm:min-h-[40px] px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold cursor-pointer transition-colors inline-flex items-center gap-2"
                  >
                    <History size={14} />
                    <span>View Past Events ({pastFilteredEvents.length})</span>
                  </button>
                )}
                {hasActiveFilters && (
                  <button
                    type="button"
                    onClick={resetAllFilters}
                    className="min-h-[44px] sm:min-h-[40px] px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold cursor-pointer transition-colors inline-flex items-center gap-2"
                  >
                    <RotateCcw size={14} />
                    <span>Reset All Filters</span>
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-5">
              {displayedRosterEvents.map(evt => {
                const nextOcc = nextOccurrenceByEventId.get(evt.id);
                const displayStart = nextOcc?.start_time || evt.start_time;
                const displayEnd = nextOcc?.end_time || evt.end_time;
                const displayLoc = nextOcc?.override_location || nextOcc?.location || evt.location;
                const temporal = nextOcc
                  ? getEventTemporalStatus(nextOcc.start_time, nextOcc.end_time, nowMs, nextOcc.status)
                  : getEventTemporalStatus(evt.start_time, evt.end_time, nowMs, evt.status);
                const isPastEvt = temporal === 'past';
                const isLiveEvt = temporal === 'ongoing';
                const startDate = new Date(displayStart);
                const userReg = getEventUserReg(evt);
                const maxAtt = evt.max_attendees || 9999;
                const regCount = evt.registered_count || 0;
                const isFull = regCount >= maxAtt;
                const rec = getRecurrenceBadge(evt.recurrence);
                const acc = getEventAccount(evt.id, evt.title, evt.recurring_funding_allowance, evt.account_number);

                return (
                  <article
                    key={evt.id}
                    className={`rounded-2xl border overflow-hidden flex flex-col justify-between group transition-colors min-w-0 ${
                      isPastEvt
                        ? 'bg-slate-50/75 border-slate-200/90 opacity-85 hover:opacity-100'
                        : isLiveEvt
                        ? 'bg-white border-emerald-300 ring-1 ring-emerald-200/70'
                        : 'bg-white border-slate-200 hover:border-indigo-300'
                    }`}
                  >
                    <div className="flex flex-col md:flex-row lg:flex-col flex-1">
                      {/* Cover Media (Top on Mobile & lg+, Left Panel on md: Tablet to eliminate sidebar squeeze) */}
                      <div
                        onClick={() => setSelectedEventDetail({ event: evt, occurrence: nextOcc })}
                        className="relative h-40 md:h-auto md:min-h-[210px] md:w-52 md:shrink-0 lg:h-40 lg:min-h-0 lg:w-full bg-slate-900 overflow-hidden cursor-pointer"
                      >
                        <EventCoverImage
                          src={evt.featured_image}
                          title={evt.title}
                          className={`group-hover:scale-105 transition-transform duration-300 ${
                            isPastEvt ? 'grayscale opacity-65' : ''
                          }`}
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/25 to-transparent" />

                        <div className="absolute bottom-3 left-3.5 right-3.5 flex items-end justify-between gap-2 text-white">
                          <div className="min-w-0">
                            <p
                              className={`text-xs font-bold tabular-nums ${
                                isPastEvt ? 'text-slate-300' : 'text-amber-300'
                              }`}
                            >
                              {isPastEvt ? 'Ended · ' : ''}
                              {startDate.toLocaleDateString('en-US', {
                                weekday: 'short',
                                month: 'short',
                                day: 'numeric',
                                year: startDate.getFullYear() !== today.getFullYear() ? 'numeric' : undefined
                              })}
                            </p>
                          </div>
                          {isPastEvt ? (
                            <span className="px-2.5 py-1 rounded-lg bg-slate-900/85 text-slate-200 border border-white/15 text-[11px] font-bold shrink-0 inline-flex items-center gap-1">
                              <History size={11} />
                              <span>Past</span>
                            </span>
                          ) : isLiveEvt ? (
                            <span className="px-2.5 py-1 rounded-lg bg-rose-600 text-white text-[11px] font-bold shrink-0 inline-flex items-center gap-1">
                              <Radio size={11} className="animate-pulse" />
                              <span>Live Now</span>
                            </span>
                          ) : userReg ? (
                            <span
                              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold shrink-0 ${
                                userReg.status === 'waitlist'
                                  ? 'bg-amber-500 text-slate-950'
                                  : 'bg-emerald-600 text-white'
                              }`}
                            >
                              {userReg.status === 'waitlist' ? 'Waitlisted' : 'Registered'}
                            </span>
                          ) : isFull ? (
                            <span className="px-2.5 py-1 rounded-lg bg-rose-600 text-white text-[11px] font-bold shrink-0">
                              At Capacity
                            </span>
                          ) : null}
                        </div>
                      </div>

                      {/* Card Body */}
                      <div className="p-4 sm:p-5 space-y-3 flex-1 min-w-0 flex flex-col justify-between">
                        <div className="space-y-2.5">
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-1.5 text-xs font-medium text-slate-500">
                              <span className={`font-semibold ${isPastEvt ? 'text-slate-500' : 'text-indigo-700'}`}>
                                {evt.category}
                              </span>
                              <span aria-hidden="true">·</span>
                              <span>{rec.label}</span>
                              {isPastEvt && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span className="text-slate-500 font-semibold">Ended</span>
                                </>
                              )}
                              {!isPastEvt && evt.is_virtual && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span className="text-slate-700">Livestream</span>
                                </>
                              )}
                            </div>

                            <button
                              type="button"
                              onClick={() => setSelectedEventDetail({ event: evt, occurrence: nextOcc })}
                              className={`text-left font-bold text-base sm:text-lg leading-snug cursor-pointer transition-colors ${
                                isPastEvt
                                  ? 'line-through decoration-slate-400 text-slate-500 hover:text-slate-800'
                                  : 'text-slate-900 hover:text-indigo-700'
                              }`}
                            >
                              {evt.title}
                            </button>
                          </div>

                          <p className={`text-[13px] sm:text-sm line-clamp-2 leading-relaxed ${isPastEvt ? 'text-slate-500' : 'text-slate-600'}`}>
                            {evt.description}
                          </p>
                        </div>

                        <div className="space-y-2 pt-2.5 border-t border-slate-100">
                          <div className={`space-y-1.5 text-xs sm:text-[13px] ${isPastEvt ? 'text-slate-500' : 'text-slate-700'}`}>
                            <div className="flex items-center gap-2 tabular-nums">
                              <Clock size={14} className={`${isPastEvt ? 'text-slate-400' : 'text-indigo-600'} shrink-0`} />
                              <span>{formatTimeRange(displayStart, displayEnd)}</span>
                            </div>
                            <div className="flex items-center justify-between gap-2 min-w-0">
                              <div className="flex items-center gap-2 min-w-0">
                                <MapPin size={14} className={`${isPastEvt ? 'text-slate-400' : 'text-indigo-600'} shrink-0`} />
                                <span className="truncate">{displayLoc}</span>
                              </div>
                              {(displayLoc || getEventCoordinates(evt)) && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setSelectedMapLocation({
                                      event: evt,
                                      locationName: displayLoc || 'Event Venue',
                                      occurrence: nextOcc
                                    })
                                  }
                                  className="text-xs font-semibold text-indigo-700 hover:underline shrink-0 whitespace-nowrap cursor-pointer"
                                >
                                  Map
                                </button>
                              )}
                            </div>
                            {evt.recurrence_pattern && (
                              <div className="text-xs text-slate-500 truncate">
                                Schedule: {evt.recurrence_pattern}
                              </div>
                            )}
                          </div>

                          {evt.has_funding_account !== false && (
                            <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs">
                              <span className="inline-flex items-center gap-1.5 font-mono font-semibold text-slate-700 truncate">
                                <Landmark size={13} className="text-emerald-600 shrink-0" />
                                <span className="truncate">{evt.account_number || acc.account_number}</span>
                              </span>
                              <span className="font-semibold text-emerald-800 tabular-nums shrink-0">
                                Target SLE {(evt.recurring_funding_allowance || acc.target_budget).toLocaleString()}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Touch-Friendly Wrapped Footer Actions (Never clips at 320px or 768px) */}
                    <div className="px-4 py-3 bg-slate-50 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex-1 min-w-[140px]">
                        {renderEventActionButton(evt, true, nextOcc)}
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                        {canCheckInSessionToday(evt, nextOcc) &&
                          userReg?.status !== 'waitlist' &&
                          userReg?.status !== 'checked_in' &&
                          userReg?.status !== 'attended' && (
                            <button
                              type="button"
                              onClick={() => startGeofenceCheckIn(evt, nextOcc)}
                              className="min-h-[44px] sm:min-h-[40px] px-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap"
                              title="Confirm presence on church premises via device GPS"
                            >
                              <LocateFixed size={14} />
                              <span>Check In</span>
                            </button>
                          )}
                        <button
                          type="button"
                          onClick={() => jumpToEventOnCalendar(evt, nextOcc)}
                          className="min-h-[44px] sm:min-h-[40px] px-3 bg-white hover:bg-indigo-50 text-indigo-700 border border-slate-200 hover:border-indigo-200 font-semibold rounded-xl text-xs cursor-pointer transition-colors whitespace-nowrap"
                          title="Highlight date in Month Grid"
                        >
                          On Calendar
                        </button>
                        {userReg && (
                          <button
                            type="button"
                            onClick={() => setShowQRPass({ event: evt, reg: userReg, occurrence: nextOcc })}
                            className="min-h-[44px] sm:min-h-[40px] px-3 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold rounded-xl text-xs flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap"
                            title="View Check-In QR Pass"
                          >
                            <QrCode size={15} />
                            <span>Pass</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setSelectedEventDetail({ event: evt, occurrence: nextOcc })}
                          className="min-h-[44px] sm:min-h-[40px] px-3 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 font-semibold rounded-xl text-xs cursor-pointer transition-colors whitespace-nowrap"
                        >
                          Details
                        </button>
                        <button
                          type="button"
                          onClick={() => downloadICS(evt, nextOcc)}
                          aria-label="Add to calendar (.ics)"
                          title="Add to Calendar (.ics)"
                          className="min-h-[44px] min-w-[44px] sm:min-h-[40px] sm:min-w-[40px] flex items-center justify-center text-slate-600 hover:text-indigo-700 bg-white hover:bg-slate-100 rounded-xl border border-slate-200 cursor-pointer transition-colors"
                        >
                          <Download size={15} />
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* EVENT DETAILS RESPONSIVE BOTTOM SHEET (Mobile) / MODAL (Tablet & Desktop) */}
      {selectedEventDetail && (() => {
        const { event: evt, occurrence: occ } = selectedEventDetail;
        const userReg = getEventUserReg(evt);
        const rec = getRecurrenceBadge(evt.recurrence);
        const acc = getEventAccount(evt.id, evt.title, evt.recurring_funding_allowance, evt.account_number);
        const maxAtt = evt.max_attendees || 350;
        const regCount = evt.registered_count || 0;
        const effStart = occ?.start_time || evt.start_time;
        const effEnd = occ?.end_time || evt.end_time;
        const effLoc = occ?.override_location || occ?.location || evt.location;
        const detailTemporal = getEventTemporalStatus(effStart, effEnd, nowMs, occ?.status || evt.status);
        const detailIsPast = detailTemporal === 'past';
        const detailIsLive = detailTemporal === 'ongoing';

        return (
          <div
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-[110] flex items-end sm:items-center justify-center p-0 sm:p-4"
            onClick={e => {
              if (e.target === e.currentTarget) setSelectedEventDetail(null);
            }}
          >
            <div className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl border border-slate-200 shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
              {/* Mobile Sheet Drag Handle */}
              <div className="sm:hidden pt-2.5 pb-1 flex justify-center bg-white shrink-0">
                <span className="w-10 h-1.5 rounded-full bg-slate-300" />
              </div>

              <div className="relative h-40 sm:h-48 w-full bg-slate-900 shrink-0">
                <EventCoverImage
                  src={evt.featured_image}
                  title={evt.title}
                  className={detailIsPast ? 'grayscale opacity-70' : ''}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/35 to-transparent" />
                <button
                  type="button"
                  onClick={() => setSelectedEventDetail(null)}
                  aria-label="Close event details"
                  className="absolute top-3 right-3 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full bg-slate-950/60 hover:bg-slate-950/80 text-white cursor-pointer transition-colors"
                >
                  <X size={20} />
                </button>
                <div className="absolute bottom-3.5 left-4 right-4 text-white space-y-0.5">
                  <div className={`flex flex-wrap items-center gap-1.5 text-xs font-semibold ${detailIsPast ? 'text-slate-300' : 'text-amber-300'}`}>
                    <span>{evt.category}</span>
                    <span aria-hidden="true">·</span>
                    <span>{rec.label}</span>
                    {detailIsPast && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="text-slate-200">Ended</span>
                      </>
                    )}
                    {detailIsLive && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="text-rose-300">Happening Now</span>
                      </>
                    )}
                  </div>
                  <h3 className="text-lg sm:text-xl font-bold leading-snug">{evt.title}</h3>
                </div>
              </div>

              <div className="p-5 sm:p-6 space-y-4 overflow-y-auto flex-1">
                {detailIsPast && (
                  <div className="p-3 rounded-xl bg-slate-100 border border-slate-200 text-xs sm:text-[13px] font-medium text-slate-700 flex items-center gap-2">
                    <History size={15} className="text-slate-500 shrink-0" />
                    <span>This event session has already ended.</span>
                  </div>
                )}

                {detailIsLive && (
                  <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs sm:text-[13px] font-medium text-rose-800 flex items-center gap-2">
                    <Radio size={15} className="text-rose-600 animate-pulse shrink-0" />
                    <span>This service or program is currently in progress.</span>
                  </div>
                )}

                {occ?.modified_notes && (
                  <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs sm:text-[13px] font-medium text-amber-900 flex items-start gap-2">
                    <AlertCircle size={15} className="text-amber-700 shrink-0 mt-0.5" />
                    <span>{occ.modified_notes}</span>
                  </div>
                )}

                <p className="text-sm text-slate-700 leading-relaxed">{evt.description}</p>

                <div className="space-y-2.5 pt-2 border-t border-slate-100 text-[13px] sm:text-sm text-slate-700">
                  <div className="flex items-start gap-2.5">
                    <Calendar size={16} className="text-indigo-600 shrink-0 mt-0.5" />
                    <span className="tabular-nums font-medium">
                      {formatReadableDate(toLocalDateKey(effStart))}
                    </span>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <Clock size={16} className="text-indigo-600 shrink-0 mt-0.5" />
                    <span className="tabular-nums font-medium">
                      {formatTimeRange(effStart, effEnd)}
                    </span>
                  </div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2.5 min-w-0">
                      <MapPin size={16} className="text-indigo-600 shrink-0 mt-0.5" />
                      <span className="font-medium">{effLoc}</span>
                    </div>
                    <div className="flex items-center gap-2.5 shrink-0">
                      {getEventCoordinates(evt) && (
                        <button
                          type="button"
                          onClick={() => setShowDetailMap(prev => !prev)}
                          className="text-xs font-semibold text-slate-600 hover:text-indigo-700 cursor-pointer whitespace-nowrap"
                        >
                          {showDetailMap ? 'Hide Map' : 'Show Map'}
                        </button>
                      )}
                      {(effLoc || getEventCoordinates(evt)) && (
                        <a
                          href={getGoogleMapsHref(evt, effLoc)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs font-semibold text-indigo-700 hover:underline inline-flex items-center gap-1 shrink-0"
                        >
                          <span>Maps</span>
                          <ExternalLink size={12} />
                        </a>
                      )}
                    </div>
                  </div>
                  {showDetailMap && (() => {
                    const detailCoords = getEventCoordinates(evt);
                    if (!detailCoords) return null;
                    return (
                      <div className="pt-1">
                        <LocationMap
                          latitude={detailCoords.lat}
                          longitude={detailCoords.lng}
                          title={evt.title}
                          subtitle={effLoc}
                          sourceLabel="Configured Event Location"
                          height="220px"
                        />
                      </div>
                    );
                  })()}
                  {evt.organizer_name && (
                    <div className="flex items-start gap-2.5">
                      <Users size={16} className="text-indigo-600 shrink-0 mt-0.5" />
                      <span>
                        Organized by <strong>{evt.organizer_name}</strong>
                        {evt.target_audience ? ` · ${evt.target_audience}` : ''}
                      </span>
                    </div>
                  )}
                  <div className="flex items-start gap-2.5">
                    <Landmark size={16} className="text-emerald-600 shrink-0 mt-0.5" />
                    <span className="tabular-nums">
                      Event Account:{' '}
                      <strong className="font-mono">{evt.account_number || acc.account_number}</strong> ·
                      Registered: <strong>{regCount} / {maxAtt}</strong>
                    </span>
                  </div>
                  {!detailIsPast && (occ?.status || evt.status) !== 'cancelled' && (
                    <div className="flex items-start gap-2.5">
                      <LocateFixed size={16} className="text-indigo-600 shrink-0 mt-0.5" />
                      <span className="tabular-nums text-xs sm:text-[13px] text-slate-600">
                        {canCheckInSessionToday(evt, occ)
                          ? `GPS Check-In active today within ${configuredRadiusMeters} m of premises`
                          : `GPS Check-In opens on event day (${configuredRadiusMeters} m perimeter)`}
                      </span>
                    </div>
                  )}
                  {evt.is_virtual && evt.virtual_link && (
                    <div className="flex items-center gap-2.5">
                      <Video size={16} className="text-indigo-600 shrink-0" />
                      {evt.virtual_link.startsWith('/') ? (
                        <Link
                          to={evt.virtual_link}
                          onClick={() => setSelectedEventDetail(null)}
                          className="font-semibold text-indigo-700 hover:underline"
                        >
                          Watch in Live Sanctuary
                        </Link>
                      ) : (
                        <a
                          href={evt.virtual_link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-semibold text-indigo-700 hover:underline inline-flex items-center gap-1"
                        >
                          <span>Join Virtual Stream</span>
                          <ExternalLink size={12} />
                        </a>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="p-4 sm:p-5 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-stretch sm:items-center gap-2 shrink-0">
                <div className="flex-1 flex flex-wrap items-center gap-2">
                  <div className="flex-1 min-w-[130px]">
                    {renderEventActionButton(evt, true, occ)}
                  </div>
                  {canCheckInSessionToday(evt, occ) &&
                    userReg?.status !== 'waitlist' &&
                    userReg?.status !== 'checked_in' &&
                    userReg?.status !== 'attended' && (
                      <button
                        type="button"
                        onClick={() => startGeofenceCheckIn(evt, occ)}
                        className="min-h-[44px] sm:min-h-[40px] px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold cursor-pointer inline-flex items-center justify-center gap-1.5 whitespace-nowrap"
                      >
                        <LocateFixed size={15} />
                        <span>GPS Check-In</span>
                      </button>
                    )}
                </div>
                <div className="grid grid-cols-2 sm:flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => downloadICS(evt, occ)}
                    className="min-h-[44px] sm:min-h-[40px] px-3.5 py-2 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-xl text-xs font-semibold cursor-pointer inline-flex items-center justify-center gap-1.5 whitespace-nowrap"
                  >
                    <Download size={15} />
                    <span>Add .ics</span>
                  </button>
                  {userReg ? (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedEventDetail(null);
                        setShowQRPass({ event: evt, reg: userReg, occurrence: occ });
                      }}
                      className="min-h-[44px] sm:min-h-[40px] px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl text-xs font-semibold cursor-pointer inline-flex items-center justify-center gap-1.5 whitespace-nowrap"
                    >
                      <QrCode size={15} />
                      <span>QR Pass</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setSelectedEventDetail(null)}
                      className="min-h-[44px] sm:min-h-[40px] px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold cursor-pointer"
                    >
                      Done
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* EVENT VENUE MAP MODAL (Triggered by clicking Map on any event card) */}
      {selectedMapLocation && (() => {
        const { event: mapEvt, locationName, occurrence: mapOcc } = selectedMapLocation;
        const mapCoords = getEventCoordinates(mapEvt);
        const effStart = mapOcc?.start_time || mapEvt.start_time;
        const effEnd = mapOcc?.end_time || mapEvt.end_time;
        const googleMapsLink = getGoogleMapsHref(mapEvt, locationName);

        return (
          <div
            className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 z-[105]"
            onClick={e => {
              if (e.target === e.currentTarget) setSelectedMapLocation(null);
            }}
          >
            <div className="bg-white rounded-t-3xl sm:rounded-3xl max-w-2xl w-full border border-slate-200 shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
              <div className="sm:hidden flex justify-center pt-2.5 pb-1">
                <span className="w-10 h-1.5 rounded-full bg-slate-300" />
              </div>

              <div className="px-5 py-4 border-b border-slate-100 flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-0.5">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-700">
                    <MapPin size={14} />
                    <span>Event Location &amp; Directions</span>
                  </div>
                  <h3 className="font-bold text-slate-900 text-base sm:text-lg leading-snug truncate">
                    {mapEvt.title}
                  </h3>
                  <p className="text-xs text-slate-500 truncate">
                    {locationName} · {formatReadableDate(toLocalDateKey(effStart))} ({formatTimeRange(effStart, effEnd)})
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedMapLocation(null)}
                  aria-label="Close map preview"
                  className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-800 cursor-pointer shrink-0"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="p-5 overflow-y-auto space-y-4">
                {mapCoords ? (
                  <LocationMap
                    latitude={mapCoords.lat}
                    longitude={mapCoords.lng}
                    title={mapEvt.title}
                    subtitle={locationName}
                    sourceLabel="Admin Configured Pin"
                    height="300px"
                  />
                ) : (
                  <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 text-center space-y-3">
                    <MapPin size={28} className="mx-auto text-indigo-600" />
                    <div className="space-y-1">
                      <p className="text-sm font-bold text-slate-900">{locationName}</p>
                      <p className="text-xs text-slate-500 max-w-md mx-auto">
                        Exact GPS coordinates have not been pinned for this event yet. You can open the venue name directly in Google Maps.
                      </p>
                    </div>
                    <a
                      href={googleMapsLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 min-h-[40px] px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-colors"
                    >
                      <span>Search Venue in Google Maps</span>
                      <ExternalLink size={13} />
                    </a>
                  </div>
                )}
              </div>

              <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedMapLocation(null);
                    setSelectedEventDetail({ event: mapEvt, occurrence: mapOcc });
                  }}
                  className="min-h-[40px] px-3.5 py-2 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-xl text-xs font-semibold cursor-pointer transition-colors"
                >
                  View Event Details
                </button>
                <div className="flex items-center gap-2">
                  <a
                    href={googleMapsLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-h-[40px] px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold inline-flex items-center gap-1.5 transition-colors"
                  >
                    <span>Open in Google Maps</span>
                    <ExternalLink size={13} />
                  </a>
                  <button
                    type="button"
                    onClick={() => setSelectedMapLocation(null)}
                    className="min-h-[40px] px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold cursor-pointer transition-colors"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* MEMBER CHECK-IN QR PASS BOTTOM SHEET (Mobile) / MODAL (Tablet+) */}
      {showQRPass && (
        <div
          className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 z-[110]"
          onClick={e => {
            if (e.target === e.currentTarget) setShowQRPass(null);
          }}
        >
          <div className="bg-white rounded-t-3xl sm:rounded-3xl p-5 sm:p-6 max-w-sm w-full border border-slate-200 shadow-2xl text-center space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="sm:hidden flex justify-center pb-1">
              <span className="w-10 h-1.5 rounded-full bg-slate-300" />
            </div>

            <div className="flex justify-between items-center pb-2 border-b border-slate-100">
              <span className="text-xs font-bold text-indigo-700">Official Entry Pass</span>
              <button
                type="button"
                onClick={() => setShowQRPass(null)}
                aria-label="Close entry pass"
                className="min-h-[44px] min-w-[44px] sm:min-h-[36px] sm:min-w-[36px] flex items-center justify-center text-slate-400 hover:text-slate-700 rounded-xl cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div>
              <h4 className="font-bold text-slate-900 text-base leading-snug">
                {showQRPass.event.title}
              </h4>
              <p className="text-xs text-slate-500 mt-0.5">
                Show this QR code at sanctuary doors to check in
              </p>
            </div>

            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 flex justify-center">
              <QRCodeSVG
                value={`EVENT:${showQRPass.event.id}:REG:${showQRPass.reg.id}`}
                size={180}
                level="H"
                includeMargin
              />
            </div>

            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs text-slate-800 space-y-1.5 text-left">
              <p>
                <span className="text-slate-500">Attendee:</span>{' '}
                <strong>{showQRPass.reg.member_name}</strong>
              </p>
              <p>
                <span className="text-slate-500">Venue:</span>{' '}
                <strong>
                  {showQRPass.occurrence?.override_location ||
                    showQRPass.occurrence?.location ||
                    showQRPass.event.location}
                </strong>
              </p>
              <p className="tabular-nums">
                <span className="text-slate-500">Date &amp; Time:</span>{' '}
                <strong>
                  {new Date(showQRPass.occurrence?.start_time || showQRPass.event.start_time).toLocaleString()}
                </strong>
              </p>
              <p>
                <span className="text-slate-500">Status:</span>{' '}
                <strong className="uppercase text-emerald-700">{showQRPass.reg.status}</strong>
              </p>
            </div>

            {canCheckInSessionToday(showQRPass.event, showQRPass.occurrence) &&
              showQRPass.reg.status !== 'checked_in' &&
              showQRPass.reg.status !== 'attended' &&
              showQRPass.reg.status !== 'waitlist' && (
                <button
                  type="button"
                  onClick={() => {
                    const evt = showQRPass.event;
                    const occ = showQRPass.occurrence;
                    setShowQRPass(null);
                    startGeofenceCheckIn(evt, occ);
                  }}
                  className="w-full min-h-[44px] py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-2 cursor-pointer"
                >
                  <LocateFixed size={15} />
                  <span>Check In with Device GPS</span>
                </button>
              )}

            <button
              type="button"
              onClick={() => window.print()}
              className="w-full min-h-[44px] py-2.5 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              <Printer size={15} />
              <span>Print / Save Pass</span>
            </button>
          </div>
        </div>
      )}

      {/* GEOFENCE GPS CHECK-IN VERIFICATION MODAL */}
      {checkInModal && (
        <div
          className="fixed inset-0 bg-slate-950/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 z-[115]"
          onClick={e => {
            if (e.target === e.currentTarget && checkInModal.phase !== 'verifying') {
              setCheckInModal(null);
            }
          }}
        >
          <div className="bg-white rounded-t-3xl sm:rounded-3xl max-w-lg w-full border border-slate-200 shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">
            <div className="sm:hidden flex justify-center pt-2.5 pb-1">
              <span className="w-10 h-1.5 rounded-full bg-slate-300" />
            </div>

            <div className="px-5 py-4 border-b border-slate-100 flex items-start justify-between gap-3">
              <div className="min-w-0 space-y-0.5">
                <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-700">
                  <LocateFixed size={14} />
                  <span>Premises GPS Geofence Check-In</span>
                </div>
                <h3 className="font-bold text-slate-900 text-base sm:text-lg leading-snug truncate">
                  {checkInModal.event.title}
                </h3>
                <p className="text-xs text-slate-500 truncate">
                  {checkInModal.locationName} · Allowed perimeter: {checkInModal.radiusMeters} m
                </p>
              </div>
              <button
                type="button"
                disabled={checkInModal.phase === 'verifying'}
                onClick={() => setCheckInModal(null)}
                aria-label="Close check-in dialog"
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-800 cursor-pointer disabled:opacity-40 shrink-0"
              >
                <X size={18} />
              </button>
            </div>

              <div className="p-5 overflow-y-auto space-y-4">
              {/* Interactive D3.js Premises & User Location Map */}
              <GeofenceD3Map
                targetLat={checkInModal.target.lat}
                targetLng={checkInModal.target.lng}
                targetLabel={checkInModal.target.label}
                targetSource={checkInModal.target.source}
                radiusMeters={checkInModal.radiusMeters}
                userLat={checkInModal.result?.userLat}
                userLng={checkInModal.result?.userLng}
                accuracy={checkInModal.result?.accuracy}
                distanceMeters={checkInModal.result?.distanceMeters}
                allowed={checkInModal.result?.allowed}
                phase={checkInModal.phase}
                height={235}
              />

              {checkInModal.phase === 'verifying' && (
                <div className="p-4 rounded-2xl bg-indigo-50/70 border border-indigo-200 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0">
                    <RefreshCw size={18} className="animate-spin" />
                  </div>
                  <div className="min-w-0 space-y-0.5">
                    <p className="text-sm font-bold text-slate-900">
                      Confirming Your Device Location...
                    </p>
                    <p className="text-xs text-slate-600">
                      Comparing your live device GPS position against{' '}
                      <strong>{checkInModal.target.label}</strong> ({checkInModal.radiusMeters} m geofence).
                    </p>
                  </div>
                </div>
              )}

              {checkInModal.phase === 'verified' && checkInModal.result && (
                <div className="space-y-3">
                  <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
                      <ShieldCheck size={20} />
                    </div>
                    <div className="min-w-0 space-y-1">
                      <h4 className="text-sm font-bold text-emerald-950">
                        Presence Confirmed — Checked In
                      </h4>
                      <p className="text-xs text-emerald-800 leading-relaxed">
                        You are verified on church premises ({formatDistanceLabel(checkInModal.result.distanceMeters)} from{' '}
                        <strong>{checkInModal.target.label}</strong>). Attendance recorded
                        {checkInModal.checkedInAt
                          ? ` at ${new Date(checkInModal.checkedInAt).toLocaleTimeString([], {
                              hour: 'numeric',
                              minute: '2-digit'
                            })}`
                          : ''}
                        .
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5 text-xs">
                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                      <span className="text-slate-500 block text-[11px]">Measured Distance</span>
                      <span className="font-bold font-mono text-emerald-700 text-sm tabular-nums">
                        {formatDistanceLabel(checkInModal.result.distanceMeters)}
                      </span>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                      <span className="text-slate-500 block text-[11px]">Device GPS Accuracy</span>
                      <span className="font-bold font-mono text-slate-800 text-sm tabular-nums">
                        {checkInModal.result.accuracy ? `±${checkInModal.result.accuracy} m` : 'High accuracy'}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {checkInModal.phase === 'outside' && checkInModal.result && (
                <div className="space-y-3">
                  <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-amber-600 text-white flex items-center justify-center shrink-0">
                      <ShieldAlert size={20} />
                    </div>
                    <div className="min-w-0 space-y-1">
                      <h4 className="text-sm font-bold text-amber-950">
                        Check-In Blocked — Outside Church Premises
                      </h4>
                      <p className="text-xs text-amber-900 leading-relaxed">
                        Your device is currently{' '}
                        <strong className="tabular-nums">
                          {formatDistanceLabel(checkInModal.result.distanceMeters)}
                        </strong>{' '}
                        away from <strong>{checkInModal.target.label}</strong>. Members must be within{' '}
                        <strong>{checkInModal.result.radiusMeters} m</strong> of the venue to check in.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5 text-xs">
                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                      <span className="text-slate-500 block text-[11px]">Your Device GPS</span>
                      <span className="font-mono font-semibold text-slate-800 tabular-nums">
                        {checkInModal.result.userLat.toFixed(5)}, {checkInModal.result.userLng.toFixed(5)}
                      </span>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                      <span className="text-slate-500 block text-[11px]">
                        {checkInModal.result.targetSource === 'event' ? 'Event Venue Pin' : 'Church Sanctuary Pin'}
                      </span>
                      <span className="font-mono font-semibold text-indigo-700 tabular-nums">
                        {checkInModal.result.targetLat.toFixed(5)}, {checkInModal.result.targetLng.toFixed(5)}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {checkInModal.phase === 'error' && (
                <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-rose-600 text-white flex items-center justify-center shrink-0">
                    <ShieldAlert size={20} />
                  </div>
                  <div className="min-w-0 space-y-2">
                    <h4 className="text-sm font-bold text-rose-950">
                      Device GPS Required for Check-In
                    </h4>
                    <p className="text-xs text-rose-800 leading-relaxed">
                      {checkInModal.errorMessage}
                    </p>
                    {checkInModal.errorCode === 'POLICY_BLOCKED' && typeof window !== 'undefined' && (
                      <a
                        href={window.location.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-rose-200 text-rose-900 font-bold text-xs hover:bg-rose-100 transition-colors"
                      >
                        <span>Open in New Tab</span>
                        <ExternalLink size={12} />
                      </a>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
              {checkInModal.phase === 'outside' ? (
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${checkInModal.target.lat},${checkInModal.target.lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-h-[40px] px-3.5 py-2 bg-white hover:bg-slate-100 border border-slate-200 text-indigo-700 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 transition-colors"
                >
                  <Navigation size={13} />
                  <span>Directions to Venue</span>
                  <ExternalLink size={11} />
                </a>
              ) : (
                <span className="text-[11px] text-slate-500 font-medium">
                  Verified using device GPS only
                </span>
              )}

              <div className="flex items-center gap-2">
                {(checkInModal.phase === 'outside' || checkInModal.phase === 'error') && (
                  <button
                    type="button"
                    onClick={() =>
                      void runGeofenceVerification(
                        checkInModal.event,
                        checkInModal.locationName,
                        checkInModal.target,
                        checkInModal.occurrence
                      )
                    }
                    className="min-h-[40px] px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <RefreshCw size={13} />
                    <span>Retry GPS Check</span>
                  </button>
                )}

                {checkInModal.phase === 'verified' && (() => {
                  const latestReg = getEventUserReg(checkInModal.event);
                  if (!latestReg) return null;
                  return (
                    <button
                      type="button"
                      onClick={() => {
                        const evt = checkInModal.event;
                        const occ = checkInModal.occurrence;
                        setCheckInModal(null);
                        setShowQRPass({ event: evt, reg: latestReg, occurrence: occ });
                      }}
                      className="min-h-[40px] px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                    >
                      <QrCode size={14} />
                      <span>View Pass</span>
                    </button>
                  );
                })()}

                <button
                  type="button"
                  disabled={checkInModal.phase === 'verifying'}
                  onClick={() => setCheckInModal(null)}
                  className="min-h-[40px] px-4 py-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white rounded-xl text-xs font-semibold cursor-pointer transition-colors"
                >
                  {checkInModal.phase === 'verified' ? 'Done' : 'Close'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CalendarPage;
