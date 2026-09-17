# Random Video Chat

A small WebRTC learning project: connect two random strangers for a 1-to-1
peer-to-peer video call. No accounts, no chat, no database — just camera →
match → call.

## How it works

- **Matchmaking**: the Django Channels consumer keeps a simple in-memory
  FIFO waiting list. First person to `join` waits; the second person to
  `join` gets paired with them immediately.
- **Signaling**: once paired, the server relays WebRTC handshake messages
  (`offer`, `answer`, `ice-candidate`) between the two matched sockets only
  — it never reads or stores them beyond forwarding.
- **Media**: actual audio/video travels **peer-to-peer** via WebRTC, never
  through the Django server.

See the top-level architecture explanation in the conversation, or read the
comments in `backend/matchmaking/consumers.py` and
`frontend/src/services/webrtc.js` — each file explains what it does and why.

## Project structure

```
random-video-chat/
├── backend/
│   ├── manage.py
│   ├── requirements.txt
│   ├── config/          # Django settings, ASGI app, urls
│   └── matchmaking/     # WebSocket consumer (matchmaking + signaling)
└── frontend/
    ├── src/
    │   ├── components/VideoChat.jsx   # main UI + state machine
    │   ├── services/webrtc.js         # RTCPeerConnection helpers
    │   ├── services/websocket.js      # signaling socket wrapper
    │   └── App.jsx / main.jsx / index.css
    ├── package.json
    └── vite.config.js
```

## Running it locally

### 1. Backend (Django Channels)

```bash
cd backend
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
python manage.py runserver
```

This runs Daphne/Django's dev server on `http://localhost:8000`, serving
WebSocket connections at `ws://localhost:8000/ws/matchmaking/`.

> **Note:** `runserver` here handles both HTTP and WebSockets via ASGI
> (that's what `channels` + `daphne` in requirements.txt enable) — no
> separate WebSocket server needed for development.

### 2. Frontend (React + Vite)

```bash
cd frontend
npm install
npm run dev
```

Opens on `http://localhost:5173`. If your backend runs somewhere other than
`localhost:8000`, copy `.env.example` to `.env` and change `VITE_WS_URL`.

### 3. Test with two tabs

Open `http://localhost:5173` in **two separate browser tabs/windows** (or
two different browsers), click **Start** in both, grant camera/mic access,
and they should match each other within a second or two.

Also worth testing manually:
- One tab clicks **Start** and waits — confirm "Waiting for a stranger..."
  shows before the second tab joins.
- Click **Stop** while waiting (before being matched).
- Click **Next** mid-call — confirm both sides clean up and the "Next"
  clicker starts searching again.
- Close one tab entirely mid-call — confirm the other tab sees "Stranger
  disconnected" and automatically starts searching for someone new.
- Deny camera/microphone permission — confirm the friendly error message
  appears instead of a crash.
- Refresh mid-call, then start a new call.

## Production notes

- **HTTPS/WSS required**: browsers only allow `getUserMedia` (camera/mic)
  in a secure context. In production, serve the frontend over HTTPS and
  point `VITE_WS_URL` at `wss://...` instead of `ws://...`.
- **STUN vs TURN**: this project uses a public Google STUN server
  (`stun:stun.l.google.com:19302`), which is enough for most peers to find
  a direct path to each other. Some users behind restrictive/symmetric NAT
  or corporate firewalls won't be able to connect via STUN alone — for
  those cases you'd add a **TURN server** (which relays media as a
  fallback) to the `ICE_SERVERS` list in
  `frontend/src/services/webrtc.js`. Coturn is a common open-source choice
  if you need to run your own.
- **Scaling beyond one process**: the waiting queue and partner map in
  `matchmaking/consumers.py` are plain Python data structures shared only
  within a single process. That's fine for `runserver`/one Daphne worker.
  If you deploy multiple worker processes or machines, you'll need a
  shared channel layer (e.g. `channels_redis`) and to move the queue/pairs
  into Redis so every worker sees the same state — the project intentionally
  skips this for now to keep things simple, per the brief.
- **No data is stored**: no video/audio recordings, no chat logs, no user
  profiles. The server only ever holds a channel name in memory for as
  long as a connection is open.
