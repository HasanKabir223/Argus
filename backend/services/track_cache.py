"""
Track Cache Service - Deduplication Engine
Stores per-track embedding and matching results to eliminate redundant computation.
Guarantees 1 embedding call per person appearance instead of re-embedding every frame.
"""

import time
from typing import Dict, Any, Optional, List
import numpy as np


class TrackCacheManager:
    """
    Session-scoped cache mapping track_id -> cached state.
    """
    def __init__(self, ttl_seconds: float = 300.0):
        self.ttl_seconds = ttl_seconds
        # Structure: track_id -> dict
        self._cache: Dict[int, Dict[str, Any]] = {}
        # Metrics
        self.total_frames_seen = 0
        self.total_embeddings_computed = 0
        self.total_deduplicated_frames = 0

    def is_cached(self, track_id: int) -> bool:
        """
        Checks if this track_id has already been embedded and processed.
        """
        if track_id in self._cache:
            # Update last seen timestamp
            self._cache[track_id]["last_seen"] = time.time()
            self._cache[track_id]["frame_count"] += 1
            self.total_deduplicated_frames += 1
            return True
        return False

    def get_result(self, track_id: int) -> Optional[Dict[str, Any]]:
        return self._cache.get(track_id)

    def store_result(
        self,
        track_id: int,
        embedding: np.ndarray,
        match_results: List[Dict[str, Any]],
        confidence: float = 0.0,
        metadata: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Stores the newly generated embedding and FAISS search results for track_id.
        """
        now = time.time()
        record = {
            "track_id": track_id,
            "embedding": embedding,
            "match_results": match_results,
            "confidence": confidence,
            "first_seen": now,
            "last_seen": now,
            "frame_count": 1,
            "metadata": metadata or {}
        }
        self._cache[track_id] = record
        self.total_embeddings_computed += 1
        return record

    def clear(self):
        """
        Clears the cache when a new checkpoint session begins.
        """
        self._cache.clear()

    def get_metrics(self) -> Dict[str, Any]:
        """
        Returns performance and deduplication metrics for pitch defense & dashboard.
        """
        total_checks = self.total_embeddings_computed + self.total_deduplicated_frames
        savings_ratio = (
            (self.total_deduplicated_frames / total_checks * 100.0)
            if total_checks > 0
            else 0.0
        )
        return {
            "active_tracks_cached": len(self._cache),
            "embeddings_computed": self.total_embeddings_computed,
            "redundant_frames_skipped": self.total_deduplicated_frames,
            "deduplication_savings_percent": round(savings_ratio, 2)
        }
