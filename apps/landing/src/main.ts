import { postJson } from "./api";
import { config } from "./config";
import { byId, setError, setStatus } from "./form";
import { buildSignupPayload, friendlyFields, parseAttribution } from "./lib";
import { mountTurnstile, type Challenge } from "./turnstile";

const form = byId<HTMLFormElement>("signup-form");
const emailInput = byId<HTMLInputElement>("email");
const consentInput = byId<HTMLInputElement>("consent");
const radios = Array.from(form.querySelectorAll<HTMLInputElement>('input[name="pricePreference"]'));
const fieldset = byId("price-fieldset");
const submit = byId<HTMLButtonElement>("submit");

const attribution = parseAttribution(location.search, document.referrer, location.hostname);
let challenge: Challenge | null = null;
let token: string | null = null;

mountTurnstile(byId("turnstile-widget"), config.turnstileSiteKey, (t) => {
  token = t;
  if (t) setError("turnstile", null, []);
})
  .then((c) => (challenge = c))
  .catch(() => setStatus("Couldn't load the human check. Please try again later."));

function clearErrors(): void {
  setError("email", null, [emailInput]);
  setError("price", null, [fieldset]);
  setError("consent", null, [consentInput]);
  setError("turnstile", null, []);
  setStatus("");
}

function showFields(fields: Record<string, string>): boolean {
  let shown = false;
  if (fields.email) {
    setError("email", fields.email, [emailInput]);
    shown = true;
  }
  if (fields.pricePreference) {
    setError("price", fields.pricePreference, [fieldset]);
    shown = true;
  }
  if (fields.consent) {
    setError("consent", fields.consent, [consentInput]);
    shown = true;
  }
  if (fields.turnstileToken) {
    setError("turnstile", fields.turnstileToken, []);
    shown = true;
  }
  return shown;
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  clearErrors();
  const built = buildSignupPayload({
    email: emailInput.value,
    pricePreference: radios.find((r) => r.checked)?.value ?? null,
    consent: consentInput.checked,
    turnstileToken: token,
    attribution,
    consentNoticeVersion: config.consentNoticeVersion,
  });
  if (!built.ok) {
    showFields(built.fields);
    form.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
    return;
  }

  submit.disabled = true;
  submit.textContent = "Sending…";
  const outcome = await postJson(`${config.apiBase}/v1/waitlist`, built.data);
  submit.disabled = false;
  submit.textContent = "Join the waitlist";

  if (outcome.kind === "ok") {
    form.hidden = true;
    const done = byId("success");
    done.hidden = false;
    byId("success-title").focus();
    return;
  }
  challenge?.reset();
  if (outcome.kind === "validation") {
    if (!showFields(friendlyFields(outcome.fields)))
      setStatus("Please check your details and try again.");
    else setStatus("Please fix the highlighted fields.");
    form.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  } else if (outcome.kind === "bot") {
    setStatus("Couldn't verify you're human, please try again.");
  } else {
    setStatus("Please try again later.");
  }
});
