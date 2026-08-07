import React from 'react';
import { CHECKPOINTS, type Match } from '../data/mockData';
import { formatDistanceToNow } from 'date-fns';

interface MatchListPanelProps {
  matches: Match[];
  selectedPersonId: string | null;
  onSelectPerson: (personId: string) => void;
}

export const MatchListPanel: React.FC<MatchListPanelProps> = ({ matches, selectedPersonId, onSelectPerson }) => {
  // Sort by timestamp descending
  const sortedMatches = [...matches].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

  return (
    <div className="panel" style={{
      position: 'absolute',
      top: '64px',
      right: '16px',
      width: '360px',
      bottom: '80px',
      display: 'flex',
      flexDirection: 'column',
      zIndex: 10,
    }}>
      <div style={{
        padding: '12px 16px',
        borderBottom: '1px solid var(--border-hairline)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <h2 className="mono-display" style={{ fontSize: '0.9rem', margin: 0, color: 'var(--text-secondary)' }}>ACTIVE MATCHES</h2>
        <div style={{
          backgroundColor: 'var(--accent-muted)',
          color: 'var(--text-primary)',
          padding: '2px 8px',
          borderRadius: '12px',
          fontSize: '0.75rem',
          fontFamily: "'JetBrains Mono', monospace"
        }}>
          {matches.length}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
        {sortedMatches.map(match => {
          const cp = CHECKPOINTS.find(c => c.id === match.checkpointId);
          const isSelected = selectedPersonId === match.personId;
          
          let statusBadgeClass = 'badge-dismissed';
          if (match.status === 'PENDING REVIEW') statusBadgeClass = 'badge-pending';
          if (match.status === 'CONFIRMED') statusBadgeClass = 'badge-confirmed';

          return (
            <div 
              key={match.id}
              onClick={() => onSelectPerson(match.personId)}
              className="panel"
              style={{
                padding: '12px',
                marginBottom: '8px',
                cursor: 'pointer',
                borderLeft: isSelected ? '2px solid var(--accent-signal)' : '1px solid var(--border-hairline)',
                backgroundColor: isSelected ? 'var(--bg-panel-raised)' : 'var(--bg-panel)',
                transition: 'all 0.15s ease'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span className="mono-display" style={{ fontSize: '0.85rem' }}>ID: {match.personId}</span>
                <span className="numeric-data" style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  {formatDistanceToNow(match.timestamp, { addSuffix: true })}
                </span>
              </div>
              
              <div style={{ display: 'flex', gap: '12px' }}>
                <div style={{
                  width: '48px',
                  height: '48px',
                  backgroundColor: 'var(--bg-void)',
                  border: '1px solid var(--border-hairline)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--text-secondary)',
                  fontSize: '0.7rem',
                  flexShrink: 0
                }}>
                  IMG
                </div>
                
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)', marginBottom: '4px' }}>
                    {cp?.name || match.checkpointId}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ 
                      color: match.confidence > 0.8 ? 'var(--accent-signal)' : 'var(--text-secondary)',
                      fontFamily: "'JetBrains Mono', monospace",
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
        {matches.length === 0 && (
          <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
            No active matches. Checkpoints are live and monitoring.
          </div>
        )}
      </div>
    </div>
  );
};
