import React, { useState, useRef, useEffect } from 'react';
import { Search } from 'lucide-react';
import { CHECKPOINTS, type Match } from '../data/mockData';
import { formatDistanceToNow } from 'date-fns';

interface MatchListPanelProps {
  matches: Match[];
  selectedPersonId: string | null;
  onSelectPerson: (personId: string) => void;
}

type FilterStatus = 'ALL' | 'PENDING REVIEW' | 'CONFIRMED' | 'DISMISSED';

export const MatchListPanel: React.FC<MatchListPanelProps> = ({ matches, selectedPersonId, onSelectPerson }) => {
  const [filter, setFilter] = useState<FilterStatus>('ALL');
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

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

  const sortedMatches = [...matches].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

  const filteredMatches = sortedMatches.filter(match => {
    if (filter !== 'ALL' && match.status !== filter) return false;
    if (query.trim()) {
      const cp = CHECKPOINTS.find(c => c.id === match.checkpointId);
      const haystack = `${match.personId} ${cp?.name ?? ''} ${match.name ?? ''}`.toLowerCase();
      if (!haystack.includes(query.trim().toLowerCase())) return false;
    }
    return true;
  });

  const filters: FilterStatus[] = ['ALL', 'PENDING REVIEW', 'CONFIRMED', 'DISMISSED'];

  return (
    <div className="panel side-panel" role="region" aria-label="Active matches">
      <div style={{
        padding: '12px 16px',
        borderBottom: '1px solid var(--border-hairline)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: 'var(--bg-panel-raised)'
      }}>
        <h2 className="mono-display" style={{ fontSize: '0.9rem', margin: 0, color: 'var(--text-secondary)' }}>ACTIVE SIGHTINGS</h2>
        <div style={{
          backgroundColor: 'rgba(0, 217, 163, 0.15)',
          color: 'var(--accent-signal)',
          border: '1px solid rgba(0, 217, 163, 0.3)',
          padding: '2px 8px',
          borderRadius: '4px',
          fontSize: '0.75rem',
          fontFamily: "'IBM Plex Mono', monospace"
        }}>
          {filteredMatches.length} LOGGED
        </div>
      </div>

      <div style={{ padding: '10px 12px 0 12px' }}>
        <div style={{ position: 'relative' }}>
          <Search size={13} style={{ position: 'absolute', left: '9px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
          <input
            ref={searchRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search ID or checkpoint... (press /)"
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

      <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
        {filteredMatches.map(match => {
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
              className="panel match-card"
              style={{
                padding: '12px',
                marginBottom: '8px',
                cursor: 'pointer',
                borderLeft: isSelected ? '3px solid var(--accent-signal)' : '1px solid var(--border-hairline)',
                backgroundColor: isSelected ? 'var(--bg-panel-raised)' : 'var(--bg-panel)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span className="mono-display" style={{ fontSize: '0.85rem' }}>ID: {match.personId} ({match.name})</span>
                <span className="numeric-data" style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  {formatDistanceToNow(match.timestamp, { addSuffix: true })}
                </span>
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
                  <img
                    src={cropUrl}
                    alt="Face crop"
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = 'none';
                    }}
                  />
                </div>

                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-primary)', marginBottom: '4px' }}>
                    {cp?.name || match.checkpointId}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{
                      color: match.confidence >= 0.75 ? 'var(--accent-signal)' : 'var(--accent-alert)',
                      fontFamily: "'IBM Plex Mono', monospace",
                      fontSize: '1.1rem'
                    }}>
                      {(match.confidence * 100).toFixed(1)}%
                    </div>
                    <span className={`badge ${statusBadgeClass}`}>
                      {match.status}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        {filteredMatches.length === 0 && (
          <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
            No matches found.
          </div>
        )}
      </div>
    </div>
  );
};