/**
 * server/src/socket/rateLimiter.js
 *
 * Per-socket token-bucket rate limiter for high-frequency events (cursor:move).
 *
 * Algorithm: Token Bucket
 *   - Each socket starts with a full bucket of `capacity` tokens.
 *   - Each allowed event consumes one token.
 *   - Tokens refill at `refillRate` per second (pro-rated by elapsed time).
 *   - If the bucket is empty, the event is dropped and `false` is returned.
 *
 * This prevents a single misbehaving client from flooding the server and all
 * other connected clients with cursor update events.
 *
 * Usage:
 *   const limiter = createRateLimiter({ capacity: 20, refillRate: 20 });
 *   if (!limiter.consume(socketId)) return; // drop the event
 */

/**
 * Creates a rate limiter instance.
 *
 * @param {object} options
 * @param {number} options.capacity    - Max tokens a socket can accumulate
 * @param {number} options.refillRate  - Tokens added per second
 * @returns {{ consume: (socketId: string) => boolean, cleanup: (socketId: string) => void }}
 */
export function createRateLimiter({ capacity = 20, refillRate = 20 } = {}) {
  /**
   * @type {Map<string, { tokens: number, lastRefill: number }>}
   */
  const buckets = new Map();

  /**
   * Attempts to consume one token for the given socket.
   *
   * @param {string} socketId
   * @returns {boolean} True if the event is allowed, false if rate-limited.
   */
  function consume(socketId) {
    const now = Date.now();

    if (!buckets.has(socketId)) {
      buckets.set(socketId, { tokens: capacity, lastRefill: now });
    }

    const bucket = buckets.get(socketId);

    // Refill tokens based on elapsed time
    const elapsed = (now - bucket.lastRefill) / 1000; // convert ms → seconds
    const tokensToAdd = elapsed * refillRate;

    bucket.tokens = Math.min(capacity, bucket.tokens + tokensToAdd);
    bucket.lastRefill = now;

    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return true; // allowed
    }

    return false; // rate-limited — drop event
  }

  /**
   * Removes the bucket for a socket when it disconnects.
   * Call this on 'disconnect' to avoid memory leaks.
   *
   * @param {string} socketId
   */
  function cleanup(socketId) {
    buckets.delete(socketId);
  }

  return { consume, cleanup };
}

// Shared instance for cursor events — 20 events/sec per socket
export const cursorLimiter = createRateLimiter({ capacity: 20, refillRate: 20 });
