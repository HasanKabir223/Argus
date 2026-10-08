# PRD — AI Services Layer
## Checkpoint-Based Missing Person Matching System

---

## What This Doc Covers

This is the AI/ML services specification only — detection, tracking, embedding, similarity search, and the pipeline that connects them. Frontend and dashboard are out of scope here.

---

## System Overview

```
[Video Frame / Photo Input]
          ↓
  Face Detection (RetinaFace-MobileNet-0.25)
          ↓
  Quality Filter (size, blur, confidence)
          ↓
  Multi-Object Tracker (ByteTrack)
          ↓
  New Track? ──No──> skip, reuse cached result
          │
         Yes
          ↓
  Batch Embedding (ArcFace via InsightFace buffalo_s)
          ↓
  FAISS Similarity Search vs. Reference DB
          ↓
  Cosine Similarity Score
          ↓
  Score ≥ threshold ──Yes──> Log match event to backend
          │
         No
          ↓
       Discard
```

---

## Service 1 — Face Detection

### Model
**RetinaFace-MobileNet-0.25** via `insightface` (`buffalo_s` bundle)

### Why this model
- 1.7M parameters, ~1MB — runs in real time on CPU
- 60 FPS on VGA single-thread CPU, 40 FPS on GPU for 4K
- Outputs 5-point facial landmarks (eyes, nose, mouth corners) for automatic face alignment before embedding — directly improves downstream matching accuracy
- Same library ecosystem as ArcFace embedding model — zero integration glue

### Performance numbers (cite these in pitch)
| Variant | Params | Size | Easy AP | Medium AP | Hard AP | Speed (VGA CPU) |
|---|---|---|---|---|---|---|
| MobileNet-0.25 | 1.7M | ~1MB | ~88% | ~86% | ~78% | 60 FPS |
| ResNet50 | ~25M | ~100MB | ~95% | ~94% | ~83% | 13 FPS |

→ We use MobileNet-0.25: throughput matters more than the last few AP points at checkpoint scale

### Configuration
```python
from insightface.app import FaceAnalysis

app = FaceAnalysis(name="buffalo_s")
app.prepare(
    ctx_id=0,           # 0 = GPU if available, else CPU
    det_size=(640, 640),
    det_thresh=0.35     # lower than default (0.5) to catch partial/blurry faces
)
```

### Quality filter (runs immediately after detection, before anything expensive)
Skip a detected face if ANY of the following:
- Bounding box area < 40×40 pixels (too small to embed reliably)
- Detection confidence score < `det_thresh` (already filtered by model)
- Blur score > threshold — compute via Laplacian variance:
```python
def is_too_blurry(face_crop, threshold=80.0):
    gray = cv2.cvtColor(face_crop, cv2.COLOR_BGR2GRAY)
    return cv2.Laplacian(gray, cv2.CV_64F).var() < threshold
```
- Face crop aspect ratio outside 0.5–2.0 (badly cropped / partial face)

---

## Service 2 — Multi-Object Tracking

### Why tracking exists in this pipeline
Without tracking, every face gets re-embedded every frame. A person on screen for 5 seconds at 30 FPS = 150 frames = 150 embedding calls for one person. Tracking collapses this to 1 embedding call per person per appearance.

### Model
**ByteTrack** — lightweight, state-of-the-art multi-object tracker
- Tracks by bounding box motion only (no appearance features needed — that's handled by our embedding layer)
- Assigns a stable `track_id` to each person across frames
- Handles occlusion and re-entry gracefully

### Logic
```python
tracker = BYTETracker(args)  # standard ByteTrack init

# Per frame:
detections = app.get(frame)          # RetinaFace detections
tracks = tracker.update(detections)  # ByteTrack assigns/updates track IDs

for track in tracks:
    if track.track_id not in embedded_tracks:
        # New track — run embedding (expensive, done ONCE)
        embed_and_search(track)
        embedded_tracks.add(track.track_id)
    else:
        # Already processed — reuse cached result, skip embedding
        pass
```

### Track cache
```python
embedded_tracks = {}
# key: track_id
# value: {embedding, match_result, confidence, timestamp_first_seen}
```
Cache is cleared per-checkpoint-session (when a new video/stream starts), not globally.

---

## Service 3 — Face Embedding

### Model
**ArcFace** via `insightface` (`buffalo_s` bundle) — pretrained on MS1MV3, outputs 512-dim L2-normalized vectors

### Why ArcFace
- State-of-the-art face recognition loss function — same-person faces cluster tightly in embedding space, different-person faces are pushed apart
- Pretrained weights via `buffalo_s` — no training needed
- RetinaFace's 5-point landmarks feed directly into InsightFace's alignment step before embedding — this is the reason we use both from the same library: automatic alignment is baked in

### Embedding call
```python
# InsightFace handles detection + alignment + embedding in one call
faces = app.get(frame)

for face in faces:
    embedding = face.embedding        # np.array, shape (512,), already L2-normalized
    det_score = face.det_score        # detection confidence
    kps = face.kps                    # 5 landmark points (used internally for alignment)
```

### Batch inference
Do NOT loop per-face sequentially — batch all crops from one frame together:
```python
# InsightFace's app.get() already processes all faces in a frame together
# For explicit batching across frames, use the underlying model directly:
# model.get_feat(aligned_face_crops_batch)  → (N, 512) array
```

### Output
- Shape: `(512,)` float32, L2-normalized (unit vector)
- L2-normalized means cosine similarity = dot product — fast to compute, no division needed

---

## Service 4 — Similarity Search (FAISS)

### Reference database structure
```python
import faiss
import numpy as np

# Build index (done once at startup, not per query)
dimension = 512
index = faiss.IndexFlatIP(dimension)  # Inner Product = cosine similarity on normalized vectors

# Add reference embeddings
# reference_embeddings: np.array shape (N, 512), float32, L2-normalized
index.add(reference_embeddings)

# Metadata store (parallel array — index i in FAISS = index i here)
reference_metadata = [
    {"person_id": "M-0001", "name": "Riya Sharma", "photo_path": "..."},
    {"person_id": "M-0002", "name": "Arjun Mehta", "photo_path": "..."},
    # ...
]
```

### Query (per new track embedding)
```python
def search(query_embedding: np.ndarray, top_k: int = 5, threshold: float = 0.75):
    query = query_embedding.reshape(1, -1).astype(np.float32)

    scores, indices = index.search(query, top_k)
    # scores: (1, top_k) — cosine similarity values, range [-1, 1]
    # indices: (1, top_k) — positions in reference_embeddings

    results = []
    for score, idx in zip(scores[0], indices[0]):
        if score >= threshold:
            results.append({
                "person": reference_metadata[idx],
                "confidence": float(score),
                "match": True
            })

    return results  # empty list = no match above threshold
```

### Similarity metric explanation
- **Cosine similarity** on L2-normalized vectors = dot product
- Range: -1 to 1 (in practice for faces: 0.3–1.0)
- **Threshold 0.75**: same person across different angles/lighting typically scores 0.7–0.95; different people typically score below 0.6
- Tune this threshold on your validation set — lower = more matches caught (more false positives), higher = fewer false positives (more misses)

### Scale note
At 100 reference vectors, `IndexFlatIP` (brute-force) is sub-millisecond per query — no need for approximate methods (HNSW/IVF). Mention in pitch: "at city-scale (millions of records), we'd switch to FAISS-HNSW which handles million-scale search in ~milliseconds — the query API doesn't change, only the index type."

---

## Service 5 — Match Event Logger

### On a confirmed match (score ≥ threshold):
```python
import sqlite3
from datetime import datetime

def log_match(person_id, checkpoint_id, checkpoint_name,
              lat, lng, confidence, face_crop_path):
    conn = sqlite3.connect("events.db")
    conn.execute("""
        INSERT INTO match_events
        (person_id, checkpoint_id, checkpoint_name,
         lat, lng, confidence, face_crop_path, timestamp, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        person_id, checkpoint_id, checkpoint_name,
        lat, lng, confidence, face_crop_path,
        datetime.utcnow().isoformat(), "PENDING_REVIEW"
    ))
    conn.commit()
    conn.close()
```

### Schema
```sql
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
    -- status values: PENDING_REVIEW | CONFIRMED | DISMISSED
);

CREATE TABLE checkpoints (
    id      TEXT PRIMARY KEY,
    name    TEXT NOT NULL,
    lat     REAL NOT NULL,
    lng     REAL NOT NULL,
    status  TEXT DEFAULT 'ACTIVE'
);

CREATE TABLE reference_persons (
    person_id   TEXT PRIMARY KEY,
    name        TEXT,
    photo_path  TEXT NOT NULL,
    embedding   BLOB NOT NULL  -- serialized np.array (512,) float32
);
```

---

## Full Pipeline (assembled)

```python
import cv2
import faiss
import numpy as np
from insightface.app import FaceAnalysis
from byte_tracker import BYTETracker  # pip install bytetracker

# ---- Init ----
app = FaceAnalysis(name="buffalo_s")
app.prepare(ctx_id=0, det_size=(640, 640), det_thresh=0.35)

index = faiss.IndexFlatIP(512)
# load reference embeddings into index at startup

tracker = BYTETracker(args)
embedded_tracks = {}

# ---- Per frame (called in a loop) ----
def process_frame(frame, checkpoint_id, checkpoint_meta):
    faces = app.get(frame)
    if not faces:
        return

    # Quality filter
    faces = [f for f in faces if not is_too_blurry(
        frame[int(f.bbox[1]):int(f.bbox[3]),
              int(f.bbox[0]):int(f.bbox[2])]
    )]

    # Tracking
    tracks = tracker.update(faces)

    for track in tracks:
        if track.track_id in embedded_tracks:
            continue  # already processed this person

        # Embedding
        embedding = track.embedding  # (512,) L2-normalized

        # FAISS search
        results = search(embedding, threshold=0.75)

        # Cache regardless of match (so we don't re-search this track)
        embedded_tracks[track.track_id] = {
            "embedding": embedding,
            "results": results
        }

        # Log if match found
        for result in results:
            log_match(
                person_id=result["person"]["person_id"],
                checkpoint_id=checkpoint_id,
                checkpoint_name=checkpoint_meta["name"],
                lat=checkpoint_meta["lat"],
                lng=checkpoint_meta["lng"],
                confidence=result["confidence"],
                face_crop_path=save_crop(frame, track.bbox)
            )
```

---

## Performance Targets

| Metric | Target | How |
|---|---|---|
| Detection FPS (CPU, VGA) | ≥ 20 FPS | MobileNet-0.25 backbone |
| Detection FPS (GPU) | ≥ 40 FPS | MobileNet-0.25 + CUDA |
| Embedding calls per person | 1 (not per-frame) | ByteTrack deduplication |
| FAISS search latency (100 vectors) | < 1ms | IndexFlatIP brute-force |
| End-to-end latency per new track | < 200ms | batch embed + instant search |

---

## Latency Optimizations (summary)

1. **Track-based deduplication** — embed once per person, not once per frame. Biggest single win.
2. **Quality pre-filter** — skip blurry/tiny faces before any expensive call.
3. **Batch inference** — all faces in a frame processed together, not in a loop.
4. **MobileNet-0.25 detector** — 60 FPS on CPU vs. 13 FPS for ResNet50. Deliberate accuracy tradeoff.
5. **Async pipeline** — detection and embedding run as producer-consumer with a queue between them. Detection never waits on recognition.
6. **Pre-built FAISS index** — index loaded at startup, not rebuilt per query.

---

## Similarity Threshold Tuning

Don't hardcode 0.75 without testing. Run this on your validation set:

```python
# For a set of known same-person pairs and known different-person pairs:
# plot the score distribution for both
# pick threshold at the crossover point that minimizes (false positives + false negatives)
# given the use case (missing persons), bias toward lower false negatives —
# better to flag a borderline case for human review than to miss a real match

THRESHOLD_CONFIRMED = 0.75   # above this → flag as match, send to dashboard
THRESHOLD_REVIEW    = 0.60   # 0.60–0.75 → flag as low-confidence, still send but clearly marked
# below 0.60 → discard silently
```

---

## Dependencies

```txt
insightface==0.7.3
onnxruntime-gpu==1.17.0   # or onnxruntime for CPU-only
faiss-gpu==1.7.4           # or faiss-cpu
opencv-python==4.9.0.80
numpy==1.26.4
bytetracker==0.1.0
fastapi==0.110.0
uvicorn==0.29.0
sqlite3                    # stdlib
```

---

## What Is NOT in Scope for This Service

- Any frontend, dashboard, or UI rendering
- Real CCTV integration (input is video files or webcam for demo)
- Real missing persons data (use LFW/CelebA as synthetic stand-ins)
- Model training from scratch (all models are pretrained)
- City-scale deployment infrastructure (single-machine FastAPI for demo)
