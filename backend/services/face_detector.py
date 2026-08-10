"""
Face Detection & Alignment Service — Real InsightFace Implementation
Uses RetinaFace-MobileNet-0.25 via insightface for production-grade face detection
with real 5-point facial landmarks and affine alignment to ArcFace 112x112 space.

Falls back to OpenCV Haar Cascade if insightface is not available.
"""

import cv2
import numpy as np
from typing import List, Dict, Any, Tuple, Optional
import os

# ─── InsightFace Backend ─────────────────────────────────────────────────────

try:
    from insightface.app import FaceAnalysis
    HAS_INSIGHTFACE = True
except ImportError:
    HAS_INSIGHTFACE = False

# Standard ArcFace 112x112 5-point reference coordinates (MS1MV3/InsightFace convention)
ARCFACE_REFERENCE_LANDMARKS_112 = np.array([
    [38.2946, 51.6963],   # Left eye
    [73.5318, 51.5014],   # Right eye
    [56.0252, 71.7366],   # Nose
    [41.5493, 92.3655],   # Left mouth corner
    [70.7299, 92.2041]    # Right mouth corner
], dtype=np.float32)


def align_face_5point(
    image: np.ndarray,
    landmarks: np.ndarray,
    output_size: Tuple[int, int] = (112, 112)
) -> np.ndarray:
    """
    Performs standard similarity transform alignment from 5 facial landmarks
    to the canonical 112x112 ArcFace reference coordinate space.
    """
    src_pts = landmarks.astype(np.float32)
    dst_pts = ARCFACE_REFERENCE_LANDMARKS_112.copy()

    if output_size != (112, 112):
        sx = output_size[0] / 112.0
        sy = output_size[1] / 112.0
        dst_pts[:, 0] *= sx
        dst_pts[:, 1] *= sy

    transform_matrix, _ = cv2.estimateAffinePartial2D(src_pts, dst_pts, method=cv2.LMEDS)
    if transform_matrix is None:
        return cv2.resize(image, output_size)

    aligned = cv2.warpAffine(image, transform_matrix, output_size, borderValue=0.0)
    return aligned


class FaceDetector:
    """
    Production Face Detector
    - Primary: InsightFace RetinaFace-MobileNet-0.25 (buffalo_s) with real landmarks
    - Fallback: OpenCV Haar Cascade with estimated landmarks
    """
    def __init__(self, det_thresh: float = 0.35, det_size: Tuple[int, int] = (640, 640)):
        self.det_thresh = det_thresh
        self.det_size = det_size
        self._app = None
        self._cascade = None
        self._backend = "none"
        self._init_backend()

    def _init_backend(self):
        """
        Initializes the best available detection backend.
        Priority: InsightFace > OpenCV Haar Cascade
        """
        if HAS_INSIGHTFACE:
            try:
                self._app = FaceAnalysis(
                    name="buffalo_s",
                    # Only load detection model, not recognition
                    # (we handle recognition separately in face_embedder.py)
                    allowed_modules=["detection"],
                    providers=["CPUExecutionProvider"]
                )
                self._app.prepare(ctx_id=-1, det_size=self.det_size, det_thresh=self.det_thresh)
                self._backend = "insightface"
                print(f"[FaceDetector] Initialized InsightFace RetinaFace (det_thresh={self.det_thresh})")
                return
            except Exception as e:
                print(f"[FaceDetector] InsightFace init failed: {e}, falling back to OpenCV")

        # Fallback: OpenCV Haar Cascade
        try:
            cascade_path = cv2.data.haarcascades + 'haarcascade_frontalface_default.xml'
            self._cascade = cv2.CascadeClassifier(cascade_path)
            self._backend = "opencv_cascade"
            print("[FaceDetector] Initialized OpenCV Haar Cascade (fallback mode)")
        except Exception:
            self._backend = "none"
            print("[FaceDetector] WARNING: No face detection backend available")

    @property
    def backend_name(self) -> str:
        return self._backend

    def estimate_landmarks(self, bbox: List[float]) -> np.ndarray:
        """
        Estimates 5 canonical facial landmark points from a bounding box
        using anthropometric proportions.
        Only used in fallback mode (Haar cascade).
        """
        x1, y1, x2, y2 = bbox
        w = x2 - x1
        h = y2 - y1

        left_eye = [x1 + 0.35 * w, y1 + 0.38 * h]
        right_eye = [x1 + 0.65 * w, y1 + 0.38 * h]
        nose = [x1 + 0.50 * w, y1 + 0.55 * h]
        left_mouth = [x1 + 0.38 * w, y1 + 0.75 * h]
        right_mouth = [x1 + 0.62 * w, y1 + 0.75 * h]

        return np.array([left_eye, right_eye, nose, left_mouth, right_mouth], dtype=np.float32)

    def detect(self, frame: np.ndarray) -> List[Dict[str, Any]]:
        """
        Detects faces in a BGR image frame.
        Returns a list of dicts:
        [
            {
                "bbox": [x1, y1, x2, y2],
                "score": float,          # Real detection confidence
                "kps": np.ndarray (5, 2), # 5-point facial landmarks
                "aligned_crop": np.ndarray (112, 112, 3),
                "raw_crop": np.ndarray
            }, ...
        ]
        """
        if frame is None or frame.size == 0:
            return []

        if self._backend == "insightface":
            return self._detect_insightface(frame)
        elif self._backend == "opencv_cascade":
            return self._detect_cascade(frame)
        else:
            return []

    def _detect_insightface(self, frame: np.ndarray) -> List[Dict[str, Any]]:
        """
        Real InsightFace RetinaFace detection with true landmarks and scores.
        """
        faces = self._app.get(frame)
        h, w = frame.shape[:2]

        detections = []
        for face in faces:
            bbox = face.bbox.tolist()  # [x1, y1, x2, y2] float
            score = float(face.det_score)
            kps = face.kps  # (5, 2) np.ndarray — real 5-point landmarks

            # Clamp bbox to frame
            x1 = max(0, int(bbox[0]))
            y1 = max(0, int(bbox[1]))
            x2 = min(w, int(bbox[2]))
            y2 = min(h, int(bbox[3]))

            raw_crop = frame[y1:y2, x1:x2]
            if raw_crop.size == 0:
                raw_crop = np.zeros((112, 112, 3), dtype=np.uint8)

            # Align using real landmarks
            aligned_crop = align_face_5point(frame, kps, output_size=(112, 112))

            detections.append({
                "bbox": [float(x1), float(y1), float(x2), float(y2)],
                "score": score,
                "kps": kps,
                "aligned_crop": aligned_crop,
                "raw_crop": raw_crop
            })

        return detections

    def _detect_cascade(self, frame: np.ndarray) -> List[Dict[str, Any]]:
        """
        Fallback OpenCV Haar Cascade detection with estimated landmarks.
        """
        h, w = frame.shape[:2]
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY) if len(frame.shape) == 3 else frame

        detections = []
        if self._cascade is not None:
            faces = self._cascade.detectMultiScale(
                gray, scaleFactor=1.1, minNeighbors=4, minSize=(30, 30)
            )
            for (x, y, fw, fh) in faces:
                bbox = [float(x), float(y), float(x + fw), float(y + fh)]
                score = 0.88  # Hardcoded — cascade doesn't produce calibrated confidence
                kps = self.estimate_landmarks(bbox)

                x1, y1, x2, y2 = int(x), int(y), int(x + fw), int(y + fh)
                raw_crop = frame[max(0, y1):min(h, y2), max(0, x1):min(w, x2)]
                aligned_crop = align_face_5point(frame, kps, output_size=(112, 112))

                detections.append({
                    "bbox": bbox,
                    "score": score,
                    "kps": kps,
                    "aligned_crop": aligned_crop,
                    "raw_crop": raw_crop
                })

        return detections
