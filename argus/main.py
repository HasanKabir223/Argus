"""
main.py

Runs ARGUS pipeline on a video file and prints all matches to stdout.
Does NOT write to any database, does NOT start any server.
This is a standalone test runner for the AI pipeline only.

Usage:
    python main.py --video path/to/video.mp4 --checkpoint cp-001
"""

import os
import sys
import argparse
import cv2

# Ensure argus package is on sys.path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from pipeline.pipeline import ARGUSPipeline


def main():
    parser = argparse.ArgumentParser(description="ARGUS Surveillance Pipeline Runner")
    parser.add_argument("--video", required=True, help="Path to input CCTV video file")
    parser.add_argument("--checkpoint", default="cp-001", help="Checkpoint identifier (e.g. cp-001)")
    args = parser.parse_args()

    base_dir = os.path.dirname(os.path.abspath(__file__))
    yunet_model_path = os.path.join(base_dir, "models", "yunet.onnx")
    faiss_index_path = os.path.join(base_dir, "watchlist", "index.faiss")
    faiss_metadata_path = os.path.join(base_dir, "watchlist", "metadata.json")

    if not os.path.isfile(args.video):
        print(f"Error: Video file not found at {args.video}")
        sys.exit(1)

    print(f"[ARGUS] Initializing AI Pipeline...")
    pipeline = ARGUSPipeline(
        yunet_model_path=yunet_model_path,
        faiss_index_path=faiss_index_path,
        faiss_metadata_path=faiss_metadata_path
    )

    cap = cv2.VideoCapture(args.video)
    if not cap.isOpened():
        print(f"Error: Could not open video file {args.video}")
        sys.exit(1)

    total_video_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    print(f"[ARGUS] Processing video: {args.video} ({total_video_frames} total frames, sampling every 5 frames)...")

    frame_idx = 0
    processed_count = 0
    total_matches = 0
    confirmed_matches = 0
    low_confidence_matches = 0

    PROCESS_EVERY_N = 5

    while True:
        ret, frame = cap.read()
        if not ret or frame is None:
            break

        frame_idx += 1

        if frame_idx % PROCESS_EVERY_N != 0:
            continue

        processed_count += 1
        results = pipeline.process_frame(frame, checkpoint_id=args.checkpoint)

        for match in results:
            total_matches += 1
            if match["match_type"] == "CONFIRMED":
                confirmed_matches += 1
            else:
                low_confidence_matches += 1

            print(
                f"  [MATCH] person_id={match['person_id']} | "
                f"name={match['name']} | "
                f"confidence={match['confidence']:.3f} | "
                f"type={match['match_type']} | "
                f"checkpoint={match['checkpoint_id']} | "
                f"frame={frame_idx}"
            )

    cap.release()

    print("\n  === SUMMARY ===")
    print(f"  Frames processed : {processed_count}")
    print(f"  Total matches    : {total_matches}")
    print(f"  Confirmed        : {confirmed_matches}")
    print(f"  Low confidence   : {low_confidence_matches}")


if __name__ == "__main__":
    main()
