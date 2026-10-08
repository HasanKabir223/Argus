### ARGUS — AI Pipeline Implementation Prompt

#### For Gemini Flash 3.7

---

### CRITICAL RULES BEFORE YOU WRITE ANY CODE

Read these before touching anything:

1. **DO NOT touch any frontend code, React files, JSX, HTML, CSS, or anything in a** **`frontend/`** **or** **`ui/`** **folder.** This prompt is backend + AI pipeline only.
2. **DO NOT install or import** **`insightface`** **for detection.** YuNet from OpenCV is the detector. `insightface` is only used for ArcFace embedding.
3. **DO NOT use** **`app = FaceAnalysis()`** **for detection.** That is for embedding only.
4. **DO NOT write a Flask server, Django server, or any web server.** Only write the pipeline functions described below.
5. **DO NOT add argparse, CLI interfaces, or config file parsers** unless explicitly told to.
6. **DO NOT refactor, rename, or restructure any existing files** not mentioned in this prompt.
7. **Write one function at a time. After each function, stop and wait.** Do not write the entire pipeline in one shot.
8. **Every function must have a docstring describing exactly what it takes as input and what it returns.**
9. **Every function must have a try/except block with a specific error message — no silent failures, no bare** **`except:`** **clauses.**
10. **Do not use placeholder comments like** **`# TODO`** **or** **`# implement this later`****.** Every line must be real, working code.

---

### What You Are Building

A Python pipeline that does exactly four things, in this order:

```
CCTV video frame
      ↓
Step 1: YuNet detects all faces in the frame
      ↓
Step 2: Quality filter removes bad face crops
      ↓
Step 3: ArcFace converts each good crop to a 512-dim embedding vector
      ↓
Step 4: FAISS compares each embedding against the watchlist database
      ↓
Returns: list of matches with person_id, confidence score, and face crop
```

That is the entire scope. Nothing else. No web server, no database writes, no UI, no file watching, no async workers.

---

### Environment Setup

#### Required installs — run these exactly, do not change versions:

bash

```
pip install opencv-python==4.9.0.80 --break-system-packages
pip install onnxruntime==1.17.0 --break-system-packages
pip install insightface==0.7.3 --break-system-packages
pip install faiss-cpu==1.7.4 --break-system-packages
pip install numpy==1.26.4 --break-system-packages
```

#### Required model file downloads:

**YuNet model file** — download this manually once:

bash

```
wget -O yunet.onnx https://github.com/opencv/opencv_zoo/raw/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx
```

**ArcFace model** — `insightface` downloads this automatically on first use. Do not manually specify a path. It saves to `~/.insightface/`.

#### File structure you are building into:

```
argus/
├── pipeline/
│   ├── __init__.py        ← create this (empty file)
│   ├── detector.py        ← Step 1 + Step 2 code goes here
│   ├── embedder.py        ← Step 3 code goes here
│   ├── searcher.py        ← Step 4 code goes here
│   └── pipeline.py        ← assembles all 3 steps into one function
├── watchlist/
│   ├── build_index.py     ← builds FAISS index from watchlist photos
│   └── index.faiss        ← generated file, do not create manually
├── models/
│   └── yunet.onnx         ← the downloaded YuNet model file
└── main.py                ← runs the pipeline on a video file
```

**Create every file listed above. Do not create any other files.**

---

### Step 1 + Step 2 — detector.py

Write a file called `pipeline/detector.py` containing exactly two functions:

#### Function 1: `load_detector`

python

```
def load_detector(model_path: str, input_size: tuple = (640, 480)) -> cv2.FaceDetectorYN:
```

**What it does:**

- Loads the YuNet ONNX model from `model_path`
- Sets detection input size to `input_size`
- Sets `score_threshold` to `0.6` — hardcoded, do not make it a parameter
- Sets `nms_threshold` to `0.3` — hardcoded, do not make it a parameter
- Sets `top_k` to `5000` — hardcoded, do not make it a parameter
- Returns the detector object

**Error handling:**

- If the file at `model_path` does not exist, raise `FileNotFoundError` with the message:
   `f"YuNet model not found at {model_path}. Run: wget -O models/yunet.onnx https://github.com/opencv/opencv_zoo/raw/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx"`

**Do not:**

- Do not make `score_threshold`, `nms_threshold`, or `top_k` into function parameters
- Do not add GPU/CUDA logic — CPU only

---

#### Function 2: `detect_and_filter`

python

```
def detect_and_filter(
    detector: cv2.FaceDetectorYN,
    frame: np.ndarray,
    min_face_size: int = 40,
    blur_threshold: float = 80.0
) -> list[dict]:
```

**What it does:**

First, resize the input frame to match the detector's expected input size. Use this exact code to get the current detector input size and resize:

python

```
h, w = frame.shape[:2]
detector.setInputSize((w, h))
```

Do NOT resize the frame — set the input size to match the frame instead. This avoids coordinate scaling bugs.

Then call:

python

```
_, faces = detector.detect(frame)
```

If `faces` is `None`, return an empty list immediately. Do not proceed.

For each detected face in `faces`, do the following in order:

**Parse the YuNet output row.** Each face is a row with 15 values:

```
[x, y, w, h, re_x, re_y, le_x, le_y, nt_x, nt_y, rcm_x, rcm_y, lcm_x, lcm_y, score]
 0  1  2  3   4     5     6     7     8     9     10    11    12    13    14
```

- `x, y, w, h` = bounding box (top-left corner + width + height)
- indices 4–13 = five 2D landmark points (right eye, left eye, nose tip, right mouth corner, left mouth corner)
- index 14 = detection confidence score

**Quality filter 1 — minimum size:**
 If `w < min_face_size` OR `h < min_face_size`, skip this face. Do not add it to results.

**Quality filter 2 — confidence score:**
 If `score < 0.6`, skip this face.

**Quality filter 3 — aspect ratio:**
 If `w / h < 0.5` OR `w / h > 2.0`, skip this face. This removes badly cropped partial faces.

**Quality filter 4 — blur:**
 Crop the face from the frame using the bounding box. Convert crop to grayscale. Compute Laplacian variance. If variance < `blur_threshold`, skip. Use exactly:

python

```
x1, y1 = int(x), int(y)
x2, y2 = int(x + w), int(y + h)
x1, y1 = max(0, x1), max(0, y1)
x2, y2 = min(frame.shape[1], x2), min(frame.shape[0], y2)
crop = frame[y1:y2, x1:x2]
if crop.size == 0:
    continue
gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
blur_score = cv2.Laplacian(gray, cv2.CV_64F).var()
if blur_score < blur_threshold:
    continue
```

**If the face passes all four filters**, add a dict to the results list with exactly these keys:

python

```
{
    "bbox": [x1, y1, x2, y2],         # ints, absolute pixel coords
    "landmarks": np.array([            # shape (5, 2), float32
        [face[4],  face[5]],           # right eye
        [face[6],  face[7]],           # left eye
        [face[8],  face[9]],           # nose tip
        [face[10], face[11]],          # right mouth corner
        [face[12], face[13]],          # left mouth corner
    ], dtype=np.float32),
    "det_score": float(face[14]),      # float, detection confidence
    "crop": crop,                      # np.ndarray, BGR, uncropped region from frame
    "blur_score": float(blur_score)    # float, Laplacian variance
}
```

**Return:** list of these dicts. Empty list if no faces passed the filters.

**Error handling:**
 Wrap the entire function body in `try/except Exception as e:` and if an exception occurs, print `f"[detector] Error processing frame: {e}"` and return an empty list. Never crash the pipeline on a single bad frame.

---

### Step 3 — embedder.py

Write a file called `pipeline/embedder.py` containing exactly two functions:

#### Function 1: `load_embedder`

python

```
def load_embedder() -> object:
```

**What it does:**

- Imports `insightface` and creates a recognition model using exactly:

python

```
import insightface
model = insightface.model_zoo.get_model('arcface_r100_v1')
model.prepare(ctx_id=0)
```

- `ctx_id=0` means GPU if available, CPU if not — this is handled automatically by insightface
- Returns the model object

**Error handling:**
 If the import fails or model download fails, raise `RuntimeError` with message:
 `"Failed to load ArcFace model. Run: pip install insightface==0.7.3"`

---

#### Function 2: `get_embedding`

python

```
def get_embedding(model, face_dict: dict) -> np.ndarray | None:
```

**What it does:**

Takes one face dict (as output by `detect_and_filter`) and returns a 512-dim L2-normalized embedding vector.

**The alignment step — do this exactly, do not skip it:**

ArcFace requires a 112×112 aligned face image, not a raw bounding-box crop. Use InsightFace's built-in alignment using the landmarks:

python

```
from insightface.utils import face_align

# InsightFace expects landmarks as shape (5, 2)
landmarks = face_dict["landmarks"]  # already (5, 2) float32 from detector

# Align the face to 112x112 using the landmarks
# The third argument is the image the landmarks refer to
aligned_face = face_align.norm_crop(
    face_dict["crop"],   # the BGR face crop from the frame
    landmark=landmarks,
    image_size=112
)
```

**Why this matters:** Raw bounding-box crops include background, are different sizes, and vary in rotation. Aligned crops are always 112×112, face-centered, rotation-corrected. This single step improves ArcFace accuracy measurably. Do not skip it, do not replace it with a manual resize.

**Then generate the embedding:**

python

```
embedding = model.get_feat(aligned_face)    # shape (1, 512)
embedding = embedding.flatten()              # shape (512,)

# L2 normalize — required for cosine similarity via dot product
norm = np.linalg.norm(embedding)
if norm == 0:
    return None
embedding = embedding / norm                 # unit vector, shape (512,)

return embedding.astype(np.float32)
```

**Return:** `np.ndarray` of shape `(512,)`, dtype `float32`, L2-normalized. Return `None` if alignment or embedding fails.

**Error handling:**
 Wrap in `try/except`, print `f"[embedder] Failed to embed face: {e}"`, return `None` on any error.

---

### Step 4 — searcher.py

Write a file called `pipeline/searcher.py` containing exactly three functions:

#### Function 1: `load_index`

python

```
def load_index(index_path: str, metadata_path: str) -> tuple[faiss.Index, list[dict]]:
```

**What it does:**

- Loads a FAISS index from `index_path` using `faiss.read_index(index_path)`
- Loads metadata from `metadata_path` using `json.load()` — this is a JSON file containing a list of dicts, one per watchlist person
- Returns `(index, metadata_list)` as a tuple

**Error handling:**

- If `index_path` does not exist: raise `FileNotFoundError` with message `f"FAISS index not found at {index_path}. Run build_index.py first."`
- If `metadata_path` does not exist: raise `FileNotFoundError` with message `f"Metadata file not found at {metadata_path}. Run build_index.py first."`

---

#### Function 2: `search`

python

```
def search(
    index: faiss.Index,
    metadata: list[dict],
    query_embedding: np.ndarray,
    top_k: int = 5,
    threshold_confirmed: float = 0.75,
    threshold_review: float = 0.60
) -> list[dict]:
```

**What it does:**

Searches the FAISS index for the closest matches to `query_embedding`.

**Exact search code — use this verbatim:**

python

```
query = query_embedding.reshape(1, -1).astype(np.float32)
scores, indices = index.search(query, top_k)
# scores[0]: array of cosine similarity values (float32)
# indices[0]: array of positions in the metadata list (int64)
```

For each (score, idx) pair in `zip(scores[0], indices[0])`:

- If `idx == -1`: skip — FAISS returns -1 for empty slots
- If `score < threshold_review`: skip — below minimum threshold, not worth flagging
- If `threshold_review <= score < threshold_confirmed`: include with `"match_type": "LOW_CONFIDENCE"`
- If `score >= threshold_confirmed`: include with `"match_type": "CONFIRMED"`

For each included result, return a dict with exactly these keys:

python

```
{
    "person_id":   metadata[idx]["person_id"],   # str
    "name":        metadata[idx]["name"],         # str
    "confidence":  float(score),                  # float, range 0-1
    "match_type":  "CONFIRMED" or "LOW_CONFIDENCE",
    "photo_path":  metadata[idx]["photo_path"]    # str, path to reference photo
}
```

**Return:** list of result dicts, sorted by confidence descending. Empty list if no matches above `threshold_review`.

**Error handling:**
 Wrap in `try/except`, print `f"[searcher] Search failed: {e}"`, return empty list.

---

#### Function 3: `explain_score`

python

```
def explain_score(score: float) -> str:
```

**What it does:**
 Returns a plain English explanation of what the confidence score means. Used for logging/debugging only.

python

```
if score >= 0.85:   return f"{score:.3f} — Very high confidence. Strong candidate for review."
if score >= 0.75:   return f"{score:.3f} — Confirmed match threshold. Flag for human review."
if score >= 0.60:   return f"{score:.3f} — Low confidence. Possible match, treat with caution."
return              f"{score:.3f} — Below threshold. Not a match."
```

---

### Watchlist Index Builder — watchlist/build\_index.py

Write a standalone script that builds the FAISS index from a folder of reference photos. This runs ONCE before the pipeline starts, not during it.

**Usage:**

bash

```
python watchlist/build_index.py --photos_dir ./watchlist/photos --output_dir ./watchlist
```

**The script must do exactly this:**

python

```
"""
build_index.py

Reads a folder of reference photos, generates ArcFace embeddings for each,
and saves a FAISS index + metadata JSON file.

Folder structure expected:
    watchlist/photos/
        M-0001_Riya_Sharma.jpg
        M-0002_Arjun_Mehta.jpg
        M-0003_Priya_Patel.jpg

Filename format: {person_id}_{Name_With_Underscores}.jpg
person_id and name are parsed from the filename automatically.
"""

import os, sys, json, argparse
import cv2
import numpy as np
import faiss

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from pipeline.detector import load_detector, detect_and_filter
from pipeline.embedder import load_embedder, get_embedding

def build_index(photos_dir: str, output_dir: str):
    print(f"[build_index] Loading models...")
    detector  = load_detector("models/yunet.onnx")
    embedder  = load_embedder()

    embeddings = []
    metadata   = []
    failed     = []

    photo_files = [
        f for f in os.listdir(photos_dir)
        if f.lower().endswith((".jpg", ".jpeg", ".png"))
    ]

    if not photo_files:
        raise ValueError(f"No images found in {photos_dir}")

    print(f"[build_index] Processing {len(photo_files)} reference photos...")

    for filename in photo_files:
        path = os.path.join(photos_dir, filename)
        name_part = os.path.splitext(filename)[0]          # "M-0001_Riya_Sharma"
        parts     = name_part.split("_", 1)                # ["M-0001", "Riya_Sharma"]

        if len(parts) != 2:
            print(f"[build_index] SKIP {filename} — filename must be {{id}}_{{Name}}.jpg")
            failed.append(filename)
            continue

        person_id = parts[0]                               # "M-0001"
        name      = parts[1].replace("_", " ")            # "Riya Sharma"

        frame = cv2.imread(path)
        if frame is None:
            print(f"[build_index] SKIP {filename} — could not read image")
            failed.append(filename)
            continue

        faces = detect_and_filter(detector, frame, min_face_size=20, blur_threshold=40.0)
        # lower thresholds for reference photos — they may be cleaner but smaller

        if not faces:
            print(f"[build_index] SKIP {filename} — no face detected")
            failed.append(filename)
            continue

        # Use the highest-confidence face if multiple detected
        best_face = max(faces, key=lambda f: f["det_score"])
        embedding = get_embedding(embedder, best_face)

        if embedding is None:
            print(f"[build_index] SKIP {filename} — embedding failed")
            failed.append(filename)
            continue

        embeddings.append(embedding)
        metadata.append({
            "person_id":  person_id,
            "name":       name,
            "photo_path": path
        })
        print(f"[build_index] OK  {filename} → {person_id} ({name})")

    if not embeddings:
        raise RuntimeError("No embeddings generated. Check your photos and model setup.")

    # Build FAISS index
    dim   = 512
    index = faiss.IndexFlatIP(dim)             # Inner product = cosine sim on normalized vectors
    matrix = np.stack(embeddings).astype(np.float32)
    index.add(matrix)

    # Save index
    index_path    = os.path.join(output_dir, "index.faiss")
    metadata_path = os.path.join(output_dir, "metadata.json")

    faiss.write_index(index, index_path)
    with open(metadata_path, "w") as f:
        json.dump(metadata, f, indent=2)

    print(f"\n[build_index] Done.")
    print(f"  Persons indexed : {len(embeddings)}")
    print(f"  Skipped         : {len(failed)} ({', '.join(failed) if failed else 'none'})")
    print(f"  FAISS index     : {index_path}")
    print(f"  Metadata        : {metadata_path}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--photos_dir",  required=True)
    parser.add_argument("--output_dir",  required=True)
    args = parser.parse_args()
    os.makedirs(args.output_dir, exist_ok=True)
    build_index(args.photos_dir, args.output_dir)
```

---

### Step 5 — pipeline.py (assembles everything)

Write `pipeline/pipeline.py` containing one class:

python

```
class ARGUSPipeline:
    """
    Full ARGUS face-matching pipeline.

    Usage:
        pipeline = ARGUSPipeline(
            yunet_model_path="models/yunet.onnx",
            faiss_index_path="watchlist/index.faiss",
            faiss_metadata_path="watchlist/metadata.json"
        )
        results = pipeline.process_frame(frame, checkpoint_id="cp-001")
    """

    def __init__(self, yunet_model_path, faiss_index_path, faiss_metadata_path):
        # load all three models/indexes at init time, not per frame
        # store as self.detector, self.embedder, self.index, self.metadata

    def process_frame(self, frame: np.ndarray, checkpoint_id: str) -> list[dict]:
        """
        Input:  a single BGR video frame (np.ndarray), checkpoint ID string
        Output: list of match result dicts. Empty list if no matches.

        Each result dict has keys:
            face_bbox    : [x1, y1, x2, y2]
            det_score    : float
            person_id    : str
            name         : str
            confidence   : float
            match_type   : "CONFIRMED" or "LOW_CONFIDENCE"
            photo_path   : str
            checkpoint_id: str
        """
        results = []

        # 1. Detect
        faces = detect_and_filter(self.detector, frame)
        if not faces:
            return []

        # 2. Embed + search each face
        for face in faces:
            embedding = get_embedding(self.embedder, face)
            if embedding is None:
                continue

            matches = search(self.index, self.metadata, embedding)

            for match in matches:
                results.append({
                    **match,
                    "face_bbox":     face["bbox"],
                    "det_score":     face["det_score"],
                    "checkpoint_id": checkpoint_id
                })

        return results
```

---

### main.py — runs the pipeline on a video file

python

```
"""
main.py

Runs ARGUS pipeline on a video file and prints all matches to stdout.
Does NOT write to any database, does NOT start any server.
This is a standalone test runner for the AI pipeline only.

Usage:
    python main.py --video path/to/video.mp4 --checkpoint cp-001
"""
```

**What it does:**

- Loads `ARGUSPipeline` with hardcoded paths:
  - `yunet_model_path = "models/yunet.onnx"`
  - `faiss_index_path = "watchlist/index.faiss"`
  - `faiss_metadata_path = "watchlist/metadata.json"`
- Opens the video with `cv2.VideoCapture`
- Processes every `PROCESS_EVERY_N = 5` frames (skip 4, process 1)
- For each frame, calls `pipeline.process_frame(frame, checkpoint_id)`
- For each result, prints exactly:

```
  [MATCH] person_id=M-0001 | name=Riya Sharma | confidence=0.872 | type=CONFIRMED | checkpoint=cp-001 | frame=450
```

- At the end, prints a summary:

```
  === SUMMARY ===
  Frames processed : 240
  Total matches    : 3
  Confirmed        : 2
  Low confidence   : 1
```

- Then exits. No server, no file writes, no database.

---

### What to do if something breaks

Follow this debugging order exactly — do not skip steps:

1. **"No module named X"** → run the pip install command from the setup section exactly as written
2. **"YuNet model not found"** → run the wget command from the setup section
3. **"No face detected" in build\_index** → lower `min_face_size` to `15` and `blur_threshold` to `30.0` in the `build_index()` call
4. **`faces`** **is always** **`None`** **from YuNet** → check that `detector.setInputSize((w, h))` is called with `w, h` from the actual frame, not a hardcoded size
5. **Embedding is always** **`None`** → the aligned face crop may be empty — add `print(aligned_face.shape)` immediately after `norm_crop()` to verify it's `(112, 112, 3)`
6. **FAISS scores are all negative** → embeddings are not L2-normalized — verify `np.linalg.norm(embedding)` equals `1.0` before adding to the index
7. **All scores below threshold** → your watchlist photos may be too different from CCTV footage — lower `threshold_confirmed` to `0.65` and `threshold_review` to `0.50` temporarily to verify the pipeline is working, then tune back up

---

### What success looks like

When `main.py` runs successfully on a test video with at least one watchlist person in it, you should see output like:

```
[build_index] Loading models...
[build_index] Processing 3 reference photos...
[build_index] OK  M-0001_Riya_Sharma.jpg → M-0001 (Riya Sharma)
[build_index] OK  M-0002_Arjun_Mehta.jpg → M-0002 (Arjun Mehta)
[build_index] Done. Persons indexed: 2, Skipped: 0

[pipeline] Loaded YuNet detector
[pipeline] Loaded ArcFace embedder
[pipeline] Loaded FAISS index — 2 persons

[MATCH] person_id=M-0001 | name=Riya Sharma | confidence=0.847 | type=CONFIRMED | checkpoint=cp-001 | frame=120

=== SUMMARY ===
Frames processed : 300
Total matches    : 1
Confirmed        : 1
Low confidence   : 0
```
