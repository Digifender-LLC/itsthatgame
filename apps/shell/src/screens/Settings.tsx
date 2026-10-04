import { useState } from "preact/hooks";
import { Screen } from "../components/Screen";
import { APP_VERSION, PRIVACY_URL, SUPPORT_URL } from "../config";
import type { RestoreOutcome } from "../services/entitlement";
import type { Settings as SettingsValues } from "../services/prefs";

export interface SettingsProps {
  settings: SettingsValues;
  entitled: boolean;
  onChange(next: SettingsValues): void;
  onUnlock(): void;
  onRestore(): Promise<RestoreOutcome>;
  onMyRequests(): void;
  onBack(): void;
}

const TOGGLES: { key: keyof SettingsValues; label: string; hint?: string }[] = [
  { key: "sound", label: "Sound effects" },
  { key: "music", label: "Music" },
  { key: "haptics", label: "Haptics", hint: "Vibration on supported phones" },
  {
    key: "analytics",
    label: "Share anonymous usage stats",
    hint: "Counts like “a game was started”. No ads, no tracking, no personal data.",
  },
];

export function Settings(props: SettingsProps) {
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const restore = async () => {
    setBusy(true);
    setMessage(null);
    const r = await props.onRestore();
    setBusy(false);
    setMessage(
      r.kind === "restored"
        ? "Purchases restored. All games are unlocked."
        : r.kind === "none"
          ? "No purchases found for this store account."
          : r.message,
    );
  };

  return (
    <Screen title="Settings" onBack={props.onBack} backLabel="Library">
      <fieldset class="group">
        <legend>Preferences</legend>
        {TOGGLES.map((t) => (
          <label class="toggle" key={t.key}>
            <span>
              <span class="toggle-label">{t.label}</span>
              {t.hint && <span class="hint">{t.hint}</span>}
            </span>
            <input
              type="checkbox"
              role="switch"
              name={t.key}
              checked={props.settings[t.key]}
              onChange={(e) =>
                props.onChange({ ...props.settings, [t.key]: e.currentTarget.checked })
              }
            />
          </label>
        ))}
      </fieldset>

      <section class="group" aria-labelledby="purchases-h">
        <h2 id="purchases-h">Purchases</h2>
        {props.entitled ? (
          <p>All games are unlocked. Thank you!</p>
        ) : (
          <button type="button" class="btn primary" onClick={props.onUnlock}>
            Unlock all games
          </button>
        )}
        <button type="button" class="btn" disabled={busy} onClick={() => void restore()}>
          Restore purchases
        </button>
        {message && (
          <p class="notice" role="status">
            {message}
          </p>
        )}
      </section>

      <section class="group" aria-labelledby="ideas-h">
        <h2 id="ideas-h">Game ideas</h2>
        <button type="button" class="btn" onClick={props.onMyRequests}>
          My requests
        </button>
      </section>

      <section class="group" aria-labelledby="about-h">
        <h2 id="about-h">About</h2>
        <p>
          <a href={PRIVACY_URL} target="_blank" rel="noopener">
            Privacy policy
          </a>{" "}
          ·{" "}
          <a href={SUPPORT_URL} target="_blank" rel="noopener">
            Support
          </a>
        </p>
        <p class="fine">Version {APP_VERSION}</p>
      </section>
    </Screen>
  );
}
