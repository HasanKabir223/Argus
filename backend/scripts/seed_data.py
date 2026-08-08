"""
Seed Data Script
Preloads standard operational checkpoints and synthetic missing-person reference profiles.
"""

import cv2
import numpy as np
from typing import Optional
from backend.services.event_service import EventService
from backend.services.pipeline import CheckpointPipeline


DEFAULT_CHECKPOINTS = [
    {"id": "cp-01", "name": "Grand Central Terminal", "lat": 40.7527, "lng": -73.9772, "status": "ACTIVE"},
    {"id": "cp-02", "name": "Penn Station", "lat": 40.7505, "lng": -73.9934, "status": "ACTIVE"},
    {"id": "cp-03", "name": "Port Authority Bus Terminal", "lat": 40.7570, "lng": -73.9902, "status": "ACTIVE"},
    {"id": "cp-04", "name": "JFK Airport - T4", "lat": 40.6413, "lng": -73.7781, "status": "ACTIVE"},
    {"id": "cp-05", "name": "Newark Liberty - C", "lat": 40.6895, "lng": -74.1745, "status": "ACTIVE"}
]


def create_synthetic_face(seed_id: int, skin_tone: tuple = (190, 150, 110)) -> np.ndarray:
    """
    Synthesizes a 112x112 portrait with distinct facial feature geometry.
    """
    img = np.full((112, 112, 3), 20, dtype=np.uint8)
    
    # Draw face contour
    cv2.ellipse(img, (56, 56), (36, 46), 0, 0, 360, skin_tone, -1)
    
    # Hair / forehead shading
    hair_color = (25, 20, 15) if seed_id % 2 == 0 else (45, 30, 20)
    cv2.ellipse(img, (56, 26), (38, 22), 0, 0, 180, hair_color, -1)

    # Eyes
    eye_offset = 2 if seed_id % 3 == 0 else 0
    cv2.circle(img, (40, 48 + eye_offset), 4, (240, 240, 240), -1)
    cv2.circle(img, (40, 48 + eye_offset), 2, (30, 30, 30), -1)
    cv2.circle(img, (72, 48 + eye_offset), 4, (240, 240, 240), -1)
    cv2.circle(img, (72, 48 + eye_offset), 2, (30, 30, 30), -1)

    # Nose
    cv2.line(img, (56, 48), (56, 66), (150, 110, 80), 2)
    cv2.circle(img, (56, 68), 3, (140, 100, 70), -1)

    # Mouth
    cv2.ellipse(img, (56, 84), (12, 5), 0, 0, 180, (130, 80, 80), 2)

    return img


DEFAULT_GALLERY_PROFILES = [
    {"person_id": "p-042", "name": "Doe, John", "age": 24, "last_seen": "Penn Station", "color": (195, 155, 115)},
    {"person_id": "p-089", "name": "Smith, Jane", "age": 19, "last_seen": "Grand Central", "color": (210, 170, 130)},
    {"person_id": "p-104", "name": "Sharma, Riya", "age": 21, "last_seen": "Port Authority", "color": (175, 130, 95)},
    {"person_id": "p-211", "name": "Mehta, Arjun", "age": 28, "last_seen": "JFK Airport", "color": (185, 140, 105)},
    {"person_id": "p-305", "name": "Kim, David", "age": 23, "last_seen": "Newark Liberty", "color": (205, 175, 140)}
]


def seed_initial_system_data(pipeline: Optional[CheckpointPipeline] = None):
    """
    Seeds checkpoints, reference gallery profiles, and initial sample sightings into SQLite & FAISS.
    """
    # 1. Register default checkpoints
    for cp in DEFAULT_CHECKPOINTS:
        EventService.register_checkpoint(cp["id"], cp["name"], cp["lat"], cp["lng"], cp["status"])

    # 2. Seed gallery profiles
    if pipeline is not None and len(pipeline.gallery_manager.persons) == 0:
        seed_profiles = []
        for idx, prof in enumerate(DEFAULT_GALLERY_PROFILES):
            face_img = create_synthetic_face(idx, prof["color"])
            seed_profiles.append({
                "person_id": prof["person_id"],
                "name": prof["name"],
                "age": prof["age"],
                "last_seen": prof["last_seen"],
                "image": face_img
            })
        pipeline.gallery_manager.load_initial_gallery(seed_profiles)

    # 3. Seed initial historical matches if table empty
    existing_events = EventService.get_events(limit=5)
    if len(existing_events) == 0:
        EventService.log_match(
            person_id="p-042",
            name="Doe, John",
            checkpoint_id="cp-02",
            checkpoint_name="Penn Station",
            lat=40.7505,
            lng=-73.9934,
            confidence=0.88,
            face_crop_path="/static/gallery/p-042_doe,_john.jpg",
            reference_photo_path="/static/gallery/p-042_doe,_john.jpg",
            status="PENDING_REVIEW"
        )
        EventService.log_match(
            person_id="p-089",
            name="Smith, Jane",
            checkpoint_id="cp-01",
            checkpoint_name="Grand Central Terminal",
            lat=40.7527,
            lng=-73.9772,
            confidence=0.95,
            face_crop_path="/static/gallery/p-089_smith,_jane.jpg",
            reference_photo_path="/static/gallery/p-089_smith,_jane.jpg",
            status="CONFIRMED"
        )
        EventService.log_match(
            person_id="p-042",
            name="Doe, John",
            checkpoint_id="cp-04",
            checkpoint_name="JFK Airport - T4",
            lat=40.6413,
            lng=-73.7781,
            confidence=0.76,
            face_crop_path="/static/gallery/p-042_doe,_john.jpg",
            reference_photo_path="/static/gallery/p-042_doe,_john.jpg",
            status="CONFIRMED"
        )


if __name__ == "__main__":
    from backend.db.database import init_db
    init_db()
    seed_initial_system_data()
    print("Database seeded successfully.")
