"""
WebSocket endpoint for joining a room and playing a game. The same handler
serves both single-player and multiplayer rooms — single-player rooms just
auto-start with 3 AI fillers as soon as the host joins.
"""
from __future__ import annotations

import asyncio

from fastapi import WebSocket, WebSocketDisconnect

from server.engine.room_manager import Room, manager

AI_TURN_DELAY_S = 1.5


def _join_seat_index(first: dict) -> int | None:
    raw = first.get("seat")
    if raw is None:
        return None
    try:
        s = int(raw)
    except (TypeError, ValueError):
        return None
    if 0 <= s <= 3:
        return s
    return None


async def room_websocket(websocket: WebSocket, code: str) -> None:
    await websocket.accept()
    room = manager.get(code)
    if room is None:
        await websocket.send_json({"type": "error", "message": "Room not found"})
        await websocket.close()
        return

    seat = -1
    try:
        first = await websocket.receive_json()
    except WebSocketDisconnect:
        return

    if first.get("action") != "join":
        await websocket.send_json({"type": "error", "message": "Expected join action"})
        await websocket.close()
        return

    raw = first.get("name")
    name = raw.strip()[:24] if isinstance(raw, str) else ""
    seat_req = _join_seat_index(first)
    if seat_req is None:
        await websocket.send_json({
            "type": "error",
            "message": "Choose a monkey seat (0–3)",
        })
        await websocket.close()
        return

    if room.started and room.engine is not None:
        seat = room.reclaim_seat_mid_game(websocket, name or None, seat_req)
        if seat == -1:
            await websocket.send_json({
                "type": "error",
                "message": "Cannot take that monkey — occupied, human, or resigned",
            })
            await websocket.close()
            return
    else:
        seat = room.add_player_at(websocket, name or None, seat_req)
        if seat == -1:
            await websocket.send_json({
                "type": "error",
                "message": "Seat already taken — pick another monkey",
            })
            await websocket.close()
            return

    await websocket.send_json({
        "type": "joined",
        "seat": seat,
        "code": room.code,
        "mode": room.mode,
        "hostSeat": room.host_seat,
    })
    await room.broadcast_lobby()

    if room.mode == "single" and not room.started:
        await _start_room(room)
    elif room.started and room.engine is not None:
        await room.broadcast_state([{"type": "player_reclaimed", "seat": seat}])

    try:
        while True:
            msg = await websocket.receive_json()
            await _handle_message(room, websocket, msg)
    except WebSocketDisconnect:
        pass
    finally:
        code_for_remove: str | None = None
        disc_events: list[dict] = []
        async with room.lock:
            _s, disc_events = room.detach_websocket(websocket)
            if room.is_empty():
                code_for_remove = room.code
            elif disc_events:
                await room.broadcast_state(disc_events)

        if code_for_remove:
            await manager.remove(code_for_remove)
        elif disc_events:
            await room.broadcast_lobby()
            if room.started and room.engine is not None:
                await _drain_ai(room)
        else:
            await room.broadcast_lobby()


async def _handle_message(room: Room, ws: WebSocket, msg: dict) -> None:
    action = msg.get("action")

    if action == "start":
        if room.started:
            return
        if room.host_seat is None or room.seat_of(ws) != room.host_seat:
            await ws.send_json({"type": "error", "message": "Only the host can start"})
            return
        await _start_room(room)
        return

    if not room.started or room.engine is None:
        await ws.send_json({"type": "error", "message": "Game has not started yet"})
        return

    if action == "leave":
        await ws.close()
        return

    seat = room.seat_of(ws)
    if seat == -1:
        await ws.send_json({"type": "error", "message": "Not seated in this room"})
        return

    async with room.lock:
        if action == "end_game":
            events = room.request_end_game_vote(seat)
        elif action == "end_game_vote":
            agree = bool(msg.get("agree"))
            events = room.submit_end_game_vote(seat, agree)
        else:
            events = room.engine.handle_action(seat, dict(msg))
        await room.broadcast_state(events)
    await _drain_ai(room)


async def _start_room(room: Room) -> None:
    err_msg: str | None = None
    async with room.lock:
        try:
            room.start()
        except ValueError as e:
            err_msg = str(e)
        else:
            await room.broadcast_lobby()
            await room.broadcast_state([{"type": "game_started"}])
    if err_msg is not None:
        await _send_error_to_room(room, err_msg)
        return
    await _drain_ai(room)


async def _send_error_to_room(room: Room, message: str) -> None:
    for sock in list(room.seats):
        if sock is None:
            continue
        try:
            await sock.send_json({"type": "error", "message": message})
        except Exception:
            pass


async def _drain_ai(room: Room) -> None:
    if room.engine is None:
        return
    while room.engine.is_ai_turn():
        await asyncio.sleep(AI_TURN_DELAY_S)
        async with room.lock:
            if room.engine is None:
                return
            ai_events = room.engine.run_pending_ai_turn()
            await room.broadcast_state(ai_events)
