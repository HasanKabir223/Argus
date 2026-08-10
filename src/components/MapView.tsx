import React, { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { CHECKPOINTS, type Match } from '../data/mockData';
import 'leaflet/dist/leaflet.css';
import { Crosshair, Layers, Navigation } from 'lucide-react';

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

/**
 * Creates custom high-definition SVG Leaflet icons with pulsing radar rings
 */
function createCheckpointIcon(status: 'alert' | 'confirmed' | 'idle', name: string) {
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
    <div style="position: relative; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; cursor: pointer;">
      <!-- Outer Concentric Radar Ring -->
      <div class="${pulseClass}" style="
        position: absolute;
        width: 32px;
        height: 32px;
        border-radius: 50%;
        border: 1.5px solid ${primaryColor};
        background: rgba(18, 22, 31, 0.6);
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
        top: 32px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(10, 14, 20, 0.88);
        border: 1px solid var(--border-hairline, #262D3A);
        color: #E8ECF1;
        font-family: 'IBM Plex Mono', monospace;
        font-size: 10px;
        padding: 2px 6px;
        border-radius: 2px;
        white-space: nowrap;
        pointer-events: none;
        box-shadow: 0 4px 12px rgba(0,0,0,0.6);
        letter-spacing: 0.02em;
      ">
        ${name}
      </div>
    </div>
  `;

  return L.divIcon({
    html: svgHtml,
    className: 'custom-tactical-pin',
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    popupAnchor: [0, -18]
  });
}

function createSuspectSightingIcon(match: Match, isSelected: boolean) {
  const isConfirmed = match.status === 'CONFIRMED';
  const ringColor = isConfirmed ? '#00D9A3' : '#FF4757';
  const imgUrl = match.faceCropUrl || match.referencePhotoUrl || 'http://localhost:8000/static/gallery/placeholder.jpg';

  const svgHtml = `
    <div style="position: relative; width: 64px; height: 64px; display: flex; align-items: center; justify-content: center; cursor: pointer;">
      <!-- Glowing Pulse Radar Ring -->
      <div style="
        position: absolute;
        width: 58px;
        height: 58px;
        border-radius: 50%;
        border: 2px solid ${ringColor};
        background: ${isConfirmed ? 'rgba(0, 217, 163, 0.2)' : 'rgba(255, 71, 87, 0.25)'};
        animation: pulse 1.5s infinite;
        box-sizing: border-box;
      "></div>

      <!-- Inner Face Mugshot Avatar -->
      <div style="
        position: relative;
        width: 44px;
        height: 44px;
        border-radius: 50%;
        border: 2.5px solid ${ringColor};
        overflow: hidden;
        background: #000;
        box-shadow: 0 0 20px ${ringColor};
        z-index: 4;
      ">
        <img src="${imgUrl}" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.style.display='none'" />
      </div>

      <!-- Tactical Reticle Crosshairs -->
      <div style="position: absolute; top: -4px; left: 50%; transform: translateX(-50%); width: 2px; height: 8px; background: ${ringColor}; z-index: 5;"></div>
      <div style="position: absolute; bottom: -4px; left: 50%; transform: translateX(-50%); width: 2px; height: 8px; background: ${ringColor}; z-index: 5;"></div>
      <div style="position: absolute; left: -4px; top: 50%; transform: translateY(-50%); width: 8px; height: 2px; background: ${ringColor}; z-index: 5;"></div>
      <div style="position: absolute; right: -4px; top: 50%; transform: translateY(-50%); width: 8px; height: 2px; background: ${ringColor}; z-index: 5;"></div>

      <!-- Suspect Name & Confidence Pill Tag -->
      <div style="
        position: absolute;
        bottom: -22px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(10, 14, 20, 0.95);
        border: 1px solid ${ringColor};
        color: #FFFFFF;
        font-family: 'IBM Plex Mono', monospace;
        font-size: 10px;
        font-weight: 700;
        padding: 2px 6px;
        border-radius: 2px;
        white-space: nowrap;
        pointer-events: none;
        box-shadow: 0 4px 14px rgba(0,0,0,0.8);
        display: flex;
        align-items: center;
        gap: 4px;
        z-index: 6;
      ">
        <span>${match.name}</span>
        <span style="color: ${ringColor};">${Math.round(match.confidence * 100)}%</span>
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
 * Controller handling user interactions and zoom stabilization.
 * FIX: Prevents auto out-zooming on polling match events!
 */
const MapController: React.FC<{
  selectedPersonId: string | null;
  matches: Match[];
  onCoordsChange: (lat: number, lng: number, zoom: number) => void;
}> = ({ selectedPersonId, matches, onCoordsChange }) => {
  const map = useMap();
  const prevSelectedPersonRef = useRef<string | null>(null);
  const isInitialFitDone = useRef(false);

  // Initial bounds fit on mount only once
  useEffect(() => {
    const timer = setTimeout(() => {
      map.invalidateSize();
      if (!isInitialFitDone.current) {
        const bounds = CHECKPOINTS.map(cp => [cp.lat, cp.lng]) as [number, number][];
        map.fitBounds(bounds, { padding: [90, 90], maxZoom: 13, animate: false });
        isInitialFitDone.current = true;
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [map]);

  // Track map cursor and zoom level for HD tactical HUD
  useMapEvents({
    mousemove(e) {
      onCoordsChange(e.latlng.lat, e.latlng.lng, map.getZoom());
    },
    zoomend() {
      const center = map.getCenter();
      onCoordsChange(center.lat, center.lng, map.getZoom());
    }
  });

  // ONLY fly when selectedPersonId changes! Do NOT fly on every matches update!
  useEffect(() => {
    if (prevSelectedPersonRef.current === selectedPersonId) {
      return; // Person did not change, ignore background match polling!
    }
    prevSelectedPersonRef.current = selectedPersonId;

    if (selectedPersonId) {
      const personMatches = matches
        .filter(m => m.personId === selectedPersonId)
        .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
      
      if (personMatches.length > 0) {
        const lastCp = CHECKPOINTS.find(c => c.id === personMatches[personMatches.length - 1].checkpointId);
        if (lastCp) {
          map.flyTo([lastCp.lat, lastCp.lng], 14, { duration: 1.2, easeLinearity: 0.25 });
        }
      }
    }
  }, [selectedPersonId, matches, map]);

  return null;
};

export const MapView: React.FC<MapViewProps> = ({ matches, selectedPersonId, onSelectCheckpoint, onSelectMatch }) => {
  const center: [number, number] = [40.7306, -73.9352];
  const [activeLayer, setActiveLayer] = useState<MapLayerType>('dark_hd');
  const [showLayerSelector, setShowLayerSelector] = useState(false);
  const [hudCoords, setHudCoords] = useState<{ lat: number; lng: number; zoom: number }>({
    lat: 40.7527,
    lng: -73.9772,
    zoom: 12
  });

  const mapInstanceRef = useRef<L.Map | null>(null);

  const personMatches = selectedPersonId
    ? matches.filter(m => m.personId === selectedPersonId).sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
    : [];

  const pathPositions: [number, number][] = personMatches
    .map(m => CHECKPOINTS.find(c => c.id === m.checkpointId))
    .filter((cp): cp is typeof CHECKPOINTS[number] => Boolean(cp))
    .map(cp => [cp.lat, cp.lng]);

  const handleResetOverview = () => {
    if (mapInstanceRef.current) {
      const bounds = CHECKPOINTS.map(cp => [cp.lat, cp.lng]) as [number, number][];
      mapInstanceRef.current.flyToBounds(bounds, { padding: [80, 80], duration: 1.0 });
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
          No active matches. Checkpoints are live and monitoring.
        </div>
      )}
      <MapContainer
        center={center}
        zoom={12}
        minZoom={4}
        maxZoom={18}
        zoomSnap={0.5}
        zoomDelta={0.5}
        wheelPxPerZoomLevel={100}
        ref={(m) => { if (m) mapInstanceRef.current = m; }}
        style={{ width: '100%', height: '100%', background: '#0A0E14' }}
        zoomControl={false}
        attributionControl={true}
      >
        {/* High-Definition Tile Layer with Retina Support */}
        <TileLayer
          key={activeLayer}
          url={currentLayerConfig.url}
          attribution={currentLayerConfig.attribution}
          subdomains={currentLayerConfig.subdomains || []}
          maxZoom={19}
          maxNativeZoom={18}
          keepBuffer={6}
          updateWhenIdle={false}
          updateWhenZooming={false}
          className="hd-crisp-tile"
        />

        <MapController
          selectedPersonId={selectedPersonId}
          matches={matches}
          onCoordsChange={(lat, lng, zoom) => setHudCoords({ lat, lng, zoom })}
        />

        {/* Animated Sightings Polyline Trail */}
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

        {/* High-Definition Checkpoint Markers with Radar Rings */}
        {CHECKPOINTS.map(cp => {
          const cpMatches = matches.filter(m => m.checkpointId === cp.id);
          const hasRecentAlert = cpMatches.some(m => m.status === 'PENDING REVIEW');
          const hasConfirmed = cpMatches.some(m => m.status === 'CONFIRMED');

          let status: 'alert' | 'confirmed' | 'idle' = 'idle';
          if (hasRecentAlert) status = 'alert';
          else if (hasConfirmed) status = 'confirmed';

          const icon = createCheckpointIcon(status, cp.name);

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
                  padding: '8px 10px',
                  border: '1px solid var(--border-hairline, #262D3A)',
                  minWidth: '180px'
                }}>
                  <div style={{ fontWeight: 600, color: 'var(--accent-signal, #00D9A3)', marginBottom: '4px' }}>
                    {cp.name}
                  </div>
                  <div style={{ color: 'var(--text-secondary, #8892A0)', fontSize: '10px', marginBottom: '6px' }}>
                    COORD: {cp.lat.toFixed(4)}°N, {Math.abs(cp.lng).toFixed(4)}°W
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>MATCHES:</span>
                    <strong style={{ color: cpMatches.length > 0 ? 'var(--accent-signal, #00D9A3)' : 'var(--text-secondary, #8892A0)' }}>
                      {cpMatches.length} LOGGED
                    </strong>
                  </div>
                </div>
              </Popup>
            </Marker>
          );
        })}

        {/* Glowing Suspect Sighting Markers with Face Avatars & Radar Reticles */}
        {matches.map((m, idx) => {
          const cp = CHECKPOINTS.find(c => c.id === m.checkpointId);
          const isSelected = selectedPersonId === m.personId;
          const lat = cp?.lat || 40.7527;
          const lng = cp?.lng || -73.9772;
          // Offset slightly if multiple sightings at the same checkpoint
          const offsetLat = lat + ((idx % 3) - 1) * 0.0018;
          const offsetLng = lng + ((Math.floor(idx / 3) % 3) - 1) * 0.0022;

          const suspectIcon = createSuspectSightingIcon(m, isSelected);

          return (
            <Marker
              key={`suspect-${m.id}-${idx}`}
              position={[offsetLat, offsetLng]}
              icon={suspectIcon}
              zIndexOffset={isSelected ? 1000 : 500}
              eventHandlers={{
                click: () => {
                  if (onSelectMatch) onSelectMatch(m.id);
                  if (onSelectCheckpoint && m.checkpointId) onSelectCheckpoint(m.checkpointId);
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
                  border: m.status === 'CONFIRMED' ? '1px solid var(--accent-signal)' : '1px solid var(--accent-alert)',
                  minWidth: '200px'
                }}>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
                    <img
                      src={m.faceCropUrl || m.referencePhotoUrl}
                      alt={m.name}
                      style={{ width: '42px', height: '42px', objectFit: 'cover', border: '1px solid #333' }}
                      onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                    />
                    <div>
                      <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{m.name}</div>
                      <div style={{ fontSize: '10px', color: m.status === 'CONFIRMED' ? 'var(--accent-signal)' : 'var(--accent-alert)' }}>
                        {m.status} // {Math.round(m.confidence * 100)}%
                      </div>
                    </div>
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>
                    LOCATION: {cp?.name || m.checkpointId}
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
              backgroundColor: 'rgba(18, 22, 31, 0.9)',
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

        {/* Reset Overview Camera Button */}
        <button
          onClick={handleResetOverview}
          className="button"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            backgroundColor: 'rgba(18, 22, 31, 0.9)',
            backdropFilter: 'blur(6px)',
            padding: '6px 12px',
            fontSize: '0.72rem',
            fontFamily: "'IBM Plex Mono', monospace"
          }}
          title="Reset tactical overview bounds"
        >
          <Crosshair size={13} color="var(--accent-signal)" />
          <span>RE-CENTER OVERVIEW</span>
        </button>
      </div>

      {/* High-Definition Telemetry & Optical Coordinates Overlay (Bottom-Left) */}
      <div style={{
        position: 'absolute',
        bottom: '80px',
        left: '16px',
        backgroundColor: 'rgba(10, 14, 20, 0.88)',
        border: '1px solid var(--border-hairline)',
        padding: '6px 12px',
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
        fontFamily: "'IBM Plex Mono', monospace",
        fontSize: '0.72rem',
        color: 'var(--text-secondary)',
        backdropFilter: 'blur(6px)',
        zIndex: 50,
        boxShadow: '0 8px 24px rgba(0,0,0,0.6)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--accent-signal)' }}>
          <Navigation size={12} />
          <span>HD RETINA 60FPS</span>
        </div>
        <div>
          LAT: <strong style={{ color: 'var(--text-primary)' }}>{hudCoords.lat.toFixed(4)}° N</strong>
        </div>
        <div>
          LNG: <strong style={{ color: 'var(--text-primary)' }}>{Math.abs(hudCoords.lng).toFixed(4)}° W</strong>
        </div>
        <div>
          TACTICAL ZOOM: <strong style={{ color: 'var(--text-primary)' }}>{hudCoords.zoom.toFixed(1)}x</strong>
        </div>
      </div>
    </div>
  );
};