"""
RoomManager — keeps the in-memory directory of game rooms keyed by 6-char
join codes. A Room owns one ``GameEngine`` plus the websockets currently
seated at it. Players pick a monkey seat explicitly; disconnected humans
fall back to AI so others can reclaim the seat mid-game.
"""
from __future__ import annotations

import asyncio
import random
import string
from dataclasses import dataclass, field
from typing import Literal, Optional

from fastapi import WebSocket

from .constants import PLAYER_DEFAULT_NAMES
from .game_engine import GameEngine

RoomMode = Literal["single", "multi"]
MAX_SEATS = 4


@dataclass
class EndGameVote:
    proposer: int
    required_seats: set[int]
    approvals: set[int]


@dataclass
class Room:
    code: str
    mode: RoomMode
    host_name: str
    seats: list[Optional[WebSocket]] = field(default_factory=lambda: [None] * MAX_SEATS)
    names: list[Optional[str]] = field(default_factory=lambda: [None] * MAX_SEATS)
    """Seat index (0–3) of the lobby host — start / end-game authority."""
    host_seat: Optional[int] = None
    engine: Optional[GameEngine] = None
    end_game_vote: Optional[EndGameVote] = None
    started: bool = False
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)

    def num_humans_seated(self) -> int:
        return sum(1 for s in self.seats if s is not None)

    def seat_entry(self, seat: int) -> dict:
        conn = seat >= 0 and seat < MAX_SEATS and self.seats[seat] is not None
        name = self.names[seat] if seat >= 0 and seat < MAX_SEATS else None
        resigned = False
        ai_controlled = False
        claimable = False
        if self.started and self.engine is not None and 0 <= seat < MAX_SEATS:
            p = self.engine.state.players[seat]
            resigned = p.resigned
            ai_controlled = not p.is_human
            claimable = not conn and not resigned and ai_controlled
        else:
            if 0 <= seat < MAX_SEATS:
                claimable = not conn
        return {
            "seat": seat,
            "connected": conn,
            "name": name,
            "resigned": resigned,
            "claimable": claimable,
        }

    def lobby_dict(self) -> dict:
        return {
            "code": self.code,
            "mode": self.mode,
            "started": self.started,
            "hostName": self.host_name,
            "hostSeat": self.host_seat,
            "seatsSummary": [self.seat_entry(i) for i in range(MAX_SEATS)],
            "players": [
                {"seat": i, "name": self.names[i]}
                for i, ws in enumerate(self.seats)
                if ws is not None
            ],
        }

    def add_player_at(self, ws: WebSocket, name: str | None, seat: int) -> int:
        """
        Lobby join: occupy a free seat before the game starts.
        First seated player becomes host (`host_seat`).
        """
        if self.started or not (0 <= seat < MAX_SEATS):
            return -1
        if self.seats[seat] is not None:
            return -1
        trimmed = (name or "").strip()[:24]
        disp = trimmed or PLAYER_DEFAULT_NAMES[seat]
        self.seats[seat] = ws
        self.names[seat] = disp
        if self.host_seat is None:
            self.host_seat = seat
        return seat

    def reclaim_seat_mid_game(self, ws: WebSocket, name: str | None, seat: int) -> int:
        """
        Take over an AI-controlled, non-resigned seat after the game started.
        """
        if not self.started or self.engine is None:
            return -1
        if not (0 <= seat < MAX_SEATS):
            return -1
        if self.seats[seat] is not None:
            return -1
        p = self.engine.state.players[seat]
        if p.resigned or p.is_human:
            return -1
        trimmed = (name or "").strip()[:24]
        self.seats[seat] = ws
        self.names[seat] = trimmed or PLAYER_DEFAULT_NAMES[seat]
        p.is_human = True
        return seat

    def detach_websocket(self, ws: WebSocket) -> tuple[int, list[dict]]:
        """Remove a connection — lobby bookkeeping or mid-game AI handoff."""
        seat = self.seat_of(ws)
        if seat < 0:
            return -1, []
        self.seats[seat] = None
        self.names[seat] = None
        events: list[dict] = []

        if not self.started:
            if self.host_seat == seat:
                self.host_seat = None
                for i, slot in enumerate(self.seats):
                    if slot is not None:
                        self.host_seat = i
                        break
            return seat, events

        if self.engine:
            events = self.engine.apply_seat_socket_lost(seat)
        events.extend(self._handle_end_game_vote_disconnect(seat))
        return seat, events

    def connected_human_seats(self) -> list[int]:
        if not self.started or self.engine is None:
            return []
        out: list[int] = []
        for i, ws in enumerate(self.seats):
            if ws is None:
                continue
            p = self.engine.state.players[i]
            if p.is_human and not p.resigned:
                out.append(i)
        return out

    def _handle_end_game_vote_disconnect(self, seat: int) -> list[dict]:
        vote = self.end_game_vote
        if vote is None:
            return []
        if seat == vote.proposer:
            self.end_game_vote = None
            return [{"type": "end_game_vote_cancelled", "reason": "proposer_disconnected"}]
        vote.required_seats.discard(seat)
        vote.approvals.discard(seat)
        if vote.required_seats and vote.approvals.issuperset(vote.required_seats):
            return self._finalize_end_game_vote()
        return [{
            "type": "end_game_vote_progress",
            "proposer": vote.proposer,
            "approvals": sorted(vote.approvals),
            "requiredSeats": sorted(vote.required_seats),
        }]

    def request_end_game_vote(self, requester_seat: int) -> list[dict]:
        if self.engine is None or not self.started:
            return [{"type": "error", "message": "Game has not started"}]
        if requester_seat < 0 or requester_seat >= MAX_SEATS:
            return [{"type": "error", "message": "Invalid seat"}]
        req_player = self.engine.state.players[requester_seat]
        if req_player.resigned or not req_player.is_human or self.seats[requester_seat] is None:
            return [{"type": "error", "message": "Only connected human players can request this"}]

        humans = self.connected_human_seats()
        if len(humans) <= 1:
            return self._end_game_now(requester_seat)

        if self.end_game_vote is not None:
            return [{"type": "error", "message": "An end-game vote is already active"}]

        required = set(humans)
        approvals = {requester_seat}
        self.end_game_vote = EndGameVote(
            proposer=requester_seat,
            required_seats=required,
            approvals=approvals,
        )
        return [{
            "type": "end_game_vote_started",
            "proposer": requester_seat,
            "approvals": sorted(approvals),
            "requiredSeats": sorted(required),
        }]

    def submit_end_game_vote(self, voter_seat: int, agree: bool) -> list[dict]:
        vote = self.end_game_vote
        if vote is None:
            return [{"type": "error", "message": "No end-game vote is active"}]
        if voter_seat not in vote.required_seats:
            return [{"type": "error", "message": "You are not eligible to vote"}]
        if not agree:
            self.end_game_vote = None
            return [{
                "type": "end_game_vote_cancelled",
                "reason": "rejected",
                "by": voter_seat,
            }]

        vote.approvals.add(voter_seat)
        if vote.approvals.issuperset(vote.required_seats):
            return self._finalize_end_game_vote()

        return [{
            "type": "end_game_vote_progress",
            "proposer": vote.proposer,
            "approvals": sorted(vote.approvals),
            "requiredSeats": sorted(vote.required_seats),
        }]

    def _finalize_end_game_vote(self) -> list[dict]:
        vote = self.end_game_vote
        if vote is None:
            return []
        proposer = vote.proposer
        self.end_game_vote = None
        events = [{
            "type": "end_game_vote_passed",
            "proposer": proposer,
        }]
        events.extend(self._end_game_now(proposer))
        return events

    def _end_game_now(self, requester_seat: int) -> list[dict]:
        if self.engine is None:
            return [{"type": "error", "message": "Game has not started"}]
        self.end_game_vote = None
        return self.engine.handle_action(requester_seat, {"action": "end_game"})

    def seat_of(self, ws: WebSocket) -> int:
        for i, slot in enumerate(self.seats):
            if slot is ws:
                return i
        return -1

    def is_empty(self) -> bool:
        return all(s is None for s in self.seats)

    def start(self) -> None:
        """Lock lobby layout into a GameEngine. Unseated slots are AI."""
        if self.started:
            return
        humans = self.num_humans_seated()
        if humans < 1:
            raise ValueError("Cannot start with no players")
        if self.mode == "single" and humans != 1:
            raise ValueError("Single-player rooms need exactly one player")

        mask = tuple(self.seats[i] is not None for i in range(MAX_SEATS))
        self.engine = GameEngine(seat_is_human=mask)
        self.started = True

    async def broadcast_state(self, events: list[dict]) -> None:
        if self.engine is None:
            return
        payload = {
            "type": "update",
            "events": events,
            "state": self.engine.to_dict(),
        }
        for ws in list(self.seats):
            if ws is None:
                continue
            try:
                await ws.send_json(payload)
            except Exception:
                pass

    async def broadcast_lobby(self) -> None:
        payload = {"type": "lobby", "room": self.lobby_dict()}
        for ws in list(self.seats):
            if ws is None:
                continue
            try:
                await ws.send_json(payload)
            except Exception:
                pass

class RoomManager:
    def __init__(self) -> None:
        self._rooms: dict[str, Room] = {}
        self._lock = asyncio.Lock()

    async def create(self, mode: RoomMode, host_name: str = "Blue monkey") -> Room:
        async with self._lock:
            code = self._generate_code()
            room = Room(code=code, mode=mode, host_name=host_name)
            self._rooms[code] = room
            return room

    def get(self, code: str) -> Optional[Room]:
        return self._rooms.get(code.upper())

    async def remove(self, code: str) -> None:
        async with self._lock:
            self._rooms.pop(code.upper(), None)

    def _generate_code(self) -> str:
        alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
        while True:
            code = "".join(random.choices(alphabet, k=6))
            if code not in self._rooms:
                return code


manager = RoomManager()
