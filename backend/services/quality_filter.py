"""
Quality Filter Service
Filters out detected faces that do not meet minimum operational quality standards:
1. Minimum size (< 40x40 px)
2. Low detection confidence (< det_thresh, default 0.35)
3. Blur score via Laplacian variance (< 80.0)
4. Aspect ratio distortion (outside 0.5 - 2.0)
"""

import cv2
import numpy as np
from typing import List, Dict, Any, Tuple, Optional


def compute_blur_score(face_crop: np.ndarray) -> float:
    """
    Computes the focus/blur metric using Laplacian variance.
    Higher values indicate a sharper image; lower values indicate blurriness.
    """
    if face_crop is None or face_crop.size == 0:
        return 0.0
    
    if len(face_crop.shape) == 3:
        gray = cv2.cvtColor(face_crop, cv2.COLOR_BGR2GRAY)
    else:
        gray = face_crop

    # Laplacian variance as sharpness estimator
    return float(cv2.Laplacian(gray, cv2.CV_64F).var())


def is_too_blurry(face_crop: np.ndarray, threshold: float = 80.0) -> bool:
    """
    Returns True if the face crop Laplacian variance is below the threshold.
    """
    return compute_blur_score(face_crop) < threshold


class QualityFilter:
    def __init__(
        self,
        min_size: int = 40,
        blur_threshold: float = 80.0,
        det_threshold: float = 0.35,
        min_aspect_ratio: float = 0.5,
        max_aspect_ratio: float = 2.0,
    ):
        self.min_size = min_size
        self.blur_threshold = blur_threshold
        self.det_threshold = det_threshold
        self.min_aspect_ratio = min_aspect_ratio
        self.max_aspect_ratio = max_aspect_ratio

    def evaluate_face(
        self,
        frame: np.ndarray,
        bbox: List[float],
        score: float = 1.0
    ) -> Tuple[bool, str, Optional[np.ndarray], float]:
        """
        Evaluates a single detected face against quality criteria.
        bbox format: [x1, y1, x2, y2]
        Returns: (passed: bool, reason: str, face_crop: np.ndarray, blur_score: float)
        """
        x1, y1, x2, y2 = [int(v) for v in bbox]
        h_frame, w_frame = frame.shape[:2]
        
        # Clamp to frame bounds
        x1 = max(0, min(x1, w_frame - 1))
        y1 = max(0, min(y1, h_frame - 1))
        x2 = max(0, min(x2, w_frame))
        y2 = max(0, min(y2, h_frame))

        w = x2 - x1
        h = y2 - y1

        # 1. Minimum size check
        if w < self.min_size or h < self.min_size:
            return False, f"Size too small ({w}x{h} < {self.min_size}x{self.min_size})", None, 0.0

        # 2. Aspect ratio check
        aspect_ratio = w / float(h) if h > 0 else 0.0
        if aspect_ratio < self.min_aspect_ratio or aspect_ratio > self.max_aspect_ratio:
            return False, f"Aspect ratio invalid ({aspect_ratio:.2f} not in [{self.min_aspect_ratio}, {self.max_aspect_ratio}])", None, 0.0

        # 3. Detection score check
        if score < self.det_threshold:
            return False, f"Confidence too low ({score:.2f} < {self.det_threshold})", None, 0.0

        # Extract crop
        face_crop = frame[y1:y2, x1:x2]
        if face_crop.size == 0:
            return False, "Empty crop", None, 0.0

        # 4. Blur check
        blur_score = compute_blur_score(face_crop)
        if blur_score < self.blur_threshold:
            return False, f"Too blurry (Laplacian variance {blur_score:.1f} < {self.blur_threshold})", face_crop, blur_score

        return True, "Passed", face_crop, blur_score

    def filter_detections(
        self,
        frame: np.ndarray,
        detections: List[Dict[str, Any]]
    ) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
        """
        Filters a list of detections:
        Each detection is a dict: {"bbox": [x1, y1, x2, y2], "score": float, "kps": optional}
        Returns: (passed_detections, rejected_detections)
        """
        passed = []
        rejected = []

        for det in detections:
            bbox = det.get("bbox", [0, 0, 0, 0])
            score = det.get("score", 1.0)
            ok, reason, crop, blur = self.evaluate_face(frame, bbox, score)

            det_copy = dict(det)
            det_copy["blur_score"] = blur
            det_copy["crop"] = crop

            if ok:
                passed.append(det_copy)
            else:
                det_copy["reject_reason"] = reason
                rejected.append(det_copy)

        return passed, rejected
