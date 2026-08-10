import React, { useState, useEffect } from 'react';
import {
  Activity, Clock, Play, Pause, MapPin, ClipboardList,
  HelpCircle, Globe, Map, Sparkles, Cpu, Zap, Search,
  Video, Shield
} from 'lucide-react';
import { format } from 'date-fns';
import { fetchMetrics, triggerSimulationStep, type SystemMetrics } from '../services/api';

interface TopBarProps {
  isLive: boolean;
  onToggleLive: () => void;
  pendingCount: number;
  onOpenCheckpoints: () => void;
  onOpenAuditLog: () => void;
  onOpenShortcuts: () => void;
  onOpenCctvStudio: () => void;
  onOpenWatchlist: () => void;
  viewMode: 'globe' | 'map';
  onToggleViewMode: () => void;
  onSimulate?: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  isLive,
  onToggleLive,
  pendingCount,
  onOpenCheckpoints,
  onOpenAuditLog,
  onOpenShortcuts,
  onOpenCctvStudio,
  onOpenWatchlist,
  viewMode,
  onToggleViewMode,
  onSimulate
}) => {
  const [time, setTime] = useState(new Date());
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const updateMetrics = async () => {
      const m = await fetchMetrics();
      if (m) setMetrics(m);
    };
    updateMetrics();
    const interval = setInterval(updateMetrics, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleSimulate = async () => {
    setIsSimulating(true);
    await triggerSimulationStep();
    if (onSimulate) onSimulate();
    setTimeout(() => setIsSimulating(false), 600);
  };

  const iconButtonStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '7px',
    background: 'var(--bg-panel)',
    border: '1px solid var(--border-hairline)',
    color: 'var(--text-primary)',
    padding: '7px 13px',
    fontSize: '0.75rem',
    fontFamily: "'IBM Plex Mono', monospace",
    cursor: 'pointer',
    textTransform: 'uppercase',
    whiteSpace: 'nowrap',
    transition: 'all 0.15s ease',
  };

  // Thin vertical rule used to separate zones/groups without adding bulk
  const Divider = ({ height = 22 }: { height?: number }) => (
    <div style={{ width: '1px', height: `${height}px`, background: 'var(--border-hairline)', flexShrink: 0 }} />
  );

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'auto minmax(0, 1fr) auto',
      padding: '0 20px',
      height: '52px',
      backgroundColor: 'rgba(18, 22, 31, 0.92)',
      borderBottom: '1px solid var(--border-hairline)',
      backdropFilter: 'blur(8px)',
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 100,
      columnGap: '24px',
    }}>
      {/* Title & Live Status */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexShrink: 0 }}>
        <h1 className="mono-display" style={{ fontSize: '1.15rem', margin: 0, letterSpacing: '0.05em' }}>
          MINI GOTHAM
        </h1>

        <Divider />

        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '7px',
          color: isLive ? 'var(--accent-signal)' : 'var(--text-secondary)',
          fontSize: '0.75rem',
          fontFamily: "'IBM Plex Mono', monospace"
        }}>
          <Activity size={13} style={{ animation: isLive ? 'pulse 2s infinite' : 'none' }} />
          <span>{isLive ? 'SYSTEM ACTIVE' : 'FEED PAUSED'}</span>
        </div>

        {pendingCount > 0 && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '0.72rem',
            fontFamily: "'IBM Plex Mono', monospace",
            color: 'var(--accent-alert)',
            border: '1px solid rgba(255, 71, 87, 0.35)',
            background: 'rgba(255, 71, 87, 0.1)',
            padding: '3px 9px',
            borderRadius: '2px',
          }}>
            {pendingCount} PENDING REVIEW
          </div>
        )}
      </div>

      {/* AI Telemetry HUD — the one zone allowed to yield space; scrolls
          horizontally instead of pushing the action zone off-screen. */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '20px',
        fontSize: '0.75rem',
        fontFamily: "'IBM Plex Mono', monospace",
        color: 'var(--text-secondary)',
        minWidth: 0,
        overflowX: 'auto',
        overflowY: 'hidden',
        whiteSpace: 'nowrap',
        scrollbarWidth: 'none',
      }} className="topbar-hud">
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexShrink: 0 }}>
          <Cpu size={13} color="var(--accent-signal)" />
          <span>FPS: <strong style={{ color: 'var(--text-primary)' }}>{metrics?.pipeline?.estimated_fps || '30.0'}</strong></span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexShrink: 0 }}>
          <Zap size={13} color="#38bdf8" />
          <span>LSH HASH: <strong style={{ color: 'var(--text-primary)' }}>128-BIT (&lt;0.8ms)</strong></span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexShrink: 0 }}>
          <Search size={13} color="#a855f7" />
          <span>FAISS HNSW: <strong style={{ color: 'var(--text-primary)' }}>{metrics?.pipeline?.last_search_ms ? `${metrics.pipeline.last_search_ms.toFixed(2)}ms` : '<0.25ms'}</strong></span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexShrink: 0 }}>
          <span style={{ color: 'var(--accent-signal)' }}>DEDUP:</span>
          <strong style={{ color: 'var(--text-primary)' }}>
            {metrics?.deduplication?.deduplication_savings_percent ? `${metrics.deduplication.deduplication_savings_percent}%` : '98.5%'}
          </strong>
        </div>
      </div>

      {/* Action Controls & Navigation */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
        {/* Launch CCTV Surveillance Studio */}
        <button
          onClick={onOpenCctvStudio}
          aria-label="Open CCTV surveillance studio"
          title="Open CCTV surveillance studio"
          className="topbar-btn"
          style={{
            ...iconButtonStyle,
            backgroundColor: 'rgba(0, 217, 163, 0.15)',
            borderColor: 'var(--accent-signal)',
            color: 'var(--accent-signal)',
            fontWeight: 600
          }}
        >
          <Video size={13} />
          CCTV STUDIO
        </button>

        {/* Watchlist Gallery */}
        <button
          onClick={onOpenWatchlist}
          aria-label="Open watchlist reference database"
          title="Watchlist database"
          className="topbar-btn"
          style={iconButtonStyle}
        >
          <Shield size={12} />
          WATCHLIST
        </button>

        {/* View Mode Toggle: 3D Globe vs 2D Tactical Map */}
        <button
          onClick={onToggleViewMode}
          aria-label={`Switch to ${viewMode === 'globe' ? '2D Map' : '3D Globe'}`}
          title={`Switch to ${viewMode === 'globe' ? '2D Map' : '3D Globe'}`}
          className="topbar-btn"
          style={{ ...iconButtonStyle, borderColor: 'var(--accent-signal)', color: 'var(--accent-signal)' }}
        >
          {viewMode === 'globe' ? <Map size={13} /> : <Globe size={13} />}
          {viewMode === 'globe' ? '2D MAP' : '3D GLOBE'}
        </button>

        {/* Trigger Simulated Live Sighting */}
        <button
          onClick={handleSimulate}
          disabled={isSimulating}
          aria-label="Trigger simulated detection event"
          title="Trigger simulated detection event"
          className="topbar-btn"
          style={{ ...iconButtonStyle, color: isSimulating ? 'var(--accent-signal)' : 'var(--text-primary)' }}
        >
          <Sparkles size={13} color="var(--accent-signal)" />
          {isSimulating ? 'SIMULATING...' : 'TRIGGER SIGHTING'}
        </button>

        <Divider />

        <button
          onClick={onOpenCheckpoints}
          aria-label="Toggle checkpoint status panel"
          title="Checkpoints"
          className="topbar-btn"
          style={iconButtonStyle}
        >
          <MapPin size={12} /> Checkpoints
        </button>

        <button
          onClick={onOpenAuditLog}
          aria-label="Open audit log"
          title="Audit log"
          className="topbar-btn"
          style={iconButtonStyle}
        >
          <ClipboardList size={12} /> Audit Log
        </button>

        <button
          onClick={onToggleLive}
          aria-label={isLive ? 'Pause simulated live feed' : 'Resume simulated live feed'}
          title={isLive ? 'Pause simulated live feed' : 'Resume simulated live feed'}
          className="topbar-btn"
          style={iconButtonStyle}
        >
          {isLive ? <Pause size={12} /> : <Play size={12} />}
          {isLive ? 'Pause' : 'Resume'}
        </button>

        <button
          onClick={onOpenShortcuts}
          aria-label="Show keyboard shortcuts"
          title="Keyboard shortcuts (?)"
          className="topbar-btn"
          style={{ ...iconButtonStyle, padding: '7px 10px' }}
        >
          <HelpCircle size={14} />
        </button>

        <Divider />

        <div style={{ display: 'flex', alignItems: 'center', gap: '7px', color: 'var(--text-secondary)' }}>
          <Clock size={14} />
          <span className="numeric-data" style={{ fontSize: '0.78rem' }}>{format(time, 'yyyy-MM-dd HH:mm:ss')} UTC</span>
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(0.9); }
          100% { opacity: 1; transform: scale(1); }
        }
        .topbar-btn:hover:not(:disabled) {
          background: var(--bg-panel-raised) !important;
          border-color: var(--text-secondary) !important;
          transform: translateY(-1px);
        }
        .topbar-btn:active:not(:disabled) {
          transform: translateY(0);
        }
        .topbar-btn:disabled {
          cursor: default;
          opacity: 0.7;
        }
        @media (prefers-reduced-motion: reduce) {
          .topbar-btn:hover:not(:disabled) {
            transform: none;
          }
        }
        .topbar-hud::-webkit-scrollbar {
          display: none;
        }
      `}</style>
    </div>
  );
};