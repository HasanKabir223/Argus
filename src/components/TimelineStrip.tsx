import React from 'react';
import { type Match } from '../data/mockData';
import { format } from 'date-fns';

interface TimelineStripProps {
  matches: Match[];
  onSelectPerson: (personId: string) => void;
}

export const TimelineStrip: React.FC<TimelineStripProps> = ({ matches, onSelectPerson }) => {
  const sortedMatches = [...matches].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  const now = new Date();
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const totalDuration = now.getTime() - twentyFourHoursAgo.getTime();

  return (
    <div className="panel timeline-strip" role="region" aria-label="24 hour match timeline">
      <div className="numeric-data" style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginRight: '16px' }}>
        -24H
      </div>

      <div style={{ flex: 1, height: '2px', backgroundColor: 'var(--border-hairline)', position: 'relative' }}>
        {sortedMatches.map(match => {
          if (match.timestamp < twentyFourHoursAgo) return null;

          const offsetTime = match.timestamp.getTime() - twentyFourHoursAgo.getTime();
          const percent = (offsetTime / totalDuration) * 100;

          let color = 'var(--text-secondary)';
          if (match.status === 'PENDING REVIEW') color = 'var(--accent-alert)';
          if (match.status === 'CONFIRMED') color = 'var(--accent-signal)';

          return (
            <div
              key={match.id}
              role="button"
              tabIndex={0}
              aria-label={`Match ${match.personId} at ${format(match.timestamp, 'HH:mm:ss')}`}
              onClick={() => onSelectPerson(match.personId)}
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
                cursor: 'pointer',
                transition: 'transform 0.12s ease',
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

        <div className="timeline-now-pulse" style={{
          position: 'absolute',
          right: 0,
          top: '50%',
          transform: 'translate(50%, -50%)',
          width: '2px',
          height: '16px',
          backgroundColor: 'var(--accent-signal)'
        }} />
      </div>

      <div className="numeric-data" style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginLeft: '16px' }}>
        NOW
      </div>
    </div>
  );
};