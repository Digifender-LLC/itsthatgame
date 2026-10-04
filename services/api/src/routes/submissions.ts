import {
  idempotencyKey,
  submissionCreateRequest,
  type SubmissionCreateResponse,
  type SubmissionListResponse,
  type SubmissionStatus,
} from "@itg/contracts";
import { ipHash, readAppHeaders, type Ctx } from "../context";
import { ApiError } from "../errors";
import { BODY_LIMITS, json, parseWith, readJson } from "../http";
import { enforceLimit, LIMITS } from "../ratelimit";

interface StoredRow {
  id: string;
  install_hash: string;
  status: SubmissionStatus;
  created_at: string;
}

const conflict = () =>
  new ApiError("conflict", "Idempotency-Key was already used by a different install");

async function findByClientId(db: D1Database, clientId: string): Promise<StoredRow | null> {
  return db
    .prepare("SELECT id, install_hash, status, created_at FROM submissions WHERE client_id = ?")
    .bind(clientId)
    .first<StoredRow>();
}

function created(row: StoredRow, status: 200 | 201): Response {
  const body: SubmissionCreateResponse = {
    id: row.id,
    status: row.status,
    createdAt: row.created_at,
  };
  return json(status, body);
}

/** POST /v1/submissions (IF-2, FR-SUB-1..3, RULE-7, RULE-8). */
export async function createSubmission(ctx: Ctx): Promise<Response> {
  const app = await readAppHeaders(ctx);
  const rawKey = ctx.req.headers.get("Idempotency-Key");
  if (!rawKey || !idempotencyKey.safeParse(rawKey).success) {
    throw new ApiError("validation_failed", "Idempotency-Key must be a UUID", {
      fields: { "Idempotency-Key": rawKey ? "invalid" : "required" },
    });
  }
  const clientId = rawKey.toLowerCase();
  const body = parseWith(submissionCreateRequest, await readJson(ctx.req, BODY_LIMITS.default));
  const db = ctx.env.DB;

  // Replays of an already stored submission return the original row without
  // consuming rate-limit budget (outbox retries, FR-SUB-2).
  const existing = await findByClientId(db, clientId);
  if (existing) {
    if (existing.install_hash !== app.installHash) throw conflict();
    return created(existing, 200);
  }

  const now = ctx.deps.now();
  await enforceLimit(db, LIMITS.submissionsPerInstall, app.installHash, now);
  await enforceLimit(db, LIMITS.submissionsPerIp, await ipHash(ctx), now);

  const ts = now.toISOString();
  const result = await db
    .prepare(
      `INSERT INTO submissions (id, client_id, install_hash, description, link, seen_in, status,
         public_note, app_version, platform, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'received', NULL, ?, ?, ?, ?)
       ON CONFLICT (client_id) DO NOTHING`,
    )
    .bind(
      crypto.randomUUID(),
      clientId,
      app.installHash,
      body.description,
      body.link ?? null,
      body.seenIn ? body.seenIn : null,
      app.appVersion,
      app.platform,
      ts,
      ts,
    )
    .run();

  const row = await findByClientId(db, clientId);
  if (!row) throw new Error("submission row missing after insert");
  if (row.install_hash !== app.installHash) throw conflict();
  return created(row, result.meta.changes > 0 ? 201 : 200);
}

/** GET /v1/submissions — only the calling install's items, newest first (FR-SUB-6). */
export async function listOwnSubmissions(ctx: Ctx): Promise<Response> {
  const app = await readAppHeaders(ctx);
  const { results } = await ctx.env.DB.prepare(
    `SELECT id, client_id, status, public_note, created_at, updated_at
     FROM submissions WHERE install_hash = ?
     ORDER BY created_at DESC, id DESC LIMIT 100`,
  )
    .bind(app.installHash)
    .all<{
      id: string;
      client_id: string;
      status: SubmissionStatus;
      public_note: string | null;
      created_at: string;
      updated_at: string;
    }>();
  const body: SubmissionListResponse = {
    items: results.map((r) => ({
      id: r.id,
      clientId: r.client_id,
      status: r.status,
      publicNote: r.public_note,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })),
  };
  return json(200, body);
}
