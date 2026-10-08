# ARGUS
### Humanitarian Intelligence Infrastructure — Checkpoint-Based Missing Person Identification

> **Research prototype.** Human-reviewed. Checkpoint-based. Not mass surveillance.

---

## What is ARGUS?

ARGUS is a real-time operational dashboard for identifying missing persons at fixed checkpoints (railway stations, bus terminals, police posts). It fuses face detection, 512-dimensional ArcFace embeddings, FAISS vector search, and ByteTrack multi-target tracking into a single intelligence console — built for human analysts, not automated action.

Every match is logged with location, timestamp, and confidence score. No action is taken without operator confirmation.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        CCTV / Video Feed                        │
└────────────────────────────┬────────────────────────────────────┘
                             │
                    ┌────────▼────────┐
                    │  Face Detector  │  YuNet (ONNX)
                    │   + ByteTrack   │  track ID deduplication
                    └────────┬────────┘
                             │  new track only
                    ┌────────▼────────┐
                    │  Quality Filter │  size / blur / confidence
                    └────────┬────────┘
                             │  pass
                    ┌────────▼────────┐
                    │  ArcFace Embed  │  512-d L2-normalised vector
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │  FAISS Search   │  cosine similarity vs. watchlist
                    └────────┬────────┘
                             │  score ≥ threshold
               ┌─────────────▼─────────────┐
               │   FastAPI Event Store      │  SQLite · SSE
               │   (backend/main.py)        │
               └─────────────┬─────────────┘
                             │  poll every 2.5 s
               ┌─────────────▼─────────────┐
               │   React Operations Console │  Leaflet · Globe.gl
               │   (src/)                  │  match list · timeline
               └───────────────────────────┘
```

**Key design decisions:**
- Track-based deduplication — each person gets one embedding call per track, not one per frame.
- Flat FAISS index — at watchlist scale (~100–500 persons) brute-force search is sub-millisecond. No HNSW/IVF needed.
- Human-in-the-loop — PENDING → CONFIRMED / DISMISSED / FLAGGED, always by an operator.

---

## Project Layout

```
mini-palantir/
│
├── backend/                    # FastAPI AI Services Layer
│   ├── main.py                 # App entry point, lifespan, static mounts
│   ├── api/
│   │   └── routes.py           # All REST + SSE endpoints
│   ├── services/
│   │   ├── pipeline.py         # Orchestration: detect → embed → search
│   │   ├── cctv_service.py     # CCTV stream ingestion & job management
│   │   ├── face_detector.py    # YuNet ONNX wrapper
│   │   ├── face_embedder.py    # ArcFace embedding via InsightFace
│   │   ├── faiss_search.py     # FAISS index: build, search, persist
│   │   ├── tracker.py          # ByteTrack multi-target tracker
│   │   ├── track_cache.py      # Per-track embedding deduplication
│   │   ├── quality_filter.py   # Face crop quality gating
│   │   ├── event_service.py    # Match event CRUD + SSE broadcast
│   │   ├── gallery_manager.py  # Watchlist photo storage & thumbnails
│   │   ├── ingest_job_service.py # Background ingestion job queue
│   │   └── face_hasher.py      # Perceptual hash for duplicate detection
│   ├── models/
│   │   └── yunet.onnx          # Bundled face detector weights
│   ├── db/
│   │   └── database.py         # SQLAlchemy setup, init_db()
│   ├── data/                   # Runtime: watchlist photos, CCTV clips
│   ├── static/                 # Served crops, gallery images
│   ├── scripts/
│   │   └── seed_data.py        # Initial checkpoint + gallery seeding
│   └── tests/
│
├── argus/                      # Standalone CV pipeline (CLI / batch)
│   ├── main.py
│   ├── pipeline/
│   │   ├── detector.py
│   │   ├── embedder.py
│   │   ├── searcher.py
│   │   └── pipeline.py
│   ├── models/
│   └── watchlist/
│
├── src/                        # React + TypeScript Operations Console
│   ├── main.tsx
│   ├── index.css               # Global design tokens (Obsidian Terminal theme)
│   ├── App.tsx                 # Root: state, event polling, modal orchestration
│   ├── pages/
│   │   ├── LandingPage.tsx     # Entry / marketing page
│   │   └── LandingPage.css
│   ├── components/
│   │   ├── TopBar.tsx          # Command bar: live toggle + action buttons
│   │   ├── MapView.tsx         # Leaflet 2D tactical map + checkpoint pins
│   │   ├── GlobeView.tsx       # Globe.gl 3D globe view
│   │   ├── MatchListPanel.tsx  # Right-side sightings queue
│   │   ├── MatchDetailModal.tsx # Side-by-side face comparison + review
│   │   ├── TimelineStrip.tsx   # Bottom scrubber: sightings over time
│   │   ├── CctvStudioModal.tsx # Live CCTV feed analysis studio
│   │   ├── CctvIngestion.tsx   # Video file ingestion + progress tracking
│   │   ├── WatchlistGalleryModal.tsx # Watchlist CRUD + photo management
│   │   ├── CheckpointStatusPanel.tsx # Per-checkpoint health overview
│   │   ├── AuditLogPanel.tsx   # Operator action history
│   │   ├── LoadingScreen.tsx   # Cinematic boot sequence
│   │   ├── ArchitectureVisuals.tsx   # Landing page face-scan animation
│   │   ├── AbstractArt.tsx     # Canvas radar sweep
│   │   ├── HeroGlobe.tsx       # Landing page globe
│   │   ├── AeroShards.jsx      # Particle field (hero background)
│   │   ├── FaceThumb.tsx       # Lazy-loaded face crop thumbnail
│   │   ├── Toast.tsx           # Notification toasts
│   │   ├── ShortcutsOverlay.tsx
│   │   └── ErrorBoundary.tsx
│   ├── services/
│   │   └── api.ts              # All fetch calls to FastAPI backend
│   ├── hooks/
│   │   ├── useMagnetic.ts
│   │   ├── useReveal.ts
│   │   └── useSpotlight.ts
│   ├── data/
│   │   └── mockData.ts         # Seed checkpoints + fallback match data
│   └── utils/
│       └── confidence.ts       # Confidence tier labelling helpers
│
├── docs/                       # Design documents & planning artefacts
│   ├── MASTER_PRD.md
│   ├── CheckList.md
│   ├── Master Plan for Pipeline.md
│   ├── PRD_AI_services.md
│   └── UI_design.md
│
├── index.html                  # Vite HTML shell
├── vite.config.ts
├── tsconfig.json
├── package.json
├── run_all.bat                 # One-click launcher (backend + frontend + Brave)
├── start_backend.bat
├── start_frontend.bat
└── AGENTS.md                   # AI agent personas & workspace rules
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Face Detection** | YuNet (ONNX, bundled) |
| **Face Embedding** | ArcFace via InsightFace — 512-d vectors |
| **Multi-target Tracking** | ByteTrack |
| **Vector Search** | FAISS (`IndexFlatIP`, cosine similarity) |
| **Backend** | Python 3.10 · FastAPI · SQLite · Uvicorn |
| **Frontend** | React 19 · TypeScript · Vite |
| **Map** | React-Leaflet (2D) · Globe.gl / cobe (3D) |
| **Icons** | Lucide React |
| **Typography** | Inter · Space Grotesk · IBM Plex Mono |
| **Linting** | Oxlint (frontend) |

---

## Prerequisites

| Requirement | Version |
|---|---|
| Python | 3.10 |
| Node.js | 18+ |
| npm | 9+ |

**Python packages** (install once):
```bash
pip install fastapi uvicorn[standard] sqlalchemy insightface onnxruntime faiss-cpu numpy opencv-python pillow
```

**Node packages** (install once from project root):
```bash
npm install
```

---

## Running

### One-click (Windows)
```
run_all.bat
```
Clears stale processes on ports 8000/5173, starts the backend, starts Vite, waits for backend health, then opens Brave at the landing page.

### Manual

**Terminal 1 — Backend:**
```bash
cd mini-palantir
python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000
```

**Terminal 2 — Frontend:**
```bash
cd mini-palantir
npm run dev
```

| URL | Description |
|---|---|
| `http://localhost:5173/` | Landing page |
| `http://localhost:5173/app` | Operations console |
| `http://localhost:8000/docs` | FastAPI Swagger UI |

---

## Keyboard Shortcuts (Operations Console)

| Key | Action |
|---|---|
| `P` | Toggle live polling on / off |
| `V` | Switch map ↔ globe view |
| `C` | Open CCTV Studio |
| `W` | Open Watchlist Gallery |
| `?` | Show all shortcuts |

---

## Ethical Framing

- **Checkpoint-based, not continuous.** Matching only occurs at fixed, declared locations — not city-wide.
- **Human-in-the-loop.** Every candidate match requires operator confirmation before any action.
- **Confidence-aware.** Low-confidence detections are surfaced for review, never silently acted upon.
- **Synthetic data only.** This prototype uses public face datasets (LFW / CelebA) as stand-ins. No real missing persons data is ever stored or processed.
- **Honest scope.** Live CCTV integration and real police data feeds are future work, not implemented.

---

## License

Research prototype — not for production or law enforcement deployment.
