import type { BoardSpace, GameAction, Player } from "../types/game";
import { PROPERTY_IMAGES, imageUrl } from "../types/game";

interface BuyModalProps {
  space: BoardSpace;
  player: Player;
  sendAction: (action: GameAction) => void;
}

export default function BuyModal({ space, player, sendAction }: BuyModalProps) {
  const imageFile = PROPERTY_IMAGES[space.number];
  // The Buy button is disabled when the player can't actually afford the
  // property. They can use Manage / Trade (still available behind this
  // modal in the side panel) to mortgage or trade their way to enough cash.
  const canAfford = player.money >= space.cost;
  const shortfall = space.cost - player.money;

  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        <h2 style={{ margin: 0, fontSize: 20, color: "white" }}>{space.name}</h2>
        <div
          style={{
            fontSize: 36,
            fontWeight: 800,
            color: "#f6e05e",
            fontFamily: "monospace",
          }}
        >
          ${space.cost}
        </div>

        {imageFile && (
          <img
            src={imageUrl(imageFile)}
            alt={space.name}
            style={{ maxWidth: 200, maxHeight: 280, borderRadius: 6 }}
            draggable={false}
          />
        )}

        {!canAfford && (
          <div
            style={{
              color: "#fc8181",
              fontSize: 13,
              fontWeight: 600,
              textAlign: "center",
              maxWidth: 280,
              lineHeight: 1.4,
            }}
          >
            You're ${shortfall} short. Use Manage or Trade to raise cash, or
            Pass.
          </div>
        )}

        <div style={{ display: "flex", gap: 16, marginTop: 12 }}>
          <button
            onClick={() => sendAction({ action: "buy" })}
            disabled={!canAfford}
            style={{
              backgroundColor: canAfford ? "#38a169" : "#4a5568",
              color: "white",
              padding: "14px 32px",
              fontSize: 18,
            }}
          >
            Buy
          </button>
          <button
            onClick={() => sendAction({ action: "pass" })}
            style={{
              backgroundColor: "#e53e3e",
              color: "white",
              padding: "14px 32px",
              fontSize: 18,
            }}
          >
            Pass
          </button>
        </div>
      </div>
    </div>
  );
}

// The wrapper is intentionally click-through (`pointer-events: none`) and
// has no dim backdrop. We want the side ControlPanel (Manage / Trade /
// Resign) to stay reachable while the buy prompt is up — otherwise a
// player who can't afford the property has no way to mortgage / trade
// their way to the cash. Clicks still register on the inner modal box,
// which re-enables pointer events.
const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  pointerEvents: "none",
  zIndex: 100,
};

const modalStyle: React.CSSProperties = {
  backgroundColor: "#2d3748",
  borderRadius: 12,
  padding: 28,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  pointerEvents: "auto",
  gap: 12,
  // Strong outer shadow + a thin highlight stroke give the modal enough
  // presence to read as foreground without needing a viewport-wide dim
  // backdrop blocking the side panel underneath.
  boxShadow:
    "0 12px 48px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.08)",
  maxWidth: 400,
};
