/**
 * server/src/persistence/redis.js
 *
 * Redis client wrapper using ioredis.
 *
 * Key schema:
 *   room:{roomId}:ops   — Redis List  — ordered log of serialized op JSON strings
 *   room:{roomId}:meta  — Redis Hash  — { createdAt, lastActivity }
 *
 * Every room key is given a TTL (default 24 h) that resets on activity, so idle
 * rooms are automatically evicted without a cron job.
 */

import Redis from 'ioredis';

/** @type {Redis | null} */
let client = null;

const ROOM_TTL = parseInt(process.env.REDIS_ROOM_TTL || '86400', 10); // seconds

// ── Connection ──────────────────────────────────────────────────────────────

/**
 * Connects to Redis. Called once at server startup.
 * Resolves when the connection is ready.
 */
export async function connectRedis() {
  const url = process.env.REDIS_URL || 'redis://localhost:6379';

  client = new Redis(url, {
    // Retry strategy: exponential backoff up to 30 s, then stop retrying
    retryStrategy(times) {
      if (times > 10) return null; // stop retrying → ioredis emits an error
      return Math.min(times * 200, 30_000);
    },
    enableReadyCheck: true,
    maxRetriesPerRequest: 3,
    // Required for Upstash TLS URLs (rediss://)
    tls: url.startsWith('rediss://') ? {} : undefined,
  });

  return new Promise((resolve, reject) => {
    client.once('ready', () => {
      console.log('✅  Redis connected');
      resolve();
    });
    client.once('error', (err) => {
      console.error('❌  Redis connection error:', err.message);
      reject(err);
    });
  });
}

/**
 * Returns the raw ioredis client, for advanced callers.
 * @returns {Redis}
 */
export function getRedisClient() {
  if (!client) throw new Error('Redis not connected — call connectRedis() first');
  return client;
}

// ── Room operations ──────────────────────────────────────────────────────────

const opsKey = (roomId) => `room:${roomId}:ops`;
const metaKey = (roomId) => `room:${roomId}:meta`;

/**
 * Appends a single operation to a room's ordered log.
 * Also resets the TTL so active rooms don't expire.
 *
 * @param {string} roomId
 * @param {import('../rooms/Room.js').Op} op
 */
export async function appendOp(roomId, op) {
  const key = opsKey(roomId);
  const serialized = JSON.stringify(op);
  await client.rpush(key, serialized);
  await client.expire(key, ROOM_TTL);
  // Update lastActivity on meta
  await client.hset(metaKey(roomId), 'lastActivity', Date.now());
  await client.expire(metaKey(roomId), ROOM_TTL);
}

/**
 * Retrieves all operations for a room in insertion order.
 *
 * @param {string} roomId
 * @returns {Promise<import('../rooms/Room.js').Op[]>}
 */
export async function getOps(roomId) {
  const raw = await client.lrange(opsKey(roomId), 0, -1);
  return raw.map((s) => JSON.parse(s));
}

/**
 * Removes a single operation by its ID from the room's log.
 *
 * Redis Lists don't support index-based deletion, so we:
 *   1. LRANGE to get all ops
 *   2. Filter out the target op
 *   3. DEL + RPUSH to rewrite the list atomically via a pipeline
 *
 * This is O(n) but acceptable for typical whiteboard session sizes (< 10 k ops).
 * At large scale this would be replaced with a sorted set keyed by sequence number.
 *
 * @param {string} roomId
 * @param {string} opId
 */
export async function removeOp(roomId, opId) {
  const ops = await getOps(roomId);
  const filtered = ops.filter((op) => op.id !== opId);

  const key = opsKey(roomId);
  const pipeline = client.pipeline();
  pipeline.del(key);
  for (const op of filtered) {
    pipeline.rpush(key, JSON.stringify(op));
  }
  pipeline.expire(key, ROOM_TTL);
  await pipeline.exec();
}

/**
 * Marks a previously-undone operation as active again (redo).
 * Since we store the full op, redo just re-appends at the end.
 *
 * @param {string} roomId
 * @param {import('../rooms/Room.js').Op} op
 */
export async function redoOp(roomId, op) {
  await appendOp(roomId, op);
}

/**
 * Stores room metadata when a room is first created.
 *
 * @param {string} roomId
 */
export async function initRoomMeta(roomId) {
  await client.hset(metaKey(roomId), {
    createdAt: Date.now(),
    lastActivity: Date.now(),
  });
  await client.expire(metaKey(roomId), ROOM_TTL);
}

/**
 * Checks whether any Redis data exists for a given room.
 *
 * @param {string} roomId
 * @returns {Promise<boolean>}
 */
export async function roomExists(roomId) {
  const exists = await client.exists(opsKey(roomId));
  return exists > 0;
}

/**
 * Deletes all Redis keys for a room (called when a board is permanently deleted).
 *
 * @param {string} roomId
 */
export async function deleteRoom(roomId) {
  await client.del(opsKey(roomId), metaKey(roomId));
}
