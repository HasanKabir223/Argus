import React, { useEffect, useRef } from 'react';
import './AbstractArt.css';

interface Point3D {
  x: number;
  y: number;
  z: number;
  origX: number;
  origY: number;
  origZ: number;
  baseRadius: number;
  phase: number;
  speed: number;
  layer: number;
}

export const AbstractArt: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: 0, y: 0, targetX: 0, targetY: 0, isHovered: false });
  const pulseRef = useRef<{ x: number; y: number; radius: number; maxRadius: number; active: boolean }>({
    x: 0,
    y: 0,
    radius: 0,
    maxRadius: 280,
    active: false,
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    let animationFrameId: number;
    let isVisible = true;

    // Intersection observer to stop drawing when off-screen
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          isVisible = entry.isIntersecting;
        });
      },
      { threshold: 0.1 }
    );
    observer.observe(container);

    // Generate 3D Parametric Lattice Points
    const points: Point3D[] = [];
    const layers = 6;
    const pointsPerLayer = 32;
    const baseRadius = 140;

    for (let l = 0; l < layers; l++) {
      const phi = ((l + 0.5) / layers) * Math.PI; // latitude from 0 to PI
      const ringRadius = baseRadius * Math.sin(phi);
      const ringY = baseRadius * Math.cos(phi);

      for (let p = 0; p < pointsPerLayer; p++) {
        const theta = (p / pointsPerLayer) * Math.PI * 2;
        const x = ringRadius * Math.cos(theta);
        const z = ringRadius * Math.sin(theta);
        const y = ringY;

        points.push({
          x,
          y,
          z,
          origX: x,
          origY: y,
          origZ: z,
          baseRadius,
          phase: theta * 2 + l * 0.8,
          speed: 0.8 + (l % 3) * 0.2,
          layer: l,
        });
      }
    }

    // Outer orbital floating satellites
    const satellites: { angle: number; distance: number; speed: number; y: number; size: number }[] = [];
    for (let s = 0; s < 14; s++) {
      satellites.push({
        angle: (s / 14) * Math.PI * 2,
        distance: 180 + (s % 4) * 20,
        speed: (0.3 + (s % 3) * 0.15) * (s % 2 === 0 ? 1 : -1),
        y: ((s - 7) / 7) * 90,
        size: 1.5 + (s % 3) * 0.8,
      });
    }

    let time = 0;
    let width = 0;
    let height = 0;
    let dpr = window.devicePixelRatio || 1;

    const resize = () => {
      const rect = container.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      dpr = Math.min(window.devicePixelRatio || 1, 2);

      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.scale(dpr, dpr);
    };

    resize();
    const resizeObserver = new ResizeObserver(() => resize());
    resizeObserver.observe(container);

    // Render loop
    const render = () => {
      time += 0.012;

      // Mouse smooth interpolation
      mouseRef.current.x += (mouseRef.current.targetX - mouseRef.current.x) * 0.05;
      mouseRef.current.y += (mouseRef.current.targetY - mouseRef.current.y) * 0.05;

      // Expand click pulse if active
      if (pulseRef.current.active) {
        pulseRef.current.radius += 5;
        if (pulseRef.current.radius > pulseRef.current.maxRadius) {
          pulseRef.current.active = false;
        }
      }

      if (isVisible && width > 0 && height > 0) {
        ctx.clearRect(0, 0, width, height);

        const centerX = width / 2;
        const centerY = height / 2;

        // Subtle ambient radial glow behind the mesh
        const bgGlow = ctx.createRadialGradient(
          centerX,
          centerY,
          20,
          centerX,
          centerY,
          baseRadius * 1.5
        );
        bgGlow.addColorStop(0, 'rgba(59, 130, 246, 0.16)');
        bgGlow.addColorStop(0.5, 'rgba(30, 58, 110, 0.08)');
        bgGlow.addColorStop(1, 'rgba(10, 14, 20, 0)');
        ctx.fillStyle = bgGlow;
        ctx.beginPath();
        ctx.arc(centerX, centerY, baseRadius * 1.6, 0, Math.PI * 2);
        ctx.fill();

        // 3D rotation angles
        const rotX = time * 0.35 + mouseRef.current.y * 0.8;
        const rotY = time * 0.5 + mouseRef.current.x * 1.2;

        const sinX = Math.sin(rotX);
        const cosX = Math.cos(rotX);
        const sinY = Math.sin(rotY);
        const cosY = Math.cos(rotY);

        // Project and transform points
        const projectedPoints: {
          px: number;
          py: number;
          pz: number;
          scale: number;
          alpha: number;
          color: string;
          origPoint: Point3D;
        }[] = [];

        const fov = 380;

        for (let i = 0; i < points.length; i++) {
          const pt = points[i];

          // Harmonic morphological wave breathing
          const wave =
            Math.sin(time * pt.speed + pt.phase) * 14 +
            Math.cos(time * 0.8 + pt.phase * 0.5) * 8;

          const curRadius = 1 + wave / pt.baseRadius;
          const px0 = pt.origX * curRadius;
          const py0 = pt.origY * curRadius;
          const pz0 = pt.origZ * curRadius;

          // Rotate around Y axis
          const x1 = px0 * cosY + pz0 * sinY;
          const y1 = py0;
          const z1 = -px0 * sinY + pz0 * cosY;

          // Rotate around X axis
          const x2 = x1;
          const y2 = y1 * cosX - z1 * sinX;
          const z2 = y1 * sinX + z1 * cosX;

          // Perspective projection
          const depth = fov + z2;
          const scale = fov / Math.max(depth, 40);
          const projX = centerX + x2 * scale;
          const projY = centerY + y2 * scale;

          // Depth-based brightness & size
          const normZ = (z2 + baseRadius * 1.3) / (baseRadius * 2.6);
          const clampedNormZ = Math.max(0, Math.min(1, normZ));
          const alpha = 0.2 + clampedNormZ * 0.75;

          projectedPoints.push({
            px: projX,
            py: projY,
            pz: z2,
            scale,
            alpha,
            color: clampedNormZ > 0.65 ? '#60A5FA' : '#3B82F6',
            origPoint: pt,
          });
        }

        // Sort by Z for proper depth rendering
        projectedPoints.sort((a, b) => a.pz - b.pz);

        // Draw connecting vector topology lines
        const maxDistSq = 42 * 42;
        ctx.lineWidth = 0.85;

        for (let i = 0; i < projectedPoints.length; i++) {
          const p1 = projectedPoints[i];
          // Limit connection checks for high 60fps performance
          const step = 1;
          for (let j = i + 1; j < projectedPoints.length; j += step) {
            const p2 = projectedPoints[j];
            // Only connect points in adjacent layers or nearby
            if (Math.abs(p1.origPoint.layer - p2.origPoint.layer) > 1) continue;

            const dx = p1.px - p2.px;
            const dy = p1.py - p2.py;
            const distSq = dx * dx + dy * dy;

            if (distSq < maxDistSq) {
              const lineAlpha = (1 - Math.sqrt(distSq) / 42) * Math.min(p1.alpha, p2.alpha) * 0.45;
              ctx.strokeStyle = `rgba(59, 130, 246, ${lineAlpha})`;
              ctx.beginPath();
              ctx.moveTo(p1.px, p1.py);
              ctx.lineTo(p2.px, p2.py);
              ctx.stroke();
            }
          }
        }

        // Sweeping radar scanline angle
        const scanAngle = (time * 1.2) % (Math.PI * 2);

        // Draw nodes
        for (let i = 0; i < projectedPoints.length; i++) {
          const pt = projectedPoints[i];
          const nodeRadius = Math.max(0.8, (1.2 + (pt.pz > 0 ? 0.8 : 0)) * pt.scale);

          // Check if affected by click pulse
          let pulseBonus = 0;
          if (pulseRef.current.active) {
            const dx = pt.px - pulseRef.current.x;
            const dy = pt.py - pulseRef.current.y;
            const d = Math.sqrt(dx * dx + dy * dy);
            const diff = Math.abs(d - pulseRef.current.radius);
            if (diff < 25) {
              pulseBonus = (1 - diff / 25) * 0.7;
            }
          }

          // Check if aligned with radar sweep
          const nodeAngle = Math.atan2(pt.py - centerY, pt.px - centerX);
          let angleDiff = Math.abs(nodeAngle - (scanAngle - Math.PI));
          if (angleDiff > Math.PI) angleDiff = Math.PI * 2 - angleDiff;
          const sweepGlow = angleDiff < 0.25 ? (1 - angleDiff / 0.25) * 0.6 : 0;

          const finalAlpha = Math.min(1, pt.alpha + pulseBonus + sweepGlow);

          ctx.fillStyle = finalAlpha > 0.7 ? '#93C5FD' : pt.color;
          ctx.globalAlpha = finalAlpha;
          ctx.beginPath();
          ctx.arc(pt.px, pt.py, nodeRadius + pulseBonus * 2, 0, Math.PI * 2);
          ctx.fill();

          // Subtle corona on prominent front-most nodes
          if (pt.pz > 50 && pt.alpha > 0.7) {
            ctx.fillStyle = 'rgba(96, 165, 250, 0.25)';
            ctx.beginPath();
            ctx.arc(pt.px, pt.py, nodeRadius * 2.6, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        ctx.globalAlpha = 1;

        // Draw Outer Rotating Radar Rings & Tactical Reticles
        drawTacticalOverlay(ctx, centerX, centerY, baseRadius, time, scanAngle);

        // Draw click pulse wave
        if (pulseRef.current.active) {
          const progress = pulseRef.current.radius / pulseRef.current.maxRadius;
          ctx.strokeStyle = `rgba(96, 165, 250, ${(1 - progress) * 0.5})`;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(pulseRef.current.x, pulseRef.current.y, pulseRef.current.radius, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
      observer.disconnect();
      resizeObserver.disconnect();
    };
  }, []);

  // Tactical HUD radar overlay helper
  const drawTacticalOverlay = (
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    baseRadius: number,
    time: number,
    scanAngle: number
  ) => {
    // 1. Concentric dashed rings
    ctx.save();
    ctx.strokeStyle = 'rgba(30, 58, 110, 0.35)';
    ctx.lineWidth = 1;

    // Inner orbital
    ctx.beginPath();
    ctx.arc(cx, cy, baseRadius * 0.7, 0, Math.PI * 2);
    ctx.stroke();

    // Mid boundary
    ctx.beginPath();
    ctx.arc(cx, cy, baseRadius * 1.15, 0, Math.PI * 2);
    ctx.stroke();

    // Outer dashed ring (rotating slowly)
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(time * 0.05);
    ctx.strokeStyle = 'rgba(59, 130, 246, 0.22)';
    ctx.setLineDash([4, 12]);
    ctx.beginPath();
    ctx.arc(0, 0, baseRadius * 1.35, 0, Math.PI * 2);
    ctx.stroke();

    // Outer ticks
    ctx.setLineDash([]);
    const tickCount = 36;
    for (let i = 0; i < tickCount; i++) {
      const angle = (i / tickCount) * Math.PI * 2;
      const isMajor = i % 9 === 0;
      const r1 = baseRadius * 1.35;
      const r2 = r1 + (isMajor ? 8 : 4);
      ctx.strokeStyle = isMajor ? 'rgba(96, 165, 250, 0.45)' : 'rgba(59, 130, 246, 0.18)';
      ctx.beginPath();
      ctx.moveTo(Math.cos(angle) * r1, Math.sin(angle) * r1);
      ctx.lineTo(Math.cos(angle) * r2, Math.sin(angle) * r2);
      ctx.stroke();
    }
    ctx.restore();

    // 2. Tactical Center Crosshair Reticle
    ctx.strokeStyle = 'rgba(96, 165, 250, 0.3)';
    ctx.lineWidth = 1;
    const crossSize = 10;
    ctx.beginPath();
    ctx.moveTo(cx - crossSize, cy);
    ctx.lineTo(cx + crossSize, cy);
    ctx.moveTo(cx, cy - crossSize);
    ctx.lineTo(cx, cy + crossSize);
    ctx.stroke();

    // 3. Subtle rotating radar sweep line
    ctx.save();
    const sweepLen = baseRadius * 1.35;
    const gradient = ctx.createLinearGradient(
      cx,
      cy,
      cx + Math.cos(scanAngle) * sweepLen,
      cy + Math.sin(scanAngle) * sweepLen
    );
    gradient.addColorStop(0, 'rgba(59, 130, 246, 0.35)');
    gradient.addColorStop(0.8, 'rgba(96, 165, 250, 0.15)');
    gradient.addColorStop(1, 'rgba(59, 130, 246, 0)');

    ctx.strokeStyle = gradient;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(scanAngle) * sweepLen, cy + Math.sin(scanAngle) * sweepLen);
    ctx.stroke();
    ctx.restore();

    ctx.restore();
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const nx = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
    const ny = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
    mouseRef.current.targetX = nx;
    mouseRef.current.targetY = ny;
    mouseRef.current.isHovered = true;
  };

  const handleMouseLeave = () => {
    mouseRef.current.targetX = 0;
    mouseRef.current.targetY = 0;
    mouseRef.current.isHovered = false;
  };

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    pulseRef.current = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      radius: 0,
      maxRadius: 300,
      active: true,
    };
  };

  return (
    <div
      ref={containerRef}
      className="abstract-art-container"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
      aria-label="Abstract 3D Vector Manifold Art Visualizing ARGUS Surveillance Mesh"
      role="img"
    >
      <canvas ref={canvasRef} className="abstract-art-canvas" />
    </div>
  );
};
