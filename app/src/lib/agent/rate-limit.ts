/**
 * Lightweight in-memory rate limiter for the agent API (Finding #2).
 *
 * Fixed-window counters keyed by a string (here: key-label + client IP +
 * bucket). This is per-process — adequate for the single-instance VPS the
 * scrum master is deployed on (see the implementation plan). For a multi-
 * instance / serverless deployment, swap this for a shared store (Upstash /
 * Redis); the call sites stay the same.
 *
 * Limits are deliberately tiered: pure reads are generous, outbound/AI/payment
 * calls are tight (they cost money and can mail-bomb or spam Telegram).
 */
import type { Scope } from "@/lib/agent/scopes";

type Window = { count: number; resetAt: number };

const WINDOW_MS = 60_000;

/** Per-minute allowance by scope, plus auth-failure throttle (brute force). */
const LIMITS: Record<Scope | "auth_fail", number> = {
    read: 120,
    write: 60,
    outbound: 10,
    email: 10,
    destructive: 5,
    auth_fail: 20,
};

const buckets = new Map<string, Window>();

/**
 * Hard cap on distinct windows. The auth-failure path is reachable pre-auth and
 * keyed by client IP, so without a cap a flood of distinct IPs could grow the
 * Map unbounded within a single window (Finding NEW-4). When over the cap we
 * drop expired entries, then evict the soonest-to-reset until back under 80%.
 */
const MAX_BUCKETS = 10_000;

/** Drop expired windows, and bound total size, so the Map can't grow unbounded. */
function sweep(now: number): void {
    if (buckets.size < MAX_BUCKETS) return;
    for (const [k, w] of buckets) {
        if (w.resetAt <= now) buckets.delete(k);
    }
    if (buckets.size < MAX_BUCKETS) return;
    // Still over cap (a burst of live windows): evict soonest-to-reset first.
    const target = Math.floor(MAX_BUCKETS * 0.8);
    const sorted = [...buckets.entries()].sort((a, b) => a[1].resetAt - b[1].resetAt);
    for (let i = 0; i < sorted.length && buckets.size > target; i++) {
        buckets.delete(sorted[i][0]);
    }
}

export type RateResult = {
    ok: boolean;
    limit: number;
    remaining: number;
    /** Seconds until the window resets (for Retry-After). */
    retryAfter: number;
};

function hit(bucketKey: string, limit: number, now: number): RateResult {
    sweep(now);
    let w = buckets.get(bucketKey);
    if (!w || w.resetAt <= now) {
        w = { count: 0, resetAt: now + WINDOW_MS };
        buckets.set(bucketKey, w);
    }
    w.count += 1;
    const remaining = Math.max(0, limit - w.count);
    const retryAfter = Math.ceil((w.resetAt - now) / 1000);
    return { ok: w.count <= limit, limit, remaining, retryAfter };
}

/** Throttle a successful-tool invocation by (identity, scope). */
export function checkToolRate(identity: string, scope: Scope, now = Date.now()): RateResult {
    return hit(`tool:${scope}:${identity}`, LIMITS[scope], now);
}

/** Throttle repeated auth FAILURES by client IP (brute-force defence). */
export function checkAuthFailureRate(ip: string, now = Date.now()): RateResult {
    return hit(`authfail:${ip}`, LIMITS.auth_fail, now);
}

/** Test-only: clear all windows. No-op in production (Finding NEW-7). */
export const _resetRateLimiter: () => void =
    process.env.NODE_ENV === "production" ? () => {} : () => buckets.clear();
