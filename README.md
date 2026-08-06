# Project: Checkpoint-Based Missing Person Matching System
### "Mini Gotham" — Operational Dashboard for Missing Person Identification

---

## 1. Problem Statement

Reuniting missing persons (especially children) with families is a real, urgent social problem. Manual review of found-person reports against missing-person databases is slow and doesn't scale. This project builds a **checkpoint-based face-matching system** with a live operational dashboard — inspired by real deployed systems (e.g. Delhi Police's 2018 facial recognition pilot for missing children) and data-fusion platforms like Palantir Gotham (used by Team Rubicon for disaster response, fusing multiple data sources into one "common operating picture").

**What this is NOT:** a claim of continuous, city-wide, real-time surveillance. This is a **checkpoint-based** system — matching happens at fixed, known locations (e.g. railway stations, bus stands, police posts), the same way real-world deployments work. Every match is logged with location, timestamp, and confidence — and flagged for **human review**, not automatic action.

---

## 2. Core Idea

1. A small reference database of missing-person photos is converted into face embeddings and stored in a searchable vector index.
2. Fixed "checkpoints" (simulated cameras at known locations) process incoming photos/video frames.
3. Detected faces are matched against the reference database.
4. High-confidence matches are logged (person, checkpoint, location, timestamp, confidence) and shown on a live map dashboard for human review.

---

## 3. Ethical Framing (say this explicitly in the pitch)

- **Checkpoint-based, not continuous tracking.** Matching happens at fixed points, not everywhere at once.
- **Human-in-the-loop.** The system suggests candidate matches; a person confirms. No automatic action is taken on a match.
- **Confidence-aware.** Low-confidence matches are flagged for review, not silently trusted or discarded.
- **Demo uses synthetic/public face data only** (LFW/CelebA) — never real missing children's photos.
- **Honest scoping.** Clearly state what's real (checkpoint matching, dashboard, pipeline) vs. simulated (live citywide CCTV integration, real police data feeds) — this is future-work, not implemented.

---

## 4. Tech Stack by Layer

### Layer 1 — Detection & Tracking (per video frame / per checkpoint)
| Component | Tool | Purpose |
|---|---|---|
| Face/person detection | YOLO (or a lightweight face detector like RetinaFace) | Find faces in each frame |
| Multi-object tracking | ByteTrack / DeepSORT | Assign a temporary track ID per person so we don't re-process the same person every frame |

### Layer 2 — Embedding Generation
| Component | Tool | Purpose |
|---|---|---|
| Face embedding model | ArcFace (via `insightface` library), pretrained | Convert a face crop into a 512-dim vector |
| Optimization | Pruned/distilled lightweight variant (e.g. MobileFaceNet-style) | Trade a small amount of accuracy for real-time throughput at high face-count scenes |
| Batching | Batch inference instead of per-face loop | Large speedup on GPU vs. sequential calls |

### Layer 3 — Similarity Search
| Component | Tool | Purpose |
|---|---|---|
| Vector index | FAISS (`IndexFlatIP` for cosine similarity, or `IndexFlatL2`) | Store and search reference embeddings |
| Similarity metric | Cosine similarity | Score range -1 to 1; threshold ~0.75 = match |
| Scale note | At ~100 reference vectors, flat (brute-force) search is already instant — no need for HNSW/IVF indexing at this scale. Mention in pitch: "search isn't the bottleneck, embedding generation is." |

### Layer 4 — Backend / Event Store
| Component | Tool | Purpose |
|---|---|---|
| API server | FastAPI | Endpoints: `/submit_photo`, `/events`, `/checkpoints` |
| Event log | SQLite or JSON file (demo scale) | Stores {person_id, checkpoint_name, lat, long, timestamp, confidence_score} |
| Pipeline pattern | Async producer-consumer queue | Detection keeps running while recognition processes queued face crops — avoids blocking on busy frames |

### Layer 5 — Dashboard (the "Palantir-style" UI)
| Component | Tool | Purpose |
|---|---|---|
| Map | Leaflet.js (free, no API key) or Mapbox GL (nicer, free tier) | Dark-themed map, pins at checkpoint locations |
| Frontend framework | React | Dashboard shell |
| Map pins | Color-coded (grey = idle, red/highlight = active match) | At-a-glance status |
| Side panel | Ranked match list — thumbnail, person ID, checkpoint, confidence %, timestamp | Human review surface |
| Timeline | Horizontal scrubber showing matches over time as dots | "Sightings trail" visual without claiming continuous tracking |
| Detail view | Click a pin/list item → matched photo + reference photo side-by-side + confidence + "flagged for review" status | Human-in-the-loop confirmation step |

---

## 5. Data Flow (End to End)

```
[Checkpoint Photo/Frame]
        ↓
Face Detection + Tracking (per frame, cheap)
        ↓
New track ID? ──No──> reuse stored result, skip everything below
        │
       Yes
        ↓
Filter: skip if face too small/blurry/low-confidence detection
        ↓
Batch → Embedding Model (pruned, once per new track)
        ↓
FAISS Search vs. Reference DB (instant at this scale)
        ↓
Cosine similarity score
        ↓
   Score ≥ 0.75 ──Yes──> Log match event
        │                {person_id, checkpoint, lat, long,
        No                timestamp, confidence}
        ↓                        ↓
   Discard              Push to backend event store
                                  ↓
                        Dashboard polls /events
                                  ↓
                   Map pin lights up + side panel updates
                          + timeline dot added
```

---

## 6. Latency Optimizations (Why This Scales)

Key insight: **the vector database search is NOT the bottleneck at this scale.** Searching 100 reference vectors is sub-millisecond regardless of query volume. The real cost is generating embeddings for every detected face. Optimizations:

1. **Track-based deduplication** — assign each person a temporary tracking ID; only run the expensive embedding model once per new track, not once per frame. A person on screen for 150 frames needs 1 face-check, not 150.
2. **Batch inference** — process all face crops in a frame as one batch through the model instead of a per-face loop. Large speedup on GPU.
3. **Pre-filtering** — discard low-quality/too-small/too-blurry detections before running embedding generation at all.
4. **Pruned/lightweight embedding model** — smaller model trades a small accuracy loss for much higher throughput, necessary when handling high face-counts per frame in real time.
5. **Async pipeline (producer-consumer)** — detection and recognition run as decoupled stages with a queue between them, so a busy frame doesn't freeze the whole system.

**One-line summary for Q&A:** *"At this scale, the database search isn't the bottleneck — it's embedding generation. We solve it with track-based deduplication (embed each person once, not per frame), batched inference, and a pruned lightweight model — a tradeoff we can quantify with real numbers."*

---

## 7. Datasets

| Purpose | Dataset | Notes |
|---|---|---|
| Reference "missing persons" DB | LFW or CelebA (public face datasets) | Use as synthetic stand-ins only, never real missing persons |
| Checkpoint photo streams | Same source, split into folders per simulated checkpoint | Some should intentionally match reference DB to trigger demo matches |
| (Optional) Detection/tracking benchmark | Any public pedestrian/face detection dataset for testing detector accuracy | Not required for MVP |

---

## 8. MVP Scope vs. Stretch Goals

**Must-have (core demo):**
- Working face detection → embedding → FAISS matching pipeline
- 4-5 simulated checkpoints with real coordinates
- Dashboard: map + pins + side panel + basic match display
- At least one live, working demo path (photo submitted → match appears on dashboard)

**Stretch goals (if time allows):**
- Timeline scrubber for "sightings over time"
- Tracking-based deduplication (vs. naive per-frame matching)
- Pruned model with a measured latency/accuracy comparison vs. full model
- Live webcam input during the demo instead of pre-loaded photos

**Explicitly out of scope (say this to judges):**
- Real live CCTV integration
- Real missing-persons data
- City-wide continuous tracking

---

## 9. Demo Script (for judges)

1. Show empty dashboard — "here are our checkpoints, live map"
2. Submit a test photo (webcam or pre-loaded) at Checkpoint A
3. Pin lights up, side panel shows match + confidence score
4. Repeat at 1-2 more checkpoints to build a "sightings trail" on the timeline
5. Click into a match → show side-by-side comparison + "flagged for human review" status
6. Close with the scoping statement: *"Checkpoint matching and the dashboard are fully working. A real deployment would plug into actual cameras at these same physical locations — the architecture doesn't change, only the input source."*

---

## 10. Anticipated Judge Questions (prep answers)

| Question | Answer |
|---|---|
| "Isn't this mass surveillance?" | No — checkpoint-based matching at fixed known locations, not continuous tracking. Human review required before any action. |
| "How does this scale to a real city with millions of records?" | FAISS with HNSW/IVF indexing handles million-scale search in milliseconds; at our demo scale (100 records), even brute-force search is instant. |
| "What about 1000 people in frame at once — won't it be slow?" | Bottleneck isn't the DB search, it's embedding generation. We deduplicate via tracking (embed once per person, not per frame), batch inference, and use a pruned model — all measurable tradeoffs. |
| "What if the photo quality is bad (blurry, aged photo)?" | Confidence threshold + human review step; low-confidence matches are flagged for review, not silently trusted. Real gap in commercial systems we're deliberately addressing. |
| "Is this trained on real people's data?" | No — public face datasets (LFW/CelebA) used as synthetic stand-ins for the demo only. |

---

## 11. Team Task Split (suggested)

- **ML/Backend**: detection + tracking + embedding pipeline + FAISS integration
- **Backend/API**: FastAPI event store, endpoints, data schema
- **Frontend**: React dashboard, Leaflet map, side panel, timeline
- **Optimization/Research**: pruning experiment (model size vs. latency vs. accuracy), writeup for Q&A defense
- **Pitch/Design**: demo script, slides, ethical framing talking points

---

## 12. Novelty Summary (for pitch deck)

1. **Checkpoint-based architecture, not surveillance-claiming** — realistic, defensible framing matching how real systems actually work.
2. **Confidence-aware human-in-the-loop matching** — flags uncertainty instead of forcing a decision, addressing a real gap in commercial face-matching tools (aged photos, poor quality images).
3. **Latency-aware system design** — track-based deduplication + batching + pruned models, a genuine systems-engineering contribution beyond "call a face recognition API."
4. **Operational dashboard, not just a model** — fuses detection + matching + geolocation + timeline into one decision-support tool, closer to how real operational systems (Palantir Gotham-style "common operating picture") are actually built.
