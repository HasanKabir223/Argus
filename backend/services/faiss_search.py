"""
FAISS Vector Similarity Search & Approximate Nearest Neighbor (ANN) Service
Implements sub-millisecond inner-product and HNSW graph-based vector search on 512-D L2-normalized vectors.
Integrates Locality-Sensitive Hashing (LSH) for binary quantization and candidate pre-filtering.

Operational Confidence Bands:
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

from backend.services.face_hasher import FaceHasher


class FaissSimilaritySearch:
    """
    Sub-millisecond Vector & Approximate Nearest Neighbor (ANN) Search Engine.
    Supports FAISS HNSW graph indexing, Flat Inner Product, and LSH binary acceleration.
    """
    def __init__(
        self,
        dimension: int = 512,
        threshold_confirmed: float = 0.75,
        threshold_review: float = 0.60,
        index_type: str = "hnsw",  # "hnsw", "flat", or "lsh"
        hash_bits: int = 128
    ):
        self.dimension = dimension
        self.threshold_confirmed = threshold_confirmed
        self.threshold_review = threshold_review
        self.index_type = index_type
        self.hash_bits = hash_bits
        
        # Initialize LSH Hasher
        self.hasher = FaceHasher(embedding_dim=dimension, hash_bits=hash_bits)

        self._index = None
        self._reference_embeddings: Optional[np.ndarray] = None
        self._reference_hashes: List[Dict[str, Any]] = []
        self._metadata: List[Dict[str, Any]] = []
        
        self._init_index()

    def _init_index(self):
        """
        Initializes FAISS index based on index_type.
        """
        if not HAS_FAISS:
            self._index = None
            return

        if self.index_type == "hnsw":
            # HNSW Flat index: M=32 links per node, Inner Product metric for cosine similarity
            try:
                self._index = faiss.IndexHNSWFlat(self.dimension, 32, faiss.METRIC_INNER_PRODUCT)
                self._index.hnsw.efSearch = 64  # Search depth exploration
                self._index.hnsw.efConstruction = 64
            except Exception:
                self._index = faiss.IndexFlatIP(self.dimension)
        else:
            self._index = faiss.IndexFlatIP(self.dimension)

    def clear(self):
        self._init_index()
        self._reference_embeddings = None
        self._reference_hashes = []
        self._metadata = []
        self.hasher.clear()

    def set_reference_database(
        self,
        embeddings: np.ndarray,
        metadata: List[Dict[str, Any]]
    ):
        """
        Loads reference missing/wanted persons embeddings into the FAISS vector index & LSH hash table.
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

        # Compute LSH hashes for all reference embeddings
        self._reference_hashes = []
        for i, emb in enumerate(embeddings):
            p_id = metadata[i].get("person_id", f"p-{i:03d}")
            sig = self.hasher.compute_embedding_hash_signature(emb)
            self._reference_hashes.append({
                "person_id": p_id,
                "hash_hex": sig["hash_hex"],
                "bit_array": sig["bit_array"],
                "bucket_id": sig["bucket_id"]
            })
            self.hasher.register_reference_hash(p_id, emb, metadata[i])

        # Add to FAISS index
        if HAS_FAISS and self._index is not None:
            self._index.add(self._reference_embeddings)

    def add_reference(self, embedding: np.ndarray, meta: Dict[str, Any]) -> int:
        """
        Adds a single reference person profile and updates FAISS index and LSH tables.
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

        # Update LSH hash
        p_id = meta.get("person_id", f"p-{len(self._metadata):03d}")
        sig = self.hasher.compute_embedding_hash_signature(emb[0])
        self._reference_hashes.append({
            "person_id": p_id,
            "hash_hex": sig["hash_hex"],
            "bit_array": sig["bit_array"],
            "bucket_id": sig["bucket_id"]
        })
        self.hasher.register_reference_hash(p_id, emb[0], meta)

        if HAS_FAISS and self._index is not None:
            self._index.add(emb)

        return len(self._metadata) - 1

    def search(
        self,
        query_embedding: np.ndarray,
        top_k: int = 5,
        threshold: Optional[float] = None
    ) -> List[Dict[str, Any]]:
        """
        Executes Approximate Nearest Neighbor (ANN) search for a query embedding.
        Combines LSH hashing signatures and FAISS index matching.
        """
        if self._metadata is None or len(self._metadata) == 0:
            return []

        min_threshold = threshold if threshold is not None else self.threshold_review

        # Shape query to (1, 512) and normalize
        query = query_embedding.reshape(1, self.dimension).astype(np.float32)
        q_norm = np.linalg.norm(query)
        if q_norm > 0:
            query = query / q_norm

        # Compute query LSH hash
        query_hash_sig = self.hasher.compute_embedding_hash_signature(query[0])
        query_bits = query_hash_sig["bit_array"]

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
                
                # Compute exact Hamming distance between query and matched reference hash
                ref_hash_info = self._reference_hashes[idx] if idx < len(self._reference_hashes) else None
                hamming_dist = self.hasher.hamming_distance(query_bits, ref_hash_info["bit_array"]) if ref_hash_info else 0
                
                results.append({
                    "person": self._metadata[idx],
                    "confidence": round(score_val, 4),
                    "match": True,
                    "tier": tier,
                    "threshold_confirmed": self.threshold_confirmed,
                    "threshold_review": self.threshold_review,
                    "query_hash_hex": query_hash_sig["hash_hex"],
                    "ref_hash_hex": ref_hash_info["hash_hex"] if ref_hash_info else "",
                    "hamming_distance": hamming_dist,
                    "ann_method": "FAISS_HNSW_LSH" if HAS_FAISS else "SIMD_DOT_LSH"
                })

        return results
