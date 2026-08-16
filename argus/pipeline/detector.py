import os
import cv2
import numpy as np


def load_detector(model_path: str, input_size: tuple = (640, 480)) -> cv2.FaceDetectorYN:
    """
    Loads and initializes the OpenCV YuNet face detector model.

    Args:
        model_path (str): Path to the YuNet ONNX model file.
        input_size (tuple): Default input dimensions (width, height) for face detection.

    Returns:
        cv2.FaceDetectorYN: Configured YuNet face detector instance.

    Raises:
        FileNotFoundError: If the model file does not exist at model_path.
        RuntimeError: If loading or configuring the detector fails.
    """
    if not os.path.isfile(model_path):
        raise FileNotFoundError(
            f"YuNet model not found at {model_path}. Run: wget -O models/yunet.onnx https://github.com/opencv/opencv_zoo/raw/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx"
        )

    try:
        detector = cv2.FaceDetectorYN.create(
            model=model_path,
            config="",
            input_size=input_size,
            score_threshold=0.6,
            nms_threshold=0.3,
            top_k=5000
        )
        return detector
    except Exception as e:
        raise RuntimeError(f"[detector] Failed to initialize YuNet detector from {model_path}: {e}")


def detect_and_filter(
    detector: cv2.FaceDetectorYN,
    frame: np.ndarray,
    min_face_size: int = 80,
    blur_threshold: float = 80.0
) -> list[dict]:
    """
    Detects faces in a frame using YuNet and applies four quality filters:
    minimum size, confidence score, aspect ratio, and Laplacian blur threshold.

    Before detection, the frame is cropped to the center 70% width and top 85%
    height (ROI) to reduce edge-of-frame noise. All returned bbox coordinates
    are mapped back to the original frame coordinate space.

    Args:
        detector (cv2.FaceDetectorYN): The loaded YuNet face detector.
        frame (np.ndarray): BGR video frame image.
        min_face_size (int): Minimum width and height in pixels for a valid face crop.
        blur_threshold (float): Minimum Laplacian variance required to pass sharpness check.

    Returns:
        list[dict]: List of filtered face detections (max 10, sorted by det_score
                    descending), each containing bbox, landmarks, det_score, crop,
                    and blur_score.
    """
    try:
        if frame is None or frame.size == 0:
            return []

        h, w = frame.shape[:2]

        # --- ROI crop: center 70% width, top 85% height ---
        roi_w = int(w * 0.70)
        roi_h = int(h * 0.85)
        x_offset = (w - roi_w) // 2
        y_offset = 0  # top-aligned
        roi = frame[y_offset:y_offset + roi_h, x_offset:x_offset + roi_w]

        detector.setInputSize((roi_w, roi_h))

        _, faces = detector.detect(roi)
        if faces is None:
            return []

        results = []
        for face in faces:
            x, y, fw, fh = face[0], face[1], face[2], face[3]
            score = float(face[14])

            # Quality filter 1: Minimum size
            if fw < min_face_size or fh < min_face_size:
                continue

            # Quality filter 2: Confidence score
            if score < 0.75:
                continue

            # Quality filter 3: Aspect ratio
            aspect_ratio = fw / fh
            if aspect_ratio < 0.5 or aspect_ratio > 2.0:
                continue

            # Map ROI-local coordinates back to original frame space
            x1, y1 = int(x) + x_offset, int(y) + y_offset
            x2, y2 = int(x + fw) + x_offset, int(y + fh) + y_offset
            x1, y1 = max(0, x1), max(0, y1)
            x2, y2 = min(w, x2), min(h, y2)

            # Quality filter 4: Blur check via Laplacian variance
            crop = frame[y1:y2, x1:x2]
            if crop.size == 0:
                continue

            gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
            blur_score = float(cv2.Laplacian(gray, cv2.CV_64F).var())
            if blur_score < blur_threshold:
                continue

            # Map landmarks back to original frame space
            landmarks = np.array([
                [face[4]  + x_offset, face[5]  + y_offset],
                [face[6]  + x_offset, face[7]  + y_offset],
                [face[8]  + x_offset, face[9]  + y_offset],
                [face[10] + x_offset, face[11] + y_offset],
                [face[12] + x_offset, face[13] + y_offset],
            ], dtype=np.float32)

            results.append({
                "bbox": [x1, y1, x2, y2],
                "landmarks": landmarks,
                "det_score": score,
                "crop": crop,
                "blur_score": blur_score
            })

        # Cap results: sort by det_score descending, keep top 10 only
        results.sort(key=lambda r: r["det_score"], reverse=True)
        return results[:10]
    except Exception as e:
        print(f"[detector] Error processing frame: {e}")
        return []
