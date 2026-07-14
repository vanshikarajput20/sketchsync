# 🎨 SketchSync — Real-Time Collaborative Whiteboard

**Draw together, live. No signup required.**

A full-stack, real-time collaborative whiteboard demonstrating WebSocket-based multi-user synchronization, append-only operation logging, conflict-free per-user undo/redo, and a polished design-system UI.

---

## Demo

Open two browser windows at the same URL, create a room in one, and join from the other — changes appear in under ~30ms on localhost.

---

## What This Demonstrates

| Skill | How It's Shown |
|---|---|
| **Real-time systems** | Socket.IO event-driven sync with per-event broadcasting |
| **State management** | Zustand store with operation-replay for consistent multi-client state |
| **Conflict-free sync** | Append-only operation log with ID-keyed undo — concurrent strokes never conflict |
| **Canvas API** | Dual-layer canvas, quadratic Bézier stroke smoothing, `destination-out` erasing |
| **Persistence** | Redis for hot state, MongoDB for durable saves, with automatic in-memory fallback |
| **Reconnection** | Stateless re-join — the server replays the full operation log on every `room:join` |
| **Performance** | Token-bucket cursor throttling (20Hz), incremental rendering, O(1) new-op render |
| **Testing** | 50+ unit and integration tests covering sync, rate-limiting, and multi-socket behavior |
| **Clean architecture** | Strict separation of socket handlers, room model, persistence, and REST API |
| **Zero-config setup** | Automatically falls back to in-memory mocks when Redis/Mongo are unavailable |

---

## Architecture

### Sync Model: Operation Broadcast

Each drawing action is a discrete, immutable operation with a unique ID. The server maintains an authoritative, ordered log in Redis (hot) and MongoDB (durable).

On a whiteboard, concurrent strokes never conflict — both are meant to appear, and the append-only log preserves both naturally. The one place a conflict *could* arise is undo, but since undo targets a specific operation ID, one user's undo can never remove another user's stroke, even if both were drawn simultaneously.

### Two-Layer Canvas

- **Live layer** — in-progress strokes and remote cursors, redrawn every frame, no network round-trip
- **Committed layer** — finalized, server-acknowledged operations, rebuilt only on undo/redo/clear

### Reconnection

On every `room:join` — including reconnects — the server sends the full operation log, and the client replays it in order. This is a stateless re-sync: no session state is required beyond the log itself.

### Why Operation-Broadcast Over CRDT (Yjs)?

CRDTs earn their complexity when genuine semantic conflicts exist — such as two users editing the same character in a text document. On a whiteboard, two simultaneous strokes are not in conflict; both are simply meant to coexist. Operation-broadcast delivers the same user-visible correctness with significantly lower complexity, smaller payloads, and no dependency on vector clocks or WASM-based merge logic.

---

## Getting Started

**Prerequisites:** Node.js ≥ 18. Redis and MongoDB are optional — the app automatically falls back to in-memory mocks if either is unavailable.

```bash
git clone https://github.com/vanshikarajput20/sketchsync.git
cd sketchsync
npm run install:all
```

Configure your environment:
```bash
cd server
cp .env.example .env
```

Run the application:
```bash
# Terminal 1
cd server && npm run dev

# Terminal 2
cd client && npm run dev
```

Open `http://localhost:5173` in two browser tabs to test real-time sync.

Run the test suite:
```bash
cd tests && npm test
```

---

## Design Trade-offs & Future Improvements

- **Undo performance** — currently an O(n) rewrite due to Redis List constraints; a tombstone-based sorted set would reduce this to O(1)
- **Redis Streams** over Lists, to support native sequence numbers for efficient reconnects
- **Horizontal scaling** via a Redis-backed Socket.IO adapter, enabling multi-instance deployment
- **Canvas chunking**, to limit undo replay cost on very large boards

---

## Credits

Built and designed by **Vanshika**