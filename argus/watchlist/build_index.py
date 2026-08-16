"""
build_index.py

Reads a folder of reference photos, generates ArcFace embeddings for each,
and saves a FAISS index + metadata JSON file.

Folder structure expected:
    watchlist/photos/
        M-0001_Riya_Sharma.jpg
        M-0002_Arjun_Mehta.jpg
        M-0003_Priya_Patel.jpg

Filename format: {person_id}_{Name_With_Underscores}.jpg
person_id and name are parsed from the filename automatically.
"""

import os
import sys
import json
import argparse
import cv2
import numpy as np
import faiss

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from pipeline.detector import load_detector, detect_and_filter
from pipeline.embedder import load_embedder, get_embedding


def build_index(photos_dir: str, output_dir: str):
    """
    Builds a FAISS index and metadata JSON from reference photos in photos_dir.

    Args:
        photos_dir (str): Directory containing watchlist mugshot photos.
        output_dir (str): Destination directory for index.faiss and metadata.json.
    """
    print(f"[build_index] Loading models...")
    models_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "models")
    yunet_path = os.path.join(models_dir, "yunet.onnx")

    detector = load_detector(yunet_path)
    embedder = load_embedder()

    embeddings = []
    metadata = []
    failed = []

    if not os.path.isdir(photos_dir):
        raise ValueError(f"Photos directory does not exist: {photos_dir}")

    photo_files = [
        f for f in os.listdir(photos_dir)
        if f.lower().endswith((".jpg", ".jpeg", ".png"))
    ]

    if not photo_files:
        raise ValueError(f"No images found in {photos_dir}")

    print(f"[build_index] Processing {len(photo_files)} reference photos...")

    for filename in photo_files:
        path = os.path.join(photos_dir, filename)
        name_part = os.path.splitext(filename)[0]          # "M-0001_Riya_Sharma"
        parts = name_part.split("_", 1)                    # ["M-0001", "Riya_Sharma"]

        if len(parts) != 2:
            print(f"[build_index] SKIP {filename} — filename must be {{id}}_{{Name}}.jpg")
            failed.append(filename)
            continue

        person_id = parts[0]                               # "M-0001"
        name = parts[1].replace("_", " ")                  # "Riya Sharma"

        frame = cv2.imread(path)
        if frame is None:
            print(f"[build_index] SKIP {filename} — could not read image")
            failed.append(filename)
            continue

        faces = detect_and_filter(detector, frame, min_face_size=20, blur_threshold=40.0)
        # lower thresholds for reference photos — they may be cleaner but smaller

        if not faces:
            print(f"[build_index] SKIP {filename} — no face detected")
            failed.append(filename)
            continue

        # Use the highest-confidence face if multiple detected
        best_face = max(faces, key=lambda f: f["det_score"])
        embedding = get_embedding(embedder, best_face)

        if embedding is None:
            print(f"[build_index] SKIP {filename} — embedding failed")
            failed.append(filename)
            continue

        embeddings.append(embedding)
        metadata.append({
            "person_id": person_id,
            "name": name,
            "photo_path": path
        })
        print(f"[build_index] OK  {filename} -> {person_id} ({name})")

    if not embeddings:
        raise RuntimeError("No embeddings generated. Check your photos and model setup.")

    # Build FAISS index
    dim = 512
    index = faiss.IndexFlatIP(dim)             # Inner product = cosine sim on normalized vectors
    matrix = np.stack(embeddings).astype(np.float32)
    index.add(matrix)

    # Save index
    os.makedirs(output_dir, exist_ok=True)
    index_path = os.path.join(output_dir, "index.faiss")
    metadata_path = os.path.join(output_dir, "metadata.json")

    faiss.write_index(index, index_path)
    with open(metadata_path, "w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2)

    print(f"\n[build_index] Done.")
    print(f"  Persons indexed : {len(embeddings)}")
    print(f"  Skipped         : {len(failed)} ({', '.join(failed) if failed else 'none'})")
    print(f"  FAISS index     : {index_path}")
    print(f"  Metadata        : {metadata_path}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--photos_dir", required=True)
    parser.add_argument("--output_dir", required=True)
    args = parser.parse_args()
    os.makedirs(args.output_dir, exist_ok=True)
    build_index(args.photos_dir, args.output_dir)
