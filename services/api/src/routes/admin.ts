import {
  canTransition,
  SUBMISSION_STATUSES,
  submissionPatchRequest,
  type AdminSubmission,
  type AdminSubmissionListResponse,
  type PricePreference,
  type SubmissionStatus,
  type WaitlistStats,
} from "@itg/contracts";
import { z } from "zod";
import type { Ctx } from "../context";
import { base64UrlToString, stringToBase64Url } from "../crypto";
import { ApiError } from "../errors";
import { BODY_LIMITS, json, parseWith, readJson } from "../http";

const PAGE_SIZE = 50;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

// ---- Waitlist stats and export (FR-WL-5) ------------------------------------

function dayBound(value: string | null, field: string, addDays: number): string | null {
  if (value === null || value === "") return null;
  const d = DAY_RE.test(value) ? new Date(`${value}T00:00:00.000Z`) : new Date(NaN);
  if (Number.isNaN(d.getTime())) {
    throw new ApiError("validation_failed", "Dates must be YYYY-MM-DD", {
      fields: { [field]: "invalid" },
    });
  }
  d.setUTCDate(d.getUTCDate() + addDays);
  return d.toISOString();
}

/** GET /admin/v1/waitlist/stats?from=&to= (inclusive UTC days). */
export async function waitlistStats(ctx: Ctx): Promise<Response> {
  const from = dayBound(ctx.url.searchParams.get("from"), "from", 0) ?? "";
  const to = dayBound(ctx.url.searchParams.get("to"), "to", 1) ?? "9999";
  const where = "WHERE created_at >= ?1 AND created_at < ?2";
  const db = ctx.env.DB;
  const [total, byDay, bySource, byPrice] = await db.batch<Record<string, unknown>>([
    db.prepare(`SELECT COUNT(*) AS count FROM waitlist_entries ${where}`).bind(from, to),
    db
      .prepare(
        `SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS count FROM waitlist_entries ${where}
         GROUP BY day ORDER BY day`,
      )
      .bind(from, to),
    db
      .prepare(
        `SELECT COALESCE(NULLIF(utm_source, ''), '(none)') AS source, COUNT(*) AS count
         FROM waitlist_entries ${where} GROUP BY source ORDER BY count DESC, source`,
      )
      .bind(from, to),
    db
      .prepare(
        `SELECT price_preference, COUNT(*) AS count FROM waitlist_entries ${where}
         GROUP BY price_preference ORDER BY count DESC, price_preference`,
      )
      .bind(from, to),
  ]);
  const stats: WaitlistStats = {
    total: Number(total?.results[0]?.count ?? 0),
    byDay: (byDay?.results ?? []).map((r) => ({ day: String(r.day), count: Number(r.count) })),
    bySource: (bySource?.results ?? []).map((r) => ({
      source: String(r.source),
      count: Number(r.count),
    })),
    byPricePreference: (byPrice?.results ?? []).map((r) => ({
      pricePreference: r.price_preference as PricePreference,
      count: Number(r.count),
    })),
  };
  return json(200, stats);
}

const CSV_COLUMNS = [
  "id",
  "email_normalized",
  "price_preference",
  "consent_at",
  "consent_notice_version",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "referrer_host",
  "created_at",
  "updated_at",
] as const;

/**
 * Quotes a CSV cell (RFC 4180) and neutralises spreadsheet formula injection by
 * prefixing cells that start with = + - @ (or tab/CR) with a single quote.
 */
export function csvCell(value: unknown): string {
  let s = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

/** GET /admin/v1/waitlist/export.csv */
export async function waitlistExport(ctx: Ctx): Promise<Response> {
  const { results } = await ctx.env.DB.prepare(
    `SELECT ${CSV_COLUMNS.join(", ")} FROM waitlist_entries ORDER BY created_at, id`,
  ).all<Record<string, unknown>>();
  const lines = [CSV_COLUMNS.join(",")];
  for (const row of results) lines.push(CSV_COLUMNS.map((c) => csvCell(row[c])).join(","));
  return new Response(lines.join("\r\n") + "\r\n", {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="waitlist.csv"',
    },
  });
}

// ---- Submissions moderation (FR-SUB-4, FR-SUB-5, SEC-7) ---------------------

interface SubmissionRow {
  id: string;
  client_id: string;
  description: string;
  link: string | null;
  seen_in: string | null;
  status: SubmissionStatus;
  public_note: string | null;
  app_version: string | null;
  platform: string | null;
  created_at: string;
  updated_at: string;
}

const SUBMISSION_COLUMNS =
  "id, client_id, description, link, seen_in, status, public_note, app_version, platform, created_at, updated_at";

function toAdmin(r: SubmissionRow): AdminSubmission {
  return {
    id: r.id,
    clientId: r.client_id,
    status: r.status,
    publicNote: r.public_note,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    description: r.description,
    link: r.link,
    seenIn: r.seen_in,
    appVersion: r.app_version,
    platform: r.platform,
  };
}

const cursorSchema = z.tuple([z.string().min(1), z.string().min(1)]);

function encodeCursor(row: SubmissionRow): string {
  return stringToBase64Url(JSON.stringify([row.created_at, row.id]));
}

function decodeCursor(raw: string): [string, string] {
  try {
    return cursorSchema.parse(JSON.parse(base64UrlToString(raw)));
  } catch {
    throw new ApiError("validation_failed", "Invalid cursor", { fields: { cursor: "invalid" } });
  }
}

/** GET /admin/v1/submissions?status=&cursor= — newest first, keyset on (created_at, id). */
export async function listSubmissions(ctx: Ctx): Promise<Response> {
  const status = ctx.url.searchParams.get("status");
  const cursor = ctx.url.searchParams.get("cursor");
  const where: string[] = [];
  const binds: unknown[] = [];
  if (status) {
    if (!(SUBMISSION_STATUSES as readonly string[]).includes(status)) {
      throw new ApiError("validation_failed", "Unknown status", { fields: { status: "invalid" } });
    }
    where.push("status = ?");
    binds.push(status);
  }
  if (cursor) {
    const [createdAt, id] = decodeCursor(cursor);
    where.push("(created_at < ? OR (created_at = ? AND id < ?))");
    binds.push(createdAt, createdAt, id);
  }
  const sql = `SELECT ${SUBMISSION_COLUMNS} FROM submissions
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY created_at DESC, id DESC LIMIT ${PAGE_SIZE + 1}`;
  const { results } = await ctx.env.DB.prepare(sql)
    .bind(...binds)
    .all<SubmissionRow>();
  const page = results.slice(0, PAGE_SIZE);
  const last = page[page.length - 1];
  const body: AdminSubmissionListResponse = {
    items: page.map(toAdmin),
    nextCursor: results.length > PAGE_SIZE && last ? encodeCursor(last) : null,
  };
  return json(200, body);
}

async function getSubmission(db: D1Database, id: string): Promise<SubmissionRow | null> {
  return db
    .prepare(`SELECT ${SUBMISSION_COLUMNS} FROM submissions WHERE id = ?`)
    .bind(id)
    .first<SubmissionRow>();
}

const notFound = () => new ApiError("not_found", "Submission not found");

/** PATCH /admin/v1/submissions/:id — RULE-10 transition with optimistic concurrency (LLD §6). */
export async function patchSubmission(ctx: Ctx): Promise<Response> {
  const id = ctx.params.id ?? "";
  const body = parseWith(submissionPatchRequest, await readJson(ctx.req, BODY_LIMITS.default));
  if (!canTransition(body.from, body.to)) {
    throw new ApiError("validation_failed", `Transition ${body.from} → ${body.to} is not allowed`, {
      fields: { to: "transition_not_allowed" },
    });
  }
  const db = ctx.env.DB;
  // publicNote: omitted keeps the current note, "" clears it.
  const note = body.publicNote === undefined ? undefined : body.publicNote || null;
  const result = await db
    .prepare(
      `UPDATE submissions
       SET status = ?1, public_note = CASE WHEN ?2 THEN ?3 ELSE public_note END, updated_at = ?4
       WHERE id = ?5 AND status = ?6`,
    )
    .bind(
      body.to,
      note === undefined ? 0 : 1,
      note ?? null,
      ctx.deps.now().toISOString(),
      id,
      body.from,
    )
    .run();
  const row = await getSubmission(db, id);
  if (!row) throw notFound();
  if (result.meta.changes === 0) {
    throw new ApiError("conflict", `Submission status is ${row.status}, not ${body.from}`, {
      currentStatus: row.status,
    });
  }
  return json(200, toAdmin(row));
}

/** DELETE /admin/v1/submissions/:id — remove abusive or personal content (SEC-7). */
export async function deleteSubmission(ctx: Ctx): Promise<Response> {
  const result = await ctx.env.DB.prepare("DELETE FROM submissions WHERE id = ?")
    .bind(ctx.params.id ?? "")
    .run();
  if (result.meta.changes === 0) throw notFound();
  return new Response(null, { status: 204 });
}
