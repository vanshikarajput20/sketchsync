/**
 * server/src/rooms/RoomManager.js
 *
 * Singleton that manages all active Room instances.
 *
 * Responsibilities:
 *   - Creating Room objects on first join
 *   - Hydrating Room state from Redis for new joins / reconnects
 *   - Triggering MongoDB auto-saves when the op threshold is reached
 *   - Scheduling room cleanup when all users leave
 *
 * This class deliberately does NOT import socket.io — it is pure business logic
 * with no I/O side effects beyond persistence calls.
 */

import { Room } from './Room.js';
import { getOps, initRoomMeta, roomExists } from '../persistence/redis.js';
import { Board } from '../models/Board.js';

const AUTOSAVE_THRESHOLD = parseInt(process.env.AUTOSAVE_THRESHOLD || '50', 10);

class RoomManager {
  constructor() {
    /** @type {Map<string, Room>} roomId → Room instance */
    this._rooms = new Map();
  }

  /**
   * Returns an existing Room, or creates a new one hydrated from Redis/MongoDB.
   * This is the primary entry point for all socket handlers.
   *
   * @param {string} roomId
   * @returns {Promise<Room>}
   */
  async getOrCreate(roomId) {
    if (this._rooms.has(roomId)) {
      return this._rooms.get(roomId);
    }

    const room = new Room(roomId);

    // Try to hydrate from Redis first (fast path — active rooms)
    if (await roomExists(roomId)) {
      const ops = await getOps(roomId);
      room.hydrateOperations(ops);
      console.log(`[RoomManager] Hydrated room "${roomId}" from Redis (${ops.length} ops)`);
    } else {
      // Slow path: check MongoDB for a previously persisted board
      const board = await Board.findOne({ roomId }).lean();
      if (board && board.operations?.length > 0) {
        room.hydrateOperations(board.operations);
        console.log(
          `[RoomManager] Hydrated room "${roomId}" from MongoDB (${board.operations.length} ops)`
        );
      } else {
        // Brand-new room
        await initRoomMeta(roomId);
        console.log(`[RoomManager] Created new room "${roomId}"`);
      }
    }

    this._rooms.set(roomId, room);
    return room;
  }

  /**
   * Returns a Room if it exists in memory, or null.
   * Use this in handlers where the room MUST already exist.
   *
   * @param {string} roomId
   * @returns {Room | null}
   */
  getRoom(roomId) {
    return this._rooms.get(roomId) || null;
  }

  /**
   * Called after every operation is added to a room.
   * Triggers an async MongoDB auto-save if the threshold is reached.
   * Non-blocking — fires and forgets with error logging.
   *
   * @param {Room} room
   */
  maybeTriggerAutoSave(room) {
    if (room.opsSinceLastSave >= AUTOSAVE_THRESHOLD) {
      this._persistToMongo(room).catch((err) =>
        console.error(`[RoomManager] Auto-save failed for room "${room.id}":`, err.message)
      );
    }
  }

  /**
   * Called when a room becomes empty (last user leaves).
   * Persists to MongoDB, then removes the in-memory Room after a grace period.
   *
   * @param {string} roomId
   */
  async onRoomEmpty(roomId) {
    const room = this._rooms.get(roomId);
    if (!room) return;

    try {
      await this._persistToMongo(room);
      console.log(`[RoomManager] Room "${roomId}" empty — persisted to MongoDB`);
    } catch (err) {
      console.error(`[RoomManager] Failed to persist empty room "${roomId}":`, err.message);
    }

    // Grace period: keep the in-memory room for 60 s in case users quickly rejoin
    setTimeout(() => {
      const currentRoom = this._rooms.get(roomId);
      if (currentRoom && currentRoom.isEmpty()) {
        this._rooms.delete(roomId);
        console.log(`[RoomManager] Evicted room "${roomId}" from memory`);
      }
    }, 60_000);
  }

  /**
   * Persists the full operation log for a room to MongoDB.
   * @param {Room} room
   */
  async _persistToMongo(room) {
    await Board.upsertBoard(room.id, room.operations);
    room.markSaved();
  }

  /**
   * Returns the count of rooms currently held in memory.
   * Useful for metrics / health endpoints.
   * @returns {number}
   */
  get activeRoomCount() {
    return this._rooms.size;
  }
}

// Export a singleton — all socket handlers share the same instance
export const roomManager = new RoomManager();
