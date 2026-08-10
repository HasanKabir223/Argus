"""
Face Embedding Generation Service — InsightFace ArcFace + LSH Hashing Integration
Generates 512-dimensional L2-normalized feature vectors using the ArcFace recognition
model (w600k_mbf) from the insightface buffalo_s model pack.

Integrates Locality Sensitive Hashing (LSH) for binary quantization, perceptual hash caching,
and rapid vector hashing.
"""

import cv2
import numpy as np
from typing import List, Optional, Dict, Any
import hashlib

# ─── InsightFace Backend ─────────────────────────────────────────────────────

try:
    from insightface.app import FaceAnalysis
    HAS_INSIGHTFACE = True
except ImportError:
    HAS_INSIGHTFACE = False

from backend.services.face_hasher import FaceHasher


class ArcFaceEmbedder:
    """
    ArcFace 512-D Deep Feature Extractor & Hashing Engine.
    Produces L2-normalized vectors (unit sphere) where cosine similarity == inner product.
    Optimized with LSH hashing and perceptual crop deduplication.
    """
    def __init__(self, embedding_dim: int = 512, model_name: str = "buffalo_s", hash_bits: int = 128):
        self.embedding_dim = embedding_dim
        self.model_name = model_name
        self.hasher = FaceHasher(embedding_dim=embedding_dim, hash_bits=hash_bits)
        self._app = None
        self._backend = "fallback"
        self._init_model()

    def _init_model(self):
        """
        Initializes the ArcFace recognition model via InsightFace.
        """
        if HAS_INSIGHTFACE:
            try:
                self._app = FaceAnalysis(
                    name=self.model_name,
                    allowed_modules=["recognition", "detection"],
                    providers=["CPUExecutionProvider"]
                )
                self._app.prepare(ctx_id=-1, det_size=(640, 640))
                self._backend = "insightface"
                print(f"[ArcFaceEmbedder] Initialized InsightFace ArcFace recognition model")
            except Exception as e:
                print(f"[ArcFaceEmbedder] InsightFace init failed: {e}, using fallback")
                self._backend = "fallback"
        else:
            print("[ArcFaceEmbedder] insightface not installed, using fallback embedder")
            self._backend = "fallback"

    @property
    def backend_name(self) -> str:
        return self._backend

    def _normalize(self, vector: np.ndarray) -> np.ndarray:
        """L2 normalizes feature vector: v = v / ||v||_2"""
        norm = np.linalg.norm(vector, ord=2, axis=-1, keepdims=True)
        norm = np.maximum(norm, 1e-12)
        return vector / norm

    def get_embedding(self, face_crop: np.ndarray) -> np.ndarray:
        """
        Extracts a single 512-D L2-normalized embedding from a face image.
        """
        if face_crop is None or face_crop.size == 0:
            return np.zeros(self.embedding_dim, dtype=np.float32)

        if self._backend == "insightface":
            return self._embed_insightface(face_crop)
        else:
            return self._embed_fallback(face_crop)

    def _embed_insightface(self, face_crop: np.ndarray) -> np.ndarray:
        """
        ArcFace embedding via InsightFace.
        """
        if face_crop.shape[0] < 50 or face_crop.shape[1] < 50:
            scale = max(112 / face_crop.shape[0], 112 / face_crop.shape[1], 1.0)
            face_crop = cv2.resize(face_crop, None, fx=scale, fy=scale, interpolation=cv2.INTER_LINEAR)

        h, w = face_crop.shape[:2]
        pad = max(int(h * 0.15), int(w * 0.15), 20)
        padded = cv2.copyMakeBorder(face_crop, pad, pad, pad, pad, cv2.BORDER_CONSTANT, value=(0, 0, 0))

        faces = self._app.get(padded)

        if faces and len(faces) > 0:
            best_face = max(faces, key=lambda f: f.det_score)
            embedding = best_face.embedding
            if embedding is not None and len(embedding) == self.embedding_dim:
                return self._normalize(embedding.astype(np.float32))

        return self._embed_fallback(face_crop)

    def _embed_fallback(self, face_crop: np.ndarray) -> np.ndarray:
        """
        Fallback hand-crafted embedding using DCT, spatial, and edge features.
        """
        resized = cv2.resize(face_crop, (112, 112))
        if len(resized.shape) == 2:
            resized = cv2.cvtColor(resized, cv2.COLOR_GRAY2RGB)
        elif resized.shape[2] == 4:
            resized = cv2.cvtColor(resized, cv2.COLOR_BGRA2RGB)
        else:
            resized = cv2.cvtColor(resized, cv2.COLOR_BGR2RGB)

        gray = cv2.cvtColor(resized, cv2.COLOR_RGB2GRAY)

        spatial_features = cv2.resize(gray, (16, 16)).flatten().astype(np.float32) / 255.0

        dct = cv2.dct(gray.astype(np.float32))
        dct_features = dct[:16, :16].flatten() / 1000.0

        mean_c, std_c = cv2.meanStdDev(resized)
        color_features = np.concatenate([mean_c.flatten(), std_c.flatten()]).astype(np.float32) / 255.0

        gx = cv2.Sobel(gray, cv2.CV_32F, 1, 0, ksize=3)
        gy = cv2.Sobel(gray, cv2.CV_32F, 0, 1, ksize=3)
        edge_mag = cv2.magnitude(gx, gy)
        edge_features = cv2.resize(edge_mag, (16, 16)).flatten() / 500.0

        raw_concat = np.concatenate([spatial_features, dct_features, color_features, edge_features])

        if len(raw_concat) < self.embedding_dim:
            padded = np.zeros(self.embedding_dim, dtype=np.float32)
            padded[:len(raw_concat)] = raw_concat
            embedding = padded
        else:
            embedding = raw_concat[:self.embedding_dim]

        seed_val = int(hashlib.md5(spatial_features[:10].tobytes()).hexdigest()[:8], 16)
        rng = np.random.RandomState(seed_val % 1000000)
        latent_basis = rng.randn(self.embedding_dim).astype(np.float32) * 0.1
        embedding = embedding + latent_basis

        return self._normalize(embedding.astype(np.float32))

    def get_embedding_from_aligned(self, aligned_crop_112: np.ndarray) -> np.ndarray:
        """
        Extracts embedding from a pre-aligned 112x112 face crop.
        """
        if aligned_crop_112 is None or aligned_crop_112.size == 0:
            return np.zeros(self.embedding_dim, dtype=np.float32)

        if self._backend == "insightface" and self._app is not None:
            try:
                rec_model = None
                for model in self._app.models.values():
                    if hasattr(model, 'taskname') and model.taskname == 'recognition':
                        rec_model = model
                        break

                if rec_model is not None:
                    img = aligned_crop_112.copy()
                    if img.shape != (112, 112, 3):
                        img = cv2.resize(img, (112, 112))

                    embedding = rec_model.get_feat(img)
                    if embedding is not None:
                        emb = embedding.flatten().astype(np.float32)
                        if len(emb) == self.embedding_dim:
                            return self._normalize(emb)
            except Exception:
                pass

        return self.get_embedding(aligned_crop_112)

    def get_embeddings_batch(self, face_crops: List[np.ndarray]) -> np.ndarray:
        """
        Performs batch feature extraction across multiple face crops.
        """
        if not face_crops:
            return np.empty((0, self.embedding_dim), dtype=np.float32)

        embeddings = []
        for crop in face_crops:
            if crop is not None and crop.shape == (112, 112, 3):
                embeddings.append(self.get_embedding_from_aligned(crop))
            else:
                embeddings.append(self.get_embedding(crop))

        return np.vstack(embeddings).astype(np.float32)

    def get_embedding_with_hash(self, face_crop: np.ndarray) -> Dict[str, Any]:
        """
        Computes 512-D embedding together with its LSH binary hash signature.
        """
        emb = self.get_embedding(face_crop)
        hash_sig = self.hasher.compute_embedding_hash_signature(emb)
        return {
            "embedding": emb,
            "hash_sig": hash_sig
        }
