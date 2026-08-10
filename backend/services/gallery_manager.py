"""
Reference Persons Gallery Manager (Wanted Criminals & Persons of Interest Database)
Maintains wanted person profiles, criminal records, synched ArcFace embeddings, and mugshots.
"""

import os
import cv2
import numpy as np
from typing import List, Dict, Any, Optional
from backend.services.face_embedder import ArcFaceEmbedder
from backend.services.faiss_search import FaissSimilaritySearch


from backend.services.event_service import EventService


class GalleryManager:
    """
    Manages the criminal reference database and coordinates with the FAISS vector index & SQLite database.
    """
    def __init__(
        self,
        embedder: ArcFaceEmbedder,
        search_engine: FaissSimilaritySearch,
        gallery_dir: str = "backend/static/gallery"
    ):
        self.embedder = embedder
        self.search_engine = search_engine
        self.gallery_dir = gallery_dir
        self.persons: List[Dict[str, Any]] = []
        os.makedirs(self.gallery_dir, exist_ok=True)

    def enroll_person(
        self,
        person_id: str,
        name: str,
        photo_bgr: np.ndarray,
        age: Optional[int] = None,
        last_seen: Optional[str] = None,
        category: str = "WANTED CRIMINAL",
        threat_level: str = "HIGH",
        offense: str = "Active Felony Warrant",
        case_id: Optional[str] = None,
        warrant_status: str = "ACTIVE WARRANT - ARREST ON SIGHT"
    ) -> Dict[str, Any]:
        """
        Enrolls a wanted criminal / person of interest:
        1. Saves reference mugshot to static storage
        2. Extracts 512-D ArcFace embedding using deep model
        3. Persists criminal profile into SQLite reference_persons database table
        4. Adds profile to FAISS vector index & LSH hash tables
        """
        photo_filename = f"{person_id}_{name.replace(' ', '_').lower()}.jpg"
        photo_path = os.path.join(self.gallery_dir, photo_filename)
        cv2.imwrite(photo_path, photo_bgr)

        # Generate real deep embedding from reference photo
        embedding = self.embedder.get_embedding(photo_bgr)

        # 1. Persist to SQLite Database
        saved_db_record = EventService.save_reference_person(
            person_id=person_id,
            name=name,
            photo_path=f"/static/gallery/{photo_filename}",
            age=age or 28,
            last_seen=last_seen or "Grand Central Terminal",
            category=category,
            threat_level=threat_level,
            offense=offense,
            case_id=case_id or f"CR-{person_id.upper()}",
            warrant_status=warrant_status
        )

        meta = {
            "person_id": person_id,
            "name": name,
            "photo_path": photo_path.replace("\\", "/"),
            "photo_url": f"/static/gallery/{photo_filename}",
            "age": age or 28,
            "last_seen": last_seen or "Grand Central Terminal",
            "category": category,
            "threat_level": threat_level,
            "offense": offense,
            "case_id": case_id or f"CR-{person_id.upper()}",
            "warrant_status": warrant_status,
            "created_at": saved_db_record.get("created_at")
        }

        # Check if person already in in-memory list and replace or append
        existing_idx = next((i for i, p in enumerate(self.persons) if p["person_id"] == person_id), None)
        if existing_idx is not None:
            self.persons[existing_idx] = meta
        else:
            self.persons.append(meta)

        self.search_engine.add_reference(embedding, meta)

        return meta

    def get_all_persons(self) -> List[Dict[str, Any]]:
        """
        Returns all criminal profiles from SQLite database, falling back to in-memory list.
        """
        db_persons = EventService.get_reference_persons()
        if db_persons:
            res = []
            for p in db_persons:
                res.append({
                    "person_id": p["person_id"],
                    "name": p["name"],
                    "photo_path": p.get("photo_path", ""),
                    "photo_url": p.get("photo_path", ""),
                    "age": p.get("age", 30),
                    "last_seen": p.get("last_seen", "Grand Central Terminal"),
                    "category": p.get("category", "WANTED CRIMINAL"),
                    "threat_level": p.get("threat_level", "HIGH"),
                    "offense": p.get("offense", "Active Criminal Warrant"),
                    "case_id": p.get("case_id", f"CR-{p['person_id'].upper()}"),
                    "warrant_status": p.get("warrant_status", "ACTIVE WARRANT"),
                    "created_at": p.get("created_at")
                })
            return res
        return list(self.persons)

    def load_initial_gallery(self, seed_profiles: List[Dict[str, Any]]):
        """
        Seeds the gallery with real face photos (e.g. from LFW) labeled with criminal records.
        """
        self.persons = []
        embeddings_list = []
        metadata_list = []

        for p in seed_profiles:
            photo = p.get("image")
            photo_path = p.get("photo_path")

            if photo is None and photo_path and os.path.exists(photo_path):
                photo = cv2.imread(photo_path)

            if photo is None:
                # Fallback: create distinct synthetic face if photo not available
                photo = np.zeros((112, 112, 3), dtype=np.uint8)
                color = p.get("base_color", (180, 140, 100))
                cv2.circle(photo, (56, 56), 40, color, -1)
                cv2.circle(photo, (42, 48), 5, (40, 40, 40), -1)
                cv2.circle(photo, (70, 48), 5, (40, 40, 40), -1)
                cv2.ellipse(photo, (56, 75), (15, 8), 0, 0, 180, (40, 40, 40), 2)

            photo_filename = f"{p['person_id']}_{p['name'].replace(' ', '_').lower()}.jpg"
            dest_photo_path = os.path.join(self.gallery_dir, photo_filename)
            cv2.imwrite(dest_photo_path, photo)

            embedding = self.embedder.get_embedding(photo)
            meta = {
                "person_id": p["person_id"],
                "name": p["name"],
                "photo_path": dest_photo_path.replace("\\", "/"),
                "photo_url": f"/static/gallery/{photo_filename}",
                "age": p.get("age", 30),
                "last_seen": p.get("last_seen", "Grand Central Terminal"),
                "category": p.get("category", "WANTED CRIMINAL"),
                "threat_level": p.get("threat_level", "HIGH"),
                "offense": p.get("offense", "Fugitive from Justice / Grand Larceny"),
                "case_id": p.get("case_id", f"NYPD-2026-{p['person_id'].upper()}"),
                "warrant_status": p.get("warrant_status", "ACTIVE WARRANT - ARREST ON SIGHT")
            }

            self.persons.append(meta)
            embeddings_list.append(embedding)
            metadata_list.append(meta)

        if embeddings_list:
            stacked_embeddings = np.vstack(embeddings_list)
            self.search_engine.set_reference_database(stacked_embeddings, metadata_list)
            print(f"[GalleryManager] Initialized Criminal Reference Database with {len(self.persons)} profiles in FAISS.")

    def sync_from_db(self):
        """
        Loads all criminal profiles persisted in the SQLite reference_persons table
        and synchronizes them into FAISS index & in-memory cache.
        """
        db_persons = EventService.get_reference_persons()
        if not db_persons:
            return

        embeddings_list = []
        metadata_list = []
        self.persons = []

        for p in db_persons:
            photo_url = p.get("photo_path", "")
            photo_file = os.path.basename(photo_url) if photo_url else ""
            local_photo_path = os.path.join(self.gallery_dir, photo_file)
            
            photo = None
            if os.path.exists(local_photo_path):
                photo = cv2.imread(local_photo_path)

            if photo is None:
                # Try from WatchList directory
                watchlist_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "WatchList"))
                wl_path = os.path.join(watchlist_dir, photo_file)
                if os.path.exists(wl_path):
                    photo = cv2.imread(wl_path)

            if photo is None:
                photo = np.zeros((112, 112, 3), dtype=np.uint8)
                cv2.circle(photo, (56, 56), 40, (180, 140, 100), -1)

            embedding = self.embedder.get_embedding(photo)
            meta = {
                "person_id": p["person_id"],
                "name": p["name"],
                "photo_path": local_photo_path.replace("\\", "/"),
                "photo_url": p.get("photo_path") or f"/static/gallery/{photo_file}",
                "age": p.get("age", 30),
                "last_seen": p.get("last_seen", "Grand Central Terminal"),
                "category": p.get("category", "WANTED CRIMINAL"),
                "threat_level": p.get("threat_level", "HIGH"),
                "offense": p.get("offense", "Active Criminal Warrant"),
                "case_id": p.get("case_id", f"CR-{p['person_id'].upper()}"),
                "warrant_status": p.get("warrant_status", "ACTIVE WARRANT"),
                "created_at": p.get("created_at")
            }

            self.persons.append(meta)
            embeddings_list.append(embedding)
            metadata_list.append(meta)

        if embeddings_list:
            stacked_embeddings = np.vstack(embeddings_list)
            self.search_engine.set_reference_database(stacked_embeddings, metadata_list)
            print(f"[GalleryManager] Synced {len(self.persons)} criminal profiles from SQLite into FAISS.")

