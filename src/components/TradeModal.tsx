import { useState } from "react";
import { useMediaQuery } from "../hooks/useMediaQuery";
import {
  seatDisplayName,
  type BoardSpace,
  type GameAction,
  type PendingTrade,
  type Player,
} from "../types/game";

interface TradeModalProps {
  board: BoardSpace[];
  players: Player[];
  mySeat: number;
  names: (string | null)[];
  sendAction: (action: GameAction) => void;
  status: "accepted" | "denied" | "cancelled" | null;
  pendingTrade: PendingTrade | null;
  onClose: () => void;
}

export default function TradeModal({
  board,
  players,
  mySeat,
  names,
  sendAction,
  status,
  pendingTrade,
  onClose,
}: TradeModalProps) {
  const me = players[mySeat];
  // Resigned players are out of the game — never offer them as a trade
  // partner (they own no properties and have no cash to swap).
  const opponents = players.filter((p) => p.number !== mySeat && !p.resigned);

  const [selectedOpponent, setSelectedOpponent] = useState<number | null>(null);
  const [fromProperties, setFromProperties] = useState<number[]>([]);
  const [toProperties, setToProperties] = useState<number[]>([]);
  const [fromMoney, setFromMoney] = useState(0);
  const [toMoney, setToMoney] = useState(0);

  const colorSetHasHouses = (colorSet: number | null) =>
    colorSet !== null &&
    board.some(
      (s) => s.type === "property" && s.colorSet === colorSet && s.houses > 0
    );

  const myProperties = board.filter(
    (s) =>
      s.owner === mySeat &&
      s.type === "property" &&
      s.houses === 0 &&
      !colorSetHasHouses(s.colorSet)
  );
  const opponentProperties =
    selectedOpponent !== null
      ? board.filter(
          (s) =>
            s.owner === selectedOpponent &&
            s.type === "property" &&
            s.houses === 0 &&
            !colorSetHasHouses(s.colorSet)
        )
      : [];

  const toggleFrom = (num: number) =>
    setFromProperties((prev) =>
      prev.includes(num) ? prev.filter((n) => n !== num) : [...prev, num]
    );
  const toggleTo = (num: number) =>
    setToProperties((prev) =>
      prev.includes(num) ? prev.filter((n) => n !== num) : [...prev, num]
    );

  const canPropose =
    selectedOpponent !== null &&
    (fromProperties.length > 0 || fromMoney > 0) &&
    (toProperties.length > 0 || toMoney > 0);

  const proposeTrade = () => {
    if (selectedOpponent === null) return;
    sendAction({
      action: "propose_trade",
      fromPlayer: mySeat,
      toPlayer: selectedOpponent,
      fromProperties,
      toProperties,
      fromMoney,
      toMoney,
    });
  };

  const opponentName = (n: number) => seatDisplayName(n, names[n]);

  const waitingOnMyOffer =
    pendingTrade !== null && pendingTrade.fromPlayer === mySeat;

  const isNarrow = useMediaQuery("(max-width: 640px)");
  const modalStyleResolved: React.CSSProperties = {
    ...modalStyle,
    ...(isNarrow ? modalStyleNarrow : {}),
  };

  return (
    <div style={overlayStyle}>
      <div style={modalStyleResolved}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            width: "100%",
          }}
        >
          <h2 style={{ margin: 0, fontSize: 20, color: "white" }}>Trade</h2>
          <button
            onClick={onClose}
            style={{
              backgroundColor: "#718096",
              color: "white",
              padding: "6px 14px",
              fontSize: 13,
            }}
          >
            Close
          </button>
        </div>

        {waitingOnMyOffer && pendingTrade && (
          <div
            style={{
              padding: 14,
              borderRadius: 8,
              backgroundColor: "rgba(128,90,213,0.2)",
              border: "1px solid rgba(128,90,213,0.55)",
              color: "#e9d8fd",
              fontSize: 14,
              lineHeight: 1.45,
            }}
          >
            Waiting for {opponentName(pendingTrade.toPlayer)} to accept or
            decline your offer.
            <div style={{ marginTop: 12 }}>
              <button
                type="button"
                onClick={() => sendAction({ action: "cancel_trade" })}
                style={{
                  backgroundColor: "#718096",
                  color: "white",
                  padding: "8px 18px",
                  fontSize: 14,
                  border: "none",
                  borderRadius: 6,
                  cursor: "pointer",
                }}
              >
                Withdraw offer
              </button>
            </div>
          </div>
        )}

        <div style={{ opacity: waitingOnMyOffer ? 0.45 : 1, pointerEvents: waitingOnMyOffer ? "none" : "auto" }}>
          <div style={{ fontSize: 12, color: "#a0aec0", marginBottom: 6 }}>
            Trade with:
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {opponents.map((p) => {
              const hasProps = board.some(
                (s) =>
                  s.owner === p.number &&
                  s.type === "property" &&
                  s.houses === 0 &&
                  !colorSetHasHouses(s.colorSet)
              );
              return (
                <button
                  key={p.number}
                  onClick={() => {
                    setSelectedOpponent(p.number);
                    setToProperties([]);
                    setToMoney(0);
                  }}
                  disabled={!hasProps}
                  style={{
                    backgroundColor:
                      selectedOpponent === p.number
                        ? p.color
                        : "rgba(255,255,255,0.1)",
                    color: selectedOpponent === p.number ? "black" : p.color,
                    padding: "8px 16px",
                    fontWeight: 700,
                  }}
                >
                  {opponentName(p.number)} (${p.money})
                </button>
              );
            })}
          </div>
        </div>

        {selectedOpponent !== null && !waitingOnMyOffer && (
          <div
            style={{
              display: "flex",
              flexDirection: isNarrow ? "column" : "row",
              gap: isNarrow ? 14 : 20,
              width: "100%",
              minWidth: 0,
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: "#fc8181",
                  marginBottom: 8,
                }}
              >
                You Give:
              </div>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 6,
                  marginBottom: 8,
                }}
              >
                {myProperties.map((s) => (
                  <PropertyChip
                    key={s.number}
                    space={s}
                    selected={fromProperties.includes(s.number)}
                    onClick={() => toggleFrom(s.number)}
                  />
                ))}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ color: "#a0aec0", fontSize: 13 }}>$</span>
                <input
                  type="number"
                  min={0}
                  max={me.money}
                  value={fromMoney}
                  onChange={(e) =>
                    setFromMoney(
                      Math.min(me.money, Math.max(0, Number(e.target.value)))
                    )
                  }
                  style={inputStyle}
                />
              </div>
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: "#68d391",
                  marginBottom: 8,
                }}
              >
                You Get:
              </div>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 6,
                  marginBottom: 8,
                }}
              >
                {opponentProperties.map((s) => (
                  <PropertyChip
                    key={s.number}
                    space={s}
                    selected={toProperties.includes(s.number)}
                    onClick={() => toggleTo(s.number)}
                  />
                ))}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ color: "#a0aec0", fontSize: 13 }}>$</span>
                <input
                  type="number"
                  min={0}
                  max={players[selectedOpponent]?.money ?? 0}
                  value={toMoney}
                  onChange={(e) =>
                    setToMoney(
                      Math.min(
                        players[selectedOpponent]?.money ?? 0,
                        Math.max(0, Number(e.target.value))
                      )
                    )
                  }
                  style={inputStyle}
                />
              </div>
            </div>
          </div>
        )}

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 8,
          }}
        >
          <button
            onClick={proposeTrade}
            disabled={!canPropose || waitingOnMyOffer}
            style={{
              backgroundColor: "#805ad5",
              color: "white",
              padding: "12px 32px",
              fontSize: 16,
            }}
          >
            Propose Trade
          </button>
          {status && (
            <div
              style={{
                marginTop: 8,
                padding: "6px 16px",
                borderRadius: 999,
                fontWeight: 800,
                fontSize: 18,
                color:
                  status === "accepted"
                    ? "#c6f6d5"
                    : status === "cancelled"
                    ? "#e2e8f0"
                    : "#fed7d7",
                backgroundColor:
                  status === "accepted"
                    ? "rgba(56,161,105,0.5)"
                    : status === "cancelled"
                    ? "rgba(113,128,150,0.45)"
                    : "rgba(229,62,62,0.5)",
                textTransform: "uppercase",
              }}
            >
              {status === "accepted"
                ? "Trade Accepted"
                : status === "cancelled"
                ? "Offer Withdrawn"
                : "Trade Declined"}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PropertyChip({
  space,
  selected,
  onClick,
}: {
  space: BoardSpace;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        backgroundColor: selected
          ? "rgba(255,255,255,0.25)"
          : "rgba(255,255,255,0.06)",
        border: selected ? "2px solid #f6e05e" : "2px solid transparent",
        borderRadius: 6,
        padding: "4px 8px",
        color: "white",
        fontSize: 11,
        display: "flex",
        alignItems: "center",
        gap: 4,
      }}
    >
      {space.mortgaged && (
        <span style={{ color: "#fc8181", fontSize: 9 }}>M</span>
      )}
      {space.name}
    </button>
  );
}

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  backgroundColor: "rgba(0,0,0,0.6)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: `max(12px, env(safe-area-inset-top, 0px)) max(12px, env(safe-area-inset-right, 0px)) max(12px, env(safe-area-inset-bottom, 0px)) max(12px, env(safe-area-inset-left, 0px))`,
  boxSizing: "border-box",
  // Sit above the BuyModal (z 100) so the user can open Trade while
  // they're being prompted to buy a property they can't afford.
  zIndex: 110,
};

const modalStyle: React.CSSProperties = {
  backgroundColor: "#2d3748",
  borderRadius: 12,
  padding: 24,
  display: "flex",
  flexDirection: "column",
  gap: 16,
  boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
  width: "min(700px, calc(100vw - 24px))",
  maxWidth: "calc(100vw - 24px)",
  minWidth: 0,
  maxHeight: "min(85vh, 100dvh - 24px)",
  overflowY: "auto",
  overflowX: "hidden",
  boxSizing: "border-box",
  overscrollBehavior: "contain",
  WebkitOverflowScrolling: "touch",
};

/** Phones: tighter padding, full usable width */
const modalStyleNarrow: React.CSSProperties = {
  padding: 14,
  gap: 12,
  width: "100%",
  maxWidth: "100%",
  maxHeight: "min(90dvh, 100dvh - 16px)",
};

const inputStyle: React.CSSProperties = {
  backgroundColor: "rgba(255,255,255,0.1)",
  border: "1px solid rgba(255,255,255,0.2)",
  borderRadius: 6,
  color: "white",
  padding: "6px 10px",
  fontSize: 14,
  width: 100,
};
