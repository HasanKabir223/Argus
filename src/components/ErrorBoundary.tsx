import React from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
}

export class ErrorBoundary extends React.Component<React.PropsWithChildren, ErrorBoundaryState> {
  constructor(props: React.PropsWithChildren) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error('Mini Gotham crashed:', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: '#0A0E14',
          color: '#E8ECF1',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '16px',
          fontFamily: "'IBM Plex Mono', monospace",
          textAlign: 'center',
          padding: '24px',
        }}>
          <div style={{ fontSize: '1.1rem' }}>SYSTEM FAULT</div>
          <div style={{ fontSize: '0.85rem', color: '#8892A0', maxWidth: '360px' }}>
            The dashboard hit an unexpected error and stopped rendering safely instead of showing broken state.
          </div>
          <button
            onClick={() => window.location.reload()}
            style={{
              background: 'rgba(59, 130, 246, 0.1)',
              border: '1px solid #3B82F6',
              color: '#3B82F6',
              padding: '8px 16px',
              cursor: 'pointer',
              fontFamily: "'IBM Plex Mono', monospace",
              textTransform: 'uppercase',
              fontSize: '0.8rem',
            }}
          >
            Reload dashboard
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}