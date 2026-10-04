import type { SubmissionCreateRequest } from "@itg/contracts";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { GAME_MODULES, isNew, seenKey, type CatalogGame } from "./catalog";
import { APP_VERSION } from "./config";
import { createAudio } from "./host/audio";
import type { HostDeps } from "./host/gameHost";
import { hapticImpact, onAppActive, onNetworkOnline, prefersReducedMotion } from "./platform";
import { GameError, GameScreen } from "./screens/GameScreen";
import { Library } from "./screens/Library";
import { MyRequests } from "./screens/MyRequests";
import { Paywall } from "./screens/Paywall";
import { RequestGame } from "./screens/RequestGame";
import { Settings } from "./screens/Settings";
import type { AppServices } from "./services/bootstrap";
import { isEntitled } from "./services/entitlementMachine";
import { saveSettings, type Settings as SettingsValues } from "./services/prefs";

type Route =
  | { name: "library" }
  | { name: "game"; game: CatalogGame }
  | { name: "gameError"; game: CatalogGame }
  | { name: "settings" }
  | { name: "paywall"; back: "library" | "settings" }
  | { name: "request" }
  | { name: "requests" };

/** Re-render when a service notifies a change. */
function useSubscription(service: { subscribe(cb: () => void): () => void }): void {
  const [, setV] = useState(0);
  useEffect(() => service.subscribe(() => setV((x) => x + 1)), [service]);
}

export function App({ services }: { services: AppServices }) {
  const { games, entitlement, outbox, analytics, kv } = services;
  const [route, setRoute] = useState<Route>({ name: "library" });
  const [settings, setSettings] = useState(services.settings);
  const [seen, setSeen] = useState(services.seen);
  const [notice, setNotice] = useState<string | null>(null);
  useSubscription(entitlement);
  useSubscription(outbox);

  // App start, foreground, and connectivity triggers (SDD §4, §5).
  useEffect(() => {
    analytics.track("app_open");
    void entitlement.refresh();
    void outbox.flush();
    const grace = setInterval(() => entitlement.tick(), 60_000);
    const offActive = onAppActive((active) => {
      if (active) {
        entitlement.tick();
        void entitlement.refresh();
        void outbox.flush();
      } else {
        void analytics.flush();
      }
    });
    const offOnline = onNetworkOnline(() => void outbox.flush({ networkBack: true }));
    return () => {
      clearInterval(grace);
      offActive();
      offOnline();
    };
  }, []);

  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const hostDeps = useMemo<HostDeps>(
    () => ({
      kv,
      audio: createAudio(() => settingsRef.current.sound),
      haptic: hapticImpact,
      hapticsOn: () => settingsRef.current.haptics,
      reducedMotion: prefersReducedMotion,
      onAppActive,
      track: (name, slug) => analytics.track(name, slug),
    }),
    [],
  );

  const go = (r: Route) => {
    setNotice(null);
    setRoute(r);
  };

  const openGame = (game: CatalogGame) => {
    if (!entitlement.isUnlocked(game)) {
      go({ name: "paywall", back: "library" }); // RULE-3
      return;
    }
    if (!seen.has(game.slug)) {
      void kv.set(seenKey(game.slug), "1"); // RULE-12: "New" until first opened
      setSeen(new Set(seen).add(game.slug));
    }
    go({ name: "game", game });
  };

  const changeSettings = (next: SettingsValues) => {
    setSettings(next);
    analytics.setEnabled(next.analytics); // RULE-11: immediate
    void saveSettings(kv, next);
  };

  const submitRequest = async (payload: SubmissionCreateRequest) => {
    await outbox.enqueue(payload);
    setRoute({ name: "requests" });
    setNotice("Thanks! Your request is saved and will be sent when you're online.");
    void outbox.flush();
  };

  const entitled = isEntitled(entitlement.snapshot.state);

  switch (route.name) {
    case "library":
      return (
        <Library
          games={games}
          isUnlocked={(g) => entitlement.isUnlocked(g)}
          isNew={(g) => isNew(g, APP_VERSION, seen.has(g.slug))}
          onOpen={openGame}
          onSettings={() => go({ name: "settings" })}
          onRequest={() => go({ name: "request" })}
          notice={notice}
        />
      );
    case "game": {
      const load = GAME_MODULES[route.game.module];
      if (!load)
        return <GameError title={route.game.title} onBack={() => go({ name: "library" })} />;
      return (
        <GameScreen
          game={route.game}
          load={load}
          deps={hostDeps}
          onExit={() => go({ name: "library" })}
          onFailure={() => setRoute({ name: "gameError", game: route.game })}
        />
      );
    }
    case "gameError":
      return <GameError title={route.game.title} onBack={() => go({ name: "library" })} />;
    case "settings":
      return (
        <Settings
          settings={settings}
          entitled={entitled}
          onChange={changeSettings}
          onUnlock={() => go({ name: "paywall", back: "settings" })}
          onRestore={async () => {
            const r = await entitlement.restore();
            if (r.kind === "restored") analytics.track("restore_success");
            return r;
          }}
          onMyRequests={() => go({ name: "requests" })}
          onBack={() => go({ name: "library" })}
        />
      );
    case "paywall":
      return (
        <Paywall
          entitlement={entitlement}
          analytics={analytics}
          onClose={() => go({ name: route.back })}
        />
      );
    case "request":
      return <RequestGame onSubmit={submitRequest} onBack={() => go({ name: "library" })} />;
    case "requests":
      return (
        <MyRequests
          items={outbox.items}
          notice={notice}
          onRefresh={() => {
            void outbox.flush({ networkBack: true });
            void outbox.refreshStatuses();
          }}
          onDismiss={(id) => void outbox.dismiss(id)}
          onNew={() => go({ name: "request" })}
          onBack={() => go({ name: "library" })}
        />
      );
  }
}
