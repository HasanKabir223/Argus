import os
import sys
import cv2
import numpy as np

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from backend.services.face_detector import FaceDetector
from backend.services.face_embedder import ArcFaceEmbedder

detector = FaceDetector(det_thresh=0.3)
embedder = ArcFaceEmbedder()

wl_dir = "backend/WatchList"

def get_ref_embedding(filename):
    p = os.path.join(wl_dir, filename)
    if not os.path.exists(p):
        print(f"[WARN] Reference file not found: {p}")
        return None
    img = cv2.imread(p)
    if img is None:
        return None
    dets = detector.detect(img)
    if dets:
        print(f"[OK] Ref {filename}: detected face ({dets[0]['score']:.2f})")
        return embedder.get_embedding(dets[0]["aligned_crop"])
    else:
        print(f"[WARN] Ref {filename}: no face detected, using raw image")
        return embedder.get_embedding(img)

# Load reference embeddings
emb_obama = get_ref_embedding("p-obama_barack_obama.jpg")
emb_putin = get_ref_embedding("p-suspect-003_unknown_suspect_charlie.jpg")
emb_trump = get_ref_embedding("p-trump_donald_trump.jpg")
emb_musk = get_ref_embedding("p-musk_elon_musk.jpg")
emb_zuck = get_ref_embedding("p-zuckerberg_mark_zuckerberg.jpg")

tests = [
    ("Obama forgets to salute.mp4", "Barack Obama", emb_obama),
    ("videoplayback (1).mp4", "Vladimir Putin", emb_putin),
    ("vidssave.com President Trump and Elon Musk shake hands at Charlie Kirk's memorial 144P.mp4", "Donald Trump", emb_trump),
    ("job_0e3ddbf1bc88_videoplayback (2).mp4", "Mark Zuckerberg", emb_zuck)
]

for vfile, target_name, target_emb in tests:
    vpath = os.path.join("backend/cctv footages", vfile)
    if not os.path.exists(vpath):
        print(f"\n[SKIP] Video {vfile} does not exist.")
        continue

    print(f"\n==========================================")
    print(f"Testing Video: {vfile} -> Target: {target_name}")
    print(f"==========================================")

    cap = cv2.VideoCapture(vpath)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    
    max_sim = 0.0
    best_frame = 0
    matches_above_45 = 0
    matches_above_55 = 0
    faces_detected_total = 0

    frame_idx = 0
    while True:
        ret, frame = cap.read()
        if not ret or frame is None:
            break
        frame_idx += 1
        if frame_idx % 5 != 0:
            continue

        dets = detector.detect(frame)
        if not dets:
            continue

        faces_detected_total += len(dets)
        for d in dets:
            # Test both aligned and raw bbox
            emb_aligned = embedder.get_embedding(d["aligned_crop"])
            emb_raw = embedder.get_embedding(d["raw_crop"])
            
            sim_a = float(np.dot(target_emb, emb_aligned)) if target_emb is not None else 0.0
            sim_r = float(np.dot(target_emb, emb_raw)) if target_emb is not None else 0.0
            sim = max(sim_a, sim_r)

            if sim > max_sim:
                max_sim = sim
                best_frame = frame_idx
            if sim >= 0.45:
                matches_above_45 += 1
            if sim >= 0.55:
                matches_above_55 += 1

    cap.release()
    print(f"Total video frames: {total_frames} | Sampled frames: {frame_idx // 5}")
    print(f"Total face detections: {faces_detected_total}")
    print(f"Max Cosine Similarity: {max_sim * 100:.1f}% @ frame #{best_frame}")
    print(f"Sightings >= 45%: {matches_above_45} | Sightings >= 55%: {matches_above_55}")
