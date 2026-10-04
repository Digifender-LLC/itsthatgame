import { fieldErrors, type ErrorEnvelope } from "@itg/contracts";
import type { z } from "zod";
import { ApiError } from "./errors";

/** Body size limits (HLD §5). */
export const BODY_LIMITS = {
  waitlist: 4 * 1024,
  default: 8 * 1024,
  events: 32 * 1024,
} as const;

/** Headers sent on every response (SEC-6). */
export const SECURITY_HEADERS: Record<string, string> = {
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Cache-Control": "no-store",
};

export function json(status: number, body: unknown, headers: HeadersInit = {}): Response {
  const h = new Headers(headers);
  h.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(body), { status, headers: h });
}

export function errorResponse(err: ApiError, requestId: string): Response {
  const envelope: ErrorEnvelope = {
    error: { code: err.code, message: err.message, requestId },
  };
  if (err.options.fields) envelope.error.fields = err.options.fields;
  if (err.options.currentStatus) envelope.error.currentStatus = err.options.currentStatus;
  const headers: Record<string, string> = {};
  if (err.options.retryAfter !== undefined) headers["Retry-After"] = String(err.options.retryAfter);
  return json(err.status, envelope, headers);
}

const tooLarge = () =>
  new ApiError("validation_failed", "Request body too large", { fields: { _: "too_large" } });

/** Reads and parses a JSON body, refusing anything over `limit` bytes without buffering it. */
export async function readJson(req: Request, limit: number): Promise<unknown> {
  const declared = req.headers.get("Content-Length");
  if (declared !== null && Number(declared) > limit) throw tooLarge();
  if (!req.body) throw new ApiError("validation_failed", "Request body is required");
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      throw tooLarge();
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    bytes.set(c, offset);
    offset += c.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch {
    throw new ApiError("validation_failed", "Request body is not valid JSON");
  }
}

/** Validates `input` against a contracts schema, throwing a 400 envelope with field errors. */
export function parseWith<S extends z.ZodType>(schema: S, input: unknown): z.infer<S> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new ApiError("validation_failed", "Request validation failed", {
      fields: fieldErrors(result.error),
    });
  }
  return result.data as z.infer<S>;
}
