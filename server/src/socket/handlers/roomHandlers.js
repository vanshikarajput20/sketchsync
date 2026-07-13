/**
 * server/src/socket/handlers/roomHandlers.js
 *
 * Handles room lifecycle events:
 *   - room:join  — user joins a room (or reconnects), receives full state sync
 *   - room:leave — user explicitly leaves
 *   - disconnect — socket dropped, user removed from room
 */

import { roomManager } from '../../rooms/RoomManager.js';
import { cursorLimiter } from '../rateLimiter.js';

/**
 * Registers room lifecycle event handlers on a socket.
 *
 * @param {import('socket.io').Socket} socket
 * @param {import('socket.io').Server}  io
 */
export function registerRoomHandlers(socket, io) {
  /**
   * room:join
   *
   * Payload: { roomId, userId, displayName, color? }
   *
   * Flow:
   *   1. Get or create the Room (hydrates from Redis/Mongo if needed).
   *   2. Register the user in the Room's user map.
   *   3. Join the Socket.IO room channel.
   *   4. Send full state (users + operations) back to the joining socket.
   *   5. Notify other sockets that a new user joined.
   */
  socket.on('room:join', async (data) => {
    try {
      const { roomId, userId, displayName, color } = data;

      if (!roomId || !userId || !displayName) {
        socket.emit('error', {
          code: 'INVALID_PAYLOAD',
          message: 'room:join requires roomId, userId, and displayName',
        });
        return;
      }

      const room = await roomManager.getOrCreate(roomId);
      const userInfo = room.addUser(userId, displayName, socket.id, color);

      // Associate this socket with its userId and roomId for disconnect cleanup
      socket.data.userId = userId;
      socket.data.roomId = roomId;

      // Join the Socket.IO room (enables broadcasting with socket.to(roomId))
      socket.join(roomId);

      // Send full current state to the joining socket only
      socket.emit('room:joined', {
        roomId,
        userId,
        color: userInfo.color,
        users: room.getUserList(),
        operations: room.operations,
      });

      // Notify all OTHER users in the room about the new joiner
      socket.to(roomId).emit('room:user_joined', {
        userId,
        displayName,
        color: userInfo.color,
      });

      console.log(`[room:join] ${displayName} (${userId}) joined room "${roomId}"`);
    } catch (err) {
      console.error('[room:join] Error:', err);
      socket.emit('error', { code: 'INTERNAL_ERROR', message: 'Failed to join room' });
    }
  });

  /**
   * room:leave
   *
   * Payload: { roomId, userId }
   *
   * Explicit leave (e.g. user clicks "Leave Room"). Also called automatically
   * in the 'disconnect' handler if the socket drops.
   */
  socket.on('room:leave', ({ roomId, userId } = {}) => {
    handleUserLeave(socket, io, roomId, userId);
  });

  /**
   * disconnect
   *
   * Fired when the socket transport closes (network drop, tab close, etc.).
   * We re-use the same cleanup logic as room:leave.
   */
  socket.on('disconnect', (reason) => {
    const { userId, roomId } = socket.data;
    if (userId && roomId) {
      console.log(`[disconnect] ${userId} disconnected from room "${roomId}" — reason: ${reason}`);
      handleUserLeave(socket, io, roomId, userId);
    }
    // Clean up rate limiter state for this socket
    cursorLimiter.cleanup(socket.id);
  });
}

/**
 * Shared cleanup logic for both explicit leaves and disconnects.
 *
 * @param {import('socket.io').Socket} socket
 * @param {import('socket.io').Server}  io
 * @param {string} roomId
 * @param {string} userId
 */
function handleUserLeave(socket, io, roomId, userId) {
  if (!roomId || !userId) return;

  const room = roomManager.getRoom(roomId);
  if (!room) return;

  room.removeUser(userId);
  socket.leave(roomId);

  // Notify remaining users
  io.to(roomId).emit('room:user_left', { userId });

  console.log(`[room:leave] ${userId} left room "${roomId}" (${room.users.size} remaining)`);

  // If the room is now empty, trigger persistence + cleanup
  if (room.isEmpty()) {
    roomManager.onRoomEmpty(roomId).catch((err) =>
      console.error(`[room:leave] onRoomEmpty failed for "${roomId}":`, err.message)
    );
  }
}
