/**
 * server/src/models/Board.js
 *
 * Mongoose schema for persisted boards.
 *
 * A Board document is written when:
 *   a) The operation count reaches AUTOSAVE_THRESHOLD (default 50), or
 *   b) The last user leaves a room.
 *
 * It acts as a durable backup — Redis is the hot cache for active rooms, while
 * MongoDB provides long-term storage that survives Redis evictions.
 */

import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * Schema for a single drawing operation.
 * Stored as Mixed (schema-less) to avoid tight coupling between the DB model
 * and the operation type definitions. Validation happens at the socket layer.
 */
const OperationSchema = new Schema(
  {
    id: { type: String, required: true },
    type: {
      type: String,
      enum: ['stroke', 'shape', 'text', 'erase'],
      required: true,
    },
    userId: { type: String, required: true },
    timestamp: { type: String, required: true },
    // All remaining fields (points, shape, x, y, color, lineWidth, etc.)
    // are stored as arbitrary Mixed fields — no schema enforcement here.
  },
  { strict: false } // allows extra fields like `points`, `text`, `shape`, etc.
);

const BoardSchema = new Schema(
  {
    /** The room identifier — matches the UUID slug used in the URL. */
    roomId: { type: String, required: true, unique: true, index: true },

    /** Ordered array of all drawing operations in insertion order. */
    operations: [OperationSchema],

    /** Number of operations at the time of the last save (for delta tracking). */
    operationCount: { type: Number, default: 0 },

    /** ISO timestamp of the last auto-save. */
    savedAt: { type: Date, default: Date.now },
  },
  {
    timestamps: true, // adds createdAt, updatedAt
  }
);

/**
 * Upserts the full operation log for a room.
 * Uses findOneAndUpdate with upsert so this is safe to call from multiple
 * concurrent auto-save triggers (last write wins, which is fine since we
 * always write the complete list).
 *
 * @param {string} roomId
 * @param {object[]} operations
 */
BoardSchema.statics.upsertBoard = async function (roomId, operations) {
  return this.findOneAndUpdate(
    { roomId },
    {
      $set: {
        operations,
        operationCount: operations.length,
        savedAt: new Date(),
      },
    },
    { upsert: true, new: true }
  );
};

const realBoard = mongoose.model('Board', BoardSchema);

const mockBoards = new Map();
const mockBoardModel = {
  findOne(query, projection) {
    const roomId = query.roomId;
    return {
      async lean() {
        const board = mockBoards.get(roomId);
        if (!board) return null;
        if (projection && projection.operationCount) {
          return { roomId, operationCount: board.operationCount };
        }
        return board;
      }
    };
  },
  async upsertBoard(roomId, operations) {
    const board = {
      roomId,
      operations: [...operations],
      operationCount: operations.length,
      savedAt: new Date()
    };
    mockBoards.set(roomId, board);
    return board;
  }
};

export const Board = process.env.MOCK_DB === 'true' ? mockBoardModel : realBoard;
