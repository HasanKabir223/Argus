/**
 * Mini Gotham API Client
 * Connects the React dashboard to the FastAPI AI Services & CCTV Ingestion Layer.
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
  source_type?: string;
  camera_id?: string;
  video_timestamp_sec?: number;
  threat_level?: string;
  offense?: string;
  hamming_distance?: number;
  query_hash_hex?: string;
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
    last_hashing_ms?: number;
    estimated_fps: number;
  };
  deduplication: {
    active_tracks_cached: number;
    embeddings_computed: number;
    redundant_frames_skipped: number;
    deduplication_savings_percent: number;
  };
  gallery_size: number;
  hashing?: {
    algorithm: string;
    hash_bits: number;
    quantization: string;
    metric: string;
  };
  ann_search?: {
    engine: string;
    metric: string;
    dimension: number;
  };
  thresholds: {
    confirmed: number;
    review: number;
  };
}

export interface CctvClip {
  id: string;
  filename: string;
  checkpoint_id: string;
  checkpoint_name: string;
  camera_id: string;
  lat: number;
  lng: number;
  description: string;
  exists: boolean;
  size_mb: number;
  url: string | null;
}

export interface CctvMatch {
  event_id: string | number;
  track_id: number;
  person_id: string;
  name: string;
  confidence: number;
  tier: 'CONFIRMED' | 'PENDING_REVIEW' | 'UNKNOWN_PASSERBY';
  video_timestamp_sec: number;
  camera_id: string;
  checkpoint_id: string;
  checkpoint_name: string;
  lat: number;
  lng: number;
  face_crop_path?: string;
  reference_photo_path?: string;
  hamming_distance?: number;
  query_hash_hex?: string;
  threat_level?: string;
}

export interface CctvProcessResult {
  status: string;
  video_metadata: {
    filename: string;
    checkpoint_id: string;
    checkpoint_name: string;
    camera_id: string;
    lat: number;
    lng: number;
    total_video_frames: number;
    processed_frames: number;
    duration_sec: number;
    resolution: string;
    url?: string;
  };
  telemetry: {
    processing_time_sec: number;
    effective_fps: number;
    avg_detection_ms: number;
    avg_embedding_ms: number;
    avg_faiss_ann_ms: number;
    total_faces_detected: number;
    new_embeddings_computed: number;
    deduplication_savings_percent: number;
  };
  matches_count: number;
  matches: CctvMatch[];
  sample_annotations: Array<{
    frame_idx: number;
    timestamp_sec: number;
    detections: Array<{
      track_id: number;
      bbox: number[];
      norm_box: number[];
      status: string;
      name: string;
      person_id?: string;
      confidence: number;
      det_score: number;
    }>;
  }>;
}

export interface ReferencePerson {
  person_id: string;
  name: string;
  photo_url?: string;
  photo_path?: string;
  age?: number;
  last_seen?: string;
  category?: string;
  threat_level?: string;
  offense?: string;
  case_id?: string;
  warrant_status?: string;
  hash_hex?: string;
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

export async function fetchCctvClips(): Promise<CctvClip[]> {
  try {
    const res = await fetch(`${API_BASE}/cctv/clips`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.warn("Failed to fetch CCTV clips", err);
    return [];
  }
}

export async function processCctvClip(clipId: string): Promise<CctvProcessResult | null> {
  try {
    const res = await fetch(`${API_BASE}/cctv/process-clip`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clip_id: clipId, frame_stride: 2, confidence_threshold: 0.60 })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.warn("CCTV clip processing failed", err);
    return null;
  }
}

export async function uploadCctvClip(file: File, checkpointId: string = "cp-01"): Promise<CctvProcessResult | null> {
  try {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("checkpoint_id", checkpointId);
    formData.append("camera_id", `CAM-UPLOAD [TACTICAL UPLOAD]`);
    formData.append("frame_stride", "2");

    const res = await fetch(`${API_BASE}/cctv/upload-clip`, {
      method: "POST",
      body: formData
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.warn("CCTV file upload failed", err);
    return null;
  }
}

export async function fetchReferencePersons(): Promise<ReferencePerson[]> {
  try {
    const res = await fetch(`${API_BASE}/reference-persons`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.warn("Failed to fetch reference persons", err);
    return [];
  }
}

export async function enrollReferencePerson(formData: FormData): Promise<ReferencePerson | null> {
  try {
    const res = await fetch(`${API_BASE}/reference-persons`, {
      method: "POST",
      body: formData
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.warn("Reference person enrollment failed", err);
    return null;
  }
}
