import React, { useEffect, useRef, useState } from 'react';
import { type Match, CHECKPOINTS } from '../data/mockData';
import { format } from 'date-fns';
import { X, CheckCircle, AlertTriangle, Copy, Check } from 'lucide-react';

interface MatchDetailModalProps {
  match: Match;
  onClose: () => void;
  onConfirm: (id: string) => void;
  onDismiss: (id: string) => void;
}

export const MatchDetailModal: React.FC<MatchDetailModalProps> = ({ match, onClose, onConfirm, onDismiss }) => {
  const cp = CHECKPOINTS.find(c => c.id === match.checkpointId);
  const [copied, setCopied] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeButtonRef.current?.focus();
  }, []);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(match.personId);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API unavailable — fail silently, no crash
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Match details for ${match.personId}`}
      style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: '640px',
        backgroundColor: 'var(--bg-panel)',
        border: '1px solid var(--border-hairline)',
        zIndex: 200,
        boxShadow: '0 24px 48px rgba(0,0,0,0.5)'
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
        <h2 className="mono-display" style={{ fontSize: '1rem', margin: 0, color: 'var(--text-primary)' }}>
          MATCH DETAILS // ID: {match.id}
        </h2>
        <button
          ref={closeButtonRef}
          onClick={onClose}
          aria-label="Close match details"
          style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
        >
          <X size={20} />
        </button>
      </div>

      <div style={{ padding: '24px', display: 'flex', gap: '24px' }}>
        <div style={{ display: 'flex', gap: '12px', flex: 1 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '8px', textTransform: 'uppercase' }}>Reference (Database)</div>
            <div
              aria-label="Reference photo placeholder"
              style={{
                width: '100%',
                aspectRatio: '3/4',
                backgroundColor: 'var(--bg-void)',
                border: '1px solid var(--border-hairline)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--text-secondary)'
              }}
            >
              REF IMG
            </div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '8px', textTransform: 'uppercase' }}>Checkpoint (Live)</div>
            <div
              aria-label="Checkpoint photo placeholder"
              style={{
                width: '100%',
                aspectRatio: '3/4',
                backgroundColor: 'var(--bg-void)',
                border: '1px solid var(--border-hairline)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--text-secondary)'
              }}
            >
              LIVE IMG
            </div>
          </div>
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div style={{ marginBottom: '24px' }}>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>CONFIDENCE SCORE</div>
            <div className="numeric-data" style={{ fontSize: '2.5rem', color: match.confidence > 0.8 ? 'var(--accent-signal)' : 'var(--accent-alert)', lineHeight: 1 }}>
              {(match.confidence * 100).toFixed(1)}%
            </div>

            <div style={{ width: '100%', height: '4px', backgroundColor: 'var(--bg-void)', marginTop: '8px', position: 'relative' }}>
              <div style={{
                position: 'absolute',
                left: 0,
                top: 0,
                bottom: 0,
                width: `${match.confidence * 100}%`,
                backgroundColor: match.confidence > 0.8 ? 'var(--accent-signal)' : 'var(--accent-alert)',
                transition: 'width 0.3s ease',
              }} />
            </div>
          </div>

          <div style={{ marginBottom: '12px' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>PERSON ID</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div className="mono-display">{match.personId} ({match.name})</div>
              <button
                onClick={handleCopy}
                aria-label="Copy person ID to clipboard"
                title="Copy person ID"
                style={{ background: 'none', border: 'none', color: copied ? 'var(--accent-signal)' : 'var(--text-secondary)', cursor: 'pointer', padding: 0, display: 'flex' }}
              >
                {copied ? <Check size={13} /> : <Copy size={13} />}
              </button>
            </div>
          </div>

          <div style={{ marginBottom: '12px' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>CHECKPOINT</div>
            <div className="mono-display">{cp?.name}</div>
          </div>

          <div style={{ marginBottom: '24px' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>TIMESTAMP</div>
            <div className="numeric-data">{format(match.timestamp, 'yyyy-MM-dd HH:mm:ss')} UTC</div>
          </div>

          <div style={{ marginTop: 'auto', display: 'flex', gap: '12px' }}>
            {match.status === 'PENDING REVIEW' ? (
              <>
                <button className="button button-primary" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }} onClick={() => onConfirm(match.id)}>
                  <CheckCircle size={16} /> Confirm Match
                </button>
                <button className="button button-danger" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }} onClick={() => onDismiss(match.id)}>
                  <AlertTriangle size={16} /> Dismiss
                </button>
              </>
            ) : (
              <div style={{ padding: '12px', border: '1px solid var(--border-hairline)', width: '100%', textAlign: 'center', color: 'var(--text-secondary)' }}>
                This match is {match.status}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};