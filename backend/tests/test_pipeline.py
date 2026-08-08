"""
Unit and Integration Tests for Checkpoint AI Pipeline Services
"""

import unittest
import numpy as np
import cv2

from backend.services.quality_filter import QualityFilter, is_too_blurry
from backend.services.face_detector import FaceDetector, align_face_5point
from backend.services.tracker import BYTETracker
from backend.services.track_cache import TrackCacheManager
from backend.services.face_embedder import ArcFaceEmbedder
from backend.services.faiss_search import FaissSimilaritySearch
from backend.db.database import init_db
from backend.services.event_service import EventService


class TestQualityFilter(unittest.TestCase):
    def setUp(self):
        self.filter = QualityFilter(min_size=40, blur_threshold=80.0, det_threshold=0.35)

    def test_small_bbox_rejected(self):
        frame = np.zeros((200, 200, 3), dtype=np.uint8)
        bbox = [10, 10, 30, 30]  # 20x20 area < 40x40
        passed, reason, _, _ = self.filter.evaluate_face(frame, bbox, score=0.9)
        self.assertFalse(passed)
        self.assertIn("Size too small", reason)

    def test_blurry_face_rejected(self):
        # Create solid uniform image (zero variance = blurry)
        frame = np.full((200, 200, 3), 128, dtype=np.uint8)
        bbox = [20, 20, 120, 120]  # 100x100
        passed, reason, _, blur = self.filter.evaluate_face(frame, bbox, score=0.9)
        self.assertFalse(passed)
        self.assertIn("Too blurry", reason)
        self.assertLess(blur, 80.0)

    def test_sharp_face_accepted(self):
        # Create high contrast checkered image
        frame = np.zeros((200, 200, 3), dtype=np.uint8)
        frame[::4, ::4] = 255
        frame[1::4, 1::4] = 255
        bbox = [20, 20, 140, 140]
        passed, reason, _, blur = self.filter.evaluate_face(frame, bbox, score=0.88)
        self.assertTrue(passed)
        self.assertGreaterEqual(blur, 80.0)


class TestByteTrackDeduplication(unittest.TestCase):
    def test_deduplication_single_person_multiple_frames(self):
        tracker = BYTETracker()
        cache = TrackCacheManager()

        # Simulate 10 consecutive frames of the same person
        bbox = [50.0, 50.0, 150.0, 150.0]
        embedding_computed_count = 0

        for _ in range(10):
            tracks = tracker.update([{"bbox": bbox, "score": 0.95}])
            self.assertEqual(len(tracks), 1)
            trk = tracks[0]

            if not cache.is_cached(trk.track_id):
                # First time seeing track: compute embedding
                embedding_computed_count += 1
                cache.store_result(trk.track_id, np.zeros(512), [])

        # ByteTrack ensures only 1 embedding was computed across 10 frames!
        self.assertEqual(embedding_computed_count, 1)
        self.assertEqual(cache.total_deduplicated_frames, 9)


class TestArcFaceAndFaiss(unittest.TestCase):
    def setUp(self):
        self.embedder = ArcFaceEmbedder(embedding_dim=512)
        self.searcher = FaissSimilaritySearch(dimension=512, threshold_confirmed=0.75, threshold_review=0.60)

    def test_embedding_is_l2_normalized(self):
        img = np.random.randint(0, 256, (112, 112, 3), dtype=np.uint8)
        emb = self.embedder.get_embedding(img)
        self.assertEqual(emb.shape, (512,))
        norm = np.linalg.norm(emb)
        self.assertAlmostEqual(norm, 1.0, places=4)

    def test_faiss_exact_match(self):
        # Register a reference profile
        ref_img = np.zeros((112, 112, 3), dtype=np.uint8)
        cv2.circle(ref_img, (56, 56), 30, (200, 150, 100), -1)
        ref_emb = self.embedder.get_embedding(ref_img)

        meta = {"person_id": "TEST-01", "name": "Alice"}
        self.searcher.set_reference_database(ref_emb.reshape(1, 512), [meta])

        # Query with same profile
        results = self.searcher.search(ref_emb, top_k=1, threshold=0.60)
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["person"]["person_id"], "TEST-01")
        self.assertGreaterEqual(results[0]["confidence"], 0.75)
        self.assertEqual(results[0]["tier"], "CONFIRMED")


class TestSQLiteEventService(unittest.TestCase):
    def setUp(self):
        init_db()

    def test_event_logging_and_status_update(self):
        event = EventService.log_match(
            person_id="p-999",
            name="Test Target",
            checkpoint_id="cp-01",
            checkpoint_name="Grand Central",
            lat=40.7527,
            lng=-73.9772,
            confidence=0.89,
            status="PENDING_REVIEW"
        )
        self.assertIsNotNone(event)
        self.assertEqual(event["status"], "PENDING_REVIEW")

        # Confirm match via human review action
        updated = EventService.update_event_status(event["id"], "CONFIRMED")
        self.assertIsNotNone(updated)
        self.assertEqual(updated["status"], "CONFIRMED")


if __name__ == "__main__":
    unittest.main()
