import React, { useEffect, useState } from 'react';
import './LoadingScreen.css';

interface LoadingScreenProps {
  onComplete?: () => void;
  minDuration?: number;
}

const BOOT_STAGES = [
  { threshold: 18, label: 'INITIALIZING 512-D VECTOR MANIFOLD', detail: 'ArcFace L2-normalized unit sphere' },
  { threshold: 42, label: 'CALIBRATING RETINAFACE OPTICAL TRACKER', detail: '5-point canonical similarity alignment' },
  { threshold: 68, label: 'MOUNTING FAISS HNSW SIMILARITY INDEX', detail: 'Cosine distance space <0.25ms' },
  { threshold: 88, label: 'CONNECTING 15 STRATEGIC US CHECKPOINTS', detail: 'Live CCTV pipeline feeds synchronized' },
  { threshold: 100, label: 'SYSTEM ARMED // LAUNCHING OPERATIONS CONSOLE', detail: 'All homeland surveillance nodes active' },
];

export const LoadingScreen: React.FC<LoadingScreenProps> = ({
  onComplete,
  minDuration = 2000,
}) => {
  const [progress, setProgress] = useState(0);
  const [isFadingOut, setIsFadingOut] = useState(false);
  const [currentTime, setCurrentTime] = useState('');

  useEffect(() => {
    // Current UTC timestamp
    const now = new Date();
    setCurrentTime(now.toISOString().replace('T', ' ').slice(0, 19) + ' UTC');

    const startTime = performance.now();
    let animationFrameId: number;

    const updateProgress = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const rawProgress = Math.min(1, elapsed / minDuration);

      // Smooth easing curve (easeOutCubic)
      const easedProgress = Math.min(100, Math.floor(rawProgress * 100));
      setProgress(easedProgress);

      if (rawProgress < 1) {
        animationFrameId = requestAnimationFrame(updateProgress);
      } else {
        // Complete! Initiate fade out
        setTimeout(() => {
          setIsFadingOut(true);
          setTimeout(() => {
            if (onComplete) onComplete();
          }, 450);
        }, 150);
      }
    };

    animationFrameId = requestAnimationFrame(updateProgress);

    return () => cancelAnimationFrame(animationFrameId);
  }, [minDuration, onComplete]);

  const currentStage = BOOT_STAGES.find((s) => progress <= s.threshold) || BOOT_STAGES[BOOT_STAGES.length - 1];

  const handleSkip = () => {
    setIsFadingOut(true);
    setTimeout(() => {
      if (onComplete) onComplete();
    }, 200);
  };

  return (
    <div
      className={`argus-boot-screen ${isFadingOut ? 'boot-fade-out' : ''}`}
      role="alert"
      aria-busy="true"
      aria-label="ARGUS Intelligence Infrastructure System Boot"
    >
      {/* Background Vignette & Ambient Glow */}
      <div className="boot-ambient-glow" aria-hidden="true" />
      <div className="boot-grid-matrix" aria-hidden="true" />

      {/* Top Telemetry Header */}
      <div className="boot-header">
        <div className="boot-tag">
          <span className="boot-dot" />
          <span>ARGUS_OS // SECURE_INIT</span>
        </div>
        <div className="boot-clock">{currentTime}</div>
        <button
          className="boot-skip-btn"
          onClick={handleSkip}
          title="Bypass boot sequence and enter immediately"
        >
          [ SKIP SEQ ]
        </button>
      </div>

      {/* Central Tactical Core Visual */}
      <div className="boot-center">
        {/* Kinetic Concentric Reticle Rings */}
        <div className="boot-reticle-system">
          {/* Outer Dashed Orbit */}
          <div className="boot-ring boot-ring-outer" />
          {/* Middle Counter-rotating Ticks */}
          <div className="boot-ring boot-ring-mid" />
          {/* Inner Glowing Aperture */}
          <div className="boot-ring boot-ring-inner" />
          {/* Sweeping Radar Laser */}
          <div className="boot-scan-laser" />

          {/* Central Biometric Aperture Logo */}
          <div className="boot-core-logo">
            <div className="boot-iris-center">
              <span className="boot-iris-reticle" />
            </div>
          </div>
        </div>

        {/* Wordmark Title */}
        <div className="boot-brand">
          <h1 className="boot-title">ARGUS</h1>
          <div className="boot-subtitle">HUMANITARIAN INTELLIGENCE INFRASTRUCTURE</div>
        </div>

        {/* Progress Display */}
        <div className="boot-progress-container">
          <div className="boot-progress-bar-rail">
            <div
              className="boot-progress-bar-fill"
              style={{ width: `${progress}%` }}
            />
            <div
              className="boot-progress-glow-head"
              style={{ left: `${progress}%` }}
            />
          </div>

          <div className="boot-progress-metrics">
            <span className="boot-stage-label">{currentStage.label}</span>
            <span className="boot-percentage">{progress}%</span>
          </div>

          <div className="boot-stage-detail">{currentStage.detail}</div>
        </div>
      </div>

      {/* Bottom Telemetry Footer */}
      <div className="boot-footer">
        <div className="boot-footer-item">
          <span className="item-label">SECURITY PROTOCOL:</span>
          <span className="item-val">AES-256-GCM</span>
        </div>
        <div className="boot-footer-item">
          <span className="item-label">VECTOR MANIFOLD:</span>
          <span className="item-val">512-DIMENSIONAL</span>
        </div>
        <div className="boot-footer-item">
          <span className="item-label">STATUS:</span>
          <span className="item-val" style={{ color: 'var(--accent)' }}>
            {progress === 100 ? 'AUTHENTICATED' : 'SYNCHRONIZING'}
          </span>
        </div>
      </div>
    </div>
  );
};
export default LoadingScreen;