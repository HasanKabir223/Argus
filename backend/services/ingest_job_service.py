"""
Surveillance CCTV Video Ingestion Job Service
Processes uploaded CCTV clips frame by frame, tracks persons across frames,
extracts best quality face crops, generates ArcFace embeddings once per unique person track,
and stores vectors into FAISS index.
"""

import os
import cv2
import time
import uuid
import threading
import numpy as np
from typing import Dict, List, Any, Optional

from backend.services.face_detector import FaceDetector
from backend.services.quality_filter import QualityFilter
from backend.services.tracker import BYTETracker
from backend.services.face_embedder import ArcFaceEmbedder
from backend.services.faiss_search import FaissSimilaritySearch


# Global in-memory storage for ingestion jobs
JOBS_STORE: Dict[str, Dict[str, Any]] = {}
JOBS_LOCK = threading.Lock()


class IngestJobService:
    def __init__(
        self,
        detector: Optional[FaceDetector] = None,
        quality_filter: Optional[QualityFilter] = None,
        embedder: Optional[ArcFaceEmbedder] = None,
        search_engine: Optional[FaissSimilaritySearch] = None,
        crops_dir: Optional[str] = None
    ):
        base_static = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "static", "crops"))
        self.crops_dir = crops_dir or base_static
        os.makedirs(self.crops_dir, exist_ok=True)

        self.detector = detector or FaceDetector(det_thresh=0.20)
        self.quality_filter = quality_filter or QualityFilter(min_size=10, blur_threshold=4.0, det_threshold=0.20)
        self.embedder = embedder or ArcFaceEmbedder(embedding_dim=512)
        self.search_engine = search_engine or FaissSimilaritySearch(dimension=512, threshold_confirmed=0.48, threshold_review=0.36)

    def create_job(self) -> str:
        job_id = uuid.uuid4().hex[:12]
        with JOBS_LOCK:
            JOBS_STORE[job_id] = {
                "job_id": job_id,
                "status": "processing",
                "progress": 0.0,
                "stage": "detecting",
                "persons": [],
                "total_persons": 0,
                "error_message": None,
                "created_at": time.time()
            }
        return job_id

    def get_job_status(self, job_id: str) -> Optional[Dict[str, Any]]:
        with JOBS_LOCK:
            job = JOBS_STORE.get(job_id)
            if not job:
                return None
            return {
                "job_id": job["job_id"],
                "status": job["status"],
                "progress": round(job["progress"], 2),
                "stage": job["stage"],
                "persons": list(job["persons"]),
                "total_persons": job["total_persons"],
                "error_message": job["error_message"]
            }

    def start_background_processing(self, job_id: str, video_path: str, stride: int = 2):
        thread = threading.Thread(
            target=self._process_video_pipeline,
            args=(job_id, video_path, stride),
            daemon=True
        )
        thread.start()

    def _process_video_pipeline(self, job_id: str, video_path: str, stride: int = 2):
        try:
            if not os.path.exists(video_path):
                self._fail_job(job_id, f"Video file not found: {video_path}")
                return

            cap = cv2.VideoCapture(video_path)
            if not cap.isOpened():
                self._fail_job(job_id, f"Could not decode video file: {video_path}")
                return

            total_video_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) or 100
            fps = cap.get(cv2.CAP_PROP_FPS) or 30.0

            tracker = BYTETracker(track_thresh=0.20, match_thresh=0.30)
            
            # Map track_id -> track state dict
            tracks_info: Dict[int, Dict[str, Any]] = {}

            frame_idx = 0
            processed_count = 0

            # ─────────────────────────────────────────────────────────────────
            # PHASE 1: Real-Time Frame-by-Frame YuNet Face Detection & Tracking
            # Side-by-side: Immediately crops and publishes faces to the preview roster
            # ─────────────────────────────────────────────────────────────────
            self._update_job_stage(job_id, stage="detecting", progress=0.01)

            while True:
                ret, frame = cap.read()
                if not ret or frame is None:
                    break

                frame_idx += 1
                if frame_idx > 1 and (frame_idx % stride != 0):
                    continue

                processed_count += 1
                progress = min(0.88, round(frame_idx / max(1, total_video_frames) * 0.88, 2))
                self._update_job_stage(job_id, stage="detecting", progress=max(0.02, progress))

                # Run YuNet multi-scale face detection
                raw_dets = self.detector.detect(frame)

                # Quality filter
                passed_dets, _ = self.quality_filter.filter_detections(frame, raw_dets)
                dets_to_track = passed_dets if passed_dets else raw_dets

                # Motion tracking
                active_tracks = tracker.update(dets_to_track)

                for track in active_tracks:
                    tid = track.track_id
                    formatted_id = f"TRACK-{tid:03d}"
                    bbox = [int(v) for v in track.bbox]
                    
                    # Compute crop from frame with margin
                    h_f, w_f = frame.shape[:2]
                    x1 = max(0, min(bbox[0], w_f - 1))
                    y1 = max(0, min(bbox[1], h_f - 1))
                    x2 = max(x1 + 1, min(bbox[2], w_f))
                    y2 = max(y1 + 1, min(bbox[3], h_f))
                    crop_img = frame[y1:y2, x1:x2]

                    # Retrieve canonical aligned crop if available
                    det_data = track.detection if hasattr(track, 'detection') and isinstance(track.detection, dict) else {}
                    aligned_crop = det_data.get("aligned_crop")
                    if aligned_crop is None or aligned_crop.size == 0:
                        aligned_crop = cv2.resize(crop_img if crop_img.size > 0 else np.zeros((112, 112, 3), dtype=np.uint8), (112, 112))

                    score = track.score if hasattr(track, 'score') else 0.85
                    is_pass, reason, _, blur_val = self.quality_filter.evaluate_face(frame, bbox, score)

                    crop_filename = f"crop_{job_id}_{formatted_id}.jpg"
                    crop_rel_path = f"/crops/{crop_filename}"
                    full_crop_path = os.path.join(self.crops_dir, crop_filename)

                    if tid not in tracks_info:
                        if crop_img is not None and crop_img.size > 0:
                            cv2.imwrite(full_crop_path, crop_img)

                        tracks_info[tid] = {
                            "track_id": formatted_id,
                            "numeric_id": tid,
                            "best_crop_url": crop_rel_path,
                            "full_crop_path": full_crop_path,
                            "first_frame": frame_idx,
                            "total_frames": 1,
                            "best_score": score,
                            "best_crop_img": crop_img,
                            "best_aligned_crop": aligned_crop,
                            "is_good_quality": is_pass,
                            "embedding_stored": False,
                            "match": None
                        }
                    else:
                        tdata = tracks_info[tid]
                        tdata["total_frames"] += 1
                        # If current detection has higher score/quality, update best crop
                        if score > tdata["best_score"] and crop_img is not None and crop_img.size > 0:
                            tdata["best_score"] = score
                            tdata["best_crop_img"] = crop_img
                            tdata["best_aligned_crop"] = aligned_crop
                            tdata["is_good_quality"] = is_pass
                            cv2.imwrite(tdata["full_crop_path"], crop_img)

                # SIDE BY SIDE: Publish current persons roster to job state immediately
                persons_list = [
                    {
                        "track_id": p["track_id"],
                        "best_crop_url": p["best_crop_url"],
                        "first_frame": p["first_frame"],
                        "total_frames": p["total_frames"],
                        "embedding_stored": p["embedding_stored"],
                        "match": p.get("match")
                    }
                    for p in sorted(tracks_info.values(), key=lambda x: x["numeric_id"])
                ]

                with JOBS_LOCK:
                    if job_id in JOBS_STORE:
                        JOBS_STORE[job_id]["persons"] = persons_list
                        JOBS_STORE[job_id]["total_persons"] = len(persons_list)

                time.sleep(0.001)

            cap.release()

            # ─────────────────────────────────────────────────────────────────
            # PHASE 2: Post-Video ArcFace Deep Embedding Extraction & Watchlist Matching
            # Called after the whole video is finished scanning!
            # ─────────────────────────────────────────────────────────────────
            self._update_job_stage(job_id, stage="embedding", progress=0.90)

            unique_tracks = list(sorted(tracks_info.values(), key=lambda x: x["numeric_id"]))
            total_unique = len(unique_tracks)

            for idx, tdata in enumerate(unique_tracks):
                current_emb_progress = 0.90 + 0.08 * ((idx + 1) / max(1, total_unique))
                self._update_job_stage(job_id, stage="embedding", progress=round(current_emb_progress, 2))

                crop_to_embed = tdata.get("best_aligned_crop")
                if crop_to_embed is None or crop_to_embed.size == 0:
                    crop_to_embed = tdata.get("best_crop_img")
                if crop_to_embed is None or crop_to_embed.size == 0:
                    crop_to_embed = np.zeros((112, 112, 3), dtype=np.uint8)

                try:
                    # 1. ArcFace feature vector extraction (512-D)
                    emb = self.embedder.get_embedding_from_aligned(crop_to_embed)

                    # 2. Store to FAISS index
                    self._update_job_stage(job_id, stage="indexing", progress=round(current_emb_progress, 2))
                    self.search_engine.store_footage_embedding(
                        embedding=emb,
                        meta={"track_id": tdata["track_id"]}
                    )
                    tdata["embedding_stored"] = True

                    # 3. Match against WatchList
                    matches = self.search_engine.search(emb, top_k=3, threshold=0.36)
                    if matches:
                        best = matches[0]
                        tdata["match"] = {
                            "person_id": best["person"]["person_id"],
                            "name": best["person"]["name"],
                            "confidence": best["confidence"],
                            "tier": best.get("tier", "CONFIRMED")
                        }
                        try:
                            from backend.services.event_service import EventService
                            EventService.log_match(
                                person_id=best["person"]["person_id"],
                                name=best["person"].get("name", "Unknown"),
                                checkpoint_id="cp-01",
                                checkpoint_name="CCTV Surveillance Feed",
                                lat=40.6413,
                                lng=-73.7781,
                                confidence=best["confidence"],
                                face_crop_path=tdata["best_crop_url"],
                                reference_photo_path=best["person"].get("photo_url"),
                                status="CONFIRMED" if best["confidence"] >= 0.48 else "PENDING_REVIEW",
                                source_type="CCTV_INGESTION_UPLOAD",
                                camera_id=f"INGEST-{job_id}",
                                threat_level=best["person"].get("threat_level", "HIGH"),
                                offense=best["person"].get("offense", "Wanted Suspect")
                            )
                        except Exception as log_err:
                            print(f"[IngestJob] Note on logging event: {log_err}")

                except Exception as emb_err:
                    print(f"[IngestJob] Embedding generation warning: {emb_err}")
                    tdata["embedding_stored"] = False

                # Progressively publish updated persons with embeddings & matches
                persons_list = [
                    {
                        "track_id": p["track_id"],
                        "best_crop_url": p["best_crop_url"],
                        "first_frame": p["first_frame"],
                        "total_frames": p["total_frames"],
                        "embedding_stored": p["embedding_stored"],
                        "match": p.get("match")
                    }
                    for p in sorted(tracks_info.values(), key=lambda x: x["numeric_id"])
                ]

                with JOBS_LOCK:
                    if job_id in JOBS_STORE:
                        JOBS_STORE[job_id]["persons"] = persons_list
                        JOBS_STORE[job_id]["total_persons"] = len(persons_list)

            # ─────────────────────────────────────────────────────────────────
            # PHASE 3: Ingestion Finished
            # ─────────────────────────────────────────────────────────────────
            persons_list = [
                {
                    "track_id": p["track_id"],
                    "best_crop_url": p["best_crop_url"],
                    "first_frame": p["first_frame"],
                    "total_frames": p["total_frames"],
                    "embedding_stored": p["embedding_stored"],
                    "match": p.get("match")
                }
                for p in sorted(tracks_info.values(), key=lambda x: x["numeric_id"])
            ]

            with JOBS_LOCK:
                if job_id in JOBS_STORE:
                    JOBS_STORE[job_id]["status"] = "done"
                    JOBS_STORE[job_id]["stage"] = "done"
                    JOBS_STORE[job_id]["progress"] = 1.0
                    JOBS_STORE[job_id]["persons"] = persons_list
                    JOBS_STORE[job_id]["total_persons"] = len(persons_list)

        except Exception as e:
            print(f"[IngestJob] Error during job processing: {e}")
            self._fail_job(job_id, str(e))

    def _update_job_stage(self, job_id: str, stage: str, progress: float):
        with JOBS_LOCK:
            if job_id in JOBS_STORE:
                JOBS_STORE[job_id]["stage"] = stage
                JOBS_STORE[job_id]["progress"] = progress

    def _fail_job(self, job_id: str, error_message: str):
        with JOBS_LOCK:
            if job_id in JOBS_STORE:
                JOBS_STORE[job_id]["status"] = "error"
                JOBS_STORE[job_id]["error_message"] = error_message


# Singleton instance
_ingest_service_instance: Optional[IngestJobService] = None


def get_ingest_service() -> IngestJobService:
    global _ingest_service_instance
    if _ingest_service_instance is None:
        try:
            from backend.api.routes import get_pipeline
            pipe = get_pipeline()
            _ingest_service_instance = IngestJobService(
                detector=pipe.detector,
                quality_filter=pipe.quality_filter,
                embedder=pipe.embedder,
                search_engine=pipe.search_engine,
                crops_dir=pipe.crops_dir
            )
        except Exception:
            _ingest_service_instance = IngestJobService(
                detector=FaceDetector(det_thresh=0.20),
                quality_filter=QualityFilter(min_size=10, blur_threshold=4.0, det_threshold=0.20),
                embedder=ArcFaceEmbedder(embedding_dim=512),
                search_engine=FaissSimilaritySearch(dimension=512, threshold_confirmed=0.55, threshold_review=0.40)
            )
    return _ingest_service_instance
