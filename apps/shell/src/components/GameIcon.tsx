// Shell-drawn game icons (catalog `icon: "drawn:<key>"`): original vector art, no files.
import { PALETTE as P } from "@itg/game-sdk";
import type { JSX } from "preact";

const DRAWINGS: Record<string, JSX.Element> = {
  "ring-sort": (
    <g>
      <rect x="14" y="16" width="4" height="36" rx="2" fill={P.ink} />
      <rect x="30" y="16" width="4" height="36" rx="2" fill={P.ink} />
      <rect x="46" y="16" width="4" height="36" rx="2" fill={P.ink} />
      <rect x="8" y="42" width="16" height="7" rx="3.5" fill={P.orange} />
      <rect x="8" y="34" width="16" height="7" rx="3.5" fill={P.sky} />
      <rect x="24" y="42" width="16" height="7" rx="3.5" fill={P.sky} />
      <rect x="40" y="42" width="16" height="7" rx="3.5" fill={P.orange} />
      <rect x="40" y="34" width="16" height="7" rx="3.5" fill={P.green} />
    </g>
  ),
  "pin-drop": (
    <g>
      <path d="M10 14h44v10H38v24H26V24H10z" fill={P.sky} />
      <rect x="22" y="24" width="20" height="4" fill={P.ink} />
      <circle cx="26" cy="44" r="5" fill={P.yellow} />
      <circle cx="36" cy="46" r="5" fill={P.orange} />
      <circle cx="31" cy="38" r="5" fill={P.yellow} />
    </g>
  ),
  "tile-trio": (
    <g>
      <rect x="8" y="10" width="20" height="20" rx="4" fill={P.green} />
      <rect
        x="22"
        y="22"
        width="20"
        height="20"
        rx="4"
        fill={P.paper}
        stroke={P.ink}
        stroke-width="2"
      />
      <rect x="36" y="34" width="20" height="20" rx="4" fill={P.purple} />
      <circle cx="32" cy="32" r="4" fill={P.vermillion} />
    </g>
  ),
  "stack-up": (
    <g>
      <rect x="18" y="46" width="28" height="8" rx="2" fill={P.blue} />
      <rect x="21" y="37" width="24" height="8" rx="2" fill={P.sky} />
      <rect x="23" y="28" width="20" height="8" rx="2" fill={P.green} />
      <rect x="27" y="14" width="16" height="8" rx="2" fill={P.yellow} />
    </g>
  ),
  "park-out": (
    <g>
      <rect x="8" y="8" width="48" height="48" rx="6" fill="none" stroke={P.ink} stroke-width="3" />
      <rect x="14" y="14" width="10" height="22" rx="3" fill={P.vermillion} />
      <rect x="28" y="30" width="22" height="10" rx="3" fill={P.blue} />
      <path d="M56 26v12" stroke={P.paper} stroke-width="4" />
    </g>
  ),
  "merge-drop": (
    <g>
      <circle cx="22" cy="42" r="10" fill={P.orange} />
      <circle cx="42" cy="42" r="10" fill={P.orange} />
      <circle cx="32" cy="20" r="12" fill={P.vermillion} />
      <path d="M32 34v6" stroke={P.ink} stroke-width="3" stroke-linecap="round" />
    </g>
  ),
  "paint-path": (
    <g>
      <path
        d="M12 52V12h20v20h20v20"
        fill="none"
        stroke={P.purple}
        stroke-width="8"
        stroke-linejoin="round"
      />
      <circle cx="52" cy="52" r="5" fill={P.ink} />
    </g>
  ),
  untangle: (
    <g stroke={P.ink} stroke-width="3">
      <line x1="14" y1="16" x2="50" y2="48" />
      <line x1="50" y1="16" x2="14" y2="48" />
      <line x1="14" y1="16" x2="50" y2="16" />
      <circle cx="14" cy="16" r="6" fill={P.sky} />
      <circle cx="50" cy="16" r="6" fill={P.green} />
      <circle cx="14" cy="48" r="6" fill={P.yellow} />
      <circle cx="50" cy="48" r="6" fill={P.orange} />
    </g>
  ),
};

/** Decorative: the game title next to it carries the accessible name. */
export function GameIcon({ icon }: { icon: string }) {
  const key = icon.startsWith("drawn:") ? icon.slice("drawn:".length) : null;
  if (key === null) return <img class="game-icon" src={icon} alt="" />;
  return (
    <svg class="game-icon" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <rect width="64" height="64" rx="14" fill={P.paper} />
      {DRAWINGS[key] ?? <circle cx="32" cy="32" r="14" fill={P.muted} />}
    </svg>
  );
}

export function LockIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">
      <rect x="3" y="7" width="10" height="8" rx="1.5" fill="currentColor" />
      <path d="M5 7V5a3 3 0 0 1 6 0v2" fill="none" stroke="currentColor" stroke-width="1.8" />
    </svg>
  );
}
