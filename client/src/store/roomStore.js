/**
 * client/src/store/roomStore.js
 *
 * Zustand store — global client state for the active room session.
 *
 * What lives here:
 *   - Room identity (roomId, userId, userColor)
 *   - The authoritative operation log (append-only except for undo/redo)
 *   - Set of undone op IDs (for filtering during canvas replay)
 *   - Connected user list with cursor positions
 *   - Active tool state
 *
 * What does NOT live here:
 *   - Canvas refs (those stay in the Canvas component)
 *   - Socket.IO listeners (those live in useSync.js)
 *   - Undo/redo stacks (those live in useUndoRedo.js)
 */

import { create } from 'zustand';
import { TOOL_PEN, BRUSH_SOLID } from '../lib/operationTypes.js';

/**
 * @typedef {Object} ToolState
 * @property {string} activeTool  - Current tool identifier
 * @property {string} color       - Active color (hex)
 * @property {number} lineWidth   - Stroke width in px
 * @property {number} opacity     - 0.0 – 1.0
 * @property {boolean} filled     - For shapes: fill vs outline
 * @property {number} fontSize    - For text tool
 * @property {string} brushStyle  - 'solid' | 'marker' | 'brush' | 'airbrush'
 */

export const useRoomStore = create((set, get) => ({
  // ── Room identity ──────────────────────────────────────────────────────────
  roomId: null,
  userId: null,
  displayName: null,
  userColor: null,

  // ── Operation log ──────────────────────────────────────────────────────────
  /** @type {import('../lib/operationTypes.js').Op[]} */
  operations: [],

  /** @type {Set<string>} Op IDs that are currently undone (excluded from replay) */
  undoneOpIds: new Set(),

  // ── Presence ───────────────────────────────────────────────────────────────
  /**
   * @type {Map<string, { userId: string, displayName: string, color: string }>}
   * Connected users keyed by userId
   */
  users: new Map(),

  /**
   * @type {Map<string, { x: number, y: number }>}
   * Latest cursor positions keyed by userId
   */
  cursors: new Map(),

  // ── Tool state ─────────────────────────────────────────────────────────────
  /** @type {ToolState} */
  tool: {
    activeTool: TOOL_PEN,
    color:      '#1a1a2e',
    lineWidth:  3,
    opacity:    1.0,
    filled:     false,
    fontSize:   18,
    brushStyle: BRUSH_SOLID,
  },

  // ── Connection state ───────────────────────────────────────────────────────
  isConnected: false,

  // ── Actions ───────────────────────────────────────────────────────────────

  /**
   * Called when the server confirms room:joined with full initial state.
   */
  initRoom: ({ roomId, userId, color, displayName, users, operations }) =>
    set({
      roomId,
      userId,
      userColor: color,
      displayName,
      operations,
      users: new Map(users.map((u) => [u.userId, u])),
      cursors: new Map(),
      undoneOpIds: new Set(),
      isConnected: true,
    }),

  /**
   * Appends a new operation to the log.
   * Ignores duplicates by checking if the op ID already exists.
   */
  addOperation: (op) =>
    set((state) => {
      if (state.operations.some((o) => o.id === op.id)) {
        return {}; // duplicate — no-op
      }
      return { operations: [...state.operations, op] };
    }),

  /**
   * Marks an op as undone. The canvas will re-render without it.
   */
  markUndone: (opId) =>
    set((state) => {
      const newUndone = new Set(state.undoneOpIds);
      newUndone.add(opId);
      // Remove from active operations array
      const newOps = state.operations.filter((o) => o.id !== opId);
      return { undoneOpIds: newUndone, operations: newOps };
    }),

  /**
   * Re-activates an undone op (redo). The server sends the full op object
   * so we re-append it.
   */
  markRedone: (opId, op) =>
    set((state) => {
      const newUndone = new Set(state.undoneOpIds);
      newUndone.delete(opId);
      // Re-append the op if not already present
      const exists = state.operations.some((o) => o.id === opId);
      const newOps = exists ? state.operations : [...state.operations, op];
      return { undoneOpIds: newUndone, operations: newOps };
    }),

  /** Clears all operations (board:clear) */
  clearOperations: () =>
    set({ operations: [], undoneOpIds: new Set() }),

  /** Adds or updates a user in the presence map */
  upsertUser: (user) =>
    set((state) => {
      const newUsers = new Map(state.users);
      newUsers.set(user.userId, user);
      return { users: newUsers };
    }),

  /** Removes a user from the presence map and their cursor */
  removeUser: (userId) =>
    set((state) => {
      const newUsers = new Map(state.users);
      newUsers.delete(userId);
      const newCursors = new Map(state.cursors);
      newCursors.delete(userId);
      return { users: newUsers, cursors: newCursors };
    }),

  /** Updates a remote user's cursor position */
  updateCursor: (userId, x, y) =>
    set((state) => {
      const newCursors = new Map(state.cursors);
      newCursors.set(userId, { x, y });
      return { cursors: newCursors };
    }),

  /** Removes cursor for a user (e.g. when they stop moving) */
  removeCursor: (userId) =>
    set((state) => {
      const newCursors = new Map(state.cursors);
      newCursors.delete(userId);
      return { cursors: newCursors };
    }),

  /** Updates one or more tool properties */
  setTool: (updates) =>
    set((state) => ({ tool: { ...state.tool, ...updates } })),

  setConnected: (isConnected) => set({ isConnected }),

  /** Resets all room state (called on room leave) */
  reset: () =>
    set({
      roomId: null, userId: null, displayName: null, userColor: null,
      operations: [], undoneOpIds: new Set(),
      users: new Map(), cursors: new Map(),
      isConnected: false,
    }),
}));
