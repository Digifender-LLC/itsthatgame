import { env } from "cloudflare:workers";
import { vi } from "vitest";
import { createDeps, type Deps, type Jwk } from "../src/deps";
import type { Env } from "../src/env";
import { bytesToBase64Url, stringToBase64Url } from "../src/crypto";
import { handleRequest } from "../src/router";

export const BASE = "https://api.test";
export const TEAM_DOMAIN = env.ACCESS_TEAM_DOMAIN;
export const OPERATOR = env.OPERATOR_EMAILS.split(",")[0]!.trim();

export async function resetDb(): Promise<void> {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM waitlist_entries"),
    env.DB.prepare("DELETE FROM rate_limits"),
    env.DB.prepare("DELETE FROM submissions"),
  ]);
}

export interface FakeNetwork {
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  turnstileCalls: { secret: string; response: string; remoteip: string | null }[];
  jwksCalls: number;
  jwks: Jwk[];
}

/** In-test stand-in for Turnstile siteverify and the Access JWKS endpoint. */
export function fakeNetwork(): FakeNetwork {
  const net: FakeNetwork = {
    turnstileCalls: [],
    jwksCalls: 0,
    jwks: [],
    fetch: async (input, init) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url === "https://challenges.cloudflare.com/turnstile/v0/siteverify") {
        const form = init?.body as FormData;
        const call = {
          secret: String(form.get("secret")),
          response: String(form.get("response")),
          remoteip: form.get("remoteip") as string | null,
        };
        net.turnstileCalls.push(call);
        return Response.json({ success: call.response === "pass" });
      }
      if (url === `https://${TEAM_DOMAIN}/cdn-cgi/access/certs`) {
        net.jwksCalls++;
        return Response.json({ keys: net.jwks });
      }
      throw new Error(`unexpected fetch ${url}`);
    },
  };
  return net;
}

export interface FakeEvents {
  binding: AnalyticsEngineDataset;
  writeDataPoint: ReturnType<typeof vi.fn>;
}

export function fakeEvents(): FakeEvents {
  const writeDataPoint = vi.fn();
  return { binding: { writeDataPoint }, writeDataPoint };
}

export interface Harness {
  net: FakeNetwork;
  events: FakeEvents;
  env: Env;
  deps: Deps;
  call: (path: string, init?: RequestInit & { ip?: string }) => Promise<Response>;
}

export function harness(opts: { now?: () => Date; envOverrides?: Partial<Env> } = {}): Harness {
  const net = fakeNetwork();
  const events = fakeEvents();
  const testEnv: Env = { ...env, EVENTS: events.binding, ...opts.envOverrides };
  const deps = createDeps(testEnv, {
    fetch: net.fetch,
    overrides: opts.now ? { now: opts.now } : {},
  });
  return {
    net,
    events,
    env: testEnv,
    deps,
    call: (path, init = {}) => {
      const { ip = "203.0.113.7", ...rest } = init;
      const headers = new Headers(rest.headers);
      if (ip) headers.set("CF-Connecting-IP", ip);
      return handleRequest(new Request(`${BASE}${path}`, { ...rest, headers }), testEnv, deps);
    },
  };
}

export function jsonInit(method: string, body: unknown, headers: HeadersInit = {}): RequestInit {
  return {
    method,
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json", ...headers },
  };
}

// ---- Access JWT helpers -----------------------------------------------------

export interface Signer {
  jwk: Jwk;
  sign: (claims: Record<string, unknown>, header?: Record<string, unknown>) => Promise<string>;
}

export async function makeSigner(kid = "test-kid"): Promise<Signer> {
  const pair = (await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  )) as CryptoKeyPair;
  const pub = (await crypto.subtle.exportKey("jwk", pair.publicKey)) as JsonWebKey;
  const jwk: Jwk = { kid, kty: "RSA", alg: "RS256", n: pub.n, e: pub.e };
  return {
    jwk,
    sign: async (claims, header = {}) => {
      const h = stringToBase64Url(JSON.stringify({ alg: "RS256", kid, typ: "JWT", ...header }));
      const p = stringToBase64Url(JSON.stringify(claims));
      const sig = await crypto.subtle.sign(
        "RSASSA-PKCS1-v1_5",
        pair.privateKey,
        new TextEncoder().encode(`${h}.${p}`),
      );
      return `${h}.${p}.${bytesToBase64Url(new Uint8Array(sig))}`;
    },
  };
}

export function validClaims(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const now = Math.floor(Date.now() / 1000);
  return {
    iss: `https://${TEAM_DOMAIN}`,
    aud: [env.ACCESS_AUD],
    email: OPERATOR,
    iat: now,
    exp: now + 600,
    ...overrides,
  };
}
