import type { Env } from "./env";
import { DAY_MS } from "./ratelimit";

export interface CleanupResult {
  rateLimitRowsDeleted: number;
  waitlistRowsDeleted: number;
}

/**
 * Daily cron (LLD §5): deletes rate_limits windows older than 48 h so IP hashes are
 * short-lived (DATA-2), and enforces DATA-1 retention once WAITLIST_RETENTION_END is set.
 */
export async function runScheduledCleanup(env: Env, now: Date): Promise<CleanupResult> {
  const cutoff = new Date(now.getTime() - 2 * DAY_MS).toISOString();
  const rl = await env.DB.prepare("DELETE FROM rate_limits WHERE window_start < ?")
    .bind(cutoff)
    .run();

  let waitlistRowsDeleted = 0;
  const end = env.WAITLIST_RETENTION_END ? new Date(env.WAITLIST_RETENTION_END) : null;
  if (end && !Number.isNaN(end.getTime()) && now.getTime() >= end.getTime()) {
    const wl = await env.DB.prepare("DELETE FROM waitlist_entries").run();
    waitlistRowsDeleted = wl.meta.changes;
  }
  const result = { rateLimitRowsDeleted: rl.meta.changes, waitlistRowsDeleted };
  console.log(JSON.stringify({ route: "cron.cleanup", ...result }));
  return result;
}
