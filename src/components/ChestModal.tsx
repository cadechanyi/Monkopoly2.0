import type { ChestCard, GameAction } from "../types/game";

interface ChestModalProps {
  card: ChestCard;
  chestType: string;
  sendAction: (action: GameAction) => void;
}

export default function ChestModal({ card, chestType, sendAction }: ChestModalProps) {
  const isBaboon = chestType === "baboon_bin";

  return (
    <div style={overlayStyle}>
      <div
        style={{
          ...modalStyle,
          backgroundColor: isBaboon ? "#5D4037" : "#F9A825",
          color: isBaboon ? "#fff" : "#000",
        }}
      >
        <h3
          style={{
            margin: 0,
            fontSize: 16,
            textTransform: "uppercase",
            opacity: 0.7,
          }}
        >
          {isBaboon ? "Baboon Bin" : "Healthcare Hazard"}
        </h3>

        <p
          style={{
            fontSize: 16,
            lineHeight: 1.5,
            textAlign: "center",
            whiteSpace: "pre-line",
            maxWidth: 300,
            margin: "8px 0",
          }}
        >
          {card.text}
        </p>

        {card.money !== 0 && (
          <div
            style={{
              fontSize: 24,
              fontWeight: 800,
              color: card.money > 0 ? "#38a169" : "#e53e3e",
            }}
          >
            {card.money > 0 ? `+$${card.money}` : `-$${Math.abs(card.money)}`}
          </div>
        )}

        <button
          onClick={() => sendAction({ action: "chest_ack" })}
          style={{
            backgroundColor: isBaboon ? "#8D6E63" : "#FFB300",
            color: isBaboon ? "white" : "black",
            padding: "12px 32px",
            fontSize: 16,
            marginTop: 8,
          }}
        >
          OK
        </button>
      </div>
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  backgroundColor: "rgba(0,0,0,0.6)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 100,
};

const modalStyle: React.CSSProperties = {
  borderRadius: 12,
  padding: 28,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 8,
  boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
  maxWidth: 400,
  minWidth: 300,
};
