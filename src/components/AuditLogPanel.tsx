import React, { useEffect } from 'react';
import { X, Download } from 'lucide-react';
import { format } from 'date-fns';

export interface AuditEntry {
  id: string;
  action: 'CONFIRMED' | 'DISMISSED';
  personId: string;
  matchId: string;
  checkpointName: string;
  timestamp: Date;
}

interface AuditLogPanelProps {
  entries: AuditEntry[];
  onClose: () => void;
}

export const AuditLogPanel: React.FC<AuditLogPanelProps> = ({ entries, onClose }) => {
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const handleExport = () => {
    const header = 'timestamp,action,person_id,match_id,checkpoint\n';
    const rows = entries
      .slice()
      .reverse()
      .map(e => `${e.timestamp.toISOString()},${e.action},${e.personId},${e.matchId},"${e.checkpointName}"`)
      .join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mini-gotham-audit-log-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Audit log"
      className="panel"
      style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: '600px',
        maxHeight: '70vh',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 200,
        boxShadow: '0 24px 48px rgba(0,0,0,0.5)',
      }}
    >
      <div style={{
        padding: '12px 16px',
        borderBottom: '1px solid var(--border-hairline)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: 'var(--bg-panel-raised)',
      }}>
        <h2 className="mono-display" style={{ fontSize: '1rem', margin: 0 }}>AUDIT LOG // {entries.length} ACTIONS</h2>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            onClick={handleExport}
            disabled={entries.length === 0}
            className="button"
            style={{ display: 'flex', alignItems: 'center', gap: '6px', opacity: entries.length === 0 ? 0.4 : 1, cursor: entries.length === 0 ? 'not-allowed' : 'pointer' }}
          >
            <Download size={13} /> Export CSV
          </button>
          <button onClick={onClose} aria-label="Close audit log" style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex' }}>
            <X size={20} />
          </button>
        </div>
      </div>

      <div style={{ overflowY: 'auto', padding: '8px' }}>
        {entries.length === 0 ? (
          <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
            No reviewer actions yet. Confirm or dismiss a match to see it logged here.
          </div>
        ) : (
          entries.slice().reverse().map(e => (
            <div key={e.id} className="panel" style={{ padding: '10px 12px', marginBottom: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
              <div>
                <span className={`badge ${e.action === 'CONFIRMED' ? 'badge-confirmed' : 'badge-dismissed'}`}>{e.action}</span>
                <div style={{ fontSize: '0.8rem', marginTop: '6px' }}>
                  {e.personId} <span style={{ color: 'var(--text-secondary)' }}>@ {e.checkpointName}</span>
                </div>
              </div>
              <div className="numeric-data" style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                {format(e.timestamp, 'yyyy-MM-dd HH:mm:ss')}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};