/** Worker bindings and configuration (wrangler.toml + secrets, TDD §7). */
export interface Env {
  DB: D1Database;
  EVENTS: AnalyticsEngineDataset;
  /** Landing-page origin allowed by CORS on /v1/waitlist* (SEC-6). */
  ALLOWED_ORIGIN: string;
  /** Comma-separated app origins allowed by CORS on app routes. */
  APP_ORIGINS: string;
  /** Comma-separated operator emails allowed on /admin/* (SEC-3). */
  OPERATOR_EMAILS: string;
  /** Cloudflare Access team domain, e.g. `myteam.cloudflareaccess.com`. */
  ACCESS_TEAM_DOMAIN: string;
  /** Optional ISO date; on/after it the cron deletes all waitlist entries (DATA-1). */
  WAITLIST_RETENTION_END?: string;
  // Secrets (wrangler secret put; never in the repo, SEC-2).
  TURNSTILE_SECRET: string;
  ACCESS_AUD: string;
  HASH_PEPPER: string;
}

export function splitList(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}
