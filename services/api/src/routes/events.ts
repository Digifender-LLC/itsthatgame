import { analyticsBatchRequest, isAllowedEvent } from "@itg/contracts";
import { readAppHeaders, type Ctx } from "../context";
import { BODY_LIMITS, json, parseWith, readJson } from "../http";
import { enforceLimit, LIMITS } from "../ratelimit";

export interface EventsAcceptedResponse {
  accepted: number;
  dropped: number;
}

/**
 * POST /v1/events (IF-3, FR-AN-1). The install ID is used for rate limiting only and is
 * never written to Analytics Engine; unknown event names are dropped and counted.
 */
export async function ingestEvents(ctx: Ctx): Promise<Response> {
  const app = await readAppHeaders(ctx);
  const body = parseWith(analyticsBatchRequest, await readJson(ctx.req, BODY_LIMITS.events));
  await enforceLimit(ctx.env.DB, LIMITS.eventsPerInstall, app.installHash, ctx.deps.now());

  let accepted = 0;
  let dropped = 0;
  for (const event of body.events) {
    if (!isAllowedEvent(event.name)) {
      dropped++;
      continue;
    }
    ctx.env.EVENTS.writeDataPoint({
      blobs: [event.name, event.gameSlug ?? "", app.platform ?? "", app.appVersion ?? ""],
      doubles: [1],
      indexes: [event.name],
    });
    accepted++;
  }
  const res: EventsAcceptedResponse = { accepted, dropped };
  return json(202, res);
}
