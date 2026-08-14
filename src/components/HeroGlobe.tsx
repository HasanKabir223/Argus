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

// Active Transit Sighting Arcs with dashing Palantir Electric Cyan emission
const TRANSIT_ARCS = [
  {
    startLat: 28.6139,
    startLng: 77.2090,
    endLat: 19.0760,
    endLng: 72.8777,
    color: ['rgba(56, 189, 248, 0.25)', '#38BDF8'],
  },
  {
    startLat: 19.0760,
    startLng: 72.8777,
    endLat: 12.9716,
    endLng: 77.5946,
    color: ['rgba(56, 189, 248, 0.25)', '#38BDF8'],
  },
  {
    startLat: 12.9716,
    startLng: 77.5946,
    endLat: 22.5726,
    endLng: 88.3639,
    color: ['rgba(56, 189, 248, 0.25)', '#38BDF8'],
  },
  {
    startLat: 28.6139,
    startLng: 77.2090,
    endLat: 22.5726,
    endLng: 88.3639,
    color: ['rgba(56, 189, 248, 0.25)', '#38BDF8'],
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

  // Configure Globe on load: Initial viewpoint focused on India & continuous bright auto-rotation
  useEffect(() => {
    if (globeEl.current) {
      // Position camera over Indian subcontinent (lat: 20.59, lng: 78.96, altitude: 2.05)
      globeEl.current.pointOfView({ lat: 20.5937, lng: 78.9629, altitude: 2.05 }, 0);

      const controls = globeEl.current.controls();
      if (controls) {
        controls.autoRotate = !prefersReducedMotion;
        controls.autoRotateSpeed = 0.7;
        controls.enableZoom = false;
        controls.enablePan = false;
        controls.enableDamping = true;
        controls.dampingFactor = 0.05;
        controls.rotateSpeed = 0.6;
      }

      // Configure HD WebGL Renderer with device pixel ratio
      try {
        const renderer = globeEl.current.renderer();
        if (renderer && typeof renderer.setPixelRatio === 'function') {
          renderer.setPixelRatio(Math.min(window.devicePixelRatio || 2, 2.5));
        }
      } catch {
        // Fallback gracefully
      }

      // Enhance scene lighting for maximum daytime radiance & tactical contrast
      const scene = globeEl.current.scene();
      if (scene) {
        scene.traverse((obj: any) => {
          if (obj.isLight) {
            obj.intensity = Math.max(obj.intensity * 2.0, 2.8);
          }
        });
      }
    }
  }, [prefersReducedMotion]);

  // Smooth hover interaction: modulate auto-rotation speed naturally without interrupting camera angle
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (prefersReducedMotion || !globeEl.current) return;
    const controls = globeEl.current.controls();
    if (!controls) return;

    // Slight speed modulation based on horizontal cursor delta from center (0.45x to 0.95x)
    const normX = (e.clientX / window.innerWidth - 0.5) * 2;
    controls.autoRotateSpeed = 0.7 + normX * 0.25;
  }, [prefersReducedMotion]);

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [handleMouseMove]);

  // Points configuration: high-contrast Palantir Cyan beacons
  const pointsData = CHECKPOINT_NODES.map((cp) => ({
    lat: cp.lat,
    lng: cp.lng,
    size: 0.36,
    color: '#38BDF8',
    name: `${cp.city} (${cp.code})`,
  }));

  // Pulsing radar rings for active checkpoints (crisp electric cyan against daylight ocean & landmass)
  const ringsData = CHECKPOINT_NODES.map((cp) => ({
    lat: cp.lat,
    lng: cp.lng,
    maxR: 4.2,
    propagationSpeed: 2.2,
    repeatPeriod: 1200,
  }));

  return (
    <div
      className="hero-globe-wrapper"
      role="img"
      aria-label="Photorealistic bright daytime 3D Earth globe showing ARGUS checkpoint locations and active transit arcs across India"
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
        globeImageUrl="//unpkg.com/three-globe/example/img/earth-blue-marble.jpg"
        bumpImageUrl="//unpkg.com/three-globe/example/img/earth-topology.png"
        backgroundColor="rgba(7, 11, 18, 1)"
        showAtmosphere={true}
        atmosphereColor="#38bdf8"
        atmosphereAltitude={0.22}

        // Checkpoint Points
        pointsData={pointsData}
        pointAltitude={0.04}
        pointRadius="size"
        pointColor="color"
        pointResolution={24}

        // Pulsing Radar Rings
        ringsData={prefersReducedMotion ? [] : ringsData}
        ringColor={() => (t: number) => `rgba(56, 189, 248, ${Math.max(0, 1 - t * 1.05)})`}
        ringMaxRadius="maxR"
        ringPropagationSpeed="propagationSpeed"
        ringRepeatPeriod="repeatPeriod"

        // Animated Transit Sighting Arcs
        arcsData={prefersReducedMotion ? [] : TRANSIT_ARCS}
        arcColor="color"
        arcDashLength={0.4}
        arcDashGap={1.4}
        arcDashAnimateTime={1600}
        arcAltitudeAutoScale={0.28}
        arcStroke={2.0}
      />
    </div>
  );
};
