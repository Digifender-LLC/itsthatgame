import { postJson } from "./api";
import { config } from "./config";
import { byId, setError, setStatus } from "./form";
import { buildUnsubscribePayload } from "./lib";
import { mountTurnstile, type Challenge } from "./turnstile";

const form = byId<HTMLFormElement>("unsubscribe-form");
const emailInput = byId<HTMLInputElement>("email");
const submit = byId<HTMLButtonElement>("submit");
let challenge: Challenge | null = null;
let token: string | null = null;

mountTurnstile(byId("turnstile-widget"), config.turnstileSiteKey, (t) => {
  token = t;
  if (t) setError("turnstile", null, []);
})
  .then((c) => (challenge = c))
  .catch(() => setStatus("Couldn't load the human check. Please try again later."));

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  setError("email", null, [emailInput]);
  setError("turnstile", null, []);
  setStatus("");
  const built = buildUnsubscribePayload({ email: emailInput.value, turnstileToken: token });
  if (!built.ok) {
    if (built.fields.email) setError("email", built.fields.email, [emailInput]);
    if (built.fields.turnstileToken) setError("turnstile", built.fields.turnstileToken, []);
    if (built.fields.email) emailInput.focus();
    return;
  }
  submit.disabled = true;
  const outcome = await postJson(`${config.apiBase}/v1/waitlist/unsubscribe`, built.data);
  submit.disabled = false;
  if (outcome.kind === "ok") {
    form.hidden = true;
    const done = byId("success");
    done.hidden = false;
    byId("success-title").focus();
    return;
  }
  challenge?.reset();
  if (outcome.kind === "bot") setStatus("Couldn't verify you're human, please try again.");
  else if (outcome.kind === "validation")
    setError("email", "Enter a valid email address.", [emailInput]);
  else setStatus("Please try again later.");
});
