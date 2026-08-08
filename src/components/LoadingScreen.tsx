import React from 'react';

export const LoadingScreen: React.FC = () => {
  return (
    <div style={{
      position: 'absolute',
      top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'var(--bg-void)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '16px',
      zIndex: 500,
    }}>
      <div className="mono-display" style={{ fontSize: '1.4rem', letterSpacing: '0.05em' }}>MINI GOTHAM</div>
      <div className="numeric-data" style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
        Initializing checkpoint network...
      </div>
      <div style={{ width: '160px', height: '2px', backgroundColor: 'var(--border-hairline)', overflow: 'hidden' }}>
        <div style={{ width: '40%', height: '100%', backgroundColor: 'var(--accent-signal)', animation: 'loading-sweep 1s ease-in-out infinite' }} />
      </div>
      <style>{`
        @keyframes loading-sweep {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(350%); }
        }
      `}</style>
    </div>
  );
};