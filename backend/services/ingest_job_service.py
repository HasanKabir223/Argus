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

        self.detector = detector or FaceDetector(det_thresh=0.30)
        self.quality_filter = quality_filter or QualityFilter(min_size=16, blur_threshold=15.0, det_threshold=0.30)
        self.embedder = embedder or ArcFaceEmbedder(embedding_dim=64)
        self.search_engine = search_engine or FaissSimilaritySearch(dimension=64)

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

    def start_background_processing(self, job_id: str, video_path: str):
        thread = threading.Thread(
            target=self._process_video_pipeline,
            args=(job_id, video_path),
            daemon=True
        )
        thread.start()

    def _process_video_pipeline(self, job_id: str, video_path: str):
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

            tracker = BYTETracker(track_thresh=0.35, match_thresh=0.30)
            
            # Map track_id -> track state dict
            tracks_info: Dict[int, Dict[str, Any]] = {}
            # Tracks that have had embedding generated once
            embedded_track_ids = set()

            frame_idx = 0
            stride = 1  # Process every frame

            while True:
                ret, frame = cap.read()
                if not ret or frame is None:
                    break

                frame_idx += 1
                progress = min(0.95, round(frame_idx / max(1, total_video_frames), 2))

                # Stage 1: Detecting
                self._update_job_stage(job_id, stage="detecting", progress=progress)
                raw_dets = self.detector.detect(frame)

                # Stage 2: Tracking
                self._update_job_stage(job_id, stage="tracking", progress=progress)
                passed_dets, filtered_reasons = self.quality_filter.filter_detections(frame, raw_dets)
                
                # Update tracker with passed detections or raw detections
                dets_to_track = passed_dets if passed_dets else raw_dets
                active_tracks = tracker.update(dets_to_track)

                # Associate detections to active tracks
                for track in active_tracks:
                    tid = track.track_id
                    formatted_id = f"TRACK-{tid:03d}"
                    bbox = [int(v) for v in track.bbox]
                    
                    # Compute crop
                    h, w = frame.shape[:2]
                    x1 = max(0, min(bbox[0], w - 1))
                    y1 = max(0, min(bbox[1], h - 1))
                    x2 = max(x1 + 1, min(bbox[2], w))
                    y2 = max(y1 + 1, min(bbox[3], h))
                    crop_img = frame[y1:y2, x1:x2]

                    # Assess quality and score
                    score = track.score if hasattr(track, 'score') else 0.8
                    is_pass, reason, aligned_crop, blur_val = self.quality_filter.evaluate_face(frame, bbox, score)

                    if tid not in tracks_info:
                        crop_filename = f"{formatted_id}.jpg"
                        crop_rel_path = f"/crops/{crop_filename}"
                        full_crop_path = os.path.join(self.crops_dir, crop_filename)

                        # Save initial crop
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
                            "best_aligned_crop": aligned_crop if aligned_crop is not None else crop_img,
                            "is_good_quality": is_pass,
                            "embedding_stored": False
                        }
                    else:
                        tdata = tracks_info[tid]
                        tdata["total_frames"] += 1
                        # If current detection has higher score/quality, update best crop
                        if score > tdata["best_score"] and crop_img is not None and crop_img.size > 0:
                            tdata["best_score"] = score
                            tdata["best_crop_img"] = crop_img
                            tdata["best_aligned_crop"] = aligned_crop if aligned_crop is not None else crop_img
                            tdata["is_good_quality"] = is_pass
                            cv2.imwrite(tdata["full_crop_path"], crop_img)

                # Process embeddings and indexing once per unique track
                has_new_embeddings = False
                for tid, tdata in tracks_info.items():
                    if tid not in embedded_track_ids:
                        embedded_track_ids.add(tid)
                        
                        # Stage: Embedding
                        self._update_job_stage(job_id, stage="embedding", progress=progress)
                        
                        if tdata["is_good_quality"] and tdata["best_aligned_crop"] is not None:
                            try:
                                emb = self.embedder.get_embedding_from_aligned(tdata["best_aligned_crop"])
                                
                                # Stage: Indexing to FAISS
                                self._update_job_stage(job_id, stage="indexing", progress=progress)
                                self.search_engine.store_footage_embedding(
                                    embedding=emb,
                                    meta={"track_id": tdata["track_id"]}
                                )
                                tdata["embedding_stored"] = True
                            except Exception as emb_err:
                                print(f"[IngestJob] Embedding generation warning: {emb_err}")
                                tdata["embedding_stored"] = False
                        else:
                            tdata["embedding_stored"] = False
                        
                        has_new_embeddings = True

                # Progressively publish current persons array to job state
                persons_list = [
                    {
                        "track_id": p["track_id"],
                        "best_crop_url": p["best_crop_url"],
                        "first_frame": p["first_frame"],
                        "total_frames": p["total_frames"],
                        "embedding_stored": p["embedding_stored"]
                    }
                    for p in sorted(tracks_info.values(), key=lambda x: x["numeric_id"])
                ]

                with JOBS_LOCK:
                    if job_id in JOBS_STORE:
                        JOBS_STORE[job_id]["persons"] = persons_list
                        JOBS_STORE[job_id]["total_persons"] = len(persons_list)

                # Small yield to allow smooth UI progress observation
                time.sleep(0.005)

            cap.release()

            # Finalize Job
            persons_list = [
                {
                    "track_id": p["track_id"],
                    "best_crop_url": p["best_crop_url"],
                    "first_frame": p["first_frame"],
                    "total_frames": p["total_frames"],
                    "embedding_stored": p["embedding_stored"]
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
        _ingest_service_instance = IngestJobService()
    return _ingest_service_instance
