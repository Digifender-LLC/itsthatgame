import type { Env } from "./env";

const TURNSTILE_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const JWKS_TTL_MS = 10 * 60 * 1000;

/** RSA public key from a Cloudflare Access JWKS. */
export interface Jwk {
  kid?: string;
  kty: string;
  n?: string;
  e?: string;
  alg?: string;
}

/**
 * External effects the handlers depend on. Production builds them from `env` and the
 * global `fetch`; tests override them so no request leaves the test runtime.
 */
export interface Deps {
  now: () => Date;
  /** Cloudflare Turnstile siteverify. Resolves `false` when the token is rejected. */
  verifyTurnstile: (token: string, remoteIp: string | null) => Promise<boolean>;
  /** Access team JWKS; `forceRefresh` bypasses the cache (key rotation). */
  getJwks: (forceRefresh?: boolean) => Promise<Jwk[]>;
}

type FetchFn = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
type JwksCacheEntry = { keys: Jwk[]; expires: number };

// Shared across requests in one isolate when the global fetch is used.
const defaultJwksCache = new Map<string, JwksCacheEntry>();

export function createDeps(
  env: Env,
  options: { fetch?: FetchFn; overrides?: Partial<Deps> } = {},
): Deps {
  const fetchFn: FetchFn = options.fetch ?? ((input, init) => fetch(input, init));
  const jwksCache = options.fetch ? new Map<string, JwksCacheEntry>() : defaultJwksCache;
  const now = options.overrides?.now ?? (() => new Date());

  const verifyTurnstile: Deps["verifyTurnstile"] = async (token, remoteIp) => {
    if (!env.TURNSTILE_SECRET) throw new Error("TURNSTILE_SECRET is not configured");
    const form = new FormData();
    form.append("secret", env.TURNSTILE_SECRET);
    form.append("response", token);
    if (remoteIp) form.append("remoteip", remoteIp);
    const res = await fetchFn(TURNSTILE_URL, { method: "POST", body: form });
    if (!res.ok) throw new Error(`Turnstile siteverify returned ${res.status}`);
    const body = (await res.json()) as { success?: unknown };
    return body.success === true;
  };

  const getJwks: Deps["getJwks"] = async (forceRefresh = false) => {
    if (!env.ACCESS_TEAM_DOMAIN) throw new Error("ACCESS_TEAM_DOMAIN is not configured");
    const url = `https://${env.ACCESS_TEAM_DOMAIN}/cdn-cgi/access/certs`;
    const cached = jwksCache.get(url);
    if (!forceRefresh && cached && cached.expires > now().getTime()) return cached.keys;
    const res = await fetchFn(url);
    if (!res.ok) throw new Error(`JWKS fetch returned ${res.status}`);
    const body = (await res.json()) as { keys?: Jwk[] };
    const keys = Array.isArray(body.keys) ? body.keys : [];
    jwksCache.set(url, { keys, expires: now().getTime() + JWKS_TTL_MS });
    return keys;
  };

  return { now, verifyTurnstile, getJwks, ...options.overrides };
}
