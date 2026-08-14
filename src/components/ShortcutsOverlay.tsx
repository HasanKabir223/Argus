import React, { useEffect } from 'react';
import { X, Map, Shield, Radio, Keyboard } from 'lucide-react';

interface ShortcutsOverlayProps {
  onClose: () => void;
}

interface ShortcutCategory {
  title: string;
  icon: React.ReactNode;
  items: [string, string][];
}

const SHORTCUT_CATEGORIES: ShortcutCategory[] = [
  {
    title: '2D MAP & CARTOGRAPHIC RECON',
    icon: <Map size={14} color="var(--accent-signal)" />,
    items: [
      ['2 or S', 'Switch to Satellite Recon HD'],
      ['3 or T', 'Switch to Topographic Terrain HD'],
      ['1 or D', 'Switch to Tactical Dark HD'],
      ['4 or M', 'Switch to Cyber Matrix HD'],
      ['L', 'Cycle through all map layers'],
      ['R', 'Reset view to Continental USA'],
      ['O', 'Toggle radial sighting dispersion']
    ]
  },
  {
    title: 'TACTICAL SURVEILLANCE & VIEWS',
    icon: <Radio size={14} color="var(--accent-alert)" />,
    items: [
      ['V', 'Toggle 2D Tactical Map / 3D Globe'],
      ['P', 'Pause / resume live CCTV ingestion'],
      ['C', 'Open CCTV Ingestion Studio modal'],
      ['W', 'Open Reference Watchlist Gallery']
    ]
  },
  {
    title: 'NAVIGATION & SYSTEM CONTROLS',
    icon: <Shield size={14} color="var(--accent-amber)" />,
    items: [
      ['/', 'Focus search & filter input'],
      ['Esc', 'Close active panel or modal'],
      ['?', 'Toggle this shortcuts matrix']
    ]
  }
];

export const ShortcutsOverlay: React.FC<ShortcutsOverlayProps> = ({ onClose }) => {
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Tactical Keyboard Shortcuts"
      className="panel"
      style={{
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: '90vw',
        maxWidth: '480px',
        maxHeight: '85vh',
        zIndex: 400,
        backgroundColor: 'var(--bg-panel)',
        border: '1px solid var(--accent-signal)',
        boxShadow: '0 24px 64px rgba(0, 217, 163, 0.25)',
        display: 'flex',
        flexDirection: 'column',
        backdropFilter: 'blur(12px)'
      }}
    >
      <div style={{
        padding: '14px 18px',
        borderBottom: '1px solid var(--border-hairline)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: 'var(--bg-panel-raised)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Keyboard size={16} color="var(--accent-signal)" />
          <h2 className="mono-display" style={{ fontSize: '0.92rem', margin: 0, color: 'var(--accent-signal)' }}>
            KEYBOARD SHORTCUTS MATRIX
          </h2>
        </div>
        <button
          onClick={onClose}
          aria-label="Close shortcuts panel"
          style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex' }}
        >
          <X size={18} />
        </button>
      </div>

      <div style={{ padding: '16px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {SHORTCUT_CATEGORIES.map(cat => (
          <div key={cat.title} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.72rem', fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, color: 'var(--text-primary)', borderBottom: '1px solid var(--border-hairline)', paddingBottom: '4px' }}>
              {cat.icon}
              <span>{cat.title}</span>
            </div>
            {cat.items.map(([key, desc]) => (
              <div
                key={key}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '4px 0'
                }}
              >
                <span style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>{desc}</span>
                <kbd style={{
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  color: 'var(--accent-signal)',
                  background: 'var(--bg-void)',
                  border: '1px solid var(--border-hairline)',
                  borderRadius: '2px',
                  padding: '2px 8px',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.5)'
                }}>
                  {key}
                </kbd>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};