import { useState } from "react";
import type { RoomLobby, GameAction } from "../types/game";
import {
  PLAYER_SEAT_DISPLAY_NAMES,
  PLAYER_TOKEN_IMAGES,
  imageUrl,
} from "../types/game";
import "../styles/lobby.css";

interface LobbyViewProps {
  mode: "single" | "multi";
  intent: "host" | "join";
  connected: boolean;
  seat: number | null;
  lobby: RoomLobby | null;
  activeCode: string | null;
  joinRoomPreview: RoomLobby | null;
  joinLookupError: string | null;
  errMsg: string | null;
  isCreating: boolean;
  onCreateRoom: (name: string, seat: number) => void;
  onJoinLookup: (name: string, code: string) => void | Promise<void>;
  onJoinPickSeat: (seat: number) => void;
  onCancelJoinPick: () => void;
  onSendAction: (action: GameAction) => void;
  onBack: () => void;
}

function MonkeyPicker({
  title,
  disabled,
  claimableMask,
  selectedSeat,
  onPick,
}: {
  title: string;
  disabled: boolean;
  claimableMask: boolean[];
  selectedSeat?: number | null;
  onPick: (seat: number) => void;
}) {
  return (
    <div className="lobby-form">
      {title ? <label>{title}</label> : null}
      <div className="lobby-seat-grid">
        {[0, 1, 2, 3].map((s) => {
          const ok = claimableMask[s];
          const label = PLAYER_SEAT_DISPLAY_NAMES[s] ?? `Seat ${s + 1}`;
          const picked = selectedSeat === s;
          return (
            <button
              key={s}
              type="button"
              disabled={disabled || !ok}
              className={
                "lobby-seat-btn" +
                (ok ? "" : " lobby-seat-btn-disabled") +
                (picked && ok ? " lobby-seat-btn-picked" : "")
              }
              onClick={() => onPick(s)}
            >
              <img
                src={imageUrl(PLAYER_TOKEN_IMAGES[s])}
                alt={label}
                draggable={false}
              />
              <span>{label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function LobbyView({
  mode,
  intent,
  connected,
  seat,
  lobby,
  activeCode,
  joinRoomPreview,
  joinLookupError,
  errMsg,
  isCreating,
  onCreateRoom,
  onJoinLookup,
  onJoinPickSeat,
  onCancelJoinPick,
  onSendAction,
  onBack,
}: LobbyViewProps) {
  const [name, setName] = useState("");
  const [codeInput, setCodeInput] = useState("");
  const [localErr, setLocalErr] = useState<string | null>(null);
  const [joinLookupBusy, setJoinLookupBusy] = useState(false);
  /** Seat chosen before room exists (create / single flows). */
  const [pickedSeat, setPickedSeat] = useState<number | null>(null);

  const phase: "lookup" | "creating" | "lobby" | "join_pick" =
    joinRoomPreview !== null
      ? "join_pick"
      : isCreating
      ? "creating"
      : activeCode === null
      ? "lookup"
      : "lobby";

  const isHost = seat !== null && lobby?.hostSeat === seat;
  const titleText =
    mode === "single"
      ? "Single Player"
      : intent === "host"
      ? "Host Game"
      : "Join Game";

  const claimableFourForCreate = (): boolean[] => [
    true,
    true,
    true,
    true,
  ];

  const claimableJoinPreview = (): boolean[] =>
    joinRoomPreview
      ? [0, 1, 2, 3].map(
          (i) => joinRoomPreview.seatsSummary?.[i]?.claimable === true
        )
      : [false, false, false, false];

  const handleCreateOrSingleProceed = () => {
    if (!name.trim()) {
      setLocalErr("Please enter a name");
      return;
    }
    if (pickedSeat === null) {
      setLocalErr("Pick your monkey");
      return;
    }
    setLocalErr(null);
    onCreateRoom(name.trim(), pickedSeat);
  };

  const handleJoinCodeProceed = async () => {
    if (!name.trim()) {
      setLocalErr("Please enter a name");
      return;
    }
    const cleaned = codeInput.trim().toUpperCase();
    if (cleaned.length !== 6) {
      setLocalErr("Codes are 6 characters");
      return;
    }
    setLocalErr(null);
    setJoinLookupBusy(true);
    try {
      await onJoinLookup(name.trim(), cleaned);
    } finally {
      setJoinLookupBusy(false);
    }
  };

  const visibleErr =
    localErr ?? joinLookupError ?? errMsg;

  const showHostMonkeyPicker =
    phase === "lookup" &&
    (mode === "single" || intent === "host");

  const showJoinForm = phase === "lookup" && intent === "join" && mode === "multi";

  return (
    <div className="lobby-root">
      <div className="lobby-bg" />
      <div className="lobby-vignette" />

      <div className="lobby-card">
        <div className="lobby-header">
          <span className="lobby-mode">
            {mode === "single" ? "Solo vs AI" : "Online Match"}
          </span>
          <h2 className="lobby-title">{titleText}</h2>
        </div>

        {phase === "join_pick" && joinRoomPreview && (
          <>
            <p className="lobby-status">
              Room <strong>{joinRoomPreview.code}</strong>
              {joinRoomPreview.started ? " · game in progress" : ""} — choose
              your monkey.
            </p>
            <MonkeyPicker
              title=""
              disabled={joinLookupBusy}
              claimableMask={claimableJoinPreview()}
              selectedSeat={null}
              onPick={(s) => onJoinPickSeat(s)}
            />
            <div className="lobby-error">{visibleErr ?? ""}</div>
            <div className="lobby-actions">
              <button className="lobby-btn-secondary" onClick={onCancelJoinPick}>
                Back
              </button>
            </div>
          </>
        )}

        {phase === "lookup" && showHostMonkeyPicker && (
          <>
            <div className="lobby-form">
              <label htmlFor="name">Your name</label>
              <input
                id="name"
                value={name}
                maxLength={20}
                placeholder="e.g. CadeBoss"
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreateOrSingleProceed();
                }}
                autoFocus
              />
            </div>

            <MonkeyPicker
              title="Your monkey"
              disabled={false}
              claimableMask={claimableFourForCreate()}
              selectedSeat={pickedSeat}
              onPick={(s) => {
                setPickedSeat(s);
                setLocalErr(null);
              }}
            />

            <div className="lobby-error">{visibleErr ?? ""}</div>

            <div className="lobby-actions">
              <button className="lobby-btn-secondary" onClick={onBack}>
                Back
              </button>
              <button className="lobby-btn-primary" onClick={handleCreateOrSingleProceed}>
                {mode === "single" ? "Start" : "Create Room"}
              </button>
            </div>
          </>
        )}

        {phase === "lookup" && showJoinForm && (
          <>
            <div className="lobby-form">
              <label htmlFor="name">Your name</label>
              <input
                id="name"
                value={name}
                maxLength={20}
                placeholder="e.g. CadeBoss"
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleJoinCodeProceed();
                }}
                autoFocus
              />
            </div>

            <div className="lobby-form">
              <label htmlFor="code">Room code</label>
              <input
                id="code"
                value={codeInput}
                maxLength={6}
                placeholder="ABC123"
                onChange={(e) =>
                  setCodeInput(
                    e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "")
                  )
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleJoinCodeProceed();
                }}
                style={{
                  fontFamily:
                    'ui-monospace, "SF Mono", Menlo, monospace',
                  letterSpacing: 4,
                  textTransform: "uppercase",
                }}
              />
            </div>

            <div className="lobby-error">{visibleErr ?? ""}</div>

            <div className="lobby-actions">
              <button className="lobby-btn-secondary" onClick={onBack}>
                Back
              </button>
              <button
                className="lobby-btn-primary"
                disabled={joinLookupBusy}
                onClick={() => void handleJoinCodeProceed()}
              >
                Continue
              </button>
            </div>
          </>
        )}

        {phase === "creating" && (
          <div className="lobby-status">Creating room...</div>
        )}

        {phase === "lobby" && (
          <>
            {mode === "multi" && activeCode && (
              <div className="lobby-code-box">
                <span className="lobby-code-label">Room Code</span>
                <span className="lobby-code">{activeCode}</span>
              </div>
            )}

            <div className="lobby-status">
              {!connected
                ? "Connecting..."
                : mode === "single"
                ? "Setting up your game..."
                : isHost
                ? "Share the code with friends. Start when you're ready — empty seats become AI."
                : "Waiting for the host to start..."}
            </div>

            {mode === "multi" && lobby && (
              <div className="lobby-players">
                {Array.from({ length: 4 }).map((_, i) => {
                  const p = lobby.players.find((x) => x.seat === i);
                  const sum = lobby.seatsSummary?.[i];
                  const label = PLAYER_SEAT_DISPLAY_NAMES[i];
                  const hostHere = lobby.hostSeat === i;
                  return (
                    <div
                      key={i}
                      className={
                        "lobby-player-row" +
                        ((sum?.connected || p) ? "" : " empty")
                      }
                    >
                      <span>
                        {label}
                        {hostHere ? " · host" : ""}
                      </span>
                      <span>
                        {sum?.connected || p ? sum?.name ?? p?.name ?? "…" : "AI"}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="lobby-error">{visibleErr ?? ""}</div>

            <div className="lobby-actions">
              <button className="lobby-btn-secondary" onClick={onBack}>
                Leave
              </button>
              {mode === "multi" && isHost && (
                <button
                  className="lobby-btn-primary"
                  onClick={() => onSendAction({ action: "start" })}
                >
                  Start Game
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
