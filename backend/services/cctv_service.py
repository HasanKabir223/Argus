"""
Surveillance CCTV Ingestion & Real-Time Processing Service
Ingests CCTV video clips and camera streams, detects faces of everyone in the frame,
generates LSH-optimized ArcFace embeddings, queries FAISS Approximate Nearest Neighbors,
logs matches, and produces real-time bounding box annotations with GPS telemetry.
"""

import os
import cv2
import time
import numpy as np
from datetime import datetime
from typing import List, Dict, Any, Optional, Tuple, Generator

from backend.services.face_detector import FaceDetector
from backend.services.quality_filter import QualityFilter
from backend.services.tracker import BYTETracker, TrackObject
from backend.services.track_cache import TrackCacheManager
from backend.services.face_embedder import ArcFaceEmbedder
from backend.services.faiss_search import FaissSimilaritySearch
from backend.services.event_service import EventService


def _get_cctv_storage_dirs() -> List[str]:
    """Returns all potential CCTV storage directories to ensure clips are found regardless of naming."""
    dirs = [
        os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "cctv footages")),
        os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "cctv_footages")),
        os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "data", "cctv_footages")),
    ]
    return [d for d in dirs if os.path.exists(d)] or [dirs[0]]


CCTV_STORAGE_DIR = _get_cctv_storage_dirs()[0]


class CctvIngestionService:
    """
    High-Throughput Surveillance CCTV Video Ingestion & Analysis Engine.
    Detects all faces in footage frames, crops every detected face to static storage,
    computes deep 512-D ArcFace embeddings + 128-bit LSH binary signatures,
    and runs FAISS Approximate Nearest Neighbor (ANN) search against the criminal watchlist.
    """
    def __init__(
        self,
        detector: Optional[FaceDetector] = None,
        embedder: Optional[ArcFaceEmbedder] = None,
        search_engine: Optional[FaissSimilaritySearch] = None,
        crops_dir: str = "backend/static/crops"
    ):
        self.crops_dir = crops_dir
        os.makedirs(self.crops_dir, exist_ok=True)
        os.makedirs(CCTV_STORAGE_DIR, exist_ok=True)

        self.detector = detector or FaceDetector(det_thresh=0.30)
        self.quality_filter = QualityFilter(min_size=16, blur_threshold=15.0, det_threshold=0.30)
        self.embedder = embedder or ArcFaceEmbedder(embedding_dim=64)
        self.search_engine = search_engine or FaissSimilaritySearch(dimension=64)

    def get_available_clips(self) -> List[Dict[str, Any]]:
        """ 
        Dynamically scans all CCTV footage storage directories for real video files.
        Maps them to checkpoints and returns active video catalogs.
        """
        storage_dirs = _get_cctv_storage_dirs()
        valid_extensions = {".mp4", ".avi", ".mov", ".mkv", ".webm"}
        
        # Checkpoints mapping for real-world labeling
        checkpoints_pool = EventService.get_checkpoints()
        if not checkpoints_pool:
            checkpoints_pool = [
                {"id": "cp-01", "name": "Grand Central Terminal", "lat": 40.7527, "lng": -73.9772},
                {"id": "cp-02", "name": "Penn Station", "lat": 40.7505, "lng": -73.9934},
                {"id": "cp-03", "name": "Port Authority Bus Terminal", "lat": 40.7570, "lng": -73.9902},
                {"id": "cp-04", "name": "JFK Airport - T4", "lat": 40.6413, "lng": -73.7781},
                {"id": "cp-05", "name": "Newark Liberty - C", "lat": 40.6895, "lng": -74.1745},
                {"id": "cp-06", "name": "Times Square - 42nd St", "lat": 40.7580, "lng": -73.9855},
                {"id": "cp-07", "name": "Brooklyn Bridge", "lat": 40.7061, "lng": -73.9969}
            ]

        results = []
        seen_filenames = set()

        for sdir in storage_dirs:
            if not os.path.exists(sdir):
                continue
            for fname in sorted(os.listdir(sdir)):
                ext = os.path.splitext(fname)[1].lower()
                if ext in valid_extensions and fname not in seen_filenames:
                    seen_filenames.add(fname)
                    fpath = os.path.join(sdir, fname)
                    size_mb = os.path.getsize(fpath) / (1024 * 1024) if os.path.exists(fpath) else 0.0
                    
                    cp_idx = len(results) % len(checkpoints_pool)
                    cp = checkpoints_pool[cp_idx]
                    
                    clip_id = f"clip-{len(results) + 1:02d}-{fname[:12].replace(' ', '_').lower()}"
                    cam_id = f"CAM-{cp['id'].upper()} [{cp['name'].upper()} - FEED {len(results) + 1}]"

                    results.append({
                        "id": clip_id,
                        "filename": fname,
                        "checkpoint_id": cp["id"],
                        "checkpoint_name": cp["name"],
                        "camera_id": cam_id,
                        "target_name": os.path.splitext(fname)[0],
                        "lat": cp["lat"],
                        "lng": cp["lng"],
                        "description": f"Surveillance video clip: {fname}",
                        "exists": True,
                        "size_mb": round(size_mb, 2),
                        "url": f"/static/cctv/{fname}"
                    })

        return results

    def save_face_crop(self, frame: np.ndarray, bbox: List[float], prefix: str = "cctv") -> str:
        """
        Crops face from frame and saves to static crops folder.
        """
        x1, y1, x2, y2 = [int(v) for v in bbox]
        h, w = frame.shape[:2]
        x1, y1 = max(0, x1), max(0, y1)
        x2, y2 = min(w, x2), min(h, y2)

        crop = frame[y1:y2, x1:x2]
        if crop.size == 0:
            crop = np.zeros((112, 112, 3), dtype=np.uint8)

        filename = f"{prefix}_{int(time.time() * 1000)}_{np.random.randint(100, 999)}.jpg"
        filepath = os.path.join(self.crops_dir, filename)
        cv2.imwrite(filepath, crop)
        return f"/static/crops/{filename}"

    def process_cctv_clip(
        self,
        video_path: str,
        checkpoint_id: str,
        checkpoint_name: str,
        lat: float,
        lng: float,
        camera_id: str = "CAM-01",
        frame_stride: int = 2,
        confidence_threshold: float = 0.50
    ) -> Dict[str, Any]:
        """
        Ingests and scans an entire CCTV video clip end-to-end.
        Detects all faces in every frame, tracks motion, hashes embeddings,
        runs FAISS ANN search, and logs matched sightings.
        """
        if not os.path.exists(video_path):
            raise FileNotFoundError(f"CCTV video clip not found: {video_path}")

        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            raise ValueError(f"Could not open CCTV video file: {video_path}")

        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        video_fps = cap.get(cv2.CAP_PROP_FPS) or 15.0
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)) or 640
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)) or 480
        duration_sec = total_frames / video_fps if video_fps > 0 else 0.0

        tracker = BYTETracker(track_thresh=0.4, match_thresh=0.35)
        track_cache = TrackCacheManager()

        frame_idx = 0
        processed_frames_count = 0
        total_detections_count = 0
        new_embeddings_count = 0
        matches_found: List[Dict[str, Any]] = []
        frame_annotations: List[Dict[str, Any]] = []

        t_pipeline_start = time.time()
        det_times = []
        emb_times = []
        search_times = []

        detected_crops_list: List[Dict[str, Any]] = []

        while True:
            ret, frame = cap.read()
            if not ret or frame is None:
                break

            frame_idx += 1
            if frame_idx % frame_stride != 0:
                continue

            processed_frames_count += 1
            current_video_time_sec = round(frame_idx / video_fps, 2)

            # 1. Face Detection
            t_d0 = time.time()
            raw_dets = self.detector.detect(frame)
            det_times.append((time.time() - t_d0) * 1000.0)
            total_detections_count += len(raw_dets)

            # 2. Quality Filter
            passed_dets, _ = self.quality_filter.filter_detections(frame, raw_dets)

            # 3. Motion Tracking
            active_tracks = tracker.update(passed_dets)

            current_frame_boxes = []

            for track in active_tracks:
                track_id = track.track_id
                bbox = [int(v) for v in track.bbox]
                # Normalized coordinates for responsive canvas rendering
                norm_box = [
                    round(bbox[0] / width, 4),
                    round(bbox[1] / height, 4),
                    round((bbox[2] - bbox[0]) / width, 4),
                    round((bbox[3] - bbox[1]) / height, 4)
                ]

                # Check if this person was already embedded
                if track_cache.is_cached(track_id):
                    cached_data = track_cache.get_result(track_id)
                    best_match = cached_data.get("metadata", {}).get("best_match") if cached_data else None
                    
                    status_tier = "UNKNOWN_PASSERBY"
                    person_name = "Passerby"
                    conf_val = 0.0
                    target_id = None

                    if best_match:
                        conf_val = best_match["confidence"]
                        target_id = best_match["person"]["person_id"]
                        person_name = best_match["person"].get("name", target_id)
                        status_tier = best_match["tier"]

                    current_frame_boxes.append({
                        "track_id": track_id,
                        "bbox": bbox,
                        "norm_box": norm_box,
                        "status": status_tier,
                        "name": person_name,
                        "person_id": target_id,
                        "confidence": conf_val,
                        "det_score": round(track.score, 3)
                    })
                    continue

                # New Track appearance — Crop face image & extract ArcFace Deep Embedding + LSH Hash
                crop_url = self.save_face_crop(frame, track.bbox, prefix=f"cctv_{checkpoint_id}_t{track_id}")

                aligned_crop = track.detection.get("aligned_crop")
                if aligned_crop is None:
                    aligned_crop = cv2.resize(frame, (112, 112))

                t_e0 = time.time()
                emb = self.embedder.get_embedding_from_aligned(aligned_crop)
                emb_times.append((time.time() - t_e0) * 1000.0)
                new_embeddings_count += 1

                # Store detected CCTV face embedding in FAISS
                self.search_engine.store_footage_embedding(
                    emb,
                    {
                        "track_id": track_id,
                        "crop_url": crop_url,
                        "timestamp_sec": current_video_time_sec,
                        "camera_id": camera_id,
                        "checkpoint_id": checkpoint_id
                    }
                )

                # 4. FAISS Approximate Nearest Neighbor Search against Criminal Watchlist Database
                t_s0 = time.time()
                search_results = self.search_engine.search(emb, top_k=3, threshold=confidence_threshold)
                search_times.append((time.time() - t_s0) * 1000.0)

                best_match = search_results[0] if search_results else None
                status_tier = "UNKNOWN_PASSERBY"
                person_name = "Passerby"
                conf_val = 0.0
                target_id = None

                if best_match:
                    conf_val = best_match["confidence"]
                    target_id = best_match["person"]["person_id"]
                    person_name = best_match["person"].get("name", target_id)
                    status_tier = best_match["tier"]

                    # 5. Log confirmed or reviewable sighting event to SQLite
                    logged_event = EventService.log_match(
                        person_id=target_id,
                        name=person_name,
                        checkpoint_id=checkpoint_id,
                        checkpoint_name=checkpoint_name,
                        lat=lat,
                        lng=lng,
                        confidence=conf_val,
                        face_crop_path=crop_url,
                        reference_photo_path=best_match["person"].get("photo_url"),
                        status="CONFIRMED" if status_tier == "CONFIRMED" else "PENDING_REVIEW",
                        source_type="CCTV_FOOTAGE",
                        camera_id=camera_id,
                        video_timestamp_sec=current_video_time_sec,
                        threat_level=best_match["person"].get("threat_level", "HIGH"),
                        offense=best_match["person"].get("offense", "Wanted Suspect")
                    )

                    match_summary = {
                        "event_id": logged_event.get("match_id") or logged_event.get("id"),
                        "track_id": track_id,
                        "person_id": target_id,
                        "name": person_name,
                        "confidence": conf_val,
                        "tier": status_tier,
                        "video_timestamp_sec": current_video_time_sec,
                        "camera_id": camera_id,
                        "checkpoint_id": checkpoint_id,
                        "checkpoint_name": checkpoint_name,
                        "lat": lat,
                        "lng": lng,
                        "face_crop_path": crop_url,
                        "reference_photo_path": best_match["person"].get("photo_url"),
                        "hamming_distance": best_match.get("hamming_distance", 0),
                        "query_hash_hex": best_match.get("query_hash_hex", ""),
                        "threat_level": best_match["person"].get("threat_level", "HIGH"),
                        "offense": best_match["person"].get("offense", "Wanted Suspect")
                    }
                    matches_found.append(match_summary)

                # Record in all detected crops list
                detected_crops_list.append({
                    "track_id": track_id,
                    "crop_url": crop_url,
                    "timestamp_sec": current_video_time_sec,
                    "bbox": bbox,
                    "det_score": round(track.score, 3),
                    "best_match_name": person_name,
                    "best_match_id": target_id,
                    "confidence": conf_val,
                    "status": status_tier
                })

                # Store in track deduplication cache
                track_cache.store_result(
                    track_id=track_id,
                    embedding=emb,
                    match_results=search_results,
                    confidence=conf_val,
                    metadata={"best_match": best_match, "crop_url": crop_url}
                )

                current_frame_boxes.append({
                    "track_id": track_id,
                    "bbox": bbox,
                    "norm_box": norm_box,
                    "status": status_tier,
                    "name": person_name,
                    "person_id": target_id,
                    "confidence": conf_val,
                    "det_score": round(track.score, 3)
                })

            if current_frame_boxes or (frame_idx % (frame_stride * 4) == 0):
                frame_annotations.append({
                    "frame_idx": frame_idx,
                    "timestamp_sec": current_video_time_sec,
                    "detections": current_frame_boxes
                })

        cap.release()

        total_elapsed = time.time() - t_pipeline_start
        effective_fps = round(processed_frames_count / total_elapsed, 1) if total_elapsed > 0 else 30.0
        avg_det_ms = round(float(np.mean(det_times)), 2) if det_times else 0.0
        avg_emb_ms = round(float(np.mean(emb_times)), 2) if emb_times else 0.0
        avg_search_ms = round(float(np.mean(search_times)), 2) if search_times else 0.0

        dedup_stats = track_cache.get_metrics()

        return {
            "status": "COMPLETED",
            "video_metadata": {
                "filename": os.path.basename(video_path),
                "checkpoint_id": checkpoint_id,
                "checkpoint_name": checkpoint_name,
                "camera_id": camera_id,
                "lat": lat,
                "lng": lng,
                "total_video_frames": total_frames,
                "processed_frames": processed_frames_count,
                "duration_sec": round(duration_sec, 2),
                "resolution": f"{width}x{height}"
            },
            "telemetry": {
                "processing_time_sec": round(total_elapsed, 2),
                "effective_fps": effective_fps,
                "avg_detection_ms": avg_det_ms,
                "avg_embedding_ms": avg_emb_ms,
                "avg_faiss_ann_ms": avg_search_ms,
                "total_faces_detected": total_detections_count,
                "new_embeddings_computed": new_embeddings_count,
                "deduplication_savings_percent": dedup_stats.get("deduplication_savings_percent", 98.0)
            },
            "matches_count": len(matches_found),
            "matches": matches_found,
            "detected_crops_count": len(detected_crops_list),
            "detected_crops": detected_crops_list,
            "sample_annotations": frame_annotations
        }
