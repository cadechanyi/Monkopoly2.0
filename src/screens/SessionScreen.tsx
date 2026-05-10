import { useState } from "react";
import { useGameSocket } from "../hooks/useGameSocket";
import LobbyView from "./LobbyView";
import GameView from "./GameView";
import type { RoomLobby } from "../types/game";

interface SessionScreenProps {
  mode: "single" | "multi";
  intent: "host" | "join";
  onExit: () => void;
}

export default function SessionScreen({
  mode,
  intent,
  onExit,
}: SessionScreenProps) {
  const [activeCode, setActiveCode] = useState<string | null>(null);
  const [submittedName, setSubmittedName] = useState("");
  const [chosenSeat, setChosenSeat] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [createErr, setCreateErr] = useState<string | null>(null);

  const [joinRoomPreview, setJoinRoomPreview] = useState<RoomLobby | null>(null);
  const [pendingJoinCode, setPendingJoinCode] = useState<string | null>(null);
  const [joinLookupError, setJoinLookupError] = useState<string | null>(null);

  const socketReady =
    activeCode !== null &&
    submittedName !== "" &&
    chosenSeat !== null &&
    chosenSeat >= 0 &&
    chosenSeat <= 3;

  const {
    connected,
    seat,
    lobby,
    gameState,
    events,
    error,
    sendAction,
  } = useGameSocket({
    code: activeCode ?? "",
    name: submittedName,
    seat: chosenSeat ?? 0,
    enabled: socketReady,
  });

  const resetConnectionIntent = () => {
    setActiveCode(null);
    setSubmittedName("");
    setChosenSeat(null);
    setJoinRoomPreview(null);
    setPendingJoinCode(null);
    setJoinLookupError(null);
    setCreateErr(null);
  };

  const handleExitToHome = () => {
    resetConnectionIntent();
    onExit();
  };

  const handleJoinLookup = async (name: string, code: string) => {
    setJoinLookupError(null);
    try {
      const cleaned = code.trim().toUpperCase();
      const res = await fetch(`/api/rooms/${cleaned}`);
      if (!res.ok) throw new Error("Room not found");
      const room: RoomLobby = await res.json();
      const open = (room.seatsSummary ?? []).some((s) => s.claimable);
      if (!open) {
        setJoinLookupError("No available monkeys in this room.");
        return;
      }
      setSubmittedName(name.trim());
      setPendingJoinCode(cleaned);
      setJoinRoomPreview(room);
    } catch {
      setJoinLookupError("Room not found — check the code.");
    }
  };

  const handleJoinPickSeat = (seatNum: number) => {
    if (!pendingJoinCode) return;
    setChosenSeat(seatNum);
    setActiveCode(pendingJoinCode);
    setJoinRoomPreview(null);
    setPendingJoinCode(null);
  };

  const handleCancelJoinPick = () => {
    setJoinRoomPreview(null);
    setPendingJoinCode(null);
    setSubmittedName("");
    setJoinLookupError(null);
  };

  /** Host (multi) or single-player room creation — WebSocket joins after REST. */
  const handleCreateRoom = async (name: string, seatNum: number) => {
    setCreateErr(null);
    setChosenSeat(seatNum);
    setSubmittedName(name.trim());
    setCreating(true);
    try {
      const res = await fetch("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, hostName: name.trim() }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: { code: string } = await res.json();
      setActiveCode(data.code);
    } catch (e) {
      setCreateErr(e instanceof Error ? e.message : "Failed to create room");
      setChosenSeat(null);
      setSubmittedName("");
    } finally {
      setCreating(false);
    }
  };

  if (gameState && seat !== null) {
    return (
      <GameView
        gameState={gameState}
        events={events}
        seat={seat}
        roomCode={activeCode ?? ""}
        lobby={lobby}
        sendAction={sendAction}
        onExit={handleExitToHome}
      />
    );
  }

  return (
    <LobbyView
      mode={mode}
      intent={intent}
      connected={connected}
      seat={seat}
      lobby={lobby}
      activeCode={activeCode}
      joinRoomPreview={joinRoomPreview}
      joinLookupError={joinLookupError}
      errMsg={createErr ?? error}
      isCreating={creating}
      onCreateRoom={handleCreateRoom}
      onJoinLookup={handleJoinLookup}
      onJoinPickSeat={handleJoinPickSeat}
      onCancelJoinPick={handleCancelJoinPick}
      onSendAction={sendAction}
      onBack={handleExitToHome}
    />
  );
}
