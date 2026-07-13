/**
 * server/src/routes/api.js
 *
 * REST API routes. Minimal surface — the core protocol is WebSocket.
 * These endpoints exist for:
 *   1. Creating rooms (generating a UUID slug)
 *   2. Fetching board metadata (for sharing links)
 *   3. Triggering PNG export server-side (future — client-side export is primary)
 */

import { Router } from 'express';
import { nanoid } from 'nanoid';
import { roomExists } from '../persistence/redis.js';
import { Board } from '../models/Board.js';
import { roomManager } from '../rooms/RoomManager.js';

export const apiRouter = Router();

/**
 * POST /api/rooms
 *
 * Creates a new room by generating a unique slug.
 * The slug is what gets shared in the URL: /room/:roomId
 *
 * Response: { roomId: string }
 */
apiRouter.post('/rooms', (_req, res) => {
  // nanoid(10) gives a ~1.2 billion possible values space — collision-resistant
  // for expected usage volumes
  const roomId = nanoid(10);
  res.status(201).json({ roomId });
});

/**
 * GET /api/rooms/:roomId
 *
 * Returns basic metadata about a room.
 * Used by the client to validate a room code before joining.
 *
 * Response: { roomId, exists, operationCount, activeUsers }
 */
apiRouter.get('/rooms/:roomId', async (req, res, next) => {
  try {
    const { roomId } = req.params;

    const exists = await roomExists(roomId);

    // Check in-memory room for live user count
    const room = roomManager.getRoom(roomId);
    const activeUsers = room ? room.getUserList().length : 0;

    // Check MongoDB for persisted op count
    const board = await Board.findOne({ roomId }, { operationCount: 1 }).lean();
    const operationCount = room
      ? room.operations.length
      : board?.operationCount ?? 0;

    res.json({ roomId, exists, operationCount, activeUsers });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/health/rooms
 *
 * Returns the number of active rooms in memory.
 * Used for monitoring / dashboards.
 */
apiRouter.get('/health/rooms', (_req, res) => {
  res.json({ activeRooms: roomManager.activeRoomCount });
});
