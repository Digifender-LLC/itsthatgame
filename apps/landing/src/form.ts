/** Small DOM helpers shared by the signup and unsubscribe pages. */
export function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el as T;
}

/** Show or clear an inline error. `controls` get aria-invalid; the error id is already in their aria-describedby. */
export function setError(name: string, message: string | null, controls: HTMLElement[]): void {
  const el = byId(`${name}-error`);
  el.textContent = message ?? "";
  for (const c of controls) {
    if (message) c.setAttribute("aria-invalid", "true");
    else c.removeAttribute("aria-invalid");
  }
}

export function setStatus(message: string, kind: "error" | "info" = "error"): void {
  const el = byId("form-status");
  el.textContent = message;
  el.dataset.kind = kind;
}
