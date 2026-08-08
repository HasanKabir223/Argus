"""
FastAPI Routes for Checkpoint AI Services & Operations Dashboard
"""

import os
import cv2
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


@router.get("/health")
def health_check():
    return {"status": "ACTIVE", "service": "Mini-Gotham AI Checkpoint Services"}


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
    last_seen: str = Form("Grand Central"),
    file: UploadFile = File(...)
):
    """
    Enrolls a new missing person photo into the FAISS vector index.
    """
    pipe = get_pipeline()
    contents = await file.read()
    nparr = np.frombuffer(contents, np.uint8)
    image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

    if image is None:
        raise HTTPException(status_code=400, detail="Invalid image file format")

    meta = pipe.gallery_manager.enroll_person(
        person_id=person_id,
        name=name,
        photo_bgr=image,
        age=age,
        last_seen=last_seen
    )
    return meta


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

    # Fetch checkpoint metadata
    cps = EventService.get_checkpoints()
    cp_meta = next((c for c in cps if c["id"] == checkpoint_id), {"name": "Checkpoint", "lat": 40.75, "lng": -73.98})

    results = pipe.process_frame(frame, checkpoint_id, cp_meta)
    return results


@router.get("/metrics")
def get_system_metrics():
    """
    Returns real-time pipeline performance and deduplication metrics for dashboard HUD.
    """
    pipe = get_pipeline()
    cache_stats = pipe.track_cache.get_metrics()
    return {
        "pipeline": pipe.metrics,
        "deduplication": cache_stats,
        "gallery_size": len(pipe.gallery_manager.persons),
        "thresholds": {
            "confirmed": pipe.search_engine.threshold_confirmed,
            "review": pipe.search_engine.threshold_review
        }
    }


@router.post("/simulation/step")
def trigger_simulation_sighting(req: SimulationTriggerRequest):
    """
    Generates a realistic test sighting event across checkpoints to demonstrate
    the operational dashboard, traveling arcs, and human-in-the-loop review.
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

    target = next((p for p in persons if p["person_id"] == req.target_person_id), persons[0])

    conf = req.confidence if req.confidence is not None else float(np.random.uniform(0.78, 0.96))

    # Generate synthetic live crop image
    crop_img = np.zeros((112, 112, 3), dtype=np.uint8)
    cv2.circle(crop_img, (56, 56), 40, (180, 140, 100), -1)
    cv2.circle(crop_img, (42, 48), 5, (40, 40, 40), -1)
    cv2.circle(crop_img, (70, 48), 5, (40, 40, 40), -1)
    cv2.ellipse(crop_img, (56, 75), (15, 8), 0, 0, 180, (40, 40, 40), 2)
    # Add slight variation
    noise = np.random.randint(-15, 15, crop_img.shape, dtype=np.int16)
    crop_img = np.clip(crop_img.astype(np.int16) + noise, 0, 255).astype(np.uint8)

    crop_filename = f"sim_{target['person_id']}_{int(np.random.randint(1000, 9999))}.jpg"
    crop_path = os.path.join(pipe.crops_dir, crop_filename)
    cv2.imwrite(crop_path, crop_img)

    event = EventService.log_match(
        person_id=target["person_id"],
        name=target["name"],
        checkpoint_id=cp["id"],
        checkpoint_name=cp["name"],
        lat=cp["lat"],
        lng=cp["lng"],
        confidence=conf,
        face_crop_path=f"/static/crops/{crop_filename}",
        reference_photo_path=target.get("photo_url"),
        status="PENDING_REVIEW"
    )

    return {
        "status": "SIMULATED_MATCH_LOGGED",
        "event": event
    }
