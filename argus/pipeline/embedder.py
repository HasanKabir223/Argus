import os
import cv2
import numpy as np


# SFace expects aligned faces at 112×112
_SFACE_INPUT_SIZE = (112, 112)


def load_embedder() -> object:
    """
    Loads and initializes the SFace deep feature embedding model
    via OpenCV's cv2.FaceRecognizerSF.

    Returns:
        cv2.FaceRecognizerSF: SFace recognition model instance.

    Raises:
        RuntimeError: If loading the SFace model fails.
    """
    try:
        model_path = os.path.abspath(
            os.path.join(os.path.dirname(__file__), '..', 'models',
                         'face_recognition_sface_2021dec.onnx')
        )
        if not os.path.isfile(model_path):
            raise FileNotFoundError(
                f"SFace model not found at {model_path}. "
                "Download from: https://github.com/opencv/opencv_zoo/tree/main/models/face_recognition_sface"
            )

        model = cv2.FaceRecognizerSF.create(
            model=model_path,
            config="",
            backend_id=cv2.dnn.DNN_BACKEND_OPENCV,
            target_id=cv2.dnn.DNN_TARGET_CPU
        )
        return model
    except Exception as e:
        raise RuntimeError(f"Failed to load SFace model: {e}")


def get_embedding(model, face_dict: dict) -> np.ndarray | None:
    """
    Aligns the detected face using SFace's built-in alignCrop and extracts
    an L2-normalized 128-dimensional SFace embedding vector.

    alignCrop() expects the ORIGINAL FULL FRAME together with face detection
    info (bbox + landmarks) in frame coordinates.  It performs the crop and
    affine alignment internally.

    Args:
        model: Loaded cv2.FaceRecognizerSF instance.
        face_dict (dict): Dictionary from detect_and_filter() containing:
            - 'frame':     the original full BGR frame
            - 'bbox':      [x1, y1, x2, y2] in frame coordinates
            - 'landmarks': (5, 2) float32 array of keypoints in frame coordinates
            - 'det_score': detection confidence

    Returns:
        np.ndarray | None: L2-normalized 128-D float32 embedding vector, or None on failure.
    """
    try:
        if model is None or face_dict is None:
            return None

        frame = face_dict.get("frame")
        if frame is None:
            return None

        landmarks = np.array(face_dict["landmarks"], dtype=np.float32)
        bbox = face_dict["bbox"]

        # Convert bbox from [x1, y1, x2, y2] to [x, y, w, h] as YuNet outputs
        x1, y1, x2, y2 = bbox[0], bbox[1], bbox[2], bbox[3]
        w = x2 - x1
        h = y2 - y1

        # Build the 1×15 detection row that FaceRecognizerSF.alignCrop expects:
        # [x, y, w, h, kp0_x, kp0_y, ..., kp4_x, kp4_y, score]
        # All coordinates must be in FRAME space — alignCrop crops internally.
        face_info = np.zeros(15, dtype=np.float32)
        face_info[0] = float(x1)
        face_info[1] = float(y1)
        face_info[2] = float(w)
        face_info[3] = float(h)
        for i in range(5):
            face_info[4 + i * 2]     = landmarks[i][0]
            face_info[4 + i * 2 + 1] = landmarks[i][1]
        face_info[14] = face_dict.get("det_score", 0.99)

        face_info_mat = face_info.reshape(1, -1)

        # alignCrop takes the FULL frame and does crop + affine warp internally
        aligned_face = model.alignCrop(frame, face_info_mat)
        if aligned_face is None or aligned_face.size == 0:
            return None

        # Extract 128-D feature vector
        embedding = model.feature(aligned_face)
        embedding = embedding.flatten()

        # L2 normalize — required for cosine similarity via dot product
        norm = np.linalg.norm(embedding)
        if norm == 0:
            return None
        embedding = embedding / norm

        return embedding.astype(np.float32)
    except Exception as e:
        print(f"[embedder] Failed to embed face: {e}")
        return None

