import { BOARD_HEIGHT, BOARD_WIDTH } from "../game/boardDimensions";
import type { BoardSpace, Player } from "../types/game";
import { PLAYER_TOKEN_IMAGES, imageUrl, seatDisplayName } from "../types/game";

interface BoardProps {
  board: BoardSpace[];
  players: Player[];
}

/**
 * The Board component is now purely presentational: it renders tokens at the
 * positions in ``players`` with a short CSS transition so single-space moves
 * look smooth. Step-by-step walking is driven by the parent (useGameAnimator)
 * which updates ``boardPosition`` once per step at a fixed cadence.
 */
export default function Board({ board, players }: BoardProps) {
  return (
    <div
      className="board-container"
      style={{
        position: "relative",
        width: BOARD_WIDTH,
        height: BOARD_HEIGHT,
        flexShrink: 0,
      }}
    >
      <img
        src={imageUrl("finalboard.png")}
        alt="Monkopoly Board"
        style={{ width: BOARD_WIDTH, height: BOARD_HEIGHT, display: "block" }}
        draggable={false}
      />

      {board.map((space) => {
        if (space.owner === null || space.type !== "property") return null;
        const ownerPlayer = players[space.owner];
        if (!ownerPlayer) return null;
        const style = getOwnerIndicatorStyle(space);
        if (!style) return null;
        return (
          <div
            key={`owner-${space.number}`}
            style={{
              position: "absolute",
              backgroundColor: ownerPlayer.color,
              ...style,
            }}
          />
        );
      })}

      {board.map((space) => {
        if (!space.mortgaged || space.owner === null) return null;
        const pos = getMortgagedPosition(space);
        if (!pos) return null;
        return (
          <div
            key={`mort-${space.number}`}
            style={{
              position: "absolute",
              left: pos.x,
              top: pos.y,
              backgroundColor: "#e53e3e",
              color: "white",
              fontSize: 9,
              fontWeight: 700,
              padding: "1px 3px",
              borderRadius: 2,
            }}
          >
            MORTGAGED
          </div>
        );
      })}

      {board.map((space) => {
        if (space.houses <= 0 || space.subtype !== "property") return null;
        const pos = getHousePosition(space);
        if (!pos) return null;
        const imgFile = getHouseImageFile(space.number, space.houses);
        if (!imgFile) return null;
        return (
          <img
            key={`house-${space.number}`}
            src={imageUrl(imgFile)}
            alt={space.houses === 5 ? "Hotel" : `${space.houses} houses`}
            style={{
              position: "absolute",
              left: pos.x,
              top: pos.y,
              pointerEvents: "none",
              zIndex: 5,
            }}
            draggable={false}
          />
        );
      })}

      {players.map((player, idx) => {
        // Resigned players are out of the game — their token shouldn't
        // sit on the board cluttering things up. Their PlayerPanel card
        // dims out and shows "RESIGNED" instead.
        if (player.resigned) return null;
        const space = board[player.boardPosition];
        if (!space) return null;
        const offset = getPlayerOffset(idx, players, player.boardPosition);
        const x = space.x + offset.dx - 12;
        const y = space.y + offset.dy - 12;
        return (
          <img
            key={`player-${player.number}`}
            src={imageUrl(PLAYER_TOKEN_IMAGES[player.number])}
            alt={`${seatDisplayName(player.number, null)} token`}
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              width: 28,
              height: 26,
              // Use transform (GPU-composited) instead of left/top transitions
              // to avoid paint artifacts that leave a "trail" of the token at
              // each intermediate step while moving.
              transform: `translate3d(${x}px, ${y}px, 0)`,
              // Keep this in sync with STEP_MS in useGameAnimator.ts so the
              // CSS transition lines up exactly with the JS-driven stepping.
              transition: "transform 0.3s ease",
              willChange: "transform",
              zIndex: 10 + idx,
              filter: "drop-shadow(1px 1px 2px rgba(0,0,0,0.5))",
            }}
            draggable={false}
          />
        );
      })}
    </div>
  );
}

function getPlayerOffset(
  playerIdx: number,
  players: Player[],
  boardPosition: number
): { dx: number; dy: number } {
  const sameSpace = players.filter((p) => p.boardPosition === boardPosition);
  const posInGroup = sameSpace.findIndex((p) => p.number === playerIdx);

  if (boardPosition <= 10) {
    const offsets = [
      { dx: 0, dy: 0 },
      { dx: 0, dy: -25 },
      { dx: 0, dy: -50 },
      { dx: 0, dy: -75 },
    ];
    return offsets[posInGroup] || { dx: 0, dy: 0 };
  }
  if (boardPosition <= 20) {
    const offsets = [
      { dx: 0, dy: 0 },
      { dx: 25, dy: 0 },
      { dx: 50, dy: 0 },
      { dx: 75, dy: 0 },
    ];
    return offsets[posInGroup] || { dx: 0, dy: 0 };
  }
  if (boardPosition <= 30) {
    const offsets = [
      { dx: 0, dy: 0 },
      { dx: 0, dy: 25 },
      { dx: 0, dy: 50 },
      { dx: 0, dy: 75 },
    ];
    return offsets[posInGroup] || { dx: 0, dy: 0 };
  }
  const offsets = [
    { dx: 0, dy: 0 },
    { dx: -25, dy: 0 },
    { dx: -50, dy: 0 },
    { dx: -75, dy: 0 },
  ];
  return offsets[posInGroup] || { dx: 0, dy: 0 };
}

function getOwnerIndicatorStyle(space: BoardSpace): React.CSSProperties | null {
  const n = space.number;
  if (n >= 0 && n <= 10) {
    return { left: space.x - 12, top: space.y - 98, width: 48, height: 10 };
  }
  if (n >= 11 && n <= 20) {
    return { left: space.x + 108, top: space.y - 16, width: 10, height: 48 };
  }
  if (n >= 21 && n <= 30) {
    return { left: space.x - 18, top: space.y + 104, width: 48, height: 10 };
  }
  if (n >= 31 && n <= 39) {
    return { left: space.x - 92, top: space.y - 20, width: 10, height: 48 };
  }
  return null;
}

function getMortgagedPosition(space: BoardSpace): { x: number; y: number } | null {
  // The "MORTGAGED" pill is rendered ~55px wide × ~13px tall (fontSize 9 with
  // padding). On bottom/top rows we anchor it horizontally against the same
  // cord/space.x as the property's player slot; on the side columns we offset
  // far enough left/right to land on the card body rather than the corner
  // space next to it.
  const n = space.number;
  if (n >= 0 && n <= 10) return { x: space.x - 20, y: space.y - 40 };
  if (n >= 11 && n <= 20) return { x: space.x + 4, y: space.y + 2 };
  if (n >= 21 && n <= 30) return { x: space.x - 27, y: space.y + 36 };
  if (n >= 31 && n <= 39) return { x: space.x - 66, y: space.y - 1 };
  return null;
}

function getHousePosition(space: BoardSpace): { x: number; y: number } | null {
  // Offsets transcribed from the original tkinter game (Objects.py add_house),
  // adjusted from window-coords to board-relative coords (the original placed
  // house labels in ``gui`` while the board sits inside ``frame`` offset by
  // about (107, 6) within the 950x750 window). The values below put the house
  // image on the colored band of each property on each side of the board.
  const n = space.number;
  if (n >= 0 && n <= 10) return { x: space.x - 15, y: space.y - 86 };
  if (n >= 11 && n <= 20) return { x: space.x + 87, y: space.y - 18 };
  if (n >= 21 && n <= 30) return { x: space.x - 22, y: space.y + 84 };
  if (n >= 31 && n <= 39) return { x: space.x - 79, y: space.y - 21 };
  return null;
}

/**
 * Pick the right tree/hotel image. Top and bottom rows use the "90" variants
 * (trees laid out horizontally) and the left and right columns use the no-90
 * variants (trees stacked vertically). 1 house always uses the plain 1tree
 * image since there is no "_2" variant for a single tree.
 */
function getHouseImageFile(spaceNumber: number, houses: number): string | null {
  if (houses <= 0) return null;
  const isHorizontalRow =
    (spaceNumber >= 0 && spaceNumber <= 10) || (spaceNumber >= 21 && spaceNumber <= 30);
  if (houses === 5) {
    return isHorizontalRow ? "hotel490.png" : "hotel4.png";
  }
  if (isHorizontalRow) {
    if (houses === 1) return "1tree90.png";
    return `${houses}tree90_2.png`;
  }
  if (houses === 1) return "1tree.png";
  return `${houses}tree_2.png`;
}
