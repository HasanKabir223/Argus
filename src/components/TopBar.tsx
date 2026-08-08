import React, { useState, useEffect } from 'react';
import { Activity, Clock, Play, Pause, MapPin, ClipboardList, HelpCircle } from 'lucide-react';
import { format } from 'date-fns';

interface TopBarProps {
  isLive: boolean;
  onToggleLive: () => void;
  pendingCount: number;
  onOpenCheckpoints: () => void;
  onOpenAuditLog: () => void;
  onOpenShortcuts: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({ isLive, onToggleLive, pendingCount, onOpenCheckpoints, onOpenAuditLog, onOpenShortcuts }) => {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const iconButtonStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    background: 'var(--bg-panel)',
    border: '1px solid var(--border-hairline)',
    color: 'var(--text-primary)',
    padding: '5px 10px',
    fontSize: '0.75rem',
    fontFamily: "'IBM Plex Mono', monospace",
    cursor: 'pointer',
    textTransform: 'uppercase',
    transition: 'all 0.15s ease',
  };

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 16px',
      height: '48px',
      backgroundColor: 'rgba(18, 22, 31, 0.8)',
      borderBottom: '1px solid var(--border-hairline)',
      backdropFilter: 'blur(4px)',
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 100,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <h1 className="mono-display" style={{ fontSize: '1.2rem', margin: 0 }}>MINI GOTHAM</h1>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: isLive ? 'var(--accent-signal)' : 'var(--text-secondary)', fontSize: '0.8rem', fontFamily: "'IBM Plex Mono', monospace" }}>
          <Activity size={14} style={{ animation: isLive ? 'pulse 2s infinite' : 'none' }} />
          <span>{isLive ? 'SYSTEM ACTIVE' : 'FEED PAUSED'}</span>
        </div>

        {pendingCount > 0 && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '0.75rem',
            fontFamily: "'IBM Plex Mono', monospace",
            color: 'var(--accent-alert)',
            border: '1px solid rgba(255, 71, 87, 0.35)',
            background: 'rgba(255, 71, 87, 0.1)',
            padding: '3px 8px',
            borderRadius: '2px',
          }}>
            {pendingCount} PENDING REVIEW
          </div>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <button
          onClick={onOpenCheckpoints}
          aria-label="Toggle checkpoint status panel"
          title="Checkpoints"
          style={iconButtonStyle}
          onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--text-secondary)')}
          onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border-hairline)')}
        >
          <MapPin size={12} /> Checkpoints
        </button>

        <button
          onClick={onOpenAuditLog}
          aria-label="Open audit log"
          title="Audit log"
          style={iconButtonStyle}
          onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--text-secondary)')}
          onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border-hairline)')}
        >
          <ClipboardList size={12} /> Audit Log
        </button>

        <button
          onClick={onToggleLive}
          aria-label={isLive ? 'Pause simulated live feed' : 'Resume simulated live feed'}
          title={isLive ? 'Pause simulated live feed' : 'Resume simulated live feed'}
          style={iconButtonStyle}
          onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--text-secondary)')}
          onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border-hairline)')}
        >
          {isLive ? <Pause size={12} /> : <Play size={12} />}
          {isLive ? 'Pause Feed' : 'Resume Feed'}
        </button>

        <button
          onClick={onOpenShortcuts}
          aria-label="Show keyboard shortcuts"
          title="Keyboard shortcuts (?)"
          style={{ ...iconButtonStyle, padding: '5px 8px' }}
          onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--text-secondary)')}
          onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border-hairline)')}
        >
          <HelpCircle size={14} />
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)' }}>
          <Clock size={16} />
          <span className="numeric-data">{format(time, 'yyyy-MM-dd HH:mm:ss')} UTC</span>
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(0.9); }
          100% { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
};