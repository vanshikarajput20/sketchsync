/**
 * client/src/hooks/useUndoRedo.js
 *
 * Per-user undo/redo stack, tracking op IDs only.
 *
 * Design: we track op IDs, not full op objects. The full ops live in the
 * Zustand store. This hook just manages which ops belong to the local user
 * and in what order they were created.
 *
 * Undo: pop from the undo stack, push to redo stack, emit draw:undo with the opId.
 * Redo: pop from the redo stack, push to undo stack, emit draw:redo with the opId.
 *
 * The undo stack is a simple array of op IDs in creation order.
 */

import { useCallback } from 'react';
import { useSocket } from './useSocket.js';
import { useRoomStore } from '../store/roomStore.js';

/**
 * Returns undo/redo controls for the current user.
 *
 * @returns {{
 *   pushOpId: (opId: string) => void,
 *   undo: () => void,
 *   redo: () => void,
 *   canUndo: () => boolean,
 *   canRedo: () => boolean,
 * }}
 */
export function useUndoRedo() {
  const socket = useSocket();

  const roomId = useRoomStore((s) => s.roomId);
  const userId = useRoomStore((s) => s.userId);

  const undoStack = useRoomStore((s) => s.undoStack);
  const redoStack = useRoomStore((s) => s.redoStack);
  const pushUndoOpId = useRoomStore((s) => s.pushUndoOpId);
  const popUndo = useRoomStore((s) => s.popUndo);
  const popRedo = useRoomStore((s) => s.popRedo);

  /**
   * Call this whenever the user creates a new operation.
   * Clears the redo stack (standard undo/redo behavior: new action kills redo history).
   *
   * @param {string} opId
   */
  const pushOpId = useCallback((opId) => {
    pushUndoOpId(opId);
  }, [pushUndoOpId]);

  /**
   * Undoes the most recent local operation.
   */
  const undo = useCallback(() => {
    const opId = popUndo();
    if (opId) {
      socket.emit('draw:undo', { roomId, userId, opId });
    }
  }, [socket, roomId, userId, popUndo]);

  /**
   * Redoes the most recently undone operation.
   */
  const redo = useCallback(() => {
    const opId = popRedo();
    if (opId) {
      socket.emit('draw:redo', { roomId, userId, opId });
    }
  }, [socket, roomId, userId, popRedo]);

  const canUndo = undoStack.length > 0;
  const canRedo = redoStack.length > 0;

  return { pushOpId, undo, redo, canUndo, canRedo };
}
