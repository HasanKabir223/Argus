/**
 * Mini Gotham API Client
 * Connects the React dashboard to the FastAPI AI Services Layer.
 */

const API_BASE = "http://localhost:8000/api";

export interface BackendEvent {
  id: string | number;
  match_id?: string;
  person_id: string;
  name?: string;
  checkpoint_id: string;
  checkpoint_name: string;
  lat: number;
  lng: number;
  confidence: number;
  face_crop_path?: string;
  reference_photo_path?: string;
  timestamp: string;
  status: 'PENDING_REVIEW' | 'CONFIRMED' | 'DISMISSED';
}

export interface BackendCheckpoint {
  id: string;
  name: string;
  lat: number;
  lng: number;
  status: 'ACTIVE' | 'IDLE';
}

export interface SystemMetrics {
  pipeline: {
    total_frames_processed: number;
    total_detections: number;
    total_filtered_out: number;
    total_embeddings_computed: number;
    total_matches_logged: number;
    last_detection_ms: number;
    last_embedding_ms: number;
    last_search_ms: number;
    estimated_fps: number;
  };
  deduplication: {
    active_tracks_cached: number;
    embeddings_computed: number;
    redundant_frames_skipped: number;
    deduplication_savings_percent: number;
  };
  gallery_size: number;
  thresholds: {
    confirmed: number;
    review: number;
  };
}

export async function fetchEvents(): Promise<BackendEvent[]> {
  try {
    const res = await fetch(`${API_BASE}/events?limit=50`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.warn("Backend not reachable, falling back to local state", err);
    return [];
  }
}

export async function fetchCheckpoints(): Promise<BackendCheckpoint[]> {
  try {
    const res = await fetch(`${API_BASE}/checkpoints`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.warn("Backend not reachable for checkpoints", err);
    return [];
  }
}

export async function updateEventStatus(
  eventId: string | number,
  status: 'PENDING_REVIEW' | 'CONFIRMED' | 'DISMISSED'
): Promise<BackendEvent | null> {
  try {
    const res = await fetch(`${API_BASE}/events/${eventId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.warn("Backend status update failed", err);
    return null;
  }
}

export async function fetchMetrics(): Promise<SystemMetrics | null> {
  try {
    const res = await fetch(`${API_BASE}/metrics`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch {
    return null;
  }
}

export async function triggerSimulationStep(checkpointId?: string): Promise<any> {
  try {
    const res = await fetch(`${API_BASE}/simulation/step`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ checkpoint_id: checkpointId })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.warn("Simulation trigger failed", err);
    return null;
  }
}
