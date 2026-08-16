"""
Face Detection & Alignment Service — OpenCV YuNet Implementation
Uses OpenCV YuNet (ONNX) for ultra-fast, lightweight face detection with
exact 5-point facial landmarks and canonical 112x112 affine alignment.
"""

import os
import cv2
import numpy as np
from typing import List, Dict, Any, Tuple, Optional


# Standard ArcFace 112x112 5-point reference coordinates (InsightFace convention)
ARCFACE_REFERENCE_LANDMARKS_112 = np.array([
    [38.2946, 51.6963],   # Left eye / Right eye depending on orientation
    [73.5318, 51.5014],   # Right eye / Left eye
    [56.0252, 71.7366],   # Nose tip
    [41.5493, 92.3655],   # Left mouth corner
    [70.7299, 92.2041]    # Right mouth corner
], dtype=np.float32)


def align_face_5point(
    image: np.ndarray,
    landmarks: np.ndarray,
    output_size: Tuple[int, int] = (112, 112)
) -> np.ndarray:
    """
    Performs canonical similarity transform alignment from 5 facial landmarks
    to standard ArcFace 112x112 coordinate space using InsightFace norm_crop
    or OpenCV partial affine transform.
    """
    try:
        from insightface.utils import face_align
        aligned = face_align.norm_crop(image, landmarks, image_size=output_size[0])
        if aligned is not None and aligned.size > 0:
            return aligned
    except Exception:
        pass

    try:
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
    except Exception:
        return cv2.resize(image, output_size)


class FaceDetector:
    """
    Production Face Detector using OpenCV YuNet with Adaptive Multi-Scale Inference
    - Primary: OpenCV YuNet (cv2.FaceDetectorYN) with adaptive scaling & 5-point landmarks
    - Fallback 1: CLAHE Contrast Enhanced YuNet
    - Fallback 2: OpenCV Haar Cascade with landmark estimation
    """
    def __init__(self, det_thresh: float = 0.20, det_size: Tuple[int, int] = (640, 480)):
        self.det_thresh = det_thresh
        self.det_size = det_size
        self._detector: Optional[cv2.FaceDetectorYN] = None
        self._cascade = None
        self._backend = "none"
        self._init_backend()

    def _init_backend(self):
        """
        Initializes the OpenCV YuNet face detector and Haar cascade fallback.
        """
        candidate_paths = [
            os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "models", "yunet.onnx")),
            os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "argus", "models", "yunet.onnx")),
            os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "models", "yunet.onnx")),
            "backend/models/yunet.onnx",
            "argus/models/yunet.onnx"
        ]

        model_path = None
        for p in candidate_paths:
            if os.path.isfile(p):
                model_path = p
                break

        if model_path is not None:
            try:
                self._detector = cv2.FaceDetectorYN.create(
                    model=model_path,
                    config="",
                    input_size=self.det_size,
                    score_threshold=self.det_thresh,
                    nms_threshold=0.3,
                    top_k=5000
                )
                self._backend = "yunet"
                print(f"[FaceDetector] Initialized OpenCV YuNet (det_thresh={self.det_thresh}) from {model_path}")
            except Exception as e:
                print(f"[FaceDetector] YuNet init error: {e}, falling back to Haar Cascade")

        # Always initialize Haar Cascade as secondary fallback
        try:
            cascade_path = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
            self._cascade = cv2.CascadeClassifier(cascade_path)
            if self._backend == "none":
                self._backend = "opencv_cascade"
            print("[FaceDetector] Initialized OpenCV Haar Cascade fallback engine")
        except Exception as e:
            print(f"[FaceDetector] Haar Cascade initialization warning: {e}")

    def estimate_landmarks(self, bbox: List[float]) -> np.ndarray:
        """
        Estimates standard 5-point landmarks from a bounding box [x1, y1, x2, y2].
        Used when raw landmarks are unavailable.
        """
        x1, y1, x2, y2 = bbox
        w = x2 - x1
        h = y2 - y1

        return np.array([
            [x1 + 0.30 * w, y1 + 0.38 * h],   # Left eye
            [x1 + 0.70 * w, y1 + 0.38 * h],   # Right eye
            [x1 + 0.50 * w, y1 + 0.60 * h],   # Nose tip
            [x1 + 0.35 * w, y1 + 0.80 * h],   # Left mouth corner
            [x1 + 0.65 * w, y1 + 0.80 * h]    # Right mouth corner
        ], dtype=np.float32)

    def detect(self, frame: np.ndarray) -> List[Dict[str, Any]]:
        """
        Detects all faces in a BGR frame using Adaptive Multi-Scale OpenCV YuNet.

        Returns list of detection dictionaries:
        - "bbox": [x1, y1, x2, y2] in original frame coordinates
        - "score": confidence score (float 0..1)
        - "kps": 5-point landmarks array shape (5, 2) in original frame coordinates
        - "aligned_crop": 112x112 aligned face crop for ArcFace
        - "raw_crop": bounding box face crop
        - "expanded_crop": 20% padded bounding box face crop
        """
        if frame is None or frame.size == 0:
            return []

        # 1. Primary: Adaptive Multi-Scale YuNet Detection
        if self._backend in ("yunet", "opencv_cascade") and self._detector is not None:
            dets = self._detect_yunet_multiscale(frame)
            if dets:
                return dets

            # Fallback 1.1: CLAHE Contrast Enhanced YuNet
            clahe_frame = self._apply_clahe(frame)
            dets = self._detect_yunet_multiscale(clahe_frame, orig_frame=frame)
            if dets:
                return dets

        # Fallback 2: OpenCV Haar Cascade
        if self._cascade is not None:
            return self._detect_cascade(frame)

        return []

    def _apply_clahe(self, frame: np.ndarray) -> np.ndarray:
        """Applies Contrast Limited Adaptive Histogram Equalization for low-light CCTV."""
        try:
            lab = cv2.cvtColor(frame, cv2.COLOR_BGR2LAB)
            l, a, b = cv2.split(lab)
            clahe = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(8, 8))
            cl = clahe.apply(l)
            limg = cv2.merge((cl, a, b))
            return cv2.cvtColor(limg, cv2.COLOR_LAB2BGR)
        except Exception:
            return frame

    def _detect_yunet_multiscale(self, frame: np.ndarray, orig_frame: Optional[np.ndarray] = None) -> List[Dict[str, Any]]:
        """
        Adaptive resolution scaling for YuNet:
        - Downsamples HD frames (> 640px) to optimal scale for 5x speedup and anchor match.
        - Upsamples tiny frames (< 320px) to ensure small faces match receptive fields.
        - Maps all bounding boxes and landmarks back to original frame coordinates.
        """
        source_frame = orig_frame if orig_frame is not None else frame
        h_orig, w_orig = source_frame.shape[:2]
        h, w = frame.shape[:2]

        # Determine target scaling factor
        max_dim = max(h, w)
        min_dim = min(h, w)

        scales_to_try = [1.0]
        if max_dim > 640:
            # Scale down to standard 640 max dimension
            scale_down = 640.0 / max_dim
            scales_to_try = [scale_down]
            if max_dim >= 1080:
                scales_to_try = [scale_down, 800.0 / max_dim]
        elif min_dim < 240 and min_dim > 0:
            # Scale up low-res frame
            scale_up = 360.0 / min_dim
            scales_to_try = [scale_up, 1.0]

        all_detections = []
        seen_boxes = []

        for scale in scales_to_try:
            if abs(scale - 1.0) < 1e-3:
                infer_img = frame
                infer_w, infer_h = w, h
            else:
                infer_w = int(w * scale)
                infer_h = int(h * scale)
                infer_w = max(32, infer_w)
                infer_h = max(32, infer_h)
                infer_img = cv2.resize(frame, (infer_w, infer_h), interpolation=cv2.INTER_LINEAR)

            try:
                self._detector.setInputSize((infer_w, infer_h))
                _, faces = self._detector.detect(infer_img)
            except Exception as e:
                faces = None

            if faces is None or len(faces) == 0:
                continue

            scale_x = w_orig / float(infer_w)
            scale_y = h_orig / float(infer_h)

            for face in faces:
                x = float(face[0]) * scale_x
                y = float(face[1]) * scale_y
                fw = float(face[2]) * scale_x
                fh = float(face[3]) * scale_y
                score = float(face[14])

                # 5 landmarks in original coordinates
                kps = np.array([
                    [float(face[4]) * scale_x,  float(face[5]) * scale_y],
                    [float(face[6]) * scale_x,  float(face[7]) * scale_y],
                    [float(face[8]) * scale_x,  float(face[9]) * scale_y],
                    [float(face[10]) * scale_x, float(face[11]) * scale_y],
                    [float(face[12]) * scale_x, float(face[13]) * scale_y]
                ], dtype=np.float32)

                x1 = max(0, int(x))
                y1 = max(0, int(y))
                x2 = min(w_orig, int(x + fw))
                y2 = min(h_orig, int(y + fh))

                if x2 <= x1 or y2 <= y1:
                    continue

                # Deduplicate if overlapping with previous scale detections
                bbox = [float(x1), float(y1), float(x2), float(y2)]
                overlap = False
                for sb in seen_boxes:
                    ix1 = max(bbox[0], sb[0])
                    iy1 = max(bbox[1], sb[1])
                    ix2 = min(bbox[2], sb[2])
                    iy2 = min(bbox[3], sb[3])
                    inter = max(0.0, ix2 - ix1) * max(0.0, iy2 - iy1)
                    if inter > 0:
                        a1 = (bbox[2] - bbox[0]) * (bbox[3] - bbox[1])
                        a2 = (sb[2] - sb[0]) * (sb[3] - sb[1])
                        iou = inter / (a1 + a2 - inter)
                        if iou > 0.45:
                            overlap = True
                            break

                if overlap:
                    continue

                seen_boxes.append(bbox)

                # Extract crops from original high-res frame
                raw_crop = source_frame[y1:y2, x1:x2]
                if raw_crop.size == 0:
                    raw_crop = np.zeros((112, 112, 3), dtype=np.uint8)

                # Expanded crop with 20% margin
                pad_x = int((x2 - x1) * 0.20)
                pad_y = int((y2 - y1) * 0.20)
                ex1 = max(0, x1 - pad_x)
                ey1 = max(0, y1 - pad_y)
                ex2 = min(w_orig, x2 + pad_x)
                ey2 = min(h_orig, y2 + pad_y)
                expanded_crop = source_frame[ey1:ey2, ex1:ex2]
                if expanded_crop.size == 0:
                    expanded_crop = raw_crop

                # Canonical 112x112 alignment using 5-point landmarks
                aligned_crop = align_face_5point(source_frame, kps, output_size=(112, 112))

                all_detections.append({
                    "bbox": bbox,
                    "score": score,
                    "kps": kps,
                    "aligned_crop": aligned_crop,
                    "raw_crop": raw_crop,
                    "expanded_crop": expanded_crop
                })

            if len(all_detections) > 0:
                break

        return all_detections

    def _detect_cascade(self, frame: np.ndarray) -> List[Dict[str, Any]]:
        """
        Fallback OpenCV Haar Cascade detection with estimated landmarks.
        """
        h, w = frame.shape[:2]
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY) if len(frame.shape) == 3 else frame

        detections = []
        if self._cascade is not None:
            faces = self._cascade.detectMultiScale(
                gray, scaleFactor=1.1, minNeighbors=3, minSize=(12, 12)
            )
            for (x, y, fw, fh) in faces:
                bbox = [float(x), float(y), float(x + fw), float(y + fh)]
                score = 0.75
                kps = self.estimate_landmarks(bbox)

                x1, y1, x2, y2 = int(x), int(y), int(x + fw), int(y + fh)
                raw_crop = frame[max(0, y1):min(h, y2), max(0, x1):min(w, x2)]
                aligned_crop = align_face_5point(frame, kps, output_size=(112, 112))

                detections.append({
                    "bbox": bbox,
                    "score": score,
                    "kps": kps,
                    "aligned_crop": aligned_crop,
                    "raw_crop": raw_crop,
                    "expanded_crop": raw_crop
                })

        return detections
