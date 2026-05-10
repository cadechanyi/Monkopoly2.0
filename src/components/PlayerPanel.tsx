import type { CSSProperties } from "react";
import type { Player } from "../types/game";
import { PLAYER_TOKEN_IMAGES, imageUrl, seatDisplayName } from "../types/game";

interface PlayerPanelProps {
  players: Player[];
  currentTurn: number;
  mySeat: number;
  names: (string | null)[];
  /** Fixed corners (desktop) vs single row at top (mobile) */
  layout?: "corners" | "topStrip";
}

const CORNER_POSITIONS: Record<number, CSSProperties> = {
  0: { top: 8, left: 8 },
  1: { top: 8, right: 8 },
  2: { bottom: 8, left: 8 },
  3: { bottom: 8, right: 8 },
};

export default function PlayerPanel({
  players,
  currentTurn,
  mySeat,
  names,
  layout = "corners",
}: PlayerPanelProps) {
  const sorted = [...players].sort((a, b) => a.number - b.number);

  const renderChip = (player: Player, mode: "corners" | "topStrip") => {
    const displayName = seatDisplayName(player.number, names[player.number]);
    const isMe = player.number === mySeat;
    const isActive = currentTurn === player.number && !player.resigned;
    const isResigned = player.resigned;

    const isStrip = mode === "topStrip";

    return (
      <div
        key={player.number}
        className="player-hud-chip"
        style={{
          position: isStrip ? "relative" : "fixed",
          ...(isStrip ? {} : CORNER_POSITIONS[player.number]),
          display: "flex",
          flexDirection: isStrip ? "column" : "row",
          alignItems: "center",
          justifyContent: isStrip ? "flex-start" : undefined,
          gap: isStrip ? 2 : 10,
          padding: isStrip ? "4px 2px" : "8px 14px",
          minWidth: isStrip ? 0 : undefined,
          flex: isStrip ? "1 1 0" : undefined,
          borderRadius: isStrip ? 8 : 10,
          backgroundColor: isResigned
            ? "rgba(20,20,20,0.65)"
            : isActive
              ? "rgba(255,255,255,0.15)"
              : "rgba(0,0,0,0.5)",
          border: isActive
            ? `2px solid ${player.color}`
            : "2px solid transparent",
          opacity: isResigned ? 0.45 : 1,
          filter: isResigned ? "grayscale(0.6)" : "none",
          transition: "all 0.3s",
          zIndex: isStrip ? 1 : 50,
        }}
      >
        <img
          src={imageUrl(PLAYER_TOKEN_IMAGES[player.number])}
          alt=""
          style={{
            width: isStrip ? 26 : 44,
            height: isStrip ? 24 : 40,
            flexShrink: 0,
          }}
          draggable={false}
        />
        <div
          style={{
            width: isStrip ? "100%" : undefined,
            minWidth: 0,
            textAlign: isStrip ? "center" : undefined,
          }}
        >
          <div
            style={{
              fontSize: isStrip ? 7 : 12,
              color: player.color,
              fontWeight: 800,
              textTransform: "uppercase",
              display: "flex",
              alignItems: "center",
              justifyContent: isStrip ? "center" : undefined,
              flexWrap: "wrap",
              gap: isStrip ? 2 : 6,
              lineHeight: 1.1,
            }}
          >
            <span
              style={{
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                maxWidth: isStrip ? "100%" : undefined,
              }}
            >
              {displayName}
            </span>
            {isMe && (
              <span
                style={{
                  fontSize: isStrip ? 6 : 9,
                  backgroundColor: "rgba(255,255,255,0.18)",
                  color: "white",
                  padding: isStrip ? "0 2px" : "1px 4px",
                  borderRadius: 3,
                  letterSpacing: 0.5,
                  flexShrink: 0,
                }}
              >
                YOU
              </span>
            )}
            {!player.isHuman && (
              <span
                style={{
                  fontSize: isStrip ? 6 : 9,
                  backgroundColor: "rgba(0,0,0,0.4)",
                  color: "#cbd5e0",
                  padding: isStrip ? "0 2px" : "1px 4px",
                  borderRadius: 3,
                  letterSpacing: 0.5,
                  flexShrink: 0,
                }}
              >
                AI
              </span>
            )}
          </div>
          {isResigned ? (
            <div
              style={{
                fontSize: isStrip ? 9 : 13,
                fontWeight: 800,
                color: "#fc8181",
                letterSpacing: isStrip ? 0.5 : 1.2,
                textAlign: isStrip ? "center" : undefined,
              }}
            >
              {isStrip ? "OUT" : "RESIGNED"}
            </div>
          ) : (
            <div
              style={{
                fontSize: isStrip ? 11 : 24,
                fontWeight: 800,
                color: player.money < 0 ? "#fc8181" : "white",
                fontFamily: "monospace",
                textAlign: isStrip ? "center" : undefined,
                lineHeight: 1.1,
              }}
            >
              ${player.money}
            </div>
          )}
        </div>
      </div>
    );
  };

  if (layout === "topStrip") {
    return (
      <div className="game-view__player-strip">
        {sorted.map((p) => renderChip(p, "topStrip"))}
      </div>
    );
  }

  return <>{sorted.map((p) => renderChip(p, "corners"))}</>;
}
