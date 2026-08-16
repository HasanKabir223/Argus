"""
FastAPI Server Entry Point for Mini Gotham Checkpoint AI Services
"""

import os
import sys

# Ensure workspace root is in sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from backend.db.database import init_db
from backend.services.event_service import EventService
from backend.api.routes import router, get_pipeline
from backend.scripts.seed_data import seed_initial_system_data


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: initialize database tables and seed checkpoints & gallery
    init_db()
    pipe = get_pipeline()
    seed_initial_system_data(pipe)
    yield
    # Shutdown logic if needed


app = FastAPI(
    title="Checkpoint-Based Missing Person Matching System",
    description="Operational AI Services Layer & Event Store (Mini Gotham)",
    version="1.0.0",
    lifespan=lifespan
)

# Enable CORS for React Frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static directory for face crops, gallery photos, and CCTV surveillance clips
static_dir = os.path.join(os.path.dirname(__file__), "static")
from backend.services.cctv_service import _get_cctv_storage_dirs
from backend.scripts.seed_data import _get_watchlist_dir

cctv_dir = _get_cctv_storage_dirs()[0]
watchlist_dir = _get_watchlist_dir()

crops_dir = os.path.join(static_dir, "crops")
os.makedirs(crops_dir, exist_ok=True)
os.makedirs(os.path.join(static_dir, "gallery"), exist_ok=True)
os.makedirs(cctv_dir, exist_ok=True)
os.makedirs(watchlist_dir, exist_ok=True)

app.mount("/crops", StaticFiles(directory=crops_dir), name="crops")
app.mount("/static/cctv", StaticFiles(directory=cctv_dir), name="cctv")
app.mount("/static/watchlist", StaticFiles(directory=watchlist_dir), name="watchlist")
app.mount("/static", StaticFiles(directory=static_dir), name="static")

# Mount API routes under /api and also root /ingest
app.include_router(router)

# Also expose /ingest directly at root level to match POST /ingest/upload and GET /ingest/status/:job_id
from backend.services.ingest_job_service import get_ingest_service
from fastapi import UploadFile, File, HTTPException
import shutil

@app.post("/ingest/upload")
async def root_ingest_upload(video: UploadFile = File(...)):
    ingest_svc = get_ingest_service()
    job_id = ingest_svc.create_job()
    cctv_dir = _get_cctv_storage_dirs()[0]
    os.makedirs(cctv_dir, exist_ok=True)
    saved_filename = f"job_{job_id}_{video.filename}"
    saved_path = os.path.join(cctv_dir, saved_filename)
    with open(saved_path, "wb") as f:
        shutil.copyfileobj(video.file, f)
    ingest_svc.start_background_processing(job_id, saved_path)
    return {"job_id": job_id}

@app.get("/ingest/status/{job_id}")
def root_ingest_status(job_id: str):
    ingest_svc = get_ingest_service()
    status = ingest_svc.get_job_status(job_id)
    if status is None:
        raise HTTPException(status_code=404, detail=f"Ingestion job '{job_id}' not found")
    return status



if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.main:app", host="0.0.0.0", port=8000)
