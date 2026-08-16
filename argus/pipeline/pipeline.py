"""
ARGUS Pipeline Assembly Module
Integrates YuNet Face Detection, SFace Feature Embedding, and FAISS Vector Matching into a single interface.
"""

import numpy as np
from typing import List, Dict, Any

from pipeline.detector import load_detector, detect_and_filter
from pipeline.embedder import load_embedder, get_embedding
from pipeline.searcher import load_index, search


class ARGUSPipeline:
    """
    Full ARGUS face-matching pipeline.

    Usage:
        pipeline = ARGUSPipeline(
            yunet_model_path="models/yunet.onnx",
            faiss_index_path="watchlist/index.faiss",
            faiss_metadata_path="watchlist/metadata.json"
        )
        results = pipeline.process_frame(frame, checkpoint_id="cp-001")
    """

    def __init__(self, yunet_model_path: str, faiss_index_path: str, faiss_metadata_path: str):
        """
        Initializes the pipeline by loading the YuNet detector, SFace embedder,
        and FAISS index with watchlist metadata.

        Args:
            yunet_model_path (str): Filepath to the YuNet ONNX model.
            faiss_index_path (str): Filepath to the FAISS vector index file.
            faiss_metadata_path (str): Filepath to the JSON metadata file.
        """
        try:
            print(f"[pipeline] Loading YuNet detector from {yunet_model_path}...")
            self.detector = load_detector(yunet_model_path)
            print("[pipeline] Loaded YuNet detector")

            print("[pipeline] Loading SFace embedder...")
            self.embedder = load_embedder()
            print("[pipeline] Loaded SFace embedder")

            print(f"[pipeline] Loading FAISS index from {faiss_index_path}...")
            self.index, self.metadata = load_index(faiss_index_path, faiss_metadata_path)
            print(f"[pipeline] Loaded FAISS index — {len(self.metadata)} persons")
        except Exception as e:
            raise RuntimeError(f"[pipeline] Pipeline initialization failed: {e}")

    def process_frame(
        self,
        frame: np.ndarray,
        checkpoint_id: str,
        min_face_size: int = 20,
        blur_threshold: float = 40.0
    ) -> List[Dict[str, Any]]:
        """
        Processes a single video frame: detects faces, generates embeddings,
        and compares them against the watchlist index.

        Args:
            frame (np.ndarray): Single BGR video frame.
            checkpoint_id (str): Operational surveillance checkpoint identifier.
            min_face_size (int): Minimum face dimension in pixels. Default 20.
            blur_threshold (float): Minimum Laplacian variance for sharpness. Default 40.0.

        Returns:
            list[dict]: List of match result dictionaries. Empty list if no matches.
        """
        try:
            results = []

            # 1. Detect and filter faces
            faces = detect_and_filter(
                self.detector,
                frame,
                min_face_size=min_face_size,
                blur_threshold=blur_threshold
            )
            if not faces:
                return []

            # 2. Embed + search each detected face
            for face in faces:
                embedding = get_embedding(self.embedder, face)
                if embedding is None:
                    continue

                matches = search(self.index, self.metadata, embedding)

                for match in matches:
                    results.append({
                        **match,
                        "face_bbox": face["bbox"],
                        "det_score": face["det_score"],
                        "checkpoint_id": checkpoint_id
                    })

            return results
        except Exception as e:
            print(f"[pipeline] Error processing frame for checkpoint {checkpoint_id}: {e}")
            return []
