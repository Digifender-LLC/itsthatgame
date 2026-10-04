import { memoryBackend } from "@itg/game-sdk";
import { describe, expect, it } from "vitest";
import {
  BASE_BACKOFF_MS,
  GIVE_UP_MS,
  MAX_BACKOFF_MS,
  Outbox,
  RATE_LIMITED_MESSAGE,
  backoffMs,
} from "./outbox";

const T0 = Date.UTC(2026, 9, 4);
const identity = {
  installId: "11111111-1111-4111-8111-111111111111",
  appVersion: "1.0.0",
  platform: "ios" as const,
};
const payload = { description: "Drop colored rings onto pegs to sort them" };

type Responder = (url: string, init: RequestInit) => Response | Promise<Response>;

function json(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

function setup(responder: Responder) {
  const clock = { now: T0 };
  const kv = memoryBackend();
  const calls: { url: string; init: RequestInit }[] = [];
  let ids = 0;
  const sent: string[] = [];
  const make = () =>
    new Outbox({
      kv,
      now: () => clock.now,
      apiBase: "https://api.test",
      identity,
      newId: () => `00000000-0000-4000-8000-00000000000${++ids}`,
      fetch: async (url, init = {}) => {
        calls.push({ url, init });
        return responder(url, init);
      },
      onSent: (i) => sent.push(i.clientId),
    });
  return { clock, kv, calls, sent, make, outbox: make() };
}

const created = () =>
  json(201, { id: "srv-1", status: "received", createdAt: "2026-10-04T00:00:00Z" });
const offline: Responder = () => {
  throw new TypeError("Failed to fetch");
};

describe("backoff", () => {
  it("starts at 30 s, doubles, and caps at 6 h", () => {
    expect(backoffMs(1)).toBe(BASE_BACKOFF_MS);
    expect(backoffMs(2)).toBe(60_000);
    expect(backoffMs(3)).toBe(120_000);
    expect(backoffMs(30)).toBe(MAX_BACKOFF_MS);
  });
});

describe("Outbox", () => {
  it("sends with app headers and the client ID as Idempotency-Key", async () => {
    const { outbox, calls, sent } = setup(created);
    const item = await outbox.enqueue(payload);
    await outbox.flush();
    expect(calls).toHaveLength(1);
    const call = calls[0]!;
    expect(call.url).toBe("https://api.test/v1/submissions");
    expect(call.init.method).toBe("POST");
    expect(call.init.headers).toMatchObject({
      "X-Install-Id": identity.installId,
      "X-App-Version": "1.0.0",
      "X-Platform": "ios",
      "Idempotency-Key": item.clientId,
    });
    expect(JSON.parse(call.init.body as string)).toEqual(payload);
    expect(outbox.items[0]).toMatchObject({
      state: "sent",
      serverId: "srv-1",
      status: "received",
      attempts: 1,
    });
    expect(sent).toEqual([item.clientId]);
  });

  it("queues offline with backoff and retries with the same client ID (FR-SUB-2)", async () => {
    let online = false;
    const { outbox, calls, clock } = setup((u, i) => (online ? created() : offline(u, i)));
    await outbox.enqueue(payload);
    await outbox.flush();
    expect(outbox.items[0]).toMatchObject({
      state: "queued",
      attempts: 1,
      lastError: "network",
      nextAttemptAt: T0 + 30_000,
    });

    await outbox.flush(); // not due yet
    expect(calls).toHaveLength(1);

    clock.now = T0 + 30_000;
    await outbox.flush();
    expect(outbox.items[0]).toMatchObject({ attempts: 2, nextAttemptAt: T0 + 30_000 + 60_000 });

    online = true;
    clock.now = T0 + 90_000;
    await outbox.flush();
    expect(outbox.items[0]!.state).toBe("sent");
    const keys = calls.map((c) => (c.init.headers as Record<string, string>)["Idempotency-Key"]);
    expect(new Set(keys).size).toBe(1);
  });

  it("network-online makes network failures due immediately", async () => {
    let online = false;
    const { outbox } = setup((u, i) => (online ? created() : offline(u, i)));
    await outbox.enqueue(payload);
    await outbox.flush();
    online = true;
    await outbox.flush({ networkBack: true });
    expect(outbox.items[0]!.state).toBe("sent");
  });

  it("honors Retry-After on 429 and shows the rate-limit message; online events don't skip it", async () => {
    let status = 429;
    const { outbox, clock } = setup(() =>
      status === 429
        ? json(
            429,
            { error: { code: "rate_limited", message: "slow down" } },
            { "Retry-After": "3600" },
          )
        : created(),
    );
    await outbox.enqueue(payload);
    await outbox.flush();
    expect(outbox.items[0]).toMatchObject({
      state: "queued",
      lastError: "rate_limited",
      nextAttemptAt: T0 + 3_600_000,
      message: RATE_LIMITED_MESSAGE,
    });
    status = 201;
    await outbox.flush({ networkBack: true });
    expect(outbox.items[0]!.state).toBe("queued");
    clock.now = T0 + 3_600_000;
    await outbox.flush();
    expect(outbox.items[0]!.state).toBe("sent");
  });

  it("retries 5xx with backoff", async () => {
    const { outbox } = setup(() => json(503, {}));
    await outbox.enqueue(payload);
    await outbox.flush();
    expect(outbox.items[0]).toMatchObject({
      state: "queued",
      lastError: "server",
      nextAttemptAt: T0 + 30_000,
    });
  });

  it.each([400, 409])("fails immediately on %i with the server message", async (status) => {
    const { outbox, calls, clock } = setup(() =>
      json(status, {
        error: { code: "validation_failed", message: "Description is too short", requestId: "r" },
      }),
    );
    await outbox.enqueue(payload);
    await outbox.flush();
    expect(outbox.items[0]).toMatchObject({ state: "failed", message: "Description is too short" });
    clock.now += MAX_BACKOFF_MS;
    await outbox.flush();
    expect(calls).toHaveLength(1);
  });

  it("gives up after 14 days and shows Couldn't send", async () => {
    const { outbox, clock, calls } = setup(offline);
    await outbox.enqueue(payload);
    await outbox.flush();
    clock.now = T0 + GIVE_UP_MS;
    await outbox.flush();
    expect(outbox.items[0]).toMatchObject({ state: "failed", message: "Couldn't send" });
    expect(calls).toHaveLength(1);
  });

  it("runs a single delivery loop at a time (never sends an item concurrently)", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const { outbox, calls } = setup(async () => {
      await gate;
      return created();
    });
    await outbox.enqueue(payload);
    const a = outbox.flush();
    const b = outbox.flush();
    const c = outbox.flush({ networkBack: true });
    release();
    await Promise.all([a, b, c]);
    expect(calls).toHaveLength(1);
    expect(outbox.items[0]!.state).toBe("sent");
  });

  it("persists items; an interrupted send is re-queued on load", async () => {
    const { outbox, make, kv } = setup(offline);
    await outbox.enqueue(payload);
    const raw = JSON.parse((await kv.get("outbox:items"))!);
    raw[0].state = "sending";
    await kv.set("outbox:items", JSON.stringify(raw));
    const reloaded = make();
    await reloaded.load();
    expect(reloaded.items).toHaveLength(1);
    expect(reloaded.items[0]!.state).toBe("queued");
  });

  it("refreshes statuses and public notes from GET /v1/submissions (FR-SUB-6)", async () => {
    const { outbox, calls } = setup((url, init) => {
      if (init.method === "GET") {
        return json(200, {
          items: [
            {
              id: "srv-1",
              clientId: "00000000-0000-4000-8000-000000000001",
              status: "planned",
              publicNote: "Coming in 1.2",
              createdAt: "2026-10-04T00:00:00Z",
              updatedAt: "2026-10-05T00:00:00Z",
            },
            {
              id: "srv-9",
              clientId: "99999999-0000-4000-8000-000000000009",
              status: "declined",
              publicNote: null,
              createdAt: "2026-09-01T00:00:00Z",
              updatedAt: "2026-09-02T00:00:00Z",
            },
          ],
        });
      }
      return created();
    });
    await outbox.enqueue(payload);
    await outbox.flush();
    expect(await outbox.refreshStatuses()).toBe(true);
    expect(calls.at(-1)!.init.headers).toMatchObject({ "X-Install-Id": identity.installId });
    expect(outbox.items[0]).toMatchObject({ status: "planned", publicNote: "Coming in 1.2" });
    expect(outbox.items[1]).toMatchObject({ serverId: "srv-9", status: "declined", state: "sent" });
  });

  it("status refresh failures are harmless", async () => {
    const { outbox } = setup(offline);
    expect(await outbox.refreshStatuses()).toBe(false);
  });

  it("dismiss removes a failed item", async () => {
    const { outbox } = setup(() => json(400, {}));
    const item = await outbox.enqueue(payload);
    await outbox.flush();
    await outbox.dismiss(item.clientId);
    expect(outbox.items).toHaveLength(0);
  });
});
