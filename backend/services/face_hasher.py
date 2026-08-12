"""
Locality-Sensitive Hashing (LSH) & Binary Quantization Engine
Optimizes 512-D ArcFace float32 vector comparisons using compact binary hash codes:
1. Random Hyperplane Projection LSH: projects 512-D vectors to B-bit binary codes: h(v) = sign(W * v).
2. Hamming Distance Popcount: evaluates bitwise XOR in O(1) CPU instructions for ultra-fast candidate filtering.
3. Perceptual Image Hash (dHash/pHash): instant visual deduplication of raw face crops.
4. Fast Inverted Index & Hash Bucket Caching: eliminates redundant deep neural network inferences.
"""

import hashlib
import numpy as np
import cv2
from typing import List, Dict, Any, Tuple, Optional, Set


class FaceHasher:
    """
    High-Performance Locality-Sensitive Hashing (LSH) and Quantization Engine.
    Transforms 512-D continuous unit-sphere embeddings into compact binary hash signatures.
    """
    def __init__(self, embedding_dim: int = 512, hash_bits: int = 128, seed: int = 42):
        self.embedding_dim = embedding_dim
        self.hash_bits = hash_bits
        self.seed = seed

        # Generate Gaussian random hyperplanes for LSH projection: shape (hash_bits, embedding_dim)
        rng = np.random.RandomState(seed)
        gaussian_matrix = rng.randn(hash_bits, embedding_dim).astype(np.float32)
        # Unit-normalize projection rows
        norms = np.linalg.norm(gaussian_matrix, axis=1, keepdims=True)
        norms = np.maximum(norms, 1e-12)
        self.projection_matrix = np.ascontiguousarray((gaussian_matrix / norms).astype(np.float32))

        # Inverted index hash buckets for O(1) candidate lookup
        self.hash_buckets: Dict[str, List[Dict[str, Any]]] = {}
        # Perceptual crop hash cache
        self.crop_hash_cache: Dict[str, Dict[str, Any]] = {}

    def compute_lsh_hash(self, embedding: np.ndarray) -> np.ndarray:
        """
        Computes boolean bitvector of length `hash_bits` via random hyperplane projection:
        bit_i = (W_i . v) >= 0
        """
        emb = embedding.flatten().astype(np.float32)
        # Projection dot product: (hash_bits,)
        projections = np.dot(self.projection_matrix, emb)
        return (projections >= 0.0)

    def hash_to_hex(self, bit_array: np.ndarray) -> str:
        """
        Packs a boolean numpy bit array into a hexadecimal string.
        """
        packed = np.packbits(bit_array)
        return packed.tobytes().hex()

    def hex_to_bits(self, hex_str: str) -> np.ndarray:
        """
        Unpacks a hexadecimal string into a boolean bit array.
        """
        raw_bytes = bytes.fromhex(hex_str)
        unpacked = np.unpackbits(np.frombuffer(raw_bytes, dtype=np.uint8))
        return unpacked[:self.hash_bits].astype(bool)

    def compute_embedding_hash_signature(self, embedding: np.ndarray) -> Dict[str, Any]:
        """
        Generates full hashing metadata for a 512-D ArcFace embedding vector.
        """
        bits = self.compute_lsh_hash(embedding)
        hex_str = self.hash_to_hex(bits)
        bucket_key = hex_str[:4]  # First 16 bits as index bucket

        return {
            "hash_hex": hex_str,
            "hash_bits_count": self.hash_bits,
            "bucket_id": bucket_key,
            "bit_array": bits,
            "binary_preview": "".join(["1" if b else "0" for b in bits[:32]]) + "..."
        }

    def compute_image_phash(self, face_crop: np.ndarray, hash_size: int = 8) -> str:
        """
        Computes 64-bit difference hash (dHash) on raw face crops for instant visual deduplication.
        Runs in < 0.1ms without touching deep neural networks.
        """
        if face_crop is None or face_crop.size == 0:
            return "0000000000000000"

        resized = cv2.resize(face_crop, (hash_size + 1, hash_size), interpolation=cv2.INTER_AREA)
        if len(resized.shape) == 3:
            gray = cv2.cvtColor(resized, cv2.COLOR_BGR2GRAY)
        else:
            gray = resized

        diff = gray[:, 1:] > gray[:, :-1]
        packed = np.packbits(diff.flatten())
        return packed.tobytes().hex()

    def hamming_distance(self, bits1: np.ndarray, bits2: np.ndarray) -> int:
        """
        Calculates Hamming distance between two bit arrays (count of differing bits).
        """
        return int(np.count_nonzero(bits1 != bits2))

    def hamming_distance_hex(self, hex1: str, hex2: str) -> int:
        """
        Computes bitwise Hamming distance between two hex-encoded hashes using native bit XOR.
        """
        val1 = int(hex1, 16)
        val2 = int(hex2, 16)
        xor_val = val1 ^ val2
        return bin(xor_val).count("1")

    def approximate_cosine_similarity(self, hamming_dist: int) -> float:
        """
        Approximates cosine similarity from LSH Hamming distance using the hyperplane angle formula:
        sim = cos( (hamming_dist / total_bits) * pi )
        """
        angle = (float(hamming_dist) / float(self.hash_bits)) * np.pi
        return float(np.cos(angle))

    def register_reference_hash(self, person_id: str, embedding: np.ndarray, metadata: Dict[str, Any]):
        """
        Indexes a reference person into the LSH hash bucket table.
        """
        sig = self.compute_embedding_hash_signature(embedding)
        bucket_id = sig["bucket_id"]
        
        record = {
            "person_id": person_id,
            "hash_hex": sig["hash_hex"],
            "bit_array": sig["bit_array"],
            "metadata": metadata
        }

        if bucket_id not in self.hash_buckets:
            self.hash_buckets[bucket_id] = []
        self.hash_buckets[bucket_id].append(record)

    def fast_lsh_prefilter(
        self,
        query_embedding: np.ndarray,
        reference_hashes: List[Dict[str, Any]],
        max_hamming_dist: int = 35
    ) -> List[Tuple[int, int, float]]:
        """
        High-speed LSH candidate pre-filter.
        Given N reference profiles, quickly calculates Hamming distance across all candidates.
        Returns: list of (reference_index, hamming_distance, approx_similarity)
        """
        query_bits = self.compute_lsh_hash(query_embedding)
        candidates = []

        for idx, ref in enumerate(reference_hashes):
            ref_bits = ref["bit_array"]
            h_dist = self.hamming_distance(query_bits, ref_bits)
            if h_dist <= max_hamming_dist:
                approx_sim = self.approximate_cosine_similarity(h_dist)
                candidates.append((idx, h_dist, approx_sim))

        candidates.sort(key=lambda x: x[1])
        return candidates

    def clear(self):
        self.hash_buckets.clear()
        self.crop_hash_cache.clear()
