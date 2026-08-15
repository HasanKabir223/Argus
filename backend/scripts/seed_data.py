"""
Seed Data Script — Operational Checkpoint Network & Watchlist Enrollment
Preloads operational checkpoints and auto-enrolls all criminal watchlist
reference images into the FAISS vector database on startup.
"""

import os
import cv2
from typing import Optional
from backend.services.event_service import EventService
from backend.services.pipeline import CheckpointPipeline


DEFAULT_CHECKPOINTS = [
    {"id": "cp-01", "name": "JFK International Airport - T4", "lat": 40.6413, "lng": -73.7781, "status": "ACTIVE"},
    {"id": "cp-02", "name": "Capitol Hill & Union Station Hub", "lat": 38.8977, "lng": -77.0057, "status": "ACTIVE"},
    {"id": "cp-03", "name": "LAX International - Tom Bradley", "lat": 33.9416, "lng": -118.4085, "status": "ACTIVE"},
    {"id": "cp-04", "name": "O'Hare International Airport - T5", "lat": 41.9742, "lng": -87.9073, "status": "ACTIVE"},
    {"id": "cp-05", "name": "Port of Miami & Downtown Corridor", "lat": 25.7781, "lng": -80.1791, "status": "ACTIVE"},
    {"id": "cp-06", "name": "DFW International Airport Hub", "lat": 32.8998, "lng": -97.0403, "status": "ACTIVE"},
    {"id": "cp-07", "name": "SFO International & Golden Gate", "lat": 37.6213, "lng": -122.3790, "status": "ACTIVE"},
    {"id": "cp-08", "name": "Sea-Tac International & Puget Sound", "lat": 47.4502, "lng": -122.3088, "status": "ACTIVE"},
    {"id": "cp-09", "name": "Denver International Airport", "lat": 39.8561, "lng": -104.6737, "status": "ACTIVE"},
    {"id": "cp-10", "name": "Hartsfield-Jackson International", "lat": 33.6407, "lng": -84.4277, "status": "ACTIVE"},
    {"id": "cp-11", "name": "Logan International Airport", "lat": 42.3656, "lng": -71.0096, "status": "ACTIVE"},
    {"id": "cp-12", "name": "Harry Reid Airport & Vegas Strip", "lat": 36.0840, "lng": -115.1537, "status": "ACTIVE"},
    {"id": "cp-13", "name": "Sky Harbor International - T4", "lat": 33.4352, "lng": -112.0101, "status": "ACTIVE"},
    {"id": "cp-14", "name": "Ambassador Bridge Border Crossing", "lat": 42.3120, "lng": -83.0740, "status": "ACTIVE"},
    {"id": "cp-15", "name": "Daniel K. Inouye International", "lat": 21.3245, "lng": -157.9251, "status": "ACTIVE"}
]



# ─── Watchlist Profile Registry ──────────────────────────────────────────────
# Maps each image file in backend/WatchList/ to a criminal profile.
# These are enrolled into FAISS + LSH on startup so CCTV clips can match against them.

WATCHLIST_PROFILES: List[Dict[str, Any]] = []


def _get_watchlist_dir() -> str:
    """Returns absolute path to the WatchList directory, checking case variations."""
    candidates = [
        os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "WatchList")),
        os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "watchlist")),
        os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "data", "watchlist"))
    ]
    for p in candidates:
        if os.path.exists(p):
            return p
    return candidates[0]


def seed_watchlist(pipeline: CheckpointPipeline):
    """
    Loads all watchlist reference images, detects faces, extracts ArcFace embeddings,
    and enrolls them into the SQLite database + FAISS vector index + LSH hash tables.
    Guaranteed collision-free enrollment across all directory files.
    """
    watchlist_dir = _get_watchlist_dir()
    gallery_dir = pipeline.gallery_manager.gallery_dir
    
    enrolled_count = 0
    enrolled_filenames = set()
    enrolled_person_ids = set()

    # 1. First enroll known registered profiles
    for profile in WATCHLIST_PROFILES:
        filepath = os.path.join(watchlist_dir, profile["filename"])
        if not os.path.exists(filepath):
            # Check gallery_dir as fallback
            filepath = os.path.join(gallery_dir, profile["filename"])
            if not os.path.exists(filepath):
                continue

        # Load image with OpenCV with PIL fallback
        img = cv2.imread(filepath)
        if img is None:
            try:
                from PIL import Image
                pil_img = Image.open(filepath).convert("RGB")
                img = cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)
            except Exception:
                pass

        if img is None:
            continue

        try:
            pipeline.gallery_manager.enroll_person(
                person_id=profile["person_id"],
                name=profile["name"],
                photo_bgr=img,
                age=profile.get("age"),
                last_seen=profile.get("last_seen", "Surveillance Network"),
                category=profile.get("category", "WANTED FUGITIVE"),
                threat_level=profile.get("threat_level", "HIGH"),
                offense=profile.get("offense", "Active Criminal Warrant"),
            )
            enrolled_count += 1
            enrolled_filenames.add(profile["filename"])
            enrolled_person_ids.add(profile["person_id"])
            print(f"[SeedData] ✓ Enrolled: {profile['name']} ({profile['person_id']})")
        except Exception as e:
            print(f"[SeedData] Error enrolling {profile['name']}: {e}")

    # 2. Dynamically scan and enroll any additional images in WatchList directory
    valid_img_exts = {".jpg", ".jpeg", ".png", ".webp", ".jfif", ".bmp"}
    if os.path.exists(watchlist_dir):
        for fname in sorted(os.listdir(watchlist_dir)):
            ext = os.path.splitext(fname)[1].lower()
            if ext in valid_img_exts and fname not in enrolled_filenames:
                filepath = os.path.join(watchlist_dir, fname)
                img = cv2.imread(filepath)
                if img is None:
                    try:
                        from PIL import Image
                        pil_img = Image.open(filepath).convert("RGB")
                        img = cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)
                    except Exception:
                        pass

                if img is None:
                    continue

                clean_name = os.path.splitext(fname)[0].replace("_", " ").replace("-", " ").title()
                p_id = f"p-wl-{enrolled_count + 1:03d}"
                while p_id in enrolled_person_ids:
                    enrolled_count += 1
                    p_id = f"p-wl-{enrolled_count + 1:03d}"

                try:
                    pipeline.gallery_manager.enroll_person(
                        person_id=p_id,
                        name=clean_name,
                        photo_bgr=img,
                        age=30,
                        last_seen="Surveillance Network",
                        category="WANTED CRIMINAL",
                        threat_level="HIGH",
                        offense="Fugitive / Criminal Sighting Warrant"
                    )
                    enrolled_count += 1
                    enrolled_filenames.add(fname)
                    enrolled_person_ids.add(p_id)
                    print(f"[SeedData] ✓ Auto-Enrolled: {clean_name} ({p_id})")
                except Exception as e:
                    print(f"[SeedData] Error enrolling extra image {fname}: {e}")

    faiss_count = pipeline.search_engine._index.ntotal if pipeline.search_engine._index is not None else len(pipeline.gallery_manager.persons)
    print(f"[SeedData] Watchlist enrollment complete: {enrolled_count} profiles in SQLite & FAISS ({faiss_count} vectors indexed).")


def seed_initial_system_data(pipeline: Optional[CheckpointPipeline] = None):
    """
    Seeds default checkpoints into SQLite and enrolls watchlist images into FAISS.
    """
    for cp in DEFAULT_CHECKPOINTS:
        EventService.register_checkpoint(cp["id"], cp["name"], cp["lat"], cp["lng"], cp["status"])
    print("[SeedData] Seeded default operational checkpoints.")

    if pipeline:
        seed_watchlist(pipeline)


if __name__ == "__main__":
    from backend.db.database import init_db
    init_db()
    pipe = CheckpointPipeline()
    seed_initial_system_data(pipe)
    print("Database seeded with checkpoints and watchlist profiles.")
