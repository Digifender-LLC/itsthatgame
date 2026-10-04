// Shared request/response schemas for IF-1, IF-2, IF-3 and IF-6 (docs/design/LLD.md).
// Client and Worker both validate with these so RULE-* limits are enforced identically.
import { z } from "zod";

// ---- Common -----------------------------------------------------------------

export const ERROR_CODES = [
  "validation_failed",
  "bot_check_failed",
  "unauthorized",
  "forbidden",
  "not_found",
  "conflict",
  "rate_limited",
  "internal",
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ErrorEnvelope {
  error: {
    code: ErrorCode;
    message: string;
    fields?: Record<string, string>;
    /** Only on 409 from PATCH /admin/v1/submissions/:id (LLD §6): the row's actual status. */
    currentStatus?: SubmissionStatus;
    requestId: string;
  };
}

const uuid = z.string().uuid();
const optionalShortText = (max: number) => z.string().trim().max(max).optional();

// ---- Waitlist (IF-1, RULE-6) ------------------------------------------------

export const PRICE_PREFERENCES = [
  "monthly_299",
  "monthly_499",
  "lifetime_1999",
  "free_only",
] as const;
export type PricePreference = (typeof PRICE_PREFERENCES)[number];

// Pragmatic RFC 5322 subset: one @, no spaces, a dot in the domain.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export const email = z
  .string()
  .trim()
  .max(254)
  .refine((v) => EMAIL_RE.test(v), "invalid");

export const attribution = z
  .object({
    utmSource: optionalShortText(100),
    utmMedium: optionalShortText(100),
    utmCampaign: optionalShortText(100),
    utmContent: optionalShortText(100),
    referrerHost: optionalShortText(100),
  })
  .default({});
export type Attribution = z.infer<typeof attribution>;

export const waitlistSignupRequest = z.object({
  email,
  pricePreference: z.enum(PRICE_PREFERENCES),
  consent: z.literal(true, { error: "required" }),
  consentNoticeVersion: z.string().trim().min(1).max(20),
  attribution,
  turnstileToken: z.string().min(1).max(2048),
});
export type WaitlistSignupRequest = z.infer<typeof waitlistSignupRequest>;

export const waitlistUnsubscribeRequest = z.object({
  email,
  turnstileToken: z.string().min(1).max(2048),
});
export type WaitlistUnsubscribeRequest = z.infer<typeof waitlistUnsubscribeRequest>;

export interface OkResponse {
  status: "ok";
}

// ---- Submissions (IF-2, RULE-7) ---------------------------------------------

export const SUBMISSION_STATUSES = [
  "received",
  "reviewing",
  "planned",
  "declined",
  "shipped",
] as const;
export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];

/** RULE-10 / LLD §6 transition table. */
export const SUBMISSION_TRANSITIONS: Record<SubmissionStatus, readonly SubmissionStatus[]> = {
  received: ["reviewing", "declined"],
  reviewing: ["planned", "declined"],
  planned: ["shipped", "declined"],
  declined: ["reviewing"],
  shipped: [],
};

export function canTransition(from: SubmissionStatus, to: SubmissionStatus): boolean {
  return SUBMISSION_TRANSITIONS[from].includes(to);
}

export const submissionLink = z
  .string()
  .trim()
  .max(500)
  .refine((v) => {
    try {
      const u = new URL(v);
      return u.protocol === "http:" || u.protocol === "https:";
    } catch {
      return false;
    }
  }, "must be an http or https URL");

export const submissionCreateRequest = z.object({
  description: z.string().trim().min(10).max(1000),
  link: submissionLink.optional(),
  seenIn: optionalShortText(100),
});
export type SubmissionCreateRequest = z.infer<typeof submissionCreateRequest>;

export const installId = uuid;
export const idempotencyKey = uuid;
export const platform = z.enum(["ios", "android", "web"]);
export type Platform = z.infer<typeof platform>;

export interface SubmissionSummary {
  id: string;
  clientId: string;
  status: SubmissionStatus;
  publicNote: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SubmissionCreateResponse {
  id: string;
  status: SubmissionStatus;
  createdAt: string;
}

export interface SubmissionListResponse {
  items: SubmissionSummary[];
}

// ---- Analytics (IF-3, FR-AN-1) ----------------------------------------------

export const ANALYTICS_EVENTS = [
  "app_open",
  "game_start",
  "game_complete_level",
  "game_exit",
  "game_error",
  "paywall_view",
  "purchase_success",
  "purchase_cancel",
  "restore_success",
  "submission_sent",
] as const;
export type AnalyticsEventName = (typeof ANALYTICS_EVENTS)[number];

export const gameSlug = z.string().regex(/^[a-z0-9-]{3,40}$/);

export const analyticsEvent = z.object({
  name: z.string().max(40),
  gameSlug: gameSlug.optional(),
  ts: z.number().int().nonnegative(),
});
export const analyticsBatchRequest = z.object({
  events: z.array(analyticsEvent).min(1).max(50),
});
export type AnalyticsEvent = z.infer<typeof analyticsEvent>;
export type AnalyticsBatchRequest = z.infer<typeof analyticsBatchRequest>;

export function isAllowedEvent(name: string): name is AnalyticsEventName {
  return (ANALYTICS_EVENTS as readonly string[]).includes(name);
}

// ---- Admin (IF-6) -----------------------------------------------------------

export const submissionPatchRequest = z.object({
  from: z.enum(SUBMISSION_STATUSES),
  to: z.enum(SUBMISSION_STATUSES),
  publicNote: z.string().trim().max(280).optional(),
});
export type SubmissionPatchRequest = z.infer<typeof submissionPatchRequest>;

export interface WaitlistStats {
  total: number;
  byDay: { day: string; count: number }[];
  bySource: { source: string; count: number }[];
  byPricePreference: { pricePreference: PricePreference; count: number }[];
}

export interface AdminSubmission extends SubmissionSummary {
  description: string;
  link: string | null;
  seenIn: string | null;
  appVersion: string | null;
  platform: string | null;
}

export interface AdminSubmissionListResponse {
  items: AdminSubmission[];
  nextCursor: string | null;
}

// ---- Helpers ----------------------------------------------------------------

/** Flatten zod issues into the error-envelope `fields` map. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}
