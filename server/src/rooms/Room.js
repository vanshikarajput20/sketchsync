/**
 * server/src/rooms/Room.js
 *
 * In-memory representation of a single collaborative whiteboard room.
 *
 * Design decisions:
 * - Operations are stored as an ordered array — append-only in normal flow.
 * - Undo removes an op by ID (not by position) so it's safe across concurrent users.
 * - The undone Set tracks op IDs that have been undone and are eligible for redo.
 * - Users are stored in a Map keyed by userId for O(1) lookup.
 *
 * @typedef {Object} Op
 * @property {string}  id         - Unique op ID (nanoid, client-generated)
 * @property {string}  type       - 'stroke' | 'shape' | 'text' | 'erase'
 * @property {string}  userId     - ID of the user who created the op
 * @property {string}  timestamp  - ISO-8601 creation time
 * @property {string}  color      - Hex color string
 * @property {number}  lineWidth  - Stroke width in pixels
 * @property {number}  opacity    - 0–1
 *
 * @typedef {Object} UserInfo
 * @property {string} userId
 * @property {string} displayName
 * @property {string} color       - Assigned hex color
 * @property {string} socketId    - Current socket ID (changes on reconnect)
 */

/** Colors assigned to users in round-robin order */
const USER_COLORS = [
  '#ef4444', // red
  '#3b82f6', // blue
  '#22c55e', // green
  '#f59e0b', // amber
  '#a855f7', // purple
  '#06b6d4', // cyan
  '#f97316', // orange
  '#ec4899', // pink
];

export class Room {
  /**
   * @param {string} id - The room's UUID slug
   */
  constructor(id) {
    this.id = id;

    /** @type {Op[]} Ordered log of all active (non-undone) operations */
    this.operations = [];

    /** @type {Map<string, Op>} All ops ever added, keyed by op.id (including undone) */
    this._allOps = new Map();

    /** @type {Set<string>} Op IDs that have been undone (eligible for redo) */
    this.undoneOpIds = new Set();

    /** @type {Map<string, UserInfo>} */
    this.users = new Map();

    /** @type {number} Number of ops since the last MongoDB auto-save */
    this.opsSinceLastSave = 0;

    this._colorIndex = 0;
  }

  // ── User management ────────────────────────────────────────────────────────

  /**
   * Adds or updates a user in the room.
   *
   * @param {string} userId
   * @param {string} displayName
   * @param {string} socketId
   * @param {string} [preferredColor] - If provided, use this color; otherwise assign one.
   * @returns {UserInfo}
   */
  addUser(userId, displayName, socketId, preferredColor) {
    const existing = this.users.get(userId);
    if (existing) {
      // User is reconnecting — update their socket ID but keep their color
      existing.socketId = socketId;
      return existing;
    }

    const color = preferredColor || USER_COLORS[this._colorIndex % USER_COLORS.length];
    this._colorIndex++;

    const userInfo = { userId, displayName, color, socketId };
    this.users.set(userId, userInfo);
    return userInfo;
  }

  /**
   * Removes a user from the room.
   * @param {string} userId
   */
  removeUser(userId) {
    this.users.delete(userId);
  }

  /**
   * Returns all connected users as an array.
   * @returns {UserInfo[]}
   */
  getUserList() {
    return Array.from(this.users.values());
  }

  /** @returns {boolean} True if no users are currently in the room */
  isEmpty() {
    return this.users.size === 0;
  }

  // ── Operation management ──────────────────────────────────────────────────

  /**
   * Appends a new operation to the log.
   * If an op with the same ID already exists (duplicate broadcast), it is ignored.
   *
   * @param {Op} op
   * @returns {boolean} True if the op was added, false if it was a duplicate.
   */
  addOperation(op) {
    if (this._allOps.has(op.id)) {
      return false; // Duplicate — ignore
    }
    this._allOps.set(op.id, op);
    this.operations.push(op);
    this.opsSinceLastSave++;
    return true;
  }

  /**
   * Marks an operation as undone. Removes it from the active operations array
   * and adds its ID to the undone set.
   *
   * @param {string} opId
   * @returns {Op | null} The undone op, or null if not found.
   */
  undoOperation(opId) {
    const op = this._allOps.get(opId);
    if (!op || this.undoneOpIds.has(opId)) return null;

    this.operations = this.operations.filter((o) => o.id !== opId);
    this.undoneOpIds.add(opId);
    return op;
  }

  /**
   * Re-activates a previously undone operation by appending it at the end.
   *
   * @param {string} opId
   * @returns {Op | null} The redone op, or null if not found or not undone.
   */
  redoOperation(opId) {
    if (!this.undoneOpIds.has(opId)) return null;
    const op = this._allOps.get(opId);
    if (!op) return null;

    this.undoneOpIds.delete(opId);
    this.operations.push(op);
    this.opsSinceLastSave++;
    return op;
  }

  /**
   * Clears all operations from the room (board:clear event).
   */
  clearAll() {
    this.operations = [];
    this._allOps.clear();
    this.undoneOpIds.clear();
    this.opsSinceLastSave = 0;
  }

  /**
   * Hydrates this room's operation log from a pre-fetched array (e.g. from Redis).
   * Does NOT overwrite users.
   *
   * @param {Op[]} ops
   */
  hydrateOperations(ops) {
    for (const op of ops) {
      this._allOps.set(op.id, op);
    }
    this.operations = [...ops];
  }

  /**
   * Resets the auto-save counter after a successful MongoDB write.
   */
  markSaved() {
    this.opsSinceLastSave = 0;
  }
}
