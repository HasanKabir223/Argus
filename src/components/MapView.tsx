import React, { useEffect } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, Polyline, useMap } from 'react-leaflet';
import { CHECKPOINTS, type Match } from '../data/mockData';
import 'leaflet/dist/leaflet.css';

interface MapViewProps {
  matches: Match[];
  selectedPersonId: string | null;
  onSelectCheckpoint: (checkpointId: string) => void;
}

const MapController: React.FC<{ selectedPersonId: string | null; matches: Match[] }> = ({ selectedPersonId, matches }) => {
  const map = useMap();

  useEffect(() => {
    const timer = setTimeout(() => {
      map.invalidateSize();
      const bounds = CHECKPOINTS.map(cp => [cp.lat, cp.lng]) as [number, number][];
      map.fitBounds(bounds, { padding: [80, 80] });
    }, 100);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);

  useEffect(() => {
    if (selectedPersonId) {
      const personMatches = matches
        .filter(m => m.personId === selectedPersonId)
        .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
      if (personMatches.length > 0) {
        const lastCp = CHECKPOINTS.find(c => c.id === personMatches[personMatches.length - 1].checkpointId);
        if (lastCp) {
          map.flyTo([lastCp.lat, lastCp.lng], 13, { duration: 1 });
        }
      }
    } else {
      const bounds = CHECKPOINTS.map(cp => [cp.lat, cp.lng]) as [number, number][];
      map.flyToBounds(bounds, { padding: [80, 80], duration: 1 });
    }
  }, [selectedPersonId, matches, map]);

  return null;
};

export const MapView: React.FC<MapViewProps> = ({ matches, selectedPersonId, onSelectCheckpoint }) => {
  const center: [number, number] = [40.72, -73.95];

  const pointsData = CHECKPOINTS.map(cp => {
    const cpMatches = matches.filter(m => m.checkpointId === cp.id);
    const hasRecentAlert = cpMatches.some(m => m.status === 'PENDING REVIEW');
    const hasConfirmed = cpMatches.some(m => m.status === 'CONFIRMED');

    let color = '#3D4759';
    if (hasRecentAlert) color = '#FF4757';
    else if (hasConfirmed) color = '#00D9A3';

    return { ...cp, color, radius: hasRecentAlert ? 10 : 7 };
  });

  const personMatches = selectedPersonId
    ? matches.filter(m => m.personId === selectedPersonId).sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
    : [];

  const pathPositions: [number, number][] = personMatches
    .map(m => CHECKPOINTS.find(c => c.id === m.checkpointId))
    .filter((cp): cp is typeof CHECKPOINTS[number] => Boolean(cp))
    .map(cp => [cp.lat, cp.lng]);

  return (
    <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 1 }}>
      <MapContainer
        center={center}
        zoom={11}
        style={{ width: '100%', height: '100%', background: '#0A0E14' }}
        zoomControl={true}
        attributionControl={true}
      >
        <TileLayer
          url="https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          maxZoom={19}
        />

        <MapController selectedPersonId={selectedPersonId} matches={matches} />

        {pathPositions.length > 1 && (
          <Polyline
            positions={pathPositions}
            pathOptions={{ color: '#00D9A3', weight: 2, dashArray: '6 6', opacity: 0.9 }}
          />
        )}

        {pointsData.map(cp => (
          <CircleMarker
            key={cp.id}
            center={[cp.lat, cp.lng]}
            radius={cp.radius}
            pathOptions={{
              color: cp.color,
              fillColor: cp.color,
              fillOpacity: 0.85,
              weight: 2,
            }}
            eventHandlers={{
              click: () => onSelectCheckpoint(cp.id),
            }}
          >
            <Popup>
              <div style={{ fontFamily: 'monospace', fontSize: '12px' }}>
                {cp.name}
              </div>
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  );
};