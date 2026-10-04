# ItsThatGame

An ad-free collection of original hypercasual mobile games ("we built the game from the
ad"), with a way for players to request the next game. This repository holds the
landing page (`apps/landing`), the app shell (`apps/shell`), the API (`services/api`),
the game SDK, and the games (`games/`). Nothing is deployed yet; see the roadmap for
status and `docs/runbooks/` for the remaining owner steps.

- **Plan and status:** [docs/ROADMAP.md](docs/ROADMAP.md) (canonical)
- **Working in this repo (people and AI agents):** [agents.md](agents.md)
- **Set up:** `pnpm install`, then `pnpm check` (all fast checks), `pnpm build`,
  `pnpm test:e2e`
- **Check the docs:** `python3 scripts/check_docs.py`
