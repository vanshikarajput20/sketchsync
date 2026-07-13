/**
 * client/src/hooks/useSocket.js
 *
 * Singleton Socket.IO client hook.
 *
 * Returns the socket instance that all components in the app share.
 * Using a module-level singleton (rather than React context) ensures:
 *   - Exactly one socket connection per browser tab
 *   - Components can access the socket without prop drilling
 *   - The socket survives React tree re-renders and Strict Mode double-mount
 *
 * Reconnection handling:
 *   Socket.IO's built-in reconnection is enabled (autoReconnect: true).
 *   When the socket reconnects, it emits 'room:join' again with the stored
 *   roomId/userId — the server responds with the full state sync.
 */

import { io } from 'socket.io-client';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || '';
// Empty string = connect to the same origin (works with Vite proxy in dev
// and with co-located deployments in production).

/**
 * The single Socket.IO client instance for this browser tab.
 * Created once, reused everywhere.
 *
 * @type {import('socket.io-client').Socket}
 */
const socket = io(SERVER_URL, {
  autoConnect: false,       // We connect manually after the user joins a room
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  randomizationFactor: 0.5, // Avoid thundering herd on server restart
  transports: ['websocket', 'polling'], // Prefer WS; fall back to long-polling
});

// ── Debug logging in development ─────────────────────────────────────────────
if (import.meta.env.DEV) {
  socket.on('connect',              ()    => console.log('[socket] connected:', socket.id));
  socket.on('disconnect',           (r)   => console.log('[socket] disconnected:', r));
  socket.on('connect_error',        (err) => console.warn('[socket] connect error:', err.message));
  socket.on('reconnect',            (n)   => console.log(`[socket] reconnected after ${n} attempts`));
  socket.on('reconnect_attempt',    (n)   => console.log(`[socket] reconnect attempt #${n}`));
}

/**
 * Returns the singleton socket instance.
 * Use this hook in any component that needs to emit or listen to events.
 *
 * @returns {import('socket.io-client').Socket}
 */
export function useSocket() {
  return socket;
}

/**
 * Direct export for non-hook usage (e.g. in store actions or utility functions).
 */
export { socket };
