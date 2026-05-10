# Monkopoly 2.0

Modern web version of Monkopoly with single-player vs AI and online multiplayer
(up to 4 humans joining by 6-character room code). Built with Vite + React +
TypeScript on the frontend and FastAPI + WebSockets on the backend, packaged as
a single Docker image for deployment to Azure App Service for Containers.

## Project layout

```
Monkopoly2.0/
  index.html                  Vite entry
  package.json tsconfig.json vite.config.ts
  Dockerfile                  multi-stage: node build -> python runtime
  src/                        React + TS frontend
    main.tsx App.tsx
    screens/
      HomeScreen.tsx          board background + Single Player / Multiplayer buttons
      SessionScreen.tsx       owns the WebSocket; flips between LobbyView and GameView
      LobbyView.tsx           name + room-code form, player list, host Start button
      GameView.tsx            wires Board + panels + modals to the socket
    components/               Board, PlayerPanel, DiceDisplay, ControlPanel,
                              BuyModal, ChestModal, ManageModal, TradeModal, EndGameModal
    hooks/useGameSocket.ts    WebSocket client (room-aware)
    types/game.ts             shared TS types + image-path helpers
    styles/                   index.css home.css lobby.css
  public/assets/images/       game art (board, dice, tokens, property cards)
  server/                     FastAPI backend
    main.py                   app entrypoint; mounts WS, /api, and the built frontend
    requirements.txt
    api/
      rooms.py                POST /api/rooms, GET /api/rooms/{code}
      ws.py                   /ws/room/{code} — join, dispatch, broadcast
    engine/
      game_engine.py          GameEngine class — server-authoritative rules
      room_manager.py         Room + RoomManager (in-memory, keyed by join code)
      models.py constants.py ai.py   ported from the reference project
```

## How it works

- One `GameEngine` instance per room owns the full game state (board, players,
  dice, phase). All rules and AI math run server-side, so no client can cheat
  by editing local state.
- A `RoomManager` keeps an in-memory `dict[str, Room]` keyed by 6-character join
  codes (ambiguous chars `0/O/1/I` are excluded). Each `Room` holds a
  `GameEngine` plus the seated `WebSocket`s.
- **Single-player rooms** auto-start the moment the host joins, with 1 human
  seat + 3 AI seats.
- **Multiplayer rooms** open a lobby, accept up to 4 humans by code, and only
  start when the host clicks Start. Empty seats are filled with AI.
- The `useGameSocket` hook is mode-agnostic: it sends `{action: "roll"}` etc.
  and renders whatever state comes back. Swapping out the transport (e.g. for
  Azure SignalR Service) only touches `useGameSocket.ts` and `server/api/ws.py`.

## Local development

You need Python 3.10+ and Node.js 18+.

### Terminal 1 — backend

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r server/requirements.txt
uvicorn server.main:app --reload --port 8000
```

API + WebSocket served at `http://localhost:8000`.

### Terminal 2 — frontend

```bash
npm install
npm run dev
```

Open `http://localhost:5173`. Vite proxies `/api` and `/ws` to `:8000`
automatically (configured in `vite.config.ts`).

To smoke-test multiplayer locally, open the same URL in two browser windows —
host in one, join in the other using the displayed code.

## Docker

Build a single image that serves frontend + backend on port 8000:

```bash
docker build -t monkopoly2 .
docker run -p 8000:8000 monkopoly2
```

Open `http://localhost:8000`.

## Deploy to Azure App Service for Containers

Prereqs: an Azure subscription, the Azure CLI, and an Azure Container Registry
(ACR). Substitute your own values for `<...>` placeholders.

1. **Build and push the image to ACR**

   ```bash
   az acr login --name <registry>
   docker build -t <registry>.azurecr.io/monkopoly2:latest .
   docker push <registry>.azurecr.io/monkopoly2:latest
   ```

2. **Create the Web App for Containers**

   ```bash
   az webapp create \
     --resource-group <rg> \
     --plan <linux-app-service-plan> \
     --name <unique-app-name> \
     --deployment-container-image-name <registry>.azurecr.io/monkopoly2:latest
   ```

3. **Tell App Service which port the container listens on**

   ```bash
   az webapp config appsettings set \
     --resource-group <rg> \
     --name <unique-app-name> \
     --settings WEBSITES_PORT=8000
   ```

4. **Enable WebSockets** (off by default; required for `/ws/...`)

   ```bash
   az webapp config set \
     --resource-group <rg> \
     --name <unique-app-name> \
     --web-sockets-enabled true
   ```

5. **Browse to** `https://<unique-app-name>.azurewebsites.net`.

When you push a new image tag, restart the Web App (or configure continuous
deployment from ACR webhook) to pick it up.

## Out of scope (room for follow-up work)

- Persistent storage — rooms live only in process memory. Fine for one App
  Service instance; if you scale out, move room state to Redis (Azure Cache
  for Redis) so all instances share the directory.
- Auth / accounts — joining a room only requires the 6-char code today.
