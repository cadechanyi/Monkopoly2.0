import { useState } from "react";
import HomeScreen from "./screens/HomeScreen";
import SessionScreen from "./screens/SessionScreen";

export type Session = {
  mode: "single" | "multi";
  intent: "host" | "join";
};

export default function App() {
  const [session, setSession] = useState<Session | null>(null);

  if (session === null) {
    return (
      <HomeScreen
        onSinglePlayer={() => setSession({ mode: "single", intent: "host" })}
        onMultiplayerHost={() => setSession({ mode: "multi", intent: "host" })}
        onMultiplayerJoin={() => setSession({ mode: "multi", intent: "join" })}
      />
    );
  }

  return (
    <SessionScreen
      mode={session.mode}
      intent={session.intent}
      onExit={() => setSession(null)}
    />
  );
}
