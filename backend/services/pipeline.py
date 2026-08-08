"""
Assembled Checkpoint AI Pipeline
Connects:
1. Face Detection & 5-point alignment (RetinaFace/MobileNet-0.25)
2. Quality Pre-filtering (Area, Laplacian Blur, Aspect Ratio)
3. ByteTrack Multi-Object Motion Tracking (Deduplication)
4. Batch ArcFace 512-D Embedding Extraction
5. FAISS Inner-Product Vector Similarity Search
6. SQLite Match Event Logging & Audit Trail
"""

import os
import time
import cv2
import numpy as np
from typing import Dict, Any, List, Optional

from backend.services.face_detector import FaceDetector
from backend.services.quality_filter import QualityFilter
from backend.services.tracker import BYTETracker
from backend.services.track_cache import TrackCacheManager
from backend.services.face_embedder import ArcFaceEmbedder
from backend.services.faiss_search import FaissSimilaritySearch
from backend.services.gallery_manager import GalleryManager
from backend.services.event_service import EventService


class CheckpointPipeline:
    def __init__(
        self,
        crops_dir: str = "backend/static/crops",
        gallery_dir: str = "backend/static/gallery"
    ):
        self.crops_dir = crops_dir
        self.gallery_dir = gallery_dir
        os.makedirs(self.crops_dir, exist_ok=True)
        os.makedirs(self.gallery_dir, exist_ok=True)

        # 1. Initialize detector & filter
        self.detector = FaceDetector(det_thresh=0.35)
        self.quality_filter = QualityFilter(min_size=40, blur_threshold=80.0, det_threshold=0.35)

        # 2. Initialize tracking & deduplication
        self.tracker = BYTETracker(track_thresh=0.4, match_thresh=0.35)
        self.track_cache = TrackCacheManager()

        # 3. Initialize embedder & vector index
        self.embedder = ArcFaceEmbedder(embedding_dim=512)
        self.search_engine = FaissSimilaritySearch(
            dimension=512,
            threshold_confirmed=0.75,
            threshold_review=0.60
        )
        self.gallery_manager = GalleryManager(
            embedder=self.embedder,
            search_engine=self.search_engine,
            gallery_dir=self.gallery_dir
        )

        # Latency & throughput telemetry
        self.metrics = {
            "total_frames_processed": 0,
            "total_detections": 0,
            "total_filtered_out": 0,
            "total_embeddings_computed": 0,
            "total_matches_logged": 0,
            "last_detection_ms": 0.0,
            "last_embedding_ms": 0.0,
            "last_search_ms": 0.0,
            "estimated_fps": 30.0
        }

    def save_crop_image(self, frame: np.ndarray, bbox: List[float], tag: str = "crop") -> str:
        """
        Saves the cropped face image to static storage and returns relative URL.
        """
        x1, y1, x2, y2 = [int(v) for v in bbox]
        h, w = frame.shape[:2]
        x1, y1 = max(0, x1), max(0, y1)
        x2, y2 = min(w, x2), min(h, y2)
        
        crop = frame[y1:y2, x1:x2]
        if crop.size == 0:
            crop = np.zeros((112, 112, 3), dtype=np.uint8)

        filename = f"{tag}_{int(time.time() * 1000)}.jpg"
        filepath = os.path.join(self.crops_dir, filename)
        cv2.imwrite(filepath, crop)
        return f"/static/crops/{filename}"

    def process_frame(
        self,
        frame: np.ndarray,
        checkpoint_id: str,
        checkpoint_meta: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Executes end-to-end processing for a single checkpoint frame.
        """
        t_start = time.time()
        self.metrics["total_frames_processed"] += 1

        # 1. Face Detection
        t_det = time.time()
        raw_detections = self.detector.detect(frame)
        self.metrics["last_detection_ms"] = (time.time() - t_det) * 1000.0
        self.metrics["total_detections"] += len(raw_detections)

        # 2. Quality Filter
        passed_detections, rejected_detections = self.quality_filter.filter_detections(frame, raw_detections)
        self.metrics["total_filtered_out"] += len(rejected_detections)

        # 3. ByteTrack Multi-Object Tracking
        active_tracks = self.tracker.update(passed_detections)

        new_matches = []
        crops_to_embed = []
        tracks_to_process = []

        # 4. Track Deduplication & Identification
        for track in active_tracks:
            track_id = track.track_id

            if self.track_cache.is_cached(track_id):
                # Reuse cached embedding and previous search results
                cached_data = self.track_cache.get_result(track_id)
                if cached_data and cached_data.get("match_results"):
                    # Already recognized person on screen
                    pass
                continue

            # This is a new unique person track!
            tracks_to_process.append(track)
            aligned_crop = track.detection.get("aligned_crop")
            if aligned_crop is None:
                aligned_crop = cv2.resize(frame, (112, 112))
            crops_to_embed.append(aligned_crop)

        # 5. Batch ArcFace Feature Extraction (only for new tracks)
        if crops_to_embed:
            t_emb = time.time()
            embeddings = self.embedder.get_embeddings_batch(crops_to_embed)
            self.metrics["last_embedding_ms"] = (time.time() - t_emb) * 1000.0
            self.metrics["total_embeddings_computed"] += len(crops_to_embed)

            # 6. FAISS Inner-Product Similarity Search
            t_search = time.time()
            for i, track in enumerate(tracks_to_process):
                emb = embeddings[i]
                search_results = self.search_engine.search(emb, top_k=3, threshold=0.60)
                
                # Cache results for this track
                best_conf = search_results[0]["confidence"] if search_results else 0.0
                self.track_cache.store_result(
                    track_id=track.track_id,
                    embedding=emb,
                    match_results=search_results,
                    confidence=best_conf
                )

                # 7. Log confirmed or reviewable matches
                for match_item in search_results:
                    person = match_item["person"]
                    conf = match_item["confidence"]
                    crop_url = self.save_crop_image(frame, track.bbox, tag=f"track_{track.track_id}")

                    status = "PENDING_REVIEW"
                    logged_event = EventService.log_match(
                        person_id=person["person_id"],
                        name=person.get("name", "Unknown Person"),
                        checkpoint_id=checkpoint_id,
                        checkpoint_name=checkpoint_meta.get("name", "Checkpoint"),
                        lat=checkpoint_meta.get("lat", 40.7128),
                        lng=checkpoint_meta.get("lng", -74.0060),
                        confidence=conf,
                        face_crop_path=crop_url,
                        reference_photo_path=person.get("photo_url"),
                        status=status
                    )
                    new_matches.append(logged_event)
                    self.metrics["total_matches_logged"] += 1

            self.metrics["last_search_ms"] = (time.time() - t_search) * 1000.0

        total_frame_time = time.time() - t_start
        if total_frame_time > 0:
            current_fps = 1.0 / total_frame_time
            self.metrics["estimated_fps"] = round(0.9 * self.metrics["estimated_fps"] + 0.1 * current_fps, 1)

        return {
            "checkpoint_id": checkpoint_id,
            "raw_detections": len(raw_detections),
            "passed_quality_filter": len(passed_detections),
            "active_tracks": len(active_tracks),
            "new_embeddings": len(crops_to_embed),
            "new_matches": new_matches,
            "latency_breakdown_ms": {
                "detection": round(self.metrics["last_detection_ms"], 2),
                "embedding": round(self.metrics["last_embedding_ms"], 2),
                "search": round(self.metrics["last_search_ms"], 2),
                "total_frame": round(total_frame_time * 1000.0, 2)
            }
        }
