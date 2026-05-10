import { useMediaQuery } from "../hooks/useMediaQuery";
import {
  seatDisplayName,
  type BoardSpace,
  type GameAction,
  type PendingTrade,
} from "../types/game";

interface TradeResponseModalProps {
  pendingTrade: PendingTrade;
  board: BoardSpace[];
  names: (string | null)[];
  sendAction: (action: GameAction) => void;
}

export default function TradeResponseModal({
  pendingTrade,
  board,
  names,
  sendAction,
}: TradeResponseModalProps) {
  const { fromPlayer, fromProperties, toProperties, fromMoney, toMoney } =
    pendingTrade;

  const label = (n: number) => seatDisplayName(n, names[n]);

  const spaceName = (num: number) => board[num]?.name ?? `#${num}`;

  const isNarrow = useMediaQuery("(max-width: 640px)");

  return (
    <div style={overlayStyle}>
      <div style={{ ...modalStyle, ...(isNarrow ? modalStyleNarrow : {}) }}>
        <h2 style={{ margin: 0, fontSize: 20, color: "white" }}>
          Trade offer from {label(fromPlayer)}
        </h2>
        <p style={{ color: "#a0aec0", fontSize: 13, margin: "8px 0 0" }}>
          Review the terms. Accept to complete the trade, or decline to dismiss
          the offer.
        </p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: isNarrow ? "1fr" : "1fr 1fr",
            gap: isNarrow ? 12 : 16,
            marginTop: 16,
            width: "100%",
            minWidth: 0,
          }}
        >
          <div
            style={{
              backgroundColor: "rgba(72,187,120,0.12)",
              borderRadius: 8,
              padding: 12,
              border: "1px solid rgba(72,187,120,0.35)",
            }}
          >
            <div
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: "#68d391",
                marginBottom: 8,
              }}
            >
              You receive
            </div>
            <ul style={{ margin: 0, paddingLeft: 18, color: "#e2e8f0", fontSize: 13 }}>
              {fromProperties.map((n) => (
                <li key={n}>{spaceName(n)}</li>
              ))}
              {fromMoney > 0 && <li>${fromMoney} cash</li>}
              {fromProperties.length === 0 && fromMoney === 0 && (
                <li style={{ color: "#718096" }}>(nothing)</li>
              )}
            </ul>
          </div>
          <div
            style={{
              backgroundColor: "rgba(245,101,101,0.12)",
              borderRadius: 8,
              padding: 12,
              border: "1px solid rgba(245,101,101,0.35)",
            }}
          >
            <div
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: "#fc8181",
                marginBottom: 8,
              }}
            >
              You give
            </div>
            <ul style={{ margin: 0, paddingLeft: 18, color: "#e2e8f0", fontSize: 13 }}>
              {toProperties.map((n) => (
                <li key={n}>{spaceName(n)}</li>
              ))}
              {toMoney > 0 && <li>${toMoney} cash</li>}
              {toProperties.length === 0 && toMoney === 0 && (
                <li style={{ color: "#718096" }}>(nothing)</li>
              )}
            </ul>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            gap: 12,
            justifyContent: "center",
            marginTop: 20,
            flexWrap: "wrap",
          }}
        >
          <button
            type="button"
            onClick={() => sendAction({ action: "accept_trade" })}
            style={{
              backgroundColor: "#38a169",
              color: "white",
              padding: "12px 28px",
              fontSize: 16,
              fontWeight: 700,
              border: "none",
              borderRadius: 8,
              cursor: "pointer",
            }}
          >
            Accept
          </button>
          <button
            type="button"
            onClick={() => sendAction({ action: "decline_trade" })}
            style={{
              backgroundColor: "#718096",
              color: "white",
              padding: "12px 28px",
              fontSize: 16,
              fontWeight: 700,
              border: "none",
              borderRadius: 8,
              cursor: "pointer",
            }}
          >
            Decline
          </button>
        </div>
      </div>
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  backgroundColor: "rgba(0,0,0,0.65)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: `max(12px, env(safe-area-inset-top, 0px)) max(12px, env(safe-area-inset-right, 0px)) max(12px, env(safe-area-inset-bottom, 0px)) max(12px, env(safe-area-inset-left, 0px))`,
  boxSizing: "border-box",
  zIndex: 115,
};

const modalStyle: React.CSSProperties = {
  backgroundColor: "#2d3748",
  borderRadius: 12,
  padding: 24,
  maxWidth: 560,
  width: "min(560px, calc(100vw - 24px))",
  minWidth: 0,
  maxHeight: "min(85vh, 100dvh - 24px)",
  overflowY: "auto",
  overflowX: "hidden",
  boxSizing: "border-box",
  overscrollBehavior: "contain",
  WebkitOverflowScrolling: "touch",
  boxShadow: "0 8px 32px rgba(0,0,0,0.45)",
};

const modalStyleNarrow: React.CSSProperties = {
  padding: 14,
  width: "100%",
  maxWidth: "100%",
  maxHeight: "min(90dvh, 100dvh - 16px)",
};
