import { requireOperator } from "./auth";
import type { Ctx } from "./context";
import type { Deps } from "./deps";
import { splitList, type Env } from "./env";
import { ApiError } from "./errors";
import { errorResponse, SECURITY_HEADERS } from "./http";
import * as admin from "./routes/admin";
import { ingestEvents } from "./routes/events";
import { createSubmission, listOwnSubmissions } from "./routes/submissions";
import { signup, unsubscribe } from "./routes/waitlist";

/** Which CORS policy a route uses (SEC-6). */
type CorsPolicy = "landing" | "app" | "none";

interface Route {
  method: string;
  pattern: RegExp;
  name: string;
  cors: CorsPolicy;
  admin?: boolean;
  handler: (ctx: Ctx) => Promise<Response>;
}

const UUID = "([0-9a-fA-F-]{36})";

const ROUTES: Route[] = [
  {
    method: "POST",
    pattern: /^\/v1\/waitlist$/,
    name: "waitlist.signup",
    cors: "landing",
    handler: signup,
  },
  {
    method: "POST",
    pattern: /^\/v1\/waitlist\/unsubscribe$/,
    name: "waitlist.unsubscribe",
    cors: "landing",
    handler: unsubscribe,
  },
  {
    method: "POST",
    pattern: /^\/v1\/submissions$/,
    name: "submissions.create",
    cors: "app",
    handler: createSubmission,
  },
  {
    method: "GET",
    pattern: /^\/v1\/submissions$/,
    name: "submissions.list",
    cors: "app",
    handler: listOwnSubmissions,
  },
  {
    method: "POST",
    pattern: /^\/v1\/events$/,
    name: "events.ingest",
    cors: "app",
    handler: ingestEvents,
  },
  {
    method: "GET",
    pattern: /^\/admin\/v1\/waitlist\/stats$/,
    name: "admin.waitlist.stats",
    cors: "none",
    admin: true,
    handler: admin.waitlistStats,
  },
  {
    method: "GET",
    pattern: /^\/admin\/v1\/waitlist\/export\.csv$/,
    name: "admin.waitlist.export",
    cors: "none",
    admin: true,
    handler: admin.waitlistExport,
  },
  {
    method: "GET",
    pattern: /^\/admin\/v1\/submissions$/,
    name: "admin.submissions.list",
    cors: "none",
    admin: true,
    handler: admin.listSubmissions,
  },
  {
    method: "PATCH",
    pattern: new RegExp(`^/admin/v1/submissions/${UUID}$`),
    name: "admin.submissions.patch",
    cors: "none",
    admin: true,
    handler: admin.patchSubmission,
  },
  {
    method: "DELETE",
    pattern: new RegExp(`^/admin/v1/submissions/${UUID}$`),
    name: "admin.submissions.delete",
    cors: "none",
    admin: true,
    handler: admin.deleteSubmission,
  },
];

const CORS_CONFIG: Record<Exclude<CorsPolicy, "none">, { methods: string; headers: string }> = {
  landing: { methods: "POST, OPTIONS", headers: "Content-Type" },
  app: {
    methods: "GET, POST, OPTIONS",
    headers: "Content-Type, X-Install-Id, X-App-Version, X-Platform, Idempotency-Key",
  },
};

function allowedOrigins(env: Env, policy: CorsPolicy): string[] {
  if (policy === "landing") return splitList(env.ALLOWED_ORIGIN);
  if (policy === "app") return splitList(env.APP_ORIGINS);
  return [];
}

function corsHeaders(req: Request, env: Env, policy: CorsPolicy, preflight: boolean): Headers {
  const h = new Headers();
  if (policy === "none") return h;
  h.set("Vary", "Origin");
  const origin = req.headers.get("Origin");
  if (!origin || !allowedOrigins(env, policy).includes(origin)) return h;
  h.set("Access-Control-Allow-Origin", origin);
  h.set("Access-Control-Expose-Headers", "Retry-After, X-Request-Id");
  if (preflight) {
    h.set("Access-Control-Allow-Methods", CORS_CONFIG[policy].methods);
    h.set("Access-Control-Allow-Headers", CORS_CONFIG[policy].headers);
    h.set("Access-Control-Max-Age", "86400");
  }
  return h;
}

function finalize(res: Response, extra: Headers, requestId: string): Response {
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) {
    if (!out.headers.has(k)) out.headers.set(k, v);
  }
  extra.forEach((v, k) => out.headers.set(k, v));
  out.headers.set("X-Request-Id", requestId);
  return out;
}

/** Handles one HTTP request: routing, CORS, admin auth, error envelope, request log. */
export async function handleRequest(req: Request, env: Env, deps: Deps): Promise<Response> {
  const started = Date.now();
  const requestId = crypto.randomUUID();
  const url = new URL(req.url);
  const candidates = ROUTES.filter((r) => r.pattern.test(url.pathname));
  const route = candidates.find((r) => r.method === req.method);
  const policy: CorsPolicy = (route ?? candidates[0])?.cors ?? "none";
  const routeName =
    req.method === "OPTIONS" && candidates[0]
      ? `${candidates[0].name}.preflight`
      : (route?.name ?? "not_found");

  let res: Response;
  let extra = new Headers();
  try {
    if (req.method === "OPTIONS" && candidates.length > 0 && policy !== "none") {
      extra = corsHeaders(req, env, policy, true);
      res = new Response(null, { status: 204 });
    } else {
      extra = corsHeaders(req, env, policy, false);
      // Admin auth runs before route matching so unknown /admin paths reveal nothing.
      if (url.pathname.startsWith("/admin/")) await requireOperator(req, env, deps);
      if (!route) throw new ApiError("not_found", "Not found");
      const params: Record<string, string> = {};
      const match = route.pattern.exec(url.pathname);
      if (match?.[1]) params.id = match[1].toLowerCase();
      res = await route.handler({ req, env, deps, url, requestId, params });
    }
  } catch (err) {
    if (err instanceof ApiError) {
      res = errorResponse(err, requestId);
    } else {
      // Never log request bodies or emails; error name/message only.
      const e = err instanceof Error ? err : new Error(String(err));
      console.error(
        JSON.stringify({ requestId, route: routeName, error: e.name, message: e.message }),
      );
      res = errorResponse(new ApiError("internal", "Internal error"), requestId);
    }
  }
  const out = finalize(res, extra, requestId);
  console.log(
    JSON.stringify({
      requestId,
      method: req.method,
      route: routeName,
      status: out.status,
      ms: Date.now() - started,
    }),
  );
  return out;
}
