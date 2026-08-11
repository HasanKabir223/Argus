"""
FAISS Vector Similarity Search & Approximate Nearest Neighbor (ANN) Service
Implements sub-millisecond inner-product and HNSW graph-based vector search on 512-D L2-normalized vectors.

Operational Confidence Bands:
- Confirmed Threshold: >= 0.75 (high-confidence match)
- Review Threshold: 0.60 - 0.75 (borderline candidate for human review)
- Discard: < 0.60
"""

import numpy as np
from typing import List, Dict, Any, Optional

try:
    import faiss
    HAS_FAISS = True
except ImportError:
    HAS_FAISS = False


class FaissSimilaritySearch:
    """
    Sub-millisecond Vector & Approximate Nearest Neighbor (ANN) Search Engine.
    Supports FAISS HNSW graph indexing and Flat Inner Product on 512-D vectors.
    """
    def __init__(
        self,
        dimension: int = 64,
        threshold_confirmed: float = 0.75,
        threshold_review: float = 0.60,
        index_type: str = "hnsw",
        hash_bits: int = 64
    ):
        self.dimension = dimension
        self.threshold_confirmed = threshold_confirmed
        self.threshold_review = threshold_review
        self.index_type = index_type

        self._index = None
        self._footage_index = None
        self._reference_embeddings: Optional[np.ndarray] = None
        self._metadata: List[Dict[str, Any]] = []
        self._footage_embeddings: Optional[np.ndarray] = None
        self._footage_metadata: List[Dict[str, Any]] = []
        
        self._init_index()

    def _init_index(self):
        """
        Initializes FAISS indices for watchlist reference database and CCTV footage embeddings.
        """
        if not HAS_FAISS:
            self._index = None
            self._footage_index = None
            return

        if self.index_type == "hnsw":
            try:
                self._index = faiss.IndexHNSWFlat(self.dimension, 32, faiss.METRIC_INNER_PRODUCT)
                self._index.hnsw.efSearch = 64
                self._index.hnsw.efConstruction = 64

                self._footage_index = faiss.IndexHNSWFlat(self.dimension, 32, faiss.METRIC_INNER_PRODUCT)
                self._footage_index.hnsw.efSearch = 64
                self._footage_index.hnsw.efConstruction = 64
            except Exception:
                self._index = faiss.IndexFlatIP(self.dimension)
                self._footage_index = faiss.IndexFlatIP(self.dimension)
        else:
            self._index = faiss.IndexFlatIP(self.dimension)
            self._footage_index = faiss.IndexFlatIP(self.dimension)

    def clear(self):
        self._init_index()
        self._reference_embeddings = None
        self._metadata = []
        self._footage_embeddings = None
        self._footage_metadata = []

    def set_reference_database(
        self,
        embeddings: np.ndarray,
        metadata: List[Dict[str, Any]]
    ):
        """
        Loads reference missing/wanted persons embeddings into the FAISS vector index.
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

        # Add to FAISS index
        if HAS_FAISS and self._index is not None:
            self._index.add(self._reference_embeddings)

    def add_reference(self, embedding: np.ndarray, meta: Dict[str, Any]) -> int:
        """
        Adds a single reference person profile and updates FAISS index.
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

        if HAS_FAISS and self._index is not None:
            self._index.add(emb)

        return len(self._metadata) - 1

    def store_footage_embedding(self, embedding: np.ndarray, meta: Dict[str, Any]) -> int:
        """
        Stores an embedded face detected from CCTV surveillance footage into FAISS.
        """
        emb = embedding.reshape(1, self.dimension).astype(np.float32)
        norm = np.linalg.norm(emb)
        if norm > 0:
            emb = emb / norm

        if self._footage_embeddings is None or len(self._footage_embeddings) == 0:
            self._footage_embeddings = emb
        else:
            self._footage_embeddings = np.vstack([self._footage_embeddings, emb])

        self._footage_metadata.append(meta)

        if HAS_FAISS and self._footage_index is not None:
            self._footage_index.add(emb)

        return len(self._footage_metadata) - 1

    def search(
        self,
        query_embedding: np.ndarray,
        top_k: int = 5,
        threshold: Optional[float] = None
    ) -> List[Dict[str, Any]]:
        """
        Executes Approximate Nearest Neighbor (ANN) search for a query embedding.
        """
        if self._metadata is None or len(self._metadata) == 0:
            return []

        min_threshold = threshold if threshold is not None else self.threshold_review

        # Shape query to (1, 512) and normalize
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
            # High-speed vectorized inner-product fallback
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
                    "tier": tier,
                    "match_type": "HIGH_CONFIDENCE_ANN" if tier == "CONFIRMED" else "BORDERLINE_REVIEW"
                })

        return sorted(results, key=lambda x: x["confidence"], reverse=True)

    def remove_reference(self, person_id: str) -> bool:
        """
        Removes a reference person from the FAISS vector index and in-memory metadata.
        Rebuilds index with remaining embeddings.
        """
        if not self._metadata:
            return False

        remaining_indices = [
            i for i, meta in enumerate(self._metadata)
            if meta.get("person_id") != person_id
        ]

        if len(remaining_indices) == len(self._metadata):
            return False  # Not found

        new_metadata = [self._metadata[i] for i in remaining_indices]

        if self._reference_embeddings is not None and len(remaining_indices) > 0:
            new_embeddings = self._reference_embeddings[remaining_indices]
        else:
            new_embeddings = np.empty((0, self.dimension), dtype=np.float32)

        self.set_reference_database(new_embeddings, new_metadata)
        return True



    def store_footage_embedding(self, embedding: np.ndarray, meta: Dict[str, Any]) -> int:
        """
        Stores a detected CCTV footage face embedding into the footage FAISS vector index.
        """
        emb = embedding.reshape(1, self.dimension).astype(np.float32)
        norm = np.linalg.norm(emb)
        if norm > 0:
            emb = emb / norm

        if self._footage_embeddings is None or len(self._footage_embeddings) == 0:
            self._footage_embeddings = emb
        else:
            self._footage_embeddings = np.vstack([self._footage_embeddings, emb])

        self._footage_metadata.append(meta)

        if HAS_FAISS and self._footage_index is not None:
            self._footage_index.add(emb)

        return len(self._footage_metadata) - 1

    def get_footage_count(self) -> int:
        """
        Returns total number of CCTV footage face vectors indexed in FAISS.
        """
        if HAS_FAISS and self._footage_index is not None:
            return self._footage_index.ntotal
        return len(self._footage_metadata)

