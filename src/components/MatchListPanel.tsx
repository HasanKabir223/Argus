import React, { useState, useRef, useEffect } from 'react';
import { Search, Radio, Video, Trash2, RefreshCw } from 'lucide-react';
import { CHECKPOINTS, type Match } from '../data/mockData';
import { formatDistanceToNow } from 'date-fns';
import { getConfidenceColor, getConfidenceLabel } from '../utils/confidence';
import { FaceThumb } from './FaceThumb';

interface MatchListPanelProps {
  matches: Match[];
  selectedPersonId: string | null;
  onSelectPerson: (personId: string) => void;
  onClearMatches?: () => void;
  onDeleteMatch?: (matchId: string) => void;
  onOpenCctvStudio?: () => void;
}

type FilterStatus = 'ALL' | 'PENDING REVIEW' | 'CONFIRMED' | 'DISMISSED';

export const MatchListPanel: React.FC<MatchListPanelProps> = ({
  matches,
  selectedPersonId,
  onSelectPerson,
  onClearMatches,
  onDeleteMatch,
  onOpenCctvStudio
}) => {

  const [filter, setFilter] = useState<FilterStatus>('ALL');
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  // Track which match ids we've already rendered once for slide-in animation
  const seenIdsRef = useRef<Set<string>>(new Set());
  const isFirstRenderRef = useRef(true);
  const [newIds, setNewIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const incoming = matches.filter(m => !seenIdsRef.current.has(m.id));
    incoming.forEach(m => seenIdsRef.current.add(m.id));

    if (isFirstRenderRef.current) {
      isFirstRenderRef.current = false;
      return;
    }
    if (incoming.length === 0) return;

    setNewIds(prev => {
      const next = new Set(prev);
      incoming.forEach(m => next.add(m.id));
      return next;
    });

    const timer = setTimeout(() => {
      setNewIds(prev => {
        const next = new Set(prev);
        incoming.forEach(m => next.delete(m.id));
        return next;
      });
    }, 200);
    return () => clearTimeout(timer);
  }, [matches]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === '/') {
        const target = e.target as HTMLElement;
        const isTyping = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';
        if (isTyping) return;
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  const sortedMatches = [...matches].sort((a, b) => {
    const aDismissed = a.status === 'DISMISSED';
    const bDismissed = b.status === 'DISMISSED';
    if (aDismissed !== bDismissed) return aDismissed ? 1 : -1;
    return b.timestamp.getTime() - a.timestamp.getTime();
  });

  const filteredMatches = sortedMatches.filter(match => {
    if (filter !== 'ALL' && match.status !== filter) return false;
    if (query.trim()) {
      const cp = CHECKPOINTS.find(c => c.id === match.checkpointId);
      const haystack = `${match.personId} ${cp?.name ?? ''} ${cp?.city ?? ''} ${match.name ?? ''}`.toLowerCase();
      if (!haystack.includes(query.trim().toLowerCase())) return false;
    }
    return true;
  });

  const filters: FilterStatus[] = ['ALL', 'PENDING REVIEW', 'CONFIRMED', 'DISMISSED'];

  return (
    <div className="panel side-panel" role="region" aria-label="Active matches">
      {/* Control zone */}
      <div style={{ backgroundColor: 'var(--bg-panel-raised)', borderBottom: '1px solid var(--border-hairline)' }}>
        <div style={{
          padding: '12px 16px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <h2 className="mono-display" style={{ fontSize: '0.9rem', margin: 0, color: 'var(--text-secondary)' }}>ACTIVE SIGHTINGS</h2>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{
              backgroundColor: matches.length > 0 ? 'rgba(0, 217, 163, 0.15)' : 'rgba(255,255,255,0.05)',
              color: matches.length > 0 ? 'var(--accent-signal)' : 'var(--text-secondary)',
              border: `1px solid ${matches.length > 0 ? 'rgba(0, 217, 163, 0.3)' : 'var(--border-hairline)'}`,
              padding: '2px 8px',
              borderRadius: '2px',
              fontSize: '0.72rem',
              fontFamily: "'IBM Plex Mono', monospace",
              fontWeight: 600
            }}>
              {filteredMatches.length} LOGGED
            </div>

            {onClearMatches && matches.length > 0 && (
              <button
                onClick={onClearMatches}
                title="Purge all active sightings (Clean Slate for Manual Testing)"
                style={{
                  background: 'rgba(255, 71, 87, 0.1)',
                  border: '1px solid rgba(255, 71, 87, 0.3)',
                  color: 'var(--accent-alert)',
                  cursor: 'pointer',
                  padding: '2px 6px',
                  fontSize: '0.65rem',
                  fontFamily: "'IBM Plex Mono', monospace",
                  borderRadius: '2px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '3px'
                }}
              >
                <Trash2 size={11} /> CLEAR
              </button>
            )}
          </div>
        </div>

        <div style={{ padding: '10px 12px 0 12px' }}>
          <div style={{ position: 'relative' }}>
            <Search size={13} style={{ position: 'absolute', left: '9px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
            <input
              ref={searchRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search ID, city, or checkpoint... (press /)"
              aria-label="Search matches by ID or checkpoint"
              style={{
                width: '100%',
                background: 'var(--bg-void)',
                border: '1px solid var(--border-hairline)',
                color: 'var(--text-primary)',
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: '0.75rem',
                padding: '7px 8px 7px 28px',
                outline: 'none',
              }}
              onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent-signal)')}
              onBlur={e => (e.currentTarget.style.borderColor = 'var(--border-hairline)')}
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: '6px', padding: '10px 12px', flexWrap: 'wrap' }} role="group" aria-label="Filter by status">
          {filters.map(f => (
            <button
              key={f}
              className={`filter-tab ${filter === f ? 'active' : ''}`}
              onClick={() => setFilter(f)}
              aria-pressed={filter === f}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Content Area */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
        {filteredMatches.length === 0 ? (
          <div style={{
            padding: '36px 16px',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '12px',
            color: 'var(--text-secondary)',
            fontFamily: "'IBM Plex Mono', monospace"
          }}>
            <div style={{
              width: '46px',
              height: '46px',
              borderRadius: '50%',
              backgroundColor: 'rgba(0, 217, 163, 0.08)',
              border: '1px solid rgba(0, 217, 163, 0.25)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Radio size={22} color="var(--accent-signal)" />
            </div>

            <div>
              <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>
                ZERO ACTIVE SIGHTINGS // STANDBY
              </div>
              <div style={{ fontSize: '0.72rem', lineHeight: 1.45, maxWidth: '240px', margin: '0 auto', color: 'var(--text-secondary)' }}>
                Surveillance pipeline is armed and ready across all 15 USA hubs.
              </div>
            </div>

            <div style={{
              backgroundColor: 'var(--bg-void)',
              border: '1px solid var(--border-hairline)',
              padding: '10px 12px',
              fontSize: '0.68rem',
              textAlign: 'left',
              width: '100%',
              lineHeight: 1.55,
              color: 'var(--text-secondary)',
              marginTop: '4px'
            }}>
              <div style={{ color: 'var(--accent-signal)', fontWeight: 700, marginBottom: '2px' }}>HOW TO TEST THE PIPELINE:</div>
              <div>• Press <kbd style={{ color: 'var(--accent-signal)', border: '1px solid var(--border-hairline)', padding: '1px 4px' }}>C</kbd> to launch CCTV Studio</div>
              <div>• Run video feeds or upload a test clip</div>
              <div>• Verified face matches will stream live to this feed and the map in real-time!</div>
            </div>

            {onOpenCctvStudio && (
              <button
                onClick={onOpenCctvStudio}
                style={{
                  width: '100%',
                  backgroundColor: 'var(--accent-signal)',
                  color: '#0A0E14',
                  border: 'none',
                  padding: '9px',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  fontFamily: "'IBM Plex Mono', monospace",
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  marginTop: '4px'
                }}
              >
                <Video size={14} /> OPEN CCTV STUDIO (PRESS C)
              </button>
            )}
          </div>
        ) : (
          filteredMatches.map(match => {
            const cp = CHECKPOINTS.find(c => c.id === match.checkpointId);
            const isSelected = selectedPersonId === match.personId;

            let statusBadgeClass = 'badge-dismissed';
            if (match.status === 'PENDING REVIEW') statusBadgeClass = 'badge-pending';
            if (match.status === 'CONFIRMED') statusBadgeClass = 'badge-confirmed';

            const cropUrl = match.faceCropUrl || `http://localhost:8000/static/gallery/${match.personId}_doe,_john.jpg`;

            return (
              <div
                key={match.id}
                role="button"
                tabIndex={0}
                aria-pressed={isSelected}
                aria-label={`Match ${match.personId} at ${cp?.name ?? match.checkpointId}, ${match.status}`}
                onClick={() => onSelectPerson(match.personId)}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelectPerson(match.personId);
                  }
                }}
                className={`panel match-card${newIds.has(match.id) ? ' match-card-enter' : ''}`}
                style={{
                  padding: '12px',
                  marginBottom: '8px',
                  cursor: 'pointer',
                  borderLeft: isSelected ? '3px solid var(--accent-signal)' : '1px solid var(--border-hairline)',
                  backgroundColor: isSelected ? 'var(--bg-panel-raised)' : 'var(--bg-panel)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span className="mono-display" style={{ fontSize: '0.85rem' }}>ID: {match.personId} ({match.name})</span>
                  
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span className="numeric-data" style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                      {formatDistanceToNow(match.timestamp, { addSuffix: true })}
                    </span>
                    {onDeleteMatch && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteMatch(match.id);
                        }}
                        title="Delete sighting event"
                        aria-label={`Delete sighting for ${match.name}`}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--text-secondary)',
                          cursor: 'pointer',
                          padding: '3px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderRadius: '2px',
                          transition: 'color 0.15s ease'
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--accent-alert)')}
                        onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-secondary)')}
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                </div>


                <div style={{ display: 'flex', gap: '12px' }}>
                  <div
                    aria-hidden="true"
                    style={{
                      width: '48px',
                      height: '48px',
                      backgroundColor: 'var(--bg-void)',
                      border: '1px solid var(--border-hairline)',
                      overflow: 'hidden',
                      flexShrink: 0
                    }}
                  >
                    <FaceThumb src={cropUrl} alt="Face crop" personId={match.personId} />
                  </div>

                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-primary)', marginBottom: '4px' }}>
                      <span style={{ color: 'var(--accent-signal)', fontWeight: 700 }}>
                        {cp?.city ? `${cp.city}, ${cp.state} — ` : ''}
                      </span>
                      <span>{cp?.name || match.checkpointId}</span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                        <span style={{
                          color: getConfidenceColor(match.confidence),
                          fontFamily: "'IBM Plex Mono', monospace",
                          fontSize: '1.1rem'
                        }}>
                          {(match.confidence * 100).toFixed(1)}%
                        </span>
                        {getConfidenceLabel(match.confidence) && (
                          <span style={{
                            color: 'var(--text-secondary)',
                            fontFamily: "'IBM Plex Mono', monospace",
                            fontSize: '0.62rem',
                            textTransform: 'uppercase',
                            letterSpacing: '0.02em'
                          }}>
                            {getConfidenceLabel(match.confidence)}
                          </span>
                        )}
                      </div>
                      <span className={`badge ${statusBadgeClass}`}>
                        {match.status}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};