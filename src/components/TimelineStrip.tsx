import React, { useCallback, useEffect, useRef, useState } from 'react';
import { type Match } from '../data/mockData';
import { format } from 'date-fns';

interface TimelineStripProps {
  matches: Match[];
  onSelectPerson: (personId: string) => void;
  /** Epoch ms the operator has scrubbed back to, or null when live (PRD §5.3
   *  Screen 5: "Drag playhead → globe/map replays up to that point in time"). */
  replayTime: number | null;
  onScrub: (time: number | null) => void;
}

// Releasing the playhead within this % of the right edge snaps back to live.
const LIVE_SNAP_THRESHOLD_PERCENT = 3;

export const TimelineStrip: React.FC<TimelineStripProps> = ({ matches, onSelectPerson, replayTime, onScrub }) => {
  const sortedMatches = [...matches].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  const trackRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const now = Date.now();
  const twentyFourHoursAgo = now - 24 * 60 * 60 * 1000;
  const totalDuration = now - twentyFourHoursAgo;

  const timeFromClientX = useCallback((clientX: number) => {
    const track = trackRef.current;
    if (!track) return now;
    const rect = track.getBoundingClientRect();
    const percent = Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100));
    return twentyFourHoursAgo + (percent / 100) * totalDuration;
  }, [now, twentyFourHoursAgo, totalDuration]);

  const percentFromTime = (t: number) => Math.min(100, Math.max(0, ((t - twentyFourHoursAgo) / totalDuration) * 100));

  const handlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    setIsDragging(true);
    onScrub(timeFromClientX(e.clientX));
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleMove = (e: PointerEvent) => {
      onScrub(timeFromClientX(e.clientX));
    };

    const handleUp = (e: PointerEvent) => {
      setIsDragging(false);
      const percent = trackRef.current
        ? ((e.clientX - trackRef.current.getBoundingClientRect().left) / trackRef.current.getBoundingClientRect().width) * 100
        : 100;
      // Released near the live edge — snap back to live instead of parking
      // the replay a few pixels shy of "now".
      if (percent >= 100 - LIVE_SNAP_THRESHOLD_PERCENT) {
        onScrub(null);
      }
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };
  }, [isDragging, onScrub, timeFromClientX]);

  const isReplaying = replayTime !== null;
  const playheadPercent = isReplaying ? percentFromTime(replayTime) : 100;

  return (
    <div className="panel timeline-strip" role="region" aria-label="24 hour match timeline, drag to replay">
      <div className="numeric-data" style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginRight: '16px', flexShrink: 0 }}>
        -24H
      </div>

      <div
        ref={trackRef}
        onPointerDown={handlePointerDown}
        style={{
          flex: 1,
          height: '20px',
          position: 'relative',
          cursor: isDragging ? 'grabbing' : 'pointer',
          touchAction: 'none',
        }}
      >
        {/* Base rail */}
        <div style={{
          position: 'absolute',
          top: '50%',
          left: 0,
          right: 0,
          height: '2px',
          backgroundColor: 'var(--border-hairline)',
          transform: 'translateY(-50%)',
        }} />

        {/* Elapsed rail up to the playhead, so scrubbed range reads as "revealed" */}
        <div style={{
          position: 'absolute',
          top: '50%',
          left: 0,
          width: `${playheadPercent}%`,
          height: '2px',
          backgroundColor: isReplaying ? 'var(--accent-amber)' : 'var(--accent-signal)',
          opacity: 0.35,
          transform: 'translateY(-50%)',
          pointerEvents: 'none',
        }} />

        {sortedMatches.map(match => {
          if (match.timestamp.getTime() < twentyFourHoursAgo) return null;

          const percent = percentFromTime(match.timestamp.getTime());
          const isFuture = isReplaying && match.timestamp.getTime() > replayTime;

          let color = 'var(--text-secondary)';
          if (match.status === 'PENDING REVIEW') color = 'var(--accent-alert)';
          if (match.status === 'CONFIRMED') color = 'var(--accent-signal)';

          return (
            <div
              key={match.id}
              role="button"
              tabIndex={0}
              aria-label={`Match ${match.personId} at ${format(match.timestamp, 'HH:mm:ss')}`}
              onClick={(e) => {
                e.stopPropagation();
                onSelectPerson(match.personId);
              }}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelectPerson(match.personId);
                }
              }}
              style={{
                position: 'absolute',
                left: `${percent}%`,
                top: '50%',
                transform: 'translate(-50%, -50%)',
                width: '6px',
                height: '12px',
                backgroundColor: color,
                opacity: isFuture ? 0.25 : 1,
                cursor: 'pointer',
                transition: 'transform 0.12s ease, opacity 0.15s ease',
                zIndex: 2,
              }}
              onMouseEnter={e => {
                e.currentTarget.style.transform = 'translate(-50%, -50%) scaleY(1.6)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.transform = 'translate(-50%, -50%) scaleY(1)';
              }}
              title={`Click to view: ${match.personId} at ${format(match.timestamp, 'HH:mm:ss')}`}
            />
          );
        })}

        {/* Draggable playhead */}
        <div
          aria-hidden="true"
          className={isReplaying ? '' : 'timeline-now-pulse'}
          style={{
            position: 'absolute',
            left: `${playheadPercent}%`,
            top: '50%',
            transform: 'translate(-50%, -50%)',
            width: '2px',
            height: '16px',
            backgroundColor: isReplaying ? 'var(--accent-amber)' : 'var(--accent-signal)',
            zIndex: 3,
            pointerEvents: 'none',
          }}
        />
        {/* Wider invisible grab handle around the playhead, for easier dragging */}
        <div
          onPointerDown={(e) => {
            e.stopPropagation();
            handlePointerDown(e);
          }}
          style={{
            position: 'absolute',
            left: `${playheadPercent}%`,
            top: '50%',
            transform: 'translate(-50%, -50%)',
            width: '16px',
            height: '20px',
            cursor: isDragging ? 'grabbing' : 'grab',
            zIndex: 4,
          }}
        />
      </div>

      <div
        className="numeric-data"
        style={{
          fontSize: '0.75rem',
          marginLeft: '16px',
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          lineHeight: 1.3,
        }}
      >
        {isReplaying ? (
          <>
            <span style={{ color: 'var(--accent-amber)' }}>REPLAY {format(replayTime, 'HH:mm:ss')}</span>
            <button
              onClick={() => onScrub(null)}
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                marginTop: '2px',
                color: 'var(--text-secondary)',
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: '0.65rem',
                textTransform: 'uppercase',
                cursor: 'pointer',
                textDecoration: 'underline',
              }}
            >
              Return to live
            </button>
          </>
        ) : (
          <span style={{ color: 'var(--text-secondary)' }}>NOW</span>
        )}
      </div>
    </div>
  );
};