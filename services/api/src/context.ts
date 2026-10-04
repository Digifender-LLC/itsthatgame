import { installId as installIdSchema, platform as platformSchema } from "@itg/contracts";
import type { Deps } from "./deps";
import type { Env } from "./env";
import { ApiError } from "./errors";
import { hmacHex } from "./crypto";

export interface Ctx {
  req: Request;
  env: Env;
  deps: Deps;
  url: URL;
  requestId: string;
  params: Record<string, string>;
}

export function clientIp(req: Request): string | null {
  return req.headers.get("CF-Connecting-IP");
}

/** HMAC of the caller IP; "unknown" groups callers without the header (local dev only). */
export function ipHash(ctx: Ctx): Promise<string> {
  return hmacHex(ctx.env.HASH_PEPPER, clientIp(ctx.req) ?? "unknown");
}

const APP_VERSION_RE = /^[0-9A-Za-z.+_-]{1,32}$/;

export interface AppHeaders {
  installHash: string;
  appVersion: string | null;
  platform: string | null;
}

/** Validates the IF-2/IF-3 app headers and hashes the install ID (never stored raw). */
export async function readAppHeaders(ctx: Ctx): Promise<AppHeaders> {
  const fields: Record<string, string> = {};
  const rawInstall = ctx.req.headers.get("X-Install-Id");
  if (!rawInstall) fields["X-Install-Id"] = "required";
  else if (!installIdSchema.safeParse(rawInstall).success) fields["X-Install-Id"] = "invalid";

  const appVersion = ctx.req.headers.get("X-App-Version");
  if (appVersion !== null && !APP_VERSION_RE.test(appVersion)) fields["X-App-Version"] = "invalid";

  const platform = ctx.req.headers.get("X-Platform");
  if (platform !== null && !platformSchema.safeParse(platform).success) {
    fields["X-Platform"] = "invalid";
  }

  if (Object.keys(fields).length > 0 || !rawInstall) {
    throw new ApiError("validation_failed", "Invalid app headers", { fields });
  }
  return {
    installHash: await hmacHex(ctx.env.HASH_PEPPER, rawInstall.toLowerCase()),
    appVersion,
    platform,
  };
}
