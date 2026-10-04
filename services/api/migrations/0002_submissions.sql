-- 0002_submissions.sql (M5) — LLD §5. Player game submissions (DATA-2).
CREATE TABLE submissions (
  id           TEXT PRIMARY KEY,                      -- server UUIDv4
  client_id    TEXT NOT NULL UNIQUE,                  -- Idempotency-Key
  install_hash TEXT NOT NULL,
  description  TEXT NOT NULL,
  link         TEXT,
  seen_in      TEXT,
  status       TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received','reviewing','planned','declined','shipped')),
  public_note  TEXT,
  app_version  TEXT,
  platform     TEXT,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);
CREATE INDEX idx_sub_install ON submissions(install_hash, created_at);
CREATE INDEX idx_sub_status ON submissions(status, created_at);
