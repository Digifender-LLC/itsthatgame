import type { ComponentChildren } from "preact";
import { useEffect, useRef } from "preact/hooks";

/** Screen layout: moves focus to the heading on mount so screen readers announce it. */
export function Screen(props: {
  title: string;
  onBack?: () => void;
  backLabel?: string;
  actions?: ComponentChildren;
  children: ComponentChildren;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  return (
    <main class="screen">
      <header class="bar">
        {props.onBack && (
          <button type="button" class="btn ghost" onClick={props.onBack}>
            <span aria-hidden="true">‹ </span>
            {props.backLabel ?? "Back"}
          </button>
        )}
        <h1 tabIndex={-1} ref={heading}>
          {props.title}
        </h1>
        {props.actions && <div class="bar-actions">{props.actions}</div>}
      </header>
      {props.children}
    </main>
  );
}
