# SENTINEL Mini-Gotham - Specialized Agent Ecosystem

This repository defines specialized AI agents and subagents for engineering, computer vision, tactical frontend design, and quality assurance.

---

## Active Subagents & Personas

### 1. `cv_ai_specialist` (Computer Vision & Face Recognition)
- **Domain**: Biometrics, RetinaFace/SCRFD, ArcFace 512-d feature vectors, FAISS cosine similarity search, ByteTrack multi-target tracking.
- **Key Responsibilities**:
  - Ingest CCTV camera feeds and detect faces with high precision.
  - Generate normalized embeddings and search against watchlists.
  - Track deduplication to ensure single embedding generation per tracklet.
  - False positive mitigation and confidence threshold optimization.

### 2. `frontend_architect` (Tactical UI/UX & Geospatial Specialist)
- **Domain**: React 19, TypeScript, Vite, React-Leaflet, 3D Globe.gl, CSS Micro-interactions.
- **Key Responsibilities**:
  - Maintain the tactical high-contrast intelligence dark theme.
  - Geospatial checkpoint mapping, real-time alert overlays, and surveillance cameras.
  - Operations Console and Landing Page responsive layouts.
  - Zero layout shifts and 60 FPS visual performance.

### 3. `fastapi_backend_engineer` (FastAPI & Event Store Architect)
- **Domain**: Python FastAPI, SQLite, Pydantic v2, RESTful APIs, SSE / WebSockets, Event Sourcing.
- **Key Responsibilities**:
  - Design resilient asynchronous backend routes and database schemas.
  - Maintain detection event logs, alert notifications, and checkpoint data.
  - Background pipeline orchestration and static file serving.
  - Cross-Origin Resource Sharing (CORS) and API security standards.

### 4. `qa_test_runner` (Automated QA & System Health Specialist)
- **Domain**: Pytest, Oxlint, TypeScript compiler checks, End-to-End API testing.
- **Key Responsibilities**:
  - Automated testing of API contracts and face matching pipelines.
  - Verification of database integrity and edge-case handling.
  - Stress testing concurrent CCTV feeds and static asset uploads.

---

## Invoking Subagents

Subagents can be invoked in any session using:
```typescript
invoke_subagent({
  Subagents: [
    {
      TypeName: "cv_ai_specialist", // or frontend_architect, fastapi_backend_engineer, qa_test_runner
      Role: "CV AI Specialist",
      Prompt: "Analyze the current FAISS vector search threshold and benchmark accuracy."
    }
  ]
})
```

---

## Workspace Rules & Preferences

### Browser Preference
- Whenever launching or opening the web dashboard / app, ALWAYS launch it in **Brave Browser** (`C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe`), not Google Chrome.
- App root URL `http://localhost:5173/` opens the **Landing Page** by default. Operations Console is at `http://localhost:5173/app`.

