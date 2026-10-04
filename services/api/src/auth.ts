import type { Deps, Jwk } from "./deps";
import { splitList, type Env } from "./env";
import { ApiError } from "./errors";
import { base64UrlToBytes, base64UrlToString } from "./crypto";

const CLOCK_SKEW_S = 60;

interface AccessClaims {
  iss?: unknown;
  aud?: unknown;
  exp?: unknown;
  nbf?: unknown;
  email?: unknown;
}

const unauthorized = (message = "Missing or invalid Access token") =>
  new ApiError("unauthorized", message);

async function importRsaKey(jwk: Jwk): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "jwk",
    { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: "RS256", ext: true },
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
}

/**
 * Verifies the `Cf-Access-Jwt-Assertion` header (RS256 signature against the team JWKS,
 * issuer, audience, expiry) and that the identity is an operator (SEC-3, LLD §7).
 * Returns the operator email. 401 for a missing/invalid token, 403 for a non-operator.
 */
export async function requireOperator(req: Request, env: Env, deps: Deps): Promise<string> {
  if (!env.ACCESS_AUD || !env.ACCESS_TEAM_DOMAIN) {
    throw new Error("ACCESS_AUD / ACCESS_TEAM_DOMAIN not configured");
  }
  const token = req.headers.get("Cf-Access-Jwt-Assertion");
  if (!token) throw unauthorized();
  const parts = token.split(".");
  if (parts.length !== 3) throw unauthorized();
  const [rawHeader, rawPayload, rawSig] = parts as [string, string, string];

  let header: { alg?: unknown; kid?: unknown };
  let claims: AccessClaims;
  let signature: Uint8Array<ArrayBuffer>;
  try {
    header = JSON.parse(base64UrlToString(rawHeader)) as typeof header;
    claims = JSON.parse(base64UrlToString(rawPayload)) as AccessClaims;
    signature = base64UrlToBytes(rawSig);
  } catch {
    throw unauthorized();
  }
  if (header.alg !== "RS256" || typeof header.kid !== "string") throw unauthorized();

  let jwk = (await deps.getJwks()).find((k) => k.kid === header.kid);
  if (!jwk) jwk = (await deps.getJwks(true)).find((k) => k.kid === header.kid);
  if (!jwk || jwk.kty !== "RSA") throw unauthorized();

  let valid: boolean;
  try {
    valid = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      await importRsaKey(jwk),
      signature,
      new TextEncoder().encode(`${rawHeader}.${rawPayload}`),
    );
  } catch {
    valid = false;
  }
  if (!valid) throw unauthorized();

  const nowS = Math.floor(deps.now().getTime() / 1000);
  if (claims.iss !== `https://${env.ACCESS_TEAM_DOMAIN}`) throw unauthorized();
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audiences.includes(env.ACCESS_AUD)) throw unauthorized();
  if (typeof claims.exp !== "number" || claims.exp + CLOCK_SKEW_S < nowS) throw unauthorized();
  if (typeof claims.nbf === "number" && claims.nbf - CLOCK_SKEW_S > nowS) throw unauthorized();
  if (typeof claims.email !== "string" || !claims.email) throw unauthorized();

  const email = claims.email.toLowerCase();
  const operators = splitList(env.OPERATOR_EMAILS).map((e) => e.toLowerCase());
  if (!operators.includes(email)) throw new ApiError("forbidden", "Not an operator");
  return email;
}
