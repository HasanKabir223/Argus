"""
Face Embedding Generation Service — ArcFace 512-D via insightface buffalo_s
Uses insightface 1.0+ (pure Python, no C++ compiler required).
Model: w600k_mbf.onnx (MobileFaceNet trained with ArcFace loss on WebFace600K)
Produces 512-D L2-normalized embeddings; cosine similarity == inner dot product.
"""

import cv2
import numpy as np
import os
from typing import List, Optional, Dict, Any

try:
    from insightface.model_zoo import get_model as insightface_get_model
    HAS_INSIGHTFACE = True
except ImportError:
    HAS_INSIGHTFACE = False


class ArcFaceDeepEmbedder:
    """
    512-D ArcFace Feature Extractor via insightface buffalo_s.
    Uses the w600k_mbf.onnx recognition model (MobileFaceNet + ArcFace loss).
    Produces L2-normalized unit-sphere embeddings where cosine similarity
    equals inner dot product — compatible with FAISS IndexFlatIP / HNSW.
    """
    def __init__(
        self,
        embedding_dim: int = 512,
        model_name: str = "buffalo_s",
        hash_bits: int = 64
    ):
        self.embedding_dim = 512            # ArcFace always 512-D
        self.model_name = model_name
        self._recognizer = None
        self._backend = "arcface_512d_fallback"

        self._init_model()

    def _init_model(self):
        if not HAS_INSIGHTFACE:
            print("[ArcFaceEmbedder] insightface not installed. Using fallback.")
            return

        # Model is auto-downloaded by insightface on first FaceAnalysis.prepare() call.
        # We load the recognition ONNX directly via model_zoo to avoid needing
        # the detection module alongside it.
        model_path = os.path.join(
            os.path.expanduser("~"), ".insightface", "models",
            "buffalo_s", "w600k_mbf.onnx"
        )

        # Trigger auto-download if not present
        if not os.path.isfile(model_path):
            try:
                from insightface.app import FaceAnalysis
                _app = FaceAnalysis(name="buffalo_s", providers=["CPUExecutionProvider"])
                _app.prepare(ctx_id=0)
                print("[ArcFaceEmbedder] Downloaded buffalo_s models.")
            except Exception:
                pass

        if not os.path.isfile(model_path):
            print(f"[ArcFaceEmbedder] w600k_mbf.onnx not found at {model_path}. Using fallback.")
            return

        try:
            self._recognizer = insightface_get_model(
                model_path,
                providers=["CPUExecutionProvider"]
            )
            self._recognizer.prepare(ctx_id=0)
            self._backend = "arcface_512d (buffalo_s/w600k_mbf)"
            print(f"[ArcFaceEmbedder] Loaded ArcFace 512-D (ArcFaceONNX) from {model_path}")
        except Exception as e:
            print(f"[ArcFaceEmbedder] Failed to load ArcFace: {e}. Using fallback.")
            self._recognizer = None

    @property
    def backend_name(self) -> str:
        return self._backend

    def _normalize(self, vector: np.ndarray) -> np.ndarray:
        """L2 normalize: v = v / ||v||_2"""
        norm = np.linalg.norm(vector, ord=2, axis=-1, keepdims=True)
        norm = np.maximum(norm, 1e-12)
        return vector / norm

    def get_embedding(self, face_crop: np.ndarray) -> np.ndarray:
        """
        Extracts a 512-D L2-normalized ArcFace embedding from a face image.
        Accepts any BGR image — resizes to 112x112 internally if needed.
        Called by gallery_manager and cctv_service with pre-aligned crops.
        """
        if face_crop is None or (isinstance(face_crop, np.ndarray) and face_crop.size == 0):
            return np.zeros(self.embedding_dim, dtype=np.float32)

        if self._recognizer is not None:
            return self._embed_arcface(face_crop)
        return self._embed_fallback(face_crop)

    def _embed_arcface(self, face_crop: np.ndarray) -> np.ndarray:
        """
        Runs ArcFace recognition model on a pre-aligned face crop.
        The insightface buffalo_s recognizer expects 112x112 BGR input.
        get_feat() returns an already L2-normalized 512-D feature vector.
        """
        try:
            img = face_crop.copy()

            # Ensure correct size
            if img.shape[:2] != (112, 112):
                img = cv2.resize(img, (112, 112))

            # Ensure 3-channel BGR
            if len(img.shape) == 2:
                img = cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)
            elif img.shape[2] == 4:
                img = cv2.cvtColor(img, cv2.COLOR_BGRA2BGR)

            # get_feat() returns (1, 512) — flatten and L2 normalize
            feat = self._recognizer.get_feat(img)
            if feat.ndim > 1:
                feat = feat[0]
            feat = feat.astype(np.float32)
            return self._normalize(feat)   # normalize: get_feat output is NOT pre-normalized

        except Exception as e:
            print(f"[ArcFaceEmbedder] _embed_arcface error: {e}")
            return self._embed_fallback(face_crop)

    def _embed_fallback(self, face_crop: np.ndarray) -> np.ndarray:
        """Gradient+DCT fallback — used only when ArcFace model is unavailable."""
        try:
            resized = cv2.resize(face_crop, (112, 112))
            gray = cv2.cvtColor(resized, cv2.COLOR_BGR2GRAY) if len(resized.shape) == 3 else resized
            gray_f = (gray.astype(np.float32) - np.mean(gray)) / (np.std(gray) + 1e-6)

            # 512-D: DCT (64) + gradient patches (448)
            dct = cv2.dct(cv2.resize(gray_f, (32, 32)))
            dct_feat = dct[:8, :8].flatten()   # 64 values

            gx = cv2.Sobel(gray_f, cv2.CV_32F, 1, 0, ksize=3)
            gy = cv2.Sobel(gray_f, cv2.CV_32F, 0, 1, ksize=3)
            gx_patches = cv2.resize(gx, (16, 14)).flatten()    # 224
            gy_patches = cv2.resize(gy, (16, 14)).flatten()    # 224

            raw = np.concatenate([dct_feat, gx_patches, gy_patches]).astype(np.float32)
            raw = raw - np.mean(raw)

            if len(raw) < self.embedding_dim:
                padded = np.zeros(self.embedding_dim, dtype=np.float32)
                padded[:len(raw)] = raw
                return self._normalize(padded)
            return self._normalize(raw[:self.embedding_dim])
        except Exception:
            return np.zeros(self.embedding_dim, dtype=np.float32)

    def get_embedding_from_aligned(self, aligned_crop_112: np.ndarray) -> np.ndarray:
        return self.get_embedding(aligned_crop_112)

    def get_embeddings_batch(self, face_crops: List[np.ndarray]) -> np.ndarray:
        if not face_crops:
            return np.empty((0, self.embedding_dim), dtype=np.float32)
        embeddings = [self.get_embedding(crop) for crop in face_crops if crop is not None]
        if not embeddings:
            return np.empty((0, self.embedding_dim), dtype=np.float32)
        return np.vstack(embeddings).astype(np.float32)

    def get_embedding_with_hash(self, face_crop: np.ndarray) -> Dict[str, Any]:
        emb = self.get_embedding(face_crop)
        return {
            "embedding": emb,
            "hash_sig": {"hash_hex": "", "bit_array": []}
        }


# Aliases — nothing else in the codebase needs to change
ArcFaceEmbedder = ArcFaceDeepEmbedder
FaceEmbedder = ArcFaceDeepEmbedder
MobileNetV3FaceEmbedder = ArcFaceDeepEmbedder
