import {
  fieldErrors,
  waitlistSignupRequest,
  waitlistUnsubscribeRequest,
  type Attribution,
  type WaitlistSignupRequest,
  type WaitlistUnsubscribeRequest,
} from "@itg/contracts";

const MAX_ATTR = 100;

function clean(value: string | null | undefined): string | undefined {
  const v = (value ?? "").trim().slice(0, MAX_ATTR);
  return v === "" ? undefined : v;
}

/**
 * First-party attribution only (FR-WL-4): the four utm_* params and the referrer's host.
 * Empty values are omitted; a same-site referrer is ignored.
 */
export function parseAttribution(search: string, referrer: string, ownHost = ""): Attribution {
  const params = new URLSearchParams(search);
  let referrerHost: string | undefined;
  if (referrer) {
    try {
      const host = new URL(referrer).hostname;
      if (host && host !== ownHost) referrerHost = clean(host);
    } catch {
      /* ignore malformed referrer */
    }
  }
  const out: Attribution = {};
  const utmSource = clean(params.get("utm_source"));
  const utmMedium = clean(params.get("utm_medium"));
  const utmCampaign = clean(params.get("utm_campaign"));
  const utmContent = clean(params.get("utm_content"));
  if (utmSource) out.utmSource = utmSource;
  if (utmMedium) out.utmMedium = utmMedium;
  if (utmCampaign) out.utmCampaign = utmCampaign;
  if (utmContent) out.utmContent = utmContent;
  if (referrerHost) out.referrerHost = referrerHost;
  return out;
}

export const FIELD_MESSAGES: Record<string, string> = {
  email: "Enter a valid email address.",
  pricePreference: "Choose one of the options.",
  consent: "Please tick the box to agree to be emailed.",
  turnstileToken: "Please complete the human check.",
};

/** Replace schema messages with plain-language ones for fields we know about. */
export function friendlyFields(fields: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(fields)) out[k] = FIELD_MESSAGES[k] ?? v;
  return out;
}

export type Built<T> = { ok: true; data: T } | { ok: false; fields: Record<string, string> };

export interface SignupInput {
  email: string;
  pricePreference: string | null;
  consent: boolean;
  turnstileToken: string | null;
  attribution: Attribution;
  consentNoticeVersion: string;
}

export function buildSignupPayload(input: SignupInput): Built<WaitlistSignupRequest> {
  const parsed = waitlistSignupRequest.safeParse({
    email: input.email,
    pricePreference: input.pricePreference ?? undefined,
    consent: input.consent,
    consentNoticeVersion: input.consentNoticeVersion,
    attribution: input.attribution,
    turnstileToken: input.turnstileToken || undefined,
  });
  if (parsed.success) return { ok: true, data: parsed.data };
  return { ok: false, fields: friendlyFields(fieldErrors(parsed.error)) };
}

export function buildUnsubscribePayload(input: {
  email: string;
  turnstileToken: string | null;
}): Built<WaitlistUnsubscribeRequest> {
  const parsed = waitlistUnsubscribeRequest.safeParse({
    email: input.email,
    turnstileToken: input.turnstileToken || undefined,
  });
  if (parsed.success) return { ok: true, data: parsed.data };
  return { ok: false, fields: friendlyFields(fieldErrors(parsed.error)) };
}
