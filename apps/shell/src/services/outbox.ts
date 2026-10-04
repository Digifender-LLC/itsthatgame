// Outbox service (SDD §5, LLD §8): durable, idempotent delivery of player submissions.
// State machine (FRD §4): queued → sending → sent | queued (retry) | failed.
import type {
  SubmissionCreateRequest,
  SubmissionCreateResponse,
  SubmissionListResponse,
  SubmissionStatus,
} from "@itg/contracts";
import type { KeyValueBackend } from "@itg/game-sdk";
import { appHeaders, errorMessage, retryAfterMs, type AppIdentity, type FetchLike } from "./api";
import { getJson, setJson } from "./prefs";

export type OutboxState = "queued" | "sending" | "sent" | "failed";
export type FailureKind = "network" | "server" | "rate_limited";

export interface OutboxItem {
  clientId: string;
  kind: "submission";
  payload: SubmissionCreateRequest;
  attempts: number;
  nextAttemptAt: number;
  state: OutboxState;
  createdAt: number;
  lastError?: FailureKind;
  /** Server or local message shown to the player. */
  message?: string;
  serverId?: string;
  status?: SubmissionStatus;
  publicNote?: string | null;
}

export const BASE_BACKOFF_MS = 30_000;
export const MAX_BACKOFF_MS = 6 * 60 * 60 * 1000;
export const GIVE_UP_MS = 14 * 24 * 60 * 60 * 1000; // [Proposal] LLD §8
export const RATE_LIMITED_MESSAGE = "You've sent a lot of requests today, try tomorrow.";
const STORE_KEY = "outbox:items";

export interface OutboxDeps {
  kv: KeyValueBackend;
  fetch: FetchLike;
  now: () => number;
  apiBase: string;
  identity: AppIdentity;
  newId?: () => string;
  onSent?: (item: OutboxItem) => void;
}

export function backoffMs(attempts: number): number {
  return Math.min(BASE_BACKOFF_MS * 2 ** Math.max(0, attempts - 1), MAX_BACKOFF_MS);
}

export class Outbox {
  private list: OutboxItem[] = [];
  private listeners = new Set<() => void>();
  private running: Promise<void> | null = null;
  private rerun = false;

  constructor(private deps: OutboxDeps) {}

  /** Loads persisted items; an item interrupted mid-send goes back to `queued`. */
  async load(): Promise<void> {
    const stored = (await getJson<OutboxItem[]>(this.deps.kv, STORE_KEY)) ?? [];
    this.list = stored.map((i) => (i.state === "sending" ? { ...i, state: "queued" } : i));
    this.emit();
  }

  get items(): readonly OutboxItem[] {
    return this.list;
  }

  subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  /** WF-5 step 2: store locally first with a client-generated ID. */
  async enqueue(payload: SubmissionCreateRequest): Promise<OutboxItem> {
    const now = this.deps.now();
    const item: OutboxItem = {
      clientId: (this.deps.newId ?? (() => crypto.randomUUID()))(),
      kind: "submission",
      payload,
      attempts: 0,
      nextAttemptAt: now,
      state: "queued",
      createdAt: now,
    };
    this.list = [item, ...this.list];
    await this.persist();
    return item;
  }

  /**
   * Delivers every due item. Only one loop runs at a time; a call made while it runs
   * schedules one more pass. `networkBack` makes items that failed on a network error
   * due immediately (connectivity changed); server-requested waits are still honored.
   */
  flush(opts: { networkBack?: boolean } = {}): Promise<void> {
    if (opts.networkBack) {
      const now = this.deps.now();
      this.list = this.list.map((i) =>
        i.state === "queued" && i.lastError === "network" ? { ...i, nextAttemptAt: now } : i,
      );
    }
    if (this.running) {
      this.rerun = true;
      return this.running;
    }
    this.running = (async () => {
      try {
        do {
          this.rerun = false;
          await this.pass();
        } while (this.rerun);
      } finally {
        this.running = null;
      }
    })();
    return this.running;
  }

  private async pass(): Promise<void> {
    for (const item of [...this.list]) {
      const now = this.deps.now();
      if (item.state !== "queued") continue;
      if (now - item.createdAt >= GIVE_UP_MS) {
        await this.update(item.clientId, { state: "failed", message: "Couldn't send" });
        continue;
      }
      if (item.nextAttemptAt > now) continue;
      await this.deliver(item);
    }
  }

  private async deliver(item: OutboxItem): Promise<void> {
    const attempts = item.attempts + 1;
    await this.update(item.clientId, { state: "sending", attempts });
    let res: Response;
    try {
      res = await this.deps.fetch(`${this.deps.apiBase}/v1/submissions`, {
        method: "POST",
        headers: { ...appHeaders(this.deps.identity), "Idempotency-Key": item.clientId },
        body: JSON.stringify(item.payload),
      });
    } catch {
      await this.retry(item.clientId, attempts, "network", null);
      return;
    }
    const now = this.deps.now();
    if (res.ok) {
      let body: Partial<SubmissionCreateResponse> = {};
      try {
        body = (await res.json()) as SubmissionCreateResponse;
      } catch {
        // tolerate an empty body; status refresh fills it in
      }
      const sent = await this.update(item.clientId, {
        state: "sent",
        serverId: body.id,
        status: body.status ?? "received",
        message: undefined,
        lastError: undefined,
      });
      if (sent) this.deps.onSent?.(sent);
    } else if (res.status === 429) {
      await this.retry(item.clientId, attempts, "rate_limited", retryAfterMs(res, now));
    } else if (res.status >= 500) {
      await this.retry(item.clientId, attempts, "server", retryAfterMs(res, now));
    } else {
      // 400, 409 and other 4xx are permanent (LLD §8, FRD §4).
      await this.update(item.clientId, { state: "failed", message: await errorMessage(res) });
    }
  }

  private async retry(
    clientId: string,
    attempts: number,
    kind: FailureKind,
    retryAfter: number | null,
  ): Promise<void> {
    const now = this.deps.now();
    const item = this.list.find((i) => i.clientId === clientId);
    if (item && now - item.createdAt >= GIVE_UP_MS) {
      await this.update(clientId, { state: "failed", message: "Couldn't send" });
      return;
    }
    const wait = Math.max(backoffMs(attempts), retryAfter ?? 0);
    await this.update(clientId, {
      state: "queued",
      lastError: kind,
      nextAttemptAt: now + wait,
      message: kind === "rate_limited" ? RATE_LIMITED_MESSAGE : undefined,
    });
  }

  /** Removes a failed item after the player has seen it (WF-5 permanent rejection). */
  async dismiss(clientId: string): Promise<void> {
    this.list = this.list.filter((i) => i.clientId !== clientId);
    await this.persist();
  }

  /** GET /v1/submissions: refreshes server status and public notes (FR-SUB-6). */
  async refreshStatuses(): Promise<boolean> {
    let res: Response;
    try {
      res = await this.deps.fetch(`${this.deps.apiBase}/v1/submissions`, {
        method: "GET",
        headers: appHeaders(this.deps.identity),
      });
    } catch {
      return false;
    }
    if (!res.ok) return false;
    let body: SubmissionListResponse;
    try {
      body = (await res.json()) as SubmissionListResponse;
    } catch {
      return false;
    }
    const byClient = new Map(body.items.map((s) => [s.clientId, s]));
    this.list = this.list.map((i) => {
      const s = byClient.get(i.clientId);
      if (!s) return i;
      byClient.delete(i.clientId);
      return {
        ...i,
        state: "sent",
        serverId: s.id,
        status: s.status,
        publicNote: s.publicNote,
        message: undefined,
      };
    });
    // Server knows items this device lost (e.g. storage cleared): show them without text.
    for (const s of byClient.values()) {
      this.list.push({
        clientId: s.clientId,
        kind: "submission",
        payload: { description: "" },
        attempts: 1,
        nextAttemptAt: 0,
        state: "sent",
        createdAt: Date.parse(s.createdAt) || 0,
        serverId: s.id,
        status: s.status,
        publicNote: s.publicNote,
      });
    }
    await this.persist();
    return true;
  }

  private async update(clientId: string, patch: Partial<OutboxItem>): Promise<OutboxItem | null> {
    let updated: OutboxItem | null = null;
    this.list = this.list.map((i) => {
      if (i.clientId !== clientId) return i;
      updated = { ...i, ...patch };
      return updated;
    });
    await this.persist();
    return updated;
  }

  private async persist(): Promise<void> {
    await setJson(this.deps.kv, STORE_KEY, this.list);
    this.emit();
  }

  private emit(): void {
    for (const cb of this.listeners) cb();
  }
}
