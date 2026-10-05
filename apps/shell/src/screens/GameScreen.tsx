import type { GameFactory } from "@itg/game-sdk";
import type { MutableRef } from "preact/hooks";
import { useEffect, useRef } from "preact/hooks";
import type { CatalogGame } from "../catalog";
import { GameHost, type HostDeps } from "../host/gameHost";

export interface GameScreenProps {
  game: CatalogGame;
  load: () => Promise<{ default: GameFactory }>;
  deps: HostDeps;
  onExit(): void;
  onFailure(error: unknown): void;
  /** Receives the exit action so the Android back button can leave the game. */
  backRef?: MutableRef<(() => void) | null>;
}

/**
 * Full-screen game host (FR-APP-2). Games draw their own back button in their HUD and the
 * Android back button exits too, so the shell's Exit button only appears on keyboard focus
 * (it stays first in the focus order for keyboard and screen-reader users).
 */
export function GameScreen({ game, load, deps, onExit, onFailure, backRef }: GameScreenProps) {
  const container = useRef<HTMLDivElement>(null);
  const host = useRef<GameHost | null>(null);
  const exitButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const h = new GameHost(game.slug, deps, { onExit, onFailure });
    host.current = h;
    if (backRef) backRef.current = () => h.exit();
    exitButton.current?.focus({ preventScroll: true });
    if (container.current) void h.launch(container.current, load);
    return () => {
      if (backRef) backRef.current = null;
      h.dispose();
    };
    // A new host only for a new game; callbacks are stable for the screen's lifetime.
  }, [game.slug]);

  return (
    <main class="game-screen" aria-label={game.title}>
      <div class="game-container" ref={container} />
      <button
        type="button"
        class="btn exit focus-reveal"
        ref={exitButton}
        aria-label={`Exit ${game.title}`}
        onClick={() => host.current?.exit()}
      >
        <span aria-hidden="true">✕</span> Exit
      </button>
    </main>
  );
}

export function GameError(props: { title: string; onBack(): void }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  return (
    <main class="screen center" role="alert">
      <h1 tabIndex={-1} ref={heading}>
        This game hit a problem
      </h1>
      <p>{props.title} stopped unexpectedly. Your other games are fine.</p>
      <button type="button" class="btn primary" onClick={props.onBack}>
        Back to library
      </button>
    </main>
  );
}
