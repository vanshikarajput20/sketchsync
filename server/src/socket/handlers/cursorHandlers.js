/**
 * server/src/socket/handlers/cursorHandlers.js
 *
 * Handles real-time cursor position broadcasting.
 *
 * cursor:move is a high-frequency event (up to ~60 events/sec from a fast mouse).
 * We apply a server-side token-bucket rate limiter (20 events/sec per socket)
 * to protect other clients from being flooded with cursor updates.
 *
 * Note: the client ALSO throttles cursor:move emissions, but server-side
 * enforcement ensures correctness even with malicious or buggy clients.
 */

import { cursorLimiter } from '../rateLimiter.js';

/**
 * Registers cursor event handlers on a socket.
 *
 * @param {import('socket.io').Socket} socket
 * @param {import('socket.io').Server}  io
 */
export function registerCursorHandlers(socket, io) {
  /**
   * cursor:move
   *
   * Payload: { roomId, userId, x, y }
   *
   * Flow:
   *   1. Check rate limiter — drop event if over 20/sec.
   *   2. Broadcast cursor position to all OTHER clients in the room.
   *
   * Not persisted to Redis or MongoDB — cursor positions are ephemeral.
   */
  socket.on('cursor:move', (data) => {
    // Rate limit: drop events beyond 20/sec for this socket
    if (!cursorLimiter.consume(socket.id)) {
      return; // silently drop — no error sent to client
    }

    const { roomId, userId, x, y } = data || {};

    if (!roomId || !userId || typeof x !== 'number' || typeof y !== 'number') {
      return; // invalid payload — silently ignore cursor events
    }

    // Broadcast to all others in the room (not back to sender)
    socket.to(roomId).emit('cursor:move', { userId, x, y });
  });
}
