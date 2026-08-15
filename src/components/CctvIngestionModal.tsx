import React from 'react';
import { CctvIngestion } from './CctvIngestion';

interface CctvIngestionModalProps {
  onClose: () => void;
}

export const CctvIngestionModal: React.FC<CctvIngestionModalProps> = ({ onClose }) => {
  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(10, 14, 20, 0.85)',
        backdropFilter: 'blur(10px)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '30px',
        boxSizing: 'border-box',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '1200px',
          height: '85vh',
          maxHeight: '860px',
          backgroundColor: 'var(--bg-panel)',
          border: '1px solid var(--border-hairline)',
          borderRadius: 0,
          boxShadow: 'none',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <CctvIngestion onClose={onClose} />
      </div>
    </div>
  );
};
