import { ChurchProfile } from './types';

const STORAGE_KEY = 'faithconnect_church_profile_v1';

export const DEFAULT_CHURCH_PROFILE: ChurchProfile = {
  name: 'FaithConnect Grace Cathedral',
  main_title: 'FaithConnect',
  subtle_title: 'Grace Cathedral',
  senior_pastor: 'Rev. Sarah Johnson & Pastor David Miller',
  phone: '+232 76 543 210',
  email: 'grace@faithconnect.church',
  address: '120 Grace Way, Off Circular Road, Freetown',
  city: 'Freetown',
  state_country: 'Sierra Leone',
  logo_url: 'https://images.unsplash.com/photo-1548625361-185b1e6002f2?auto=format&fit=crop&q=80&w=200&h=200',
  latitude: 8.484,
  longitude: -13.229,
  website: 'https://faithconnect.church',
  mission_statement: 'Empowering believer communities, promoting transformation, and spreading love and hope worldwide.',
  primary_color: '#4f46e5',
  secondary_color: '#10b981',
  service_times: [
    'Sunday Morning Celebration: 9:00 AM & 11:30 AM',
    'Wednesday Midweek Communion & Bible Study: 7:00 PM',
    'Friday Night Intercessory Prayer Vigil: 10:00 PM'
  ]
};

export function getChurchProfile(): ChurchProfile {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      applyChurchTheme(DEFAULT_CHURCH_PROFILE);
      return DEFAULT_CHURCH_PROFILE;
    }
    const parsed = JSON.parse(raw);
    const profile = {
      ...DEFAULT_CHURCH_PROFILE,
      ...parsed
    };
    applyChurchTheme(profile);
    return profile;
  } catch (e) {
    console.error('Failed to load church profile from localStorage:', e);
    applyChurchTheme(DEFAULT_CHURCH_PROFILE);
    return DEFAULT_CHURCH_PROFILE;
  }
}

export function saveChurchProfile(profile: ChurchProfile): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
    applyChurchTheme(profile);
    // Dispatch custom event for real-time reactivity in UI header/brand
    window.dispatchEvent(new CustomEvent('church-profile-updated', { detail: profile }));
  } catch (e) {
    console.error('Failed to save church profile to localStorage:', e);
  }
}

export function applyChurchTheme(profile: ChurchProfile): void {
  if (typeof document === 'undefined') return;

  const primary = profile.primary_color || '#4f46e5';
  const secondary = profile.secondary_color || '#10b981';

  let styleEl = document.getElementById('church-dynamic-theme');
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = 'church-dynamic-theme';
    document.head.appendChild(styleEl);
  }

  styleEl.textContent = `
    :root {
      --church-primary-color: ${primary};
      --church-secondary-color: ${secondary};
    }

    /* Primary Theme Color Overrides */
    .bg-indigo-600,
    .bg-indigo-700,
    button.bg-indigo-600,
    a.bg-indigo-600,
    button.bg-indigo-700,
    a.bg-indigo-700,
    .custom-theme-primary-bg {
      background-color: ${primary} !important;
    }

    .hover\\:bg-indigo-700:hover,
    .hover\\:bg-indigo-800:hover {
      background-color: ${primary}ee !important;
    }

    .text-indigo-600,
    .text-indigo-700,
    .text-indigo-800,
    .text-indigo-900,
    .hover\\:text-indigo-600:hover,
    .custom-theme-primary-text {
      color: ${primary} !important;
    }

    .border-indigo-600,
    .border-indigo-500,
    .focus\\:border-indigo-500:focus {
      border-color: ${primary} !important;
    }

    .bg-indigo-50,
    .bg-indigo-50\\/80,
    .bg-indigo-50\\/60 {
      background-color: color-mix(in srgb, ${primary} 12%, transparent) !important;
    }

    .bg-indigo-100 {
      background-color: color-mix(in srgb, ${primary} 22%, transparent) !important;
    }

    .border-indigo-200,
    .border-indigo-100 {
      border-color: color-mix(in srgb, ${primary} 30%, transparent) !important;
    }

    /* Secondary Theme Color Overrides */
    .bg-emerald-600,
    .bg-emerald-500,
    button.bg-emerald-500,
    button.bg-emerald-600,
    a.bg-emerald-600,
    .custom-theme-secondary-bg {
      background-color: ${secondary} !important;
    }

    .hover\\:bg-emerald-600:hover,
    .hover\\:bg-emerald-700:hover {
      background-color: ${secondary}ee !important;
    }

    .text-emerald-600,
    .text-emerald-700,
    .text-emerald-800,
    .text-emerald-900,
    .custom-theme-secondary-text {
      color: ${secondary} !important;
    }

    .bg-emerald-50,
    .bg-emerald-100 {
      background-color: color-mix(in srgb, ${secondary} 15%, transparent) !important;
    }

    .border-emerald-200,
    .border-emerald-500 {
      border-color: color-mix(in srgb, ${secondary} 40%, transparent) !important;
    }
  `;
}

export interface GpsLocationResult {
  lat: number;
  lng: number;
  source: 'device' | 'ip';
  accuracy?: number;
  warning?: string;
}

export interface PlaceSearchResult {
  displayName: string;
  lat: number;
  lng: number;
}

export function parseCoordinatesInput(raw: string): { lat: number; lng: number } | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Support Google Maps URLs containing @lat,lng or q=lat,lng
  const urlMatch = trimmed.match(/(?:@|[?&](?:q|query)=)(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/i);
  if (urlMatch) {
    const lat = Number(urlMatch[1]);
    const lng = Number(urlMatch[2]);
    if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
      return { lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)) };
    }
  }

  // Support plain "lat, lng" or "lat lng"
  const pairMatch = trimmed.match(/^(-?\d+(?:\.\d+)?)\s*[,\s]\s*(-?\d+(?:\.\d+)?)$/);
  if (pairMatch) {
    const lat = Number(pairMatch[1]);
    const lng = Number(pairMatch[2]);
    if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
      return { lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)) };
    }
  }

  return null;
}

export async function searchLocationByQuery(query: string): Promise<PlaceSearchResult[]> {
  const cleaned = query.trim();
  if (!cleaned) return [];

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 7000);
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=5&addressdetails=1&q=${encodeURIComponent(cleaned)}`,
      {
        signal: controller.signal,
        headers: {
          Accept: 'application/json'
        }
      }
    );
    if (!res.ok) {
      throw new Error(`Location search failed (${res.status})`);
    }
    const items = await res.json();
    if (!Array.isArray(items)) return [];
    return items
      .map((item: any) => ({
        displayName: String(item.display_name || ''),
        lat: Number(Number(item.lat).toFixed(6)),
        lng: Number(Number(item.lon).toFixed(6))
      }))
      .filter(r => r.displayName && Number.isFinite(r.lat) && Number.isFinite(r.lng));
  } finally {
    window.clearTimeout(timeout);
  }
}

async function fetchIpLocationFallback(): Promise<{ lat: number; lng: number } | null> {
  const endpoints = [
    async () => {
      const controller = new AbortController();
      const t = window.setTimeout(() => controller.abort(), 4500);
      try {
        const res = await fetch('https://ipapi.co/json/', { signal: controller.signal });
        if (!res.ok) return null;
        const data = await res.json();
        const lat = Number(data?.latitude);
        const lng = Number(data?.longitude);
        return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
      } finally {
        window.clearTimeout(t);
      }
    },
    async () => {
      const controller = new AbortController();
      const t = window.setTimeout(() => controller.abort(), 4500);
      try {
        const res = await fetch('https://ipwho.is/', { signal: controller.signal });
        if (!res.ok) return null;
        const data = await res.json();
        if (data?.success === false) return null;
        const lat = Number(data?.latitude);
        const lng = Number(data?.longitude);
        return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
      } finally {
        window.clearTimeout(t);
      }
    }
  ];

  for (const attempt of endpoints) {
    try {
      const coords = await attempt();
      if (coords) {
        return {
          lat: Number(coords.lat.toFixed(6)),
          lng: Number(coords.lng.toFixed(6))
        };
      }
    } catch {
      // Try next IP provider
    }
  }
  return null;
}

export class GpsAccessError extends Error {
  code: 'PERMISSION_DENIED' | 'POLICY_BLOCKED' | 'TIMEOUT' | 'UNAVAILABLE' | 'UNSUPPORTED';
  constructor(
    message: string,
    code: 'PERMISSION_DENIED' | 'POLICY_BLOCKED' | 'TIMEOUT' | 'UNAVAILABLE' | 'UNSUPPORTED'
  ) {
    super(message);
    this.name = 'GpsAccessError';
    this.code = code;
  }
}

export async function getNetworkApproximateLocation(): Promise<GpsLocationResult> {
  const ipCoords = await fetchIpLocationFallback();
  if (!ipCoords) {
    throw new GpsAccessError(
      'Approximate network location lookup failed. Search a venue or paste coordinates manually.',
      'UNAVAILABLE'
    );
  }
  return {
    ...ipCoords,
    source: 'ip',
    warning: 'Using approximate network (IP) location — verify and fine-tune the pin on the map.'
  };
}

export async function getGeolocationPermissionStatus(): Promise<PermissionState | 'unsupported'> {
  if (typeof navigator === 'undefined' || !navigator.permissions?.query) {
    return 'unsupported';
  }
  try {
    const status = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
    return status.state;
  } catch {
    return 'unsupported';
  }
}

export async function getCurrentGpsLocation(): Promise<GpsLocationResult> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    throw new GpsAccessError(
      'Device GPS API (navigator.geolocation) is not supported in this browser.',
      'UNSUPPORTED'
    );
  }

  return new Promise((resolve, reject) => {
    let settled = false;

    const handleFailure = async (geoErr?: GeolocationPositionError) => {
      if (settled) return;
      settled = true;

      const errMsg = String(geoErr?.message || '').toLowerCase();
      const isPolicyBlocked =
        errMsg.includes('permissions policy') ||
        errMsg.includes('feature policy') ||
        errMsg.includes('disabled in this document');

      if (geoErr?.code === 1) {
        if (isPolicyBlocked) {
          reject(
            new GpsAccessError(
              'Geolocation is currently blocked by the embedded frame Permissions Policy. Reload the preview or open the app in a standalone tab to allow device GPS access.',
              'POLICY_BLOCKED'
            )
          );
          return;
        }
        reject(
          new GpsAccessError(
            'Device GPS permission was denied. Allow Location access in your browser site settings (address bar lock/tune icon) and try again.',
            'PERMISSION_DENIED'
          )
        );
        return;
      }

      const reason =
        geoErr?.code === 3
          ? 'Device GPS timed out before acquiring a satellite or Wi-Fi fix.'
          : geoErr?.message || 'Device GPS signal is currently unavailable.';

      const ipCoords = await fetchIpLocationFallback();
      if (ipCoords) {
        resolve({
          ...ipCoords,
          source: 'ip',
          warning: `${reason} Showing approximate network location instead—verify the pin on the map.`
        });
        return;
      }

      reject(
        new GpsAccessError(
          `${reason} Search an address, pick a preset, or paste coordinates directly.`,
          geoErr?.code === 3 ? 'TIMEOUT' : 'UNAVAILABLE'
        )
      );
    };

    try {
      // Call getCurrentPosition synchronously inside user click flow so the browser displays its native permission prompt
      navigator.geolocation.getCurrentPosition(
        pos => {
          if (settled) return;
          settled = true;
          resolve({
            lat: Number(pos.coords.latitude.toFixed(6)),
            lng: Number(pos.coords.longitude.toFixed(6)),
            source: 'device',
            accuracy: typeof pos.coords.accuracy === 'number' ? Math.round(pos.coords.accuracy) : undefined
          });
        },
        err => {
          // If high-accuracy timed out or failed transiently (not permission denied), retry once with standard accuracy
          if (err && err.code !== 1) {
            navigator.geolocation.getCurrentPosition(
              pos => {
                if (settled) return;
                settled = true;
                resolve({
                  lat: Number(pos.coords.latitude.toFixed(6)),
                  lng: Number(pos.coords.longitude.toFixed(6)),
                  source: 'device',
                  accuracy: typeof pos.coords.accuracy === 'number' ? Math.round(pos.coords.accuracy) : undefined
                });
              },
              retryErr => {
                void handleFailure(retryErr || err);
              },
              { enableHighAccuracy: false, timeout: 6000, maximumAge: 180000 }
            );
            return;
          }
          void handleFailure(err);
        },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
      );
    } catch (syncErr: any) {
      if (!settled) {
        settled = true;
        reject(new GpsAccessError(syncErr?.message || 'Unable to invoke device GPS.', 'UNAVAILABLE'));
      }
    }
  });
}

export const DEFAULT_GEOFENCE_RADIUS_METERS = 250;

export interface GeofenceVerificationResult {
  allowed: boolean;
  distanceMeters: number;
  radiusMeters: number;
  effectiveAllowanceMeters: number;
  userLat: number;
  userLng: number;
  accuracy?: number;
  targetLat: number;
  targetLng: number;
  targetSource: 'event' | 'church_profile';
  locationSource: 'device';
}

export function calculateDistanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371000; // Earth mean radius in meters
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

export function formatDistanceLabel(meters: number): string {
  if (!Number.isFinite(meters) || meters < 0) return '0 m';
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(2)} km`;
}

/**
 * Acquires precise device GPS only (no IP fallback) for geofence attendance verification.
 */
export async function getDeviceGpsPreciseOnly(): Promise<GpsLocationResult> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    throw new GpsAccessError(
      'Device GPS API (navigator.geolocation) is not supported in this browser.',
      'UNSUPPORTED'
    );
  }

  return new Promise((resolve, reject) => {
    let settled = false;

    const handleErr = (geoErr?: GeolocationPositionError) => {
      if (settled) return;
      settled = true;

      const errMsg = String(geoErr?.message || '').toLowerCase();
      const isPolicyBlocked =
        errMsg.includes('permissions policy') ||
        errMsg.includes('feature policy') ||
        errMsg.includes('disabled in this document');

      if (geoErr?.code === 1) {
        if (isPolicyBlocked) {
          reject(
            new GpsAccessError(
              'Geolocation is blocked by the embedded frame Permissions Policy. Reload the preview or open the app in a standalone tab to check in with device GPS.',
              'POLICY_BLOCKED'
            )
          );
          return;
        }
        reject(
          new GpsAccessError(
            'Device GPS permission was denied. Allow Location access in your browser site settings and try checking in again.',
            'PERMISSION_DENIED'
          )
        );
        return;
      }

      if (geoErr?.code === 3) {
        reject(
          new GpsAccessError(
            'Device GPS timed out before locking onto your location. Ensure Location / GPS is turned on and try again.',
            'TIMEOUT'
          )
        );
        return;
      }

      reject(
        new GpsAccessError(
          geoErr?.message || 'Unable to confirm your device GPS position. Please enable GPS and try again.',
          'UNAVAILABLE'
        )
      );
    };

    try {
      navigator.geolocation.getCurrentPosition(
        pos => {
          if (settled) return;
          settled = true;
          resolve({
            lat: Number(pos.coords.latitude.toFixed(6)),
            lng: Number(pos.coords.longitude.toFixed(6)),
            source: 'device',
            accuracy: typeof pos.coords.accuracy === 'number' ? Math.round(pos.coords.accuracy) : undefined
          });
        },
        err => {
          if (err && err.code !== 1) {
            navigator.geolocation.getCurrentPosition(
              pos => {
                if (settled) return;
                settled = true;
                resolve({
                  lat: Number(pos.coords.latitude.toFixed(6)),
                  lng: Number(pos.coords.longitude.toFixed(6)),
                  source: 'device',
                  accuracy: typeof pos.coords.accuracy === 'number' ? Math.round(pos.coords.accuracy) : undefined
                });
              },
              retryErr => handleErr(retryErr || err),
              { enableHighAccuracy: false, timeout: 7000, maximumAge: 30000 }
            );
            return;
          }
          handleErr(err);
        },
        { enableHighAccuracy: true, timeout: 9000, maximumAge: 0 }
      );
    } catch (syncErr: any) {
      if (!settled) {
        settled = true;
        reject(new GpsAccessError(syncErr?.message || 'Unable to invoke device GPS.', 'UNAVAILABLE'));
      }
    }
  });
}

export async function verifyGeofencePresence(
  targetLat: number,
  targetLng: number,
  targetSource: 'event' | 'church_profile' = 'event',
  radiusMeters: number = DEFAULT_GEOFENCE_RADIUS_METERS
): Promise<GeofenceVerificationResult> {
  if (
    !Number.isFinite(targetLat) ||
    !Number.isFinite(targetLng) ||
    Math.abs(targetLat) > 90 ||
    Math.abs(targetLng) > 180
  ) {
    throw new GpsAccessError('Event premises GPS coordinates are invalid or not configured.', 'UNAVAILABLE');
  }

  const deviceLoc = await getDeviceGpsPreciseOnly();
  const distanceMeters = calculateDistanceMeters(
    deviceLoc.lat,
    deviceLoc.lng,
    targetLat,
    targetLng
  );
  // Allow modest indoor GPS accuracy tolerance (up to +50m) on top of the configured perimeter
  const accuracyBuffer = Math.min(50, Math.round((deviceLoc.accuracy || 0) * 0.5));
  const effectiveAllowanceMeters = radiusMeters + accuracyBuffer;
  const allowed = distanceMeters <= effectiveAllowanceMeters;

  return {
    allowed,
    distanceMeters,
    radiusMeters,
    effectiveAllowanceMeters,
    userLat: deviceLoc.lat,
    userLng: deviceLoc.lng,
    accuracy: deviceLoc.accuracy,
    targetLat,
    targetLng,
    targetSource,
    locationSource: 'device'
  };
}

export const PRESET_COLOR_THEMES = [
  { name: 'Royal Indigo & Emerald', primary: '#4f46e5', secondary: '#10b981' },
  { name: 'Deep Navy & Warm Gold', primary: '#1e3a8a', secondary: '#f59e0b' },
  { name: 'Majestic Purple & Amber', primary: '#7e22ce', secondary: '#d97706' },
  { name: 'Grace Teal & Crimson', primary: '#0d9488', secondary: '#e11d48' },
  { name: 'Classic Slate & Sapphire', primary: '#334155', secondary: '#2563eb' }
];

export const PRESET_CHURCH_LOGOS = [
  {
    name: 'Classic Grace Cross',
    url: 'https://images.unsplash.com/photo-1548625361-185b1e6002f2?auto=format&fit=crop&q=80&w=200&h=200'
  },
  {
    name: 'Golden Cathedral Emblem',
    url: 'https://images.unsplash.com/photo-1519817650390-64a93db51149?auto=format&fit=crop&q=80&w=200&h=200'
  },
  {
    name: 'Modern Faith Shield',
    url: 'https://images.unsplash.com/photo-1438232992991-995b7058bbb3?auto=format&fit=crop&q=80&w=200&h=200'
  },
  {
    name: 'Dove of Peace',
    url: 'https://images.unsplash.com/photo-1544427920-c49ccfb85579?auto=format&fit=crop&q=80&w=200&h=200'
  }
];

export const PRESET_GPS_LOCATIONS = [
  { name: 'Freetown Main Cathedral (Sierra Leone)', lat: 8.484, lng: -13.229 },
  { name: 'Bo District Worship Hub', lat: 7.9647, lng: -11.7383 },
  { name: 'Kenema Outreach Center', lat: 7.8767, lng: -11.1875 },
  { name: 'Makeni Regional Campus', lat: 8.8858, lng: -12.0442 },
  { name: 'Accra Victory Center (Ghana)', lat: 5.6037, lng: -0.1870 },
  { name: 'Lagos Cathedral (Nigeria)', lat: 6.5244, lng: 3.3792 },
  { name: 'London Faith Chapel (UK)', lat: 51.5074, lng: -0.1278 },
  { name: 'New York Grace Temple (USA)', lat: 40.7128, lng: -74.0060 }
];
