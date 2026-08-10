import { useEffect, useRef } from 'react';

/**
 * Magnetic hover effect for CTAs (Emil Kowalski-style: the element leans
 * gently toward the cursor, then springs back on leave). Strength is
 * capped so it never travels far from its resting position.
 * No-ops entirely under prefers-reduced-motion.
 */
export function useMagnetic<T extends HTMLElement = HTMLButtonElement>(
  strength = 0.35,
  maxOffset = 14
) {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }

    const handleMove = (e: MouseEvent) => {
      const rect = node.getBoundingClientRect();
      const relX = e.clientX - (rect.left + rect.width / 2);
      const relY = e.clientY - (rect.top + rect.height / 2);
      const x = Math.max(-maxOffset, Math.min(maxOffset, relX * strength));
      const y = Math.max(-maxOffset, Math.min(maxOffset, relY * strength));
      node.style.transform = `translate(${x}px, ${y}px)`;
    };

    const handleLeave = () => {
      node.style.transform = 'translate(0px, 0px)';
    };

    node.addEventListener('mousemove', handleMove);
    node.addEventListener('mouseleave', handleLeave);
    return () => {
      node.removeEventListener('mousemove', handleMove);
      node.removeEventListener('mouseleave', handleLeave);
    };
  }, [strength, maxOffset]);

  return ref;
}
