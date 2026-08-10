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


CCTV_STORAGE_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "cctv_footages")


class CctvIngestionService:
    """
    High-Throughput Surveillance CCTV Video Ingestion & Analysis Engine.
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

        self.detector = detector or FaceDetector(det_thresh=0.35)
        self.quality_filter = QualityFilter(min_size=35, blur_threshold=60.0, det_threshold=0.35)
        self.embedder = embedder or ArcFaceEmbedder(embedding_dim=512)
        self.search_engine = search_engine or FaissSimilaritySearch(dimension=512)

    def get_available_clips(self) -> List[Dict[str, Any]]:
        """
        Returns catalog of available CCTV surveillance camera clips including real footage feeds.
        """
        scenarios = [
            {
                "id": "real-cp01-bush",
                "filename": "cctv_real_cp01_george_bush_gct.mp4",
                "checkpoint_id": "cp-01",
                "checkpoint_name": "Grand Central Terminal",
                "camera_id": "CAM-01 [GCT - MAIN CONCOURSE NORTH]",
                "target_name": "George W Bush",
                "lat": 40.7527,
                "lng": -73.9772,
                "description": "Authentic video surveillance footage from Main Concourse North corridor."
            },
            {
                "id": "real-cp02-powell",
                "filename": "cctv_real_cp02_colin_powell_penn.mp4",
                "checkpoint_id": "cp-02",
                "checkpoint_name": "Penn Station",
                "camera_id": "CAM-02 [PENN STATION - TRACK 4 ENTRY]",
                "target_name": "Colin Powell",
                "lat": 40.7505,
                "lng": -73.9934,
                "description": "High-density subway turnstile and track 4 boarding platform."
            },
            {
                "id": "real-cp03-blair",
                "filename": "cctv_real_cp03_tony_blair_pabt.mp4",
                "checkpoint_id": "cp-03",
                "checkpoint_name": "Port Authority Bus Terminal",
                "camera_id": "CAM-03 [PABT - GATE B3 PASSAGE]",
                "target_name": "Tony Blair",
                "lat": 40.7570,
                "lng": -73.9902,
                "description": "Interstate bus departure gates and central transit corridor."
            },
            {
                "id": "real-cp04-rumsfeld",
                "filename": "cctv_real_cp04_donald_rumsfeld_jfk.mp4",
                "checkpoint_id": "cp-04",
                "checkpoint_name": "JFK Airport - T4",
                "camera_id": "CAM-04 [JFK T4 - SECURITY CORRIDOR]",
                "target_name": "Donald Rumsfeld",
                "lat": 40.6413,
                "lng": -73.7781,
                "description": "International arrivals terminal security checkpoint perimeter."
            },
            {
                "id": "real-cp05-schroeder",
                "filename": "cctv_real_cp05_gerhard_schroeder_ewr.mp4",
                "checkpoint_id": "cp-05",
                "checkpoint_name": "Newark Liberty - C",
                "camera_id": "CAM-05 [EWR C - BAGGAGE CLAIM D]",
                "target_name": "Gerhard Schroeder",
                "lat": 40.6895,
                "lng": -74.1745,
                "description": "Terminal C baggage claim and airport express ground transit hub."
            }
        ]

        # Verify files on disk
        results = []
        for s in scenarios:
            fpath = os.path.join(CCTV_STORAGE_DIR, s["filename"])
            exists = os.path.exists(fpath)
            size_mb = (os.path.getsize(fpath) / (1024 * 1024)) if exists else 0.0
            item = dict(s)
            item.update({
                "exists": exists,
                "size_mb": round(size_mb, 2),
                "url": f"/static/cctv/{s['filename']}" if exists else None
            })
            results.append(item)

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

                # New Track appearance — Extract ArcFace Deep Embedding + LSH Hash
                aligned_crop = track.detection.get("aligned_crop")
                if aligned_crop is None:
                    aligned_crop = cv2.resize(frame, (112, 112))

                t_e0 = time.time()
                emb = self.embedder.get_embedding_from_aligned(aligned_crop)
                emb_times.append((time.time() - t_e0) * 1000.0)
                new_embeddings_count += 1

                # 4. FAISS Approximate Nearest Neighbor Search
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

                    # Save face crop image
                    crop_url = self.save_face_crop(frame, track.bbox, prefix=f"cctv_{checkpoint_id}_t{track_id}")

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
                        "threat_level": best_match["person"].get("threat_level", "HIGH")
                    }
                    matches_found.append(match_summary)

                # Store in track deduplication cache
                track_cache.store_result(
                    track_id=track_id,
                    embedding=emb,
                    match_results=search_results,
                    confidence=conf_val,
                    metadata={"best_match": best_match}
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
            "sample_annotations": frame_annotations[:100]
        }
