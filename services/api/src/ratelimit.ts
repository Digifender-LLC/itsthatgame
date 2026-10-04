import { ApiError } from "./errors";

export const HOUR_MS = 60 * 60 * 1000;
export const DAY_MS = 24 * HOUR_MS;

/** LLD §8 / RULE-8 limits. */
export const LIMITS = {
  waitlistPerIp: { scope: "waitlist:ip", limit: 10, windowMs: HOUR_MS },
  submissionsPerInstall: { scope: "sub:install", limit: 5, windowMs: DAY_MS },
  submissionsPerIp: { scope: "sub:ip", limit: 20, windowMs: DAY_MS },
  eventsPerInstall: { scope: "events:install", limit: 60, windowMs: HOUR_MS },
} as const;

export interface LimitSpec {
  scope: string;
  limit: number;
  windowMs: number;
}

/**
 * Counts one hit in the fixed window containing `now` with a single atomic
 * `INSERT … ON CONFLICT DO UPDATE … RETURNING` and throws 429 (with Retry-After seconds)
 * when the returned count exceeds the limit.
 */
export async function enforceLimit(
  db: D1Database,
  spec: LimitSpec,
  keyHash: string,
  now: Date,
): Promise<void> {
  const startMs = Math.floor(now.getTime() / spec.windowMs) * spec.windowMs;
  const row = await db
    .prepare(
      `INSERT INTO rate_limits (scope, key_hash, window_start, count) VALUES (?, ?, ?, 1)
       ON CONFLICT (scope, key_hash, window_start) DO UPDATE SET count = count + 1
       RETURNING count`,
    )
    .bind(spec.scope, keyHash, new Date(startMs).toISOString())
    .first<{ count: number }>();
  if (row && row.count > spec.limit) {
    const retryAfter = Math.max(1, Math.ceil((startMs + spec.windowMs - now.getTime()) / 1000));
    throw new ApiError("rate_limited", "Too many requests; try again later", { retryAfter });
  }
}
