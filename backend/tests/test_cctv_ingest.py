"""
Unit test for CCTV Ingestion Endpoints and Pipeline
"""

import os
import sys
import time

# Add root directory to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from fastapi.testclient import TestClient
from backend.main import app


def test_cctv_ingest_pipeline():
    client = TestClient(app)

    # 1. Test invalid / nonexistent job
    res = client.get("/ingest/status/nonexistent_job_123")
    assert res.status_code == 404, f"Expected 404, got {res.status_code}"

    # 2. Test upload with real sample CCTV video
    cctv_file = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "cctv footages", "videoplayback (1).mp4"))
    assert os.path.exists(cctv_file), f"Sample video not found at {cctv_file}"

    with open(cctv_file, "rb") as f:
        upload_res = client.post("/ingest/upload", files={"video": ("test_clip.mp4", f, "video/mp4")})

    assert upload_res.status_code == 200, f"Upload failed: {upload_res.text}"
    data = upload_res.json()
    assert "job_id" in data, f"Expected job_id in response: {data}"
    job_id = data["job_id"]
    print(f"[OK] Upload successful. Job ID: {job_id}")

    # 3. Poll status until complete or timeout
    max_wait = 45
    start_t = time.time()
    last_status = None

    while time.time() - start_t < max_wait:
        status_res = client.get(f"/ingest/status/{job_id}")
        assert status_res.status_code == 200
        last_status = status_res.json()

        # Validate contract fields
        assert "job_id" in last_status
        assert "status" in last_status
        assert "progress" in last_status
        assert "stage" in last_status
        assert "persons" in last_status
        assert "total_persons" in last_status
        assert "error_message" in last_status

        assert last_status["status"] in ["processing", "done", "error"]
        assert last_status["stage"] in ["detecting", "tracking", "embedding", "indexing", "done"]

        print(f"  [Status Poll] status={last_status['status']}, progress={last_status['progress']}, stage={last_status['stage']}, persons={len(last_status['persons'])}")

        if last_status["status"] in ["done", "error"]:
            break

        time.sleep(0.5)

    assert last_status is not None
    assert last_status["status"] == "done", f"Job failed or did not finish: {last_status}"
    assert last_status["progress"] == 1.0
    assert last_status["stage"] == "done"
    print(f"[OK] CCTV Ingest finished. Total unique persons tracked: {last_status['total_persons']}")

    # Check persons contract
    for p in last_status["persons"]:
        assert "track_id" in p
        assert p["track_id"].startswith("TRACK-")
        assert "best_crop_url" in p
        assert "first_frame" in p
        assert "total_frames" in p
        assert "embedding_stored" in p
        print(f"   Person: {p['track_id']} | First: {p['first_frame']} | Frames: {p['total_frames']} | Embedded: {p['embedding_stored']} | Crop: {p['best_crop_url']}")

    print("[SUCCESS] All CCTV Ingestion tests PASSED successfully!")


if __name__ == "__main__":
    test_cctv_ingest_pipeline()
