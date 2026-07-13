/**
 * tests/unit/rateLimiter.test.js
 *
 * Unit tests for the token-bucket rate limiter.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createRateLimiter } from '../../server/src/socket/rateLimiter.js';

describe('createRateLimiter', () => {
  it('allows the first event for a new socket', () => {
    const limiter = createRateLimiter({ capacity: 5, refillRate: 5 });
    expect(limiter.consume('socket_1')).toBe(true);
  });

  it('allows up to `capacity` events in rapid succession', () => {
    const limiter = createRateLimiter({ capacity: 3, refillRate: 1000 });
    // All 3 should pass
    expect(limiter.consume('s1')).toBe(true);
    expect(limiter.consume('s1')).toBe(true);
    expect(limiter.consume('s1')).toBe(true);
  });

  it('drops the event when bucket is empty', () => {
    const limiter = createRateLimiter({ capacity: 2, refillRate: 0 });
    limiter.consume('s1');
    limiter.consume('s1');
    expect(limiter.consume('s1')).toBe(false); // bucket empty
  });

  it('is independent per socket ID', () => {
    const limiter = createRateLimiter({ capacity: 1, refillRate: 0 });
    limiter.consume('socketA');          // drains socketA's bucket
    expect(limiter.consume('socketB')).toBe(true);  // socketB has its own bucket
    expect(limiter.consume('socketA')).toBe(false); // socketA is drained
  });

  it('refills tokens over time', async () => {
    const limiter = createRateLimiter({ capacity: 2, refillRate: 100 });
    // Drain the bucket
    limiter.consume('s1');
    limiter.consume('s1');
    expect(limiter.consume('s1')).toBe(false); // empty

    // Wait for refill (100 tokens/sec → 1 token per 10ms)
    await new Promise((r) => setTimeout(r, 15));

    expect(limiter.consume('s1')).toBe(true); // refilled
  });

  it('caps tokens at capacity even after long wait', async () => {
    const limiter = createRateLimiter({ capacity: 3, refillRate: 100 });
    // Drain
    limiter.consume('s1');
    limiter.consume('s1');
    limiter.consume('s1');

    // Wait much longer than needed to refill to max
    await new Promise((r) => setTimeout(r, 100));

    // Should have exactly `capacity` tokens, not more
    expect(limiter.consume('s1')).toBe(true);
    expect(limiter.consume('s1')).toBe(true);
    expect(limiter.consume('s1')).toBe(true);
    // 4th should fail (capped at capacity)
    expect(limiter.consume('s1')).toBe(false);
  });

  it('cleanup removes the socket bucket without error', () => {
    const limiter = createRateLimiter({ capacity: 5, refillRate: 5 });
    limiter.consume('s1');
    expect(() => limiter.cleanup('s1')).not.toThrow();
    // After cleanup, the next call should be treated as a fresh socket
    expect(limiter.consume('s1')).toBe(true);
  });

  it('cleanup on non-existent socket is a no-op', () => {
    const limiter = createRateLimiter({ capacity: 5, refillRate: 5 });
    expect(() => limiter.cleanup('ghost_socket')).not.toThrow();
  });
});
