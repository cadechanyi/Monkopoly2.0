"""REST routes for room creation and lookup."""
from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from server.engine.room_manager import manager

router = APIRouter()


class CreateRoomRequest(BaseModel):
    mode: Literal["single", "multi"] = "multi"
    hostName: str = "Blue monkey"


class CreateRoomResponse(BaseModel):
    code: str
    mode: Literal["single", "multi"]


@router.post("/rooms", response_model=CreateRoomResponse)
async def create_room(req: CreateRoomRequest) -> CreateRoomResponse:
    room = await manager.create(req.mode, host_name=req.hostName)
    return CreateRoomResponse(code=room.code, mode=room.mode)


@router.get("/rooms/{code}")
async def get_room(code: str) -> dict:
    room = manager.get(code)
    if room is None:
        raise HTTPException(status_code=404, detail="Room not found")
    return room.lobby_dict()
