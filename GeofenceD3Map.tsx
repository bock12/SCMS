import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import { LocateFixed, Maximize2, Minus, Plus, RotateCcw } from 'lucide-react';
import { formatDistanceLabel } from './churchProfileService';

export interface GeofenceD3MapProps {
  targetLat: number;
  targetLng: number;
  targetLabel: string;
  targetSource: 'event' | 'church_profile';
  radiusMeters: number;
  userLat?: number;
  userLng?: number;
  accuracy?: number;
  distanceMeters?: number;
  allowed?: boolean;
  phase: 'verifying' | 'verified' | 'outside' | 'error';
  height?: number;
}

const EARTH_RADIUS_METERS = 6371000;

function metersToDegrees(meters: number): number {
  return (meters / EARTH_RADIUS_METERS) * (180 / Math.PI);
}

function computeCompassBearing(lat1: number, lng1: number, lat2: number, lng2: number): string {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const dLambda = toRad(lng2 - lng1);
  const y = Math.sin(dLambda) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLambda);
  const bearing = (toDeg(Math.atan2(y, x)) + 360) % 360;
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return dirs[Math.round(bearing / 45) % 8];
}

function chooseNiceScaleMeters(targetMeters: number): number {
  if (!Number.isFinite(targetMeters) || targetMeters <= 0) return 100;
  const steps = [10, 20, 50, 100, 150, 200, 250, 500, 1000, 2000, 5000, 10000, 25000, 50000, 100000];
  for (const s of steps) {
    if (s >= targetMeters) return s;
  }
  return steps[steps.length - 1];
}

export const GeofenceD3Map: React.FC<GeofenceD3MapProps> = ({
  targetLat,
  targetLng,
  targetLabel,
  targetSource,
  radiusMeters,
  userLat,
  userLng,
  accuracy,
  distanceMeters,
  allowed,
  phase,
  height = 256
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const zoomBehaviorRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);

  const [svgWidth, setSvgWidth] = useState<number>(460);
  const [focusMode, setFocusMode] = useState<'both' | 'premises'>('both');
  const [zoomScale, setZoomScale] = useState<number>(1);
  const [selectedMarker, setSelectedMarker] = useState<'user' | 'premises' | null>(null);

  const hasUserFix =
    Number.isFinite(userLat) &&
    Number.isFinite(userLng) &&
    Math.abs(userLat as number) <= 90 &&
    Math.abs(userLng as number) <= 180;

  const isFarOutside = useMemo(() => {
    if (!hasUserFix || typeof distanceMeters !== 'number') return false;
    return distanceMeters > radiusMeters * 2.5;
  }, [hasUserFix, distanceMeters, radiusMeters]);

  useEffect(() => {
    setFocusMode('both');
    setSelectedMarker(null);
  }, [targetLat, targetLng, userLat, userLng, phase]);

  // Keep SVG responsive inside modal width
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const updateWidth = () => {
      const next = Math.max(280, Math.round(el.clientWidth || 460));
      setSvgWidth(next);
    };
    updateWidth();
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(updateWidth);
      ro.observe(el);
      return () => ro.disconnect();
    }
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, []);

  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl) return;

    const width = svgWidth;
    const svg = d3.select(svgEl);
    svg.selectAll('*').remove();

    // Subtle map background & grid defs
    const defs = svg.append('defs');

    const gridPattern = defs
      .append('pattern')
      .attr('id', 'geofence-d3-grid')
      .attr('width', 28)
      .attr('height', 28)
      .attr('patternUnits', 'userSpaceOnUse');
    gridPattern
      .append('path')
      .attr('d', 'M 28 0 L 0 0 0 28')
      .attr('fill', 'none')
      .attr('stroke', '#e2e8f0')
      .attr('stroke-width', 0.75)
      .attr('stroke-opacity', 0.75);

    const allowedFill =
      phase === 'verified' || allowed
        ? '#10b981'
        : phase === 'outside'
        ? '#f59e0b'
        : '#4f46e5';

    const ringStroke =
      phase === 'verified' || allowed
        ? '#059669'
        : phase === 'outside'
        ? '#d97706'
        : '#4f46e5';

    // Background canvas
    svg
      .append('rect')
      .attr('width', width)
      .attr('height', height)
      .attr('fill', '#f8fafc');
    svg
      .append('rect')
      .attr('width', width)
      .attr('height', height)
      .attr('fill', 'url(#geofence-d3-grid)');

    // Build GeoJSON circles using real geodesic angular degrees
    const geofenceDeg = metersToDegrees(radiusMeters);
    const outerContextDeg = metersToDegrees(Math.max(radiusMeters * 1.65, 180));
    const innerHalfDeg = metersToDegrees(radiusMeters * 0.5);

    const geofenceCircle = d3.geoCircle().center([targetLng, targetLat]).radius(geofenceDeg)();
    const innerRingCircle = d3.geoCircle().center([targetLng, targetLat]).radius(innerHalfDeg)();
    const outerContextCircle = d3.geoCircle().center([targetLng, targetLat]).radius(outerContextDeg)();

    const fitFeatures: GeoJSON.Feature[] = [
      { type: 'Feature', properties: {}, geometry: geofenceCircle },
      { type: 'Feature', properties: {}, geometry: outerContextCircle }
    ];

    if (hasUserFix && focusMode === 'both') {
      const uLat = userLat as number;
      const uLng = userLng as number;
      const userPadMeters = Math.max(accuracy || 40, radiusMeters * 0.35);
      const userPadCircle = d3.geoCircle().center([uLng, uLat]).radius(metersToDegrees(userPadMeters))();
      fitFeatures.push(
        { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [uLng, uLat] } },
        { type: 'Feature', properties: {}, geometry: userPadCircle }
      );
    }

    const fitCollection: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: fitFeatures
    };

    const pad = Math.min(44, Math.round(height * 0.17));
    const projection = d3
      .geoMercator()
      .fitExtent(
        [
          [pad, pad],
          [width - pad, height - pad]
        ],
        fitCollection
      );

    const pathGenerator = d3.geoPath(projection);

    // Zoomable map layer
    const mapLayer = svg.append('g').attr('class', 'geofence-zoom-layer');

    // Geographic graticule clipped nicely inside view
    const graticuleStep = isFarOutside && focusMode === 'both' ? 0.02 : 0.002;
    const graticule = d3.geoGraticule().step([graticuleStep, graticuleStep]);
    mapLayer
      .append('path')
      .datum(graticule())
      .attr('d', pathGenerator)
      .attr('fill', 'none')
      .attr('stroke', '#cbd5e1')
      .attr('stroke-width', 0.6)
      .attr('stroke-dasharray', '2,4')
      .attr('opacity', 0.65);

    // Outer reference ring (soft guide)
    mapLayer
      .append('path')
      .datum(outerContextCircle)
      .attr('d', pathGenerator)
      .attr('fill', 'none')
      .attr('stroke', '#cbd5e1')
      .attr('stroke-width', 1)
      .attr('stroke-dasharray', '3,4');

    // Inner 50% perimeter ring
    mapLayer
      .append('path')
      .datum(innerRingCircle)
      .attr('d', pathGenerator)
      .attr('fill', 'none')
      .attr('stroke', ringStroke)
      .attr('stroke-width', 0.9)
      .attr('stroke-opacity', 0.3)
      .attr('stroke-dasharray', '2,3');

    // Configured Geofence Perimeter Circle
    mapLayer
      .append('path')
      .datum(geofenceCircle)
      .attr('d', pathGenerator)
      .attr('fill', allowedFill)
      .attr('fill-opacity', 0.14)
      .attr('stroke', ringStroke)
      .attr('stroke-width', 2)
      .attr('stroke-dasharray', phase === 'outside' ? '6,4' : 'none');

    // Project target premises screen coordinates
    const pTarget = projection([targetLng, targetLat]) || [width / 2, height / 2];

    // Calculate approximate pixel radius of geofence so small zoomed-out circles stay visible
    const geofenceEdge = projection([
      targetLng + geofenceDeg / Math.max(0.2, Math.cos((targetLat * Math.PI) / 180)),
      targetLat
    ]);
    const geofencePixelRadius = geofenceEdge
      ? Math.hypot(geofenceEdge[0] - pTarget[0], geofenceEdge[1] - pTarget[1])
      : 20;

    if (geofencePixelRadius < 10) {
      mapLayer
        .append('circle')
        .attr('cx', pTarget[0])
        .attr('cy', pTarget[1])
        .attr('r', 12)
        .attr('fill', allowedFill)
        .attr('fill-opacity', 0.15)
        .attr('stroke', ringStroke)
        .attr('stroke-width', 1.5)
        .attr('stroke-dasharray', '3,2');
    }

    // User GPS Accuracy halo & Connecting Line when user position is available
    let pUser: [number, number] | null = null;
    if (hasUserFix) {
      const uLat = userLat as number;
      const uLng = userLng as number;
      pUser = projection([uLng, uLat]) || null;

      if (accuracy && accuracy > 0) {
        const accCircle = d3.geoCircle().center([uLng, uLat]).radius(metersToDegrees(accuracy))();
        mapLayer
          .append('path')
          .datum(accCircle)
          .attr('d', pathGenerator)
          .attr('fill', '#0284c7')
          .attr('fill-opacity', 0.1)
          .attr('stroke', '#0284c7')
          .attr('stroke-width', 1)
          .attr('stroke-opacity', 0.45)
          .attr('stroke-dasharray', '3,3');
      }

      // Geodesic line connecting user GPS to Church Premises
      const linkLine: GeoJSON.LineString = {
        type: 'LineString',
        coordinates: [
          [uLng, uLat],
          [targetLng, targetLat]
        ]
      };

      mapLayer
        .append('path')
        .datum(linkLine)
        .attr('d', pathGenerator)
        .attr('fill', 'none')
        .attr('stroke', allowed ? '#059669' : '#d97706')
        .attr('stroke-width', 2)
        .attr('stroke-dasharray', '5,4')
        .attr('stroke-linecap', 'round');

      if (pUser) {
        const sepPx = Math.hypot(pUser[0] - pTarget[0], pUser[1] - pTarget[1]);
        if (sepPx > 44 && typeof distanceMeters === 'number') {
          const midX = (pUser[0] + pTarget[0]) / 2;
          const midY = (pUser[1] + pTarget[1]) / 2;
          const distText = formatDistanceLabel(distanceMeters);
          const badgeW = Math.max(46, distText.length * 7 + 16);

          const midGroup = mapLayer.append('g').attr('transform', `translate(${midX}, ${midY})`);
          midGroup
            .append('rect')
            .attr('x', -badgeW / 2)
            .attr('y', -10)
            .attr('width', badgeW)
            .attr('height', 20)
            .attr('rx', 6)
            .attr('fill', '#ffffff')
            .attr('stroke', allowed ? '#10b981' : '#f59e0b')
            .attr('stroke-width', 1.25);
          midGroup
            .append('text')
            .attr('text-anchor', 'middle')
            .attr('dominant-baseline', 'central')
            .attr('font-size', '10px')
            .attr('font-weight', '700')
            .attr('font-family', 'ui-monospace, SFMono-Regular, Menlo, monospace')
            .attr('fill', allowed ? '#065f46' : '#92400e')
            .text(distText);
        }
      }
    }

    // Perimeter Radius Label placed on top arc of geofence when circle is large enough
    if (geofencePixelRadius >= 32) {
      const labelY = Math.max(16, pTarget[1] - geofencePixelRadius - 8);
      const radiusLabel = `${radiusMeters} m geofence`;
      const rw = radiusLabel.length * 6.2 + 14;
      const rLabelGroup = mapLayer.append('g').attr('transform', `translate(${pTarget[0]}, ${labelY})`);
      rLabelGroup
        .append('rect')
        .attr('x', -rw / 2)
        .attr('y', -9)
        .attr('width', rw)
        .attr('height', 18)
        .attr('rx', 6)
        .attr('fill', '#ffffff')
        .attr('fill-opacity', 0.94)
        .attr('stroke', '#cbd5e1')
        .attr('stroke-width', 1);
      rLabelGroup
        .append('text')
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'central')
        .attr('font-size', '10px')
        .attr('font-weight', '700')
        .attr('fill', '#334155')
        .text(radiusLabel);
    }

    // Church Premises Marker
    const premisesLabelBelow = pUser ? pUser[1] < pTarget[1] : false;
    const premisesGroup = mapLayer
      .append('g')
      .attr('transform', `translate(${pTarget[0]}, ${pTarget[1]})`)
      .style('cursor', 'pointer')
      .on('click', () => setSelectedMarker(prev => (prev === 'premises' ? null : 'premises')));

    premisesGroup
      .append('circle')
      .attr('r', 13)
      .attr('fill', '#4f46e5')
      .attr('fill-opacity', 0.18);
    premisesGroup
      .append('circle')
      .attr('r', 7.5)
      .attr('fill', '#4f46e5')
      .attr('stroke', '#ffffff')
      .attr('stroke-width', 2.25);
    // Tiny cross inside sanctuary marker
    premisesGroup
      .append('path')
      .attr('d', 'M 0 -3.5 L 0 3.5 M -2.8 -0.8 L 2.8 -0.8')
      .attr('stroke', '#ffffff')
      .attr('stroke-width', 1.4)
      .attr('stroke-linecap', 'round');

    const shortTarget = targetLabel.length > 22 ? `${targetLabel.slice(0, 20)}…` : targetLabel;
    const pTextW = Math.max(76, shortTarget.length * 6.1 + 14);
    const pLabelOffsetY = premisesLabelBelow ? 21 : -21;
    const pLabelG = premisesGroup.append('g').attr('transform', `translate(0, ${pLabelOffsetY})`);
    pLabelG
      .append('rect')
      .attr('x', -pTextW / 2)
      .attr('y', -9.5)
      .attr('width', pTextW)
      .attr('height', 19)
      .attr('rx', 6)
      .attr('fill', '#1e1b4b')
      .attr('fill-opacity', 0.92);
    pLabelG
      .append('text')
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'central')
      .attr('font-size', '10px')
      .attr('font-weight', '700')
      .attr('fill', '#ffffff')
      .text(shortTarget);

    // User Live GPS Marker
    if (pUser) {
      const userGroup = mapLayer
        .append('g')
        .attr('transform', `translate(${pUser[0]}, ${pUser[1]})`)
        .style('cursor', 'pointer')
        .on('click', () => setSelectedMarker(prev => (prev === 'user' ? null : 'user')));

      const uColor = allowed ? '#059669' : '#0284c7';
      userGroup
        .append('circle')
        .attr('r', 12)
        .attr('fill', uColor)
        .attr('fill-opacity', 0.22);
      userGroup
        .append('circle')
        .attr('r', 6.5)
        .attr('fill', uColor)
        .attr('stroke', '#ffffff')
        .attr('stroke-width', 2.25);

      const uLabelOffsetY = premisesLabelBelow ? -20 : 20;
      const uLabelText = 'Your Device';
      const uTextW = uLabelText.length * 6.3 + 14;
      const uLabelG = userGroup.append('g').attr('transform', `translate(0, ${uLabelOffsetY})`);
      uLabelG
        .append('rect')
        .attr('x', -uTextW / 2)
        .attr('y', -9.5)
        .attr('width', uTextW)
        .attr('height', 19)
        .attr('rx', 6)
        .attr('fill', uColor);
      uLabelG
        .append('text')
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'central')
        .attr('font-size', '10px')
        .attr('font-weight', '700')
        .attr('fill', '#ffffff')
        .text(uLabelText);
    }

    // Calibrated Geographic Scale Bar (fixed overlay)
    const sampleDeltaDeg = 0.001;
    const pA = projection([targetLng, targetLat]);
    const pB = projection([targetLng + sampleDeltaDeg, targetLat]);
    const overlayGroup = svg.append('g').attr('class', 'geofence-hud');

    if (pA && pB) {
      const pxDist = Math.hypot(pB[0] - pA[0], pB[1] - pA[1]);
      const geoDistMeters = d3.geoDistance([targetLng, targetLat], [targetLng + sampleDeltaDeg, targetLat]) * EARTH_RADIUS_METERS;
      const pxPerMeter = geoDistMeters > 0 ? pxDist / geoDistMeters : 0;

      if (pxPerMeter > 0) {
        const updateScaleBar = (k: number) => {
          overlayGroup.selectAll('.scale-bar-g').remove();
          const desiredMaxPx = 92;
          const niceMeters = chooseNiceScaleMeters(desiredMaxPx / (pxPerMeter * k));
          const barPx = Math.min(120, Math.max(24, niceMeters * pxPerMeter * k));
          const label = niceMeters >= 1000 ? `${niceMeters / 1000} km` : `${niceMeters} m`;

          const sb = overlayGroup
            .append('g')
            .attr('class', 'scale-bar-g')
            .attr('transform', `translate(12, ${height - 14})`);

          sb.append('rect')
            .attr('x', -4)
            .attr('y', -18)
            .attr('width', barPx + 10)
            .attr('height', 22)
            .attr('rx', 5)
            .attr('fill', '#ffffff')
            .attr('fill-opacity', 0.9)
            .attr('stroke', '#e2e8f0')
            .attr('stroke-width', 1);

          sb.append('path')
            .attr('d', `M 0 -5 L 0 0 L ${barPx} 0 L ${barPx} -5`)
            .attr('fill', 'none')
            .attr('stroke', '#334155')
            .attr('stroke-width', 1.5);

          sb.append('text')
            .attr('x', barPx / 2)
            .attr('y', -8)
            .attr('text-anchor', 'middle')
            .attr('font-size', '9.5px')
            .attr('font-weight', '700')
            .attr('font-family', 'ui-monospace, SFMono-Regular, Menlo, monospace')
            .attr('fill', '#334155')
            .text(label);
        };

        updateScaleBar(1);

        // Configure D3 zoom/pan behavior
        const zoom = d3
          .zoom<SVGSVGElement, unknown>()
          .scaleExtent([0.65, 10])
          .on('zoom', event => {
            mapLayer.attr('transform', event.transform.toString());
            setZoomScale(Number(event.transform.k.toFixed(2)));
            updateScaleBar(event.transform.k);
          });

        zoomBehaviorRef.current = zoom;
        svg.call(zoom).on('dblclick.zoom', null);
        setZoomScale(1);
      }
    }

    // North Compass Indicator (top-left)
    const compass = overlayGroup.append('g').attr('transform', 'translate(22, 22)');
    compass
      .append('circle')
      .attr('r', 12)
      .attr('fill', '#ffffff')
      .attr('fill-opacity', 0.92)
      .attr('stroke', '#cbd5e1')
      .attr('stroke-width', 1);
    compass
      .append('text')
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'central')
      .attr('font-size', '10px')
      .attr('font-weight', '800')
      .attr('fill', '#1e293b')
      .text('N');
  }, [
    svgWidth,
    height,
    targetLat,
    targetLng,
    targetLabel,
    radiusMeters,
    userLat,
    userLng,
    accuracy,
    distanceMeters,
    allowed,
    phase,
    hasUserFix,
    focusMode,
    isFarOutside
  ]);

  const handleZoomStep = (factor: number) => {
    const svgEl = svgRef.current;
    const zoom = zoomBehaviorRef.current;
    if (!svgEl || !zoom) return;
    d3.select(svgEl).transition().duration(180).call(zoom.scaleBy, factor);
  };

  const handleResetZoom = () => {
    const svgEl = svgRef.current;
    const zoom = zoomBehaviorRef.current;
    if (!svgEl || !zoom) return;
    d3.select(svgEl).transition().duration(200).call(zoom.transform, d3.zoomIdentity);
  };

  const bearingLabel = useMemo(() => {
    if (!hasUserFix) return null;
    return computeCompassBearing(userLat as number, userLng as number, targetLat, targetLng);
  }, [hasUserFix, userLat, userLng, targetLat, targetLng]);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
      {/* Compact Map Header Bar */}
      <div className="px-3.5 py-2.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2 min-w-0">
          <LocateFixed size={14} className="text-indigo-600 shrink-0" />
          <span className="font-bold text-slate-900 truncate">
            Live Geofence Spatial Map
          </span>
          <span className="text-slate-400" aria-hidden="true">·</span>
          <span className="font-mono font-semibold text-slate-600 tabular-nums shrink-0">
            {radiusMeters} m radius
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {isFarOutside && (
            <button
              type="button"
              onClick={() => setFocusMode(prev => (prev === 'both' ? 'premises' : 'both'))}
              className="min-h-[28px] px-2.5 py-1 rounded-lg bg-white hover:bg-indigo-50 border border-slate-200 text-indigo-700 font-semibold text-[11px] cursor-pointer transition-colors inline-flex items-center gap-1 whitespace-nowrap"
            >
              <Maximize2 size={11} />
              <span>{focusMode === 'both' ? 'Zoom Premises' : 'Show Both'}</span>
            </button>
          )}
          <div className="inline-flex items-center rounded-lg border border-slate-200 bg-white overflow-hidden">
            <button
              type="button"
              onClick={() => handleZoomStep(1.4)}
              aria-label="Zoom in map"
              className="w-7 h-7 flex items-center justify-center text-slate-600 hover:bg-slate-100 cursor-pointer"
            >
              <Plus size={13} />
            </button>
            <button
              type="button"
              onClick={() => handleZoomStep(0.7)}
              aria-label="Zoom out map"
              className="w-7 h-7 flex items-center justify-center text-slate-600 hover:bg-slate-100 border-l border-slate-200 cursor-pointer"
            >
              <Minus size={13} />
            </button>
            {zoomScale !== 1 && (
              <button
                type="button"
                onClick={handleResetZoom}
                aria-label="Reset map view"
                className="w-7 h-7 flex items-center justify-center text-indigo-700 hover:bg-indigo-50 border-l border-slate-200 cursor-pointer"
                title="Reset Zoom"
              >
                <RotateCcw size={12} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* D3 SVG Canvas */}
      <div ref={containerRef} className="relative w-full bg-slate-50">
        <svg
          ref={svgRef}
          width={svgWidth}
          height={height}
          viewBox={`0 0 ${svgWidth} ${height}`}
          role="img"
          aria-label={`D3 geofence map showing device GPS position relative to ${targetLabel} (${radiusMeters} meter perimeter)`}
          className="block w-full select-none touch-none"
        />

        {phase === 'verifying' && !hasUserFix && (
          <div className="absolute bottom-3 right-3 px-2.5 py-1 rounded-lg bg-white/95 border border-indigo-200 text-[11px] font-semibold text-indigo-700 shadow-xs">
            Locking device GPS coordinates...
          </div>
        )}

        {selectedMarker && (
          <div className="absolute top-3 right-3 max-w-[230px] px-3 py-2 rounded-xl bg-white/95 border border-slate-200 shadow-sm text-[11px] space-y-0.5">
            <p className="font-bold text-slate-900">
              {selectedMarker === 'user' ? 'Your Current GPS Fix' : targetLabel}
            </p>
            <p className="font-mono text-slate-600 tabular-nums">
              {selectedMarker === 'user' && hasUserFix
                ? `${(userLat as number).toFixed(5)}, ${(userLng as number).toFixed(5)}`
                : `${targetLat.toFixed(5)}, ${targetLng.toFixed(5)}`}
            </p>
            {selectedMarker === 'user' && accuracy ? (
              <p className="text-slate-500 tabular-nums">Accuracy: ±{accuracy} m</p>
            ) : selectedMarker === 'premises' ? (
              <p className="text-slate-500">
                {targetSource === 'event' ? 'Event Venue Pin' : 'Church Profile Sanctuary Pin'}
              </p>
            ) : null}
          </div>
        )}
      </div>

      {/* Legend & Spatial Readout Footer */}
      <div className="px-3.5 py-2.5 bg-white border-t border-slate-100 flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 text-[11px] text-slate-600">
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1.5 font-medium">
            <span className="w-2.5 h-2.5 rounded-full bg-indigo-600 shrink-0" />
            <span>Church Premises</span>
          </span>
          {hasUserFix && (
            <span className="inline-flex items-center gap-1.5 font-medium">
              <span
                className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                  allowed ? 'bg-emerald-600' : 'bg-sky-600'
                }`}
              />
              <span>Your Location</span>
            </span>
          )}
          <span className="inline-flex items-center gap-1.5 font-medium">
            <span
              className={`w-2.5 h-2.5 rounded-full border shrink-0 ${
                allowed
                  ? 'bg-emerald-500/20 border-emerald-600'
                  : 'bg-amber-500/20 border-amber-600'
              }`}
            />
            <span className="tabular-nums">{radiusMeters} m Perimeter</span>
          </span>
        </div>

        {hasUserFix && typeof distanceMeters === 'number' && (
          <div className="font-mono font-semibold text-slate-700 tabular-nums">
            {formatDistanceLabel(distanceMeters)} {bearingLabel ? `(${bearingLabel})` : ''}
          </div>
        )}
      </div>
    </div>
  );
};

export default GeofenceD3Map;
