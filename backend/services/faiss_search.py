"""
FAISS Vector Similarity Search & Approximate Nearest Neighbor (ANN) Service
Implements sub-millisecond inner-product and HNSW graph-based vector search on 512-D L2-normalized vectors.

Operational Confidence Bands (ArcFace 512-D, CCTV-calibrated from WhatsApp-quality footage):
- Confirmed Threshold: >= 0.40 (same-person CCTV peak scores 0.40-0.48)
- Review Threshold: 0.28 - 0.40 (borderline, flagged for human review)
- Discard: < 0.28 (different-person noise, near-zero)
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
    Sub-millisecond Exact Cosine Similarity & Vector Search Engine.
    Supports FAISS Inner Product / HNSW indexing on 512-D L2-normalized ArcFace vectors.
    """
    def __init__(
        self,
        dimension: int = 512,
        threshold_confirmed: float = 0.75,
        threshold_review: float = 0.60,
        index_type: str = "hnsw",
        hash_bits: int = 64,
        ef_search: int = 64,
        ef_construction: int = 64
    ):
        self.dimension = dimension
        self.threshold_confirmed = threshold_confirmed
        self.threshold_review = threshold_review
        self.index_type = index_type
        self.hash_bits = hash_bits
        self.ef_search = ef_search
        self.ef_construction = ef_construction

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
        Configures HNSW graph parameters (efSearch, efConstruction) for sub-millisecond query latency.
        """
        if not HAS_FAISS:
            self._index = None
            self._footage_index = None
            return

        if self.index_type == "hnsw":
            try:
                self._index = faiss.IndexHNSWFlat(self.dimension, 32, faiss.METRIC_INNER_PRODUCT)
                self._index.hnsw.efSearch = self.ef_search
                self._index.hnsw.efConstruction = self.ef_construction

                self._footage_index = faiss.IndexHNSWFlat(self.dimension, 32, faiss.METRIC_INNER_PRODUCT)
                self._footage_index.hnsw.efSearch = self.ef_search
                self._footage_index.hnsw.efConstruction = self.ef_construction
            except Exception:
                self._index = faiss.IndexFlatIP(self.dimension)
                self._footage_index = faiss.IndexFlatIP(self.dimension)
        else:
            self._index = faiss.IndexFlatIP(self.dimension)
            self._footage_index = faiss.IndexFlatIP(self.dimension)

    def _normalize_embeddings(self, embeddings: np.ndarray) -> np.ndarray:
        """
        Fast vectorized L2-normalization for 1D or 2D float32 numpy arrays.
        Ensures memory-contiguous layout for optimal FAISS and BLAS inner-product throughput.
        """
        arr = np.ascontiguousarray(embeddings, dtype=np.float32)
        if arr.ndim == 1:
            arr = arr.reshape(1, -1)
        norms = np.linalg.norm(arr, axis=1, keepdims=True)
        norms = np.maximum(norms, 1e-12)
        return np.ascontiguousarray(arr / norms, dtype=np.float32)

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
        embeddings: (N, D) float32 array, L2 normalized.
        metadata: parallel list of N metadata dictionaries.
        """
        if len(embeddings) != len(metadata):
            raise ValueError(f"Mismatch: {len(embeddings)} embeddings vs {len(metadata)} metadata items")

        self.clear()
        if len(embeddings) == 0:
            return

        # Vectorized float32 contiguous L2-normalization
        norm_embeddings = self._normalize_embeddings(embeddings)

        self._reference_embeddings = norm_embeddings
        self._metadata = list(metadata)

        # Add to FAISS index
        if HAS_FAISS and self._index is not None:
            self._index.add(self._reference_embeddings)

    def add_reference(self, embedding: np.ndarray, meta: Dict[str, Any]) -> int:
        """
        Adds a single reference person profile and updates FAISS index.
        """
        emb = self._normalize_embeddings(embedding)

        if self._reference_embeddings is None or len(self._reference_embeddings) == 0:
            self._reference_embeddings = emb
        else:
            self._reference_embeddings = np.ascontiguousarray(
                np.vstack([self._reference_embeddings, emb]),
                dtype=np.float32
            )

        self._metadata.append(meta)

        if HAS_FAISS and self._index is not None:
            self._index.add(emb)

        return len(self._metadata) - 1

    def store_footage_embedding(self, embedding: np.ndarray, meta: Dict[str, Any]) -> int:
        """
        Stores an embedded face detected from CCTV surveillance footage into FAISS.
        """
        emb = self._normalize_embeddings(embedding)

        if self._footage_embeddings is None or len(self._footage_embeddings) == 0:
            self._footage_embeddings = emb
        else:
            self._footage_embeddings = np.ascontiguousarray(
                np.vstack([self._footage_embeddings, emb]),
                dtype=np.float32
            )

        self._footage_metadata.append(meta)

        if HAS_FAISS and self._footage_index is not None:
            self._footage_index.add(emb)

        return len(self._footage_metadata) - 1

    def store_footage_embeddings_batch(
        self,
        embeddings: np.ndarray,
        metadata: List[Dict[str, Any]]
    ) -> List[int]:
        """
        Simultaneously stores multiple face embeddings from CCTV footage into FAISS in a single batch.
        """
        if len(embeddings) == 0:
            return []
        if len(embeddings) != len(metadata):
            raise ValueError(f"Mismatch: {len(embeddings)} embeddings vs {len(metadata)} metadata items")

        embs = self._normalize_embeddings(embeddings)
        start_idx = len(self._footage_metadata)

        if self._footage_embeddings is None or len(self._footage_embeddings) == 0:
            self._footage_embeddings = embs
        else:
            self._footage_embeddings = np.ascontiguousarray(
                np.vstack([self._footage_embeddings, embs]),
                dtype=np.float32
            )

        self._footage_metadata.extend(metadata)

        if HAS_FAISS and self._footage_index is not None:
            self._footage_index.add(embs)

        return list(range(start_idx, start_idx + len(metadata)))

    def batch_search(
        self,
        query_embeddings: np.ndarray,
        top_k: int = 3,
        threshold: Optional[float] = None
    ) -> List[List[Dict[str, Any]]]:
        """
        Executes simultaneous vectorized batch searches on multiple face embeddings in a single FAISS call.
        
        Args:
            query_embeddings: (N, D) or (D,) array of query vectors
            top_k: Maximum number of nearest matches to return per query
            threshold: Confidence cutoff threshold (defaults to self.threshold_review if None)

        Returns:
            List of match candidate lists, where element i corresponds to query_embeddings[i].
            Each candidate dictionary contains person metadata, confidence, tier, and match_type.
        """
        if query_embeddings is None or len(query_embeddings) == 0:
            return []

        queries = self._normalize_embeddings(query_embeddings)
        num_queries = len(queries)

        if self._metadata is None or len(self._metadata) == 0 or self._reference_embeddings is None:
            return [[] for _ in range(num_queries)]

        min_threshold = threshold if threshold is not None else self.threshold_review
        k = min(top_k, len(self._metadata))

        if k <= 0:
            return [[] for _ in range(num_queries)]

        if HAS_FAISS and self._index is not None and self._index.ntotal > 0:
            scores_matrix, indices_matrix = self._index.search(queries, k)
        else:
            # High-speed vectorized inner-product fallback: (N, D) @ (D, M) -> (N, M)
            sim_matrix = np.matmul(queries, self._reference_embeddings.T)
            num_refs = sim_matrix.shape[1]

            if num_refs <= k:
                indices_matrix = np.argsort(-sim_matrix, axis=1)
            else:
                # Fast partitioned top-k selection
                part_indices = np.argpartition(-sim_matrix, k, axis=1)[:, :k]
                row_idx = np.arange(num_queries)[:, None]
                part_scores = sim_matrix[row_idx, part_indices]
                sorted_order = np.argsort(-part_scores, axis=1)
                indices_matrix = part_indices[row_idx, sorted_order]

            scores_matrix = sim_matrix[np.arange(num_queries)[:, None], indices_matrix]

        batch_results: List[List[Dict[str, Any]]] = []

        for i in range(num_queries):
            score_row = scores_matrix[i]
            index_row = indices_matrix[i]
            query_matches: List[Dict[str, Any]] = []

            for score, idx in zip(score_row, index_row):
                if idx < 0 or idx >= len(self._metadata):
                    continue

                score_val = float(score)
                if score_val >= min_threshold:
                    tier = "CONFIRMED" if score_val >= self.threshold_confirmed else "PENDING_REVIEW"
                    query_matches.append({
                        "person": self._metadata[idx],
                        "confidence": round(score_val, 4),
                        "tier": tier,
                        "match_type": "HIGH_CONFIDENCE_ANN" if tier == "CONFIRMED" else "BORDERLINE_REVIEW"
                    })

            # Sort strictly descending and bound to top_k
            query_matches.sort(key=lambda x: x["confidence"], reverse=True)
            batch_results.append(query_matches[:top_k])

        return batch_results

    def search(
        self,
        query_embedding: np.ndarray,
        top_k: int = 5,
        threshold: Optional[float] = None
    ) -> List[Dict[str, Any]]:
        """
        Executes Approximate Nearest Neighbor (ANN) search for a single query embedding.
        Delegates to batch_search with optimized vector normalization.
        """
        if query_embedding is None or len(query_embedding) == 0:
            return []

        batch_res = self.batch_search(query_embedding, top_k=top_k, threshold=threshold)
        return batch_res[0] if batch_res else []

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

    def clear_all_references(self) -> bool:
        """
        Wipes all reference face vectors from FAISS index and resets reference metadata to empty.
        """
        empty_embeddings = np.empty((0, self.dimension), dtype=np.float32)
        self.set_reference_database(empty_embeddings, [])
        return True

    def get_footage_count(self) -> int:
        """
        Returns total number of CCTV footage face vectors indexed in FAISS.
        """
        if HAS_FAISS and self._footage_index is not None:
            return self._footage_index.ntotal
        return len(self._footage_metadata)

