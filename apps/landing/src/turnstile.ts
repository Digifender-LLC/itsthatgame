const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

interface TurnstileApi {
  render(
    el: HTMLElement,
    opts: {
      sitekey: string;
      callback: (token: string) => void;
      "expired-callback"?: () => void;
      "error-callback"?: () => void;
    },
  ): string;
  reset(id?: string): void;
  remove(id?: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let loading: Promise<TurnstileApi> | undefined;

function load(): Promise<TurnstileApi> {
  if (typeof window.turnstile?.render === "function") return Promise.resolve(window.turnstile);
  loading ??= new Promise<TurnstileApi>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SCRIPT_SRC;
    s.async = true;
    s.onload = () =>
      typeof window.turnstile?.render === "function"
        ? resolve(window.turnstile)
        : reject(new Error("no api"));
    s.onerror = () => {
      loading = undefined;
      reject(new Error("load failed"));
    };
    document.head.appendChild(s);
  });
  return loading;
}

export interface Challenge {
  token(): string | null;
  reset(): void;
}

/** Render the Cloudflare Turnstile widget (the only third-party script on the site). */
export async function mountTurnstile(
  container: HTMLElement,
  siteKey: string,
  onChange: (token: string | null) => void,
): Promise<Challenge> {
  const api = await load();
  let token: string | null = null;
  const set = (t: string | null) => {
    token = t;
    onChange(t);
  };
  const id = api.render(container, {
    sitekey: siteKey,
    callback: (t) => set(t),
    "expired-callback": () => set(null),
    "error-callback": () => set(null),
  });
  return {
    token: () => token,
    reset() {
      set(null);
      api.reset(id);
    },
  };
}
