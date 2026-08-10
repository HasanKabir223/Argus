"""
FastAPI HTTP Integration & End-to-End Pipeline Test
Uses FastAPI TestClient to test all REST endpoints:
- GET /api/health
- GET /api/checkpoints
- GET /api/reference-persons
- GET /api/cctv/clips
- POST /api/cctv/process-clip
- GET /api/events
- GET /api/metrics
"""

import os
import sys
from fastapi.testclient import TestClient

# Ensure workspace root is in sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from backend.main import app
from backend.db.database import init_db
from backend.services.pipeline import CheckpointPipeline
from backend.scripts.seed_data import seed_initial_system_data
from backend.api.routes import get_pipeline


def test_api_endpoints():
    print("=" * 70)
    print("RUNNING FASTAPI END-TO-END HTTP INTEGRATION TESTS")
    print("=" * 70)

    # Initialize app database & seed data
    init_db()
    pipe = get_pipeline()
    seed_initial_system_data(pipe)

    client = TestClient(app)

    # 1. Health Check
    print("\n[1] Testing GET /api/health...")
    res = client.get("/api/health")
    assert res.status_code == 200, f"Expected 200, got {res.status_code}"
    data = res.json()
    assert data["status"] == "ACTIVE"
    print(f"  [OK] Health Check: {data}")

    # 2. Checkpoints List
    print("\n[2] Testing GET /api/checkpoints...")
    res = client.get("/api/checkpoints")
    assert res.status_code == 200
    checkpoints = res.json()
    assert len(checkpoints) >= 5, f"Expected >=5 checkpoints, got {len(checkpoints)}"
    print(f"  [OK] Found {len(checkpoints)} checkpoints (e.g. {checkpoints[0]['name']} at [{checkpoints[0]['lat']}, {checkpoints[0]['lng']}])")

    # 3. Reference Watchlist
    print("\n[3] Testing GET /api/reference-persons...")
    res = client.get("/api/reference-persons")
    assert res.status_code == 200
    persons = res.json()
    assert len(persons) >= 8, f"Expected >=8 enrolled persons, got {len(persons)}"
    print(f"  [OK] Found {len(persons)} enrolled reference persons in FAISS database (e.g. {persons[0]['name']} - ID: {persons[0]['person_id']})")

    # 4. CCTV Clips Catalog
    print("\n[4] Testing GET /api/cctv/clips...")
    res = client.get("/api/cctv/clips")
    assert res.status_code == 200
    clips = res.json()
    assert len(clips) >= 5, f"Expected >=5 clips, got {len(clips)}"
    print(f"  [OK] Found {len(clips)} monitored CCTV surveillance camera feeds")

    # 5. Process CCTV Video Clip via API
    print("\n[5] Testing POST /api/cctv/process-clip...")
    target_clip = clips[0]
    payload = {
        "clip_id": target_clip["id"],
        "checkpoint_id": target_clip["checkpoint_id"],
        "frame_stride": 2,
        "confidence_threshold": 0.60
    }
    res = client.post("/api/cctv/process-clip", json=payload)
    assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
    cctv_result = res.json()
    assert cctv_result["status"] == "COMPLETED"
    print(f"  [OK] CCTV Scan Completed: {cctv_result['video_metadata']['filename']}")
    print(f"      - Effective FPS: {cctv_result['telemetry']['effective_fps']}")
    print(f"      - Faces Detected: {cctv_result['telemetry']['total_faces_detected']}")
    print(f"      - Deduplication Savings: {cctv_result['telemetry']['deduplication_savings_percent']}%")
    print(f"      - Matches Sighted: {cctv_result['matches_count']}")

    if cctv_result["matches"]:
        m = cctv_result["matches"][0]
        print(f"      - Matched: {m['name']} ({m['confidence']*100:.1f}%) at {m['checkpoint_name']} GPS: [{m['lat']}, {m['lng']}]")
        print(f"      - LSH Hash: {m.get('query_hash_hex', '')[:24]}... (Hamming: {m.get('hamming_distance', 0)})")

    # 6. Events List
    print("\n[6] Testing GET /api/events...")
    res = client.get("/api/events")
    assert res.status_code == 200
    events = res.json()
    assert len(events) > 0, "Expected logged match events"
    print(f"  [OK] Retrieved {len(events)} logged sighting events from SQLite event store")

    # 7. System Metrics
    print("\n[7] Testing GET /api/metrics...")
    res = client.get("/api/metrics")
    assert res.status_code == 200
    metrics = res.json()
    assert "pipeline" in metrics and "deduplication" in metrics
    print(f"  [OK] System Telemetry Metrics verified:")
    print(f"      - Estimated FPS: {metrics['pipeline']['estimated_fps']}")
    print(f"      - Total Frames: {metrics['pipeline']['total_frames_processed']}")
    print(f"      - Hashing Algorithm: {metrics.get('hashing', {}).get('algorithm', 'LSH')}")
    print(f"      - ANN Engine: {metrics.get('ann_search', {}).get('engine', 'FAISS HNSW')}")

    print("\n" + "=" * 70)
    print("ALL FASTAPI HTTP INTEGRATION TESTS PASSED WITH 100% SUCCESS!")
    print("=" * 70)


if __name__ == "__main__":
    test_api_endpoints()
