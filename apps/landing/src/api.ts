export type Outcome =
  | { kind: "ok" }
  | { kind: "validation"; fields: Record<string, string> }
  | { kind: "bot" }
  | { kind: "later" };

/** POST JSON and map the LLD §2 status codes to a small outcome type. Never throws. */
export async function postJson(
  url: string,
  body: unknown,
  fetchImpl: typeof fetch = fetch,
): Promise<Outcome> {
  try {
    const res = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      credentials: "omit",
    });
    if (res.status === 200) return { kind: "ok" };
    if (res.status === 403) return { kind: "bot" };
    if (res.status === 400) {
      let fields: Record<string, string> = {};
      try {
        const json = (await res.json()) as { error?: { fields?: Record<string, string> } };
        fields = json.error?.fields ?? {};
      } catch {
        /* no body */
      }
      return { kind: "validation", fields };
    }
    return { kind: "later" };
  } catch {
    return { kind: "later" };
  }
}
