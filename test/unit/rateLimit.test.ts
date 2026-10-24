import { describe, expect, it } from "vitest";
import { createRateLimiter } from "../../server/utils/rateLimit";

describe("createRateLimiter", () => {
  it("allows up to the limit per window, per key", () => {
    const limiter = createRateLimiter({ limit: 2, windowMs: 1000 });
    expect(limiter.hit("a", 0).allowed).toBe(true);
    expect(limiter.hit("a", 10).allowed).toBe(true);
    expect(limiter.hit("a", 20)).toMatchObject({
      allowed: false,
      remaining: 0,
    });
    expect(limiter.hit("b", 20).allowed).toBe(true);
  });

  it("starts a fresh window after it elapses", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 1000 });
    limiter.hit("a", 0);
    expect(limiter.isBlocked("a", 999)).toBe(true);
    expect(limiter.isBlocked("a", 1000)).toBe(false);
    expect(limiter.hit("a", 1000).allowed).toBe(true);
  });

  it("checks without counting", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 1000 });
    expect(limiter.isBlocked("a", 0)).toBe(false);
    expect(limiter.isBlocked("a", 0)).toBe(false);
    expect(limiter.hit("a", 0).allowed).toBe(true);
  });
});
