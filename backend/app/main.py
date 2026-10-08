"""
backend/app/main.py — FastAPI Application Entrypoint.

Configures:
- FastAPI application instance
- Cross-Origin Resource Sharing (CORS)
- API routers for geo, optimize, compare, and blueprint endpoints
- Service health check
"""

from __future__ import annotations

import sys
from pathlib import Path

# Add project root and backend dir to sys.path so both backend.app and app imports work
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
BACKEND_DIR = Path(__file__).resolve().parent.parent

if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

try:
    from backend.app.api import auth, candidates, compare, geo, layout, optimization, optimize, projects, quantum_credentials, telemetry, wind_aep
except ImportError:
    from app.api import auth, candidates, compare, geo, layout, optimization, optimize, projects, quantum_credentials, telemetry, wind_aep

app = FastAPI(
    title="AeroQuantum-Wind API",
    version="1.0.0",
    description="Production-grade API for Quantum WS-QAOA Wind Farm Micro-Siting & Satellite Geospatial Telemetry.",
    docs_url="/docs",
    redoc_url="/redoc",
)

import os

allowed_origins_env = os.environ.get("ALLOWED_ORIGINS")
if allowed_origins_env:
    allowed_origins = [o.strip() for o in allowed_origins_env.split(",") if o.strip()]
else:
    allowed_origins = [
        "https://aerowind.vercel.app",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
    ]

# Enable CORS for production Vercel frontend and local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from fastapi import Request
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles

# Register routers
app.include_router(auth.router, prefix="/api")
app.include_router(projects.router, prefix="/api")
app.include_router(geo.router, prefix="/api/geo")
app.include_router(telemetry.router, prefix="/api/geo")
app.include_router(layout.router, prefix="/api/geo")
app.include_router(candidates.router, prefix="/api/engineering")
app.include_router(wind_aep.router, prefix="/api/engineering")
app.include_router(optimization.router, prefix="/api/engineering")
app.include_router(quantum_credentials.router, prefix="/api")
app.include_router(optimize.router, prefix="/api")
app.include_router(compare.router, prefix="/api")

# Mount frontend static directory and assets
FRONTEND_DIR = PROJECT_ROOT / "frontend"
DIST_DIR = FRONTEND_DIR / "dist"
ASSETS_DIR = FRONTEND_DIR / "assets"

if DIST_DIR.exists() and (DIST_DIR / "app-assets").exists():
    app.mount("/app-assets", StaticFiles(directory=str(DIST_DIR / "app-assets")), name="app-assets")

if FRONTEND_DIR.exists():
    app.mount("/map", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="map")
    app.mount("/frontend", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="frontend")
    if (FRONTEND_DIR / "js").exists():
        app.mount("/js", StaticFiles(directory=str(FRONTEND_DIR / "js")), name="js")
    if (FRONTEND_DIR / "css").exists():
        app.mount("/css", StaticFiles(directory=str(FRONTEND_DIR / "css")), name="css")
    if ASSETS_DIR.exists():
        app.mount("/assets", StaticFiles(directory=str(ASSETS_DIR)), name="assets")


def get_frontend_index() -> Path:
    if DIST_DIR.exists() and (DIST_DIR / "index.html").exists():
        return DIST_DIR / "index.html"
    return FRONTEND_DIR / "index.html"


@app.get(
    "/",
    summary="Root Health Check & Dashboard Entry",
    tags=["system"],
)
def root_status(request: Request):
    accept = request.headers.get("accept", "")
    # If accessed by a web browser expecting HTML, serve interactive UI
    if "text/html" in accept and not accept.startswith("*/*"):
        index_file = get_frontend_index()
        if index_file.exists():
            return FileResponse(index_file)
    return {
        "status": "online",
        "service": "AeroQuantum-Wind API",
        "version": "1.0.0",
        "map_ui": "/map",
    }


@app.get(
    "/app",
    summary="Interactive Map UI",
    response_class=HTMLResponse,
    include_in_schema=False,
)
def interactive_app(request: Request):
    if request.query_params.get("classic") == "1":
        return FileResponse(FRONTEND_DIR / "index.html")
    index_file = get_frontend_index()
    if index_file.exists():
        return FileResponse(index_file)
    return HTMLResponse("<h1>AeroQuantum-Wind UI Loading...</h1>")


@app.get(
    "/classic",
    summary="Classic Single-File Interactive UI",
    response_class=HTMLResponse,
    include_in_schema=False,
)
def classic_app():
    return FileResponse(FRONTEND_DIR / "index.html")


@app.get(
    "/api/health",
    summary="Health check",
    tags=["system"],
)
def health_check() -> dict[str, str]:
    return {
        "status": "healthy",
        "service": "AeroQuantum-Wind API",
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.app.main:app", host="127.0.0.1", port=8000, reload=True)
