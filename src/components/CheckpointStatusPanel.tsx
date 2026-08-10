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

    return { cp, latest, color, label };
  });

  return (
    <div
      className="panel"
      role="region"
      aria-label="Checkpoint status"
      style={{
        position: 'absolute',
        top: '72px',
        left: '16px',
        width: '300px',
        maxHeight: 'calc(100% - 160px)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 20,
        boxShadow: '0 12px 32px rgba(0,0,0,0.4)',
      }}
    >
      <div style={{
        padding: '12px 16px',
        borderBottom: '1px solid var(--border-hairline)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <h2 className="mono-display" style={{ fontSize: '0.9rem', margin: 0, color: 'var(--text-secondary)' }}>CHECKPOINTS</h2>
        <button
          onClick={onClose}
          aria-label="Close checkpoint panel"
          style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex' }}
        >
          <X size={16} />
        </button>
      </div>

      <div style={{ overflowY: 'auto', padding: '8px' }}>
        {rows.map(({ cp, latest, color, label }) => (
          <div key={cp.id} className="panel" style={{ padding: '10px 12px', marginBottom: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: color, flexShrink: 0 }} />
              <span style={{ fontSize: '0.85rem', flex: 1 }}>{cp.name}</span>
              <span className="numeric-data" style={{ fontSize: '0.65rem', color }}>{label}</span>
            </div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', paddingLeft: '16px' }}>
              {latest ? `Last activity ${formatDistanceToNow(latest.timestamp, { addSuffix: true })}` : 'No recent activity'}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};