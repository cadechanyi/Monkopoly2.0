import { useEffect, useRef, useState } from "react";
import type { BoardSpace, GameEvent, GameState, Player } from "../types/game";

// All durations are in milliseconds. Tweak these to retune the pacing.
const DICE_SHAKE_MS = 12 * 120 + 200; // matches DiceDisplay shake timeline
const STEP_MS = 300;                  // one board space per step
const CASH_FLASH_MS = 400;            // brief +$/-$ message flash
const RENT_PAUSE_MS = 600;            // pause after rent so the user reads it
const BUY_PAUSE_MS = 550;             // pause after token arrives, before
                                      // ownership stripe paints (AI buys)
const AI_TRADE_BANNER_MS = 2600;      // how long the "AI X traded with AI Y"
                                      // banner stays visible
const HOUSE_BUILD_MS = 240;           // pause between each AI house going up
                                      // so they pop into view one at a time
const RESIGN_BANNER_MS = 2400;        // how long the "AI X resigned" banner
                                      // stays up before play continues

/**
 * useGameAnimator — async event-queue animator.
 *
 * The server sends each update as ``{ state, events[] }``. Naively rendering
 * the new state immediately makes modals (buy/chest) appear at the same time
 * the dice start spinning — long before the token has actually arrived on
 * the property. This hook fixes that by processing events one-at-a-time:
 *
 *   dice_roll  -> show new dice, wait for shake          (~1.6s)
 *   move       -> walk token from `from` to `to` one space at a time
 *                 (180ms per step), holding the rest of the queue
 *   pass_go    -> brief cash flash
 *   cash       -> brief +/- flash
 *   rent_paid  -> short pause so the user can read it
 *   <other>    -> non-blocking; final state will reflect it
 *
 * While anything is in flight, ``isAnimating`` is true. The UI gates buy /
 * chest modals on ``!isAnimating`` so they only ever show after the token
 * has finished moving.
 */
export interface AiTradeBanner {
  fromPlayer: number;
  toPlayer: number;
  fromProperties: number[];
  toProperties: number[];
  fromMoney: number;
  toMoney: number;
}

export interface ResignBanner {
  player: number;
  creditor: number | null;
  transferredProperties: number[];
  voidedProperties: number[];
  moneyTransferred: number;
}

export interface AnimatorState {
  displayPlayers: Player[];
  displayBoard: BoardSpace[];
  displayDice: [number, number];
  isAnimating: boolean;
  /**
   * Seat whose actions are being animated (from this batch's events). The
   * server's ``turn`` may already point at the next player after an AI
   * auto-advances, so UI highlights use this while ``isAnimating`` is true.
   */
  actingTurnSeat: number | null;
  message: string;
  aiTradeBanner: AiTradeBanner | null;
  resignBanner: ResignBanner | null;
}

interface QueuedUpdate {
  events: GameEvent[];
  finalState: GameState;
}

export function useGameAnimator(
  serverState: GameState | null,
  events: GameEvent[]
): AnimatorState {
  const [displayPlayers, setDisplayPlayers] = useState<Player[]>(
    serverState?.players ?? []
  );
  const [displayBoard, setDisplayBoard] = useState<BoardSpace[]>(
    serverState?.board ?? []
  );
  const [displayDice, setDisplayDice] = useState<[number, number]>(
    serverState?.dice ?? [0, 0]
  );
  const [isAnimating, setIsAnimating] = useState(false);
  const [actingTurnSeat, setActingTurnSeat] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [aiTradeBanner, setAiTradeBanner] = useState<AiTradeBanner | null>(
    null
  );
  const [resignBanner, setResignBanner] = useState<ResignBanner | null>(null);

  const queueRef = useRef<QueuedUpdate[]>([]);
  const processingRef = useRef(false);
  const lastEventsRef = useRef<GameEvent[] | null>(null);
  const lastFinalStateRef = useRef<GameState | null>(null);
  const cancelledRef = useRef(false);

  // Initial sync: when we first receive a state, paint it without animation.
  useEffect(() => {
    if (!serverState) return;
    if (lastFinalStateRef.current !== null) return;
    lastFinalStateRef.current = serverState;
    setDisplayPlayers(serverState.players);
    setDisplayBoard(serverState.board);
    setDisplayDice(serverState.dice);
  }, [serverState]);

  // Whenever a new ``events`` array arrives, queue it for animation.
  useEffect(() => {
    if (!serverState) return;
    if (events === lastEventsRef.current) return;
    lastEventsRef.current = events;

    // Filter out trivial / no-op updates so we don't spuriously flip
    // ``isAnimating`` true and back.
    const animatable = hasAnimatableEvents(events);

    if (!animatable) {
      // No animations to play; bring the display state in sync immediately.
      lastFinalStateRef.current = serverState;
      if (!processingRef.current) {
        setDisplayPlayers(serverState.players);
        setDisplayBoard(serverState.board);
        setDisplayDice(serverState.dice);
      }
      return;
    }

    queueRef.current.push({ events, finalState: serverState });
    if (!processingRef.current) {
      void drainQueue();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, serverState]);

  useEffect(() => {
    // Reset on (re)mount so StrictMode's mount -> cleanup -> remount cycle in
    // dev doesn't leave us permanently cancelled. This pattern is also
    // production-safe: in prod the effect only runs once.
    cancelledRef.current = false;
    return () => {
      cancelledRef.current = true;
    };
  }, []);

  async function drainQueue(): Promise<void> {
    processingRef.current = true;
    setIsAnimating(true);

    try {
      while (queueRef.current.length > 0) {
        const item = queueRef.current.shift()!;
        setActingTurnSeat(primaryActorFromEvents(item.events));
        await playEvents(item.events, item.finalState);
        if (cancelledRef.current) return;
        // After each update, sync display state to that update's final state
        // so non-position fields (money, ownership, houses) catch up.
        lastFinalStateRef.current = item.finalState;
        setDisplayPlayers(item.finalState.players);
        setDisplayBoard(item.finalState.board);
        setDisplayDice(item.finalState.dice);
      }
    } finally {
      processingRef.current = false;
      if (!cancelledRef.current) {
        setIsAnimating(false);
        setActingTurnSeat(null);
        setMessage("");
      }
    }
  }

  async function playEvents(
    events: GameEvent[],
    finalState: GameState
  ): Promise<void> {
    for (const event of events) {
      if (cancelledRef.current) return;
      switch (event.type) {
        case "dice_roll": {
          const dice = (event.dice as number[]).slice(0, 2) as [number, number];
          setDisplayDice(dice);
          await wait(DICE_SHAKE_MS);
          break;
        }
        case "move": {
          const playerNum = event.player as number;
          const from = event.from as number;
          const to = event.to as number;
          const boardSize = finalState.board.length || 40;

          let pos = from;
          while (pos !== to) {
            if (cancelledRef.current) return;
            pos = (pos + 1) % boardSize;
            const stepPos = pos;
            setDisplayPlayers((prev) => bumpPosition(prev, playerNum, stepPos));
            await wait(STEP_MS);
          }
          break;
        }
        case "pass_go": {
          // Credit the +$200 the moment the message appears so the player
          // panel reflects the new balance as the bonus is announced
          // (not before they start moving, and not after the whole queue).
          const playerNum = event.player as number;
          const newMoney = event.money as number;
          setDisplayPlayers((prev) => setPlayerMoney(prev, playerNum, newMoney));
          setMessage("+$200 (passed GO)");
          await wait(CASH_FLASH_MS);
          setMessage("");
          break;
        }
        case "cash": {
          // The ``cash`` event carries a delta (+/-) and a display message.
          // Apply the delta to the player's displayed money at the same
          // instant the flash appears.
          const playerNum = event.player as number;
          const amount = (event.amount as number) ?? 0;
          const msg = (event.message as string) ?? "";
          if (amount !== 0) {
            setDisplayPlayers((prev) => addPlayerMoney(prev, playerNum, amount));
          }
          if (msg) {
            setMessage(msg);
            await wait(CASH_FLASH_MS);
            setMessage("");
          }
          break;
        }
        case "rent_paid": {
          // Move money between tenant and owner the moment the rent text
          // shows, so both player panels visibly update together.
          const rent = event.rent as number;
          const tenantNum = event.tenant as number;
          const ownerNum = event.owner as number;
          const tenantMoney = event.tenantMoney as number;
          const ownerMoney = event.ownerMoney as number;
          setDisplayPlayers((prev) => {
            const next = setPlayerMoney(prev, tenantNum, tenantMoney);
            return setPlayerMoney(next, ownerNum, ownerMoney);
          });
          setMessage(`-$${rent} rent`);
          await wait(RENT_PAUSE_MS);
          setMessage("");
          break;
        }
        case "go_to_jail": {
          // The engine snaps the player to space 10. The previous ``move``
          // event animated them onto Go-To-Brampton; pause briefly so the
          // user sees the message before they teleport.
          setMessage("GO TO BRAMPTON!");
          await wait(CASH_FLASH_MS);
          setMessage("");
          break;
        }
        case "property_bought": {
          // Paint the ownership stripe and debit the buyer at the same
          // moment, right after the token has visually arrived. Without
          // this, the stripe would only appear when the queue item ends
          // (after BUY_PAUSE_MS) and the cost would visibly debit out of
          // step with the rest of the buy animation.
          const playerNum = event.player as number;
          const newMoney = event.money as number;
          const spaceNum = event.space as number;
          setDisplayPlayers((prev) => setPlayerMoney(prev, playerNum, newMoney));
          setDisplayBoard((prev) => setOwner(prev, spaceNum, playerNum));
          await wait(BUY_PAUSE_MS);
          break;
        }
        case "ai_trade_initiated": {
          // Show a banner explaining the AI-to-AI trade for a beat. The
          // ownership stripes will swap when the following ``trade_accepted``
          // event arrives (and the queue-end sync paints the new owners).
          setAiTradeBanner({
            fromPlayer: event.fromPlayer as number,
            toPlayer: event.toPlayer as number,
            fromProperties: (event.fromProperties as number[]) ?? [],
            toProperties: (event.toProperties as number[]) ?? [],
            fromMoney: (event.fromMoney as number) ?? 0,
            toMoney: (event.toMoney as number) ?? 0,
          });
          await wait(AI_TRADE_BANNER_MS);
          setAiTradeBanner(null);
          break;
        }
        case "house_added": {
          // Pop the new house/hotel onto the board the moment it's purchased
          // and debit the buyer in the same instant, then pause so the
          // user sees it before the next house lands. Without this, every
          // house/hotel from a building spree appears at once at the end
          // of the queue (when we sync to ``finalState``).
          const playerNum = event.player as number;
          const newMoney = event.money as number;
          const spaceNum = event.space as number;
          const houses = event.houses as number;
          setDisplayPlayers((prev) => setPlayerMoney(prev, playerNum, newMoney));
          setDisplayBoard((prev) => setHouses(prev, spaceNum, houses));
          await wait(HOUSE_BUILD_MS);
          break;
        }
        case "player_resigned": {
          // Pause the queue while we surface the resignation. The animator
          // queue-end sync will bring everything into line afterward (the
          // resigned player's money/owner stripes/etc. get rewritten by
          // the server's final state); here we just stage the banner and
          // visually flip the resigned flag on the board so the icon dims
          // immediately along with the announcement.
          const playerNum = event.player as number;
          const creditor =
            event.creditor === null || event.creditor === undefined
              ? null
              : (event.creditor as number);
          setDisplayPlayers((prev) => markResigned(prev, playerNum));
          setResignBanner({
            player: playerNum,
            creditor,
            transferredProperties:
              (event.transferredProperties as number[]) ?? [],
            voidedProperties: (event.voidedProperties as number[]) ?? [],
            moneyTransferred: (event.moneyTransferred as number) ?? 0,
          });
          await wait(RESIGN_BANNER_MS);
          setResignBanner(null);
          break;
        }
        case "trade_accepted": {
          // Swap owners on the displayed board the moment the trade is
          // finalized so the colored stripes flip in sync with the banner
          // (or the human-trade modal status).
          const fromPlayer = event.fromPlayer as number;
          const toPlayer = event.toPlayer as number;
          const fromProps = (event.fromProperties as number[]) ?? [];
          const toProps = (event.toProperties as number[]) ?? [];
          const fromMoney = (event.fromMoney as number) ?? 0;
          const toMoney = (event.toMoney as number) ?? 0;
          setDisplayBoard((prev) => {
            let next = prev;
            for (const sp of fromProps) next = setOwner(next, sp, toPlayer);
            for (const sp of toProps) next = setOwner(next, sp, fromPlayer);
            return next;
          });
          if (fromMoney !== 0 || toMoney !== 0) {
            const delta = toMoney - fromMoney;
            setDisplayPlayers((prev) => {
              const next = addPlayerMoney(prev, fromPlayer, delta);
              return addPlayerMoney(next, toPlayer, -delta);
            });
          }
          break;
        }
        default:
          // mortgage, house_added, ai_pass, etc — the final state catches
          // the user up; no animation needed here.
          break;
      }
    }
  }

  return {
    displayPlayers,
    displayBoard,
    displayDice,
    isAnimating,
    actingTurnSeat,
    message,
    aiTradeBanner,
    resignBanner,
  };
}

/** Who this animated batch belongs to (server ``turn`` may already be next). */
function primaryActorFromEvents(events: GameEvent[]): number | null {
  for (const e of events) {
    if (e.type === "dice_roll" && typeof e.player === "number") return e.player;
  }
  for (const e of events) {
    if (e.type === "move" && typeof e.player === "number") return e.player;
  }
  for (const e of events) {
    if (e.type === "pass_go" && typeof e.player === "number") return e.player;
  }
  for (const e of events) {
    if (e.type === "go_to_jail" && typeof e.player === "number") return e.player;
  }
  for (const e of events) {
    if (e.type === "cash" && typeof e.player === "number") return e.player;
  }
  for (const e of events) {
    if (e.type === "rent_paid" && typeof e.tenant === "number") return e.tenant;
  }
  for (const e of events) {
    if (e.type === "ai_trade_initiated" && typeof e.fromPlayer === "number")
      return e.fromPlayer;
  }
  for (const e of events) {
    if (e.type === "house_added" && typeof e.player === "number") return e.player;
  }
  for (const e of events) {
    if (e.type === "player_resigned" && typeof e.player === "number")
      return e.player;
  }
  return null;
}

function hasAnimatableEvents(events: GameEvent[]): boolean {
  return events.some(
    (e) =>
      e.type === "dice_roll" ||
      e.type === "move" ||
      e.type === "pass_go" ||
      e.type === "cash" ||
      e.type === "rent_paid" ||
      e.type === "go_to_jail" ||
      e.type === "ai_trade_initiated" ||
      e.type === "house_added" ||
      e.type === "player_resigned"
  );
}

function bumpPosition(
  players: Player[],
  playerNum: number,
  pos: number
): Player[] {
  const next = players.slice();
  const target = next[playerNum];
  if (target) {
    next[playerNum] = { ...target, boardPosition: pos };
  }
  return next;
}

function setPlayerMoney(
  players: Player[],
  playerNum: number,
  money: number
): Player[] {
  const next = players.slice();
  const target = next[playerNum];
  if (target) {
    next[playerNum] = { ...target, money };
  }
  return next;
}

function addPlayerMoney(
  players: Player[],
  playerNum: number,
  delta: number
): Player[] {
  const next = players.slice();
  const target = next[playerNum];
  if (target) {
    next[playerNum] = { ...target, money: target.money + delta };
  }
  return next;
}

function setOwner(
  board: BoardSpace[],
  spaceNum: number,
  owner: number
): BoardSpace[] {
  const next = board.slice();
  const target = next[spaceNum];
  if (target) {
    next[spaceNum] = { ...target, owner };
  }
  return next;
}

function setHouses(
  board: BoardSpace[],
  spaceNum: number,
  houses: number
): BoardSpace[] {
  const next = board.slice();
  const target = next[spaceNum];
  if (target) {
    next[spaceNum] = { ...target, houses };
  }
  return next;
}

function markResigned(players: Player[], playerNum: number): Player[] {
  const next = players.slice();
  const target = next[playerNum];
  if (target) {
    next[playerNum] = { ...target, resigned: true, money: 0 };
  }
  return next;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
