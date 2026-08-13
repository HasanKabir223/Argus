import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { CHECKPOINTS, type Match } from '../data/mockData';
import { formatDistanceToNow } from 'date-fns';

interface CheckpointStatusPanelProps {
  matches: Match[];
  onClose: () => void;
}

export const CheckpointStatusPanel: React.FC<CheckpointStatusPanelProps> = ({ matches, onClose }) => {
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const rows = CHECKPOINTS.map(cp => {
    const cpMatches = matches
      .filter(m => m.checkpointId === cp.id)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    const latest = cpMatches[0];
    const hasPending = cpMatches.some(m => m.status === 'PENDING REVIEW');
    const hasConfirmed = cpMatches.some(m => m.status === 'CONFIRMED');

    let color = 'var(--accent-muted)';
    let label = 'IDLE';
    if (hasPending) { color = 'var(--accent-alert)'; label = 'ALERT'; }
    else if (hasConfirmed) { color = 'var(--accent-signal)'; label = 'CONFIRMED'; }

    return { cp, latest, color, label, matchCount: cpMatches.length };
  });

  return (
    <div
      className="panel"
      role="region"
      aria-label="Nationwide Checkpoints Status"
      style={{
        position: 'absolute',
        top: '72px',
        left: '16px',
        width: '320px',
        maxHeight: 'calc(100% - 160px)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 60,
        boxShadow: '0 16px 40px rgba(0,0,0,0.7)',
        backgroundColor: 'var(--bg-panel)'
      }}
    >
      <div style={{
        padding: '12px 16px',
        borderBottom: '1px solid var(--border-hairline)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: 'var(--bg-panel-raised)'
      }}>
        <div>
          <h2 className="mono-display" style={{ fontSize: '0.88rem', margin: 0, color: 'var(--accent-signal)' }}>
            NATIONWIDE HUBS ({CHECKPOINTS.length})
          </h2>
          <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', fontFamily: "'IBM Plex Mono', monospace" }}>
            US HOMELAND SURVEILLANCE GRID
          </div>
        </div>
        <button
          onClick={onClose}
          aria-label="Close checkpoint panel"
          style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex' }}
        >
          <X size={16} />
        </button>
      </div>

      <div style={{ overflowY: 'auto', padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {rows.map(({ cp, latest, color, label, matchCount }) => (
          <div
            key={cp.id}
            style={{
              padding: '10px 12px',
              backgroundColor: 'var(--bg-void)',
              border: '1px solid var(--border-hairline)',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: color, flexShrink: 0 }} />
                <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-primary)', fontFamily: "'IBM Plex Mono', monospace" }}>
                  {cp.city}, {cp.state}
                </span>
              </div>
              <span className="numeric-data" style={{ fontSize: '0.65rem', color, fontWeight: 700, border: `1px solid ${color}`, padding: '1px 5px' }}>
                {label} {matchCount > 0 ? `(${matchCount})` : ''}
              </span>
            </div>

            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontFamily: "'IBM Plex Mono', monospace" }}>
              {cp.name}
            </div>

            <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', fontFamily: "'IBM Plex Mono', monospace", borderTop: '1px solid #1a202c', paddingTop: '4px', marginTop: '2px' }}>
              {latest ? `Last active ${formatDistanceToNow(latest.timestamp, { addSuffix: true })}` : 'Monitoring passive sector'}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};