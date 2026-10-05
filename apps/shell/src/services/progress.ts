// One-line progress summaries for library tiles, read from each game's own saved
// `progress` value (the game kit's LevelProgress or RunProgress shape). Read-only: the
// shell never writes game data (FR-APP-4).
import type { KeyValueBackend } from "@itg/game-sdk";

export function summarizeProgress(raw: string | null): string | null {
  if (!raw) return null;
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof v !== "object" || v === null) return null;
  const o = v as Record<string, unknown>;
  if (typeof o.best === "number" && o.best > 0) return `Best ${Math.floor(o.best)}`;
  if (typeof o.bestLevel === "number" && o.bestLevel > 0) {
    const stars = Array.isArray(o.stars)
      ? o.stars.reduce<number>((n, s) => n + (typeof s === "number" ? s : 0), 0)
      : 0;
    const level = typeof o.currentLevel === "number" ? Math.floor(o.currentLevel) : null;
    return [level ? `Level ${level}` : null, stars ? `★ ${stars}` : null]
      .filter(Boolean)
      .join(" · ");
  }
  return null;
}

export async function loadProgressSummaries(
  kv: KeyValueBackend,
  slugs: readonly string[],
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  await Promise.all(
    slugs.map(async (slug) => {
      try {
        const s = summarizeProgress(await kv.get(`game:${slug}:progress`));
        if (s) out[slug] = s;
      } catch {
        // a missing or unreadable save just shows no progress line
      }
    }),
  );
  return out;
}
