import React from 'react';
import { type Match } from '../data/mockData';
import { format } from 'date-fns';

interface TimelineStripProps {
  matches: Match[];
}

export const TimelineStrip: React.FC<TimelineStripProps> = ({ matches }) => {
  // Sort matches by time to find min and max
  const sortedMatches = [...matches].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  
  const now = new Date();
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  
  const totalDuration = now.getTime() - twentyFourHoursAgo.getTime();

  return (
    <div className="panel" style={{
      position: 'absolute',
      bottom: '16px',
      left: '16px',
      right: '392px', // leaves room for the side panel
      height: '48px',
      display: 'flex',
      alignItems: 'center',
      padding: '0 16px',
      zIndex: 10,
    }}>
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
              style={{
                position: 'absolute',
                left: `${percent}%`,
                top: '50%',
                transform: 'translate(-50%, -50%)',
                width: '6px',
                height: '12px',
                backgroundColor: color,
                cursor: 'pointer'
              }}
              title={`Match ${match.personId} at ${format(match.timestamp, 'HH:mm:ss')}`}
            />
          );
        })}
        
        {/* Live edge indicator */}
        <div style={{
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
