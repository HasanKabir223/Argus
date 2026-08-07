import React, { useState, useEffect } from 'react';
import { Activity, Clock } from 'lucide-react';
import { format } from 'date-fns';

export const TopBar: React.FC = () => {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

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
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--accent-signal)', fontSize: '0.8rem', fontFamily: "'JetBrains Mono', monospace" }}>
          <Activity size={14} className="pulse" style={{ animation: 'pulse 2s infinite' }} />
          <span>SYSTEM ACTIVE</span>
        </div>
      </div>
      
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)' }}>
        <Clock size={16} />
        <span className="numeric-data">{format(time, 'yyyy-MM-dd HH:mm:ss')} UTC</span>
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
