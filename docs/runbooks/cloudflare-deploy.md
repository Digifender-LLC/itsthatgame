# Runbook: deploy the landing page and API to Cloudflare

**Needs:** prerequisite P1 (a Cloudflare account). **Unblocks:** M1-T5 and the M1
acceptance criteria; production backend for M5 and M6.
**Design references:** [HLD §6](../design/HLD.md#6-deployment-topology),
[TDD §7](../design/TDD.md#7-environments-configuration-and-release), [Roadmap D5](../ROADMAP.md#6-decisions-made-under-delegated-authority).

## Status (2026-10-04)

Account: the owner's "Enders Account"; Access team `zemdregon.cloudflareaccess.com`
([Roadmap D13](../ROADMAP.md#6-decisions-made-under-delegated-authority)).

| Step | Preview | Production |
|---|---|---|
| D1 database | `itsthatgame-preview`, migrations 0001–0002 applied | `itsthatgame-production` created, no migrations yet |
| Worker | `https://itsthatgame-api-preview.lmao.workers.dev` | Not deployed |
| Turnstile widget | Created for `preview.itsthatgame-landing.pages.dev` | Not created |
| Secrets (`TURNSTILE_SECRET`, `HASH_PEPPER`, `OPERATOR_EMAILS`, `ACCESS_AUD`) | Not set | Not set |
| Access app on `/admin` | Not created: the API token gets `auth.forbidden` (code 1010) | Not created |
| Landing page (Pages `itsthatgame-landing`) | Project created; upload fails in the agent environment, whose proxy replaces the Pages upload JWT (code 8000013). Use the Deploy workflow instead | Not deployed |
| Smoke test (§4) | Not run | Not run |

To finish: add *Access: Apps and Policies: Edit* to the API token, then complete §2 steps
3–5 and §3 for preview, run §4, and repeat for production.

## 1. One-time account setup (owner or an agent holding the token)

1. Create a Cloudflare account for Digifender LLC (D4). Workers Paid plan is recommended
   for production (`NFR-7`); the free plan is enough for preview.
2. Create an API token with: *Account › Workers Scripts: Edit*, *Account › D1: Edit*,
   *Account › Cloudflare Pages: Edit*, *Account › Workers Analytics Engine: Edit*,
   *Account › Turnstile: Edit*, *Account › Access: Apps and Policies: Edit*. Store it as
   GitHub Actions secret `CLOUDFLARE_API_TOKEN` and the account ID as
   `CLOUDFLARE_ACCOUNT_ID`.
3. Create a Zero Trust organization (free tier) to use Cloudflare Access. Note the team
   domain (`<team>.cloudflareaccess.com`).

## 2. Create resources (per environment: `preview`, then `production`)

```sh
cd services/api
pnpm exec wrangler d1 create itsthatgame-preview      # then itsthatgame-prod
```

1. Put each returned `database_id` into `services/api/wrangler.toml` in place of
   `REPLACE_WITH_D1_DATABASE_ID` for that environment and commit the change.
2. Turnstile: create a widget for the landing hostname(s) (the `*.pages.dev` hostname
   in M1, D5). Record the site key (public) and secret key.
3. Secrets (never committed, `SEC-2`):

   ```sh
   pnpm exec wrangler secret put TURNSTILE_SECRET --env preview
   pnpm exec wrangler secret put HASH_PEPPER --env preview    # 32+ random bytes, e.g. openssl rand -hex 32
   pnpm exec wrangler secret put ACCESS_AUD --env preview     # from step 5
   pnpm exec wrangler secret put OPERATOR_EMAILS --env preview  # comma-separated (D13)
   ```

4. Vars in `wrangler.toml` per environment: `ALLOWED_ORIGIN` (landing URL),
   `APP_ORIGINS` (`capacitor://localhost,https://localhost`), `ACCESS_TEAM_DOMAIN`.
5. Access: create a self-hosted application covering `<api-host>/admin/*`, policy
   "Allow" for the operator email(s). Copy its Application Audience (AUD) tag into the
   `ACCESS_AUD` secret.

## 3. Deploy

```sh
pnpm --filter @itg/api exec wrangler d1 migrations apply DB --env preview --remote
pnpm --filter @itg/api deploy:preview
```

Landing page (Cloudflare Pages project `itsthatgame-landing`, production branch `main`):

```sh
VITE_API_BASE=https://<api-preview-host> VITE_TURNSTILE_SITE_KEY=<site key> \
  pnpm --filter @itg/landing build
pnpm --filter @itg/api exec wrangler pages deploy ../../apps/landing/dist --project-name itsthatgame-landing
```

Or run the manual **Deploy** workflow (`.github/workflows/deploy.yml`) once the GitHub
secrets above and the repository variables `API_BASE_PREVIEW`, `API_BASE_PRODUCTION`,
`TURNSTILE_SITE_KEY` exist. Production uses the `production` GitHub environment, which
should require approval.

Repeat for `production` once preview passes the smoke test.

## 4. Smoke test (record the output in the deploying PR)

1. Open the landing page on a phone; sign up with a test address and a UTM link
   (`?utm_source=test&utm_campaign=smoke`).
2. Sign up again with the same address in different case → still one row:
   `wrangler d1 execute DB --env <env> --remote --command "select count(*) from waitlist_entries"`.
3. As the operator, open `https://<api-host>/admin/v1/waitlist/stats` (Access login) and
   confirm the test signup appears under source `test` with the chosen price preference.
4. Without Access (private window, `curl`), the same URL returns 401/403.
5. Remove the test address via `unsubscribe.html`; stats count drops.

When all pass in production, mark M1-T5 `Done` in the roadmap with the date and PR link.

## Rollback

- Worker: `pnpm --filter @itg/api exec wrangler rollback --env <env>`.
- Pages: promote the previous deployment in the dashboard.
- D1: Time Travel restore (`wrangler d1 time-travel restore`) to a timestamp before the
  incident; rehearse once before M6 (`DATA-5`).
