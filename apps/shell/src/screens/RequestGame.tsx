import { fieldErrors, submissionCreateRequest, type SubmissionCreateRequest } from "@itg/contracts";
import { useState } from "preact/hooks";
import { Screen } from "../components/Screen";

export interface RequestGameProps {
  onSubmit(payload: SubmissionCreateRequest): Promise<void>;
  onBack(): void;
}

/** WF-5 / RULE-7: describe a game seen in an ad. Validated with the shared schema. */
export function RequestGame({ onSubmit, onBack }: RequestGameProps) {
  const [description, setDescription] = useState("");
  const [link, setLink] = useState("");
  const [seenIn, setSeenIn] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const submit = async (e: Event) => {
    e.preventDefault();
    const raw: Record<string, string> = { description };
    if (link.trim()) raw.link = link;
    if (seenIn.trim()) raw.seenIn = seenIn;
    const parsed = submissionCreateRequest.safeParse(raw);
    if (!parsed.success) {
      const errs = fieldErrors(parsed.error);
      setErrors(errs);
      const first = Object.keys(errs)[0];
      if (first) document.getElementById(`req-${first}`)?.focus();
      return;
    }
    setErrors({});
    setBusy(true);
    await onSubmit(parsed.data);
    setBusy(false);
  };

  const field = (name: string) => ({
    id: `req-${name}`,
    "aria-invalid": errors[name] ? true : undefined,
    "aria-describedby": errors[name] ? `req-${name}-err` : `req-${name}-hint`,
  });
  const error = (name: string, text: string) =>
    errors[name] && (
      <p class="field-error" id={`req-${name}-err`}>
        <span aria-hidden="true">⚠ </span>
        {text}
      </p>
    );

  return (
    <Screen title="Request a game" onBack={onBack} backLabel="Library">
      <p>Seen a game in an ad that you wish existed? Tell us about it and we may build it.</p>
      <p class="notice">
        <strong>Please don't include personal information</strong> (names, emails, phone numbers) in
        your request.
      </p>
      <form onSubmit={(e) => void submit(e)} noValidate>
        <label for="req-description">What happens in the game? (required)</label>
        <textarea
          {...field("description")}
          rows={5}
          maxLength={1000}
          value={description}
          onInput={(e) => setDescription(e.currentTarget.value)}
        />
        <p class="hint" id="req-description-hint">
          10 to 1,000 characters. {description.trim().length}/1000
        </p>
        {error("description", "Please describe the game in 10 to 1,000 characters.")}

        <label for="req-link">Link to the ad (optional)</label>
        <input
          {...field("link")}
          type="url"
          inputMode="url"
          maxLength={500}
          value={link}
          onInput={(e) => setLink(e.currentTarget.value)}
        />
        <p class="hint" id="req-link-hint">
          An http or https link, up to 500 characters.
        </p>
        {error("link", "Please enter a link starting with http:// or https://.")}

        <label for="req-seenIn">Where did you see it? (optional)</label>
        <input
          {...field("seenIn")}
          type="text"
          maxLength={100}
          value={seenIn}
          onInput={(e) => setSeenIn(e.currentTarget.value)}
        />
        <p class="hint" id="req-seenIn-hint">
          For example, the app you were using. Up to 100 characters.
        </p>
        {error("seenIn", "Please keep this under 100 characters.")}

        <button type="submit" class="btn primary" disabled={busy}>
          Send request
        </button>
      </form>
    </Screen>
  );
}
