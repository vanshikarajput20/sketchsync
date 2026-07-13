/**
 * server/src/socket/handlers/drawHandlers.js
 *
 * Handles all drawing-related WebSocket events:
 *   - draw:operation  — a new stroke, shape, text, or erase op
 *   - draw:undo       — user undoes their last operation
 *   - draw:redo       — user redoes their last undone operation
 *   - board:clear     — user clears the entire board
 *
 * Design notes:
 * - The server is the source of truth for the operation log. Every op is
 *   persisted to Redis BEFORE broadcasting, so a client crash immediately
 *   after emitting still results in the op being saved.
 * - Operations are broadcast to ALL OTHER clients in the room (sender excluded)
 *   because the sender already applied the op optimistically.
 * - Undo/redo broadcast to ALL clients including the sender to ensure
 *   their canvas state matches the authoritative server state.
 */

import { roomManager } from '../../rooms/RoomManager.js';
import { appendOp, removeOp, redoOp } from '../../persistence/redis.js';

/**
 * Validates the shape of an incoming operation object.
 * Returns an error string if invalid, null if valid.
 *
 * @param {unknown} op
 * @returns {string | null}
 */
function validateOp(op) {
  if (!op || typeof op !== 'object') return 'op must be an object';
  if (typeof op.id !== 'string' || op.id.length === 0) return 'op.id must be a non-empty string';
  if (!['stroke', 'shape', 'text', 'erase'].includes(op.type)) return `invalid op.type: ${op.type}`;
  if (typeof op.userId !== 'string') return 'op.userId must be a string';
  if (typeof op.timestamp !== 'string') return 'op.timestamp must be a string';
  return null;
}

/**
 * Registers drawing event handlers on a socket.
 *
 * @param {import('socket.io').Socket} socket
 * @param {import('socket.io').Server}  io
 */
export function registerDrawHandlers(socket, io) {
  /**
   * draw:operation
   *
   * Payload: { roomId, op }
   *
   * Flow:
   *   1. Validate payload.
   *   2. Add op to in-memory Room (deduplication happens here).
   *   3. Append op to Redis (durable).
   *   4. Broadcast op to all other clients in the room.
   *   5. Maybe trigger MongoDB auto-save.
   */
  socket.on('draw:operation', async (data) => {
    try {
      const { roomId, op } = data || {};

      const validationError = validateOp(op);
      if (validationError || !roomId) {
        socket.emit('error', {
          code: 'INVALID_PAYLOAD',
          message: validationError || 'roomId is required',
        });
        return;
      }

      const room = roomManager.getRoom(roomId);
      if (!room) {
        socket.emit('error', { code: 'ROOM_NOT_FOUND', message: `Room "${roomId}" not found` });
        return;
      }

      const added = room.addOperation(op);
      if (!added) {
        // Duplicate op — silently ignore (idempotency)
        return;
      }

      // Persist to Redis BEFORE broadcasting
      await appendOp(roomId, op);

      // Broadcast to all OTHER clients (sender already rendered optimistically)
      socket.to(roomId).emit('draw:operation', { op });

      // Trigger auto-save if threshold is reached (non-blocking)
      roomManager.maybeTriggerAutoSave(room);
    } catch (err) {
      console.error('[draw:operation] Error:', err);
      socket.emit('error', { code: 'INTERNAL_ERROR', message: 'Failed to process operation' });
    }
  });

  /**
   * draw:undo
   *
   * Payload: { roomId, userId, opId }
   *
   * The client specifies which op to undo by its ID. The server removes it
   * from the active op list and broadcasts the undo to ALL clients (including
   * sender) so every canvas re-renders consistently.
   *
   * Undo is per-user: clients should only send undo for their own ops.
   * The server does NOT enforce ownership here (it trusts the client) to
   * keep the logic simple. A production system could add ownership checks.
   */
  socket.on('draw:undo', async (data) => {
    try {
      const { roomId, userId, opId } = data || {};

      if (!roomId || !userId || !opId) {
        socket.emit('error', {
          code: 'INVALID_PAYLOAD',
          message: 'draw:undo requires roomId, userId, and opId',
        });
        return;
      }

      const room = roomManager.getRoom(roomId);
      if (!room) return;

      const undoneOp = room.undoOperation(opId);
      if (!undoneOp) return; // Already undone or doesn't exist

      // Remove from Redis log
      await removeOp(roomId, opId);

      // Broadcast to ALL clients (including sender) so canvas is re-rendered
      io.to(roomId).emit('draw:undo', { userId, opId });
    } catch (err) {
      console.error('[draw:undo] Error:', err);
    }
  });

  /**
   * draw:redo
   *
   * Payload: { roomId, userId, opId }
   *
   * Re-activates a previously undone op. The op is appended at the end of
   * the log (so it renders on top of all current content).
   */
  socket.on('draw:redo', async (data) => {
    try {
      const { roomId, userId, opId } = data || {};

      if (!roomId || !userId || !opId) {
        socket.emit('error', {
          code: 'INVALID_PAYLOAD',
          message: 'draw:redo requires roomId, userId, and opId',
        });
        return;
      }

      const room = roomManager.getRoom(roomId);
      if (!room) return;

      const redoneOp = room.redoOperation(opId);
      if (!redoneOp) return; // Not undone or doesn't exist

      // Re-append to Redis
      await redoOp(roomId, redoneOp);

      // Broadcast to ALL clients
      io.to(roomId).emit('draw:redo', { userId, opId, op: redoneOp });
    } catch (err) {
      console.error('[draw:redo] Error:', err);
    }
  });

  /**
   * board:clear
   *
   * Payload: { roomId, userId }
   *
   * Clears all operations from the board. Destructive — cannot be undone
   * (by design, to avoid complex state management for mass deletes).
   */
  socket.on('board:clear', async (data) => {
    try {
      const { roomId, userId } = data || {};
      if (!roomId) return;

      const room = roomManager.getRoom(roomId);
      if (!room) return;

      room.clearAll();

      // Rewrite Redis as empty list
      const { deleteRoom, initRoomMeta } = await import('../../persistence/redis.js');
      await deleteRoom(roomId);
      await initRoomMeta(roomId);

      io.to(roomId).emit('board:cleared', { userId, timestamp: new Date().toISOString() });
    } catch (err) {
      console.error('[board:clear] Error:', err);
    }
  });
}
