# SENTINEL — Master PRD
## Checkpoint-Based Missing Person Matching System
### Version 1.0 | College Hackathon Build

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [System Architecture](#2-system-architecture)
3. [AI Services](#3-ai-services)
4. [Backend](#4-backend)
5. [Frontend](#5-frontend)
6. [Data Flow — End to End](#6-data-flow--end-to-end)
7. [Datasets](#7-datasets)
8. [MVP Scope vs Stretch Goals](#8-mvp-scope-vs-stretch-goals)
9. [Performance Targets](#9-performance-targets)
10. [Team Task Split](#10-team-task-split)
11. [Demo Script](#11-demo-script)
12. [Judge Q&A Prep](#12-judge-qa-prep)
13. [Novelty Summary](#13-novelty-summary)

---

## 1. Project Overview

### Problem
Reuniting missing persons (especially children) with their families is urgent and slow. Manual review of found-person reports against missing-person databases doesn't scale. India alone registers hundreds of thousands of missing persons per year — and matching them against incoming sighting reports is largely manual, slow, and geographically fragmented.

### What We Built
**SENTINEL** — a checkpoint-based face-matching system with a Palantir-style live operational dashboard. Fixed camera checkpoints (train stations, bus stands, police posts) automatically run AI face matching against a database of missing persons. When a match is found, it appears live on the dashboard — with location, confidence score, and timestamp — for a human operator to review and confirm.

### Real-World Precedent
- **Delhi Police (2018):** Deployed facial recognition across shelters and matched photos of found children against missing-person databases — reportedly identified thousands of children in days.
- **Palantir Gotham (2017):** Deployed with Team Rubicon after Hurricane Harvey, fusing geographical, weather, and vulnerability data into a single ops dashboard for 70+ rescue operations.

SENTINEL sits at the intersection of both: the face-matching capability of the Delhi Police pilot, delivered through the data-fusion operational dashboard philosophy of Palantir Gotham.

### Ethical Framing (repeat in every pitch)
- **Checkpoint-based, not continuous surveillance.** Matching happens at fixed, known locations only — not everywhere, not always.
- **Human-in-the-loop.** The AI suggests candidates; a human confirms. No automatic action is ever taken on a match.
- **Confidence-aware.** Low-confidence matches are explicitly flagged, not silently trusted.
- **Research prototype only.** Demo uses synthetic/public face datasets (LFW/CelebA) — never real missing persons data.

---

## 2. System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                          FRONTEND (React)                            │
│   3D Globe  |  2D Map  |  Match List  |  Detail View  |  Timeline   │
└─────────────────────────────┬───────────────────────────────────────┘
                               │ HTTP polling / REST
                               ↕
┌─────────────────────────────────────────────────────────────────────┐
│                         BACKEND (FastAPI)                            │
│   /checkpoints  |  /events  |  /submit_photo  |  /persons           │
│                        SQLite Event Store                            │
└──────────────┬──────────────────────────────────────────────────────┘
               │ Internal function calls
               ↕
┌─────────────────────────────────────────────────────────────────────┐
│                        AI SERVICES (Python)                          │
│  RetinaFace Detection → ByteTrack → ArcFace Embedding → FAISS Search│
└─────────────────────────────────────────────────────────────────────┘
               │
               ↕
┌─────────────────────────────────────────────────────────────────────┐
│                     DATA LAYER                                       │
│  Reference DB (FAISS index + metadata)  |  SQLite (events, persons) │
│  Video/photo input per checkpoint       |  Face crop storage         │
└─────────────────────────────────────────────────────────────────────┘
```

### Tech Stack Summary

| Layer | Tech |
|---|---|
| AI Detection | RetinaFace-MobileNet-0.25 (via `insightface`) |
| AI Tracking | ByteTrack |
| AI Embedding | ArcFace 512-dim (via `insightface buffalo_s`) |
| AI Search | FAISS `IndexFlatIP` |
| Backend | FastAPI + Uvicorn |
| Database | SQLite |
| Frontend | React + react-globe.gl + Leaflet.js |
| Styling | Tailwind CSS (custom tokens, no defaults) |

---

## 3. AI Services

### Overview
The AI layer is a sequential pipeline: detect → track → filter → embed → search → log. The key design principle: **do the expensive work as rarely as possible** (once per person per appearance, not once per frame).

---

### 3.1 Face Detection

**Model:** RetinaFace-MobileNet-0.25 via `insightface`

**Why this model:**
- 1.7M parameters, ~1MB model size — runs in real time on CPU
- Outputs 5-point facial landmarks (both eyes, nose tip, mouth corners) for automatic face alignment before embedding — directly improves downstream matching accuracy
- Same library ecosystem as ArcFace — no integration glue needed

**Performance:**

| Backbone | Params | Size | Easy AP | Hard AP | Speed (VGA CPU) |
|---|---|---|---|---|---|
| MobileNet-0.25 | 1.7M | ~1MB | ~88% | ~78% | 60 FPS |
| ResNet50 | ~25M | ~100MB | ~95% | ~83% | 13 FPS |

→ **We use MobileNet-0.25:** throughput matters more than the last few AP points at checkpoint scale.

**Configuration:**
```python
from insightface.app import FaceAnalysis

app = FaceAnalysis(name="buffalo_s")
app.prepare(
    ctx_id=0,            # 0 = GPU if available, else CPU
    det_size=(640, 640),
    det_thresh=0.35      # lower than default 0.5 to catch blurry/partial faces
)
```

---

### 3.2 Quality Filter

Runs immediately after detection. Skips faces before any expensive work:

```python
def is_too_blurry(face_crop, threshold=80.0):
    gray = cv2.cvtColor(face_crop, cv2.COLOR_BGR2GRAY)
    return cv2.Laplacian(gray, cv2.CV_64F).var() < threshold

def passes_quality_filter(face, frame):
    x1, y1, x2, y2 = map(int, face.bbox)
    w, h = x2 - x1, y2 - y1

    if w < 40 or h < 40:                   # too small
        return False
    if face.det_score < 0.35:              # low detection confidence
        return False
    crop = frame[y1:y2, x1:x2]
    if is_too_blurry(crop):                # blurry
        return False
    if not (0.5 < w/h < 2.0):             # bad aspect ratio
        return False
    return True
```

---

### 3.3 Multi-Object Tracking (ByteTrack)

**Why tracking exists in this pipeline:**
Without tracking, every face gets re-embedded every frame. A person on screen for 5 seconds at 30 FPS = 150 frames = 150 embedding calls. ByteTrack collapses this to **1 embedding call per person per appearance**.

**How it works:**
- Tracks bounding boxes across frames by motion — no appearance model needed (ArcFace handles identity)
- Assigns a stable `track_id` per person
- Handles partial occlusion and momentary exits gracefully

**Integration:**
```python
from byte_tracker import BYTETracker

tracker = BYTETracker(args)
embedded_tracks = {}  # track_id → {embedding, match_result, confidence}

# Per frame:
faces = app.get(frame)
tracks = tracker.update(faces)

for track in tracks:
    if track.track_id in embedded_tracks:
        continue  # already processed — skip embedding entirely
    # new track → run embedding once
    run_embedding_and_search(track)
    embedded_tracks[track.track_id] = result
```

---

### 3.4 Face Embedding (ArcFace)

**Model:** ArcFace via `insightface buffalo_s` — pretrained on MS1MV3, outputs 512-dim L2-normalized vectors

**Key property:** L2-normalized vectors means cosine similarity = dot product. No division needed at query time — fast.

**Batching:**
```python
# InsightFace handles alignment (using RetinaFace's 5 landmarks) + embedding internally
faces = app.get(frame)

for face in faces:
    embedding = face.embedding   # np.array shape (512,), L2-normalized float32
```

**Why alignment matters:**
RetinaFace outputs 5 facial landmarks per detection → InsightFace uses these to normalize face rotation/scale before embedding → measurably improves matching accuracy (benchmark: 98.37% → 99.49% with alignment vs. without).

---

### 3.5 FAISS Similarity Search

**Index type:** `IndexFlatIP` (inner product = cosine similarity on normalized vectors)

**Build index once at startup:**
```python
import faiss
import numpy as np

dimension = 512
index = faiss.IndexFlatIP(dimension)

# Load reference embeddings (N persons × 512 dims)
reference_embeddings = np.load("reference_embeddings.npy").astype("float32")
index.add(reference_embeddings)

# Parallel metadata list (index i in FAISS = index i here)
reference_metadata = [
    {"person_id": "M-0001", "name": "Riya Sharma", "photo_path": "..."},
    ...
]
```

**Query per new track:**
```python
THRESHOLD_CONFIRMED  = 0.75   # strong match → send to dashboard
THRESHOLD_REVIEW     = 0.60   # borderline → send but clearly flagged low-confidence
# below 0.60 → discard silently

def search(query_embedding: np.ndarray, top_k: int = 5):
    query = query_embedding.reshape(1, -1).astype("float32")
    scores, indices = index.search(query, top_k)

    results = []
    for score, idx in zip(scores[0], indices[0]):
        if score >= THRESHOLD_REVIEW:
            results.append({
                "person":     reference_metadata[idx],
                "confidence": float(score),
                "status":     "CONFIRMED" if score >= THRESHOLD_CONFIRMED else "LOW_CONFIDENCE"
            })
    return results
```

**Scale note:**
At 100 reference vectors, `IndexFlatIP` is sub-millisecond per query — no need for HNSW/IVF. For million-scale deployment, swap to `faiss.IndexHNSWFlat` — the query API doesn't change, only the index type.

---

### 3.6 Full Pipeline (assembled)

```python
def process_frame(frame, checkpoint_id, checkpoint_meta):
    # Step 1: Detect
    faces = app.get(frame)
    if not faces:
        return

    # Step 2: Quality filter
    faces = [f for f in faces if passes_quality_filter(f, frame)]
    if not faces:
        return

    # Step 3: Track
    tracks = tracker.update(faces)

    for track in tracks:
        # Step 4: Skip if already processed
        if track.track_id in embedded_tracks:
            continue

        # Step 5: Embed (once per track)
        embedding = track.embedding  # (512,) L2-normalized

        # Step 6: Search
        results = search(embedding)

        # Step 7: Cache
        embedded_tracks[track.track_id] = {
            "embedding": embedding,
            "results":   results
        }

        # Step 8: Log matches
        for result in results:
            log_match_event(
                person_id       = result["person"]["person_id"],
                checkpoint_id   = checkpoint_id,
                checkpoint_name = checkpoint_meta["name"],
                lat             = checkpoint_meta["lat"],
                lng             = checkpoint_meta["lng"],
                confidence      = result["confidence"],
                status          = result["status"],
                face_crop       = save_crop(frame, track.bbox)
            )
```

---

### 3.7 Latency Optimizations

| Optimization | Mechanism | Impact |
|---|---|---|
| Track-based deduplication | ByteTrack assigns track_id; embed once per track | 30–150x fewer embedding calls |
| Quality pre-filter | Skip blurry/tiny faces before embedding | Cuts workload 20–50% |
| Batch inference | All faces per frame in one forward pass | 5–10x faster than sequential loop |
| Lightweight detector | MobileNet-0.25 vs ResNet50 | 60 FPS vs 13 FPS on CPU |
| Async pipeline | Detection + embedding as producer-consumer with queue | No frame blocking on busy scenes |
| Pre-built FAISS index | Loaded at startup, not rebuilt per query | Sub-millisecond search always |

**One-line Q&A answer:** *"The bottleneck isn't the database search — it's embedding generation. We solve it with tracking-based deduplication, batch inference, and a lightweight model. Each person is embedded once per appearance, not once per frame."*

---

### 3.8 AI Dependencies

```txt
insightface==0.7.3
onnxruntime-gpu==1.17.0
faiss-gpu==1.7.4
opencv-python==4.9.0.80
numpy==1.26.4
bytetracker==0.1.0
```

---

## 4. Backend

### Overview
FastAPI server that sits between the AI pipeline and the frontend. Exposes REST endpoints, manages the SQLite event store, and serves the reference person database.

---

### 4.1 Database Schema

```sql
-- Checkpoints: fixed camera locations
CREATE TABLE checkpoints (
    id      TEXT PRIMARY KEY,
    name    TEXT NOT NULL,
    lat     REAL NOT NULL,
    lng     REAL NOT NULL,
    status  TEXT DEFAULT 'ACTIVE'
);

-- Reference database: missing persons
CREATE TABLE reference_persons (
    person_id   TEXT PRIMARY KEY,
    name        TEXT,
    age         INTEGER,
    photo_path  TEXT NOT NULL,
    embedding   BLOB NOT NULL,  -- serialized np.array (512,) float32
    reported_at TEXT,
    notes       TEXT
);

-- Match events: every time a face matches a reference person
CREATE TABLE match_events (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    person_id       TEXT NOT NULL,
    checkpoint_id   TEXT NOT NULL,
    checkpoint_name TEXT NOT NULL,
    lat             REAL NOT NULL,
    lng             REAL NOT NULL,
    confidence      REAL NOT NULL,
    face_crop_path  TEXT,
    timestamp       TEXT NOT NULL,
    status          TEXT DEFAULT 'PENDING_REVIEW'
    -- PENDING_REVIEW | CONFIRMED | DISMISSED
);
```

---

### 4.2 API Endpoints

#### `GET /checkpoints`
Returns all checkpoint locations and their current status.

**Response:**
```json
[
  {
    "id": "cp-001",
    "name": "Rajkot Railway Station",
    "lat": 22.3039,
    "lng": 70.8022,
    "status": "ACTIVE",
    "recent_match": true
  }
]
```

---

#### `GET /events`
Returns all match events for the current session, newest first.

**Query params:**
- `status` (optional): filter by `PENDING_REVIEW` / `CONFIRMED` / `DISMISSED`
- `since` (optional): ISO timestamp — return only events after this time (for polling)

**Response:**
```json
[
  {
    "id": 1,
    "person_id": "M-0042",
    "person_name": "Riya Sharma",
    "checkpoint_name": "Rajkot Railway Station",
    "lat": 22.3039,
    "lng": 70.8022,
    "confidence": 0.87,
    "face_crop_url": "/crops/1.jpg",
    "reference_photo_url": "/persons/M-0042.jpg",
    "timestamp": "2026-08-10T14:32:07Z",
    "status": "PENDING_REVIEW"
  }
]
```

---

#### `POST /submit_photo`
Accepts a photo from a checkpoint, runs the full AI pipeline, returns match results.

**Request:**
```json
{
  "checkpoint_id": "cp-001",
  "image_base64": "..."
}
```

**Response:**
```json
{
  "faces_detected": 3,
  "matches_found": 1,
  "events": [
    {
      "event_id": 1,
      "person_id": "M-0042",
      "confidence": 0.87,
      "status": "PENDING_REVIEW"
    }
  ]
}
```

---

#### `GET /persons`
Returns the full reference database (missing persons list).

**Response:**
```json
[
  {
    "person_id": "M-0042",
    "name": "Riya Sharma",
    "age": 9,
    "photo_url": "/persons/M-0042.jpg",
    "reported_at": "2026-08-01",
    "notes": "Last seen near Rajkot Central Market"
  }
]
```

---

#### `PATCH /events/:id`
Update the status of a match event (human review action).

**Request:**
```json
{ "status": "CONFIRMED" }
```

**Valid values:** `CONFIRMED` | `DISMISSED` | `PENDING_REVIEW`

---

#### `GET /crops/:filename`
Static file serving for face crop images saved during matching.

---

### 4.3 Server Setup

```python
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="SENTINEL API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/crops",   StaticFiles(directory="crops"),   name="crops")
app.mount("/persons", StaticFiles(directory="persons"), name="persons")
```

Run with:
```bash
uvicorn main:app --reload --port 8000
```

---

### 4.4 Backend Dependencies

```txt
fastapi==0.110.0
uvicorn==0.29.0
python-multipart==0.0.9
aiofiles==23.2.1
sqlite3  # stdlib
```

---

## 5. Frontend

### Overview
A dark, data-dense operational dashboard built in React. The hero experience is a rotating 3D globe showing checkpoint pins and animated sighting arc trails. A persistent side panel shows ranked match events; a bottom timeline strip lets operators replay the full session.

---

### 5.1 Design Tokens

```css
:root {
  /* Backgrounds */
  --bg-void:         #0A0E14;   /* base canvas */
  --bg-panel:        #12161F;   /* panel/card bg */
  --bg-panel-raised: #1A2029;   /* hover/active state */

  /* Borders */
  --border-hairline: #262D3A;   /* all structural dividers, 1px only */

  /* Text */
  --text-primary:   #E8ECF1;
  --text-secondary: #8892A0;

  /* Accents — use sparingly */
  --accent-signal: #00D9A3;   /* teal — confirmed/active/positive ONLY */
  --accent-alert:  #FF4757;   /* red — new unreviewed match ONLY */
  --accent-amber:  #FFB830;   /* amber — borderline confidence */
  --accent-muted:  #3D4759;   /* inactive/dimmed */
}
```

**Typography:**
- **Monospace** (JetBrains Mono / IBM Plex Mono): headers, confidence scores, coordinates, timestamps, status labels, count badges — anything that's a number or a system label
- **Sans** (Inter / IBM Plex Sans): body copy, names, descriptions, button labels

---

### 5.2 Layout

```
┌─────────────────────────────────────────────────────────────────┐
│  TOP BAR (48px, transparent)                                    │
│  [SENTINEL]  ● SYSTEM ACTIVE          [Globe | Map]   14:32:07 │
├───────────────────────────────────────┬─────────────────────────┤
│                                       │                         │
│                                       │   MATCH LIST PANEL      │
│      GLOBE / MAP (main canvas)        │   300px, right-docked   │
│                                       │   scrollable            │
│                                       │                         │
├───────────────────────────────────────┴─────────────────────────┤
│  TIMELINE STRIP (48px, persistent)                              │
│  ──────────────●─────────────●────────────────────────────●── ▶ │
└─────────────────────────────────────────────────────────────────┘
```

- Full bleed, edge to edge — no page margins
- Zero drop shadows — hairline borders only (`--border-hairline`, 1px)
- Zero border-radius on structural panels — 2-4px only on buttons/badges
- Top bar and timeline strip always visible across all views

---

### 5.3 Screens

#### Screen 1 — Globe View (hero, default)

Full-viewport rotating 3D globe. First thing judges see.

**Library:** `react-globe.gl`

**Elements:**
- Dark "night lights" earth texture
- Checkpoint pins:
  - `--accent-muted` → idle
  - `--accent-alert` (pulse, 2s) → new unreviewed match just arrived
  - `--accent-signal` → acknowledged match
- On person selected: animated glowing arcs between all their sighting locations in chronological order — a dash of light visibly travels along each arc (~1.5s, `--accent-signal` with glow). This is the **signature visual moment.**
- Idle: auto-rotates slowly. Stops on user interaction (drag/scroll).
- Empty state text: `No active matches. Checkpoints are live and monitoring.`

```jsx
import Globe from 'react-globe.gl';

<Globe
  globeImageUrl="//unpkg.com/three-globe/example/img/earth-night.jpg"
  pointsData={checkpoints}
  pointColor={p => p.hasMatch ? 'var(--accent-signal)' : 'var(--accent-muted)'}
  pointAltitude={0.01}
  arcsData={selectedPersonArcs}
  arcColor={() => '#00D9A3'}
  arcDashLength={0.4}
  arcDashGap={2}
  arcDashAnimateTime={1500}
  onPointClick={handleCheckpointClick}
/>
```

---

#### Screen 2 — Match List Panel (right-docked, always visible)

**Each list item:**
- Face thumbnail (matched checkpoint crop)
- Person ID + name (`#M-0042 — Riya Sharma`)
- Checkpoint name
- Confidence score — large, monospace, color-coded:
  - ≥ 0.80 → `--accent-signal`
  - 0.60–0.80 → `--accent-amber`
  - < 0.60 → dimmed, labelled `Low confidence`
- Relative timestamp (`2 min ago`)
- Status badge:
  - `PENDING REVIEW` → `--accent-alert` edge, subtle pulse
  - `CONFIRMED` → `--accent-signal`
  - `DISMISSED` → `--accent-muted`, moved to bottom

**Panel header:** `ACTIVE MATCHES` + live count badge

---

#### Screen 3 — Detail View (slide-over, globe stays visible behind)

Opens on match list click. Does not navigate away from globe.

**Contents:**
- `Match Review` header + person ID
- Side-by-side photos: `REFERENCE` (left) vs `CHECKPOINT CAPTURE — [location]` (right)
- Confidence score: large monospace number + clean horizontal bar meter
- Metadata: checkpoint name, lat/lng (monospace), exact timestamp
- Sighting history list (feeds the globe arc animation)
- Action buttons:
  - `Confirm Match` → primary, `--accent-signal`
  - `Dismiss` → secondary, muted
  - `Flag for Manual Review` → tertiary, `--accent-amber`

---

#### Screen 4 — 2D Operational Map (secondary tab)

Toggled from globe via `[ Globe | Map ]` pill in top bar.

- Leaflet or Mapbox dark theme
- Same checkpoint pins + color logic as globe
- Click a pin → recent activity at that checkpoint
- **Globe = strategic overview. Map = tactical/zoomed detail.**

---

#### Screen 5 — Timeline Strip (persistent, bottom)

- Horizontal, spans full session time range
- Each match event = colored dot at its timestamp position
- Hover dot → tooltip: person ID, checkpoint, confidence, time
- Drag playhead → globe/map replays up to that point in time
- Right edge = "now" with subtle pulse (live indicator)

---

### 5.4 API Integration

```javascript
// Poll for new events every 2 seconds
useEffect(() => {
  const interval = setInterval(async () => {
    const res = await fetch(`http://localhost:8000/events?since=${lastFetch}`);
    const newEvents = await res.json();
    if (newEvents.length > 0) {
      setEvents(prev => [...newEvents, ...prev]);
      setLastFetch(new Date().toISOString());
    }
  }, 2000);
  return () => clearInterval(interval);
}, [lastFetch]);
```

---

### 5.5 Motion Rules

| Element | Behavior |
|---|---|
| Globe idle rotation | Slow, continuous, ~0.1°/frame |
| Arc animation (person selected) | Traveling dash, 1.5s per arc, sequential |
| New match pin | Pulse `--accent-alert` for 2s, settles to `--accent-signal` |
| Match list new item | Slide in from top, 150ms ease-out |
| Panel transitions | 150–200ms ease-out throughout |
| Timeline dot | Instant, no animation |
| `prefers-reduced-motion` | All animations off, static states only |

---

### 5.6 What NOT to Do

- No gradients as decorative backgrounds
- No rounded corners on structural panels
- No drop shadows
- No default Tailwind blue `#3B82F6` or purple
- No emoji in UI copy
- No modal dialogs that block the globe
- No marketing/landing-page layout patterns
- Don't use monospace for everything — mono for data, sans for body copy

---

### 5.7 Frontend Dependencies

```json
{
  "react": "^18.x",
  "react-globe.gl": "^2.x",
  "leaflet": "^1.9.x",
  "react-leaflet": "^4.x",
  "axios": "^1.x",
  "tailwindcss": "^3.x"
}
```

---

## 6. Data Flow — End to End

```
[Video frame / photo arrives at checkpoint]
              ↓
     RetinaFace-MobileNet-0.25
     (detect all faces in frame)
              ↓
     Quality filter
     (skip tiny / blurry / bad-aspect faces)
              ↓
     ByteTrack
     (assign track_id per person)
              ↓
     Already in embedded_tracks cache?
     ──Yes──> skip, reuse cached result
     ──No──>
              ↓
     ArcFace embedding
     (512-dim vector, once per new track)
              ↓
     FAISS IndexFlatIP search
     (cosine similarity vs. reference DB)
              ↓
     Score ≥ 0.75 → CONFIRMED match
     Score 0.60–0.75 → LOW_CONFIDENCE match
     Score < 0.60 → discard silently
              ↓
     log_match_event() → SQLite
              ↓
     FastAPI /events endpoint
              ↓
     Frontend polls every 2s
              ↓
     Globe pin pulses red
     Match list updates
     Timeline dot appears
              ↓
     Operator clicks match → Detail View
              ↓
     Operator hits Confirm / Dismiss
              ↓
     PATCH /events/:id → status updated
```

---

## 7. Datasets

| Purpose | Dataset | Access | Notes |
|---|---|---|---|
| Reference "missing persons" DB | LFW or CelebA | Public | Use as synthetic stand-ins only — never real missing persons |
| Checkpoint photo streams | Same source, split into per-checkpoint folders | Public | Some should deliberately match reference DB to trigger demo matches |
| CCTV-quality variation | OpenCV degradation (blur + downscale + noise) applied to reference photos | N/A — generate it | Simulates quality difference between clean reference and CCTV capture |
| (Optional) Real CCTV-style dataset | SCFace (Surveillance Camera Face dataset) | Free for research | Photographed subjects at multiple camera distances/qualities with consent |

---

## 8. MVP Scope vs Stretch Goals

### Must-have (core demo)
- Working detection → embedding → FAISS → match pipeline
- 4-5 simulated checkpoints with real lat/long coordinates
- Globe view with checkpoint pins and arc animation on person selection
- Match list panel with confidence scores and status badges
- Detail view with side-by-side photo comparison
- At least one live working demo path (photo in → match appears on dashboard)

### Stretch goals (if time allows)
- Timeline scrubber with globe replay
- ByteTrack integration (vs. naive per-frame embedding)
- Live webcam input during demo instead of pre-loaded photos
- Dual-threshold (confirmed vs. low-confidence) UI treatment
- 2D map tab alongside globe

### Explicitly out of scope (say this to judges)
- Real live CCTV integration
- Real missing-persons data
- City-wide continuous tracking
- Model training from scratch (all models are pretrained)

---

## 9. Performance Targets

| Metric | Target | Mechanism |
|---|---|---|
| Detection FPS (CPU, VGA) | ≥ 20 FPS | MobileNet-0.25 backbone |
| Detection FPS (GPU) | ≥ 40 FPS | MobileNet-0.25 + CUDA |
| Embedding calls per person | 1 per appearance | ByteTrack deduplication |
| FAISS search latency (100 vectors) | < 1ms | IndexFlatIP brute-force |
| End-to-end latency per new track | < 200ms | Batch embed + instant search |
| Frontend event refresh | 2s | Polling interval |

---

## 10. Team Task Split

| Role | Responsibilities |
|---|---|
| **AI Engineer** | RetinaFace + ArcFace pipeline, quality filter, FAISS index build + query, reference DB embedding generation |
| **ML/Optimization** | ByteTrack integration, batch inference setup, latency/accuracy tradeoff measurement, Q&A prep on optimization choices |
| **Backend Engineer** | FastAPI server, all endpoints, SQLite schema + queries, static file serving, CORS setup |
| **Frontend Engineer** | React shell, react-globe.gl integration, match list panel, detail view slide-over, API polling |
| **UI/Design** | Design token implementation, timeline strip, top bar, 2D map tab, overall visual polish |
| **Pitch Lead** | Demo script rehearsal, slide deck, ethical framing talking points, Q&A prep |

---

## 11. Demo Script

1. Open dashboard — globe visible, checkpoint pins glowing, "SYSTEM ACTIVE"
2. Say: *"These 5 pins represent fixed checkpoints — railway stations, bus stands, police posts — each running AI face matching in real time."*
3. Submit a test photo at Checkpoint A — pin pulses red, match card slides into the list
4. Say: *"A match was found at Rajkot Railway Station. 87% confidence. Flagged for human review."*
5. Click the match — globe draws animated arc from reference location to checkpoint, detail view slides in
6. Show side-by-side reference vs. checkpoint photo, confidence score
7. Repeat at 1-2 more checkpoints to build a visible sighting trail on the globe
8. Hit `Confirm Match` — status updates to CONFIRMED
9. Close: *"Checkpoint matching, the AI pipeline, and the dashboard are all working end to end. A real deployment would plug into existing cameras at these same locations — the architecture doesn't change, only the input source. Everything else — the matching, the dashboard, the human review flow — is production-ready."*

---

## 12. Judge Q&A Prep

| Question | Answer |
|---|---|
| "Isn't this mass surveillance?" | Checkpoint-based only — matching at 4-5 fixed, known locations, not everywhere. Human review required before any action is taken. |
| "How does it scale to millions of records?" | Swap FAISS IndexFlatIP for IndexHNSWFlat — handles million-scale search in milliseconds. Query API doesn't change, only the index type. |
| "What about 1000 people per frame — isn't that slow?" | Bottleneck is embedding, not search. ByteTrack deduplication means each person is embedded once per appearance, not per frame. Batch inference + lightweight model handles the rest. |
| "What if the photo is blurry or old?" | Dual-threshold system: high confidence → confirmed match; borderline → flagged for human review rather than silently trusted or silently discarded. |
| "Is this trained on real missing persons data?" | No — LFW/CelebA public datasets used as synthetic stand-ins. Real deployment would use a government-supplied reference database. |
| "What's novel here vs. just calling a face recognition API?" | Three things: (1) checkpoint-based triage framing for operational use, not raw detection; (2) confidence-aware human-in-the-loop design; (3) latency-aware systems engineering (tracking + batching + lightweight models) — measurable, not hand-waved. |

---

## 13. Novelty Summary

**One-line pitch:** *"We turn a face recognition model into a field-deployable missing-person triage tool — ranking sightings by location and confidence, flagging what the model isn't sure about, and delivering it through an operational dashboard that puts a human in the loop before any action is taken."*

**Three defensible contributions:**

1. **Checkpoint-based operational framing** — not "we built a face recognition model," but "we built a decision-support tool for operators, structured around how real deployed systems (train stations, police posts) actually work." The framing is the contribution as much as the code.

2. **Confidence-aware human-in-the-loop design** — dual thresholds (confirmed vs. borderline) mean the system never silently mis-identifies someone. Low-confidence matches are visible and actionable, not hidden. This addresses a real, documented gap in how commercial face recognition systems fail in practice.

3. **Latency-aware systems design** — track-based deduplication + batch inference + lightweight model selection is a genuine systems engineering contribution with measurable numbers (1 embedding per person vs. 150, 60 FPS vs. 13 FPS) that you can put on a slide and defend quantitatively.
