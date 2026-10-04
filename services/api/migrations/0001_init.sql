-- 0001_init.sql (M1-T3) — LLD §5. Waitlist entries (DATA-1) and fixed-window rate limits (LLD §8).
CREATE TABLE waitlist_entries (
  id                     TEXT PRIMARY KEY,            -- UUIDv4
  email_normalized       TEXT NOT NULL UNIQUE,
  price_preference       TEXT NOT NULL CHECK (price_preference IN ('monthly_299','monthly_499','lifetime_1999','free_only')),
  consent_at             TEXT NOT NULL,               -- ISO 8601 UTC
  consent_notice_version TEXT NOT NULL,
  utm_source TEXT, utm_medium TEXT, utm_campaign TEXT, utm_content TEXT, referrer_host TEXT,
  created_at             TEXT NOT NULL,
  updated_at             TEXT NOT NULL
);
CREATE INDEX idx_waitlist_created ON waitlist_entries(created_at);

CREATE TABLE rate_limits (
  scope        TEXT NOT NULL,                         -- e.g. 'waitlist:ip', 'sub:install', 'sub:ip'
  key_hash     TEXT NOT NULL,                         -- HMAC of IP or install ID
  window_start TEXT NOT NULL,                         -- start of fixed window, UTC
  count        INTEGER NOT NULL,
  PRIMARY KEY (scope, key_hash, window_start)
);
