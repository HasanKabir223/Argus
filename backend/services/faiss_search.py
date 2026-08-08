"""
FAISS Vector Similarity Search Service
Implements sub-millisecond inner-product (cosine similarity) matching on 512-D L2-normalized vectors.
Configured with dual operational confidence bands:
- Confirmed Threshold: >= 0.75 (high-confidence match)
- Review Threshold: 0.60 - 0.75 (borderline candidate for human review)
- Discard: < 0.60
"""

import numpy as np
from typing import List, Dict, Any, Optional, Tuple

try:
    import faiss
    HAS_FAISS = True
except ImportError:
    HAS_FAISS = False


class FaissSimilaritySearch:
    """
    Sub-millisecond Vector Similarity Search Engine
    Supports both native FAISS IndexFlatIP and vectorized NumPy fallback.
    """
    def __init__(
        self,
        dimension: int = 512,
        threshold_confirmed: float = 0.75,
        threshold_review: float = 0.60
    ):
        self.dimension = dimension
        self.threshold_confirmed = threshold_confirmed
        self.threshold_review = threshold_review
        
        self._index = None
        self._reference_embeddings: Optional[np.ndarray] = None
        self._metadata: List[Dict[str, Any]] = []
        
        self._init_index()

    def _init_index(self):
        if HAS_FAISS:
            self._index = faiss.IndexFlatIP(self.dimension)
        else:
            self._index = None

    def clear(self):
        self._init_index()
        self._reference_embeddings = None
        self._metadata = []

    def set_reference_database(
        self,
        embeddings: np.ndarray,
        metadata: List[Dict[str, Any]]
    ):
        """
        Loads the reference missing persons embeddings into the vector index.
        embeddings: (N, 512) float32 array, L2 normalized.
        metadata: parallel list of N metadata dictionaries.
        """
        if len(embeddings) != len(metadata):
            raise ValueError(f"Mismatch: {len(embeddings)} embeddings vs {len(metadata)} metadata items")

        self.clear()
        if len(embeddings) == 0:
            return

        # Ensure float32 and 2D
        embeddings = np.ascontiguousarray(embeddings.astype(np.float32))

        # Enforce L2 unit-norm
        norms = np.linalg.norm(embeddings, axis=-1, keepdims=True)
        norms = np.maximum(norms, 1e-12)
        embeddings = embeddings / norms

        self._reference_embeddings = embeddings
        self._metadata = list(metadata)

        if HAS_FAISS:
            self._index.add(self._reference_embeddings)

    def add_reference(self, embedding: np.ndarray, meta: Dict[str, Any]) -> int:
        """
        Adds a single reference person profile and updates the index.
        """
        emb = embedding.reshape(1, self.dimension).astype(np.float32)
        norm = np.linalg.norm(emb)
        if norm > 0:
            emb = emb / norm

        if self._reference_embeddings is None or len(self._reference_embeddings) == 0:
            self._reference_embeddings = emb
        else:
            self._reference_embeddings = np.vstack([self._reference_embeddings, emb])

        self._metadata.append(meta)

        if HAS_FAISS:
            self._index.add(emb)

        return len(self._metadata) - 1

    def search(
        self,
        query_embedding: np.ndarray,
        top_k: int = 5,
        threshold: Optional[float] = None
    ) -> List[Dict[str, Any]]:
        """
        Executes similarity search for a query embedding against the reference index.
        Returns matches ranked by cosine similarity score.
        """
        if self._metadata is None or len(self._metadata) == 0:
            return []

        min_threshold = threshold if threshold is not None else self.threshold_review

        # Shape query to (1, 512)
        query = query_embedding.reshape(1, self.dimension).astype(np.float32)
        q_norm = np.linalg.norm(query)
        if q_norm > 0:
            query = query / q_norm

        top_k = min(top_k, len(self._metadata))

        if HAS_FAISS and self._index is not None and self._index.ntotal > 0:
            scores, indices = self._index.search(query, top_k)
            score_row = scores[0]
            index_row = indices[0]
        else:
            # High performance vectorized inner-product fallback
            dot_products = np.dot(self._reference_embeddings, query.T).flatten()
            top_indices = np.argsort(-dot_products)[:top_k]
            score_row = dot_products[top_indices]
            index_row = top_indices

        results = []
        for score, idx in zip(score_row, index_row):
            if idx < 0 or idx >= len(self._metadata):
                continue
            
            score_val = float(score)
            if score_val >= min_threshold:
                tier = "CONFIRMED" if score_val >= self.threshold_confirmed else "PENDING_REVIEW"
                results.append({
                    "person": self._metadata[idx],
                    "confidence": round(score_val, 4),
                    "match": True,
                    "tier": tier,
                    "threshold_confirmed": self.threshold_confirmed,
                    "threshold_review": self.threshold_review
                })

        return results
