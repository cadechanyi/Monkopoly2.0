import { useEffect, useRef, useState } from "react";
import { imageUrl } from "../types/game";

interface DiceDisplayProps {
  dice: [number, number];
  doubles: boolean;
  message: string;
  /** Smaller dice + text for mobile bottom bar */
  compact?: boolean;
}

export default function DiceDisplay({
  dice,
  doubles,
  message,
  compact = false,
}: DiceDisplayProps) {
  const [animating, setAnimating] = useState(false);
  const [displayDice, setDisplayDice] = useState(dice);
  const prevDiceRef = useRef<[number, number] | null>(null);

  useEffect(() => {
    if (dice[0] === 0 && dice[1] === 0) return;

    const prev = prevDiceRef.current;
    if (prev && prev[0] === dice[0] && prev[1] === dice[1]) return;
    prevDiceRef.current = dice;

    setAnimating(true);
    let frame = 0;
    const interval = setInterval(() => {
      setDisplayDice([
        Math.ceil(Math.random() * 6),
        Math.ceil(Math.random() * 6),
      ] as [number, number]);
      frame++;
      if (frame >= 12) {
        clearInterval(interval);
        setDisplayDice(dice);
        setAnimating(false);
      }
    }, 120);

    return () => clearInterval(interval);
  }, [dice]);

  if (dice[0] === 0 && dice[1] === 0) return null;

  const dicePx = compact ? 30 : 48;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: compact ? "row" : "column",
        alignItems: "center",
        justifyContent: "center",
        gap: compact ? 8 : 6,
        flexWrap: compact ? "wrap" : undefined,
      }}
    >
      <div style={{ display: "flex", gap: compact ? 6 : 10 }}>
        {displayDice.map((d, i) => (
          <img
            key={i}
            src={imageUrl(`dice${d}.png`)}
            alt={`Dice ${d}`}
            style={{
              width: dicePx,
              height: dicePx,
              transition: animating ? "none" : "transform 0.2s",
              transform: animating
                ? `rotate(${Math.random() * 30 - 15}deg)`
                : "none",
            }}
            draggable={false}
          />
        ))}
      </div>
      {doubles && (
        <div
          style={{
            color: "#38a169",
            fontWeight: 800,
            fontSize: compact ? 12 : 18,
            textShadow: "0 0 8px rgba(56,161,105,0.5)",
          }}
        >
          DOUBLES!
        </div>
      )}
      {message && !doubles && (
        <div
          style={{
            color: message.startsWith("+") ? "#38a169" : "#e53e3e",
            fontWeight: 700,
            fontSize: compact ? 12 : 16,
            maxWidth: compact ? "42%" : undefined,
            overflow: compact ? "hidden" : undefined,
            textOverflow: compact ? "ellipsis" : undefined,
            whiteSpace: compact ? "nowrap" : undefined,
          }}
        >
          {message}
        </div>
      )}
    </div>
  );
}
