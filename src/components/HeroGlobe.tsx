import React, { useRef, useEffect, useState, useCallback } from 'react';
import Globe, { type GlobeMethods } from 'react-globe.gl';

// Global Strategic Intelligence Checkpoint Nodes (Palantir Cyber Grid)
const CHECKPOINT_MARKERS = [
  { lat: 28.6139, lng: 77.2090, city: 'New Delhi', code: 'CP-DEL', isPrimary: true },
  { lat: 19.0760, lng: 72.8777, city: 'Mumbai', code: 'CP-BOM', isPrimary: false },
  { lat: 12.9716, lng: 77.5946, city: 'Bengaluru', code: 'CP-BLR', isPrimary: false },
  { lat: 40.7128, lng: -74.0060, city: 'New York', code: 'CP-NYC', isPrimary: false },
  { lat: 51.5074, lng: -0.1278, city: 'London', code: 'CP-LON', isPrimary: false },
  { lat: 25.2048, lng: 55.2708, city: 'Dubai', code: 'CP-DXB', isPrimary: false },
  { lat: 1.3521, lng: 103.8198, city: 'Singapore', code: 'CP-SIN', isPrimary: false },
  { lat: 35.6762, lng: 139.6503, city: 'Tokyo', code: 'CP-TYO', isPrimary: false },
  { lat: 37.7749, lng: -122.4194, city: 'San Francisco', code: 'CP-SFO', isPrimary: false },
  { lat: -33.8688, lng: 151.2093, city: 'Sydney', code: 'CP-SYD', isPrimary: false },
  { lat: 48.8566, lng: 2.3522, city: 'Paris', code: 'CP-CDG', isPrimary: false },
  { lat: 22.3193, lng: 114.1694, city: 'Hong Kong', code: 'CP-HKG', isPrimary: false },
];

// Long-distance Geodesic Flight Arcs (Luminous Cyan Photon Trails)
const TRANSIT_ARCS = [
  {
    startLat: 28.6139,
    startLng: 77.2090,
    endLat: 51.5074,
    endLng: -0.1278,
    color: ['rgba(56, 189, 248, 0.1)', '#38BDF8'],
  },
  {
    startLat: 51.5074,
    startLng: -0.1278,
    endLat: 40.7128,
    endLng: -74.0060,
    color: ['rgba(56, 189, 248, 0.1)', '#38BDF8'],
  },
  {
    startLat: 40.7128,
    startLng: -74.0060,
    endLat: 37.7749,
    endLng: -122.4194,
    color: ['rgba(56, 189, 248, 0.1)', '#38BDF8'],
  },
  {
    startLat: 37.7749,
    startLng: -122.4194,
    endLat: 35.6762,
    endLng: 139.6503,
    color: ['rgba(56, 189, 248, 0.1)', '#38BDF8'],
  },
  {
    startLat: 35.6762,
    startLng: 139.6503,
    endLat: 1.3521,
    endLng: 103.8198,
    color: ['rgba(56, 189, 248, 0.1)', '#38BDF8'],
  },
  {
    startLat: 1.3521,
    startLng: 103.8198,
    endLat: 28.6139,
    endLng: 77.2090,
    color: ['rgba(56, 189, 248, 0.1)', '#38BDF8'],
  },
  {
    startLat: 28.6139,
    startLng: 77.2090,
    endLat: 25.2048,
    endLng: 55.2708,
    color: ['rgba(56, 189, 248, 0.1)', '#38BDF8'],
  },
  {
    startLat: 25.2048,
    startLng: 55.2708,
    endLat: 48.8566,
    endLng: 2.3522,
    color: ['rgba(56, 189, 248, 0.1)', '#38BDF8'],
  },
];

export const HeroGlobe: React.FC = () => {
  const globeEl = useRef<GlobeMethods | undefined>(undefined);
  const [countries, setCountries] = useState<{ features: any[] }>({ features: [] });
  const [dimensions, setDimensions] = useState({
    width: typeof window !== 'undefined' ? window.innerWidth : 1440,
    height: typeof window !== 'undefined' ? window.innerHeight : 900,
  });
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [activeTelemetry, setActiveTelemetry] = useState('CP-DEL // NEW DELHI (LAT 28.61, LNG 77.20) // LIVE');

  // Load countries GeoJSON for cyber dot-matrix continents
  useEffect(() => {
    fetch('/countries.geojson')
      .then((res) => res.json())
      .then((data) => {
        if (data && data.features) {
          setCountries(data);
        }
      })
      .catch((err) => console.error('Error loading countries GeoJSON:', err));
  }, []);

  // Resize handling
  useEffect(() => {
    const handleResize = () => {
      setDimensions({ width: window.innerWidth, height: window.innerHeight });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Reduced motion detection
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);
    const listener = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mediaQuery.addEventListener('change', listener);
    return () => mediaQuery.removeEventListener('change', listener);
  }, []);

  // Configure Globe on load: Focus on Indian subcontinent & auto-rotate
  useEffect(() => {
    if (globeEl.current) {
      globeEl.current.pointOfView({ lat: 22.0, lng: 76.0, altitude: 2.1 }, 0);

      const controls = globeEl.current.controls();
      if (controls) {
        controls.autoRotate = !prefersReducedMotion;
        controls.autoRotateSpeed = 0.6;
        controls.enableZoom = false;
        controls.enablePan = false;
        controls.enableDamping = true;
        controls.dampingFactor = 0.06;
        controls.rotateSpeed = 0.6;
      }

      // Configure HD WebGL Renderer
      try {
        const renderer = globeEl.current.renderer();
        if (renderer && typeof renderer.setPixelRatio === 'function') {
          renderer.setPixelRatio(Math.min(window.devicePixelRatio || 2, 2.5));
        }
      } catch {
        // Fallback
      }

      // Enhance scene lighting for radiant cyber illumination
      const scene = globeEl.current.scene();
      if (scene) {
        scene.traverse((obj: any) => {
          if (obj.isLight) {
            obj.intensity = Math.max(obj.intensity * 2.5, 3.5);
          }
        });
      }
    }
  }, [prefersReducedMotion]);

  // Smooth hover interaction: modulate speed based on cursor
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (prefersReducedMotion || !globeEl.current) return;
    const controls = globeEl.current.controls();
    if (!controls) return;

    const normX = (e.clientX / window.innerWidth - 0.5) * 2;
    controls.autoRotateSpeed = 0.6 + normX * 0.25;
  }, [prefersReducedMotion]);

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [handleMouseMove]);

  // Scroll rotation handling
  useEffect(() => {
    const scrollContainer = document.querySelector('.landing-root');
    if (!scrollContainer || prefersReducedMotion) return;

    let lastScrollY = scrollContainer.scrollTop;
    let targetDelta = 0;
    let currentDelta = 0;
    let rafId: number;

    const handleScroll = () => {
      const scrollY = scrollContainer.scrollTop;
      const delta = scrollY - lastScrollY;
      lastScrollY = scrollY;
      targetDelta += delta;
    };

    const animate = () => {
      if (Math.abs(targetDelta - currentDelta) > 0.01 && globeEl.current) {
        // Lerp
        const step = (targetDelta - currentDelta) * 0.08;
        currentDelta += step;

        const currentPov = globeEl.current.pointOfView();
        // 1 full revolution (360 degrees) per 3000px scrolled
        const newLng = currentPov.lng - (step / 3000) * 360; 
        
        // Use 0 ms for instant pointOfView update without disrupting orbit controls
        globeEl.current.pointOfView({ ...currentPov, lng: newLng }, 0);
      }
      rafId = requestAnimationFrame(animate);
    };

    scrollContainer.addEventListener('scroll', handleScroll, { passive: true });
    rafId = requestAnimationFrame(animate);

    return () => {
      scrollContainer.removeEventListener('scroll', handleScroll);
      cancelAnimationFrame(rafId);
    };
  }, [prefersReducedMotion]);

  // Telemetry cycle
  useEffect(() => {
    const timer = setInterval(() => {
      const node = CHECKPOINT_MARKERS[Math.floor(Math.random() * CHECKPOINT_MARKERS.length)];
      setActiveTelemetry(`${node.code} // ${node.city.toUpperCase()} (LAT ${node.lat.toFixed(2)}, LNG ${node.lng.toFixed(2)}) // ACTIVE`);
    }, 3200);
    return () => clearInterval(timer);
  }, []);

  // Luminous Pinpoint Beacon Nodes
  const pointsData = CHECKPOINT_MARKERS.map((cp) => ({
    lat: cp.lat,
    lng: cp.lng,
    size: cp.isPrimary ? 0.16 : 0.1,
    color: cp.isPrimary ? '#67E8F9' : '#38BDF8',
    name: `${cp.city} (${cp.code})`,
  }));

  // Subtle Single Radar Ping on Primary Node
  const ringsData = CHECKPOINT_MARKERS.filter((cp) => cp.isPrimary).map((cp) => ({
    lat: cp.lat,
    lng: cp.lng,
    maxR: 2.8,
    propagationSpeed: 1.8,
    repeatPeriod: 1400,
  }));

  return (
    <div
      className="hero-globe-wrapper"
      role="img"
      aria-label="Palantir Cyber Dotted 3D Earth Globe with real-time checkpoint telemetry"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        pointerEvents: 'auto',
        zIndex: 0,
        cursor: 'grab',
      }}
    >
      <Globe
        ref={globeEl}
        width={dimensions.width}
        height={dimensions.height}
        globeImageUrl="//unpkg.com/three-globe/example/img/earth-dark.jpg"
        bumpImageUrl="//unpkg.com/three-globe/example/img/earth-topology.png"
        backgroundColor="rgba(7, 11, 18, 1)"
        showAtmosphere={true}
        atmosphereColor="#38bdf8"
        atmosphereAltitude={0.22}

        // Cyber Dot-Matrix Continents (Halftone Cyan Dots)
        hexPolygonsData={countries.features}
        hexPolygonGeoJsonGeometry="geometry"
        hexPolygonColor={() => 'rgba(56, 189, 248, 0.85)'}
        hexPolygonAltitude={0.012}
        hexPolygonResolution={3.2}
        hexPolygonMargin={0.28}
        hexPolygonUseDots={true}

        // Luminous Pinpoint Nodes
        pointsData={pointsData}
        pointAltitude={0.025}
        pointRadius="size"
        pointColor="color"
        pointResolution={16}

        // Single Focal Radar Ping
        ringsData={prefersReducedMotion ? [] : ringsData}
        ringColor={() => (t: number) => `rgba(56, 189, 248, ${Math.max(0, 0.6 * (1 - t))})`}
        ringMaxRadius="maxR"
        ringPropagationSpeed="propagationSpeed"
        ringRepeatPeriod="repeatPeriod"

        // Gossamer Geodesic Arcs
        arcsData={prefersReducedMotion ? [] : TRANSIT_ARCS}
        arcColor="color"
        arcDashLength={0.65}
        arcDashGap={3.2}
        arcDashAnimateTime={2000}
        arcAltitudeAutoScale={0.38}
        arcStroke={0.6}
      />

      {/* Live Tactical Telemetry HUD Badge */}
      <div
        className="cyber-globe-hud-badge"
        style={{
          position: 'absolute',
          bottom: '32px',
          right: '8vw',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '8px 16px',
          background: 'rgba(14, 22, 36, 0.85)',
          backdropFilter: 'blur(16px)',
          border: '1px solid rgba(56, 189, 248, 0.25)',
          borderRadius: '100px',
          boxShadow: '0 8px 24px rgba(0, 0, 0, 0.6), 0 0 16px rgba(56, 189, 248, 0.2)',
          userSelect: 'none',
          whiteSpace: 'nowrap',
          zIndex: 10,
        }}
      >
        <span
          style={{
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            background: '#38BDF8',
            boxShadow: '0 0 8px #38BDF8',
            animation: 'hud-pulse 1.8s infinite ease-in-out',
          }}
        />
        <span
          style={{
            fontFamily: 'var(--font-mono, monospace)',
            fontSize: '11px',
            fontWeight: 600,
            letterSpacing: '0.12em',
            color: '#F8FAFC',
          }}
        >
          {activeTelemetry}
        </span>
      </div>
    </div>
  );
};
