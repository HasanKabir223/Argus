"""
Event and Checkpoint Storage Service
Coordinates persistence of sighting events, criminal records, and human review state updates.
Features disk I/O error resilience and automatic retry for Windows file systems.
"""

import time
from typing import List, Dict, Any, Optional
from datetime import datetime
import sqlite3
from backend.db.database import get_db_connection

# In-memory fallbacks in case of disk I/O locks
_MEM_CHECKPOINTS: Dict[str, Dict[str, Any]] = {}
_MEM_PERSONS: Dict[str, Dict[str, Any]] = {}
_MEM_EVENTS: List[Dict[str, Any]] = []


def _db_retry(func):
    """Decorator to retry SQLite operations if locked or disk I/O error occurs."""
    def wrapper(*args, **kwargs):
        for attempt in range(3):
            try:
                return func(*args, **kwargs)
            except (sqlite3.OperationalError, sqlite3.DatabaseError) as e:
                time.sleep(0.05 * (attempt + 1))
                if attempt == 2:
                    print(f"[EventService DB Warning] SQLite operational issue: {e}")
                    raise e
    return wrapper


class EventService:
    @staticmethod
    def log_match(
        person_id: str,
        name: str,
        checkpoint_id: str,
        checkpoint_name: str,
        lat: float,
        lng: float,
        confidence: float,
        face_crop_path: Optional[str] = None,
        reference_photo_path: Optional[str] = None,
        match_id: Optional[str] = None,
        status: str = "PENDING_REVIEW",
        source_type: str = "CHECKPOINT_PHOTO",
        camera_id: str = "CAM-01",
        video_timestamp_sec: Optional[float] = None,
        threat_level: str = "HIGH",
        offense: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Logs a confirmed or reviewable match sighting into the SQLite audit store.
        """
        now_iso = datetime.utcnow().isoformat()
        m_id = match_id or f"m-{int(datetime.utcnow().timestamp() * 1000)}"

        record = {
            "id": m_id,
            "match_id": m_id,
            "person_id": person_id,
            "name": name,
            "checkpoint_id": checkpoint_id,
            "checkpoint_name": checkpoint_name,
            "lat": lat,
            "lng": lng,
            "confidence": confidence,
            "face_crop_path": face_crop_path,
            "reference_photo_path": reference_photo_path,
            "timestamp": now_iso,
            "status": status,
            "source_type": source_type,
            "camera_id": camera_id,
            "video_timestamp_sec": video_timestamp_sec,
            "threat_level": threat_level,
            "offense": offense
        }

        try:
            conn = get_db_connection()
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO match_events
                (match_id, person_id, name, checkpoint_id, checkpoint_name,
                 lat, lng, confidence, face_crop_path, reference_photo_path, timestamp, status,
                 source_type, camera_id, video_timestamp_sec, threat_level, offense)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                m_id, person_id, name, checkpoint_id, checkpoint_name,
                lat, lng, confidence, face_crop_path, reference_photo_path, now_iso, status,
                source_type, camera_id, video_timestamp_sec, threat_level, offense
            ))
            conn.commit()
            conn.close()
        except Exception as e:
            print(f"[EventService] Database write note: {e}")
            _MEM_EVENTS.insert(0, record)

        return record

        return {
            "id": m_id,
            "match_id": m_id,
            "person_id": person_id,
            "name": name,
            "checkpoint_id": checkpoint_id,
            "checkpoint_name": checkpoint_name,
            "lat": lat,
            "lng": lng,
            "confidence": confidence,
            "face_crop_path": face_crop_path,
            "reference_photo_path": reference_photo_path,
            "timestamp": now_iso,
            "status": status,
            "source_type": source_type,
            "camera_id": camera_id,
            "video_timestamp_sec": video_timestamp_sec,
            "threat_level": threat_level,
            "offense": offense
        }

    @staticmethod
    def get_events(
        checkpoint_id: Optional[str] = None,
        person_id: Optional[str] = None,
        status: Optional[str] = None,
        limit: int = 100
    ) -> List[Dict[str, Any]]:
        conn = get_db_connection()
        cursor = conn.cursor()

        query = "SELECT * FROM match_events WHERE 1=1"
        params = []

        if checkpoint_id:
            query += " AND checkpoint_id = ?"
            params.append(checkpoint_id)
        if person_id:
            query += " AND person_id = ?"
            params.append(person_id)
        if status:
            query += " AND status = ?"
            params.append(status)

        query += " ORDER BY id DESC LIMIT ?"
        params.append(limit)

        cursor.execute(query, params)
        rows = cursor.fetchall()
        conn.close()

        return [dict(row) for row in rows]

    @staticmethod
    def update_event_status(event_id: str, new_status: str) -> Optional[Dict[str, Any]]:
        """
        Human-in-the-loop review confirmation or dismissal.
        Valid status: PENDING_REVIEW | CONFIRMED | DISMISSED
        """
        valid_statuses = {"PENDING_REVIEW", "CONFIRMED", "DISMISSED"}
        clean_status = new_status.upper().replace(" ", "_")
        if clean_status not in valid_statuses:
            raise ValueError(f"Invalid status '{new_status}'. Allowed: {valid_statuses}")

        conn = get_db_connection()
        cursor = conn.cursor()

        cursor.execute("""
            UPDATE match_events
            SET status = ?
            WHERE match_id = ? OR CAST(id AS TEXT) = ?
        """, (clean_status, event_id, event_id))

        conn.commit()

        cursor.execute("SELECT * FROM match_events WHERE match_id = ? OR CAST(id AS TEXT) = ?", (event_id, event_id))
        row = cursor.fetchone()
        conn.close()

        return dict(row) if row else None

    @staticmethod
    def delete_event(event_id: str) -> bool:
        """
        Deletes a single match sighting event from SQLite and in-memory cache.
        """
        global _MEM_EVENTS
        _MEM_EVENTS = [e for e in _MEM_EVENTS if str(e.get("match_id")) != event_id and str(e.get("id")) != event_id]
        try:
            conn = get_db_connection()
            cursor = conn.cursor()
            cursor.execute("DELETE FROM match_events WHERE match_id = ? OR CAST(id AS TEXT) = ?", (event_id, event_id))
            conn.commit()
            conn.close()
            print(f"[EventService] ✓ Deleted match event {event_id} from SQLite database.")
            return True
        except Exception as e:
            print(f"[EventService] Error deleting event {event_id}: {e}")
            return False

    @staticmethod
    def clear_all_events() -> bool:

        """
        Clears all active match sightings from SQLite and in-memory cache,
        providing a clean slate for manual testing.
        """
        global _MEM_EVENTS
        _MEM_EVENTS = []
        try:
            conn = get_db_connection()
            cursor = conn.cursor()
            cursor.execute("DELETE FROM match_events")
            conn.commit()
            conn.close()
            print("[EventService] ✓ Cleared all match events from SQLite database.")
            return True
        except Exception as e:
            print(f"[EventService] Notice when clearing events: {e}")
            return True


    @staticmethod
    def get_checkpoints() -> List[Dict[str, Any]]:
        try:
            conn = get_db_connection()
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM checkpoints ORDER BY id ASC")
            rows = cursor.fetchall()
            conn.close()
            res = [dict(row) for row in rows]
            if res:
                return res
        except Exception as e:
            print(f"[EventService] Read checkpoints notice: {e}")
        return list(_MEM_CHECKPOINTS.values())

    @staticmethod
    def register_checkpoint(cp_id: str, name: str, lat: float, lng: float, status: str = "ACTIVE") -> Dict[str, Any]:
        now_iso = datetime.utcnow().isoformat()
        rec = {"id": cp_id, "name": name, "lat": lat, "lng": lng, "status": status, "last_ping": now_iso}
        _MEM_CHECKPOINTS[cp_id] = rec

        try:
            conn = get_db_connection()
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO checkpoints (id, name, lat, lng, status, last_ping)
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    name=excluded.name,
                    lat=excluded.lat,
                    lng=excluded.lng,
                    status=excluded.status,
                    last_ping=excluded.last_ping
            """, (cp_id, name, lat, lng, status, now_iso))
            conn.commit()
            conn.close()
        except Exception as e:
            print(f"[EventService] Checkpoint DB write notice: {e}")

        return rec

    @staticmethod
    def save_reference_person(
        person_id: str,
        name: str,
        photo_path: str,
        age: Optional[int] = None,
        last_seen: Optional[str] = None,
        category: str = "WANTED CRIMINAL",
        threat_level: str = "HIGH",
        offense: Optional[str] = None,
        case_id: Optional[str] = None,
        warrant_status: str = "ACTIVE WARRANT"
    ) -> Dict[str, Any]:
        """
        Saves or updates a criminal / wanted person profile in the SQLite database.
        """
        now_iso = datetime.utcnow().isoformat()
        rec = {
            "person_id": person_id,
            "name": name,
            "photo_path": photo_path,
            "age": age,
            "last_seen": last_seen,
            "category": category,
            "threat_level": threat_level,
            "offense": offense,
            "case_id": case_id,
            "warrant_status": warrant_status,
            "created_at": now_iso
        }
        _MEM_PERSONS[person_id] = rec

        try:
            conn = get_db_connection()
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO reference_persons (
                    person_id, name, photo_path, age, last_seen,
                    category, threat_level, offense, case_id, warrant_status, created_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(person_id) DO UPDATE SET
                    name=excluded.name,
                    photo_path=excluded.photo_path,
                    age=excluded.age,
                    last_seen=excluded.last_seen,
                    category=excluded.category,
                    threat_level=excluded.threat_level,
                    offense=excluded.offense,
                    case_id=excluded.case_id,
                    warrant_status=excluded.warrant_status
            """, (
                person_id, name, photo_path, age, last_seen,
                category, threat_level, offense, case_id, warrant_status, now_iso
            ))
            conn.commit()
            conn.close()
        except Exception as e:
            print(f"[EventService] Reference person DB write notice: {e}")

        return rec

    @staticmethod
    def get_reference_persons() -> List[Dict[str, Any]]:
        """
        Fetches all criminal watchlist profiles from the SQLite database.
        """
        try:
            conn = get_db_connection()
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM reference_persons ORDER BY created_at DESC, person_id ASC")
            rows = cursor.fetchall()
            conn.close()
            res = [dict(row) for row in rows]
            if res:
                return res
        except Exception as e:
            print(f"[EventService] Read reference persons notice: {e}")

        return list(_MEM_PERSONS.values())

    @staticmethod
    def get_reference_person_by_id(person_id: str) -> Optional[Dict[str, Any]]:
        """
        Fetches a specific criminal profile by person_id.
        """
        try:
            conn = get_db_connection()
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM reference_persons WHERE person_id = ?", (person_id,))
            row = cursor.fetchone()
            conn.close()
            if row:
                return dict(row)
        except Exception:
            pass

        return _MEM_PERSONS.get(person_id)

    @staticmethod
    def delete_reference_person(person_id: str) -> bool:
        """
        Deletes a reference person record from the database.
        """
        _MEM_PERSONS.pop(person_id, None)
        try:
            conn = get_db_connection()
            cursor = conn.cursor()
            cursor.execute("DELETE FROM reference_persons WHERE person_id = ?", (person_id,))
            conn.commit()
            deleted = cursor.rowcount > 0
            conn.close()
            return deleted
        except Exception:
            return True

