import React, { useEffect, useRef, useState } from 'react';
import { type Match, CHECKPOINTS } from '../data/mockData';
import { format } from 'date-fns';
import { X, CheckCircle, AlertTriangle, Copy, Check, ShieldAlert, Fingerprint, Flag, History } from 'lucide-react';
import { getConfidenceColor } from '../utils/confidence';
import { FaceThumb } from './FaceThumb';

interface MatchDetailModalProps {
  match: Match;
  sightingHistory: Match[];
  onClose: () => void;
  onConfirm: (id: string) => void;
  onDismiss: (id: string) => void;
  onFlag: (id: string) => void;
  onSelectSighting: (matchId: string) => void;
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export const MatchDetailModal: React.FC<MatchDetailModalProps> = ({
  match,
  sightingHistory,
  onClose,
  onConfirm,
  onDismiss,
  onFlag,
  onSelectSighting,
}) => {
  const cp = CHECKPOINTS.find(c => c.id === match.checkpointId);
  const [copied, setCopied] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    closeButtonRef.current?.focus();
  }, []);

  // Focus trap
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;

    const getFocusable = (): HTMLElement[] =>
      Array.from(modalRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? []).filter(
        el => !el.hasAttribute('disabled') && el.tabIndex !== -1
      );

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;

      const focusable = getFocusable();
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('keydown', handleKey);
      previouslyFocused?.focus?.();
    };
  }, [onClose]);

  const handleCopy = () => {
    navigator.clipboard.writeText(match.personId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const confidencePct = Math.round(match.confidence * 100);
  const isConfirmed = match.status === 'CONFIRMED';
  const isPending = match.status === 'PENDING REVIEW';
  const hashPreview = "bf0e06a617cbf470b39226d411ebb031";

  return (
    <div
      ref={modalRef}
      role="dialog"
      aria-modal="true"
      aria-label={`Match details for ${match.personId}`}
      className="slide-over-enter"
      style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: '680px',
        maxWidth: '92vw',
        maxHeight: '90vh',
        backgroundColor: 'var(--bg-panel)',
        border: '1px solid var(--border-hairline)',
        boxShadow: '0 24px 64px rgba(0,0,0,0.85)',
        zIndex: 160,
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        backdropFilter: 'blur(12px)'
      }}
    >
      {/* Modal Header */}
      <div style={{
        padding: '14px 20px',
        borderBottom: '1px solid var(--border-hairline)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: 'var(--bg-panel-raised)',
        position: 'sticky',
        top: 0,
        zIndex: 1
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <ShieldAlert size={18} color={getConfidenceColor(match.confidence)} />
          <h2 className="mono-display" style={{ fontSize: '0.95rem', margin: 0, color: 'var(--text-primary)' }}>
            SURVEILLANCE SIGHTING // ID: {match.id}
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

      <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* Top: Side-by-Side Face Comparison & Cosine Meter */}
        <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
          {/* Side-by-side photos */}
          <div style={{ display: 'flex', gap: '12px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', fontFamily: "'IBM Plex Mono', monospace" }}>
                REFERENCE (GALLERY)
              </span>
              <div style={{ width: '110px', height: '110px', overflow: 'hidden', borderRadius: '2px', border: '1px solid var(--border-hairline)' }}>
                <FaceThumb
                  src={match.referencePhotoUrl || ''}
                  alt={match.name || match.personId}
                  personId={match.personId}
                />
              </div>
              <span style={{ fontSize: '0.62rem', color: 'var(--text-secondary)', fontFamily: "'IBM Plex Mono', monospace" }}>
                EMBEDDING 64D
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', fontFamily: "'IBM Plex Mono', monospace" }}>
                CCTV CLIP (LIVE)
              </span>
              <div style={{ width: '110px', height: '110px', overflow: 'hidden', borderRadius: '2px', border: '1px solid var(--border-hairline)' }}>
                <FaceThumb
                  src={match.faceCropUrl || ''}
                  alt="LIVE CCTV"
                  personId={match.personId}
                />
              </div>
              <span style={{ fontSize: '0.62rem', color: 'var(--accent-signal)', fontFamily: "'IBM Plex Mono', monospace" }}>
                RETINAFACE + LSH
              </span>
            </div>
          </div>

          {/* Similarity & Metadata */}
          <div style={{ flex: 1, minWidth: '220px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontFamily: "'IBM Plex Mono', monospace" }}>
                COSINE SIMILARITY SCORE
              </div>
              <div className="mono-display" style={{ fontSize: '2rem', fontWeight: 700, color: getConfidenceColor(match.confidence), lineHeight: 1.1 }}>
                {match.confidence ? `${(match.confidence * 100).toFixed(1)}%` : `${confidencePct}%`}
              </div>

              {/* Progress bar with threshold indicator */}
              <div style={{ position: 'relative', margin: '8px 0 16px' }}>
                <div style={{ height: '5px', backgroundColor: 'var(--bg-void)', borderRadius: '2px', overflow: 'hidden' }}>
                  <div style={{
                    height: '100%',
                    width: `${confidencePct}%`,
                    backgroundColor: getConfidenceColor(match.confidence),
                    transition: 'width 0.3s ease'
                  }} />
                </div>
                {/* 75% threshold marker */}
                <div style={{
                  position: 'absolute',
                  top: '-3px',
                  left: '75%',
                  width: '2px',
                  height: '11px',
                  backgroundColor: '#fff'
                }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.62rem', color: 'var(--text-secondary)', marginTop: '4px', fontFamily: "'IBM Plex Mono', monospace" }}>
                  <span>0%</span>
                  <span>REVIEW (60%)</span>
                  <span>CONFIRMED (75%)</span>
                  <span>100%</span>
                </div>
              </div>
            </div>

            <div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontFamily: "'IBM Plex Mono', monospace" }}>
                PERSON ID & NAME
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                <strong style={{ fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                  {match.personId} ({match.name || 'Wanted Suspect'})
                </strong>
                <button
                  onClick={handleCopy}
                  aria-label="Copy person ID"
                  style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: 0 }}
                >
                  {copied ? <Check size={13} color="var(--accent-signal)" /> : <Copy size={13} />}
                </button>
              </div>

              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontFamily: "'IBM Plex Mono', monospace" }}>
                CHECKPOINT & CAMERA
              </div>
              <div style={{ fontSize: '0.82rem', color: 'var(--text-primary)' }}>
                <strong>{cp?.name || match.checkpointId}</strong>
                {cp && <span style={{ color: 'var(--text-secondary)', marginLeft: '6px' }}>GPS: {cp.lat.toFixed(4)}, {cp.lng.toFixed(4)}</span>}
              </div>

              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontFamily: "'IBM Plex Mono', monospace", marginTop: '6px' }}>
                SIGHTING TIMESTAMP
              </div>
              <div style={{ fontSize: '0.82rem', color: 'var(--text-primary)', fontFamily: "'IBM Plex Mono', monospace" }}>
                {format(match.timestamp, 'yyyy-MM-dd HH:mm:ss')} UTC
              </div>
            </div>
          </div>
        </div>

        {/* LSH & FAISS Telemetry Banner */}
        <div style={{
          backgroundColor: '#070A0E',
          border: '1px solid var(--border-hairline)',
          padding: '10px 14px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontFamily: "'IBM Plex Mono', monospace",
          fontSize: '0.72rem',
          color: 'var(--text-secondary)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Fingerprint size={14} color="var(--accent-signal)" />
            <span>128-BIT LSH HASH SIGNATURE</span>
            <span style={{ color: '#38bdf8' }}>{hashPreview.slice(0, 24)}...</span>
          </div>
          <div>
            HAMMING DIST: <strong style={{ color: 'var(--accent-signal)' }}>2 BITS (POPCOUNT)</strong>
          </div>
          <div>
            ANN ENGINE: <strong style={{ color: '#a855f7' }}>FAISS HNSW GRAPH</strong>
          </div>
        </div>

        {/* Sighting History Section */}
        {sightingHistory && sightingHistory.length > 1 && (
          <div style={{ borderTop: '1px solid var(--border-hairline)', paddingTop: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px', fontSize: '0.75rem', fontFamily: "'IBM Plex Mono', monospace", color: 'var(--text-secondary)' }}>
              <History size={14} />
              <span>SIGHTING TIMELINE ({sightingHistory.length} EVENTS)</span>
            </div>
            <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px' }}>
              {sightingHistory.map((s, idx) => {
                const isCurrent = s.id === match.id;
                const sCp = CHECKPOINTS.find(c => c.id === s.checkpointId);
                return (
                  <div
                    key={s.id}
                    onClick={() => onSelectSighting(s.id)}
                    style={{
                      padding: '6px 10px',
                      backgroundColor: isCurrent ? 'var(--bg-panel-raised)' : '#070A0E',
                      border: `1px solid ${isCurrent ? 'var(--accent-signal)' : 'var(--border-hairline)'}`,
                      borderRadius: '2px',
                      cursor: 'pointer',
                      fontSize: '0.68rem',
                      fontFamily: "'IBM Plex Mono', monospace",
                      minWidth: '130px'
                    }}
                  >
                    <div style={{ color: isCurrent ? 'var(--accent-signal)' : 'var(--text-primary)', fontWeight: 600 }}>
                      #{idx + 1} {sCp?.name || s.checkpointId}
                    </div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.62rem' }}>
                      {format(s.timestamp, 'HH:mm:ss')} ({(s.confidence * 100).toFixed(0)}%)
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Operator Review Actions */}
        <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
          {isPending ? (
            <>
              <button
                onClick={() => onConfirm(match.id)}
                style={{
                  flex: 1,
                  backgroundColor: 'var(--accent-signal)',
                  color: '#0A0E14',
                  border: 'none',
                  padding: '10px 16px',
                  fontWeight: 600,
                  fontSize: '0.8rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  fontFamily: "'IBM Plex Mono', monospace"
                }}
              >
                <CheckCircle size={15} />
                CONFIRM MATCH
              </button>

              <button
                onClick={() => onDismiss(match.id)}
                style={{
                  flex: 1,
                  backgroundColor: 'transparent',
                  color: 'var(--text-secondary)',
                  border: '1px solid var(--border-hairline)',
                  padding: '10px 16px',
                  fontSize: '0.8rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  fontFamily: "'IBM Plex Mono', monospace"
                }}
              >
                <AlertTriangle size={15} />
                DISMISS CANDIDATE
              </button>

              <button
                onClick={() => onFlag(match.id)}
                aria-label="Flag sighting for supervisor review"
                title="Flag for supervisor review"
                style={{
                  backgroundColor: 'transparent',
                  color: '#f59e0b',
                  border: '1px solid #f59e0b',
                  padding: '10px 14px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <Flag size={15} />
              </button>
            </>
          ) : isConfirmed ? (
            <div style={{
              width: '100%',
              padding: '10px',
              backgroundColor: 'rgba(0, 217, 163, 0.1)',
              border: '1px solid var(--accent-signal)',
              color: 'var(--accent-signal)',
              textAlign: 'center',
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: '0.8rem',
              fontWeight: 600
            }}>
              MATCH SIGHTING CONFIRMED & LOGGED IN AUDIT LOG
            </div>
          ) : (
            <div style={{
              width: '100%',
              padding: '10px',
              backgroundColor: 'rgba(255, 71, 87, 0.1)',
              border: '1px solid var(--accent-alert)',
              color: 'var(--accent-alert)',
              textAlign: 'center',
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: '0.8rem'
            }}>
              CANDIDATE SIGHTING DISMISSED
            </div>
          )}
        </div>
      </div>
    </div>
  );
};