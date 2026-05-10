"""
FastAPI application — serves the WebSocket game endpoint, room creation REST
endpoint, and (in production) the static Vite build of the frontend.
"""
from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from server.api.rooms import router as rooms_router
from server.api.ws import room_websocket

app = FastAPI(title="Monkopoly 2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(rooms_router, prefix="/api")
app.websocket("/ws/room/{code}")(room_websocket)


@app.get("/api/health")
async def health() -> dict:
    return {"status": "ok"}


# In production the frontend is built into ./frontend/dist (next to this file
# inside the Docker image) or ../dist (when the Vite output sits at the repo
# root in local previews). Mount whichever exists.
backend_root = Path(__file__).resolve().parent
frontend_candidates = [
    backend_root / "frontend" / "dist",
    backend_root.parent / "dist",
]
for frontend_dist in frontend_candidates:
    if frontend_dist.exists():
        app.mount("/", StaticFiles(directory=str(frontend_dist), html=True), name="frontend")
        break
