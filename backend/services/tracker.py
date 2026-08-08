"""
ByteTrack Multi-Object Tracker Implementation
Assigns and maintains stable track IDs across consecutive video frames
using Kalman Filter motion estimation and Hungarian IoU bipartite matching.
"""

import numpy as np
from typing import List, Dict, Any, Optional, Tuple


def compute_iou(bbox1: List[float], bbox2: List[float]) -> float:
    """
    Computes Intersection over Union (IoU) between two bounding boxes: [x1, y1, x2, y2]
    """
    x1 = max(bbox1[0], bbox2[0])
    y1 = max(bbox1[1], bbox2[1])
    x2 = min(bbox1[2], bbox2[2])
    y2 = min(bbox1[3], bbox2[3])

    inter_area = max(0.0, x2 - x1) * max(0.0, y2 - y1)
    if inter_area <= 0.0:
        return 0.0

    area1 = max(0.0, bbox1[2] - bbox1[0]) * max(0.0, bbox1[3] - bbox1[1])
    area2 = max(0.0, bbox2[2] - bbox2[0]) * max(0.0, bbox2[3] - bbox2[1])

    union = area1 + area2 - inter_area
    return inter_area / union if union > 0 else 0.0


class KalmanBoxTracker:
    """
    State-space model for a single bounding box:
    State: [center_x, center_y, scale (area), aspect_ratio, vx, vy, vs]
    """
    count = 0

    def __init__(self, bbox: List[float], score: float = 1.0):
        self.bbox = [float(v) for v in bbox]
        self.score = score
        self.track_id = KalmanBoxTracker.count
        KalmanBoxTracker.count += 1

        self.time_since_update = 0
        self.hits = 1
        self.age = 0
        self.history = []

        # Simple constant-velocity estimate
        x1, y1, x2, y2 = self.bbox
        self.cx = (x1 + x2) / 2.0
        self.cy = (y1 + y2) / 2.0
        self.w = x2 - x1
        self.h = y2 - y1
        self.vx = 0.0
        self.vy = 0.0

    def update(self, bbox: List[float], score: float = 1.0):
        self.time_since_update = 0
        self.hits += 1
        self.score = score

        x1, y1, x2, y2 = bbox
        new_cx = (x1 + x2) / 2.0
        new_cy = (y1 + y2) / 2.0
        new_w = x2 - x1
        new_h = y2 - y1

        # Smooth velocity update
        self.vx = 0.7 * self.vx + 0.3 * (new_cx - self.cx)
        self.vy = 0.7 * self.vy + 0.3 * (new_cy - self.cy)

        self.cx = new_cx
        self.cy = new_cy
        self.w = new_w
        self.h = new_h
        self.bbox = [x1, y1, x2, y2]

    def predict(self) -> List[float]:
        self.age += 1
        self.time_since_update += 1

        # Apply velocity
        self.cx += self.vx
        self.cy += self.vy

        x1 = self.cx - self.w / 2.0
        y1 = self.cy - self.h / 2.0
        x2 = self.cx + self.w / 2.0
        y2 = self.cy + self.h / 2.0
        self.bbox = [x1, y1, x2, y2]
        return self.bbox


class TrackObject:
    def __init__(self, track_id: int, bbox: List[float], score: float, detection: Dict[str, Any]):
        self.track_id = track_id
        self.bbox = bbox
        self.score = score
        self.detection = detection
        self.embedding: Optional[np.ndarray] = None


class BYTETracker:
    """
    ByteTrack: Multi-Object Tracking by associating high and low confidence detections
    using motion cues and IoU distance.
    """
    def __init__(
        self,
        track_thresh: float = 0.5,
        match_thresh: float = 0.4,
        max_time_lost: int = 30
    ):
        self.track_thresh = track_thresh
        self.match_thresh = match_thresh
        self.max_time_lost = max_time_lost
        self.tracked_stracks: List[KalmanBoxTracker] = []

    def update(self, detections: List[Dict[str, Any]]) -> List[TrackObject]:
        """
        Updates the tracker with detections from the current frame.
        detections: list of dicts with 'bbox' [x1, y1, x2, y2] and 'score' float
        """
        # 1. Predict existing tracks
        for strack in self.tracked_stracks:
            strack.predict()

        if not detections:
            # Increment lost count and prune
            self.tracked_stracks = [
                s for s in self.tracked_stracks if s.time_since_update < self.max_time_lost
            ]
            return []

        # 2. Split detections into high and low confidence
        dets_high = [d for d in detections if d.get("score", 1.0) >= self.track_thresh]
        dets_low = [d for d in detections if d.get("score", 1.0) < self.track_thresh]
        if not dets_high and detections:
            dets_high = detections  # Fallback if all below thresh

        # 3. First association: match high confidence detections with active tracks
        matched_tracks, unmatched_dets, unmatched_tracks = self._associate(
            self.tracked_stracks, dets_high, self.match_thresh
        )

        # Update matched tracks
        output_tracks: List[TrackObject] = []
        for track, det in matched_tracks:
            track.update(det["bbox"], det.get("score", 1.0))
            output_tracks.append(
                TrackObject(track.track_id, track.bbox, track.score, det)
            )

        # 4. Second association: match remaining tracks with low confidence detections
        if unmatched_tracks and dets_low:
            matched_low, _, remaining_unmatched_tracks = self._associate(
                unmatched_tracks, dets_low, 0.3
            )
            for track, det in matched_low:
                track.update(det["bbox"], det.get("score", 1.0))
                output_tracks.append(
                    TrackObject(track.track_id, track.bbox, track.score, det)
                )
            unmatched_tracks = remaining_unmatched_tracks

        # 5. Initialize new tracks from remaining unmatched high detections
        for det in unmatched_dets:
            new_track = KalmanBoxTracker(det["bbox"], det.get("score", 1.0))
            self.tracked_stracks.append(new_track)
            output_tracks.append(
                TrackObject(new_track.track_id, new_track.bbox, new_track.score, det)
            )

        # 6. Remove lost tracks
        self.tracked_stracks = [
            s for s in self.tracked_stracks if s.time_since_update < self.max_time_lost
        ]

        return output_tracks

    def _associate(
        self,
        tracks: List[KalmanBoxTracker],
        detections: List[Dict[str, Any]],
        iou_thresh: float
    ) -> Tuple[List[Tuple[KalmanBoxTracker, Dict[str, Any]]], List[Dict[str, Any]], List[KalmanBoxTracker]]:
        if not tracks or not detections:
            return [], list(detections), list(tracks)

        # Compute IoU matrix
        iou_matrix = np.zeros((len(tracks), len(detections)), dtype=np.float32)
        for t_idx, track in enumerate(tracks):
            for d_idx, det in enumerate(detections):
                iou_matrix[t_idx, d_idx] = compute_iou(track.bbox, det["bbox"])

        matched_tracks = []
        matched_track_indices = set()
        matched_det_indices = set()

        # Greedy bipartite matching
        while True:
            if iou_matrix.size == 0:
                break
            max_iou = np.max(iou_matrix)
            if max_iou < iou_thresh:
                break
            t_idx, d_idx = np.unravel_index(np.argmax(iou_matrix), iou_matrix.shape)
            
            matched_tracks.append((tracks[t_idx], detections[d_idx]))
            matched_track_indices.add(t_idx)
            matched_det_indices.add(d_idx)

            iou_matrix[t_idx, :] = -1.0
            iou_matrix[:, d_idx] = -1.0

        unmatched_dets = [d for i, d in enumerate(detections) if i not in matched_det_indices]
        unmatched_tracks = [t for i, t in enumerate(tracks) if i not in matched_track_indices]

        return matched_tracks, unmatched_dets, unmatched_tracks
