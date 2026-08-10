import React, { useEffect, useRef, useState } from 'react';
import { type Match, CHECKPOINTS } from '../data/mockData';
import { X, CheckCircle, AlertTriangle, Copy, Check, ShieldAlert, Flag, History } from 'lucide-react';
import { getConfidenceColor } from '../utils/confidence';
import { FaceThumb } from './FaceThumb';

interface MatchDetailModalProps {
  match: Match;
  /** All matches for this same person, chronological (oldest first) — feeds the
   *  sighting-history list and the globe's arc animation (PRD §5.3 Screen 3). */
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

  // Real focus trap: cycles Tab / Shift+Tab within the modal's focusable elements
  // and returns focus if it somehow escapes (e.g. a focus() call from elsewhere).
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
      if (focusable.length === 0) {
        e.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (e.shiftKey) {
        if (active === first || !modalRef.current?.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (active === last || !modalRef.current?.contains(active)) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    const handleFocusIn = (e: FocusEvent) => {
      // If focus somehow lands outside the modal, pull it back in.
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        const focusable = getFocusable();
        (focusable[0] ?? closeButtonRef.current)?.focus();
      }
    };

    window.addEventListener('keydown', handleKey);
    document.addEventListener('focusin', handleFocusIn);
    return () => {
      window.removeEventListener('keydown', handleKey);
      document.removeEventListener('focusin', handleFocusIn);
      previouslyFocused?.focus();
    };
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
      ref={modalRef}
      role="dialog"
      aria-modal="true"
      aria-label={`Match details for ${match.personId}`}
      className="slide-over-enter"
      style={{
        position: 'absolute',
        top: '56px',
        right: 0,
        bottom: '56px',
        width: '440px',
        maxWidth: '92vw',
        backgroundColor: 'var(--bg-panel)',
        borderLeft: '1px solid var(--border-hairline)',
        zIndex: 160,
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column'
      }}
    >
      {/* Modal Header */}
      <div style={{
        padding: '12px 16px',
        borderBottom: '1px solid var(--border-hairline)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: 'var(--bg-panel-raised)',
        position: 'sticky',
        top: 0,
        zIndex: 1
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
          <ShieldAlert size={16} color={getConfidenceColor(match.confidence)} style={{ flexShrink: 0 }} />
          <h2 className="mono-display" style={{ fontSize: '0.85rem', margin: 0, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            HUMAN REVIEW // {match.id}
          </h2>
        </div>
        <button
          ref={closeButtonRef}
          onClick={onClose}
          aria-label="Close match details"
          style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', flexShrink: 0 }}
        >
          <X size={20} />
        </button>
      </div>

      <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px', flex: 1 }}>
        {/* Photos side-by-side: Reference Database vs Live Checkpoint Crop */}
        <div style={{ display: 'flex', gap: '10px' }}>
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
              <FaceThumb src={refImgSrc} alt="Reference target" personId={match.personId} />
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
              <FaceThumb src={liveImgSrc} alt="Live checkpoint crop" personId={match.personId} />
              <div style={{
                position: 'absolute',
                bottom: '4px',
                left: '4px',
                backgroundColor: 'rgba(10, 14, 20, 0.85)',
                padding: '2px 6px',
                fontSize: '0.65rem',
                color: getConfidenceColor(match.confidence),
                fontFamily: "'IBM Plex Mono', monospace"
              }}>
                RETINAFACE-MOBILENET
              </div>
            </div>
          </div>
        </div>

        {/* Confidence & Metadata */}
        <div>
          <div style={{ marginBottom: '18px' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '2px', fontFamily: "'IBM Plex Mono', monospace" }}>
              COSINE SIMILARITY SCORE
            </div>
            <div className="numeric-data" style={{
              fontSize: '2.2rem',
              color: getConfidenceColor(match.confidence),
              lineHeight: 1
            }}>
              {(match.confidence * 100).toFixed(1)}%
            </div>

            {/* Dual-Band Threshold Meter: discard / review / confirmed zones */}
            <div style={{ width: '100%', height: '8px', marginTop: '10px', position: 'relative', display: 'flex' }}>
              {/* Zone bands, sized to their actual score ranges */}
              <div style={{ width: '60%', height: '100%', backgroundColor: 'rgba(136, 146, 160, 0.18)', borderRight: '1px solid var(--bg-void)' }} title="Discard zone (<0.60)" />
              <div style={{ width: '15%', height: '100%', backgroundColor: 'rgba(255, 184, 48, 0.18)', borderRight: '1px solid var(--bg-void)' }} title="Review zone (0.60–0.75)" />
              <div style={{ width: '25%', height: '100%', backgroundColor: 'rgba(0, 217, 163, 0.18)' }} title="Confirmed zone (≥0.75)" />

              {/* Filled progress indicating actual confidence score */}
              <div style={{
                position: 'absolute',
                left: 0,
                top: 0,
                bottom: 0,
                width: `${match.confidence * 100}%`,
                backgroundColor: match.confidence >= 0.75
                  ? 'var(--accent-signal)'
                  : match.confidence >= 0.60
                    ? 'var(--accent-amber)'
                    : 'var(--accent-muted)',
                opacity: 0.9,
                transition: 'width 0.3s ease',
              }} />

              {/* Threshold divider lines at 60% and 75% */}
              <div style={{
                position: 'absolute',
                left: '60%',
                top: '-3px',
                bottom: '-3px',
                width: '2px',
                backgroundColor: 'var(--text-primary)',
                opacity: 0.6
              }} title="Review Threshold (0.60)" />
              <div style={{
                position: 'absolute',
                left: '75%',
                top: '-3px',
                bottom: '-3px',
                width: '2px',
                backgroundColor: 'var(--text-primary)',
                opacity: 0.8
              }} title="Confirmed Threshold (0.75)" />

              {/* Current score marker */}
              <div style={{
                position: 'absolute',
                left: `${match.confidence * 100}%`,
                top: '-5px',
                bottom: '-5px',
                width: '2px',
                backgroundColor: 'var(--text-primary)',
                transform: 'translateX(-1px)',
                transition: 'left 0.3s ease',
              }} />
            </div>
            <div style={{
              position: 'relative',
              height: '14px',
              marginTop: '4px',
              fontSize: '0.6rem',
              color: 'var(--text-secondary)',
              fontFamily: "'IBM Plex Mono', monospace"
            }}>
              <span style={{ position: 'absolute', left: 0 }}>0%</span>
              <span style={{ position: 'absolute', left: '60%', transform: 'translateX(-50%)' }}>60</span>
              <span style={{ position: 'absolute', left: '75%', transform: 'translateX(-50%)' }}>75</span>
              <span style={{ position: 'absolute', right: 0 }}>100%</span>
            </div>
            <div style={{
              display: 'flex',
              gap: '10px',
              fontSize: '0.6rem',
              color: 'var(--text-secondary)',
              marginTop: '2px',
              fontFamily: "'IBM Plex Mono', monospace"
            }}>
              <span>■ DISCARD</span>
              <span style={{ color: 'var(--accent-amber)' }}>■ REVIEW</span>
              <span style={{ color: 'var(--accent-signal)' }}>■ CONFIRMED</span>
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

          <div style={{ marginBottom: '10px' }}>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontFamily: "'IBM Plex Mono', monospace" }}>COORDINATES</div>
            <div className="numeric-data" style={{ fontSize: '0.85rem' }}>
              {cp ? `${cp.lat.toFixed(4)}°N, ${Math.abs(cp.lng).toFixed(4)}°${cp.lng < 0 ? 'W' : 'E'}` : '—'}
            </div>
          </div>

          <div style={{ marginBottom: '16px' }}>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontFamily: "'IBM Plex Mono', monospace" }}>TIMESTAMP (ISO)</div>
            <div className="numeric-data" style={{ fontSize: '0.85rem' }}>{match.timestamp.toISOString()}</div>
          </div>

          <div style={{ marginBottom: '20px' }}>
            <div style={{
              fontSize: '0.7rem',
              color: 'var(--text-secondary)',
              marginBottom: '8px',
              fontFamily: "'IBM Plex Mono', monospace",
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}>
              <History size={12} /> SIGHTING HISTORY ({sightingHistory.length})
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {sightingHistory.map(sighting => {
                const sightingCp = CHECKPOINTS.find(c => c.id === sighting.checkpointId);
                const isActive = sighting.id === match.id;
                return (
                  <button
                    key={sighting.id}
                    onClick={() => onSelectSighting(sighting.id)}
                    aria-current={isActive}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: '8px',
                      width: '100%',
                      textAlign: 'left',
                      background: isActive ? 'var(--bg-panel-raised)' : 'transparent',
                      border: '1px solid',
                      borderColor: isActive ? 'var(--accent-signal)' : 'var(--border-hairline)',
                      color: 'var(--text-primary)',
                      padding: '6px 10px',
                      cursor: 'pointer',
                      fontFamily: "'IBM Plex Mono', monospace",
                      fontSize: '0.7rem'
                    }}
                  >
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {sightingCp?.name || sighting.checkpointId}
                    </span>
                    <span style={{ color: getConfidenceColor(sighting.confidence), flexShrink: 0 }}>
                      {(sighting.confidence * 100).toFixed(0)}%
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Action Buttons for Human-in-the-Loop Confirmation */}
          <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {isPending ? (
              <>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    className="button button-primary"
                    style={{
                      flex: 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      padding: '8px',
                      fontSize: '0.75rem',
                      fontFamily: "'IBM Plex Mono', monospace"
                    }}
                    onClick={() => onConfirm(match.id)}
                  >
                    <CheckCircle size={14} /> Confirm
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
                      fontSize: '0.75rem',
                      fontFamily: "'IBM Plex Mono', monospace"
                    }}
                    onClick={() => onDismiss(match.id)}
                  >
                    <AlertTriangle size={14} /> Dismiss
                  </button>
                </div>
                <button
                  className="button button-amber"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    padding: '8px',
                    fontSize: '0.75rem',
                    fontFamily: "'IBM Plex Mono', monospace"
                  }}
                  onClick={() => onFlag(match.id)}
                >
                  <Flag size={14} /> Flag for Manual Review
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