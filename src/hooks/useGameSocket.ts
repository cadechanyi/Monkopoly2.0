import { useCallback, useEffect, useRef, useState } from "react";
import type {
  GameAction,
  GameEvent,
  GameState,
  RoomLobby,
  ServerMessage,
} from "../types/game";

const WS_BASE =
  (window.location.protocol === "https:" ? "wss://" : "ws://") +
  window.location.host;

interface Options {
  code: string;
  name: string;
  seat: number;
  enabled?: boolean;
}

export function useGameSocket({ code, name, seat, enabled = true }: Options) {
  const [connected, setConnected] = useState(false);
  const [seatState, setSeatState] = useState<number | null>(null);
  const [hostSeat, setHostSeat] = useState<number | null>(null);
  const [lobby, setLobby] = useState<RoomLobby | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const nameRef = useRef(name);
  const seatRef = useRef(seat);
  nameRef.current = name;
  seatRef.current = seat;

  const sendAction = useCallback((action: GameAction) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(action));
    }
  }, []);

  useEffect(() => {
    if (!enabled || !code || seat < 0 || seat > 3) return;

    const ws = new WebSocket(`${WS_BASE}/ws/room/${code}`);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      ws.send(
        JSON.stringify({
          action: "join",
          name: nameRef.current,
          seat: seatRef.current,
        })
      );
    };

    ws.onmessage = (ev) => {
      const msg: ServerMessage = JSON.parse(ev.data);
      switch (msg.type) {
        case "joined":
          setSeatState(msg.seat);
          setHostSeat(
            typeof msg.hostSeat === "number" ? msg.hostSeat : null
          );
          break;
        case "lobby":
          setLobby(msg.room);
          setHostSeat(msg.room.hostSeat ?? null);
          break;
        case "update":
          setGameState(msg.state);
          setEvents(msg.events);
          break;
        case "error":
          setError(msg.message);
          break;
      }
    };

    ws.onclose = () => setConnected(false);
    ws.onerror = () => ws.close();

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [code, seat, enabled]);

  return {
    connected,
    seat: seatState,
    hostSeat,
    lobby,
    gameState,
    events,
    error,
    sendAction,
  };
}
