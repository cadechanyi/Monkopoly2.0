import type { CSSProperties } from "react";
import type { GameAction, GameState } from "../types/game";

interface ControlPanelProps {
  gameState: GameState;
  mySeat: number;
  isAnimating: boolean;
  /** Seat whose batch is animating; server ``turn`` may already be the next player. */
  actingTurnSeat: number | null;
  sendAction: (action: GameAction) => void;
  onManage: () => void;
  onTrade: () => void;
  onEndGame: () => void;
  onResign: () => void;
  /** Larger tap targets and full-width panel (stacked mobile, non-bottom-bar) */
  touchLayout?: boolean;
  /** Short grid of actions fixed to bottom of phone layout */
  mobileBottomBar?: boolean;
}

export default function ControlPanel({
  gameState,
  mySeat,
  isAnimating,
  actingTurnSeat,
  sendAction,
  onManage,
  onTrade,
  onEndGame,
  onResign,
  touchLayout = false,
  mobileBottomBar = false,
}: ControlPanelProps) {
  const actions = gameState.availableActions;
  const isAiTurn = gameState.phase === "ai_turn";
  const currentPlayer = gameState.players[gameState.turn];
  const actorSeat =
    isAnimating && actingTurnSeat !== null ? actingTurnSeat : gameState.turn;
  const actorPlayer = gameState.players[actorSeat] ?? currentPlayer;
  const me = gameState.players[mySeat];
  const isMyTurn =
    gameState.turn === mySeat && !isAiTurn && !isAnimating;

  const canRoll = isMyTurn && actions.includes("roll");
  const canEndTurn = isMyTurn && actions.includes("end_turn");
  const canManage = isMyTurn && actions.includes("manage");
  const canTrade = isMyTurn && actions.includes("trade");
  const canEndGame =
    !isAnimating &&
    gameState.phase !== "game_over" &&
    !!me &&
    me.isHuman &&
    !me.resigned;
  const inDebt = gameState.phase === "waiting_for_debt";
  const showDebtUi = inDebt && gameState.turn === mySeat && !isAnimating;
  const canResign = isMyTurn && actions.includes("resign");

  const turnLabel = isAnimating
    ? "Animating..."
    : isAiTurn
      ? "AI…"
      : gameState.phase === "game_over"
        ? "Over"
        : showDebtUi
          ? "Pay debts"
          : gameState.turn === mySeat
            ? "Your turn"
            : `${actorPlayer?.isHuman ? "P" : "AI"}${gameState.turn + 1}`;

  const btnClass =
    touchLayout || mobileBottomBar ? "game-view-touch-button" : undefined;

  const shortBtn: CSSProperties = mobileBottomBar
    ? {
        fontSize: 12,
        padding: "6px 8px",
        minHeight: 34,
      }
    : touchLayout
      ? {
          fontSize: 17,
          padding: "14px 20px",
          minHeight: 48,
        }
      : {};

  if (mobileBottomBar) {
    return (
      <div
        className="game-view__control-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 6,
          padding: "6px 0",
          borderRadius: 10,
          backgroundColor: "rgba(255,255,255,0.07)",
          boxSizing: "border-box",
        }}
      >
        <div
          style={{
            gridColumn: "1 / -1",
            fontSize: 10,
            color: showDebtUi
              ? "#fc8181"
              : isAnimating
                ? actorPlayer?.color ?? "white"
                : isAiTurn
                  ? "#f6ad55"
                  : actorPlayer?.color ?? "white",
            fontWeight: 700,
            textTransform: "uppercase",
            textAlign: "center",
            lineHeight: 1.2,
            padding: "0 4px",
          }}
        >
          {turnLabel}
        </div>

        {showDebtUi && me && (
          <div
            style={{
              gridColumn: "1 / -1",
              fontSize: 9,
              color: "#fed7d7",
              backgroundColor: "rgba(229, 62, 62, 0.18)",
              border: "1px solid rgba(229, 62, 62, 0.6)",
              borderRadius: 6,
              padding: "4px 6px",
              textAlign: "center",
              lineHeight: 1.25,
            }}
          >
            Owe ${Math.abs(me.money)} — mortgage / trade / resign
          </div>
        )}

        <button
          className={btnClass}
          onClick={() => sendAction({ action: "roll" })}
          disabled={!canRoll}
          style={{
            gridColumn: "1 / -1",
            backgroundColor: "#38a169",
            color: "white",
            ...shortBtn,
          }}
        >
          Roll
        </button>

        <button
          className={btnClass}
          onClick={onManage}
          disabled={!canManage}
          style={{ backgroundColor: "#3182ce", color: "white", ...shortBtn }}
        >
          Manage
        </button>

        <button
          className={btnClass}
          onClick={onTrade}
          disabled={!canTrade}
          style={{ backgroundColor: "#805ad5", color: "white", ...shortBtn }}
        >
          Trade
        </button>

        <button
          className={btnClass}
          onClick={() => sendAction({ action: "end_turn" })}
          disabled={!canEndTurn}
          style={{ backgroundColor: "#718096", color: "white", ...shortBtn }}
        >
          End turn
        </button>

        <button
          className={btnClass}
          onClick={onEndGame}
          disabled={!canEndGame}
          style={{ backgroundColor: "#e53e3e", color: "white", ...shortBtn }}
        >
          End game
        </button>

        {showDebtUi && (
          <button
            className={btnClass}
            onClick={onResign}
            disabled={!canResign}
            style={{
              gridColumn: "1 / -1",
              backgroundColor: "#9b2c2c",
              color: "white",
              ...shortBtn,
            }}
          >
            Resign
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: touchLayout ? 10 : 8,
        padding: touchLayout ? "14px 12px" : 16,
        borderRadius: 10,
        backgroundColor: "rgba(255,255,255,0.07)",
        minWidth: touchLayout ? undefined : 180,
        width: touchLayout ? "100%" : undefined,
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          fontSize: 12,
          color: showDebtUi
            ? "#fc8181"
            : isAnimating
              ? actorPlayer?.color ?? "white"
              : isAiTurn
                ? "#f6ad55"
                : actorPlayer?.color ?? "white",
          fontWeight: 700,
          textTransform: "uppercase",
          textAlign: "center",
          marginBottom: 4,
        }}
      >
        {isAnimating
          ? "Animating..."
          : isAiTurn
            ? "AI thinking..."
            : gameState.phase === "game_over"
              ? "Game Over"
              : showDebtUi
                ? "Pay your debts"
                : gameState.turn === mySeat
                  ? "Your Turn"
                  : `${actorPlayer?.isHuman ? "Player" : "AI"} ${gameState.turn + 1}'s Turn`}
      </div>

      {showDebtUi && me && (
        <div
          style={{
            fontSize: 11,
            color: "#fed7d7",
            backgroundColor: "rgba(229, 62, 62, 0.18)",
            border: "1px solid rgba(229, 62, 62, 0.6)",
            borderRadius: 6,
            padding: "6px 8px",
            textAlign: "center",
            lineHeight: 1.35,
          }}
        >
          You owe ${Math.abs(me.money)}. Sell houses, mortgage or trade —
          or Resign.
        </div>
      )}

      <button
        className={btnClass}
        onClick={() => sendAction({ action: "roll" })}
        disabled={!canRoll}
        style={{
          backgroundColor: "#38a169",
          color: "white",
          padding: touchLayout ? "14px 20px" : "12px 24px",
          fontSize: touchLayout ? 17 : 16,
          minHeight: touchLayout ? 48 : undefined,
        }}
      >
        Roll Dice
      </button>

      <button
        className={btnClass}
        onClick={onManage}
        disabled={!canManage}
        style={{
          backgroundColor: "#3182ce",
          color: "white",
          minHeight: touchLayout ? 48 : undefined,
        }}
      >
        Manage
      </button>

      <button
        className={btnClass}
        onClick={onTrade}
        disabled={!canTrade}
        style={{
          backgroundColor: "#805ad5",
          color: "white",
          minHeight: touchLayout ? 48 : undefined,
        }}
      >
        Trade
      </button>

      <button
        className={btnClass}
        onClick={() => sendAction({ action: "end_turn" })}
        disabled={!canEndTurn}
        style={{
          backgroundColor: "#718096",
          color: "white",
          minHeight: touchLayout ? 48 : undefined,
        }}
      >
        End Turn
      </button>

      {showDebtUi && (
        <button
          className={btnClass}
          onClick={onResign}
          disabled={!canResign}
          style={{
            backgroundColor: "#9b2c2c",
            color: "white",
            minHeight: touchLayout ? 48 : undefined,
          }}
        >
          Resign
        </button>
      )}

      <button
        className={btnClass}
        onClick={onEndGame}
        disabled={!canEndGame}
        style={{
          backgroundColor: "#e53e3e",
          color: "white",
          minHeight: touchLayout ? 48 : undefined,
        }}
      >
        End Game
      </button>
    </div>
  );
}
