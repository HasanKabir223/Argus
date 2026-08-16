import os
import cv2
import numpy as np


def load_embedder() -> object:
    """
    Loads and initializes the ArcFace deep feature embedding model.

    Returns:
        object: InsightFace ArcFace recognition model instance.

    Raises:
        RuntimeError: If loading the ArcFace model fails.
    """
    try:
        import insightface
        model = insightface.model_zoo.get_model('arcface_r100_v1')
        if model is None:
            candidate_paths = [
                os.path.expanduser('~/.insightface/models/buffalo_s/w600k_mbf.onnx'),
                os.path.expanduser('~/.insightface/models/buffalo_l/w600k_r50.onnx'),
                os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'models', 'w600k_mbf.onnx'))
            ]
            for path in candidate_paths:
                if os.path.isfile(path):
                    model = insightface.model_zoo.get_model(path)
                    if model is not None:
                        break

        if model is None:
            raise RuntimeError("Could not find or download ArcFace model.")

        model.prepare(ctx_id=0)
        return model
    except Exception as e:
        raise RuntimeError(f"Failed to load ArcFace model. Run: pip install insightface==0.7.3 ({e})")


def get_embedding(model, face_dict: dict) -> np.ndarray | None:
    """
    Aligns the detected face using 5-point facial landmarks and extracts
    an L2-normalized 512-dimensional ArcFace embedding vector.

    Args:
        model: Loaded ArcFace recognition model instance.
        face_dict (dict): Dictionary containing 'crop', 'landmarks', and 'bbox'.

    Returns:
        np.ndarray | None: L2-normalized 512-D float32 embedding vector, or None on failure.
    """
    try:
        from insightface.utils import face_align

        if model is None or face_dict is None or "crop" not in face_dict:
            return None

        crop = face_dict["crop"]
        landmarks = np.array(face_dict["landmarks"], dtype=np.float32)
        bbox = face_dict.get("bbox", [0, 0, crop.shape[1], crop.shape[0]])

        # Convert landmarks to crop coordinate space if in frame coordinates
        x1, y1 = bbox[0], bbox[1]
        if landmarks[0][0] >= x1 or landmarks[0][1] >= y1:
            landmarks_crop = landmarks - np.array([x1, y1], dtype=np.float32)
        else:
            landmarks_crop = landmarks

        # Align the face to 112x112 using landmarks
        aligned_face = face_align.norm_crop(
            crop,
            landmark=landmarks_crop,
            image_size=112
        )

        if aligned_face is None or aligned_face.size == 0:
            return None

        embedding = model.get_feat(aligned_face)
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
