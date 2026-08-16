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
    min_face_size: int = 40,
    blur_threshold: float = 80.0
) -> list[dict]:
    """
    Detects faces in a frame using YuNet and applies four quality filters:
    minimum size, confidence score, aspect ratio, and Laplacian blur threshold.

    Args:
        detector (cv2.FaceDetectorYN): The loaded YuNet face detector.
        frame (np.ndarray): BGR video frame image.
        min_face_size (int): Minimum width and height in pixels for a valid face crop.
        blur_threshold (float): Minimum Laplacian variance required to pass sharpness check.

    Returns:
        list[dict]: List of filtered face detections, each containing bbox, landmarks,
                    det_score, crop, and blur_score.
    """
    try:
        if frame is None or frame.size == 0:
            return []

        h, w = frame.shape[:2]
        detector.setInputSize((w, h))

        _, faces = detector.detect(frame)
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
            if score < 0.6:
                continue

            # Quality filter 3: Aspect ratio
            aspect_ratio = fw / fh
            if aspect_ratio < 0.5 or aspect_ratio > 2.0:
                continue

            # Quality filter 4: Blur check via Laplacian variance
            x1, y1 = int(x), int(y)
            x2, y2 = int(x + fw), int(y + fh)
            x1, y1 = max(0, x1), max(0, y1)
            x2, y2 = min(frame.shape[1], x2), min(frame.shape[0], y2)
            crop = frame[y1:y2, x1:x2]
            if crop.size == 0:
                continue

            gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
            blur_score = float(cv2.Laplacian(gray, cv2.CV_64F).var())
            if blur_score < blur_threshold:
                continue

            results.append({
                "bbox": [x1, y1, x2, y2],
                "landmarks": np.array([
                    [face[4],  face[5]],
                    [face[6],  face[7]],
                    [face[8],  face[9]],
                    [face[10], face[11]],
                    [face[12], face[13]],
                ], dtype=np.float32),
                "det_score": score,
                "crop": crop,
                "blur_score": blur_score
            })

        return results
    except Exception as e:
        print(f"[detector] Error processing frame: {e}")
        return []
