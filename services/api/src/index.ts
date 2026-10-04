import { createDeps } from "./deps";
import type { Env } from "./env";
import { handleRequest } from "./router";
import { runScheduledCleanup } from "./scheduled";

export type { Env } from "./env";

export default {
  fetch(req, env) {
    return handleRequest(req, env, createDeps(env));
  },
  scheduled(controller, env, ctx) {
    ctx.waitUntil(runScheduledCleanup(env, new Date(controller.scheduledTime)));
  },
} satisfies ExportedHandler<Env>;
