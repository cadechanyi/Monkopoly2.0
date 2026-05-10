export interface BoardSpace {
  number: number;
  x: number;
  y: number;
  name: string;
  type: "go" | "property" | "chest" | "tax" | "jail" | "lunch" | "gotojail";
  subtype: "property" | "bus" | "company" | null;
  cost: number;
  rent: number[];
  houseCost: number;
  colorSet: number | null;
  owner: number | null;
  houses: number;
  mortgaged: boolean;
  completeSet: boolean;
}

export interface Player {
  number: number;
  color: string;
  color2: string;
  color3: string;
  isHuman: boolean;
  money: number;
  boardPosition: number;
  previousRoll: number;
  companyCount: number;
  busCount: number;
  resigned: boolean;
  /**
   * 1-based sequence number set by the server when this player resigned.
   * 1 = first to resign, 2 = second, etc. ``null`` for players who never
   * resigned. The end-game leaderboard uses this to rank losers in
   * reverse order (last to resign places higher than first to resign).
   */
  resignationOrder: number | null;
}

export interface ChestCard {
  text: string;
  moveTo: number | null;
  money: number;
}

export type GamePhase =
  | "waiting_for_roll"
  | "waiting_for_buy"
  | "waiting_for_chest"
  | "waiting_for_debt"
  | "waiting_for_end_turn"
  | "ai_turn"
  | "game_over";

/** Human-to-human offer awaiting accept / decline (server `pendingTrade`). */
export interface PendingTrade {
  fromPlayer: number;
  toPlayer: number;
  fromProperties: number[];
  toProperties: number[];
  fromMoney: number;
  toMoney: number;
}

export interface GameState {
  turn: number;
  doubles: boolean;
  dice: [number, number];
  phase: GamePhase;
  message: string;
  chestCard: ChestCard | null;
  buyProperty: number | null;
  gameOver: boolean;
  debtCreditor: number | null;
  /** Present once server supports human trade offers; treat as null if absent. */
  pendingTrade?: PendingTrade | null;
  players: Player[];
  board: BoardSpace[];
  availableActions: string[];
}

export interface GameEvent {
  type: string;
  [key: string]: unknown;
}

export interface RoomLobbyPlayer {
  seat: number;
  name: string | null;
}

export interface RoomSeatSummary {
  seat: number;
  connected: boolean;
  name: string | null;
  resigned: boolean;
  claimable: boolean;
}

export interface RoomLobby {
  code: string;
  mode: "single" | "multi";
  started: boolean;
  hostName: string;
  /** Seat index (0–3) of whoever may start/end game. */
  hostSeat?: number | null;
  seatsSummary?: RoomSeatSummary[];
  players: RoomLobbyPlayer[];
}

export type ServerMessage =
  | {
      type: "joined";
      seat: number;
      code: string;
      mode: "single" | "multi";
      hostSeat?: number | null;
    }
  | { type: "lobby"; room: RoomLobby }
  | { type: "update"; state: GameState; events: GameEvent[] }
  | { type: "error"; message: string };

export type GameAction =
  | { action: "join"; name: string }
  | { action: "start" }
  | { action: "leave" }
  | { action: "roll" }
  | { action: "buy" }
  | { action: "pass" }
  | { action: "chest_ack" }
  | { action: "mortgage"; space: number }
  | { action: "add_house"; space: number }
  | { action: "remove_house"; space: number }
  | {
      action: "propose_trade";
      fromPlayer: number;
      toPlayer: number;
      fromProperties: number[];
      toProperties: number[];
      fromMoney: number;
      toMoney: number;
    }
  | { action: "accept_trade" }
  | { action: "decline_trade" }
  | { action: "cancel_trade" }
  | { action: "end_turn" }
  | { action: "resign" }
  | { action: "end_game" }
  | { action: "end_game_vote"; agree: boolean };

export const COLOR_SET_COLORS: Record<number, string> = {
  1: "#8B4513",
  2: "#87CEEB",
  3: "#DA70D6",
  4: "#FFA500",
  5: "#FF0000",
  6: "#FFFF00",
  7: "#008000",
  8: "#0000FF",
  9: "#FFFFFF",
  10: "#000000",
};

export const PROPERTY_IMAGES: Record<number, string> = {
  1: "caledon.png",
  3: "milton.png",
  5: "waynebus.png",
  6: "angola.png",
  8: "somalia.png",
  9: "chad.png",
  11: "scarborough.png",
  12: "pepsicompany.png",
  13: "Markham.png",
  14: "primarycampus.png",
  15: "jeffbus.png",
  16: "gcp.png",
  18: "mentorlobby.png",
  19: "bhavbarn.png",
  21: "mentorgym.png",
  23: "northkorea.png",
  24: "mentoroffice.png",
  25: "smithbus.png",
  26: "yehiapyramid.png",
  27: "egypt.png",
  28: "cokecompany.png",
  29: "landdownunder.png",
  31: "evancamp.png",
  32: "greenwood.png",
  34: "oakville.png",
  35: "danbus.png",
  37: "crystalcove.png",
  39: "jungleofmonkeys.png",
};

export const PLAYER_TOKEN_IMAGES: Record<number, string> = {
  0: "monkeyfaceblue4.png",
  1: "newmongreen.png",
  2: "newmonred.png",
  3: "newmonpink.png",
};

/** Default seat label when no custom lobby/join name is stored (matches token colors). */
export const PLAYER_SEAT_DISPLAY_NAMES: readonly string[] = [
  "Blue monkey",
  "Green monkey",
  "Red monkey",
  "Pink monkey",
];

export function seatDisplayName(
  seat: number,
  customName: string | null | undefined
): string {
  const trimmed =
    typeof customName === "string" ? customName.trim() : "";
  if (trimmed.length > 0) return trimmed;
  return PLAYER_SEAT_DISPLAY_NAMES[seat] ?? `Seat ${seat + 1}`;
}

export const ASSET_PREFIX = "/assets/images";

export function imageUrl(filename: string): string {
  return `${ASSET_PREFIX}/${filename}`;
}
