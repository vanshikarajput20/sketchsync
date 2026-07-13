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

import { useRef, useCallback } from 'react';
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

  /** @type {React.MutableRefObject<string[]>} Stack of op IDs that can be undone */
  const undoStack = useRef([]);

  /** @type {React.MutableRefObject<string[]>} Stack of op IDs that can be redone */
  const redoStack = useRef([]);

  const roomId = useRoomStore((s) => s.roomId);
  const userId = useRoomStore((s) => s.userId);

  /**
   * Call this whenever the user creates a new operation.
   * Clears the redo stack (standard undo/redo behavior: new action kills redo history).
   *
   * @param {string} opId
   */
  const pushOpId = useCallback((opId) => {
    undoStack.current.push(opId);
    redoStack.current = []; // clear redo history on new action
  }, []);

  /**
   * Undoes the most recent local operation.
   */
  const undo = useCallback(() => {
    if (undoStack.current.length === 0) return;
    const opId = undoStack.current.pop();
    redoStack.current.push(opId);
    socket.emit('draw:undo', { roomId, userId, opId });
  }, [socket, roomId, userId]);

  /**
   * Redoes the most recently undone operation.
   */
  const redo = useCallback(() => {
    if (redoStack.current.length === 0) return;
    const opId = redoStack.current.pop();
    undoStack.current.push(opId);
    socket.emit('draw:redo', { roomId, userId, opId });
  }, [socket, roomId, userId]);

  const canUndo = useCallback(() => undoStack.current.length > 0, []);
  const canRedo = useCallback(() => redoStack.current.length > 0, []);

  return { pushOpId, undo, redo, canUndo, canRedo };
}
