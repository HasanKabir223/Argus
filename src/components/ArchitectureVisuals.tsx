import React, { useEffect, useState } from 'react';

/**
 * Step 1: RetinaFace Bounding Box & 5 Landmark Points
 * Draws an optical box over 4s loop and reveals landmark points sequentially.
 */
export const DetectionVisual: React.FC = () => {
  return (
    <div className="arch-visual-frame detection-visual">
      {/* Background Grid & Silhouette */}
      <div className="detection-grid-bg" />
      <div className="detection-face-silhouette">
        <svg viewBox="0 0 160 200" className="silhouette-svg" aria-hidden="true">
          <ellipse cx="80" cy="100" rx="46" ry="60" fill="rgba(38, 45, 58, 0.45)" />
          <path d="M 40 180 Q 80 140 120 180" fill="none" stroke="rgba(38, 45, 58, 0.4)" strokeWidth="2" />
        </svg>

        {/* Animated Bounding Box */}
        <svg viewBox="0 0 160 200" className="bounding-box-svg" aria-hidden="true">
          <rect
            x="30"
            y="35"
            width="100"
            height="130"
            fill="none"
            stroke="#00D9A3"
            strokeWidth="1.5"
            className="animated-box-rect"
          />
        </svg>

        {/* 5 Landmark Dots */}
        <div className="landmark-dot eye-left" title="Left Eye" />
        <div className="landmark-dot eye-right" title="Right Eye" />
        <div className="landmark-dot nose" title="Nose Tip" />
        <div className="landmark-dot mouth-left" title="Mouth Left" />
        <div className="landmark-dot mouth-right" title="Mouth Right" />
      </div>

      <div className="visual-badge-overlay">
        <span>5-POINT ALIGNED // 60 FPS</span>
      </div>
    </div>
  );
};

/**
 * Step 2: ArcFace + FAISS Vector Convergence
 * Two vector bars slide toward alignment, similarity score counts up to 0.87.
 */
export const MatchingVisual: React.FC = () => {
  const [similarity, setSimilarity] = useState(0.0);

  useEffect(() => {
    let frame = 0;
    const interval = setInterval(() => {
      frame++;
      const progress = (frame % 80) / 80;
      if (progress < 0.6) {
        setSimilarity(Number((progress * (0.87 / 0.6)).toFixed(2)));
      } else {
        setSimilarity(0.87);
      }
    }, 50);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="arch-visual-frame matching-visual">
      <div className="vector-matrix-container">
        {/* Probe Vector A */}
        <div className="vector-stream query-stream">
          <span className="vector-label">PROBE [512-D]</span>
          <div className="vector-bars">
            {[85, 45, 92, 60, 78, 30, 95, 50, 70, 88].map((val, idx) => (
              <div
                key={idx}
                className="vector-bar query-bar"
                style={{ width: `${val}%`, animationDelay: `${idx * 80}ms` }}
              />
            ))}
          </div>
        </div>

        {/* Center Convergence Score */}
        <div className="similarity-hud">
          <span className="sim-title">COSINE SIMILARITY</span>
          <span className="sim-score numeric-data">{similarity.toFixed(2)}</span>
          <span className="sim-status">MATCH THRESHOLD MET</span>
        </div>

        {/* Reference Vector B */}
        <div className="vector-stream reference-stream">
          <span className="vector-label">GALLERY [HNSW]</span>
          <div className="vector-bars">
            {[82, 48, 90, 58, 75, 32, 94, 52, 68, 86].map((val, idx) => (
              <div
                key={idx}
                className="vector-bar ref-bar"
                style={{ width: `${val}%`, animationDelay: `${idx * 80}ms` }}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="visual-badge-overlay">
        <span>FAISS INDEX SEARCH // &lt;1MS</span>
      </div>
    </div>
  );
};

/**
 * Step 3: Human-in-the-Loop Operator Alert Preview
 * Miniature side-by-side match card with 87.4% confidence and PENDING REVIEW badge.
 */
export const AlertVisual: React.FC = () => {
  return (
    <div className="arch-visual-frame alert-visual">
      <div className="mini-dashboard-card">
        <div className="mini-card-header">
          <span className="mini-case-id">EVENT #4092-BOM</span>
          <span className="mini-status-badge">PENDING REVIEW</span>
        </div>

        {/* Side by side comparison */}
        <div className="mini-comparison-row">
          <div className="mini-photo-frame">
            <div className="mini-photo-placeholder">
              <div className="photo-scan-cross" />
              <span>REF PHOTO</span>
            </div>
            <span className="photo-caption">DATABASE</span>
          </div>

          <div className="mini-confidence-center">
            <span className="conf-value numeric-data">87.4%</span>
            <span className="conf-label">CONFIDENCE</span>
          </div>

          <div className="mini-photo-frame">
            <div className="mini-photo-placeholder">
              <div className="photo-scan-cross" />
              <span>LIVE FRAME</span>
            </div>
            <span className="photo-caption">MUMBAI T2</span>
          </div>
        </div>

        {/* Operator Action Buttons */}
        <div className="mini-actions-row">
          <button className="mini-btn dismiss" tabIndex={-1}>DISMISS</button>
          <button className="mini-btn confirm" tabIndex={-1}>CONFIRM MATCH</button>
        </div>
      </div>

      <div className="visual-badge-overlay">
        <span>HUMAN OPERATOR VERIFICATION</span>
      </div>
    </div>
  );
};
