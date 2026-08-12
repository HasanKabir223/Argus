import React, { useEffect, useRef, useState, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { CHECKPOINTS, type Match } from '../data/mockData';
import 'leaflet/dist/leaflet.css';
import { Crosshair, Layers, Navigation, ShieldAlert, Sparkles, UserCheck, Globe, MapPin } from 'lucide-react';

interface MapViewProps {
  matches: Match[];
  selectedPersonId: string | null;
  onSelectCheckpoint: (checkpointId: string) => void;
  onSelectMatch?: (matchId: string) => void;
}

type MapLayerType = 'dark_hd' | 'satellite_hd' | 'cyber_hd';

const LAYER_CONFIGS: Record<MapLayerType, { name: string; url: string; attribution: string; subdomains?: string[] }> = {
  dark_hd: {
    name: 'TACTICAL DARK HD',
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
    attribution: '&copy; <a href="https://carto.com/">CARTO</a> &copy; OpenStreetMap',
    subdomains: ['a', 'b', 'c', 'd']
  },
  satellite_hd: {
    name: 'SATELLITE RECON HD',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: '&copy; Esri, Maxar, Earthstar Geographics'
  },
  cyber_hd: {
    name: 'CYBER MATRIX HD',
    url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png',
    attribution: '&copy; CARTO &copy; OpenStreetMap',
    subdomains: ['a', 'b', 'c', 'd']
  }
};

interface DispersedSighting {
  match: Match;
  originalLat: number;
  originalLng: number;
  dispersedLat: number;
  dispersedLng: number;
  checkpointName: string;
  checkpointCity: string;
  checkpointState: string;
  checkpointId: string;
  isTrajectoryNode?: boolean;
  orderIndex?: number;
}

/**
 * Creates custom high-definition SVG Leaflet icons with pulsing radar rings
 */
function createCheckpointIcon(status: 'alert' | 'confirmed' | 'idle', name: string, city: string, state: string, activeCount: number) {
  let primaryColor = '#3D4759'; // --accent-muted
  let pulseClass = '';
  let glowFilter = '';

  if (status === 'alert') {
    primaryColor = '#FF4757'; // --accent-alert
    pulseClass = 'tactical-marker-alert';
    glowFilter = 'drop-shadow(0 0 8px rgba(255, 71, 87, 0.8))';
  } else if (status === 'confirmed') {
    primaryColor = '#00D9A3'; // --accent-signal
    pulseClass = 'tactical-marker-signal';
    glowFilter = 'drop-shadow(0 0 8px rgba(0, 217, 163, 0.8))';
  }

  const svgHtml = `
    <div style="position: relative; width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; cursor: pointer;">
      <!-- Outer Concentric Radar Ring -->
      <div class="${pulseClass}" style="
        position: absolute;
        width: 36px;
        height: 36px;
        border-radius: 50%;
        border: 1.5px solid ${primaryColor};
        background: rgba(18, 22, 31, 0.65);
        box-sizing: border-box;
      "></div>
      
      <!-- Inner Reticle Core -->
      <svg width="22" height="22" viewBox="0 0 22 22" style="position: relative; z-index: 2; filter: ${glowFilter};">
        <circle cx="11" cy="11" r="5.5" fill="${primaryColor}" stroke="#0A0E14" stroke-width="1.5" />
        <circle cx="11" cy="11" r="1.5" fill="#FFFFFF" />
        <line x1="11" y1="1" x2="11" y2="4" stroke="${primaryColor}" stroke-width="1.5" stroke-linecap="round" />
        <line x1="11" y1="18" x2="11" y2="21" stroke="${primaryColor}" stroke-width="1.5" stroke-linecap="round" />
        <line x1="1" y1="11" x2="4" y2="11" stroke="${primaryColor}" stroke-width="1.5" stroke-linecap="round" />
        <line x1="18" y1="11" x2="21" y2="11" stroke="${primaryColor}" stroke-width="1.5" stroke-linecap="round" />
      </svg>
      
      <!-- Checkpoint Label -->
      <div style="
        position: absolute;
        top: 34px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(10, 14, 20, 0.94);
        border: 1px solid var(--border-hairline, #262D3A);
        color: #E8ECF1;
        font-family: 'IBM Plex Mono', monospace;
        font-size: 10px;
        font-weight: 600;
        padding: 2px 7px;
        border-radius: 2px;
        white-space: nowrap;
        pointer-events: none;
        box-shadow: 0 4px 14px rgba(0,0,0,0.85);
        letter-spacing: 0.02em;
        display: flex;
        align-items: center;
        gap: 5px;
        z-index: 10;
      ">
        <span style="color: var(--accent-signal); font-weight: 700;">${city || state}:</span>
        <span>${name}</span>
        ${activeCount > 0 ? `<span style="color: ${primaryColor}; font-weight: 800;">[${activeCount}]</span>` : ''}
      </div>
    </div>
  `;

  return L.divIcon({
    html: svgHtml,
    className: 'custom-tactical-pin',
    iconSize: [40, 40],
    iconAnchor: [20, 20],
    popupAnchor: [0, -20]
  });
}

function createSuspectSightingIcon(match: Match, isSelected: boolean, orderIndex?: number, isTrajectory?: boolean) {
  const isConfirmed = match.status === 'CONFIRMED';
  const ringColor = isConfirmed ? '#00D9A3' : '#FF4757';
  const imgUrl = match.faceCropUrl || match.referencePhotoUrl || 'http://localhost:8000/static/gallery/placeholder.jpg';

  const orderBadge = isTrajectory && orderIndex !== undefined
    ? `<div style="position: absolute; top: -6px; right: -6px; background: ${ringColor}; color: #0A0E14; font-family: 'IBM Plex Mono', monospace; font-size: 9px; font-weight: 800; padding: 1px 5px; border-radius: 10px; z-index: 10; box-shadow: 0 0 6px rgba(0,0,0,0.8);">#${orderIndex + 1}</div>`
    : '';

  const svgHtml = `
    <div style="position: relative; width: 64px; height: 64px; display: flex; align-items: center; justify-content: center; cursor: pointer;">
      <!-- Glowing Pulse Radar Ring -->
      <div style="
        position: absolute;
        width: 58px;
        height: 58px;
        border-radius: 50%;
        border: 2px solid ${ringColor};
        background: ${isConfirmed ? 'rgba(0, 217, 163, 0.22)' : 'rgba(255, 71, 87, 0.25)'};
        animation: pulse 1.6s infinite;
        box-sizing: border-box;
      "></div>

      <!-- Inner Face Mugshot Avatar -->
      <div style="
        position: relative;
        width: 46px;
        height: 46px;
        border-radius: 50%;
        border: 2px solid ${ringColor};
        overflow: hidden;
        background: #06090E;
        box-shadow: 0 0 18px ${ringColor}90;
        z-index: 4;
      ">
        <img src="${imgUrl}" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.style.display='none'" />
      </div>

      ${orderBadge}

      <!-- Tactical Reticle Crosshairs -->
      <div style="position: absolute; top: -3px; left: 50%; transform: translateX(-50%); width: 2px; height: 7px; background: ${ringColor}; z-index: 5;"></div>
      <div style="position: absolute; bottom: -3px; left: 50%; transform: translateX(-50%); width: 2px; height: 7px; background: ${ringColor}; z-index: 5;"></div>
      <div style="position: absolute; left: -3px; top: 50%; transform: translateY(-50%); width: 7px; height: 2px; background: ${ringColor}; z-index: 5;"></div>
      <div style="position: absolute; right: -3px; top: 50%; transform: translateY(-50%); width: 7px; height: 2px; background: ${ringColor}; z-index: 5;"></div>

      <!-- Suspect Name & Confidence Pill Tag -->
      <div style="
        position: absolute;
        bottom: -22px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(10, 14, 20, 0.96);
        border: 1px solid ${ringColor};
        color: #FFFFFF;
        font-family: 'IBM Plex Mono', monospace;
        font-size: 10px;
        font-weight: 700;
        padding: 2px 7px;
        border-radius: 2px;
        white-space: nowrap;
        pointer-events: none;
        box-shadow: 0 4px 14px rgba(0,0,0,0.9);
        display: flex;
        align-items: center;
        gap: 5px;
        z-index: 6;
      ">
        <span>${match.name}</span>
        <span style="color: ${ringColor}; font-weight: 800;">${Math.round(match.confidence * 100)}%</span>
      </div>
    </div>
  `;

  return L.divIcon({
    html: svgHtml,
    className: 'custom-suspect-sighting-pin',
    iconSize: [64, 64],
    iconAnchor: [32, 32],
    popupAnchor: [0, -32]
  });
}

/**
 * Controller handling user interactions and USA nationwide bounds fit.
 */
const MapController: React.FC<{
  selectedPersonId: string | null;
  matches: Match[];
  onCoordsChange: (lat: number, lng: number, zoom: number) => void;
}> = ({ selectedPersonId, matches, onCoordsChange }) => {
  const map = useMap();
  const prevSelectedPersonRef = useRef<string | null>(null);
  const isInitialFitDone = useRef(false);

  // Initial bounds fit on mount to show the entire USA nationwide network
  useEffect(() => {
    const timer = setTimeout(() => {
      map.invalidateSize();
      if (!isInitialFitDone.current) {
        // Continental US Bounds (NYC to LA, Seattle to Miami)
        const continentalBounds = CHECKPOINTS
          .filter(cp => cp.state !== 'HI') // Exclude Hawaii for initial tight continental framing
          .map(cp => [cp.lat, cp.lng]) as [number, number][];
        map.fitBounds(continentalBounds, { padding: [60, 60], maxZoom: 5.5, animate: false });
        isInitialFitDone.current = true;
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [map]);

  useMapEvents({
    mousemove(e) {
      onCoordsChange(e.latlng.lat, e.latlng.lng, map.getZoom());
    },
    zoomend() {
      const center = map.getCenter();
      onCoordsChange(center.lat, center.lng, map.getZoom());
    }
  });

  // Track selected person trajectory
  useEffect(() => {
    if (prevSelectedPersonRef.current === selectedPersonId) {
      return;
    }
    prevSelectedPersonRef.current = selectedPersonId;

    if (selectedPersonId) {
      const personMatches = matches
        .filter(m => m.personId === selectedPersonId)
        .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
      
      if (personMatches.length > 0) {
        if (personMatches.length > 1) {
          const personCps = personMatches
            .map(m => CHECKPOINTS.find(c => c.id === m.checkpointId))
            .filter(Boolean)
            .map(cp => [cp!.lat, cp!.lng]) as [number, number][];
          if (personCps.length > 1) {
            map.flyToBounds(personCps, { padding: [80, 80], duration: 1.4 });
            return;
          }
        }
        const lastCp = CHECKPOINTS.find(c => c.id === personMatches[personMatches.length - 1].checkpointId);
        if (lastCp) {
          map.flyTo([lastCp.lat, lastCp.lng], 9, { duration: 1.2, easeLinearity: 0.25 });
        }
      }
    }
  }, [selectedPersonId, matches, map]);

  return null;
};

export const MapView: React.FC<MapViewProps> = ({ matches, selectedPersonId, onSelectCheckpoint, onSelectMatch }) => {
  // Center of the United States
  const usCenter: [number, number] = [38.8283, -98.5795];
  const [activeLayer, setActiveLayer] = useState<MapLayerType>('dark_hd');
  const [showLayerSelector, setShowLayerSelector] = useState(false);
  const [dispersionMode, setDispersionMode] = useState<'orbital' | 'wide'>('orbital');
  const [hudCoords, setHudCoords] = useState<{ lat: number; lng: number; zoom: number }>({
    lat: 38.8283,
    lng: -98.5795,
    zoom: 4.5
  });

  const mapInstanceRef = useRef<L.Map | null>(null);

  /**
   * ─── USA Nationwide Radial Dispersion & Sighting Deduplication Engine ────
   * Scales radius proportionally for nationwide map zoom vs local zoom.
   */
  const dispersedSightings = useMemo<DispersedSighting[]>(() => {
    let targetMatches: Match[] = [];

    if (selectedPersonId) {
      // Show full chronological nationwide trajectory for selected suspect
      targetMatches = matches
        .filter(m => m.personId === selectedPersonId)
        .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    } else {
      // Global USA View: 1 latest verified sighting per unique suspect across all US hubs
      const latestPerPerson = new Map<string, Match>();
      const sorted = [...matches].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
      for (const m of sorted) {
        if (!latestPerPerson.has(m.personId)) {
          latestPerPerson.set(m.personId, m);
        }
      }
      targetMatches = Array.from(latestPerPerson.values());
    }

    // Group target matches by checkpoint ID
    const byCheckpoint = new Map<string, Match[]>();
    for (const m of targetMatches) {
      const cpId = m.checkpointId || 'cp-01';
      if (!byCheckpoint.has(cpId)) byCheckpoint.set(cpId, []);
      byCheckpoint.get(cpId)!.push(m);
    }

    const dispersedList: DispersedSighting[] = [];
    const radiusMultiplier = dispersionMode === 'wide' ? 1.6 : 1.0;

    byCheckpoint.forEach((cpMatches, cpId) => {
      const cp = CHECKPOINTS.find(c => c.id === cpId) || CHECKPOINTS[0];
      const count = cpMatches.length;

      if (count === 1) {
        // Single suspect: clean offset North-East of metropolitan hub
        const singleOffsetLat = 0.45 * radiusMultiplier;
        const singleOffsetLng = 0.65 * radiusMultiplier;
        dispersedList.push({
          match: cpMatches[0],
          originalLat: cp.lat,
          originalLng: cp.lng,
          dispersedLat: cp.lat + singleOffsetLat,
          dispersedLng: cp.lng + singleOffsetLng,
          checkpointName: cp.name,
          checkpointCity: cp.city,
          checkpointState: cp.state,
          checkpointId: cp.id,
          isTrajectoryNode: Boolean(selectedPersonId),
          orderIndex: 0
        });
      } else {
        // Multiple suspects: Nationwide Orbital Golden Compass
        const baseRadius = 0.85 * radiusMultiplier; // ~85km nationwide offset radius
        
        cpMatches.forEach((m, idx) => {
          const ring = Math.floor(idx / 6);
          const ringIdx = idx % 6;
          const ringTotal = Math.min(count - ring * 6, 6);
          const radius = baseRadius + ring * (0.6 * radiusMultiplier);

          // Angle around perimeter, staggered across rings to maximize separation
          const angle = ((2 * Math.PI * ringIdx) / ringTotal) + (ring * (Math.PI / 6)) + (Math.PI / 4);

          const latOffset = radius * Math.sin(angle);
          const lngOffset = (radius * Math.cos(angle)) / 0.82; // Longitude aspect ratio correction

          dispersedList.push({
            match: m,
            originalLat: cp.lat,
            originalLng: cp.lng,
            dispersedLat: cp.lat + latOffset,
            dispersedLng: cp.lng + lngOffset,
            checkpointName: cp.name,
            checkpointCity: cp.city,
            checkpointState: cp.state,
            checkpointId: cp.id,
            isTrajectoryNode: Boolean(selectedPersonId),
            orderIndex: idx
          });
        });
      }
    });

    return dispersedList;
  }, [matches, selectedPersonId, dispersionMode]);

  const pathPositions: [number, number][] = useMemo(() => {
    if (!selectedPersonId) return [];
    return dispersedSightings.map(s => [s.dispersedLat, s.dispersedLng]);
  }, [dispersedSightings, selectedPersonId]);

  const handleResetOverview = () => {
    if (mapInstanceRef.current) {
      const continentalBounds = CHECKPOINTS
        .filter(cp => cp.state !== 'HI')
        .map(cp => [cp.lat, cp.lng]) as [number, number][];
      mapInstanceRef.current.flyToBounds(continentalBounds, { padding: [60, 60], duration: 1.2 });
    }
  };

  const currentLayerConfig = LAYER_CONFIGS[activeLayer];
  const hasActiveMatches = matches.length > 0;

  return (
    <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 1, backgroundColor: '#0A0E14' }}>
      {!hasActiveMatches && (
        <div style={{
          position: 'absolute',
          top: '24px',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 40,
          padding: '8px 16px',
          backgroundColor: 'rgba(18, 22, 31, 0.85)',
          border: '1px solid var(--border-hairline)',
          color: 'var(--text-secondary)',
          fontFamily: "'IBM Plex Mono', monospace",
          fontSize: '0.75rem',
          textAlign: 'center',
          pointerEvents: 'none'
        }}>
          USA Homeland Surveillance Grid Live. 15 Strategic Hubs Monitoring.
        </div>
      )}

      <MapContainer
        center={usCenter}
        zoom={4.5}
        minZoom={3}
        maxZoom={18}
        zoomSnap={0.5}
        zoomDelta={0.5}
        wheelPxPerZoomLevel={100}
        ref={(m) => { if (m) mapInstanceRef.current = m; }}
        style={{ width: '100%', height: '100%', background: '#0A0E14' }}
        zoomControl={false}
        attributionControl={true}
      >
        {/* High-Definition Tile Layer */}
        <TileLayer
          key={activeLayer}
          url={currentLayerConfig.url}
          attribution={currentLayerConfig.attribution}
          subdomains={currentLayerConfig.subdomains || []}
          maxZoom={19}
          maxNativeZoom={18}
          keepBuffer={8}
          updateWhenIdle={false}
          updateWhenZooming={false}
          className="hd-crisp-tile"
        />

        <MapController
          selectedPersonId={selectedPersonId}
          matches={matches}
          onCoordsChange={(lat, lng, zoom) => setHudCoords({ lat, lng, zoom })}
        />

        {/* Tactical Tracer Anchor Lines connecting each suspect to their parent Checkpoint Hub */}
        {dispersedSightings.map((s, idx) => {
          const isConfirmed = s.match.status === 'CONFIRMED';
          const lineColor = isConfirmed ? '#00D9A3' : '#FF4757';
          return (
            <Polyline
              key={`anchor-line-${s.match.id}-${idx}`}
              positions={[[s.originalLat, s.originalLng], [s.dispersedLat, s.dispersedLng]]}
              pathOptions={{
                color: lineColor,
                weight: 1.5,
                dashArray: '4, 6',
                opacity: 0.6
              }}
            />
          );
        })}

        {/* Animated Flight Path / Trajectory Polyline Trail across USA states when a suspect is selected */}
        {pathPositions.length > 1 && (
          <>
            {/* Outer Glow Trail */}
            <Polyline
              positions={pathPositions}
              pathOptions={{
                color: '#00D9A3',
                weight: 6,
                opacity: 0.35,
                lineCap: 'round',
                lineJoin: 'round'
              }}
            />
            {/* Core Animated Trail */}
            <Polyline
              positions={pathPositions}
              pathOptions={{
                color: '#00D9A3',
                weight: 2.5,
                dashArray: '8 8',
                opacity: 0.95,
                lineCap: 'round'
              }}
            />
          </>
        )}

        {/* High-Definition Checkpoint Markers Across All 15 USA Strategic Hubs */}
        {CHECKPOINTS.map(cp => {
          const cpMatches = matches.filter(m => m.checkpointId === cp.id);
          const hasRecentAlert = cpMatches.some(m => m.status === 'PENDING REVIEW');
          const hasConfirmed = cpMatches.some(m => m.status === 'CONFIRMED');

          let status: 'alert' | 'confirmed' | 'idle' = 'idle';
          if (hasRecentAlert) status = 'alert';
          else if (hasConfirmed) status = 'confirmed';

          const icon = createCheckpointIcon(status, cp.name, cp.city, cp.state, cpMatches.length);

          return (
            <Marker
              key={cp.id}
              position={[cp.lat, cp.lng]}
              icon={icon}
              eventHandlers={{
                click: () => onSelectCheckpoint(cp.id),
              }}
            >
              <Popup className="tactical-popup">
                <div style={{
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontSize: '11px',
                  backgroundColor: 'var(--bg-panel, #12161F)',
                  color: 'var(--text-primary, #E8ECF1)',
                  padding: '10px 12px',
                  border: '1px solid var(--border-hairline, #262D3A)',
                  minWidth: '200px'
                }}>
                  <div style={{ fontWeight: 700, color: 'var(--accent-signal, #00D9A3)', marginBottom: '2px' }}>
                    {cp.city}, {cp.state}
                  </div>
                  <div style={{ color: 'var(--text-primary)', fontSize: '11px', marginBottom: '6px' }}>
                    {cp.name}
                  </div>
                  <div style={{ color: 'var(--text-secondary, #8892A0)', fontSize: '10px', marginBottom: '6px' }}>
                    COORD: {cp.lat.toFixed(4)}°N, {Math.abs(cp.lng).toFixed(4)}°W
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '4px', borderTop: '1px solid #222' }}>
                    <span>HOMELAND DETECTIONS:</span>
                    <strong style={{ color: cpMatches.length > 0 ? 'var(--accent-signal, #00D9A3)' : 'var(--text-secondary, #8892A0)' }}>
                      {cpMatches.length} LOGGED
                    </strong>
                  </div>
                </div>
              </Popup>
            </Marker>
          );
        })}

        {/* Radially Dispersed Suspect Sighting Markers Across Nationwide USA Hubs */}
        {dispersedSightings.map((s, idx) => {
          const isSelected = selectedPersonId === s.match.personId;
          const suspectIcon = createSuspectSightingIcon(s.match, isSelected, s.orderIndex, s.isTrajectoryNode);

          return (
            <Marker
              key={`dispersed-suspect-${s.match.id}-${idx}`}
              position={[s.dispersedLat, s.dispersedLng]}
              icon={suspectIcon}
              zIndexOffset={isSelected ? 1000 : 500}
              eventHandlers={{
                click: () => {
                  if (onSelectMatch) onSelectMatch(s.match.id);
                  if (onSelectCheckpoint && s.checkpointId) onSelectCheckpoint(s.checkpointId);
                }
              }}
            >
              <Popup className="tactical-popup">
                <div style={{
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontSize: '11px',
                  backgroundColor: 'var(--bg-panel, #12161F)',
                  color: 'var(--text-primary, #E8ECF1)',
                  padding: '10px',
                  border: s.match.status === 'CONFIRMED' ? '1px solid var(--accent-signal)' : '1px solid var(--accent-alert)',
                  minWidth: '220px'
                }}>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
                    <img
                      src={s.match.faceCropUrl || s.match.referencePhotoUrl}
                      alt={s.match.name}
                      style={{ width: '44px', height: '44px', objectFit: 'cover', border: '1px solid #333' }}
                      onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                    />
                    <div>
                      <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{s.match.name}</div>
                      <div style={{ fontSize: '10px', color: s.match.status === 'CONFIRMED' ? 'var(--accent-signal)' : 'var(--accent-alert)' }}>
                        {s.match.status} // {Math.round(s.match.confidence * 100)}%
                      </div>
                    </div>
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>
                    METROPOLITAN SECTOR: <span style={{ color: 'var(--text-primary)' }}>{s.checkpointCity}, {s.checkpointState}</span>
                  </div>
                  <div style={{ fontSize: '9px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                    FACILITY: {s.checkpointName}
                  </div>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>

      {/* Tactical Map Overlay HUD & Controls */}
      <div style={{
        position: 'absolute',
        top: '72px',
        left: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        zIndex: 50
      }}>
        {/* Layer Selector Toggle */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setShowLayerSelector(!showLayerSelector)}
            className="button"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: 'rgba(18, 22, 31, 0.92)',
              backdropFilter: 'blur(6px)',
              padding: '6px 12px',
              fontSize: '0.72rem',
              fontFamily: "'IBM Plex Mono', monospace"
            }}
          >
            <Layers size={13} color="var(--accent-signal)" />
            <span>{currentLayerConfig.name}</span>
          </button>

          {showLayerSelector && (
            <div style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              marginTop: '4px',
              backgroundColor: 'var(--bg-panel)',
              border: '1px solid var(--border-hairline)',
              display: 'flex',
              flexDirection: 'column',
              zIndex: 100,
              boxShadow: '0 12px 24px rgba(0,0,0,0.7)'
            }}>
              {(Object.keys(LAYER_CONFIGS) as MapLayerType[]).map(layerKey => (
                <button
                  key={layerKey}
                  onClick={() => {
                    setActiveLayer(layerKey);
                    setShowLayerSelector(false);
                  }}
                  style={{
                    background: activeLayer === layerKey ? 'var(--bg-panel-raised)' : 'transparent',
                    color: activeLayer === layerKey ? 'var(--accent-signal)' : 'var(--text-primary)',
                    border: 'none',
                    padding: '8px 14px',
                    textAlign: 'left',
                    fontFamily: "'IBM Plex Mono', monospace",
                    fontSize: '0.72rem',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {LAYER_CONFIGS[layerKey].name}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Dispersion Mode Toggle */}
        <button
          onClick={() => setDispersionMode(prev => prev === 'orbital' ? 'wide' : 'orbital')}
          className="button"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            backgroundColor: 'rgba(18, 22, 31, 0.92)',
            backdropFilter: 'blur(6px)',
            padding: '6px 12px',
            fontSize: '0.72rem',
            fontFamily: "'IBM Plex Mono', monospace",
            color: dispersionMode === 'wide' ? 'var(--accent-signal)' : 'var(--text-primary)',
            border: `1px solid ${dispersionMode === 'wide' ? 'var(--accent-signal)' : 'var(--border-hairline)'}`
          }}
          title="Toggle Wide Regional Radial Dispersion"
        >
          <Sparkles size={13} color="var(--accent-signal)" />
          <span>RADIAL SPREAD: {dispersionMode.toUpperCase()}</span>
        </button>

        {/* Reset Overview Camera Button to Continental USA */}
        <button
          onClick={handleResetOverview}
          className="button"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            backgroundColor: 'rgba(18, 22, 31, 0.92)',
            backdropFilter: 'blur(6px)',
            padding: '6px 12px',
            fontSize: '0.72rem',
            fontFamily: "'IBM Plex Mono', monospace"
          }}
        >
          <Globe size={13} color="var(--accent-signal)" />
          <span>CONTINENTAL USA OVERVIEW</span>
        </button>

        {/* Selected Suspect Trajectory Mode Active Pill */}
        {selectedPersonId && (
          <div style={{
            backgroundColor: 'rgba(0, 217, 163, 0.15)',
            border: '1px solid var(--accent-signal)',
            color: 'var(--accent-signal)',
            padding: '6px 10px',
            fontSize: '0.7rem',
            fontFamily: "'IBM Plex Mono', monospace",
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}>
            <UserCheck size={13} />
            <span>INTERSTATE TRAJECTORY // {dispersedSightings.length} SIGHTINGS</span>
          </div>
        )}
      </div>

      {/* Real-Time Tactical Coordinates & Telemetry HUD */}
      <div style={{
        position: 'absolute',
        bottom: '80px',
        left: '16px',
        zIndex: 50,
        backgroundColor: 'rgba(10, 14, 20, 0.90)',
        border: '1px solid var(--border-hairline)',
        padding: '6px 14px',
        fontFamily: "'IBM Plex Mono', monospace",
        fontSize: '0.68rem',
        color: 'var(--text-secondary)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        gap: '16px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.6)'
      }}>
        <div>SECTOR: <span style={{ color: 'var(--accent-signal)' }}>UNITED STATES (HOMELAND)</span></div>
        <div>LAT: <span style={{ color: 'var(--accent-signal)' }}>{hudCoords.lat.toFixed(4)}°N</span></div>
        <div>LNG: <span style={{ color: 'var(--accent-signal)' }}>{Math.abs(hudCoords.lng).toFixed(4)}°W</span></div>
        <div>OPTICAL ZOOM: <span style={{ color: 'var(--accent-signal)' }}>{hudCoords.zoom.toFixed(1)}x</span></div>
        <div>ACTIVE HUBS: <span style={{ color: 'var(--text-primary)' }}>{CHECKPOINTS.length} CITIES</span></div>
      </div>
    </div>
  );
};