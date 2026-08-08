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

# Mount static directory for face crops and reference gallery photos
static_dir = os.path.join(os.path.dirname(__file__), "static")
os.makedirs(os.path.join(static_dir, "crops"), exist_ok=True)
os.makedirs(os.path.join(static_dir, "gallery"), exist_ok=True)
app.mount("/static", StaticFiles(directory=static_dir), name="static")

# Mount API routes
app.include_router(router)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.main:app", host="0.0.0.0", port=8000, reload=True)
