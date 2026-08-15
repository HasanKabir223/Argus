import { useEffect, useRef } from 'react';

/**
 * Apple-style specular spotlight effect for cards.
 * Tracks pointer coordinates relative to card element to project a smooth,
 * luminous radial gradient on hover. Respects prefers-reduced-motion.
 */
export function useSpotlight<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }

    const handlePointerMove = (e: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      el.style.setProperty('--mouse-x', `${x}px`);
      el.style.setProperty('--mouse-y', `${y}px`);
    };

    el.addEventListener('pointermove', handlePointerMove);
    return () => {
      el.removeEventListener('pointermove', handlePointerMove);
    };
  }, []);

  return ref;
}
