import os
import json
import faiss
import numpy as np
from typing import List, Dict, Tuple, Any


def load_index(index_path: str, metadata_path: str) -> Tuple[faiss.Index, List[Dict[str, Any]]]:
    """
    Loads the FAISS vector index and corresponding watchlist metadata JSON.

    Args:
        index_path (str): Path to the saved .faiss index file.
        metadata_path (str): Path to the JSON metadata file mapping indices to person records.

    Returns:
        tuple[faiss.Index, list[dict]]: The FAISS index instance and metadata list.

    Raises:
        FileNotFoundError: If either index_path or metadata_path does not exist.
        RuntimeError: If loading index or parsing metadata fails.
    """
    if not os.path.isfile(index_path):
        raise FileNotFoundError(f"FAISS index not found at {index_path}. Run build_index.py first.")

    if not os.path.isfile(metadata_path):
        raise FileNotFoundError(f"Metadata file not found at {metadata_path}. Run build_index.py first.")

    try:
        index = faiss.read_index(index_path)
        with open(metadata_path, "r", encoding="utf-8") as f:
            metadata = json.load(f)
        return index, metadata
    except Exception as e:
        raise RuntimeError(f"[searcher] Failed to load FAISS index or metadata: {e}")


def search(
    index: faiss.Index,
    metadata: List[Dict[str, Any]],
    query_embedding: np.ndarray,
    top_k: int = 3,
    threshold_confirmed: float = 0.40,
    threshold_review: float = 0.30
) -> List[Dict[str, Any]]:
    """
    Queries the FAISS index with a single 128-D face embedding and filters
    matches by confidence threshold tiers calibrated for SFace:
    - CONFIRMED (>= 0.40): Automatically confirmed match.
    - LOW_CONFIDENCE (0.30 to 0.40): Flagged for human operator review (up to top 3 candidates).
    - Discarded (< 0.30): Ignored.

    Note: SFace 128-D embeddings produce lower cosine similarity scores than
    ArcFace 512-D.  Empirically calibrated: same-person cross-image scores
    land in the 0.30–0.50 range, while imposter scores peak around 0.28.

    Args:
        index (faiss.Index): Loaded FAISS vector index.
        metadata (list[dict]): Associated person metadata list.
        query_embedding (np.ndarray): 128-D L2-normalized query feature vector.
        top_k (int): Maximum number of top nearest neighbors to retrieve (default 3).
        threshold_confirmed (float): Cosine similarity score for auto-CONFIRMED tier (default 0.40).
        threshold_review (float): Cosine similarity score for human review tier (default 0.30).

    Returns:
        list[dict]: Top-k matched target dicts sorted by confidence descending.
    """
    try:
        if index is None or query_embedding is None or len(metadata) == 0:
            return []

        query = query_embedding.reshape(1, -1).astype(np.float32)
        scores, indices = index.search(query, top_k)

        results = []
        for score, idx in zip(scores[0], indices[0]):
            if idx == -1:
                continue

            score_val = float(score)
            if score_val < threshold_review:
                continue

            match_type = "CONFIRMED" if score_val >= threshold_confirmed else "LOW_CONFIDENCE"
            person_meta = metadata[idx]

            results.append({
                "person_id": person_meta["person_id"],
                "name": person_meta["name"],
                "confidence": score_val,
                "match_type": match_type,
                "photo_path": person_meta["photo_path"]
            })

        results.sort(key=lambda x: x["confidence"], reverse=True)
        return results
    except Exception as e:
        print(f"[searcher] Search failed: {e}")
        return []


def explain_score(score: float) -> str:
    """
    Returns a human-readable interpretation of a cosine similarity score.

    Args:
        score (float): Raw cosine similarity score between 0.0 and 1.0.

    Returns:
        str: Descriptive diagnostic explanation.
    """
    try:
        if score >= 0.50:
            return f"{score:.3f} — Very high confidence. Strong candidate for review."
        if score >= 0.40:
            return f"{score:.3f} — Confirmed match threshold. Auto-confirmed match."
        if score >= 0.30:
            return f"{score:.3f} — Review threshold. Flagged for human confirmation (Top-3 candidate)."
        return f"{score:.3f} — Below threshold. Not a match."
    except Exception as e:
        return f"{score} — (Error explaining score: {e})"
