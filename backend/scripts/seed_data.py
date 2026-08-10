"""
Seed Data Script — Operational Checkpoint Network & Target Profiles
Preloads operational checkpoints and initial records into SQLite.
"""

import os
from typing import Optional, List, Dict, Any
from backend.services.event_service import EventService
from backend.services.pipeline import CheckpointPipeline


DEFAULT_CHECKPOINTS = [
    {"id": "cp-01", "name": "Grand Central Terminal", "lat": 40.7527, "lng": -73.9772, "status": "ACTIVE"},
    {"id": "cp-02", "name": "Penn Station", "lat": 40.7505, "lng": -73.9934, "status": "ACTIVE"},
    {"id": "cp-03", "name": "Port Authority Bus Terminal", "lat": 40.7570, "lng": -73.9902, "status": "ACTIVE"},
    {"id": "cp-04", "name": "JFK Airport - T4", "lat": 40.6413, "lng": -73.7781, "status": "ACTIVE"},
    {"id": "cp-05", "name": "Newark Liberty - C", "lat": 40.6895, "lng": -74.1745, "status": "ACTIVE"}
]


def seed_initial_system_data(pipeline: Optional[CheckpointPipeline] = None):
    """
    Seeds default checkpoints into SQLite.
    """
    for cp in DEFAULT_CHECKPOINTS:
        EventService.register_checkpoint(cp["id"], cp["name"], cp["lat"], cp["lng"], cp["status"])
    print("[SeedData] Seeded default operational checkpoints.")


if __name__ == "__main__":
    from backend.db.database import init_db
    init_db()
    pipe = CheckpointPipeline()
    seed_initial_system_data(pipe)
    print("Database seeded with clean operational checkpoints.")
