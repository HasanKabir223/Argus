import { useState, useEffect, useRef, type ElementType, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { HeroGlobe } from '../components/HeroGlobe';
import { DetectionVisual, MatchingVisual, AlertVisual } from '../components/ArchitectureVisuals';
import { useReveal } from '../hooks/useReveal';
import './LandingPage.css';

// ─── Minimal Purpose-Built 16x16 Geometric SVG Glyphs ────────────────────────
const Glyphs = {
  Detection: () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M2 5V3C2 2.44772 2.44772 2 3 2H5" stroke="#00D9A3" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M11 2H13C13.5523 2 14 2.44772 14 3V5" stroke="#00D9A3" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M14 11V13C14 13.5523 13.5523 14 13 14H11" stroke="#00D9A3" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M5 14H3C2.44772 14 2 13.5523 2 13V11" stroke="#00D9A3" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="8" cy="8" r="2" fill="#00D9A3" />
    </svg>
  ),
  Tracking: () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M3 13L7 9L9 11L13 5" stroke="#00D9A3" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="13" cy="5" r="1.5" fill="#00D9A3" />
      <circle cx="3" cy="13" r="1" fill="rgba(0, 217, 163, 0.4)" />
    </svg>
  ),
  Embedding: () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="2" y="3" width="12" height="1.5" fill="#00D9A3" opacity="0.9" />
      <rect x="2" y="7" width="8" height="1.5" fill="#00D9A3" opacity="0.6" />
      <rect x="2" y="11" width="10" height="1.5" fill="#00D9A3" opacity="0.8" />
    </svg>
  ),
  Search: () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="7" cy="7" r="4.5" stroke="#00D9A3" strokeWidth="1.5" />
      <path d="M10.5 10.5L14 14" stroke="#00D9A3" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M7 4.5V9.5" stroke="#00D9A3" strokeWidth="1" strokeLinecap="round" />
      <path d="M4.5 7H9.5" stroke="#00D9A3" strokeWidth="1" strokeLinecap="round" />
    </svg>
  ),
  Backend: () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="2" y="2" width="12" height="4" rx="1" stroke="#00D9A3" strokeWidth="1.2" />
      <rect x="2" y="10" width="12" height="4" rx="1" stroke="#00D9A3" strokeWidth="1.2" />
      <circle cx="4.5" cy="4" r="0.8" fill="#00D9A3" />
      <circle cx="4.5" cy="12" r="0.8" fill="#00D9A3" />
      <path d="M8 6V10" stroke="#00D9A3" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  ),
  Interface: () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="6" stroke="#00D9A3" strokeWidth="1.2" />
      <ellipse cx="8" cy="8" rx="2.5" ry="6" stroke="#00D9A3" strokeWidth="1" />
      <path d="M2 8H14" stroke="#00D9A3" strokeWidth="1" />
    </svg>
  ),
};

const TECH_STACK_CARDS = [
  {
    category: 'DETECTION',
    name: 'RetinaFace',
    desc: 'MobileNet-0.25 backbone. 60 FPS on CPU.',
    glyph: Glyphs.Detection,
  },
  {
    category: 'TRACKING',
    name: 'ByteTrack',
    desc: 'Track-ID deduplication. 1 embed per person.',
    glyph: Glyphs.Tracking,
  },
  {
    category: 'EMBEDDING',
    name: 'ArcFace',
    desc: '64-dim vectors. MS1MV3 pretrained.',
    glyph: Glyphs.Embedding,
  },
  {
    category: 'SEARCH',
    name: 'FAISS',
    desc: 'Sub-millisecond cosine similarity search.',
    glyph: Glyphs.Search,
  },
  {
    category: 'BACKEND',
    name: 'FastAPI',
    desc: 'Async REST API. SQLite event store.',
    glyph: Glyphs.Backend,
  },
  {
    category: 'INTERFACE',
    name: 'react-globe.gl',
    desc: '3D globe. Checkpoint pins. Arc trails.',
    glyph: Glyphs.Interface,
  },
];

function Reveal({
  as: Tag = 'div',
  className = '',
  children,
  delay = 0,
}: {
  as?: ElementType;
  className?: string;
  children: ReactNode;
  delay?: number;
}) {
  const { ref, inView } = useReveal();
  return (
    <Tag
      ref={ref}
      className={`scroll-crossfade ${inView ? 'is-visible' : ''} ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </Tag>
  );
}

// ─── Spring-Interpolated Stat Counter Component ──────────────────────────────
function AnimatedStatCounter({
  finalValue,
  suffix = '',
  padZero = false,
  isTriggered,
}: {
  finalValue: number;
  suffix?: string;
  padZero?: boolean;
  isTriggered: boolean;
}) {
  const [displayVal, setDisplayVal] = useState(0);

  useEffect(() => {
    if (!isTriggered) return;
    let startTime: number | null = null;
    const duration = 1200; // 1200ms ease-out count-up

    const step = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const elapsed = timestamp - startTime;
      const progress = Math.min(1, elapsed / duration);
      // Ease-out deceleration curve
      const easeOut = 1 - Math.pow(1 - progress, 3);
      const current = progress === 1 ? finalValue : Number((easeOut * finalValue).toFixed(suffix.includes('.') ? 1 : 0));
      setDisplayVal(current);

      if (progress < 1) {
        requestAnimationFrame(step);
      }
    };

    requestAnimationFrame(step);
  }, [isTriggered, finalValue, suffix]);

  let formatted = displayVal.toString();
  if (padZero && displayVal < 10) {
    formatted = `0${displayVal}`;
  }
  if (suffix.includes('.')) {
    formatted = displayVal.toFixed(1);
  }

  return (
    <span className="stat-value numeric-data" aria-live="polite">
      {formatted}{suffix}
    </span>
  );
}

export function LandingPage() {
  const navigate = useNavigate();
  const [isScrolledPast80, setIsScrolledPast80] = useState(false);
  const [statsInView, setStatsInView] = useState(false);
  const statsRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Scroll listener for nav opacity and chevron fade-out
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const top = container.scrollTop;
      setIsScrolledPast80(top > 80);
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

  // Intersection Observer for Stats Section count-up
  useEffect(() => {
    const el = statsRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setStatsInView(true);
          observer.disconnect();
        }
      },
      { threshold: 0.5 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const scrollToHowItWorks = () => {
    const el = document.getElementById('section-how-it-works');
    el?.scrollIntoView({ behavior: 'smooth' });
  };

  const scrollToTechnology = () => {
    const el = document.getElementById('section-tech-stack');
    el?.scrollIntoView({ behavior: 'smooth' });
  };

  const scrollToAbout = () => {
    const el = document.getElementById('section-ethics');
    el?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="landing-root" ref={scrollContainerRef}>
      {/* ─── Navigation Bar (48px Fixed Glass) ─────────────────────────────── */}
      <header className={`argus-nav ${isScrolledPast80 ? 'scrolled-solid' : ''}`}>
        <div className="nav-container">
          {/* Left: 3x3 Dot Grid Logo + ARGUS Wordmark */}
          <div className="nav-brand" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
            <div className="logo-dot-grid" aria-hidden="true">
              <span className="grid-dot" />
              <span className="grid-dot" />
              <span className="grid-dot" />
              <span className="grid-dot" />
              <span className="grid-dot center-active" />
              <span className="grid-dot" />
              <span className="grid-dot" />
              <span className="grid-dot" />
              <span className="grid-dot" />
            </div>
            <span className="brand-name">ARGUS</span>
          </div>

          {/* Right: Plain Text Navigation Links */}
          <nav className="nav-links">
            <button className="nav-text-link" onClick={scrollToAbout}>
              ABOUT
            </button>
            <span className="nav-dot-sep">·</span>
            <button className="nav-text-link" onClick={scrollToTechnology}>
              TECHNOLOGY
            </button>
            <span className="nav-dot-sep">·</span>
            <button className="nav-text-link" onClick={scrollToAbout}>
              CONTACT
            </button>
          </nav>
        </div>
      </header>

      {/* ─── SECTION 1: HERO (100vh Full Bleed with 3D Globe) ───────────────── */}
      <section className="section-hero">
        {/* Full-viewport 3D Globe */}
        <HeroGlobe />

        {/* Dark Left Vignette Overlay */}
        <div className="globe-vignette" aria-hidden="true" />

        {/* Hero Text Block */}
        <div className="hero-text-block">
          {/* Eyebrow: 200ms delay, 300ms fade */}
          <div className="hero-eyebrow entrance-fade delay-200">
            HUMANITARIAN AI INFRASTRUCTURE
          </div>

          {/* Headline: Line 1 @ 400ms, Line 2 @ 600ms */}
          <h1 className="hero-display-headline">
            <span className="headline-line entrance-fade delay-400">Every Face</span>
            <span className="headline-line signal-word entrance-fade delay-600">Remembered.</span>
          </h1>

          {/* Subheadline: 800ms delay */}
          <p className="hero-subheadline entrance-fade delay-800">
            ARGUS monitors fixed checkpoints — train stations, bus stands, police posts —
            and matches every face against a database of missing persons.
            When someone is found, operators know in seconds.
          </p>

          {/* CTA Row: 1000ms delay */}
          <div className="hero-cta-row entrance-fade delay-1000">
            <button
              className="btn-primary-signal"
              onClick={() => navigate('/app')}
              aria-label="Open ARGUS Dashboard"
            >
              OPEN DASHBOARD
            </button>

            <button
              className="btn-link-technology"
              onClick={scrollToHowItWorks}
            >
              <span>VIEW TECHNOLOGY</span>
              <span className="arrow-glyph" aria-hidden="true">→</span>
            </button>
          </div>
        </div>

        {/* Scroll Indicator Chevron at Bottom */}
        <button
          className={`hero-scroll-indicator ${isScrolledPast80 ? 'faded-out' : ''}`}
          onClick={scrollToHowItWorks}
          aria-label="Scroll to how it works"
        >
          <span className="chevron-glyph">∨</span>
        </button>
      </section>

      {/* ─── SECTION 2: LIVE STATS BAR (80px Flush Bar) ───────────────────── */}
      <section className="section-stats-bar" ref={statsRef}>
        <div className="stats-bar-grid">
          <div className="stat-column">
            <AnimatedStatCounter finalValue={4} padZero isTriggered={statsInView} />
            <span className="stat-label">CHECKPOINTS ACTIVE</span>
          </div>

          <div className="stat-column">
            <AnimatedStatCounter finalValue={127} isTriggered={statsInView} />
            <span className="stat-label">REFERENCE DATABASE</span>
          </div>

          <div className="stat-column">
            <AnimatedStatCounter finalValue={3} padZero isTriggered={statsInView} />
            <span className="stat-label">MATCHES FLAGGED</span>
          </div>

          <div className="stat-column">
            <AnimatedStatCounter finalValue={1.2} suffix="s" isTriggered={statsInView} />
            <span className="stat-label">AVG DETECTION TIME</span>
          </div>
        </div>
      </section>

      {/* ─── SECTION 3: HOW IT WORKS (Alternating Rows) ────────────────────── */}
      <section id="section-how-it-works" className="section-how-it-works">
        <div className="section-content-wrapper">
          {/* Header */}
          <div className="section-heading-block">
            <Reveal as="div" className="section-eyebrow">
              SYSTEM ARCHITECTURE
            </Reveal>
            <Reveal as="h2" className="section-headline" delay={80}>
              Built for speed.
            </Reveal>
            <Reveal as="p" className="section-subhead" delay={160}>
              From raw camera frames to human-audited sightings in under two seconds.
            </Reveal>
          </div>

          {/* Row 1: Detect */}
          <Reveal className="architecture-row row-detect" delay={100}>
            <div className="row-text-column">
              <span className="step-tag">01 / DETECT</span>
              <h3 className="step-headline">RetinaFace-MobileNet-0.25</h3>
              <p className="step-body">
                1.7M parameters. 60 FPS on CPU. Detects and aligns every face in frame using 5-point landmark output — eyes, nose, mouth corners — before passing to recognition. The alignment step alone improves downstream match accuracy by 1.1%.
              </p>
              <div className="step-meta-pill">
                1.7M PARAMS · 1MB · 60 FPS CPU
              </div>
            </div>

            <div className="row-visual-column">
              <DetectionVisual />
            </div>
          </Reveal>

          {/* Row 2: Match (Reversed) */}
          <Reveal className="architecture-row row-match reversed" delay={100}>
            <div className="row-text-column">
              <span className="step-tag">02 / MATCH</span>
              <h3 className="step-headline">ArcFace + FAISS</h3>
              <p className="step-body">
                512-dimensional face embeddings. Cosine similarity search against the reference database. Each person is embedded once per checkpoint appearance — not once per frame. ByteTrack deduplication reduces embedding calls by 30–150×.
              </p>
              <div className="step-meta-pill">
                512-DIM VECTORS · &lt;1MS SEARCH · COSINE SIMILARITY
              </div>
            </div>

            <div className="row-visual-column">
              <MatchingVisual />
            </div>
          </Reveal>

          {/* Row 3: Alert */}
          <Reveal className="architecture-row row-alert" delay={100}>
            <div className="row-text-column">
              <span className="step-tag">03 / ALERT</span>
              <h3 className="step-headline">Human-in-the-Loop</h3>
              <p className="step-body">
                Every match above 0.75 confidence is flagged for human review — never automatically actioned. Operators see side-by-side reference vs. checkpoint photos, confirm or dismiss, and the system learns from every decision.
              </p>
              <div className="step-meta-pill">
                THRESHOLD 0.75 · HUMAN REVIEW · CHECKPOINT-BASED ONLY
              </div>
            </div>

            <div className="row-visual-column">
              <AlertVisual />
            </div>
          </Reveal>
        </div>
      </section>

      {/* ─── SECTION 4: TECH STACK (3x2 Grid) ──────────────────────────────── */}
      <section id="section-tech-stack" className="section-tech-stack">
        <div className="section-content-wrapper">
          <div className="tech-header">
            <span className="section-eyebrow">TECHNOLOGY STACK</span>
          </div>

          <div className="tech-cards-grid">
            {TECH_STACK_CARDS.map((card, i) => (
              <Reveal key={card.name} className="tech-card" delay={i * 60}>
                <div className="tech-card-icon-area">
                  <card.glyph />
                </div>
                <span className="tech-card-category">{card.category}</span>
                <h4 className="tech-card-name">{card.name}</h4>
                <p className="tech-card-desc">{card.desc}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ─── SECTION 5: ETHICAL FRAMING ────────────────────────────────────── */}
      <section id="section-ethics" className="section-ethical-framing">
        <div className="ethics-content-wrapper">
          <Reveal className="section-eyebrow">
            OUR COMMITMENT
          </Reveal>
          <Reveal as="h2" className="ethics-headline" delay={60}>
            Checkpoints, not surveillance.
          </Reveal>

          <div className="ethics-principles-list">
            <Reveal className="ethics-row" delay={120}>
              <span className="ethics-dash" aria-hidden="true">—</span>
              <p className="ethics-text">
                Matching happens at fixed, known locations only. Not everywhere. Not always.
              </p>
            </Reveal>

            <Reveal className="ethics-row" delay={180}>
              <span className="ethics-dash" aria-hidden="true">—</span>
              <p className="ethics-text">
                Every match requires human confirmation before any action is taken.
              </p>
            </Reveal>

            <Reveal className="ethics-row" delay={240}>
              <span className="ethics-dash" aria-hidden="true">—</span>
              <p className="ethics-text">
                This is a research prototype. No real missing persons data is ever used.
              </p>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ─── SECTION 6: CTA / FOOTER ───────────────────────────────────────── */}
      <footer className="section-footer">
        <div className="footer-main-row">
          {/* Left info */}
          <div className="footer-left">
            <div className="footer-brand-title">ARGUS</div>
            <p className="footer-lead-text">Checkpoint-based missing person matching.</p>
            <p className="footer-sub-text">Built for a college hackathon. Inspired by real deployed systems.</p>
          </div>

          {/* Right CTA */}
          <div className="footer-right">
            <button
              className="btn-primary-signal"
              onClick={() => navigate('/app')}
              aria-label="Open Dashboard"
            >
              OPEN DASHBOARD
            </button>
            <div className="footer-tech-note">
              Built with InsightFace · FAISS · react-globe.gl · FastAPI
            </div>
          </div>
        </div>

        {/* Bottom Hairline & Legal */}
        <div className="footer-bottom-strip">
          <span>© 2026 ARGUS. Research prototype only.</span>
        </div>
      </footer>
    </div>
  );
}
