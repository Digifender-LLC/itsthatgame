import type { ErrorCode, SubmissionStatus } from "@itg/contracts";

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  validation_failed: 400,
  bot_check_failed: 403,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  rate_limited: 429,
  internal: 500,
};

/** Thrown by handlers; the router turns it into the LLD §8 error envelope. */
export class ApiError extends Error {
  readonly status: number;
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly options: {
      fields?: Record<string, string>;
      retryAfter?: number;
      currentStatus?: SubmissionStatus;
    } = {},
  ) {
    super(message);
    this.status = STATUS_BY_CODE[code];
  }
}
