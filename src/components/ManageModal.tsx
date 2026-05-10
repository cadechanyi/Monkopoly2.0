import type { BoardSpace, GameAction, Player } from "../types/game";
import { PROPERTY_IMAGES, imageUrl } from "../types/game";

interface ManageModalProps {
  board: BoardSpace[];
  player: Player;
  sendAction: (action: GameAction) => void;
  onClose: () => void;
}

export default function ManageModal({
  board,
  player,
  sendAction,
  onClose,
}: ManageModalProps) {
  const ownedProperties = board.filter(
    (s) => s.owner === player.number && s.type === "property"
  );

  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            width: "100%",
          }}
        >
          <h2 style={{ margin: 0, fontSize: 20, color: "white" }}>
            Manage Properties
          </h2>
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

        {ownedProperties.length === 0 ? (
          <p style={{ color: "#a0aec0", textAlign: "center", padding: 20 }}>
            You don't own any properties yet.
          </p>
        ) : (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 12,
              maxHeight: 500,
              overflowY: "auto",
              padding: "4px 0",
            }}
          >
            {ownedProperties.map((space) => (
              <PropertyCard
                key={space.number}
                space={space}
                player={player}
                sendAction={sendAction}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function PropertyCard({
  space,
  player,
  sendAction,
}: {
  space: BoardSpace;
  player: Player;
  sendAction: (action: GameAction) => void;
}) {
  const imageFile = PROPERTY_IMAGES[space.number];
  const canAddHouse =
    space.subtype === "property" &&
    space.completeSet &&
    !space.mortgaged &&
    space.houses < 5 &&
    player.money >= space.houseCost;
  const canRemoveHouse =
    space.subtype === "property" && space.houses > 0 && !space.mortgaged;
  const canMortgage = !space.mortgaged && space.houses === 0;
  const canUnmortgage =
    space.mortgaged && player.money >= Math.floor((space.cost / 2) * 1.1);

  return (
    <div
      style={{
        backgroundColor: "rgba(255,255,255,0.06)",
        borderRadius: 8,
        padding: 10,
        width: 160,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 6,
        border: space.mortgaged ? "2px solid #e53e3e" : "2px solid transparent",
      }}
    >
      {imageFile && (
        <img
          src={imageUrl(imageFile)}
          alt={space.name}
          style={{ width: 80, height: 92, objectFit: "contain", borderRadius: 4 }}
          draggable={false}
        />
      )}
      <div
        style={{
          fontSize: 12,
          fontWeight: 700,
          color: "white",
          textAlign: "center",
        }}
      >
        {space.name}
      </div>

      {space.houses > 0 && (
        <div
          style={{
            fontSize: 11,
            color: space.houses === 5 ? "#f6ad55" : "#68d391",
          }}
        >
          {space.houses === 5
            ? "Hotel"
            : `${space.houses} house${space.houses > 1 ? "s" : ""}`}
        </div>
      )}
      {space.mortgaged && (
        <div style={{ fontSize: 11, color: "#fc8181", fontWeight: 700 }}>
          MORTGAGED
        </div>
      )}

      <div
        style={{
          display: "flex",
          gap: 4,
          flexWrap: "wrap",
          justifyContent: "center",
        }}
      >
        {canMortgage && (
          <button
            onClick={() => sendAction({ action: "mortgage", space: space.number })}
            style={{
              backgroundColor: "#e53e3e",
              color: "white",
              fontSize: 10,
              padding: "4px 8px",
            }}
          >
            Mortgage
          </button>
        )}
        {canUnmortgage && (
          <button
            onClick={() => sendAction({ action: "mortgage", space: space.number })}
            style={{
              backgroundColor: "#38a169",
              color: "white",
              fontSize: 10,
              padding: "4px 8px",
            }}
          >
            Unmortgage
          </button>
        )}
        {space.subtype === "property" && space.completeSet && (
          <>
            <button
              onClick={() =>
                sendAction({ action: "remove_house", space: space.number })
              }
              disabled={!canRemoveHouse}
              style={{
                backgroundColor: "#dd6b20",
                color: "white",
                fontSize: 10,
                padding: "4px 8px",
              }}
            >
              -House
            </button>
            <button
              onClick={() =>
                sendAction({ action: "add_house", space: space.number })
              }
              disabled={!canAddHouse}
              style={{
                backgroundColor: "#2b6cb0",
                color: "white",
                fontSize: 10,
                padding: "4px 8px",
              }}
            >
              +House
            </button>
          </>
        )}
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
  // Sit above the BuyModal (z 100) so the user can mortgage their way to
  // enough cash to actually buy the property they're being prompted on.
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
  maxWidth: 800,
  maxHeight: "85vh",
  minWidth: 400,
};
