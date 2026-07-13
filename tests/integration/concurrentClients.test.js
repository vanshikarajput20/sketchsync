/**
 * tests/integration/concurrentClients.test.js
 *
 * Integration test: multiple concurrent Socket.IO clients connecting to a live
 * server instance and editing the same room simultaneously.
 *
 * What this tests:
 *   1. All clients receive each other's draw:operation broadcasts
 *   2. Server receives ops from all clients and stores them (checked via room state)
 *   3. A client that disconnects and reconnects receives the full state on resync
 *   4. Undo from one client is broadcast to all other clients
 *   5. Concurrent ops from 3 clients all appear in the final room state
 *
 * NOTE: This test spins up the real Express + Socket.IO server in-process.
 *       It mocks Redis and MongoDB so no external services are needed.
 *       Mock implementations live at the bottom of this file.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { createServer } from 'http';
import { Server as IOServer } from 'socket.io';
import { io as ioClient } from 'socket.io-client';

// We must import Room here so we can instantiate it in the mock
import { Room } from '../../server/src/rooms/Room.js';

// ── In-memory stubs replacing Redis and RoomManager for testing ──────────────
const mockRooms = new Map(); // roomId → Room
const rooms = mockRooms; // Alias to avoid modifying downstream test assertions

vi.mock('../../server/src/persistence/redis.js', () => {
  return {
    appendOp: async (roomId, op) => {},
    getOps: async (roomId) => mockRooms.get(roomId)?.operations ?? [],
    removeOp: async (roomId, opId) => {},
    redoOp: async (roomId, op) => {},
    roomExists: async (roomId) => mockRooms.has(roomId),
    initRoomMeta: async () => {},
    deleteRoom: async (roomId) => { mockRooms.delete(roomId); },
  };
});

vi.mock('../../server/src/rooms/RoomManager.js', () => {
  return {
    roomManager: {
      async getOrCreate(roomId) {
        if (!mockRooms.has(roomId)) {
          mockRooms.set(roomId, new Room(roomId));
        }
        return mockRooms.get(roomId);
      },
      getRoom(roomId) {
        return mockRooms.get(roomId) || null;
      },
      maybeTriggerAutoSave() {},
      async onRoomEmpty() {},
      get activeRoomCount() { return mockRooms.size; },
    }
  };
});

import { registerRoomHandlers } from '../../server/src/socket/handlers/roomHandlers.js';
import { registerDrawHandlers } from '../../server/src/socket/handlers/drawHandlers.js';
import { registerCursorHandlers } from '../../server/src/socket/handlers/cursorHandlers.js';

// ── Server lifecycle ─────────────────────────────────────────────────────────

let httpServer;
let io;
let serverUrl;

function makeOp(overrides = {}) {
  return {
    id:        overrides.id        ?? `op_${Math.random().toString(36).slice(2, 10)}`,
    type:      overrides.type      ?? 'stroke',
    userId:    overrides.userId    ?? 'u_test',
    timestamp: new Date().toISOString(),
    color:     '#000000',
    lineWidth: 2,
    opacity:   1.0,
    points:    [[0, 0], [10, 10]],
    ...overrides,
  };
}

/** Creates a connected socket client and returns a promise that resolves when connected. */
function connectClient(url) {
  return new Promise((resolve, reject) => {
    const client = ioClient(url, {
      transports: ['websocket'],
      reconnection: false,
    });
    client.once('connect',       () => resolve(client));
    client.once('connect_error', reject);
    setTimeout(() => reject(new Error('Connection timeout')), 5000);
  });
}

/** Waits for a specific event on a socket, resolving with the payload. */
function waitForEvent(socket, event, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Timeout waiting for event "${event}"`)),
      timeoutMs
    );
    socket.once(event, (data) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

beforeAll(async () => {
  httpServer = createServer();
  io = new IOServer(httpServer, { cors: { origin: '*' } });

  io.on('connection', (socket) => {
    registerRoomHandlers(socket, io);
    registerDrawHandlers(socket, io);
    registerCursorHandlers(socket, io);
  });

  await new Promise((resolve) => {
    httpServer.listen(0, () => { // port 0 = random available port
      const { port } = httpServer.address();
      serverUrl = `http://localhost:${port}`;
      resolve();
    });
  });
});

afterAll(async () => {
  await new Promise((resolve) => {
    io.close(() => httpServer.close(resolve));
  });
});

beforeEach(() => {
  // Clear all rooms between tests
  rooms.clear();
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('Integration: concurrent clients in a room', () => {
  const TEST_ROOM = 'test-room-ABC';

  it('client receives room:joined with full state on join', async () => {
    const client = await connectClient(serverUrl);
    const joined = waitForEvent(client, 'room:joined');

    client.emit('room:join', {
      roomId: TEST_ROOM, userId: 'u1', displayName: 'Alice',
    });

    const data = await joined;
    expect(data.roomId).toBe(TEST_ROOM);
    expect(data.userId).toBe('u1');
    expect(Array.isArray(data.operations)).toBe(true);
    expect(Array.isArray(data.users)).toBe(true);

    client.disconnect();
  });

  it('op sent by client A is received by client B', async () => {
    const [clientA, clientB] = await Promise.all([
      connectClient(serverUrl),
      connectClient(serverUrl),
    ]);

    // Both join the same room
    const [joinedA, joinedB] = await Promise.all([
      waitForEvent(clientA, 'room:joined'),
      waitForEvent(clientB, 'room:joined'),
      clientA.emit('room:join', { roomId: TEST_ROOM, userId: 'u_A', displayName: 'Alice' }),
      clientB.emit('room:join', { roomId: TEST_ROOM, userId: 'u_B', displayName: 'Bob' }),
    ]);

    // Wait for both to be in the room
    await new Promise((r) => setTimeout(r, 50));

    // Client A sends an op
    const op = makeOp({ id: 'op_from_A', userId: 'u_A' });
    const receivedByB = waitForEvent(clientB, 'draw:operation');
    clientA.emit('draw:operation', { roomId: TEST_ROOM, op });

    const { op: receivedOp } = await receivedByB;
    expect(receivedOp.id).toBe('op_from_A');
    expect(receivedOp.userId).toBe('u_A');

    clientA.disconnect();
    clientB.disconnect();
  });

  it('3 concurrent clients all receive all 3 ops', async () => {
    const clients = await Promise.all([
      connectClient(serverUrl),
      connectClient(serverUrl),
      connectClient(serverUrl),
    ]);

    const [cA, cB, cC] = clients;
    const userIds = ['uA', 'uB', 'uC'];

    // All join the room
    await Promise.all(
      clients.map((c, i) =>
        new Promise((res) => {
          c.once('room:joined', res);
          c.emit('room:join', { roomId: TEST_ROOM, userId: userIds[i], displayName: `User${i}` });
        })
      )
    );

    // Give the server a moment to process all joins
    await new Promise((r) => setTimeout(r, 50));

    // Each client will receive 2 ops (one from each other client)
    const receivedByA = [];
    const receivedByB = [];
    const receivedByC = [];
    cA.on('draw:operation', ({ op }) => receivedByA.push(op.id));
    cB.on('draw:operation', ({ op }) => receivedByB.push(op.id));
    cC.on('draw:operation', ({ op }) => receivedByC.push(op.id));

    // All 3 emit ops simultaneously
    const opA = makeOp({ id: 'op_A', userId: 'uA' });
    const opB = makeOp({ id: 'op_B', userId: 'uB' });
    const opC = makeOp({ id: 'op_C', userId: 'uC' });

    cA.emit('draw:operation', { roomId: TEST_ROOM, op: opA });
    cB.emit('draw:operation', { roomId: TEST_ROOM, op: opB });
    cC.emit('draw:operation', { roomId: TEST_ROOM, op: opC });

    // Wait for all broadcasts
    await new Promise((r) => setTimeout(r, 200));

    // A should have received B's and C's ops (not its own — sender is excluded)
    expect(receivedByA).toContain('op_B');
    expect(receivedByA).toContain('op_C');
    expect(receivedByA).not.toContain('op_A'); // sender excluded

    expect(receivedByB).toContain('op_A');
    expect(receivedByB).toContain('op_C');
    expect(receivedByB).not.toContain('op_B');

    expect(receivedByC).toContain('op_A');
    expect(receivedByC).toContain('op_B');
    expect(receivedByC).not.toContain('op_C');

    // Server's room state should contain all 3 ops
    const room = rooms.get(TEST_ROOM);
    const storedIds = room.operations.map((o) => o.id);
    expect(storedIds).toContain('op_A');
    expect(storedIds).toContain('op_B');
    expect(storedIds).toContain('op_C');

    clients.forEach((c) => c.disconnect());
  });

  it('undo from client A is broadcast to client B', async () => {
    const [cA, cB] = await Promise.all([
      connectClient(serverUrl),
      connectClient(serverUrl),
    ]);

    await Promise.all([
      new Promise((r) => { cA.once('room:joined', r); cA.emit('room:join', { roomId: TEST_ROOM, userId: 'uA', displayName: 'Alice' }); }),
      new Promise((r) => { cB.once('room:joined', r); cB.emit('room:join', { roomId: TEST_ROOM, userId: 'uB', displayName: 'Bob' }); }),
    ]);
    await new Promise((r) => setTimeout(r, 50));

    // A draws an op
    const op = makeOp({ id: 'op_to_undo', userId: 'uA' });
    await new Promise((r) => {
      cB.once('draw:operation', r);
      cA.emit('draw:operation', { roomId: TEST_ROOM, op });
    });

    // A undoes it — B should receive draw:undo
    const undoReceived = waitForEvent(cB, 'draw:undo');
    cA.emit('draw:undo', { roomId: TEST_ROOM, userId: 'uA', opId: 'op_to_undo' });

    const undoData = await undoReceived;
    expect(undoData.opId).toBe('op_to_undo');

    // Server's room should no longer have the op
    const room = rooms.get(TEST_ROOM);
    expect(room.operations.some((o) => o.id === 'op_to_undo')).toBe(false);

    cA.disconnect();
    cB.disconnect();
  });

  it('reconnecting client receives full state via room:joined', async () => {
    // Set up room with pre-existing ops
    const room = new Room(TEST_ROOM);
    room.addOperation(makeOp({ id: 'existing_op_1' }));
    room.addOperation(makeOp({ id: 'existing_op_2' }));
    rooms.set(TEST_ROOM, room);

    const client = await connectClient(serverUrl);
    const joinedData = waitForEvent(client, 'room:joined');
    client.emit('room:join', { roomId: TEST_ROOM, userId: 'reconnected_user', displayName: 'Returning' });

    const { operations } = await joinedData;
    const opIds = operations.map((o) => o.id);
    expect(opIds).toContain('existing_op_1');
    expect(opIds).toContain('existing_op_2');

    client.disconnect();
  });

  it('user_left event is broadcast when a client disconnects', async () => {
    const [cA, cB] = await Promise.all([
      connectClient(serverUrl),
      connectClient(serverUrl),
    ]);

    await Promise.all([
      new Promise((r) => { cA.once('room:joined', r); cA.emit('room:join', { roomId: TEST_ROOM, userId: 'leaver', displayName: 'Leaver' }); }),
      new Promise((r) => { cB.once('room:joined', r); cB.emit('room:join', { roomId: TEST_ROOM, userId: 'stayer', displayName: 'Stayer' }); }),
    ]);
    await new Promise((r) => setTimeout(r, 50));

    const leftEvent = waitForEvent(cB, 'room:user_left');
    cA.disconnect();

    const { userId } = await leftEvent;
    expect(userId).toBe('leaver');

    cB.disconnect();
  });
});
