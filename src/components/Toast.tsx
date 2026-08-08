import React, { useEffect } from 'react';
import { CheckCircle, AlertTriangle, Info, X } from 'lucide-react';

export interface ToastItem {
  id: string;
  message: string;
  type: 'info' | 'success' | 'alert';
}

interface ToastContainerProps {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}

const ICONS = {
  info: Info,
  success: CheckCircle,
  alert: AlertTriangle,
};

const COLORS: Record<ToastItem['type'], string> = {
  info: 'var(--text-secondary)',
  success: 'var(--accent-signal)',
  alert: 'var(--accent-alert)',
};

const Toast: React.FC<{ toast: ToastItem; onDismiss: (id: string) => void }> = ({ toast, onDismiss }) => {
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(toast.id), 4500);
    return () => clearTimeout(timer);
  }, [toast.id, onDismiss]);

  const Icon = ICONS[toast.type];
  const color = COLORS[toast.type];

  return (
    <div
      role="status"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        background: 'var(--bg-panel)',
        border: `1px solid ${color}`,
        borderLeft: `3px solid ${color}`,
        color: 'var(--text-primary)',
        padding: '10px 12px',
        fontSize: '0.8rem',
        fontFamily: "'IBM Plex Mono', monospace",
        boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
        minWidth: '260px',
        maxWidth: '340px',
        animation: 'toast-in 0.2s ease-out',
      }}
    >
      <Icon size={16} color={color} style={{ flexShrink: 0 }} />
      <div style={{ flex: 1 }}>{toast.message}</div>
      <button
        onClick={() => onDismiss(toast.id)}
        aria-label="Dismiss notification"
        style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', padding: 0 }}
      >
        <X size={14} />
      </button>
    </div>
  );
};

export const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, onDismiss }) => {
  if (toasts.length === 0) return null;

  return (
    <div
      style={{
        position: 'absolute',
        top: '60px',
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        zIndex: 300,
        pointerEvents: 'none',
      }}
    >
      {toasts.map(t => (
        <div key={t.id} style={{ pointerEvents: 'auto' }}>
          <Toast toast={t} onDismiss={onDismiss} />
        </div>
      ))}
      <style>{`
        @keyframes toast-in {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
};