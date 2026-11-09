# Runbook

How to run, test, deploy and troubleshoot what exists today. Only staging exists, and production is set up in Phase 7.

## Requirements

- Node 24, set by `.nvmrc`. Wrangler needs at least Node 22, so this repository will not build on the Mac's default Node 20.
- A Cloudflare login for deployment only.

## Local setup

```sh
source ~/.nvm/nvm.sh && nvm use
npm ci
cp .dev.vars.example .dev.vars
npx playwright install chromium
```

Run `nvm use` in each new terminal.

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Next.js dev server on port 3000 |
| `npm run preview` | Build, then run in the local Workers runtime on port 8788 |
| `npm run typecheck` | TypeScript checks |
| `npm test` | Unit tests |
| `npm run test:e2e` | Build, then browser tests against the local Workers runtime |

`npm run build` runs only `next build`, because OpenNext calls that script itself. Use `npm run build:worker` for a full Worker build.

## Configuration

| Name | Kind | Where it is set | Purpose |
|---|---|---|---|
| `APP_ENV` | Variable | `wrangler.jsonc` | `local`, `staging` or `production` |
| `HEALTH_CHECK_SECRET` | Secret | `.dev.vars` locally, Worker secret on staging | Proves secrets reach the server |

Values are validated in `src/server/env.ts`. Add new names there and in `src/cloudflare-env.d.ts`. Never commit `.dev.vars`.

## Staging

**URL:** https://practicemmi-staging.practicemmi.workers.dev  
**Worker:** `practicemmi-staging`, on the Cloudflare Free plan

```sh
npx wrangler login          # first time only
npm run deploy:staging
```

Deployment is manual. CI does not deploy.

| Task | Command |
|---|---|
| Set a secret | `npx wrangler secret put NAME --env staging` |
| Watch live logs | `npx wrangler tail --env staging --format json` |
| List deployments | `npx wrangler deployments list --env staging` |
| Roll back | `npx wrangler rollback --env staging` |

**Health check:** `curl https://practicemmi-staging.practicemmi.workers.dev/api/health` should return `status: ok`, `environment: staging` and `secretConfigured: true`.

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `Wrangler requires at least Node.js v22` | Run `nvm use` |
| TLS handshake failure on a new `workers.dev` subdomain | The certificate is still being issued. It took under two minutes on this account |
| `wrangler login` times out | It waits about two minutes for browser approval. Run it again and approve promptly |
| `wrangler tail` says the Worker does not exist | Do not pass the Worker name with `--env`, because Wrangler appends the environment to the name |
| A page hangs and returns 500 on Workers | Check that `cacheComponents` and `partialPrefetching` are off in `next.config.ts` (D-006) |
| Route fails to build with `dynamic` config errors | Same cause: those options reject `export const dynamic` |
| `/api/health` returns `status: error` | Environment validation failed. The logs name the invalid field |
