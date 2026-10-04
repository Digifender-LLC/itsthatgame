// Analytics client (FR-AN-1, FR-AN-2, RULE-11, LLD §3.3). Only allowed event names, no
// device identifiers, batches of up to 20 events or 60 s, no persistence: losing events
// is acceptable, and opting out discards the buffer immediately.
import { isAllowedEvent, type AnalyticsEvent, type AnalyticsEventName } from "@itg/contracts";
import { appHeaders, type AppIdentity, type FetchLike } from "./api";

export const BATCH_SIZE = 20;
export const BATCH_INTERVAL_MS = 60_000;

export interface Timers {
  setTimeout(cb: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface AnalyticsDeps {
  fetch: FetchLike;
  now: () => number;
  apiBase: string;
  identity: AppIdentity;
  enabled: boolean;
  timers?: Timers;
}

const realTimers: Timers = {
  setTimeout: (cb, ms) => setTimeout(cb, ms),
  clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

export class Analytics {
  private buffer: AnalyticsEvent[] = [];
  private timer: unknown = null;
  private enabled: boolean;
  private timers: Timers;

  constructor(private deps: AnalyticsDeps) {
    this.enabled = deps.enabled;
    this.timers = deps.timers ?? realTimers;
  }

  get pending(): readonly AnalyticsEvent[] {
    return this.buffer;
  }

  track(name: AnalyticsEventName, gameSlug?: string): void {
    if (!this.enabled || !isAllowedEvent(name)) return;
    const event: AnalyticsEvent = { name, ts: this.deps.now() };
    if (gameSlug) event.gameSlug = gameSlug;
    this.buffer.push(event);
    if (this.buffer.length >= BATCH_SIZE) void this.flush();
    else if (this.timer === null) {
      this.timer = this.timers.setTimeout(() => void this.flush(), BATCH_INTERVAL_MS);
    }
  }

  /** RULE-11: opting out stops sending and discards unsent events at once. */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.buffer = [];
      this.cancelTimer();
    }
  }

  async flush(): Promise<void> {
    this.cancelTimer();
    if (!this.enabled || this.buffer.length === 0) return;
    const events = this.buffer.splice(0, BATCH_SIZE);
    try {
      await this.deps.fetch(`${this.deps.apiBase}/v1/events`, {
        method: "POST",
        headers: appHeaders(this.deps.identity),
        body: JSON.stringify({ events }),
        keepalive: true,
      });
    } catch {
      // Dropped on purpose: analytics is best-effort and never persisted.
    }
    if (this.buffer.length > 0 && this.enabled && this.timer === null) {
      this.timer = this.timers.setTimeout(() => void this.flush(), BATCH_INTERVAL_MS);
    }
  }

  private cancelTimer(): void {
    if (this.timer !== null) this.timers.clearTimeout(this.timer);
    this.timer = null;
  }
}
