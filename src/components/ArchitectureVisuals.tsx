import React, { useEffect, useState } from 'react';

/**
 * Step 1: RetinaFace Optical Face Tracker & Biometric Alignment HUD
 * Features a dynamic scanning laser line, glowing corner brackets, and 5 landmark beacons.
 */
export const DetectionVisual: React.FC = () => {
  const [scanY, setScanY] = useState(0);

  useEffect(() => {
    let frame = 0;
    const interval = setInterval(() => {
      frame++;
      // Oscillating laser scanline
      const y = Math.sin(frame * 0.08) * 45 + 50;
      setScanY(y);
    }, 30);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="arch-visual-frame detection-visual" style={{ position: 'relative', overflow: 'hidden' }}>
      {/* Background Matrix Grid */}
      <div className="detection-grid-bg" />

      {/* Cyber Corner HUD Reticles */}
      <div style={{ position: 'absolute', top: 12, left: 12, width: 8, height: 8, borderTop: '2px solid #38BDF8', borderLeft: '2px solid #38BDF8' }} />
      <div style={{ position: 'absolute', top: 12, right: 12, width: 8, height: 8, borderTop: '2px solid #38BDF8', borderRight: '2px solid #38BDF8' }} />
      <div style={{ position: 'absolute', bottom: 12, left: 12, width: 8, height: 8, borderBottom: '2px solid #38BDF8', borderLeft: '2px solid #38BDF8' }} />
      <div style={{ position: 'absolute', bottom: 12, right: 12, width: 8, height: 8, borderBottom: '2px solid #38BDF8', borderRight: '2px solid #38BDF8' }} />

      <div className="detection-face-silhouette" style={{ position: 'relative' }}>
        {/* Silhouette Vector */}
        <svg viewBox="0 0 160 200" className="silhouette-svg" aria-hidden="true">
          <ellipse cx="80" cy="100" rx="46" ry="60" fill="rgba(30, 41, 59, 0.45)" />
          <path d="M 40 180 Q 80 140 120 180" fill="none" stroke="rgba(56, 189, 248, 0.25)" strokeWidth="1.5" />
        </svg>

        {/* Animated Bounding Box */}
        <svg viewBox="0 0 160 200" className="bounding-box-svg" aria-hidden="true">
          <rect
            x="30"
            y="35"
            width="100"
            height="130"
            fill="none"
            stroke="#38BDF8"
            strokeWidth="1.5"
            strokeDasharray="6 4"
            className="animated-box-rect"
          />
        </svg>

        {/* Dynamic Sweeping Cyan Laser Scanline */}
        <div
          style={{
            position: 'absolute',
            left: '30px',
            top: `${scanY}%`,
            width: '100px',
            height: '2px',
            background: 'linear-gradient(90deg, transparent, #38BDF8, #67E8F9, #38BDF8, transparent)',
            boxShadow: '0 0 12px #38BDF8, 0 0 24px rgba(56, 189, 248, 0.8)',
            pointerEvents: 'none',
            transform: 'translateY(-50%)',
          }}
        />

        {/* 5 Landmark Dots */}
        <div className="landmark-dot eye-left" title="Left Eye" />
        <div className="landmark-dot eye-right" title="Right Eye" />
        <div className="landmark-dot nose" title="Nose Tip" />
        <div className="landmark-dot mouth-left" title="Mouth Left" />
        <div className="landmark-dot mouth-right" title="Mouth Right" />
      </div>

      <div className="visual-badge-overlay">
        <span>RETINAFACE 5-POINT ALIGNMENT // 60 FPS</span>
      </div>
    </div>
  );
};

/**
 * Step 2: ArcFace + FAISS Vector Convergence Engine
 * Features live animated vector bars, fluctuating similarity curve, and sub-millisecond timer.
 */
export const MatchingVisual: React.FC = () => {
  const [similarity, setSimilarity] = useState(0.0);
  const [activeVectorIdx, setActiveVectorIdx] = useState(0);

  useEffect(() => {
    let frame = 0;
    const interval = setInterval(() => {
      frame++;
      const progress = (frame % 90) / 90;
      if (progress < 0.65) {
        setSimilarity(Number((progress * (0.89 / 0.65)).toFixed(3)));
      } else {
        setSimilarity(0.892);
      }
      setActiveVectorIdx(frame % 10);
    }, 45);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="arch-visual-frame matching-visual">
      <div className="vector-matrix-container">
        {/* Probe Vector Stream */}
        <div className="vector-stream query-stream">
          <span className="vector-label">PROBE [64-D]</span>
          <div className="vector-bars">
            {[88, 52, 94, 62, 82, 36, 96, 54, 74, 91].map((val, idx) => (
              <div
                key={idx}
                className={`vector-bar query-bar ${idx === activeVectorIdx ? 'active-pulse' : ''}`}
                style={{
                  width: `${val}%`,
                  transition: 'width 0.3s ease, background-color 0.2s',
                  background: idx === activeVectorIdx ? '#67E8F9' : 'rgba(56, 189, 248, 0.45)',
                  boxShadow: idx === activeVectorIdx ? '0 0 10px #38BDF8' : 'none',
                }}
              />
            ))}
          </div>
        </div>

        {/* Center Cosine Similarity HUD */}
        <div className="similarity-hud" style={{ border: '1px solid rgba(56, 189, 248, 0.3)', boxShadow: '0 0 20px rgba(56, 189, 248, 0.15)' }}>
          <span className="sim-title">COSINE SIMILARITY</span>
          <span className="sim-score numeric-data" style={{ color: '#38BDF8', textShadow: '0 0 14px rgba(56, 189, 248, 0.6)' }}>
            {(similarity * 100).toFixed(1)}%
          </span>
          <span className="sim-status" style={{ color: '#67E8F9' }}>CONFIRMED MATCH</span>
        </div>

        {/* Gallery Vector Stream */}
        <div className="vector-stream reference-stream">
          <span className="vector-label">WATCHLIST [FAISS]</span>
          <div className="vector-bars">
            {[86, 50, 92, 60, 80, 34, 95, 52, 72, 89].map((val, idx) => (
              <div
                key={idx}
                className={`vector-bar ref-bar ${idx === activeVectorIdx ? 'active-pulse' : ''}`}
                style={{
                  width: `${val}%`,
                  transition: 'width 0.3s ease, background-color 0.2s',
                  background: idx === activeVectorIdx ? '#F8FAFC' : 'rgba(248, 250, 252, 0.35)',
                  boxShadow: idx === activeVectorIdx ? '0 0 10px #F8FAFC' : 'none',
                }}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="visual-badge-overlay">
        <span>FAISS ANN SEARCH // &lt;0.05MS LATENCY</span>
      </div>
    </div>
  );
};

/**
 * Step 3: Human-in-the-Loop Operator Alert Preview
 * Miniature live tactical match card with animated simulation toggle.
 */
export const AlertVisual: React.FC = () => {
  const [isConfirmed, setIsConfirmed] = useState(false);

  return (
    <div className="arch-visual-frame alert-visual">
      <div className="mini-dashboard-card">
        <div className="mini-card-header">
          <span className="mini-case-id">CASE #WL-2026-DEL</span>
          <span
            className="mini-status-badge"
            style={{
              color: isConfirmed ? '#38BDF8' : '#F43F5E',
              background: isConfirmed ? 'rgba(56, 189, 248, 0.15)' : 'rgba(244, 63, 94, 0.15)',
              borderColor: isConfirmed ? '#38BDF8' : '#F43F5E',
              boxShadow: isConfirmed ? '0 0 12px rgba(56, 189, 248, 0.4)' : '0 0 12px rgba(244, 63, 94, 0.4)',
              transition: 'all 0.3s ease',
            }}
          >
            {isConfirmed ? 'CONFIRMED AUDITED' : 'PENDING REVIEW'}
          </span>
        </div>

        {/* Side by side comparison */}
        <div className="mini-comparison-row">
          <div className="mini-photo-frame">
            <div className="mini-photo-placeholder" style={{ border: '1px solid rgba(56, 189, 248, 0.25)' }}>
              <div className="photo-scan-cross" />
              <span>WATCHLIST REF</span>
            </div>
            <span className="photo-caption">GOV DATABASE</span>
          </div>

          <div className="mini-confidence-center">
            <span className="conf-value numeric-data" style={{ color: '#38BDF8', textShadow: '0 0 10px rgba(56, 189, 248, 0.5)' }}>
              89.2%
            </span>
            <span className="conf-label">SCORE</span>
          </div>

          <div className="mini-photo-frame">
            <div className="mini-photo-placeholder" style={{ border: '1px solid rgba(56, 189, 248, 0.25)' }}>
              <div className="photo-scan-cross" />
              <span>CCTV FRAME</span>
            </div>
            <span className="photo-caption">NEW DELHI CP-01</span>
          </div>
        </div>

        {/* Operator Action Buttons */}
        <div className="mini-actions-row">
          <button
            className="mini-btn dismiss"
            onClick={() => setIsConfirmed(false)}
            style={{ cursor: 'pointer', transition: 'all 0.2s ease' }}
          >
            DISMISS
          </button>
          <button
            className="mini-btn confirm"
            onClick={() => setIsConfirmed(true)}
            style={{
              cursor: 'pointer',
              background: isConfirmed ? '#38BDF8' : 'rgba(56, 189, 248, 0.18)',
              color: isConfirmed ? '#070B12' : '#38BDF8',
              fontWeight: 700,
              boxShadow: isConfirmed ? '0 0 15px #38BDF8' : 'none',
              transition: 'all 0.2s ease',
            }}
          >
            {isConfirmed ? '✓ CONFIRMED' : 'CONFIRM MATCH'}
          </button>
        </div>
      </div>

      <div className="visual-badge-overlay">
        <span>HUMAN OPERATOR VERIFICATION PROTOCOL</span>
      </div>
    </div>
  );
};
