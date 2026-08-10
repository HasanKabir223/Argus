"""
FastAPI Routes for Checkpoint AI Services, CCTV Ingestion & Operations Dashboard
"""

import os
import time
import cv2
import shutil
import numpy as np
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Query
from pydantic import BaseModel
from typing import List, Optional, Dict, Any

from backend.services.pipeline import CheckpointPipeline
from backend.services.event_service import EventService


router = APIRouter(prefix="/api")
pipeline_instance: Optional[CheckpointPipeline] = None


def get_pipeline() -> CheckpointPipeline:
    global pipeline_instance
    if pipeline_instance is None:
        pipeline_instance = CheckpointPipeline()
    return pipeline_instance


class StatusUpdateRequest(BaseModel):
    status: str  # PENDING_REVIEW, CONFIRMED, DISMISSED


class CheckpointCreateRequest(BaseModel):
    id: str
    name: str
    lat: float
    lng: float
    status: Optional[str] = "ACTIVE"


class SimulationTriggerRequest(BaseModel):
    checkpoint_id: Optional[str] = None
    target_person_id: Optional[str] = None
    confidence: Optional[float] = 0.88


class CctvProcessRequest(BaseModel):
    clip_id: Optional[str] = None
    filename: Optional[str] = None
    checkpoint_id: Optional[str] = "cp-01"
    frame_stride: Optional[int] = 2
    confidence_threshold: Optional[float] = 0.60


@router.get("/health")
def health_check():
    return {"status": "ACTIVE", "service": "Mini-Gotham AI Checkpoint & CCTV Ingestion Services"}


@router.get("/checkpoints")
def list_checkpoints():
    """
    Returns the list of monitored physical checkpoints.
    """
    return EventService.get_checkpoints()


@router.post("/checkpoints")
def add_checkpoint(cp: CheckpointCreateRequest):
    return EventService.register_checkpoint(cp.id, cp.name, cp.lat, cp.lng, cp.status or "ACTIVE")


@router.get("/events")
def list_events(
    checkpoint_id: Optional[str] = None,
    person_id: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = 100
):
    """
    Returns logged match sightings with confidence scores and review states.
    """
    return EventService.get_events(checkpoint_id=checkpoint_id, person_id=person_id, status=status, limit=limit)


@router.patch("/events/{event_id}/status")
def update_event_status(event_id: str, body: StatusUpdateRequest):
    """
    Human-in-the-loop review confirmation or dismissal.
    """
    try:
        updated = EventService.update_event_status(event_id, body.status)
        if not updated:
            raise HTTPException(status_code=404, detail="Event not found")
        return updated
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/reference-persons")
def list_reference_persons():
    pipe = get_pipeline()
    return pipe.gallery_manager.get_all_persons()


@router.post("/reference-persons")
async def enroll_reference_person(
    person_id: str = Form(...),
    name: str = Form(...),
    age: int = Form(25),
    last_seen: str = Form("Grand Central Terminal"),
    category: str = Form("WANTED FUGITIVE"),
    threat_level: str = Form("HIGH"),
    offense: str = Form("Active Felony Warrant"),
    file: Optional[UploadFile] = File(None)
):
    """
    Enrolls a new wanted criminal / person of interest into SQLite database & FAISS vector index.
    """
    pipe = get_pipeline()
    image = None

    if file is not None:
        try:
            contents = await file.read()
            if contents:
                nparr = np.frombuffer(contents, np.uint8)
                image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
                if image is None:
                    # Robust fallback via PIL for .jfif, .webp, .png, etc.
                    try:
                        from PIL import Image
                        import io
                        pil_img = Image.open(io.BytesIO(contents)).convert("RGB")
                        image = cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)
                    except Exception:
                        pass
        except Exception as e:
            print(f"[Routes] Image read warning: {e}")

    if image is None:
        image = np.zeros((112, 112, 3), dtype=np.uint8)
        cv2.circle(image, (56, 56), 40, (180, 140, 100), -1)

    meta = pipe.gallery_manager.enroll_person(
        person_id=person_id,
        name=name,
        photo_bgr=image,
        age=age,
        last_seen=last_seen,
        category=category,
        threat_level=threat_level,
        offense=offense
    )
    return meta


@router.post("/watchlist/sync")
def sync_watchlist():
    """
    Scans the WatchList folder and synchronizes all criminal profiles into SQLite and FAISS.
    """
    from backend.scripts.seed_data import seed_watchlist
    pipe = get_pipeline()
    seed_watchlist(pipe)
    all_persons = pipe.gallery_manager.get_all_persons()
    faiss_count = pipe.search_engine._index.ntotal if pipe.search_engine._index else len(all_persons)
    return {
        "status": "WATCHLIST_SYNCED",
        "total_enrolled": len(all_persons),
        "faiss_vectors_indexed": faiss_count,
        "profiles": all_persons
    }


# ─── CCTV Surveillance Ingestion Endpoints ─────────────────────────────────────

@router.get("/cctv/clips")
def list_cctv_clips():
    """
    Lists all available monitored CCTV surveillance camera feeds & video clips.
    """
    pipe = get_pipeline()
    return pipe.cctv_service.get_available_clips()


@router.post("/cctv/process-clip")
def process_cctv_clip(req: CctvProcessRequest):
    """
    Ingests and runs multi-face detection, face cropping, deep embedding extraction,
    FAISS ANN search against the watchlist, and map localization logging.
    """
    pipe = get_pipeline()
    clips = pipe.cctv_service.get_available_clips()

    # Find requested clip
    chosen_clip = None
    if req.clip_id:
        chosen_clip = next((c for c in clips if c["id"] == req.clip_id), None)
    if not chosen_clip and req.filename:
        chosen_clip = next((c for c in clips if c["filename"] == req.filename), None)
    if not chosen_clip and req.checkpoint_id:
        chosen_clip = next((c for c in clips if c["checkpoint_id"] == req.checkpoint_id), None)
    if not chosen_clip:
        chosen_clip = clips[0] if clips else None

    if not chosen_clip:
        raise HTTPException(status_code=404, detail="No CCTV surveillance clips found")

    from backend.services.cctv_service import _get_cctv_storage_dirs
    storage_dirs = _get_cctv_storage_dirs()
    video_path = None
    for sdir in storage_dirs:
        candidate = os.path.join(sdir, chosen_clip["filename"])
        if os.path.exists(candidate):
            video_path = candidate
            break

    if not video_path:
        raise HTTPException(status_code=404, detail=f"Video file not found: {chosen_clip['filename']}")

    results = pipe.cctv_service.process_cctv_clip(
        video_path=video_path,
        checkpoint_id=chosen_clip["checkpoint_id"],
        checkpoint_name=chosen_clip["checkpoint_name"],
        lat=chosen_clip["lat"],
        lng=chosen_clip["lng"],
        camera_id=chosen_clip["camera_id"],
        frame_stride=req.frame_stride or 2,
        confidence_threshold=req.confidence_threshold or 0.60
    )

    # Sync metrics
    pipe.metrics["total_matches_logged"] += results.get("matches_count", 0)
    return results


@router.post("/cctv/upload-clip")
async def upload_and_process_cctv_clip(
    checkpoint_id: str = Form("cp-01"),
    camera_id: str = Form("CAM-CUSTOM [TACTICAL FIELD UPLOAD]"),
    frame_stride: int = Form(2),
    file: UploadFile = File(...)
):
    """
    Accepts an uploaded surveillance video clip (.mp4, .avi, .mov),
    stores it in the CCTV storage directory, detects and crops all faces,
    extracts deep ArcFace embeddings, and matches against the watchlist in FAISS.
    """
    pipe = get_pipeline()
    from backend.services.cctv_service import _get_cctv_storage_dirs
    cctv_dir = _get_cctv_storage_dirs()[0]
    os.makedirs(cctv_dir, exist_ok=True)

    safe_filename = f"upload_{int(time.time())}_{file.filename}"
    out_path = os.path.join(cctv_dir, safe_filename)

    with open(out_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    cps = EventService.get_checkpoints()
    cp_meta = next((c for c in cps if c["id"] == checkpoint_id), {"name": "Field Checkpoint", "lat": 40.7527, "lng": -73.9772})

    results = pipe.cctv_service.process_cctv_clip(
        video_path=out_path,
        checkpoint_id=checkpoint_id,
        checkpoint_name=cp_meta["name"],
        lat=cp_meta["lat"],
        lng=cp_meta["lng"],
        camera_id=camera_id,
        frame_stride=frame_stride,
        confidence_threshold=0.60
    )
    results["video_metadata"]["url"] = f"/static/cctv/{safe_filename}"
    return results


@router.post("/pipeline/submit-photo")
async def submit_checkpoint_photo(
    checkpoint_id: str = Form(...),
    file: UploadFile = File(...)
):
    """
    Processes an uploaded image through the full pipeline at a specific checkpoint.
    """
    pipe = get_pipeline()
    contents = await file.read()
    nparr = np.frombuffer(contents, np.uint8)
    frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

    if frame is None:
        raise HTTPException(status_code=400, detail="Could not decode image")

    cps = EventService.get_checkpoints()
    cp_meta = next((c for c in cps if c["id"] == checkpoint_id), {"name": "Checkpoint", "lat": 40.75, "lng": -73.98})

    results = pipe.process_frame(frame, checkpoint_id, cp_meta)
    return results


@router.get("/metrics")
def get_system_metrics():
    """
    Returns real-time pipeline performance, LSH hashing, and deduplication metrics.
    """
    pipe = get_pipeline()
    cache_stats = pipe.track_cache.get_metrics()
    return {
        "pipeline": pipe.metrics,
        "deduplication": cache_stats,
        "gallery_size": len(pipe.gallery_manager.persons),
        "hashing": {
            "algorithm": "Random Hyperplane LSH",
            "hash_bits": 128,
            "quantization": "Binary 1-bit / dimension projection",
            "metric": "Hamming Distance & Cosine Angle"
        },
        "ann_search": {
            "engine": "FAISS HNSW Flat",
            "metric": "Inner Product (Cosine Similarity)",
            "dimension": 64
        },
        "thresholds": {
            "confirmed": pipe.search_engine.threshold_confirmed,
            "review": pipe.search_engine.threshold_review
        }
    }


@router.post("/simulation/step")
def trigger_simulation_sighting(req: SimulationTriggerRequest):
    """
    Generates a realistic test sighting event across checkpoints.
    """
    pipe = get_pipeline()
    cps = EventService.get_checkpoints()
    if not cps:
        return {"error": "No checkpoints registered"}

    # Select checkpoint
    cp = next((c for c in cps if c["id"] == req.checkpoint_id), cps[np.random.randint(0, len(cps))])
    
    # Select target person from gallery
    persons = pipe.gallery_manager.get_all_persons()
    if not persons:
        return {"error": "Gallery empty"}

    target = next((p for p in persons if p["person_id"] == req.target_person_id), persons[np.random.randint(0, len(persons))])

    # Check for real LFW test sighting photos
    lfw_sightings_dir = os.path.join(os.path.dirname(__file__), "..", "data", "lfw", "sightings")
    matching_sighting_files = []
    if os.path.exists(lfw_sightings_dir):
        matching_sighting_files = [
            f for f in os.listdir(lfw_sightings_dir)
            if f.startswith(f"sighting_{target['person_id']}_") and f.lower().endswith(('.jpg', '.jpeg', '.png'))
        ]

    crop_filename = f"sim_{target['person_id']}_{int(time.time() * 1000) % 100000}.jpg"
    crop_path = os.path.join(pipe.crops_dir, crop_filename)
    computed_conf = req.confidence

    if matching_sighting_files:
        chosen_file = np.random.choice(matching_sighting_files)
        src_path = os.path.join(lfw_sightings_dir, chosen_file)
        real_img = cv2.imread(src_path)
        if real_img is not None:
            dets = pipe.detector.detect(real_img)
            if dets:
                best_det = max(dets, key=lambda d: d.get("score", 0.0))
                crop_to_save = best_det.get("raw_crop", real_img)
                cv2.imwrite(crop_path, crop_to_save)
                
                emb = pipe.embedder.get_embedding_from_aligned(best_det.get("aligned_crop", real_img))
                search_res = pipe.search_engine.search(emb, top_k=1, threshold=0.50)
                if search_res:
                    computed_conf = search_res[0]["confidence"]
            else:
                cv2.imwrite(crop_path, real_img)
    else:
        crop_img = np.zeros((112, 112, 3), dtype=np.uint8)
        cv2.circle(crop_img, (56, 56), 40, (180, 140, 100), -1)
        cv2.imwrite(crop_path, crop_img)

    if computed_conf is None:
        computed_conf = float(np.random.uniform(0.82, 0.94))

    event = EventService.log_match(
        person_id=target["person_id"],
        name=target["name"],
        checkpoint_id=cp["id"],
        checkpoint_name=cp["name"],
        lat=cp["lat"],
        lng=cp["lng"],
        confidence=round(float(computed_conf), 4),
        face_crop_path=f"/static/crops/{crop_filename}",
        reference_photo_path=target.get("photo_url"),
        status="CONFIRMED" if computed_conf >= 0.75 else "PENDING_REVIEW",
        source_type="CCTV_FOOTAGE",
        camera_id=f"CAM-{cp['id'].upper()} [SURVEILLANCE]",
        video_timestamp_sec=round(float(np.random.uniform(5.0, 45.0)), 1),
        threat_level=target.get("threat_level", "HIGH"),
        offense=target.get("offense", "Active Felony Warrant")
    )

    return {
        "status": "SIMULATED_MATCH_LOGGED",
        "event": event
    }
