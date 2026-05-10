import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { BOARD_HEIGHT, BOARD_WIDTH } from "../game/boardDimensions";
import { useBoardSlotScale } from "../hooks/useBoardSlotScale";
import { useMediaQuery } from "../hooks/useMediaQuery";
import "../styles/game-view.css";
import Board from "../components/Board";
import PlayerPanel from "../components/PlayerPanel";
import DiceDisplay from "../components/DiceDisplay";
import ControlPanel from "../components/ControlPanel";
import BuyModal from "../components/BuyModal";
import ChestModal from "../components/ChestModal";
import ManageModal from "../components/ManageModal";
import TradeModal from "../components/TradeModal";
import TradeResponseModal from "../components/TradeResponseModal";
import EndGameModal from "../components/EndGameModal";
import { useGameAnimator } from "../hooks/useGameAnimator";
import type { AiTradeBanner, ResignBanner } from "../hooks/useGameAnimator";
import {
  seatDisplayName,
  type BoardSpace,
  type GameAction,
  type GameEvent,
  type GameState,
  type Player,
  type RoomLobby,
} from "../types/game";

interface GameViewProps {
  gameState: GameState;
  events: GameEvent[];
  seat: number;
  roomCode: string;
  lobby?: RoomLobby | null;
  sendAction: (action: GameAction) => void;
  onExit: () => void;
}

function BoardScaleWrapper({
  scale,
  children,
}: {
  scale: number;
  children: ReactNode;
}) {
  const w = BOARD_WIDTH * scale;
  const h = BOARD_HEIGHT * scale;
  return (
    <div
      style={{
        width: w,
        height: h,
        position: "relative",
        marginLeft: "auto",
        marginRight: "auto",
        flexShrink: 0,
      }}
    >
      <div
        style={{
          width: BOARD_WIDTH,
          height: BOARD_HEIGHT,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
          position: "absolute",
          left: 0,
          top: 0,
        }}
      >
        {children}
      </div>
    </div>
  );
}

export default function GameView({
  gameState,
  events,
  seat,
  roomCode,
  lobby,
  sendAction,
  onExit,
}: GameViewProps) {
  const [showManage, setShowManage] = useState(false);
  const [showTrade, setShowTrade] = useState(false);
  const [tradeStatus, setTradeStatus] = useState<
    "accepted" | "denied" | "cancelled" | null
  >(null);
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [showResignConfirm, setShowResignConfirm] = useState(false);
  const [endVote, setEndVote] = useState<{
    proposer: number;
    approvals: number[];
    requiredSeats: number[];
  } | null>(null);

  // The animator owns all in-flight motion: dice shake, token stepping, cash
  // flashes. While `isAnimating` is true we hold modals back so the buy/chest
  // prompt only ever appears after the token actually arrives on the space.
  const {
    displayPlayers,
    displayBoard,
    displayDice,
    isAnimating,
    actingTurnSeat,
    message,
    aiTradeBanner,
    resignBanner,
  } = useGameAnimator(gameState, events);

  const turnHighlightSeat =
    isAnimating && actingTurnSeat !== null ? actingTurnSeat : gameState.turn;

  const chestType = useMemo(() => {
    const chestEvent = events.find((e) => e.type === "chest_card");
    return (chestEvent?.chestType as string) ?? "baboon_bin";
  }, [events]);

  useEffect(() => {
    const last = [...events]
      .reverse()
      .find(
        (e) =>
          e.type === "trade_accepted" ||
          e.type === "trade_denied" ||
          e.type === "trade_cancelled"
      );
    if (!last) return;
    if (last.type === "trade_accepted") setTradeStatus("accepted");
    else if (last.type === "trade_cancelled") setTradeStatus("cancelled");
    else setTradeStatus("denied");
  }, [events]);

  useEffect(() => {
    if (!tradeStatus) return;
    const timer = setTimeout(() => {
      setShowTrade(false);
      setTradeStatus(null);
    }, 1000);
    return () => clearTimeout(timer);
  }, [tradeStatus]);

  useEffect(() => {
    const lastVoteEvent = [...events]
      .reverse()
      .find((e) =>
        [
          "end_game_vote_started",
          "end_game_vote_progress",
          "end_game_vote_cancelled",
          "end_game_vote_passed",
          "game_over",
        ].includes(String(e.type))
      );
    if (!lastVoteEvent) return;
    const type = String(lastVoteEvent.type);
    if (type === "end_game_vote_started" || type === "end_game_vote_progress") {
      setEndVote({
        proposer: Number(lastVoteEvent.proposer),
        approvals: ((lastVoteEvent.approvals as number[] | undefined) ?? []).map(Number),
        requiredSeats: ((lastVoteEvent.requiredSeats as number[] | undefined) ?? []).map(Number),
      });
      return;
    }
    setEndVote(null);
  }, [events]);

  // Build a names array indexed by seat for the panels/modals.
  const names = useMemo<(string | null)[]>(() => {
    const arr: (string | null)[] = [null, null, null, null];
    if (lobby) {
      lobby.players.forEach((p) => {
        arr[p.seat] = p.name;
      });
    }
    return arr;
  }, [lobby]);

  const me = gameState.players[seat];

  // ``gameState.turn`` always points at the player whose turn is in progress
  // (the engine no longer advances it during the dice roll). So the landing
  // player — who owns the buy/chest prompt — is just the current player.
  const landingSeat = gameState.turn;

  // Modals are gated on the animator: `isAnimating` is true while the dice
  // are shaking, the token is walking, or a cash flash is playing.
  const buySpace =
    !isAnimating &&
    gameState.phase === "waiting_for_buy" &&
    gameState.buyProperty !== null &&
    landingSeat === seat
      ? gameState.board[gameState.buyProperty]
      : null;

  // Chest modal: visible to the player who landed (always), AND to any human
  // player when an AI landed — humans ack on the AI's behalf so the game
  // doesn't deadlock. The server applies the card to whoever actually landed.
  const landedPlayer = gameState.players[landingSeat];
  const landedIsAi = landedPlayer ? !landedPlayer.isHuman : false;
  const iAmHuman = me ? me.isHuman : false;
  const showChestModal =
    !isAnimating &&
    gameState.phase === "waiting_for_chest" &&
    gameState.chestCard !== null &&
    (landingSeat === seat || (landedIsAi && iAmHuman));

  const diceMessage = message || gameState.message;

  const pendingTrade = gameState.pendingTrade ?? null;
  const incomingTrade =
    pendingTrade !== null &&
    pendingTrade.toPlayer === seat &&
    pendingTrade.fromPlayer !== seat;

  const isMobileLayout = useMediaQuery("(max-width: 960px)");
  const boardSlotRef = useRef<HTMLDivElement>(null);
  const boardScale = useBoardSlotScale(
    boardSlotRef,
    isMobileLayout,
    BOARD_WIDTH,
    BOARD_HEIGHT
  );

  return (
    <div
      className={`game-view${isMobileLayout ? " game-view--mobile" : ""}`}
    >
      {/*
        PlayerPanel reads from ``displayPlayers`` (animator-driven) rather
        than ``gameState.players`` (latest server state). The animator only
        snaps a queue item's final money/houses/etc. AFTER that item's
        animations have finished, so the panel's $ values stay in lock-step
        with what the user is seeing on the board: rent only deducts when
        the token actually arrives, the +$200 GO bonus only credits after
        the token has crossed GO, and an AI's purchase only debits when the
        ownership stripe paints over the property.
      */}
      <PlayerPanel
        players={displayPlayers}
        currentTurn={turnHighlightSeat}
        mySeat={seat}
        names={names}
        layout={isMobileLayout ? "topStrip" : "corners"}
      />

      {isMobileLayout ? (
        <div ref={boardSlotRef} className="game-view__board-slot">
          <BoardScaleWrapper scale={boardScale}>
            <Board board={displayBoard} players={displayPlayers} />
          </BoardScaleWrapper>
        </div>
      ) : (
        <Board board={displayBoard} players={displayPlayers} />
      )}

      <div
        className={
          isMobileLayout
            ? "game-view__mobile-bottom"
            : "game-view__controls-column"
        }
      >
        {roomCode && (
          <div
            className={isMobileLayout ? "game-view-room" : undefined}
            style={{
              fontSize: isMobileLayout ? 10 : 11,
              color: "#a0aec0",
              letterSpacing: isMobileLayout ? 1 : 1.5,
              textTransform: "uppercase",
              textAlign: isMobileLayout ? "center" : undefined,
            }}
          >
            Room:{" "}
            <span
              style={{
                color: "#f7fafc",
                letterSpacing: isMobileLayout ? 2 : 3,
              }}
            >
              {roomCode}
            </span>
          </div>
        )}

        <DiceDisplay
          dice={displayDice}
          doubles={gameState.doubles}
          message={diceMessage}
          compact={isMobileLayout}
        />

        <ControlPanel
          gameState={gameState}
          mySeat={seat}
          isAnimating={isAnimating}
          actingTurnSeat={actingTurnSeat}
          sendAction={sendAction}
          onManage={() => setShowManage(true)}
          onTrade={() => setShowTrade(true)}
          onEndGame={() => setShowEndConfirm(true)}
          onResign={() => setShowResignConfirm(true)}
          mobileBottomBar={isMobileLayout}
        />
      </div>

      {buySpace && me && (
        <BuyModal space={buySpace} player={me} sendAction={sendAction} />
      )}

      {showChestModal && gameState.chestCard && (
        <ChestModal
          card={gameState.chestCard}
          chestType={chestType}
          sendAction={sendAction}
        />
      )}

      {showManage && me && (
        <ManageModal
          board={gameState.board}
          player={me}
          sendAction={sendAction}
          onClose={() => setShowManage(false)}
        />
      )}

      {showTrade && (
        <TradeModal
          board={gameState.board}
          players={gameState.players}
          mySeat={seat}
          names={names}
          sendAction={sendAction}
          status={tradeStatus}
          pendingTrade={pendingTrade}
          onClose={() => setShowTrade(false)}
        />
      )}

      {incomingTrade && pendingTrade && (
        <TradeResponseModal
          pendingTrade={pendingTrade}
          board={gameState.board}
          names={names}
          sendAction={sendAction}
        />
      )}

      {gameState.gameOver && !isAnimating && (
        <EndGameModal
          players={gameState.players}
          mySeat={seat}
          names={names}
          onExit={onExit}
        />
      )}

      {aiTradeBanner && (
        <AiTradeBannerView
          banner={aiTradeBanner}
          players={gameState.players}
          board={gameState.board}
          names={names}
        />
      )}

      {resignBanner && (
        <ResignBannerView
          banner={resignBanner}
          players={gameState.players}
          names={names}
        />
      )}

      {showResignConfirm && (
        <div
          className="game-view-modal-backdrop"
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0,0,0,0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 130,
          }}
        >
          <div
            className="game-view-modal-panel"
            style={{
              backgroundColor: "#2d3748",
              borderRadius: 12,
              padding: 24,
              display: "flex",
              flexDirection: "column",
              gap: 16,
              boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
            }}
          >
            <h3
              style={{
                margin: 0,
                color: "#fed7d7",
                fontSize: 20,
                textAlign: "center",
              }}
            >
              Resign from the game?
            </h3>
            <p
              style={{
                margin: 0,
                color: "#cbd5e0",
                fontSize: 13,
                lineHeight: 1.5,
                textAlign: "center",
              }}
            >
              You'll forfeit the match. Anything you owe goes to your
              creditor; everything else you owned reverts to the bank.
            </p>
            <div style={{ display: "flex", justifyContent: "center", gap: 12 }}>
              <button
                onClick={() => {
                  sendAction({ action: "resign" });
                  setShowResignConfirm(false);
                }}
                style={{
                  backgroundColor: "#9b2c2c",
                  color: "white",
                  padding: "10px 24px",
                  fontSize: 16,
                }}
              >
                Yes, resign
              </button>
              <button
                onClick={() => setShowResignConfirm(false)}
                style={{
                  backgroundColor: "#718096",
                  color: "white",
                  padding: "10px 24px",
                  fontSize: 16,
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {showEndConfirm && (
        <div
          className="game-view-modal-backdrop"
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0,0,0,0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 120,
          }}
        >
          <div
            className="game-view-modal-panel"
            style={{
              backgroundColor: "#2d3748",
              borderRadius: 12,
              padding: 24,
              display: "flex",
              flexDirection: "column",
              gap: 16,
              boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
            }}
          >
            <h3
              style={{
                margin: 0,
                color: "white",
                fontSize: 20,
                textAlign: "center",
              }}
            >
              Request to end the game?
            </h3>
            <p
              style={{
                margin: 0,
                color: "#cbd5e0",
                fontSize: 13,
                textAlign: "center",
              }}
            >
              Connected players will be asked to agree or disagree. If you're
              the only connected human, the game ends immediately.
            </p>
            <div style={{ display: "flex", justifyContent: "center", gap: 12 }}>
              <button
                onClick={() => {
                  sendAction({ action: "end_game" });
                  setShowEndConfirm(false);
                }}
                style={{
                  backgroundColor: "#e53e3e",
                  color: "white",
                  padding: "10px 24px",
                  fontSize: 16,
                }}
              >
                Send Request
              </button>
              <button
                onClick={() => setShowEndConfirm(false)}
                style={{
                  backgroundColor: "#718096",
                  color: "white",
                  padding: "10px 24px",
                  fontSize: 16,
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {endVote && !gameState.gameOver && (
        <div
          className="game-view-modal-backdrop"
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0,0,0,0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 125,
          }}
        >
          <div
            className="game-view-modal-panel"
            style={{
              backgroundColor: "#2d3748",
              borderRadius: 12,
              padding: 24,
              display: "flex",
              flexDirection: "column",
              gap: 14,
              boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
            }}
          >
            <h3 style={{ margin: 0, color: "white", textAlign: "center" }}>
              End Game Vote
            </h3>
            <p style={{ margin: 0, color: "#cbd5e0", textAlign: "center", fontSize: 14 }}>
              {seatDisplayName(endVote.proposer, names[endVote.proposer])} wants to end the game.
            </p>
            <p style={{ margin: 0, color: "#a0aec0", textAlign: "center", fontSize: 12 }}>
              {endVote.approvals.length}/{endVote.requiredSeats.length} approvals
            </p>
            {endVote.requiredSeats.includes(seat) && seat !== endVote.proposer ? (
              <div style={{ display: "flex", justifyContent: "center", gap: 12 }}>
                <button
                  onClick={() => sendAction({ action: "end_game_vote", agree: true })}
                  style={{
                    backgroundColor: "#38a169",
                    color: "white",
                    padding: "10px 24px",
                    fontSize: 16,
                  }}
                >
                  Agree
                </button>
                <button
                  onClick={() => sendAction({ action: "end_game_vote", agree: false })}
                  style={{
                    backgroundColor: "#e53e3e",
                    color: "white",
                    padding: "10px 24px",
                    fontSize: 16,
                  }}
                >
                  Disagree
                </button>
              </div>
            ) : (
              <p style={{ margin: 0, color: "#e2e8f0", textAlign: "center", fontSize: 13 }}>
                Waiting for other players to vote...
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

interface AiTradeBannerViewProps {
  banner: AiTradeBanner;
  players: Player[];
  board: BoardSpace[];
  names: (string | null)[];
}

/**
 * A transient banner overlay announcing an AI-to-AI trade. It explains who
 * traded with whom and what each side gave up. Mounted by ``GameView`` only
 * while ``aiTradeBanner`` is non-null; the animator hides it after a fixed
 * delay (see ``AI_TRADE_BANNER_MS`` in useGameAnimator.ts).
 */
function AiTradeBannerView({
  banner,
  players,
  board,
  names,
}: AiTradeBannerViewProps) {
  const fromPlayer = players[banner.fromPlayer];
  const toPlayer = players[banner.toPlayer];
  if (!fromPlayer || !toPlayer) return null;

  const fromName = seatDisplayName(banner.fromPlayer, names[banner.fromPlayer]);
  const toName = seatDisplayName(banner.toPlayer, names[banner.toPlayer]);

  const propertyNames = (nums: number[]) =>
    nums.map((n) => board[n]?.name ?? `#${n}`);

  const fromGives = [
    ...propertyNames(banner.fromProperties),
    ...(banner.fromMoney > 0 ? [`$${banner.fromMoney}`] : []),
  ];
  const toGives = [
    ...propertyNames(banner.toProperties),
    ...(banner.toMoney > 0 ? [`$${banner.toMoney}`] : []),
  ];

  const renderSide = (
    name: string,
    color: string,
    gives: string[],
    label: string
  ) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div
        style={{
          fontSize: 11,
          color: "#cbd5e0",
          letterSpacing: 1.2,
          textTransform: "uppercase",
        }}
      >
        {label}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span
          style={{
            display: "inline-block",
            width: 10,
            height: 10,
            borderRadius: "50%",
            backgroundColor: color,
            boxShadow: `0 0 6px ${color}`,
          }}
        />
        <span
          style={{
            color,
            fontWeight: 800,
            fontSize: 15,
            textTransform: "uppercase",
            letterSpacing: 0.5,
          }}
        >
          {name}
        </span>
      </div>
      <div style={{ color: "white", fontSize: 14, fontWeight: 600 }}>
        {gives.length > 0 ? gives.join(", ") : "—"}
      </div>
    </div>
  );

  return (
    <div
      style={{
        position: "fixed",
        top: 24,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 200,
        backgroundColor: "rgba(20, 25, 40, 0.95)",
        border: "2px solid rgba(255,255,255,0.18)",
        borderRadius: 14,
        padding: "16px 24px",
        boxShadow: "0 12px 40px rgba(0,0,0,0.55)",
        animation: "ai-trade-fade 0.25s ease-out",
        minWidth: 460,
        maxWidth: "90vw",
      }}
    >
      <div
        style={{
          fontSize: 11,
          color: "#f6ad55",
          letterSpacing: 2,
          textTransform: "uppercase",
          textAlign: "center",
          fontWeight: 800,
          marginBottom: 6,
        }}
      >
        AI Trade
      </div>
      <div
        style={{
          color: "white",
          fontSize: 17,
          fontWeight: 700,
          textAlign: "center",
          marginBottom: 14,
        }}
      >
        <span style={{ color: fromPlayer.color }}>{fromName}</span>
        <span style={{ color: "#a0aec0", margin: "0 10px" }}>↔</span>
        <span style={{ color: toPlayer.color }}>{toName}</span>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr auto 1fr",
          gap: 18,
          alignItems: "center",
        }}
      >
        {renderSide(
          fromName,
          fromPlayer.color,
          fromGives,
          `${fromName} gave`
        )}
        <div style={{ color: "#a0aec0", fontSize: 22 }}>→ ←</div>
        {renderSide(toName, toPlayer.color, toGives, `${toName} gave`)}
      </div>
    </div>
  );
}

interface ResignBannerViewProps {
  banner: ResignBanner;
  players: Player[];
  names: (string | null)[];
}

/**
 * Banner explaining that an AI bankrupted out of the game. Mounted by
 * GameView only while the animator's ``resignBanner`` is non-null;
 * the animator clears it after RESIGN_BANNER_MS so play can continue.
 */
function ResignBannerView({
  banner,
  players,
  names,
}: ResignBannerViewProps) {
  const player = players[banner.player];
  if (!player) return null;
  const playerName = seatDisplayName(banner.player, names[banner.player]);
  const creditor = banner.creditor !== null ? players[banner.creditor] : null;
  const creditorName =
    banner.creditor !== null
      ? seatDisplayName(banner.creditor, names[banner.creditor])
      : null;

  const fate =
    creditor && creditorName
      ? `Assets transferred to ${creditorName}`
      : "Assets returned to the bank";

  return (
    <div
      style={{
        position: "fixed",
        top: 24,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 200,
        backgroundColor: "rgba(40, 14, 14, 0.95)",
        border: "2px solid rgba(252, 129, 129, 0.45)",
        borderRadius: 14,
        padding: "16px 24px",
        boxShadow: "0 12px 40px rgba(0,0,0,0.6)",
        animation: "ai-trade-fade 0.25s ease-out",
        minWidth: 380,
        maxWidth: "90vw",
        textAlign: "center",
      }}
    >
      <div
        style={{
          fontSize: 11,
          color: "#fc8181",
          letterSpacing: 2,
          textTransform: "uppercase",
          fontWeight: 800,
          marginBottom: 6,
        }}
      >
        Bankrupt
      </div>
      <div
        style={{
          color: "white",
          fontSize: 18,
          fontWeight: 700,
          marginBottom: 8,
        }}
      >
        <span style={{ color: player.color }}>{playerName}</span>
        <span style={{ color: "#cbd5e0" }}> resigned</span>
      </div>
      <div
        style={{
          color: "#cbd5e0",
          fontSize: 13,
          fontWeight: 600,
          display: "flex",
          flexDirection: "column",
          gap: 2,
        }}
      >
        <div>
          {fate}
          {creditor && (
            <span
              style={{
                color: creditor.color,
                marginLeft: 6,
                fontWeight: 800,
              }}
            >
              ({banner.transferredProperties.length} properties
              {banner.moneyTransferred > 0
                ? `, $${banner.moneyTransferred}`
                : ""}
              )
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
