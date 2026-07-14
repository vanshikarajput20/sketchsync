# 🎨 SketchSync — Real-Time Collaborative Whiteboard

> Draw together, live. No signup required.

A portfolio-grade, full-stack real-time collaborative whiteboard demonstrating WebSocket-based multi-user synchronisation, append-only operation logging, per-user conflict-free undo/redo, and a polished design-system UI.

**Demo** — open two browser windows at the same URL, create a room in one, join in the other, and draw. Changes appear in under ~30 ms on localhost.

---

## What This Demonstrates Technically

| Skill | How it's shown |
|---|---|
| **Real-time systems** | Socket.IO event-driven sync with per-event broadcasting |
| **State management** | Zustand store + operation-replay for consistent multi-client state |
| **Conflict-free sync** | Append-only op log with ID-keyed undo — concurrent strokes never conflict |
| **Canvas API** | Dual-layer canvas, quadratic Bézier stroke smoothing, `destination-out` erasing |
| **Persistence** | Redis for hot state, MongoDB for durable save. Fallback to in-memory mocks when services are offline |
| **Reconnection** | Stateless re-join: server sends full op array on every `room:join` |
| **Performance** | Token-bucket cursor throttle (20 Hz), incremental op rendering, O(1) new-op render |
| **Testing** | 50+ unit/integration tests covering sync, room, rate-limiting, and multi-socket behavior |
| **Clean architecture** | Hard separation: socket handlers / room model / persistence / REST API |
| **Zero-Config Dev** | Fallback mode dynamically detects service failures for database-free execution |

---

## Architecture

### Sync Model: Operation Broadcast

Each drawing action is a **discrete, immutable operation** (a plain JS object) with a unique `nanoid`. The server maintains an **authoritative ordered log** in Redis (active) and MongoDB (durable).

```
  [Client A draws]              [Server]                    [Redis]
       │                            │                           │
       │  (1) Render locally        │                           │
       │  (optimistic)              │                           │
       │── draw:operation ─────────►│── RPUSH room:{id}:ops ──►│
       │                            │◄─ full ops on room:join ──│
       │                            │── broadcast to B, C ─────►│
  [Client B] ◄──── draw:operation ─│                           │
       │     (renders remotely)     │                           │
```

**Why no conflicts?**
On a whiteboard, concurrent strokes never conflict — both should appear. The append-only log preserves both. The only interesting conflict is **undo**: undo targets a specific `opId`, so User A undoing their stroke can never remove User B's stroke, even if they drew simultaneously.

### Data Flow Diagram

```
Browser A                Server                    Redis / MongoDB
─────────────────────────────────────────────────────────────────
useDrawing.js            drawHandlers.js           redis.js
  │ pointerUp              │ draw:operation          │
  ├─► render (optimistic)  │                         │
  ├─► emit draw:operation ─►│                         │
  │                        ├─► Room.addOperation()   │
  │                        ├─► appendOp() ──────────►│ RPUSH ops
  │                        ├─► socket.to(room) emit  │
  │                        │                         │
Browser B ◄──────────────────────────────────────────
  useSync.js              │
  │ draw:operation         │
  ├─► store.addOperation() │
  └─► canvas re-renders    │
```

### Undo / Redo

- **Per-user & Synchronized**: local history is tracked inside the global Zustand room store ([roomStore.js](file:///Users/vanshika/GITT/sketchsync/client/src/store/roomStore.js)), accessed via `useUndoRedo.js`. This guarantees that canvas drawing inputs, keyboard shortcuts (Ctrl+Z), and toolbar buttons remain perfectly synchronized and reactive.
- Undo emits `draw:undo { opId }` → server removes op from Redis, broadcasts to **all** clients.
- All clients **replay remaining ops** to reconstruct the canvas — O(n), acceptable for < 5 k ops/session.
- Redo re-appends the op at the end of the log.

### Two-Layer Canvas

```
┌──────────────────────────────────────┐  ← Live layer (z-index: 2)
│  In-progress stroke preview          │    Cleared every pointer-move frame
│  Remote user cursors + name labels   │    No socket involvement
└──────────────────────────────────────┘
┌──────────────────────────────────────┐  ← Committed layer (z-index: 1)
│  All finalised, server-acked ops     │    Rebuilt only on undo/redo/clear
│  Rendered incrementally on new ops   │    O(1) for new ops, O(n) for undo
└──────────────────────────────────────┘
```

### Reconnection / Re-sync

On `room:join` (including reconnects), the server sends the **full operations array** from Redis. The client replays all ops in order. This is **stateless re-sync** — no session state needed server-side beyond the op log.

### Cursor Rate Limiting

`cursor:move` is throttled to **20 events/sec per socket** via a token-bucket algorithm on **both** the client (time-gate in `useDrawing.js`) and the server (`rateLimiter.js`). The server-side enforcement protects other clients even if a buggy or malicious client bypasses the client gate.

---

## Folder Structure

```
sketchsync/
├── client/                      # React + Vite frontend
│   ├── index.html               # SEO meta, Inter font preconnect
│   └── src/
│       ├── App.jsx              # React Router setup
│       ├── index.css            # Design system tokens + global resets
│       ├── components/
│       │   ├── Canvas/
│       │   │   ├── WhiteboardCanvas.jsx   # Two-layer canvas + cursor overlay
│       │   │   ├── useDrawing.js          # Pointer events → operations
│       │   │   └── useSync.js             # Socket.IO events → Zustand store
│       │   ├── Toolbar/
│       │   │   └── Toolbar.jsx            # Tools, colour picker, undo/redo
│       │   ├── Sidebar/
│       │   │   ├── UserList.jsx           # Presence panel
│       │   │   └── RoomInfo.jsx           # Room code + copy-link button
│       │   └── ui/
│       │       └── ExportButton.jsx       # PNG / SVG export dropdown
│       ├── hooks/
│       │   ├── useSocket.js     # Singleton Socket.IO client
│       │   └── useUndoRedo.js   # Per-user undo/redo stack
│       ├── lib/
│       │   ├── operationTypes.js   # Op schema constants + JSDoc typedefs
│       │   ├── renderOperation.js  # Pure canvas renderer (testable)
│       │   └── exportCanvas.js     # PNG / SVG export utilities
│       ├── pages/
│       │   ├── Home.jsx         # Create / join room landing page
│       │   └── Room.jsx         # Full whiteboard page + keyboard shortcuts
│       └── store/
│           └── roomStore.js     # Zustand: ops, users, cursors, tool state
│
├── server/                      # Node.js + Express + Socket.IO
│   ├── index.js                 # Entry point (connects Redis + Mongo, starts server)
│   └── src/
│       ├── app.js               # Express factory (CORS, JSON, routes)
│       ├── socket/
│       │   ├── index.js         # Socket.IO server factory
│       │   ├── rateLimiter.js   # Token-bucket rate limiter
│       │   └── handlers/
│       │       ├── roomHandlers.js    # join / leave / disconnect
│       │       ├── drawHandlers.js    # operation / undo / redo / clear
│       │       └── cursorHandlers.js  # cursor:move (rate-limited)
│       ├── rooms/
│       │   ├── Room.js          # In-memory room: op log, users, undo state
│       │   └── RoomManager.js   # Singleton: hydrate, auto-save, eviction
│       ├── persistence/
│       │   ├── redis.js         # ioredis wrapper (RPUSH / LRANGE / pipeline)
│       │   └── mongo.js         # Mongoose connection factory
│       ├── models/
│       │   └── Board.js         # Mongoose schema + upsertBoard static
│       ├── routes/
│       │   └── api.js           # REST: POST /api/rooms, GET /api/rooms/:id
│       └── middleware/
│           └── errorHandler.js  # Centralised Express error handler
│
└── tests/
    ├── unit/
    │   ├── operationSync.test.js   # 35+ tests: Room add/undo/redo/hydrate/users
    │   └── rateLimiter.test.js     # Token-bucket behaviour tests
    └── integration/
        └── concurrentClients.test.js  # 5 multi-socket scenarios, in-memory stubs
```

---

## Local Setup

### Prerequisites

- **Node.js ≥ 18**
- **Redis** (Optional) — local (`brew install redis && redis-server`) or [Upstash free tier](https://upstash.com)
- **MongoDB** (Optional) — local (`brew install mongodb-community && mongod`) or [Atlas free tier](https://www.mongodb.com/atlas)

> [!NOTE]
> **Zero-Config Development**: If local Redis or MongoDB services are not running, SketchSync will automatically fall back to fully functional in-memory mocks. No database setup or configuration is required to run and edit the project locally.

### 1 — Clone and install

```bash
git clone https://github.com/vanshikarajput20/sketchsync.git
cd sketchsync

# Install everything at once
npm run install:all
```

Or install individually:

```bash
cd server && npm install
cd ../client && npm install
cd ../tests && npm install
```

### 2 — Configure environment

```bash
cd server
cp .env.example .env
# Edit .env with your Redis URL and MongoDB URI
```

Minimal `.env` for local development:

```env
REDIS_URL=redis://localhost:6379
MONGO_URI=mongodb://localhost:27017/sketchsync
CORS_ORIGINS=http://localhost:5173
PORT=4000
```

### 3 — Run locally

```bash
# Terminal 1 — server (hot-reload via nodemon)
cd server && npm run dev

# Terminal 2 — client (Vite HMR)
cd client && npm run dev
```

Open **`http://localhost:5173`** in two browser tabs. Create a room in tab 1, paste the link into tab 2, and draw!

### 4 — Run tests

```bash
# Unit + integration (no external services needed — uses in-memory stubs)
cd tests && npm test

# Watch mode during development
cd tests && npm run test:watch
```

All 40 + assertions should pass in < 2 s.

---

## WebSocket Event Reference

### Client → Server

| Event | Payload | Notes |
|---|---|---|
| `room:join` | `{ roomId, userId, displayName, color? }` | Also sent on reconnect for re-sync |
| `room:leave` | `{ roomId, userId }` | Explicit leave |
| `draw:operation` | `{ roomId, op: Op }` | New stroke / shape / text / erase |
| `draw:undo` | `{ roomId, userId, opId }` | Per-user undo by op ID |
| `draw:redo` | `{ roomId, userId, opId }` | Re-activates undone op |
| `cursor:move` | `{ roomId, userId, x, y }` | Throttled to 20/s client + server |
| `board:clear` | `{ roomId, userId }` | Destructive — clears all ops |

### Server → Client

| Event | Payload | Who receives |
|---|---|---|
| `room:joined` | `{ roomId, userId, color, users[], operations[] }` | Joining socket only |
| `room:user_joined` | `{ userId, displayName, color }` | All others in room |
| `room:user_left` | `{ userId }` | All in room |
| `draw:operation` | `{ op }` | All **except** sender |
| `draw:undo` | `{ userId, opId }` | **All** in room (incl. sender) |
| `draw:redo` | `{ userId, opId, op }` | **All** in room |
| `cursor:move` | `{ userId, x, y }` | All except sender |
| `board:cleared` | `{ userId, timestamp }` | All in room |

---

## Trade-offs

### Operation-Broadcast vs. Full CRDT (Yjs / Automerge)

| | Operation-broadcast (this project) | CRDT (Yjs) |
|---|---|---|
| **Complexity** | Low — ops are self-contained JSON | High — vector clocks, merge functions, WASM bundle |
| **Correctness** | Correct for whiteboards (no semantic conflicts) | Mathematically guaranteed convergence |
| **Network overhead** | Low — send only new ops | Higher — Yjs update payloads carry metadata |
| **Offline support** | Limited — reconnect required for re-sync | Full offline + automatic merge on reconnect |
| **Undo scope** | Per-user by op ID — simple and correct | `UndoManager` scoped per awareness client |
| **Best for** | Whiteboards, drawing apps | Rich text editors, collaborative code editors |

**Why not Yjs here?** On a whiteboard, two simultaneous strokes should _both_ appear — there is no semantic conflict to resolve. Yjs's convergence guarantee is valuable for rich text (where cursor positions and character insertions can genuinely conflict). For drawing, the operation-broadcast model achieves the same user-visible correctness at a fraction of the complexity, and the trade-off section is itself a demonstration of architectural reasoning.

### What I'd Do Differently at Larger Scale

1. **Tombstones instead of list rewrite on undo** — Redis Lists don't support index deletes; currently undo does O(n) read-filter-rewrite. A `tombstones` sorted set would make undo O(1) writes and O(n) only at canvas replay time.

2. **Redis Streams instead of Lists** — Streams give sequence numbers natively, enabling "give me ops after sequence N" for reconnect instead of sending the full log.

3. **Horizontal scaling** — Replace in-process `roomManager` with a Redis-backed adapter (`socket.io-redis`) so multiple server processes can broadcast across nodes.

4. **Canvas chunking** — Split the 4 K canvas into tiles; replay only ops that touched changed tiles on undo, reducing O(n) replay to O(k).

5. **OT for text ops** — Two users typing at the same canvas position can produce overlapping text. Operational transform would resolve this without full CRDT complexity.

---

## Deployment

### Frontend → Vercel

```bash
cd client && npm run build
# Push to GitHub, connect repo on vercel.com
# Set env var: VITE_SERVER_URL=https://your-backend.railway.app
```

A `vercel.json` is included that rewrites `/*` to `index.html` for SPA routing.

### Backend → Railway

1. Create a Railway project, connect the GitHub repo
2. Set **Root Directory** to `server`
3. Add environment variables:
   ```
   REDIS_URL=rediss://:password@host:port   # Railway Redis plugin or Upstash
   MONGO_URI=mongodb+srv://...              # Atlas free cluster
   CORS_ORIGINS=https://your-app.vercel.app
   PORT=4000
   ```
4. Railway auto-detects Node.js and runs `npm start`

> **Free-tier notes** — Atlas M0 = 512 MB storage, 100 max connections. Upstash Redis free = 10 k commands/day. Both are sufficient for demo traffic.

---

## Recording a Demo GIF

1. Open two browser windows side-by-side.
2. Create a room in Window 1, paste the link into Window 2.
3. Record with **macOS screen recorder** (⌘⇧5) or [OBS](https://obsproject.com/).
4. Convert `.mp4` → GIF at [ezgif.com/video-to-gif](https://ezgif.com/video-to-gif).

Suggested actions to capture:
- Both users draw simultaneously (multi-colour strokes)
- Cursor names moving in real time
- One user presses **Ctrl+Z** — stroke disappears on both screens
- Export PNG button

---

## License

MIT © Vanshika Rajput
