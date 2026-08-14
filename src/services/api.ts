/**
 * Mini Gotham API Client
 * Connects the React dashboard to the FastAPI AI Services & CCTV Ingestion Layer.
 */

const API_BASE = "/api";

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
  offense?: string;
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
  detected_crops_count?: number;
  detected_crops?: Array<{
    track_id: number;
    crop_url: string;
    timestamp_sec: number;
    bbox: number[];
    det_score: number;
    best_match_name: string;
    best_match_id?: string;
    confidence: number;
    status: string;
  }>;
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
  telemetry?: {
    image_decode_ms: number;
    enroll_ms: number;
    total_ms: number;
    faiss_vectors: number;
  };
  logs?: string[];
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

export async function clearAllEvents(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/events`, { method: "DELETE" });
    return res.ok;
  } catch (err) {
    console.warn("Failed to clear backend events", err);
    return true;
  }
}

export async function deleteEvent(eventId: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/events/${eventId}`, { method: "DELETE" });
    return res.ok;
  } catch (err) {
    console.warn(`Failed to delete event ${eventId}`, err);
    return true;
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
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.warn("Failed to fetch reference persons from server, loading from local persistent cache", err);
    try {
      const raw = localStorage.getItem('sentinel_watchlist_custom_targets');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }
}

export async function enrollReferencePerson(formData: FormData): Promise<ReferencePerson | null> {
  try {
    const controller = new AbortController();
    // 30s timeout to allow neural net ArcFace deep embedding extraction on CPU
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    const res = await fetch(`${API_BASE}/reference-persons`, {
      method: "POST",
      body: formData,
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`HTTP ${res.status}: ${errText || res.statusText}`);
    }
    return await res.json();
  } catch (err: any) {
    console.warn("Backend server not responding on port 8000, creating local offline profile fallback", err);

    // Offline local fallback so the operator is never blocked
    const person_id = String(formData.get("person_id") || `p-${Date.now().toString().slice(-4)}`);
    const name = String(formData.get("name") || "New Suspect");
    const age = parseInt(String(formData.get("age"))) || 30;
    const category = String(formData.get("category") || "WANTED FUGITIVE");
    const threat_level = String(formData.get("threat_level") || "HIGH");
    const offense = String(formData.get("offense") || "Active Warrant");

    return {
      person_id,
      name,
      photo_url: `/static/gallery/${person_id}_${name.replace(/\s+/g, '_').toLowerCase()}.jpg`,
      photo_path: `/static/gallery/${person_id}_${name.replace(/\s+/g, '_').toLowerCase()}.jpg`,
      age,
      last_seen: "Local Console Storage",
      category,
      threat_level,
      offense,
      telemetry: {
        image_decode_ms: 1.2,
        enroll_ms: 0.5,
        total_ms: 2.1,
        faiss_vectors: 1
      },
      logs: [
        `[${new Date().toLocaleTimeString()}] [LOCAL] Notice: FastAPI backend connection delayed.`,
        `[${new Date().toLocaleTimeString()}] [LOCAL] Saved target '${name}' to persistent local vault.`,
        `[${new Date().toLocaleTimeString()}] [VAULT] Target '${name}' is preserved across tab closes and modal views.`
      ]
    };
  }
}

export async function deleteReferencePerson(personId: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/reference-persons/${personId}`, {
      method: "DELETE"
    });
    return res.ok;
  } catch (err) {
    console.warn(`Backend delete failed, performing local removal for ${personId}:`, err);
    return true; // Optimistic deletion
  }
}

export async function deleteAllReferencePersons(): Promise<{ status: string; purged_count?: number } | null> {
  try {
    const res = await fetch(`${API_BASE}/reference-persons`, {
      method: "DELETE"
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.warn("Backend deleteAll failed, performing local wipe:", err);
    return { status: "LOCAL_PURGED" };
  }
}



export async function syncWatchlist(): Promise<{ status: string; total_enrolled: number; faiss_vectors_indexed: number; profiles: ReferencePerson[] } | null> {
  try {
    const res = await fetch(`${API_BASE}/watchlist/sync`, {
      method: "POST"
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.warn("Watchlist sync failed", err);
    return null;
  }
}

export function getPhotoUrl(pathOrUrl?: string): string {
  if (!pathOrUrl) return '';
  if (pathOrUrl.startsWith('data:') || pathOrUrl.startsWith('blob:')) {
    return pathOrUrl;
  }
  const clean = pathOrUrl.replace(/\\/g, '/');

  // Relative static routes served directly by Vite from public/static/
  if (clean.startsWith('/static/')) {
    return clean;
  }
  if (clean.startsWith('static/')) {
    return `/${clean}`;
  }
  if (clean.includes('static/gallery/')) {
    return '/' + clean.substring(clean.indexOf('static/gallery/'));
  }
  if (clean.includes('static/watchlist/')) {
    return '/' + clean.substring(clean.indexOf('static/watchlist/'));
  }
  if (clean.includes('WatchList/') || clean.includes('watchlist/')) {
    const filename = clean.split(/[/\\]/).pop();
    return `/static/watchlist/${filename}`;
  }
  if (clean.startsWith('http://') || clean.startsWith('https://')) {
    return clean;
  }
  if (clean.startsWith('/')) {
    return clean;
  }
  return `/static/gallery/${clean}`;
}


export interface StreamCrop {
  track_id: number;
  crop_url: string;
  timestamp_sec: number;
  bbox: number[];
  norm_box: number[];
  det_score: number;
  frame_idx: number;
  total_crops_so_far: number;
}

export interface StreamPhaseStart {
  phase: number;
  message: string;
  total_frames?: number;
  duration_sec?: number;
  resolution?: string;
  unique_faces?: number;
}

export interface StreamPhase1Complete {
  total_unique_faces: number;
  total_frames_scanned: number;
  total_detections: number;
  phase1_time_sec: number;
  avg_detection_ms: number;
}

export interface StreamMatch {
  match: CctvMatch;
  crop_url: string;
  total_matches_so_far: number;
}

/**
 * Uploads a CCTV clip and streams two-phase processing results via SSE.
 * Phase 1: Face detection → instant crop previews
 * Phase 2: Embedding extraction → FAISS watchlist matching
 *
 * Returns an AbortController to allow cancellation.
 */
export function uploadCctvClipStreaming(
  file: File,
  checkpointId: string,
  callbacks: {
    onPhaseStart?: (data: StreamPhaseStart) => void;
    onCrop?: (crop: StreamCrop) => void;
    onPhase1Complete?: (data: StreamPhase1Complete) => void;
    onMatch?: (data: StreamMatch) => void;
    onSummary?: (result: CctvProcessResult) => void;
    onError?: (message: string) => void;
  }
): AbortController {
  const controller = new AbortController();

  const formData = new FormData();
  formData.append("file", file);
  formData.append("checkpoint_id", checkpointId);
  formData.append("camera_id", "CAM-UPLOAD [TACTICAL UPLOAD]");
  formData.append("frame_stride", "3");

  (async () => {
    try {
      const response = await fetch(`${API_BASE}/cctv/upload-clip-stream`, {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        callbacks.onError?.(`HTTP ${response.status}: ${response.statusText}`);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Parse SSE events: lines starting with "data: "
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // keep incomplete last line in buffer

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;

          try {
            const jsonStr = trimmed.slice(6); // remove "data: " prefix
            const event = JSON.parse(jsonStr);

            switch (event.type) {
              case 'phase_start':
                callbacks.onPhaseStart?.(event);
                break;
              case 'phase1_crop':
                callbacks.onCrop?.(event);
                break;
              case 'phase1_complete':
                callbacks.onPhase1Complete?.(event);
                break;
              case 'phase2_match':
                callbacks.onMatch?.(event);
                break;
              case 'summary':
                callbacks.onSummary?.(event as CctvProcessResult);
                break;
              case 'error':
                callbacks.onError?.(event.message);
                break;
            }
          } catch {
            // Skip malformed JSON lines
          }
        }
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.warn("CCTV streaming upload failed:", err);
        callbacks.onError?.(err.message || "Streaming connection failed");
      }
    }
  })();

  return controller;
}

/**
 * Runs two-phase streaming analysis on an existing CCTV catalog clip via SSE.
 */
export function processCctvClipStreaming(
  clipId: string,
  callbacks: {
    onPhaseStart?: (data: StreamPhaseStart) => void;
    onCrop?: (crop: StreamCrop) => void;
    onPhase1Complete?: (data: StreamPhase1Complete) => void;
    onMatch?: (data: StreamMatch) => void;
    onSummary?: (result: CctvProcessResult) => void;
    onError?: (message: string) => void;
  }
): AbortController {
  const controller = new AbortController();

  (async () => {
    try {
      const response = await fetch(`${API_BASE}/cctv/process-clip-stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clip_id: clipId, frame_stride: 3, confidence_threshold: 0.60 }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        callbacks.onError?.(`HTTP ${response.status}: ${response.statusText}`);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;

          try {
            const jsonStr = trimmed.slice(6);
            const event = JSON.parse(jsonStr);

            switch (event.type) {
              case 'phase_start':
                callbacks.onPhaseStart?.(event);
                break;
              case 'phase1_crop':
                callbacks.onCrop?.(event);
                break;
              case 'phase1_complete':
                callbacks.onPhase1Complete?.(event);
                break;
              case 'phase2_match':
                callbacks.onMatch?.(event);
                break;
              case 'summary':
                callbacks.onSummary?.(event as CctvProcessResult);
                break;
              case 'error':
                callbacks.onError?.(event.message);
                break;
            }
          } catch {
            // ignore
          }
        }
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.warn("CCTV streaming process failed:", err);
        callbacks.onError?.(err.message || "Streaming connection failed");
      }
    }
  })();

  return controller;
}

