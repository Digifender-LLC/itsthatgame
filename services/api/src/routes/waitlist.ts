import {
  normalizeEmail,
  waitlistSignupRequest,
  waitlistUnsubscribeRequest,
  type OkResponse,
} from "@itg/contracts";
import { clientIp, ipHash, type Ctx } from "../context";
import { ApiError } from "../errors";
import { BODY_LIMITS, json, parseWith, readJson } from "../http";
import { enforceLimit, LIMITS } from "../ratelimit";

const OK: OkResponse = { status: "ok" };

async function checkBot(ctx: Ctx, token: string): Promise<void> {
  if (!(await ctx.deps.verifyTurnstile(token, clientIp(ctx.req)))) {
    throw new ApiError("bot_check_failed", "Bot check failed; please try again");
  }
}

const orNull = (v: string | undefined) => (v ? v : null);

/** POST /v1/waitlist (IF-1, FR-WL-2..4, RULE-6). */
export async function signup(ctx: Ctx): Promise<Response> {
  const body = parseWith(waitlistSignupRequest, await readJson(ctx.req, BODY_LIMITS.waitlist));
  await checkBot(ctx, body.turnstileToken);
  await enforceLimit(ctx.env.DB, LIMITS.waitlistPerIp, await ipHash(ctx), ctx.deps.now());

  const now = ctx.deps.now().toISOString();
  const a = body.attribution;
  // Repeat signups update only the price preference and updated_at; the first
  // attribution and consent record are kept (FR-WL-3).
  await ctx.env.DB.prepare(
    `INSERT INTO waitlist_entries (id, email_normalized, price_preference, consent_at,
       consent_notice_version, utm_source, utm_medium, utm_campaign, utm_content, referrer_host,
       created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (email_normalized) DO UPDATE SET
       price_preference = excluded.price_preference,
       updated_at = excluded.updated_at`,
  )
    .bind(
      crypto.randomUUID(),
      normalizeEmail(body.email),
      body.pricePreference,
      now,
      body.consentNoticeVersion,
      orNull(a.utmSource),
      orNull(a.utmMedium),
      orNull(a.utmCampaign),
      orNull(a.utmContent),
      orNull(a.referrerHost),
      now,
      now,
    )
    .run();
  return json(200, OK);
}

/** POST /v1/waitlist/unsubscribe (FR-WL-6). Always 200 so membership is not disclosed. */
export async function unsubscribe(ctx: Ctx): Promise<Response> {
  const body = parseWith(waitlistUnsubscribeRequest, await readJson(ctx.req, BODY_LIMITS.waitlist));
  await checkBot(ctx, body.turnstileToken);
  await enforceLimit(ctx.env.DB, LIMITS.waitlistPerIp, await ipHash(ctx), ctx.deps.now());
  await ctx.env.DB.prepare("DELETE FROM waitlist_entries WHERE email_normalized = ?")
    .bind(normalizeEmail(body.email))
    .run();
  return json(200, OK);
}
