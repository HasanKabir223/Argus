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

WATCHLIST_PROFILES = [
    {
        "filename": "Official_portrait_of_Barack_Obama.jpg",
        "person_id": "p-obama",
        "name": "Barack Obama",
        "age": 63,
        "category": "PERSON OF INTEREST",
        "threat_level": "CRITICAL",
        "offense": "High-Profile Surveillance Target",
        "last_seen": "Washington D.C.",
    },
    {
        "filename": "George_Bush_45_(49492156502).jpg",
        "person_id": "p-bush",
        "name": "George W. Bush",
        "age": 78,
        "category": "PERSON OF INTEREST",
        "threat_level": "HIGH",
        "offense": "Former Head of State — Surveillance Watch",
        "last_seen": "Dallas, TX",
    },
    {
        "filename": "Saddam_Hussein_1979.jpg",
        "person_id": "p-saddam",
        "name": "Saddam Hussein",
        "age": 69,
        "category": "WANTED FUGITIVE",
        "threat_level": "CRITICAL",
        "offense": "International War Crimes / ICC Warrant",
        "last_seen": "Baghdad, Iraq",
    },
    {
        "filename": "Elon_Musk_-_54820081119_(cropped).jpg.webp",
        "person_id": "p-musk",
        "name": "Elon Musk",
        "age": 53,
        "category": "PERSON OF INTEREST",
        "threat_level": "MEDIUM",
        "offense": "High-Value Surveillance Target",
        "last_seen": "Austin, TX",
    },
    {
        "filename": "5d531e5021214c5ee664a588.webp",
        "person_id": "p-trump",
        "name": "Donald Trump",
        "age": 79,
        "category": "PERSON OF INTEREST",
        "threat_level": "CRITICAL",
        "offense": "High-Profile Surveillance Target",
        "last_seen": "Mar-a-Lago, FL",
    },
    {
        "filename": "download.jfif",
        "person_id": "p-suspect-001",
        "name": "Unknown Suspect Alpha",
        "age": 35,
        "category": "WANTED FUGITIVE",
        "threat_level": "HIGH",
        "offense": "Active Felony Warrant — Armed Robbery",
        "last_seen": "Manhattan, NY",
    },
    {
        "filename": "download (1).jfif",
        "person_id": "p-suspect-002",
        "name": "Unknown Suspect Bravo",
        "age": 32,
        "category": "WANTED FUGITIVE",
        "threat_level": "HIGH",
        "offense": "Grand Larceny / Fraud",
        "last_seen": "Brooklyn, NY",
    },
    {
        "filename": "download (2).jfif",
        "person_id": "p-suspect-003",
        "name": "Unknown Suspect Charlie",
        "age": 40,
        "category": "WANTED FUGITIVE",
        "threat_level": "MEDIUM",
        "offense": "Identity Theft / Wire Fraud",
        "last_seen": "Queens, NY",
    },
    {
        "filename": "download (3).jfif",
        "person_id": "p-suspect-004",
        "name": "Unknown Suspect Delta",
        "age": 29,
        "category": "WANTED FUGITIVE",
        "threat_level": "HIGH",
        "offense": "Narcotics Trafficking",
        "last_seen": "Bronx, NY",
    },
    {
        "filename": "images.jfif",
        "person_id": "p-suspect-005",
        "name": "Unknown Suspect Echo",
        "age": 45,
        "category": "WANTED FUGITIVE",
        "threat_level": "MEDIUM",
        "offense": "Fugitive from Justice",
        "last_seen": "Newark, NJ",
    },
    {
        "filename": "images (1).jfif",
        "person_id": "p-suspect-006",
        "name": "Unknown Suspect Foxtrot",
        "age": 38,
        "category": "WANTED FUGITIVE",
        "threat_level": "HIGH",
        "offense": "Assault / Battery — Active Warrant",
        "last_seen": "Jersey City, NJ",
    },
    {
        "filename": "images (2).jfif",
        "person_id": "p-suspect-007",
        "name": "Unknown Suspect Golf",
        "age": 27,
        "category": "WANTED FUGITIVE",
        "threat_level": "MEDIUM",
        "offense": "Burglary / Breaking and Entering",
        "last_seen": "Hoboken, NJ",
    },
    {
        "filename": "images (3).jfif",
        "person_id": "p-suspect-008",
        "name": "Unknown Suspect Hotel",
        "age": 33,
        "category": "WANTED FUGITIVE",
        "threat_level": "HIGH",
        "offense": "Weapons Possession / Illegal Firearms",
        "last_seen": "Staten Island, NY",
    },
]


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
    """
    watchlist_dir = _get_watchlist_dir()
    if not os.path.exists(watchlist_dir):
        print(f"[SeedData] WatchList directory not found at {watchlist_dir}, skipping enrollment.")
        return

    enrolled_count = 0
    enrolled_filenames = set()

    # 1. First enroll known registered profiles
    for profile in WATCHLIST_PROFILES:
        filepath = os.path.join(watchlist_dir, profile["filename"])
        if not os.path.exists(filepath):
            print(f"[SeedData] WARNING: Watchlist image not found: {filepath}")
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
            print(f"[SeedData] WARNING: Could not decode image: {filepath}")
            continue

        # Enroll into gallery (persists to SQLite reference_persons + adds to FAISS)
        try:
            pipeline.gallery_manager.enroll_person(
                person_id=profile["person_id"],
                name=profile["name"],
                photo_bgr=img,
                age=profile.get("age"),
                last_seen=profile.get("last_seen", "Unknown"),
                category=profile.get("category", "WANTED FUGITIVE"),
                threat_level=profile.get("threat_level", "HIGH"),
                offense=profile.get("offense", "Active Felony Warrant"),
            )
            enrolled_count += 1
            enrolled_filenames.add(profile["filename"])
            print(f"[SeedData] ✓ Enrolled in DB & FAISS: {profile['name']} ({profile['person_id']})")
        except Exception as e:
            print(f"[SeedData] ERROR enrolling {profile['name']}: {e}")

    # 2. Dynamically enroll any extra images found in WatchList folder not in predefined list
    valid_img_exts = {".jpg", ".jpeg", ".png", ".webp", ".jfif", ".bmp"}
    for fname in os.listdir(watchlist_dir):
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
                print(f"[SeedData] ✓ Auto-Enrolled extra image in DB & FAISS: {clean_name} ({p_id})")
            except Exception as e:
                print(f"[SeedData] ERROR enrolling extra image {fname}: {e}")

    faiss_count = 0
    if pipeline.search_engine._index is not None:
        faiss_count = pipeline.search_engine._index.ntotal
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
