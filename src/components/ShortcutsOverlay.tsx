import React, { useEffect } from 'react';
import { X } from 'lucide-react';

interface ShortcutsOverlayProps {
  onClose: () => void;
}

const SHORTCUTS: [string, string][] = [
  ['/', 'Focus the match search box'],
  ['P', 'Pause / resume the live feed'],
  ['Esc', 'Close the open panel or modal'],
  ['?', 'Show / hide this shortcuts panel'],
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
      aria-label="Keyboard shortcuts"
      className="panel"
      style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: '320px',
        zIndex: 200,
        boxShadow: '0 24px 48px rgba(0,0,0,0.5)',
      }}
    >
      <div style={{
        padding: '12px 16px',
        borderBottom: '1px solid var(--border-hairline)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: 'var(--bg-panel-raised)',
      }}>
        <h2 className="mono-display" style={{ fontSize: '0.9rem', margin: 0 }}>SHORTCUTS</h2>
        <button onClick={onClose} aria-label="Close shortcuts panel" style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex' }}>
          <X size={18} />
        </button>
      </div>
      <div style={{ padding: '12px 16px' }}>
        {SHORTCUTS.map(([key, desc]) => (
          <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--border-hairline)' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{desc}</span>
            <kbd style={{
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: '0.75rem',
              background: 'var(--bg-void)',
              border: '1px solid var(--border-hairline)',
              borderRadius: '3px',
              padding: '2px 6px',
            }}>{key}</kbd>
          </div>
        ))}
      </div>
    </div>
  );
};