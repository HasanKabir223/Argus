import React, { useRef, useEffect, useState, useCallback } from 'react';
import Globe, { type GlobeMethods } from 'react-globe.gl';

// 10 Real Indian City Checkpoint Coordinates
const CHECKPOINT_NODES = [
  { lat: 28.6139, lng: 77.2090, city: 'New Delhi', code: 'CP-DEL' },
  { lat: 19.0760, lng: 72.8777, city: 'Mumbai', code: 'CP-BOM' },
  { lat: 12.9716, lng: 77.5946, city: 'Bengaluru', code: 'CP-BLR' },
  { lat: 22.5726, lng: 88.3639, city: 'Kolkata', code: 'CP-CCU' },
  { lat: 13.0827, lng: 80.2707, city: 'Chennai', code: 'CP-MAA' },
  { lat: 17.3850, lng: 78.4867, city: 'Hyderabad', code: 'CP-HYD' },
  { lat: 23.0225, lng: 72.5714, city: 'Ahmedabad', code: 'CP-AMD' },
  { lat: 18.5204, lng: 73.8567, city: 'Pune', code: 'CP-PNQ' },
  { lat: 26.9124, lng: 75.7873, city: 'Jaipur', code: 'CP-JAI' },
  { lat: 26.8467, lng: 80.9462, city: 'Lucknow', code: 'CP-LKO' },
];

// Active Transit Sighting Arcs
const TRANSIT_ARCS = [
  {
    startLat: 28.6139,
    startLng: 77.2090,
    endLat: 19.0760,
    endLng: 72.8777,
    color: ['rgba(0, 217, 163, 0.1)', '#00D9A3'],
  },
  {
    startLat: 19.0760,
    startLng: 72.8777,
    endLat: 12.9716,
    endLng: 77.5946,
    color: ['rgba(0, 217, 163, 0.1)', '#00D9A3'],
  },
  {
    startLat: 12.9716,
    startLng: 77.5946,
    endLat: 22.5726,
    endLng: 88.3639,
    color: ['rgba(0, 217, 163, 0.1)', '#00D9A3'],
  },
  {
    startLat: 28.6139,
    startLng: 77.2090,
    endLat: 22.5726,
    endLng: 88.3639,
    color: ['rgba(0, 217, 163, 0.1)', '#00D9A3'],
  },
];

export const HeroGlobe: React.FC = () => {
  const globeEl = useRef<GlobeMethods | undefined>(undefined);
  const [dimensions, setDimensions] = useState({
    width: typeof window !== 'undefined' ? window.innerWidth : 1440,
    height: typeof window !== 'undefined' ? window.innerHeight : 900,
  });
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

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

  // Configure Globe on load: Initial viewpoint focused on India & continuous auto-rotation
  useEffect(() => {
    if (globeEl.current) {
      // Position camera over Indian subcontinent (lat: 20, lng: 78, altitude: 2.2)
      globeEl.current.pointOfView({ lat: 20.5937, lng: 78.9629, altitude: 2.2 }, 0);

      const controls = globeEl.current.controls();
      if (controls) {
        controls.autoRotate = !prefersReducedMotion;
        // 0.08 deg per frame equivalent speed
        controls.autoRotateSpeed = 0.48;
        controls.enableZoom = false;
        controls.enablePan = false;
      }
    }
  }, [prefersReducedMotion]);

  // Subtle physical tilt on mouse move over globe
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (prefersReducedMotion || !globeEl.current) return;
    const { innerWidth, innerHeight } = window;
    // Calculate normalized delta from center (-1 to 1)
    const normX = (e.clientX / innerWidth - 0.5) * 2;
    const normY = (e.clientY / innerHeight - 0.5) * 2;

    // Apply max 4-5 degrees of tilt
    const currentPov = globeEl.current.pointOfView();
    if (currentPov) {
      const targetAltitude = 2.2 + normY * 0.08;
      globeEl.current.pointOfView({
        lat: 20.5937 - normY * 4.5,
        lng: currentPov.lng + normX * 0.4,
        altitude: Math.max(1.8, Math.min(2.5, targetAltitude)),
      });
    }
  }, [prefersReducedMotion]);

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [handleMouseMove]);

  // Points configuration: 2px size, cold teal #00D9A3
  const pointsData = CHECKPOINT_NODES.map((cp) => ({
    lat: cp.lat,
    lng: cp.lng,
    size: 0.16,
    color: '#00D9A3',
    name: `${cp.city} (${cp.code})`,
  }));

  return (
    <div
      className="hero-globe-wrapper"
      role="img"
      aria-label="Rotating globe showing ARGUS checkpoint locations across India"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        pointerEvents: 'none',
        zIndex: 0,
      }}
    >
      <Globe
        ref={globeEl}
        width={dimensions.width}
        height={dimensions.height}
        globeImageUrl="//unpkg.com/three-globe/example/img/earth-night.jpg"
        backgroundColor="rgba(10, 14, 20, 1)"
        showAtmosphere={true}
        atmosphereColor="#00D9A3"
        atmosphereAltitude={0.16}

        // Checkpoint Points
        pointsData={pointsData}
        pointAltitude={0.015}
        pointRadius="size"
        pointColor="color"
        pointResolution={16}

        // Animated Transit Sighting Arcs
        arcsData={prefersReducedMotion ? [] : TRANSIT_ARCS}
        arcColor="color"
        arcDashLength={0.3}
        arcDashGap={2}
        arcDashAnimateTime={2000}
        arcAltitudeAutoScale={0.22}
        arcStroke={1.2}
      />
    </div>
  );
};
