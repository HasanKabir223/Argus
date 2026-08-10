import type { ElementType, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Radar,
  Fingerprint,
  Network,
  ShieldCheck,
  Activity,
  ArrowRight,
  Globe2,
  FileDown,
  Gauge,
  Layers,
} from 'lucide-react';
import { useReveal } from '../hooks/useReveal';
import { useMagnetic } from '../hooks/useMagnetic';
import './LandingPage.css';

const PIPELINE_STEPS = [
  {
    n: '01',
    title: 'Capture',
    body: 'Checkpoint cameras across the network stream faces in real time — Grand Central, Penn Station, Port Authority, JFK, Newark.',
    icon: Radar,
  },
  {
    n: '02',
    title: 'Embed',
    body: 'Every detected face is reduced to a vector signature and checked against the missing-persons reference gallery.',
    icon: Fingerprint,
  },
  {
    n: '03',
    title: 'Match',
    body: 'A nearest-neighbor search ranks candidates by confidence and bands them — signal, review, or discard.',
    icon: Network,
  },
  {
    n: '04',
    title: 'Review',
    body: 'Operators confirm, dismiss, or flag every match from a live console — nothing is auto-closed.',
    icon: ShieldCheck,
  },
];

const FEATURES = [
  {
    icon: Globe2,
    title: 'Dual Globe / Map View',
    body: 'A 3D globe with traveling arcs between sightings, or a 2D tactical map with reticle pins and a live layer switcher — toggle with one keystroke.',
  },
  {
    icon: Layers,
    title: 'Confidence Banding',
    body: 'Matches are triaged the moment they land: ≥80% reads as signal, 60–80% as amber for review, below that dims to a discard tier.',
  },
  {
    icon: Activity,
    title: 'Live Telemetry',
    body: 'FPS, embedding throughput, index search time, and dedup rate stream into the HUD every 2.5 seconds — no refresh, no polling by hand.',
  },
  {
    icon: FileDown,
    title: 'Audit Trail',
    body: 'Every confirm, dismiss, and flag is timestamped and logged, exportable to CSV for after-action review.',
  },
];

const STATS = [
  { value: '5', label: 'Active Checkpoints' },
  { value: '3', label: 'Confidence Tiers' },
  { value: '2.5s', label: 'Telemetry Refresh' },
  { value: '100%', label: 'Decisions Logged' },
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
      className={`reveal ${inView ? 'is-in' : ''} ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </Tag>
  );
}

export function LandingPage() {
  const navigate = useNavigate();
  const heroCtaRef = useMagnetic<HTMLButtonElement>(0.3, 16);
  const footerCtaRef = useMagnetic<HTMLButtonElement>(0.3, 16);

  return (
    <div className="landing">
      {/* Ambient backdrop */}
      <div className="landing-grid" aria-hidden="true" />
      <div className="landing-glow" aria-hidden="true" />

      <header className="landing-nav">
        <div className="landing-nav-mark">
          <span className="landing-nav-dot" />
          SENTINEL
        </div>
        <button className="button" onClick={() => navigate('/app')}>
          Console
        </button>
      </header>

      <main>
        {/* ---------- Hero ---------- */}
        <section className="hero">
          <p className="hero-eyebrow reveal is-in">
            OPERATIONAL DASHBOARD &nbsp;//&nbsp; CHECKPOINT NETWORK
          </p>
          <h1 className="hero-title reveal is-in" style={{ transitionDelay: '80ms' }}>
            Every checkpoint.
            <br />
            <span className="hero-title-accent">Every sighting. Verified.</span>
          </h1>
          <p className="hero-sub reveal is-in" style={{ transitionDelay: '160ms' }}>
            Mini Gotham is a checkpoint-based facial recognition console for
            locating missing persons in real time — every candidate match
            cross-referenced, triaged by confidence, and put in front of a
            human before it's ever confirmed.
          </p>
          <div className="hero-actions reveal is-in" style={{ transitionDelay: '240ms' }}>
            <button
              ref={heroCtaRef}
              className="cta-button"
              onClick={() => navigate('/app')}
            >
              Launch Console <ArrowRight size={16} strokeWidth={2.5} />
            </button>
            <div className="hero-status">
              <span className="hero-status-dot" />
              5 checkpoints armed — live feed active
            </div>
          </div>
        </section>

        {/* ---------- Pipeline ---------- */}
        <section className="section">
          <Reveal as="p" className="section-eyebrow">
            THE PIPELINE
          </Reveal>
          <Reveal as="h2" className="section-title" delay={60}>
            From camera frame to confirmed match.
          </Reveal>

          <div className="pipeline-grid">
            {PIPELINE_STEPS.map((step, i) => (
              <Reveal
                key={step.n}
                className="pipeline-card"
                delay={i * 110}
              >
                <span className="pipeline-num numeric-data">{step.n}</span>
                <step.icon className="pipeline-icon" size={22} strokeWidth={1.75} />
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </Reveal>
            ))}
          </div>
        </section>

        {/* ---------- Features ---------- */}
        <section className="section">
          <Reveal as="p" className="section-eyebrow">
            THE CONSOLE
          </Reveal>
          <Reveal as="h2" className="section-title" delay={60}>
            Built for a three-minute walkthrough
            <br />
            and a real shift.
          </Reveal>

          <div className="feature-grid">
            {FEATURES.map((f, i) => (
              <Reveal key={f.title} className="feature-card" delay={i * 90}>
                <f.icon className="feature-icon" size={20} strokeWidth={1.75} />
                <h3>{f.title}</h3>
                <p>{f.body}</p>
              </Reveal>
            ))}
          </div>
        </section>

        {/* ---------- Stats ---------- */}
        <section className="section stats-section">
          <Reveal className="stats-strip">
            {STATS.map((s, i) => (
              <div
                className="stat"
                key={s.label}
                style={{ transitionDelay: `${i * 90}ms` }}
              >
                <span className="stat-value numeric-data">{s.value}</span>
                <span className="stat-label">{s.label}</span>
              </div>
            ))}
          </Reveal>
        </section>

        {/* ---------- Closing CTA ---------- */}
        <section className="closing">
          <Reveal>
            <Gauge className="closing-icon" size={28} strokeWidth={1.5} />
          </Reveal>
          <Reveal as="h2" className="closing-title" delay={60}>
            The console is live.
          </Reveal>
          <Reveal delay={140}>
            <button
              ref={footerCtaRef}
              className="cta-button cta-button-large"
              onClick={() => navigate('/app')}
            >
              Enter Sentinel <ArrowRight size={18} strokeWidth={2.5} />
            </button>
          </Reveal>
        </section>
      </main>

      <footer className="landing-footer">
        <span>Mini Gotham — checkpoint intelligence, built for the field.</span>
      </footer>
    </div>
  );
}
