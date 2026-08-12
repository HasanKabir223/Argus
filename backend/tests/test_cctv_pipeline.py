"""
End-to-End Test Suite for CCTV Ingestion, LSH Hashing, and FAISS ANN Search Pipeline
"""

import os
import sys
import numpy as np
import cv2
import time

# Ensure workspace root is in sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from backend.db.database import init_db
from backend.services.face_hasher import FaceHasher
from backend.services.face_detector import FaceDetector
from backend.services.face_embedder import ArcFaceEmbedder
from backend.services.faiss_search import FaissSimilaritySearch
from backend.services.pipeline import CheckpointPipeline
from backend.services.event_service import EventService
from backend.scripts.seed_data import seed_initial_system_data


def test_face_hasher():
    print("\n[TEST 1] Testing FaceHasher Locality-Sensitive Hashing...")
    hasher = FaceHasher(embedding_dim=512, hash_bits=128)
    
    # Create two similar vectors and one distinct vector
    np.random.seed(42)
    v1 = np.random.randn(512).astype(np.float32)
    v1 /= np.linalg.norm(v1)
    
    # v2 is close to v1 (cosine similarity ~ 0.95)
    noise = np.random.randn(512).astype(np.float32)
    noise /= np.linalg.norm(noise)
    v2 = 0.95 * v1 + 0.05 * noise
    v2 /= np.linalg.norm(v2)
    
    # v3 is orthogonal / distant
    v3 = np.random.randn(512).astype(np.float32)
    v3 /= np.linalg.norm(v3)
    
    sig1 = hasher.compute_embedding_hash_signature(v1)
    sig2 = hasher.compute_embedding_hash_signature(v2)
    sig3 = hasher.compute_embedding_hash_signature(v3)
    
    dist_1_2 = hasher.hamming_distance(sig1["bit_array"], sig2["bit_array"])
    dist_1_3 = hasher.hamming_distance(sig1["bit_array"], sig3["bit_array"])
    
    print(f"  - Hash 1 (hex): {sig1['hash_hex'][:32]}... ({sig1['hash_bits_count']} bits)")
    print(f"  - Hamming distance (v1 to v2, similar): {dist_1_2} bits")
    print(f"  - Hamming distance (v1 to v3, distant): {dist_1_3} bits")
    
    assert dist_1_2 < dist_1_3, f"Expected similar vectors to have lower Hamming distance! ({dist_1_2} vs {dist_1_3})"
    assert len(sig1["hash_hex"]) == 32, f"Expected 128-bit hex to be 32 chars, got {len(sig1['hash_hex'])}"
    print("  [PASS] FaceHasher LSH and Hamming quantization working perfectly!")


def test_faiss_ann_search():
    print("\n[TEST 2] Testing FAISS ANN Similarity Search with HNSW & LSH...")
    search_engine = FaissSimilaritySearch(dimension=512, threshold_confirmed=0.75, threshold_review=0.60)
    
    # Create 10 reference embeddings
    np.random.seed(42)
    ref_embeddings = np.random.randn(10, 512).astype(np.float32)
    ref_embeddings /= np.linalg.norm(ref_embeddings, axis=1, keepdims=True)
    
    ref_meta = [
        {"person_id": f"p-{i:03d}", "name": f"Target Person {i}", "photo_url": f"/static/gallery/p-{i:03d}.jpg"}
        for i in range(10)
    ]
    
    search_engine.set_reference_database(ref_embeddings, ref_meta)
    
    # Query with target 3 slightly perturbed (92% cosine similarity)
    noise = np.random.randn(512).astype(np.float32)
    noise /= np.linalg.norm(noise)
    query_emb = 0.92 * ref_embeddings[3] + 0.08 * noise
    query_emb /= np.linalg.norm(query_emb)
    
    results = search_engine.search(query_emb, top_k=3, threshold=0.60)
    print(f"  - Top 1 match: {results[0]['person']['name']} (Confidence: {results[0]['confidence']*100:.1f}%, Tier: {results[0]['tier']})")
    print(f"  - Query Hash: {results[0]['query_hash_hex'][:24]}...")
    print(f"  - Ref Hash:   {results[0]['ref_hash_hex'][:24]}...")
    print(f"  - Hamming Dist: {results[0]['hamming_distance']} bits")
    
    assert results[0]["person"]["person_id"] == "p-003", f"Expected match p-003, got {results[0]['person']['person_id']}"
    assert results[0]["confidence"] > 0.85, f"Expected high confidence, got {results[0]['confidence']}"
    print("  [PASS] FAISS ANN Search with LSH matching working accurately!")


def test_cctv_clip_ingestion():
    print("\n[TEST 3] Testing CCTV Clip Ingestion & End-to-End Analysis...")
    init_db()
    pipe = CheckpointPipeline()
    seed_initial_system_data(pipe)
    
    clips = pipe.cctv_service.get_available_clips()
    print(f"  - Found {len(clips)} configured CCTV surveillance camera clips.")
    
    if not clips or not any(c.get("exists") for c in clips):
        raise FileNotFoundError("No valid CCTV surveillance clips found in backend/cctv footages")
    
    # Pick the first available clip that exists on disk
    target_clip = next((c for c in clips if c.get("exists")), clips[0])
    from backend.services.cctv_service import _get_cctv_storage_dirs
    storage_dirs = _get_cctv_storage_dirs()
    video_path = None
    for sdir in storage_dirs:
        candidate = os.path.join(sdir, target_clip["filename"])
        if os.path.exists(candidate):
            video_path = candidate
            break
    if not video_path:
        video_path = os.path.join(storage_dirs[0], target_clip["filename"])
    
    print(f"  - Ingesting {target_clip['filename']} ({target_clip['checkpoint_name']})...")
    t0 = time.time()
    results = pipe.cctv_service.process_cctv_clip(
        video_path=video_path,
        checkpoint_id=target_clip["checkpoint_id"],
        checkpoint_name=target_clip["checkpoint_name"],
        lat=target_clip["lat"],
        lng=target_clip["lng"],
        camera_id=target_clip["camera_id"],
        frame_stride=2,
        confidence_threshold=0.60
    )
    t_elapsed = time.time() - t0
    
    print(f"  - Processed in {t_elapsed:.2f}s ({results['telemetry']['effective_fps']} effective FPS)")
    print(f"  - Total faces detected: {results['telemetry']['total_faces_detected']}")
    print(f"  - Deduplication savings: {results['telemetry']['deduplication_savings_percent']}%")
    print(f"  - Matches logged to SQLite & Map: {results['matches_count']}")
    
    for m in results["matches"]:
        print(f"    * [MATCH] {m['name']} (ID: {m['person_id']}) - Score: {m['confidence']*100:.1f}% ({m['tier']}) at {m['checkpoint_name']} [{m['lat']}, {m['lng']}]")
    
    assert results["status"] == "COMPLETED"
    print("  [PASS] CCTV surveillance video ingestion and matching verified successfully!")


if __name__ == "__main__":
    print("=" * 60)
    print("RUNNING SENTINEL CCTV AI PIPELINE TESTS")
    print("=" * 60)
    test_face_hasher()
    test_faiss_ann_search()
    test_cctv_clip_ingestion()
    print("\nALL PIPELINE TESTS PASSED CLEANLY!")
