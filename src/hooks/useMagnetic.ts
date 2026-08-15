import { useEffect, useRef } from 'react';

/**
 * Apple Design Fluid Magnetic Hook
 * Translates an interactive element smoothly toward pointer on hover using
 * physics-based interpolation. Provides instant press response on pointer-down
 * and smooth critically damped spring reset on release/leave.
 */
export function useMagnetic<T extends HTMLElement = HTMLButtonElement>(
  strength = 0.28,
  maxOffset = 12
) {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }

    let animationFrameId: number | null = null;
    let targetX = 0;
    let targetY = 0;
    let currentX = 0;
    let currentY = 0;
    let isHovering = false;

    const animate = () => {
      // Spring lerp with response = ~0.35s (critically damped)
      const ease = 0.18;
      currentX += (targetX - currentX) * ease;
      currentY += (targetY - currentY) * ease;

      if (node) {
        node.style.transform = `translate3d(${currentX.toFixed(2)}px, ${currentY.toFixed(2)}px, 0)`;
      }

      if (isHovering || Math.abs(targetX - currentX) > 0.05 || Math.abs(targetY - currentY) > 0.05) {
        animationFrameId = requestAnimationFrame(animate);
      } else {
        if (node) {
          node.style.transform = 'translate3d(0px, 0px, 0)';
        }
        animationFrameId = null;
      }
    };

    const handlePointerMove = (e: PointerEvent) => {
      const rect = node.getBoundingClientRect();
      const relX = e.clientX - (rect.left + rect.width / 2);
      const relY = e.clientY - (rect.top + rect.height / 2);
      targetX = Math.max(-maxOffset, Math.min(maxOffset, relX * strength));
      targetY = Math.max(-maxOffset, Math.min(maxOffset, relY * strength));

      if (!isHovering) {
        isHovering = true;
        if (!animationFrameId) {
          animationFrameId = requestAnimationFrame(animate);
        }
      }
    };

    const handlePointerLeave = () => {
      isHovering = false;
      targetX = 0;
      targetY = 0;
      if (!animationFrameId) {
        animationFrameId = requestAnimationFrame(animate);
      }
    };

    node.addEventListener('pointermove', handlePointerMove);
    node.addEventListener('pointerleave', handlePointerLeave);

    return () => {
      node.removeEventListener('pointermove', handlePointerMove);
      node.removeEventListener('pointerleave', handlePointerLeave);
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [strength, maxOffset]);

  return ref;
}
