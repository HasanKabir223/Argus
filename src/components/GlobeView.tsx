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
    if (globeEl.current) {
      // Configure HD WebGL Renderer with device pixel ratio
      try {
        const renderer = globeEl.current.renderer();
        if (renderer && typeof renderer.setPixelRatio === 'function') {
          renderer.setPixelRatio(Math.min(window.devicePixelRatio || 2, 2.5));
        }
      } catch {
        // Fallback gracefully
      }

      globeEl.current.controls().autoRotate = true;
      globeEl.current.controls().autoRotateSpeed = 0.45;
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
      size: hasRecentAlert ? 0.35 : 0.15,
      color,
      name: cp.name,
      status: hasRecentAlert ? 'ALERT: PENDING SIGHTING' : hasConfirmed ? 'CONFIRMED MATCH' : 'ACTIVE CHECKPOINT'
    };
  });

  // Glowing 3D radar rings on active checkpoints
  const ringsData = CHECKPOINTS
    .filter(cp => {
      const cpMatches = matches.filter(m => m.checkpointId === cp.id);
      return cpMatches.some(m => m.status === 'PENDING REVIEW' || m.status === 'CONFIRMED');
    })
    .map(cp => {
      const hasRecentAlert = matches.some(m => m.checkpointId === cp.id && m.status === 'PENDING REVIEW');
      return {
        lat: cp.lat,
        lng: cp.lng,
        color: hasRecentAlert ? '#FF4757' : '#00D9A3',
        maxR: hasRecentAlert ? 4.5 : 2.5,
        propagationSpeed: 1.8,
        repeatPeriod: 1200
      };
    });

  // Compute animated arcs for selected person's sighting trail
  const personMatches = selectedPersonId
    ? matches.filter(m => m.personId === selectedPersonId).sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
    : [];

  const arcsData = [];
  if (personMatches.length > 1) {
    for (let i = 0; i < personMatches.length - 1; i++) {
      const startCp = CHECKPOINTS.find(c => c.id === personMatches[i].checkpointId);
      const endCp = CHECKPOINTS.find(c => c.id === personMatches[i + 1].checkpointId);
      if (startCp && endCp) {
        arcsData.push({
          startLat: startCp.lat,
          startLng: startCp.lng,
          endLat: endCp.lat,
          endLng: endCp.lng,
          color: ['rgba(0, 217, 163, 0.2)', '#00D9A3']
        });
      }
    }
  }

  // Smooth camera tracking when person selected
  useEffect(() => {
    if (globeEl.current) {
      if (selectedPersonId) {
        globeEl.current.controls().autoRotate = false;
        if (personMatches.length > 0) {
          const cp = CHECKPOINTS.find(c => c.id === personMatches[personMatches.length - 1].checkpointId);
          if (cp) {
            globeEl.current.pointOfView({ lat: cp.lat, lng: cp.lng, altitude: 1.4 }, 1200);
          }
        }
      } else {
        globeEl.current.controls().autoRotate = true;
      }
    }
  }, [selectedPersonId, personMatches]);

  const hasActiveMatches = matches.length > 0;

  return (
    <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: '#0A0E14' }}>
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
      <Globe
        ref={globeEl}
        width={dimensions.width}
        height={dimensions.height}
        globeImageUrl="//unpkg.com/three-globe/example/img/earth-night.jpg"
        bumpImageUrl="//unpkg.com/three-globe/example/img/earth-topology.png"
        backgroundImageUrl="//unpkg.com/three-globe/example/img/night-sky.png"
        backgroundColor="rgba(10, 14, 20, 1)"
        showAtmosphere={true}
        atmosphereColor="#00D9A3"
        atmosphereAltitude={0.22}

        pointsData={pointsData}
        pointAltitude={0.03}
        pointRadius="size"
        pointColor="color"
        pointResolution={24}
        pointLabel={(d: any) => `
          <div style="
            background: rgba(18, 22, 31, 0.95);
            border: 1px solid var(--border-hairline, #262D3A);
            color: #E8ECF1;
            font-family: 'IBM Plex Mono', monospace;
            font-size: 11px;
            padding: 8px 12px;
            border-radius: 2px;
            box-shadow: 0 12px 32px rgba(0,0,0,0.8);
          ">
            <div style="color: ${d.color}; font-weight: 600; margin-bottom: 2px;">${d.name}</div>
            <div style="color: #8892A0; font-size: 10px;">${d.status}</div>
          </div>
        `}

        ringsData={ringsData}
        ringColor="color"
        ringMaxRadius="maxR"
        ringPropagationSpeed="propagationSpeed"
        ringRepeatPeriod="repeatPeriod"

        arcsData={arcsData}
        arcColor="color"
        arcDashLength={0.45}
        arcDashGap={0.2}
        arcDashAnimateTime={1600}
        arcAltitudeAutoScale={0.25}
        arcStroke={1.5}
      />
    </div>
  );
};