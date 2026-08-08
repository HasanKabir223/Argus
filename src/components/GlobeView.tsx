import React, { useRef, useState, useEffect } from 'react';
import Globe, { type GlobeMethods } from 'react-globe.gl';
import { CHECKPOINTS, type Match } from '../data/mockData';

interface GlobeViewProps {
  matches: Match[];
  selectedPersonId: string | null;
}

export const GlobeView: React.FC<GlobeViewProps> = ({ matches, selectedPersonId }) => {
  const globeEl = useRef<GlobeMethods | undefined>(undefined);
  const [dimensions, setDimensions] = useState({ width: window.innerWidth, height: window.innerHeight });

  useEffect(() => {
    const handleResize = () => setDimensions({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    // Auto-rotate
    if (globeEl.current) {
      globeEl.current.controls().autoRotate = true;
      globeEl.current.controls().autoRotateSpeed = 0.5;
    }
  }, []);

  // Compute points
  const pointsData = CHECKPOINTS.map(cp => {
    const cpMatches = matches.filter(m => m.checkpointId === cp.id);
    const hasRecentAlert = cpMatches.some(m => m.status === 'PENDING REVIEW');
    const hasConfirmed = cpMatches.some(m => m.status === 'CONFIRMED');
    
    let color = '#3D4759'; // --accent-muted
    if (hasRecentAlert) color = '#FF4757'; // --accent-alert
    else if (hasConfirmed) color = '#00D9A3'; // --accent-signal
    
    return {
      lat: cp.lat,
      lng: cp.lng,
      size: hasRecentAlert ? 0.3 : 0.1,
      color,
      name: cp.name
    };
  });

  // Compute arcs for selected person
  const personMatches = selectedPersonId 
    ? matches.filter(m => m.personId === selectedPersonId).sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
    : [];

  const arcsData = [];
  if (personMatches.length > 1) {
    for (let i = 0; i < personMatches.length - 1; i++) {
      const startCp = CHECKPOINTS.find(c => c.id === personMatches[i].checkpointId);
      const endCp = CHECKPOINTS.find(c => c.id === personMatches[i+1].checkpointId);
      if (startCp && endCp) {
        arcsData.push({
          startLat: startCp.lat,
          startLng: startCp.lng,
          endLat: endCp.lat,
          endLng: endCp.lng,
          color: '#00D9A3'
        });
      }
    }
  }

  // Stop rotation when person selected
  useEffect(() => {
    if (globeEl.current) {
      if (selectedPersonId) {
        globeEl.current.controls().autoRotate = false;
        if (personMatches.length > 0) {
          const cp = CHECKPOINTS.find(c => c.id === personMatches[personMatches.length - 1].checkpointId);
          if (cp) {
             globeEl.current.pointOfView({ lat: cp.lat, lng: cp.lng, altitude: 1.5 }, 1000);
          }
        }
      } else {
        globeEl.current.controls().autoRotate = true;
      }
    }
  }, [selectedPersonId, personMatches]);

  return (
    <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}>
      <Globe
        ref={globeEl}
        width={dimensions.width}
        height={dimensions.height}
        globeImageUrl="//unpkg.com/three-globe/example/img/earth-blue-marble.jpg"
        bumpImageUrl="//unpkg.com/three-globe/example/img/earth-topology.png"
        backgroundImageUrl="//unpkg.com/three-globe/example/img/night-sky.png"
        backgroundColor="rgba(10, 14, 20, 1)"
        showAtmosphere={true}
        atmosphereColor="#38bdf8"
        atmosphereAltitude={0.2}

        pointsData={pointsData}
        pointAltitude={0.02}
        pointRadius="size"
        pointColor="color"
        pointResolution={16}
        pointLabel={(d: any) => `
          <div style="
            background: rgba(10,14,20,0.9);
            border: 1px solid #3D4759;
            color: #E8ECF1;
            font-family: monospace;
            font-size: 12px;
            padding: 4px 8px;
            border-radius: 2px;
          ">${d.name}</div>
        `}

        arcsData={arcsData}
        arcColor="color"
        arcDashLength={0.4}
        arcDashGap={0.2}
        arcDashAnimateTime={1500}
        arcAltitudeAutoScale={0.2}
      />
    </div>
  );
};