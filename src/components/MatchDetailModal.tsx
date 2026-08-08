import React, { useEffect, useRef, useState } from 'react';
import { type Match, CHECKPOINTS } from '../data/mockData';
import { format } from 'date-fns';
import { X, CheckCircle, AlertTriangle, Copy, Check, ShieldAlert } from 'lucide-react';

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
      // Clipboard API unavailable
    }
  };

  const isConfirmed = match.status === 'CONFIRMED';
  const isPending = match.status === 'PENDING REVIEW';

  const refImgSrc = match.referencePhotoUrl || `http://localhost:8000/static/gallery/${match.personId}_doe,_john.jpg`;
  const liveImgSrc = match.faceCropUrl || `http://localhost:8000/static/gallery/${match.personId}_doe,_john.jpg`;

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
        width: '680px',
        backgroundColor: 'var(--bg-panel)',
        border: '1px solid var(--border-hairline)',
        zIndex: 200,
        boxShadow: '0 24px 64px rgba(0,0,0,0.85)'
      }}
    >
      {/* Modal Header */}
      <div style={{
        padding: '12px 16px',
        borderBottom: '1px solid var(--border-hairline)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: 'var(--bg-panel-raised)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <ShieldAlert size={16} color={match.confidence >= 0.75 ? 'var(--accent-signal)' : 'var(--accent-alert)'} />
          <h2 className="mono-display" style={{ fontSize: '0.95rem', margin: 0, color: 'var(--text-primary)' }}>
            HUMAN REVIEW // SIGHTING ID: {match.id}
          </h2>
        </div>
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
        {/* Photos side-by-side: Reference Database vs Live Checkpoint Crop */}
        <div style={{ display: 'flex', gap: '12px', flex: 1.1 }}>
          {/* Reference Photo */}
          <div style={{ flex: 1 }}>
            <div style={{
              fontSize: '0.7rem',
              color: 'var(--text-secondary)',
              marginBottom: '6px',
              fontFamily: "'IBM Plex Mono', monospace",
              textTransform: 'uppercase'
            }}>
              Reference (Gallery)
            </div>
            <div
              style={{
                width: '100%',
                aspectRatio: '1/1',
                backgroundColor: 'var(--bg-void)',
                border: '1px solid var(--border-hairline)',
                overflow: 'hidden',
                position: 'relative'
              }}
            >
              <img
                src={refImgSrc}
                alt="Reference target"
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
              <div style={{
                position: 'absolute',
                bottom: '4px',
                left: '4px',
                backgroundColor: 'rgba(10, 14, 20, 0.85)',
                padding: '2px 6px',
                fontSize: '0.65rem',
                fontFamily: "'IBM Plex Mono', monospace"
              }}>
                ARCFACE 512D
              </div>
            </div>
          </div>

          {/* Live Checkpoint Crop */}
          <div style={{ flex: 1 }}>
            <div style={{
              fontSize: '0.7rem',
              color: 'var(--text-secondary)',
              marginBottom: '6px',
              fontFamily: "'IBM Plex Mono', monospace",
              textTransform: 'uppercase'
            }}>
              Checkpoint (Live)
            </div>
            <div
              style={{
                width: '100%',
                aspectRatio: '1/1',
                backgroundColor: 'var(--bg-void)',
                border: '1px solid var(--border-hairline)',
                overflow: 'hidden',
                position: 'relative'
              }}
            >
              <img
                src={liveImgSrc}
                alt="Live checkpoint crop"
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
              <div style={{
                position: 'absolute',
                bottom: '4px',
                left: '4px',
                backgroundColor: 'rgba(10, 14, 20, 0.85)',
                padding: '2px 6px',
                fontSize: '0.65rem',
                color: match.confidence >= 0.75 ? 'var(--accent-signal)' : 'var(--accent-alert)',
                fontFamily: "'IBM Plex Mono', monospace"
              }}>
                RETINAFACE-MOBILENET
              </div>
            </div>
          </div>
        </div>

        {/* Data panel & Decision Actions */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div style={{ marginBottom: '18px' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '2px', fontFamily: "'IBM Plex Mono', monospace" }}>
              COSINE SIMILARITY SCORE
            </div>
            <div className="numeric-data" style={{
              fontSize: '2.2rem',
              color: match.confidence >= 0.75 ? 'var(--accent-signal)' : 'var(--accent-alert)',
              lineHeight: 1
            }}>
              {(match.confidence * 100).toFixed(1)}%
            </div>

            {/* Dual Threshold Indicator Meter */}
            <div style={{ width: '100%', height: '4px', backgroundColor: 'var(--bg-void)', marginTop: '8px', position: 'relative' }}>
              <div style={{
                position: 'absolute',
                left: 0,
                top: 0,
                bottom: 0,
                width: `${match.confidence * 100}%`,
                backgroundColor: match.confidence >= 0.75 ? 'var(--accent-signal)' : 'var(--accent-alert)',
                transition: 'width 0.3s ease',
              }} />
              {/* Confirmed Threshold Marker (75%) */}
              <div style={{
                position: 'absolute',
                left: '75%',
                top: '-3px',
                bottom: '-3px',
                width: '2px',
                backgroundColor: 'var(--text-primary)',
                opacity: 0.8
              }} title="Confirmed Threshold (0.75)" />
            </div>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: '0.65rem',
              color: 'var(--text-secondary)',
              marginTop: '4px',
              fontFamily: "'IBM Plex Mono', monospace"
            }}>
              <span>0%</span>
              <span>REVIEW (60%)</span>
              <span>CONFIRMED (75%)</span>
              <span>100%</span>
            </div>
          </div>

          <div style={{ marginBottom: '10px' }}>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontFamily: "'IBM Plex Mono', monospace" }}>PERSON ID</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div className="mono-display" style={{ fontSize: '0.9rem' }}>{match.personId} ({match.name})</div>
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

          <div style={{ marginBottom: '10px' }}>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontFamily: "'IBM Plex Mono', monospace" }}>CHECKPOINT</div>
            <div className="mono-display" style={{ fontSize: '0.9rem' }}>{cp?.name || match.checkpointId}</div>
          </div>

          <div style={{ marginBottom: '16px' }}>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontFamily: "'IBM Plex Mono', monospace" }}>TIMESTAMP</div>
            <div className="numeric-data" style={{ fontSize: '0.85rem' }}>{format(match.timestamp, 'yyyy-MM-dd HH:mm:ss')} UTC</div>
          </div>

          {/* Action Buttons for Human-in-the-Loop Confirmation */}
          <div style={{ marginTop: 'auto', display: 'flex', gap: '10px' }}>
            {isPending ? (
              <>
                <button
                  className="button button-primary"
                  style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    padding: '8px',
                    fontSize: '0.8rem',
                    fontFamily: "'IBM Plex Mono', monospace"
                  }}
                  onClick={() => onConfirm(match.id)}
                >
                  <CheckCircle size={15} /> Confirm Match
                </button>
                <button
                  className="button button-danger"
                  style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    padding: '8px',
                    fontSize: '0.8rem',
                    fontFamily: "'IBM Plex Mono', monospace"
                  }}
                  onClick={() => onDismiss(match.id)}
                >
                  <AlertTriangle size={15} /> Dismiss
                </button>
              </>
            ) : (
              <div style={{
                padding: '10px',
                border: '1px solid var(--border-hairline)',
                width: '100%',
                textAlign: 'center',
                color: isConfirmed ? 'var(--accent-signal)' : 'var(--text-secondary)',
                fontSize: '0.8rem',
                fontFamily: "'IBM Plex Mono', monospace",
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px'
              }}>
                This match is {match.status}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};