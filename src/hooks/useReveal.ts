import { useEffect, useRef, useState } from 'react';

/**
 * Scroll-triggered reveal hook.
 * Attaches an IntersectionObserver to the returned ref and flips `inView`
 * to true (once) the moment the element crosses the given threshold.
 * Respects prefers-reduced-motion by resolving as "already in view" so
 * nothing depends on a transition to become visible/usable.
 */
export function useReveal<T extends HTMLElement = HTMLDivElement>(
  threshold = 0.18
) {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const prefersReduced = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches;
    if (prefersReduced) {
      setInView(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setInView(true);
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold, rootMargin: '0px 0px -8% 0px' }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [threshold]);

  return { ref, inView };
}
