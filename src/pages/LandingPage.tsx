import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import AeroShards from '../components/AeroShards';
import { AbstractArt } from '../components/AbstractArt';
import './LandingPage.css';

/* ═══════════════════════════════════════════════════════════════════════════
   Landing Page Component
   ═══════════════════════════════════════════════════════════════════════════ */

export function LandingPage() {
  const navigate = useNavigate();

  // Set page title
  useEffect(() => {
    document.title = 'ARGUS — Humanitarian Intelligence Infrastructure';
    return () => {
      document.title = 'ARGUS';
    };
  }, []);

  return (
    <div className="argus-landing">
      {/* ─── Navigation ─────────────────────────────────────── */}
      <header className="argus-landing-nav">
        <span className="nav-wordmark">ARGUS</span>
        <div className="nav-live-indicator">
          <span className="live-dot" aria-hidden="true" />
          <span className="live-label">SYSTEM ACTIVE</span>
        </div>
      </header>

      {/* ─── Section 1: Hero ────────────────────────────────── */}
      <section className="hero-section">
        <div className="hero-aero-shards">
          <AeroShards
            backgroundColor="#0A0E14"
            shardColor="#1E3A6E"
            accentColor="#3B82F6"
            placement="full"
            flow="stream"
            material="pearl"
            detail="balanced"
            effect="none"
            scale={1}
            spread={1}
            depth={1}
            speed={0.6}
            spin={0.8}
            interaction="repel"
            density={1.2}
            shardSize={1.0}
            stretch={1}
            turbulence={0.8}
            glow={1.2}
            edgeSoftness={2}
            bloom={0.4}
            grain={0.03}
            chromaticAberration={0.005}
            transitionDuration={1}
            interactionRadius={1.5}
            interactionStrength={0.5}
            rippleIntensity={1}
            holdToGather={true}
          />
        </div>
        <div className="hero-vignette" aria-hidden="true" />

        <div className="hero-content">
          <div className="hero-eyebrow">
            HUMANITARIAN INTELLIGENCE INFRASTRUCTURE
          </div>

          <h1 className="hero-headline">
            Find the missing.<br />
            Before it's too late.
          </h1>

          <p className="hero-subheadline">
            Every checkpoint. Every face. Every second.
          </p>

          <div className="hero-cta">
            <button
              className="btn-enter-dashboard"
              onClick={() => navigate('/app')}
              aria-label="Enter ARGUS Dashboard"
            >
              ENTER DASHBOARD
            </button>
          </div>
        </div>
      </section>

      {/* ─── Section 2: The Problem ──────────────────────────── */}
      <section className="problem-section">
        <div className="problem-container">
          <div className="problem-inner">
            <div className="problem-label">THE PROBLEM</div>
            <div className="problem-text">
              <p>
                Hundreds of thousands of missing persons are reported
                every year. Most are never found.
              </p>
              <p>
                Not because the information doesn't exist —<br />
                but because no one is watching the right place<br />
                at the right time.
              </p>
              <p className="problem-punchline">
                ARGUS watches.
              </p>
            </div>
          </div>
          <div className="problem-visual">
            <AbstractArt />
          </div>
        </div>
      </section>

      {/* ─── Section 3: Stat Bar ────────────────────────────── */}
      <div className="stat-bar">
        <div className="stat-item">
          <span className="stat-value">&lt; 2s</span>
          <span className="stat-label">MATCH DETECTION</span>
        </div>
        <div className="stat-item">
          <span className="stat-value">512</span>
          <span className="stat-label">EMBEDDING DIMENSIONS</span>
        </div>
        <div className="stat-item">
          <span className="stat-value">24 / 7</span>
          <span className="stat-label">CHECKPOINT UPTIME</span>
        </div>
      </div>

      {/* ─── Section 4: Final CTA ───────────────────────────── */}
      <section className="final-cta-section">
        <h2 className="final-cta-headline">Ready to find them?</h2>
        <button
          className="btn-enter-dashboard"
          onClick={() => navigate('/app')}
          aria-label="Enter ARGUS Dashboard"
        >
          ENTER DASHBOARD
        </button>
        <p className="final-cta-disclaimer">
          Human-reviewed. Checkpoint-based. Not mass surveillance.
        </p>
      </section>

      {/* ─── Footer ─────────────────────────────────────────── */}
      <footer className="argus-footer">
        <span className="footer-copyright">© 2026 ARGUS</span>
        <span className="footer-badge">RESEARCH PROTOTYPE</span>
      </footer>
    </div>
  );
}
