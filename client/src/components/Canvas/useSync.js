/**
 * client/src/components/Canvas/useSync.js
 *
 * Registers Socket.IO event listeners and syncs incoming server events
 * into the Zustand store, then signals the canvas to re-render.
 *
 * This hook is the "inbound" half of the sync layer:
 *   - Server events → Zustand store mutations
 *   - Triggers a canvas redraw callback for events that change visual state
 *
 * The "outbound" half (emitting events) happens in useDrawing.js and
 * useUndoRedo.js directly.
 */

import { useEffect } from 'react';
import { useSocket } from '../../hooks/useSocket.js';
import { useRoomStore } from '../../store/roomStore.js';

/**
 * @param {{ onRedrawNeeded: () => void }} options
 *   `onRedrawNeeded` — callback to trigger when the canvas must be fully redrawn
 *   (e.g. after undo/redo/clear which cannot be incrementally applied)
 */
export function useSync({ onRedrawNeeded }) {
  const socket = useSocket();
  const store  = useRoomStore.getState;

  useEffect(() => {
    // ── Incoming draw:operation ────────────────────────────────────────────
    // A remote user drew something. Add it to the store; the canvas watches
    // the operations array and renders new ops incrementally.
    function onDrawOperation({ op }) {
      useRoomStore.getState().addOperation(op);
      // We do NOT call onRedrawNeeded here — the WhiteboardCanvas watches
      // the `operations` array and renders new entries incrementally.
    }

    // ── Incoming draw:undo ─────────────────────────────────────────────────
    // An op was undone. Must fully redraw from remaining ops.
    function onDrawUndo({ opId }) {
      useRoomStore.getState().markUndone(opId);
      onRedrawNeeded();
    }

    // ── Incoming draw:redo ─────────────────────────────────────────────────
    function onDrawRedo({ opId, op }) {
      useRoomStore.getState().markRedone(opId, op);
      // Redo just appends — we can render incrementally (just render the one op)
      // but calling onRedrawNeeded() is simpler and correct.
      onRedrawNeeded();
    }

    // ── Incoming board:cleared ─────────────────────────────────────────────
    function onBoardCleared() {
      useRoomStore.getState().clearOperations();
      onRedrawNeeded();
    }

    // ── Presence events ────────────────────────────────────────────────────
    function onUserJoined(user) {
      useRoomStore.getState().upsertUser(user);
    }

    function onUserLeft({ userId }) {
      useRoomStore.getState().removeUser(userId);
    }

    // ── Cursor events ──────────────────────────────────────────────────────
    function onCursorMove({ userId, x, y }) {
      useRoomStore.getState().updateCursor(userId, x, y);
    }

    // ── Connection state ───────────────────────────────────────────────────
    function onConnect() {
      useRoomStore.getState().setConnected(true);
    }

    function onDisconnect() {
      useRoomStore.getState().setConnected(false);
    }

    // Register all listeners
    socket.on('draw:operation',   onDrawOperation);
    socket.on('draw:undo',        onDrawUndo);
    socket.on('draw:redo',        onDrawRedo);
    socket.on('board:cleared',    onBoardCleared);
    socket.on('room:user_joined', onUserJoined);
    socket.on('room:user_left',   onUserLeft);
    socket.on('cursor:move',      onCursorMove);
    socket.on('connect',          onConnect);
    socket.on('disconnect',       onDisconnect);

    // Cleanup on unmount
    return () => {
      socket.off('draw:operation',   onDrawOperation);
      socket.off('draw:undo',        onDrawUndo);
      socket.off('draw:redo',        onDrawRedo);
      socket.off('board:cleared',    onBoardCleared);
      socket.off('room:user_joined', onUserJoined);
      socket.off('room:user_left',   onUserLeft);
      socket.off('cursor:move',      onCursorMove);
      socket.off('connect',          onConnect);
      socket.off('disconnect',       onDisconnect);
    };
  }, [socket, onRedrawNeeded]);
}
