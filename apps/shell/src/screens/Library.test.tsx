import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadCatalog, type CatalogGame } from "../catalog";
import { Library } from "./Library";

function renderLibrary(unlocked: (g: CatalogGame) => boolean, seen: string[] = []) {
  const onOpen = vi.fn();
  const games = loadCatalog().games;
  render(
    <Library
      games={games}
      isUnlocked={unlocked}
      isNew={(g) => !seen.includes(g.slug)}
      onOpen={onOpen}
      onSettings={() => undefined}
      onRequest={() => undefined}
    />,
  );
  return { onOpen, games };
}

afterEach(cleanup);

describe("Library (FR-APP-1)", () => {
  it("renders all 8 catalog games with name, icon and lock state", () => {
    renderLibrary((g) => g.tier === "free");
    const tiles = screen.getAllByRole("button").filter((b) => b.classList.contains("tile"));
    expect(tiles).toHaveLength(8);
    expect(tiles.filter((t) => t.classList.contains("locked"))).toHaveLength(5);
    expect(screen.getAllByText("Locked")).toHaveLength(5);
    expect(screen.getByRole("button", { name: "Ring Sort, new" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Untangle, locked, new" })).toBeTruthy();
    expect(document.querySelectorAll("svg.game-icon")).toHaveLength(8);
  });

  it("shows no locks when entitled and hides New for opened games", () => {
    renderLibrary(() => true, ["ring-sort"]);
    expect(screen.queryAllByText("Locked")).toHaveLength(0);
    expect(screen.getAllByText("New")).toHaveLength(7);
  });

  it("passes the tapped game to onOpen", () => {
    const { onOpen } = renderLibrary(() => false);
    fireEvent.click(screen.getByRole("button", { name: /^Stack Up/ }));
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ slug: "stack-up" }));
  });
});
