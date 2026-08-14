import React, { useEffect, useState } from 'react';

interface FaceThumbProps {
  src: string;
  alt: string;
  /** Used to derive the placeholder monogram when the image fails to load. */
  personId?: string;
  className?: string;
}

/**
 * Renders a face crop/reference image. If the src 404s or otherwise fails,
 * shows an identity-bearing monogram placeholder instead of silently
 * collapsing to an empty box — a broken <img> reads as "unfinished," a
 * labelled placeholder reads as "no photo on file for this ID."
 */
export const FaceThumb: React.FC<FaceThumbProps> = ({ src, alt, personId, className }) => {
  const [failed, setFailed] = useState(false);
  const [candidateIndex, setCandidateIndex] = useState(0);
  const [candidates, setCandidates] = useState<string[]>([]);

  useEffect(() => {
    const list: string[] = [];
    if (src) {
      list.push(src);
      if (src.startsWith('http://localhost:8000/')) {
        list.push(src.replace('http://localhost:8000', ''));
      }
    }
    // Check local image vault if personId is provided
    if (personId) {
      try {
        const raw = localStorage.getItem('sentinel_watchlist_images_vault');
        if (raw) {
          const vault = JSON.parse(raw);
          if (vault[personId] && !list.includes(vault[personId])) {
            list.push(vault[personId]);
          }
        }
      } catch {}
    }
    setCandidates(list.filter(Boolean));
    setCandidateIndex(0);
    setFailed(false);
  }, [src, personId]);

  const currentSrc = candidates[candidateIndex];

  const handleError = () => {
    if (candidateIndex < candidates.length - 1) {
      setCandidateIndex(prev => prev + 1);
    } else {
      setFailed(true);
    }
  };

  if (failed || !currentSrc) {
    const initials = (personId || alt || '?')
      .replace(/^p-/i, '')
      .replace(/[^a-z0-9]/gi, '')
      .slice(0, 3)
      .toUpperCase() || '?';

    return (
      <div
        className={className}
        role="img"
        aria-label={`${alt} (no photo on file)`}
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text-secondary)',
          fontFamily: "'IBM Plex Mono', monospace",
          fontSize: '0.78rem',
          letterSpacing: '0.04em',
          background:
            'repeating-linear-gradient(135deg, var(--bg-panel) 0px, var(--bg-panel) 5px, var(--bg-void) 5px, var(--bg-void) 10px)',
        }}
      >
        {initials}
      </div>
    );
  }

  return (
    <img
      src={currentSrc}
      alt={alt}
      className={className}
      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
      onError={handleError}
    />
  );
};