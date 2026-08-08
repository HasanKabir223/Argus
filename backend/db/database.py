"""
SQLite Database Layer
Stores checkpoints, match sightings, reference records, and system metrics.
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
    """
    conn = get_db_connection()
    cursor = conn.cursor()

    # 1. Match Events
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
        status TEXT DEFAULT 'PENDING_REVIEW'
    );
    """)

    # 2. Checkpoints
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

    # 3. Reference Persons
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS reference_persons (
        person_id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        photo_path TEXT NOT NULL,
        age INTEGER,
        last_seen TEXT,
        created_at TEXT NOT NULL
    );
    """)

    conn.commit()
    conn.close()
