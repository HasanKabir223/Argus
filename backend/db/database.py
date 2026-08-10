"""
SQLite Database Layer
Stores checkpoints, match sightings, reference records, and system metrics.
Supports Criminal Database records, threat levels, warrants, and CCTV footage source tagging.
"""

import sqlite3
import os
from typing import List, Dict, Any, Optional
from datetime import datetime


DB_FILE = os.path.join(os.path.dirname(__file__), "events.db")


def get_db_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_FILE, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    """
    Initializes the SQLite schema according to the PRD specification.
    Includes criminal profiling, threat levels, warrants, and CCTV video source tracking.
    """
    conn = get_db_connection()
    cursor = conn.cursor()

    # 1. Match Events Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS match_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        match_id TEXT UNIQUE,
        person_id TEXT NOT NULL,
        name TEXT,
        checkpoint_id TEXT NOT NULL,
        checkpoint_name TEXT NOT NULL,
        lat REAL NOT NULL,
        lng REAL NOT NULL,
        confidence REAL NOT NULL,
        face_crop_path TEXT,
        reference_photo_path TEXT,
        timestamp TEXT NOT NULL,
        status TEXT DEFAULT 'PENDING_REVIEW',
        source_type TEXT DEFAULT 'CHECKPOINT_PHOTO',
        camera_id TEXT DEFAULT 'CAM-01',
        video_timestamp_sec REAL,
        threat_level TEXT DEFAULT 'HIGH',
        offense TEXT
    );
    """)

    # Check and add new columns if upgrading existing table
    cursor.execute("PRAGMA table_info(match_events)")
    cols = [row["name"] for row in cursor.fetchall()]
    if "source_type" not in cols:
        cursor.execute("ALTER TABLE match_events ADD COLUMN source_type TEXT DEFAULT 'CHECKPOINT_PHOTO'")
    if "camera_id" not in cols:
        cursor.execute("ALTER TABLE match_events ADD COLUMN camera_id TEXT DEFAULT 'CAM-01'")
    if "video_timestamp_sec" not in cols:
        cursor.execute("ALTER TABLE match_events ADD COLUMN video_timestamp_sec REAL")
    if "threat_level" not in cols:
        cursor.execute("ALTER TABLE match_events ADD COLUMN threat_level TEXT DEFAULT 'HIGH'")
    if "offense" not in cols:
        cursor.execute("ALTER TABLE match_events ADD COLUMN offense TEXT")

    # 2. Checkpoints Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS checkpoints (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        lat REAL NOT NULL,
        lng REAL NOT NULL,
        status TEXT DEFAULT 'ACTIVE',
        last_ping TEXT
    );
    """)

    # 3. Reference Persons (Criminals / Wanted Persons Database)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS reference_persons (
        person_id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        photo_path TEXT NOT NULL,
        age INTEGER,
        last_seen TEXT,
        category TEXT DEFAULT 'WANTED CRIMINAL',
        threat_level TEXT DEFAULT 'HIGH',
        offense TEXT,
        case_id TEXT,
        warrant_status TEXT DEFAULT 'ACTIVE WARRANT',
        created_at TEXT NOT NULL
    );
    """)

    cursor.execute("PRAGMA table_info(reference_persons)")
    rp_cols = [row["name"] for row in cursor.fetchall()]
    if "category" not in rp_cols:
        cursor.execute("ALTER TABLE reference_persons ADD COLUMN category TEXT DEFAULT 'WANTED CRIMINAL'")
    if "threat_level" not in rp_cols:
        cursor.execute("ALTER TABLE reference_persons ADD COLUMN threat_level TEXT DEFAULT 'HIGH'")
    if "offense" not in rp_cols:
        cursor.execute("ALTER TABLE reference_persons ADD COLUMN offense TEXT")
    if "case_id" not in rp_cols:
        cursor.execute("ALTER TABLE reference_persons ADD COLUMN case_id TEXT")
    if "warrant_status" not in rp_cols:
        cursor.execute("ALTER TABLE reference_persons ADD COLUMN warrant_status TEXT DEFAULT 'ACTIVE WARRANT'")

    conn.commit()
    conn.close()
