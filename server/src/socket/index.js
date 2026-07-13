/**
 * server/src/socket/index.js
 *
 * Socket.IO server setup. Attaches to the HTTP server, configures CORS, and
 * wires up all event handlers by composing the individual handler modules.
 *
 * Each handler module registers its own events on the socket — this keeps
 * this file as a thin wiring layer with no business logic of its own.
 */

import { Server } from 'socket.io';
import { registerRoomHandlers } from './handlers/roomHandlers.js';
import { registerDrawHandlers } from './handlers/drawHandlers.js';
import { registerCursorHandlers } from './handlers/cursorHandlers.js';

/**
 * Creates a Socket.IO server and attaches it to the given HTTP server.
 *
 * @param {import('http').Server} httpServer
 * @returns {import('socket.io').Server}
 */
export function attachSocketIO(httpServer) {
  const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:5173').split(' ');

  const io = new Server(httpServer, {
    cors: {
      origin: allowedOrigins,
      methods: ['GET', 'POST'],
      credentials: true,
    },
    // Ping/pong settings — affects how quickly disconnects are detected
    pingInterval: 10_000,  // 10 s
    pingTimeout:  5_000,   // 5 s — client considered disconnected after 5 s of no pong

    // Maximum event payload size (protects against large op batches)
    maxHttpBufferSize: 2e6, // 2 MB
  });

  // ── Connection handler ───────────────────────────────────────────────────

  io.on('connection', (socket) => {
    console.log(`[socket] Connected: ${socket.id} (transport: ${socket.conn.transport.name})`);

    // Register all event handlers for this socket
    registerRoomHandlers(socket, io);
    registerDrawHandlers(socket, io);
    registerCursorHandlers(socket, io);
  });

  console.log('✅  Socket.IO attached');
  return io;
}
