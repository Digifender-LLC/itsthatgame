import type { CatalogGame } from "../catalog";
import { GameIcon, LockIcon } from "../components/GameIcon";
import { Screen } from "../components/Screen";

export interface LibraryProps {
  games: CatalogGame[];
  isUnlocked(game: CatalogGame): boolean;
  isNew(game: CatalogGame): boolean;
  onOpen(game: CatalogGame): void;
  onSettings(): void;
  onRequest(): void;
  notice?: string | null;
  /** Optional one-line progress per slug, e.g. "Level 7 · ★ 15" or "Best 41". */
  progress?: Record<string, string>;
}

/** FR-APP-1: every catalog game with icon, name and locked/unlocked state. */
export function Library(props: LibraryProps) {
  return (
    <Screen
      title="ItsThatGame"
      actions={
        <>
          <button type="button" class="btn ghost" onClick={props.onRequest}>
            Request a game
          </button>
          <button type="button" class="btn ghost" onClick={props.onSettings}>
            Settings
          </button>
        </>
      }
    >
      {props.notice && (
        <p class="notice" role="status">
          {props.notice}
        </p>
      )}
      <ul class="grid" aria-label="Games">
        {props.games.map((game) => {
          const locked = !props.isUnlocked(game);
          const fresh = props.isNew(game);
          const prog = props.progress?.[game.slug];
          const label = [game.title, locked ? "locked" : null, fresh ? "new" : null]
            .filter(Boolean)
            .join(", ");
          return (
            <li key={game.slug}>
              <button
                type="button"
                class={`tile${locked ? " locked" : ""}`}
                data-slug={game.slug}
                aria-label={label}
                onClick={() => props.onOpen(game)}
              >
                <GameIcon icon={game.icon} />
                <span class="tile-title">{game.title}</span>
                <span class="tile-progress" aria-hidden="true">
                  {prog ?? (locked ? "" : "Tap to play")}
                </span>
                <span class="badges">
                  {fresh && <span class="badge new">New</span>}
                  {locked && (
                    <span class="badge lock">
                      <LockIcon /> Locked
                    </span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </Screen>
  );
}
