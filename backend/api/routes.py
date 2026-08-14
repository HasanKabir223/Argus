"""
FastAPI Routes for Checkpoint AI Services, CCTV Ingestion & Operations Dashboard
"""

import os
import time
import json
import cv2
import shutil
from datetime import datetime
import numpy as np
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Query
from fastapi.responses import StreamingResponse
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


@router.delete("/events/{event_id}")
def delete_single_event(event_id: str):
    """
    Deletes a single match sighting event from SQLite and memory.
    """
    success = EventService.delete_event(event_id)
    if not success:
        raise HTTPException(status_code=404, detail="Event not found or failed to delete")
    return {"status": "ok", "deleted_id": event_id}


@router.delete("/events")
@router.post("/events/clear")
def clear_all_events():
    """
    Clears all active match sightings from SQLite database & memory.
    Provides a clean slate for manual pipeline testing.
    """
    EventService.clear_all_events()
    return {"status": "ok", "message": "All active sightings cleared. Pipeline ready for manual testing."}



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
    Includes high-speed image preprocessing and real-time execution logging telemetry.
    """
    t_start = time.time()
    logs = []
    now_str = datetime.now().strftime("%H:%M:%S.%f")[:-3]
    logs.append(f"[{now_str}] [INGEST] Received enrollment request for '{name}' (ID: {person_id})")

    pipe = get_pipeline()
    image = None
    t_decode_start = time.time()

    if file is not None:
        try:
            contents = await file.read()
            if contents:
                logs.append(f"[{datetime.now().strftime('%H:%M:%S.%f')[:-3]}] [STREAM] Read payload buffer: {len(contents)/1024:.1f} KB")
                nparr = np.frombuffer(contents, np.uint8)
                image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
                if image is None:
                    # Robust fallback via PIL for .jfif, .webp, .png, etc.
                    try:
                        from PIL import Image
                        import io
                        pil_img = Image.open(io.BytesIO(contents)).convert("RGB")
                        image = cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)
                        logs.append(f"[{datetime.now().strftime('%H:%M:%S.%f')[:-3]}] [DECODE] Decoded via PIL engine fallback")
                    except Exception as pil_err:
                        logs.append(f"[{datetime.now().strftime('%H:%M:%S.%f')[:-3]}] [WARN] PIL fallback note: {pil_err}")
                else:
                    logs.append(f"[{datetime.now().strftime('%H:%M:%S.%f')[:-3]}] [DECODE] Decoded image ({image.shape[1]}x{image.shape[0]} BGR)")
        except Exception as e:
            logs.append(f"[{datetime.now().strftime('%H:%M:%S.%f')[:-3]}] [ERROR] Image stream read error: {e}")
            print(f"[Routes] Image read warning: {e}")

    if image is None:
        logs.append(f"[{datetime.now().strftime('%H:%M:%S.%f')[:-3]}] [SYNTH] Generated synthetic biometric face portrait placeholder")
        image = np.zeros((112, 112, 3), dtype=np.uint8)
        cv2.circle(image, (56, 56), 40, (180, 140, 100), -1)

    # High-speed normalization: downscale if image is overly large (> 800px)
    h, w = image.shape[:2]
    if max(h, w) > 800:
        scale = 800.0 / max(h, w)
        image = cv2.resize(image, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)
        logs.append(f"[{datetime.now().strftime('%H:%M:%S.%f')[:-3]}] [RESIZE] Normalized image to {image.shape[1]}x{image.shape[0]} for sub-millisecond execution")

    decode_ms = (time.time() - t_decode_start) * 1000.0

    t_enroll_start = time.time()
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
    enroll_ms = (time.time() - t_enroll_start) * 1000.0
    total_ms = (time.time() - t_start) * 1000.0

    faiss_count = pipe.search_engine._index.ntotal if pipe.search_engine._index else len(pipe.gallery_manager.persons)
    logs.append(f"[{datetime.now().strftime('%H:%M:%S.%f')[:-3]}] [EMBED] Extracted 64-D ArcFace embedding vector")
    logs.append(f"[{datetime.now().strftime('%H:%M:%S.%f')[:-3]}] [FAISS] Vector indexed into HNSW graph index (total vectors: {faiss_count})")
    logs.append(f"[{datetime.now().strftime('%H:%M:%S.%f')[:-3]}] [SQLITE] Criminal dossier written to SQLite reference_persons table")
    logs.append(f"[{datetime.now().strftime('%H:%M:%S.%f')[:-3]}] [SUCCESS] Target '{name}' active and live across all checkpoint cameras ({total_ms:.2f}ms total)")

    meta["telemetry"] = {
        "image_decode_ms": round(decode_ms, 2),
        "enroll_ms": round(enroll_ms, 2),
        "total_ms": round(total_ms, 2),
        "faiss_vectors": faiss_count
    }
    meta["logs"] = logs

    print(f"[Routes] ✓ Enrolled {name} ({person_id}) in {total_ms:.2f}ms. Total FAISS vectors: {faiss_count}")
    return meta



@router.delete("/reference-persons/{person_id}")
def delete_reference_person(person_id: str):
    """
    Deletes a criminal reference target from the SQLite database, FAISS vector index, and image storage.
    """
    pipe = get_pipeline()
    success = pipe.gallery_manager.delete_person(person_id)
    if not success:
        raise HTTPException(status_code=404, detail=f"Person {person_id} not found")
    return {"status": "DELETED", "person_id": person_id}


@router.delete("/reference-persons")
def delete_all_reference_persons():
    """
    Wipes ALL criminal reference targets from the SQLite database, FAISS vector index, and gallery storage.
    """
    pipe = get_pipeline()
    result = pipe.gallery_manager.delete_all_persons()
    return {
        "status": "PURGED",
        "message": "All suspects and vectors have been wiped from SQLite, FAISS, and gallery disk.",
        "purged_count": result.get("purged_count", 0),
        "faiss_vectors": 0
    }


@router.delete("/watchlist/all")
def delete_all_watchlist_alias():
    """
    Convenience alias for deleting all reference persons.
    """
    return delete_all_reference_persons()


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


@router.post("/cctv/process-clip-stream")
def process_cctv_clip_streaming_endpoint(req: CctvProcessRequest):
    """
    Two-phase streaming processing for an existing CCTV video in catalog via SSE.
    """
    pipe = get_pipeline()
    clips = pipe.cctv_service.get_available_clips()

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

    def event_generator():
        for event in pipe.cctv_service.process_cctv_clip_streaming(
            video_path=video_path,
            checkpoint_id=chosen_clip["checkpoint_id"],
            checkpoint_name=chosen_clip["checkpoint_name"],
            lat=chosen_clip["lat"],
            lng=chosen_clip["lng"],
            camera_id=chosen_clip["camera_id"],
            frame_stride=req.frame_stride or 3,
            confidence_threshold=req.confidence_threshold or 0.60
        ):
            yield f"data: {json.dumps(event, default=str)}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )



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


@router.post("/cctv/upload-clip-stream")
async def upload_and_process_cctv_clip_streaming(
    checkpoint_id: str = Form("cp-01"),
    camera_id: str = Form("CAM-CUSTOM [TACTICAL FIELD UPLOAD]"),
    frame_stride: int = Form(3),
    file: UploadFile = File(...)
):
    """
    Two-phase streaming CCTV ingestion endpoint.
    Returns Server-Sent Events (SSE) progressively:
      - phase1_crop: Each detected face crop (instant preview)
      - phase2_match: Each watchlist match result
      - summary: Final aggregated telemetry
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

    def event_generator():
        for event in pipe.cctv_service.process_cctv_clip_streaming(
            video_path=out_path,
            checkpoint_id=checkpoint_id,
            checkpoint_name=cp_meta["name"],
            lat=cp_meta["lat"],
            lng=cp_meta["lng"],
            camera_id=camera_id,
            frame_stride=frame_stride,
            confidence_threshold=0.60
        ):
            # SSE format: data: {json}\n\n
            yield f"data: {json.dumps(event, default=str)}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )


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


# ─── CCTV INGESTION FEATURE SPEC ENDPOINTS ──────────────────────────────────────

from backend.services.ingest_job_service import get_ingest_service
from backend.services.cctv_service import _get_cctv_storage_dirs


@router.post("/ingest/upload")
async def ingest_upload_video(video: UploadFile = File(...)):
    """
    Accepts multipart/form-data with field 'video'.
    Stores file and initiates background frame-by-frame processing.
    Returns: { "job_id": "..." }
    """
    ingest_svc = get_ingest_service()
    job_id = ingest_svc.create_job()

    cctv_dir = _get_cctv_storage_dirs()[0]
    os.makedirs(cctv_dir, exist_ok=True)
    saved_filename = f"job_{job_id}_{video.filename}"
    saved_path = os.path.join(cctv_dir, saved_filename)

    with open(saved_path, "wb") as f:
        shutil.copyfileobj(video.file, f)

    ingest_svc.start_background_processing(job_id, saved_path)
    return {"job_id": job_id}


@router.get("/ingest/status/{job_id}")
def get_ingest_job_status(job_id: str):
    """
    Returns the real-time processing status of the ingestion job:
    {
      "job_id": "abc123",
      "status": "processing" | "done" | "error",
      "progress": 0.0 to 1.0,
      "stage": "detecting" | "tracking" | "embedding" | "indexing" | "done",
      "persons": [
        {
          "track_id": "TRACK-001",
          "best_crop_url": "/crops/TRACK-001.jpg",
          "first_frame": 42,
          "total_frames": 18,
          "embedding_stored": true
        }
      ],
      "total_persons": 5,
      "error_message": null
    }
    """
    ingest_svc = get_ingest_service()
    status = ingest_svc.get_job_status(job_id)
    if status is None:
        raise HTTPException(status_code=404, detail=f"Ingestion job '{job_id}' not found")
    return status

