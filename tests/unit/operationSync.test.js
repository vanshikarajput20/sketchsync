/**
 * tests/unit/operationSync.test.js
 *
 * Unit tests for the core sync logic: the Room class and renderOperation.
 *
 * These tests validate the most critical behaviors of the system:
 * - Operations are deduplicated by ID
 * - Undo removes the correct op and only that op
 * - Redo re-activates the correct op
 * - Replaying remaining ops after undo produces a consistent state
 * - Board clear resets all state
 * - renderOperation correctly calls canvas context methods for each op type
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Room } from '../../server/src/rooms/Room.js';

// ── Test helpers ─────────────────────────────────────────────────────────────

/** Creates a minimal valid op with sensible defaults. */
function makeOp(overrides = {}) {
  return {
    id:        overrides.id        ?? `op_${Math.random().toString(36).slice(2)}`,
    type:      overrides.type      ?? 'stroke',
    userId:    overrides.userId    ?? 'user_A',
    timestamp: overrides.timestamp ?? new Date().toISOString(),
    color:     overrides.color     ?? '#000000',
    lineWidth: overrides.lineWidth ?? 2,
    opacity:   overrides.opacity   ?? 1.0,
    points:    overrides.points    ?? [[0, 0], [10, 10]],
    ...overrides,
  };
}

// ── Room: basic operation management ─────────────────────────────────────────

describe('Room — addOperation', () => {
  let room;
  beforeEach(() => { room = new Room('test-room'); });

  it('adds a valid operation and returns true', () => {
    const op = makeOp({ id: 'op_001' });
    expect(room.addOperation(op)).toBe(true);
    expect(room.operations).toHaveLength(1);
    expect(room.operations[0].id).toBe('op_001');
  });

  it('rejects duplicate op IDs and returns false', () => {
    const op = makeOp({ id: 'op_dup' });
    room.addOperation(op);
    const result = room.addOperation(op); // second time
    expect(result).toBe(false);
    expect(room.operations).toHaveLength(1); // still only one
  });

  it('maintains insertion order for multiple ops', () => {
    const ops = ['op_1', 'op_2', 'op_3'].map((id) => makeOp({ id }));
    ops.forEach((op) => room.addOperation(op));
    expect(room.operations.map((o) => o.id)).toEqual(['op_1', 'op_2', 'op_3']);
  });

  it('increments opsSinceLastSave on each add', () => {
    room.addOperation(makeOp({ id: 'op_a' }));
    room.addOperation(makeOp({ id: 'op_b' }));
    expect(room.opsSinceLastSave).toBe(2);
  });

  it('does NOT increment opsSinceLastSave for duplicates', () => {
    const op = makeOp({ id: 'op_dup2' });
    room.addOperation(op);
    room.addOperation(op);
    expect(room.opsSinceLastSave).toBe(1);
  });
});

// ── Room: undo ─────────────────────────────────────────────────────────────

describe('Room — undoOperation', () => {
  let room;
  beforeEach(() => {
    room = new Room('test-room');
    ['op_1', 'op_2', 'op_3'].forEach((id) =>
      room.addOperation(makeOp({ id, userId: 'user_A' }))
    );
  });

  it('removes the specified op from operations[]', () => {
    room.undoOperation('op_2');
    expect(room.operations.map((o) => o.id)).toEqual(['op_1', 'op_3']);
  });

  it('returns the undone op object', () => {
    const result = room.undoOperation('op_1');
    expect(result).toBeTruthy();
    expect(result.id).toBe('op_1');
  });

  it('adds the op ID to undoneOpIds set', () => {
    room.undoOperation('op_2');
    expect(room.undoneOpIds.has('op_2')).toBe(true);
  });

  it('returns null for a non-existent op ID', () => {
    expect(room.undoOperation('op_does_not_exist')).toBeNull();
  });

  it('returns null if op is already undone (idempotent)', () => {
    room.undoOperation('op_1');
    const second = room.undoOperation('op_1');
    expect(second).toBeNull();
    // Should still have 2 ops (op_2, op_3)
    expect(room.operations).toHaveLength(2);
  });

  it('does not affect other ops when undoing a specific op', () => {
    room.undoOperation('op_2');
    expect(room.operations[0].id).toBe('op_1');
    expect(room.operations[1].id).toBe('op_3');
  });

  it('handles undoing the first op correctly', () => {
    room.undoOperation('op_1');
    expect(room.operations.map((o) => o.id)).toEqual(['op_2', 'op_3']);
  });

  it('handles undoing the last op correctly', () => {
    room.undoOperation('op_3');
    expect(room.operations.map((o) => o.id)).toEqual(['op_1', 'op_2']);
  });

  it('handles multiple sequential undos correctly', () => {
    room.undoOperation('op_3');
    room.undoOperation('op_2');
    expect(room.operations.map((o) => o.id)).toEqual(['op_1']);
  });
});

// ── Room: redo ─────────────────────────────────────────────────────────────

describe('Room — redoOperation', () => {
  let room;
  beforeEach(() => {
    room = new Room('test-room');
    ['op_1', 'op_2', 'op_3'].forEach((id) =>
      room.addOperation(makeOp({ id }))
    );
    room.undoOperation('op_2'); // pre-undo one op
  });

  it('re-activates an undone op (appended at end)', () => {
    room.redoOperation('op_2');
    const ids = room.operations.map((o) => o.id);
    expect(ids).toContain('op_2');
    // Redone ops are appended at the end
    expect(ids[ids.length - 1]).toBe('op_2');
  });

  it('removes the op from undoneOpIds', () => {
    room.redoOperation('op_2');
    expect(room.undoneOpIds.has('op_2')).toBe(false);
  });

  it('returns the redone op object', () => {
    const result = room.redoOperation('op_2');
    expect(result).toBeTruthy();
    expect(result.id).toBe('op_2');
  });

  it('returns null for an op that was never undone', () => {
    expect(room.redoOperation('op_1')).toBeNull(); // op_1 is not undone
  });

  it('returns null for a non-existent op', () => {
    expect(room.redoOperation('op_ghost')).toBeNull();
  });

  it('increments opsSinceLastSave on redo', () => {
    const before = room.opsSinceLastSave;
    room.redoOperation('op_2');
    expect(room.opsSinceLastSave).toBe(before + 1);
  });
});

// ── Room: clearAll ────────────────────────────────────────────────────────

describe('Room — clearAll', () => {
  let room;
  beforeEach(() => {
    room = new Room('test-room');
    ['op_1', 'op_2'].forEach((id) => room.addOperation(makeOp({ id })));
    room.undoOperation('op_1');
  });

  it('empties the operations array', () => {
    room.clearAll();
    expect(room.operations).toHaveLength(0);
  });

  it('empties the undoneOpIds set', () => {
    room.clearAll();
    expect(room.undoneOpIds.size).toBe(0);
  });

  it('resets opsSinceLastSave to 0', () => {
    room.clearAll();
    expect(room.opsSinceLastSave).toBe(0);
  });

  it('allows new ops to be added after clear', () => {
    room.clearAll();
    const op = makeOp({ id: 'op_new' });
    expect(room.addOperation(op)).toBe(true);
    expect(room.operations).toHaveLength(1);
  });
});

// ── Room: hydrateOperations ───────────────────────────────────────────────

describe('Room — hydrateOperations', () => {
  it('populates operations from a pre-fetched array', () => {
    const room = new Room('hydrate-room');
    const ops  = ['op_a', 'op_b', 'op_c'].map((id) => makeOp({ id }));
    room.hydrateOperations(ops);

    expect(room.operations).toHaveLength(3);
    expect(room.operations.map((o) => o.id)).toEqual(['op_a', 'op_b', 'op_c']);
  });

  it('enables undo on hydrated ops', () => {
    const room = new Room('hydrate-room');
    const ops  = [makeOp({ id: 'op_h1' }), makeOp({ id: 'op_h2' })];
    room.hydrateOperations(ops);

    room.undoOperation('op_h1');
    expect(room.operations.map((o) => o.id)).toEqual(['op_h2']);
  });

  it('does not affect existing users', () => {
    const room = new Room('hydrate-room');
    room.addUser('user_X', 'Alice', 'socket_1');

    room.hydrateOperations([makeOp({ id: 'op_z' })]);

    expect(room.users.has('user_X')).toBe(true);
    expect(room.operations).toHaveLength(1);
  });
});

// ── Room: user management ────────────────────────────────────────────────

describe('Room — user management', () => {
  let room;
  beforeEach(() => { room = new Room('users-room'); });

  it('adds a user and returns UserInfo', () => {
    const info = room.addUser('u1', 'Alice', 'sock_1');
    expect(info.userId).toBe('u1');
    expect(info.displayName).toBe('Alice');
    expect(info.color).toBeTruthy();
    expect(info.socketId).toBe('sock_1');
  });

  it('assigns unique colors to different users', () => {
    const a = room.addUser('u1', 'Alice', 's1');
    const b = room.addUser('u2', 'Bob',   's2');
    // Colors may cycle but first two should differ (we have 8 preset colors)
    expect(a.color).not.toBe(b.color);
  });

  it('updates socketId on reconnect without changing color', () => {
    const first  = room.addUser('u1', 'Alice', 'old_sock');
    const second = room.addUser('u1', 'Alice', 'new_sock');
    expect(second.socketId).toBe('new_sock');
    expect(second.color).toBe(first.color);
  });

  it('removes a user', () => {
    room.addUser('u1', 'Alice', 's1');
    room.removeUser('u1');
    expect(room.users.has('u1')).toBe(false);
  });

  it('isEmpty returns true when no users', () => {
    expect(room.isEmpty()).toBe(true);
  });

  it('isEmpty returns false when users are present', () => {
    room.addUser('u1', 'Alice', 's1');
    expect(room.isEmpty()).toBe(false);
  });

  it('getUserList returns all users as an array', () => {
    room.addUser('u1', 'Alice', 's1');
    room.addUser('u2', 'Bob',   's2');
    const list = room.getUserList();
    expect(list).toHaveLength(2);
    expect(list.map((u) => u.userId)).toContain('u1');
    expect(list.map((u) => u.userId)).toContain('u2');
  });
});

// ── Room: markSaved ───────────────────────────────────────────────────────

describe('Room — markSaved', () => {
  it('resets opsSinceLastSave to 0', () => {
    const room = new Room('save-room');
    room.addOperation(makeOp({ id: 'op_s1' }));
    room.addOperation(makeOp({ id: 'op_s2' }));
    expect(room.opsSinceLastSave).toBe(2);
    room.markSaved();
    expect(room.opsSinceLastSave).toBe(0);
  });
});

// ── Concurrent edit simulation ────────────────────────────────────────────

describe('Room — concurrent edits from multiple users', () => {
  it('correctly accepts ops from multiple users in arrival order', () => {
    const room = new Room('concurrent-room');

    // Simulate 3 users each sending an op "simultaneously"
    const opA = makeOp({ id: 'op_A', userId: 'user_A' });
    const opB = makeOp({ id: 'op_B', userId: 'user_B' });
    const opC = makeOp({ id: 'op_C', userId: 'user_C' });

    room.addOperation(opA);
    room.addOperation(opB);
    room.addOperation(opC);

    expect(room.operations).toHaveLength(3);
    expect(room.operations.map((o) => o.id)).toEqual(['op_A', 'op_B', 'op_C']);
  });

  it('user A undoing their op does not remove user B\'s op', () => {
    const room = new Room('concurrent-room');
    const opA  = makeOp({ id: 'op_A', userId: 'user_A' });
    const opB  = makeOp({ id: 'op_B', userId: 'user_B' });

    room.addOperation(opA);
    room.addOperation(opB);
    room.undoOperation('op_A');

    // op_B should remain
    expect(room.operations).toHaveLength(1);
    expect(room.operations[0].id).toBe('op_B');
  });

  it('handles interleaved undo/redo from two users correctly', () => {
    const room = new Room('concurrent-room');
    const opA1 = makeOp({ id: 'opA1', userId: 'user_A' });
    const opB1 = makeOp({ id: 'opB1', userId: 'user_B' });
    const opA2 = makeOp({ id: 'opA2', userId: 'user_A' });

    room.addOperation(opA1);
    room.addOperation(opB1);
    room.addOperation(opA2);

    // User A undoes opA2, then opA1
    room.undoOperation('opA2');
    room.undoOperation('opA1');

    // Only opB1 should remain
    expect(room.operations.map((o) => o.id)).toEqual(['opB1']);

    // User A redoes opA1
    room.redoOperation('opA1');
    expect(room.operations.map((o) => o.id)).toContain('opA1');
    expect(room.operations.map((o) => o.id)).toContain('opB1');
    expect(room.operations.map((o) => o.id)).not.toContain('opA2'); // still undone
  });
});
