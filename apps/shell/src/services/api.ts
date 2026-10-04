// Shared HTTP transport details for app routes (LLD §3): app headers and error parsing.
import type { ErrorEnvelope, Platform } from "@itg/contracts";

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface AppIdentity {
  installId: string;
  appVersion: string;
  platform: Platform;
}

export function appHeaders(id: AppIdentity): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "X-Install-Id": id.installId,
    "X-App-Version": id.appVersion,
    "X-Platform": id.platform,
  };
}

/** Best-effort extraction of the LLD §8 error envelope message. */
export async function errorMessage(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as Partial<ErrorEnvelope>;
    if (body.error?.message) return body.error.message;
  } catch {
    // not JSON
  }
  return `Request failed (${res.status})`;
}

/** Retry-After in milliseconds (delta-seconds or HTTP date), or null. */
export function retryAfterMs(res: Response, now: number): number | null {
  const raw = res.headers.get("Retry-After");
  if (!raw) return null;
  const secs = Number(raw);
  if (Number.isFinite(secs)) return Math.max(0, secs * 1000);
  const at = Date.parse(raw);
  return Number.isNaN(at) ? null : Math.max(0, at - now);
}
