import React, { useEffect, useMemo, useState } from 'react';
import {
  MapPin,
  Navigation,
  ExternalLink,
  Compass,
  CheckCircle2,
  Plus,
  Minus,
  LocateFixed,
  Layers,
  AlertTriangle
} from 'lucide-react';

interface LocationMapProps {
  latitude: number;
  longitude: number;
  title?: string;
  subtitle?: string;
  zoom?: number;
  height?: string;
  interactive?: boolean;
  onLocationSelect?: (lat: number, lng: number) => void;
  sourceLabel?: string;
  className?: string;
}

const MIN_ZOOM = 6;
const MAX_ZOOM = 18;

export const LocationMap: React.FC<LocationMapProps> = ({
  latitude,
  longitude,
  title = 'Location Pin',
  subtitle,
  zoom = 15,
  height = '240px',
  sourceLabel,
  className = ''
}) => {
  const [mapLayer, setMapLayer] = useState<'mapnik' | 'hot'>('mapnik');
  const [zoomLevel, setZoomLevel] = useState<number>(() =>
    Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom || 15))
  );
  const [recenterTick, setRecenterTick] = useState(0);
  const [copied, setCopied] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const numLat = Number(latitude);
  const numLng = Number(longitude);
  const hasValidCoords =
    Number.isFinite(numLat) &&
    Number.isFinite(numLng) &&
    Math.abs(numLat) <= 90 &&
    Math.abs(numLng) <= 180;

  const validLat = hasValidCoords ? numLat : 8.484;
  const validLng = hasValidCoords ? numLng : -13.229;

  const formattedLat =
    validLat >= 0 ? `${validLat.toFixed(5)}° N` : `${Math.abs(validLat).toFixed(5)}° S`;
  const formattedLng =
    validLng >= 0 ? `${validLng.toFixed(5)}° E` : `${Math.abs(validLng).toFixed(5)}° W`;

  // Dynamic bounding box derived from zoom level so +/- controls actually zoom the preview
  const osmEmbedUrl = useMemo(() => {
    const latDelta = Math.max(0.0008, 120 / Math.pow(2, zoomLevel));
    const cosLat = Math.max(0.25, Math.cos((validLat * Math.PI) / 180));
    const lngDelta = latDelta / cosLat;
    const minLng = Math.max(-180, validLng - lngDelta);
    const maxLng = Math.min(180, validLng + lngDelta);
    const minLat = Math.max(-85, validLat - latDelta);
    const maxLat = Math.min(85, validLat + latDelta);

    const bbox = `${minLng.toFixed(6)},${minLat.toFixed(6)},${maxLng.toFixed(6)},${maxLat.toFixed(6)}`;
    return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=${mapLayer}&marker=${validLat},${validLng}&_r=${recenterTick}`;
  }, [validLat, validLng, zoomLevel, mapLayer, recenterTick]);

  useEffect(() => {
    setIsLoading(true);
    const fallbackTimer = window.setTimeout(() => setIsLoading(false), 2500);
    return () => window.clearTimeout(fallbackTimer);
  }, [osmEmbedUrl]);

  const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${validLat},${validLng}`;
  const osmFullUrl = `https://www.openstreetmap.org/?mlat=${validLat}&mlon=${validLng}#map=${zoomLevel}/${validLat}/${validLng}`;

  const copyCoordinates = async () => {
    try {
      await navigator.clipboard.writeText(`${validLat}, ${validLng}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      // Ignore clipboard failures in restricted contexts
    }
  };

  return (
    <div
      className={`rounded-2xl overflow-hidden border border-slate-200 bg-white ${className}`}
    >
      {/* Unobstructed Header Chrome */}
      <div className="px-3.5 py-2.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <div className="w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center shrink-0">
            <MapPin size={14} />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold text-slate-900 truncate leading-tight">
              {title}
            </p>
            {subtitle && (
              <p className="text-[11px] text-slate-500 truncate leading-tight mt-0.5">
                {subtitle}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setMapLayer(prev => (prev === 'mapnik' ? 'hot' : 'mapnik'))}
            className="min-h-[32px] px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 transition-colors inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
            title="Switch map tile style"
          >
            <Layers size={12} className="text-indigo-600 shrink-0" />
            <span>{mapLayer === 'mapnik' ? 'Standard' : 'Terrain'}</span>
          </button>

          <button
            type="button"
            onClick={copyCoordinates}
            className="min-h-[32px] px-2.5 py-1 rounded-lg text-[11px] font-mono font-semibold bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 transition-colors inline-flex items-center gap-1 cursor-pointer whitespace-nowrap tabular-nums"
            title="Copy GPS coordinates"
          >
            {copied ? (
              <>
                <CheckCircle2 size={12} className="text-emerald-600 shrink-0" />
                <span className="text-emerald-700 font-sans font-bold">Copied</span>
              </>
            ) : (
              <>
                <Compass size={12} className="text-amber-600 shrink-0" />
                <span className="hidden sm:inline">
                  {formattedLat}, {formattedLng}
                </span>
                <span className="sm:hidden font-sans">Copy GPS</span>
              </>
            )}
          </button>

          <a
            href={googleMapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="min-h-[32px] px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-[11px] font-bold inline-flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap"
            title="Open Directions in Google Maps"
          >
            <Navigation size={11} className="shrink-0" />
            <span>Directions</span>
            <ExternalLink size={10} className="opacity-80 shrink-0" />
          </a>
        </div>
      </div>

      {/* Unobstructed Map Viewport */}
      <div style={{ height }} className="w-full relative bg-slate-100 overflow-hidden">
        {!hasValidCoords ? (
          <div className="w-full h-full flex flex-col items-center justify-center p-4 text-center space-y-1.5 bg-amber-50/70">
            <AlertTriangle size={22} className="text-amber-600" />
            <p className="text-xs font-bold text-slate-800">Invalid GPS Coordinates</p>
            <p className="text-[11px] text-slate-600">
              Latitude must be between -90 and 90, and Longitude between -180 and 180.
            </p>
          </div>
        ) : (
          <>
            <iframe
              key={osmEmbedUrl}
              title={title || 'Location Map'}
              width="100%"
              height="100%"
              frameBorder="0"
              scrolling="no"
              marginHeight={0}
              marginWidth={0}
              src={osmEmbedUrl}
              onLoad={() => setIsLoading(false)}
              className="w-full h-full border-0"
              loading="lazy"
            />

            {isLoading && (
              <div className="absolute inset-0 bg-slate-100/80 backdrop-blur-[1px] flex items-center justify-center pointer-events-none">
                <div className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 shadow-xs text-[11px] font-semibold text-slate-700 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-indigo-600 animate-ping" />
                  <span>Loading map tiles...</span>
                </div>
              </div>
            )}

            {/* Compact Right-Hand Zoom & Recenter Controls */}
            <div className="absolute top-2.5 right-2.5 z-10 flex flex-col bg-white/95 backdrop-blur-sm rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <button
                type="button"
                onClick={() => setZoomLevel(z => Math.min(MAX_ZOOM, z + 1))}
                disabled={zoomLevel >= MAX_ZOOM}
                aria-label="Zoom in"
                title="Zoom in"
                className="w-8 h-8 flex items-center justify-center text-slate-700 hover:bg-slate-100 disabled:opacity-40 cursor-pointer transition-colors border-b border-slate-200"
              >
                <Plus size={14} />
              </button>
              <button
                type="button"
                onClick={() => setZoomLevel(z => Math.max(MIN_ZOOM, z - 1))}
                disabled={zoomLevel <= MIN_ZOOM}
                aria-label="Zoom out"
                title="Zoom out"
                className="w-8 h-8 flex items-center justify-center text-slate-700 hover:bg-slate-100 disabled:opacity-40 cursor-pointer transition-colors border-b border-slate-200"
              >
                <Minus size={14} />
              </button>
              <button
                type="button"
                onClick={() => {
                  setZoomLevel(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom || 15)));
                  setRecenterTick(t => t + 1);
                }}
                aria-label="Recenter on pin"
                title="Recenter map on pin"
                className="w-8 h-8 flex items-center justify-center text-indigo-700 hover:bg-indigo-50 cursor-pointer transition-colors"
              >
                <LocateFixed size={14} />
              </button>
            </div>
          </>
        )}
      </div>

      {/* Crisp Footer Telemetry Bar */}
      <div className="px-3.5 py-2 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600">
        <div className="flex flex-wrap items-center gap-2 font-mono tabular-nums">
          <span>
            GPS: {validLat.toFixed(5)}, {validLng.toFixed(5)}
          </span>
          <span aria-hidden="true" className="text-slate-300">
            ·
          </span>
          <span className="font-sans font-semibold text-slate-700">Zoom {zoomLevel}x</span>
          {sourceLabel && (
            <>
              <span aria-hidden="true" className="text-slate-300">
                ·
              </span>
              <span className="font-sans font-semibold text-indigo-700">{sourceLabel}</span>
            </>
          )}
        </div>

        <a
          href={osmFullUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[11px] font-semibold text-slate-600 hover:text-indigo-700 hover:underline inline-flex items-center gap-1 whitespace-nowrap"
        >
          <span>OpenStreetMap</span>
          <ExternalLink size={10} />
        </a>
      </div>
    </div>
  );
};
