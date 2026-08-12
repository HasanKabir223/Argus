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

    def test_lfw_cross_photo_recognition(self):
        import os
        from backend.scripts.download_lfw import LFW_GALLERY_DIR, LFW_SIGHTINGS_DIR
        
        # Check if LFW gallery has photos
        if not os.path.exists(LFW_GALLERY_DIR) or not os.listdir(LFW_GALLERY_DIR):
            return

        gallery_files = sorted([f for f in os.listdir(LFW_GALLERY_DIR) if f.endswith('.jpg')])
        if len(gallery_files) < 2:
            return

        # Load reference photos for Person 1 and Person 2
        p1_ref_path = os.path.join(LFW_GALLERY_DIR, gallery_files[0])
        p2_ref_path = os.path.join(LFW_GALLERY_DIR, gallery_files[1])
        p1_img = cv2.imread(p1_ref_path)
        p2_img = cv2.imread(p2_ref_path)

        p1_id = gallery_files[0].split('_')[0]
        p2_id = gallery_files[1].split('_')[0]

        p1_emb = self.embedder.get_embedding(p1_img)
        p2_emb = self.embedder.get_embedding(p2_img)

        self.searcher.set_reference_database(
            np.vstack([p1_emb, p2_emb]),
            [{"person_id": p1_id, "name": "Person 1"}, {"person_id": p2_id, "name": "Person 2"}]
        )

        # Look for alternate sighting photo of Person 1
        sighting_files = [f for f in os.listdir(LFW_SIGHTINGS_DIR) if f.startswith(f"sighting_{p1_id}_")]
        if sighting_files:
            sight_img = cv2.imread(os.path.join(LFW_SIGHTINGS_DIR, sighting_files[0]))
            sight_emb = self.embedder.get_embedding(sight_img)

            # Query FAISS
            results = self.searcher.search(sight_emb, top_k=2, threshold=0.40)
            self.assertGreater(len(results), 0)
            # Person 1 should be the top match!
            self.assertEqual(results[0]["person"]["person_id"], p1_id)
            print(f"\n[Test ArcFace LFW] Genuine match confidence for {p1_id}: {results[0]['confidence']:.4f}")


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
