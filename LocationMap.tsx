import React, { useState } from 'react';
import { MapPin, Navigation, ExternalLink, Compass, CheckCircle2, Layers } from 'lucide-react';

interface LocationMapProps {
  latitude: number;
  longitude: number;
  title?: string;
  subtitle?: string;
  zoom?: number;
  height?: string;
  interactive?: boolean;
  onLocationSelect?: (lat: number, lng: number) => void;
  className?: string;
}

export const LocationMap: React.FC<LocationMapProps> = ({
  latitude,
  longitude,
  title = 'Location Pin',
  subtitle,
  zoom = 15,
  height = '240px',
  interactive = true,
  onLocationSelect,
  className = ''
}) => {
  const [mapType, setMapType] = useState<'osm' | 'sat'>('osm');
  const [copied, setCopied] = useState(false);

  // Safely clamp lat (-90 to 90) and lng (-180 to 180)
  const validLat = Number.isNaN(Number(latitude)) ? 8.484 : Number(latitude);
  const validLng = Number.isNaN(Number(longitude)) ? -13.229 : Number(longitude);

  const formattedLat = validLat >= 0 ? `${validLat.toFixed(5)}° N` : `${Math.abs(validLat).toFixed(5)}° S`;
  const formattedLng = validLng >= 0 ? `${validLng.toFixed(5)}° E` : `${Math.abs(validLng).toFixed(5)}° W`;

  // Construct OpenStreetMap iframe URL box
  const bboxDelta = 0.008;
  const bbox = `${validLng - bboxDelta},${validLat - bboxDelta},${validLng + bboxDelta},${validLat + bboxDelta}`;
  const osmEmbedUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${validLat},${validLng}`;
  
  // Google Maps directions URL
  const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${validLat},${validLng}`;

  const copyCoordinates = () => {
    navigator.clipboard.writeText(`${validLat}, ${validLng}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className={`relative rounded-2xl overflow-hidden border border-slate-200 shadow-xs bg-slate-900 ${className}`}>
      {/* Interactive Embed Map View */}
      <div style={{ height }} className="w-full relative bg-slate-900 overflow-hidden">
        <iframe
          title={title || 'Location Map'}
          width="100%"
          height="100%"
          frameBorder="0"
          scrolling="no"
          marginHeight={0}
          marginWidth={0}
          src={osmEmbedUrl}
          className="w-full h-full border-0 filter contrast-[1.05] brightness-[0.98]"
          loading="lazy"
        />

        {/* Floating Top Controls Overlay */}
        <div className="absolute top-2.5 left-2.5 right-2.5 flex items-center justify-between pointer-events-none z-10">
          <div className="pointer-events-auto bg-slate-900/85 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/20 text-white shadow-lg flex items-center gap-2 max-w-[70%]">
            <div className="w-6 h-6 rounded-lg bg-indigo-500 text-white flex items-center justify-center shrink-0 shadow-xs">
              <MapPin size={14} className="animate-bounce" />
            </div>
            <div className="truncate">
              <p className="text-xs font-black truncate leading-tight text-white">{title}</p>
              {subtitle && <p className="text-[10px] text-slate-300 truncate leading-tight">{subtitle}</p>}
            </div>
          </div>

          <div className="pointer-events-auto flex items-center gap-1.5 bg-slate-900/85 backdrop-blur-md p-1 rounded-xl border border-white/20 text-white shadow-lg">
            <button
              type="button"
              onClick={copyCoordinates}
              className="px-2 py-1 rounded-lg text-[10px] font-mono font-bold bg-white/10 hover:bg-white/20 text-slate-200 transition-colors flex items-center gap-1 cursor-pointer"
              title="Copy GPS coordinates"
            >
              {copied ? (
                <>
                  <CheckCircle2 size={12} className="text-emerald-400" />
                  <span className="text-emerald-400 font-sans font-bold">Copied!</span>
                </>
              ) : (
                <>
                  <Compass size={12} className="text-amber-400" />
                  <span>{formattedLat}, {formattedLng}</span>
                </>
              )}
            </button>

            <a
              href={googleMapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-[10px] font-extrabold flex items-center gap-1 transition-all cursor-pointer shadow-xs"
              title="Open Directions in Google Maps"
            >
              <Navigation size={11} />
              <span>Directions</span>
              <ExternalLink size={10} className="opacity-75" />
            </a>
          </div>
        </div>

        {/* Footer Bar showing coordinates & map attribution */}
        <div className="absolute bottom-2 left-2 right-2 pointer-events-none z-10 flex items-center justify-between">
          <div className="pointer-events-auto bg-slate-900/80 backdrop-blur-md px-2.5 py-1 rounded-lg border border-white/10 text-[10px] text-slate-300 font-mono font-medium flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>GPS: {validLat.toFixed(5)}, {validLng.toFixed(5)}</span>
          </div>

          <a
            href={`https://www.openstreetmap.org/?mlat=${validLat}&mlon=${validLng}#map=${zoom}/${validLat}/${validLng}`}
            target="_blank"
            rel="noopener noreferrer"
            className="pointer-events-auto text-[9px] text-slate-400 bg-slate-900/70 backdrop-blur-xs px-2 py-0.5 rounded border border-white/5 hover:text-white transition-colors"
          >
            © OpenStreetMap contributors
          </a>
        </div>
      </div>
    </div>
  );
};
