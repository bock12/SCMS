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

export async function getCurrentGpsLocation(): Promise<{ lat: number; lng: number; source: 'device' | 'ip' }> {
  return new Promise((resolve, reject) => {
    let resolved = false;

    // Fast Timeout fallback to IP Geolocation if browser API is blocked or slow
    const ipFallbackTimeout = setTimeout(async () => {
      if (resolved) return;
      try {
        const res = await fetch('https://ipapi.co/json/');
        const data = await res.json();
        if (data && data.latitude && data.longitude) {
          resolved = true;
          resolve({
            lat: Number(data.latitude),
            lng: Number(data.longitude),
            source: 'ip'
          });
          return;
        }
      } catch (e) {
        console.warn('IP fallback failed during timeout:', e);
      }
    }, 4000);

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (resolved) return;
          clearTimeout(ipFallbackTimeout);
          resolved = true;
          resolve({
            lat: Number(pos.coords.latitude.toFixed(6)),
            lng: Number(pos.coords.longitude.toFixed(6)),
            source: 'device'
          });
        },
        async (err) => {
          if (resolved) return;
          clearTimeout(ipFallbackTimeout);
          console.warn('Geolocation API permission/error, switching to IP location:', err.message);
          try {
            const res = await fetch('https://ipapi.co/json/');
            const data = await res.json();
            if (data && data.latitude && data.longitude) {
              resolved = true;
              resolve({
                lat: Number(data.latitude),
                lng: Number(data.longitude),
                source: 'ip'
              });
              return;
            }
          } catch (e) {
            console.error('IP location service error:', e);
          }
          // Secondary fallback to Freetown default if network API blocked
          resolved = true;
          resolve({ lat: 8.484, lng: -13.229, source: 'ip' });
        },
        { enableHighAccuracy: false, timeout: 5000, maximumAge: 300000 }
      );
    } else {
      clearTimeout(ipFallbackTimeout);
      fetch('https://ipapi.co/json/')
        .then(res => res.json())
        .then(data => {
          if (data && data.latitude && data.longitude) {
            resolve({ lat: Number(data.latitude), lng: Number(data.longitude), source: 'ip' });
          } else {
            resolve({ lat: 8.484, lng: -13.229, source: 'ip' });
          }
        })
        .catch(() => resolve({ lat: 8.484, lng: -13.229, source: 'ip' }));
    }
  });
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
