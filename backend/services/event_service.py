"""
Event and Checkpoint Storage Service
Coordinates persistence of sighting events, criminal records, and human review state updates.
"""

from typing import List, Dict, Any, Optional
from datetime import datetime
from backend.db.database import get_db_connection


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
        Supports both photo uploads and continuous CCTV video stream matches.
        """
        conn = get_db_connection()
        cursor = conn.cursor()
        
        now_iso = datetime.utcnow().isoformat()
        m_id = match_id or f"m-{int(datetime.utcnow().timestamp() * 1000)}"

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
    def get_checkpoints() -> List[Dict[str, Any]]:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM checkpoints ORDER BY id ASC")
        rows = cursor.fetchall()
        conn.close()
        return [dict(row) for row in rows]

    @staticmethod
    def register_checkpoint(cp_id: str, name: str, lat: float, lng: float, status: str = "ACTIVE") -> Dict[str, Any]:
        conn = get_db_connection()
        cursor = conn.cursor()
        now_iso = datetime.utcnow().isoformat()
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
        return {"id": cp_id, "name": name, "lat": lat, "lng": lng, "status": status, "last_ping": now_iso}
