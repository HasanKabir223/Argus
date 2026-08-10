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

  // Reset failure state if a new src comes in (e.g. list item recycled).
  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (failed) {
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
      src={src}
      alt={alt}
      className={className}
      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
      onError={() => setFailed(true)}
    />
  );
};