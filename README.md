# NecroCard

NecroCard lets you build tiny 1-bit card worlds and bring them to life. Draw a
card stack on a 256 × 160 pixel canvas, add buttons and fields, describe a
button's behaviour in plain language, review the proposed rules, then play the
stack or edit it with a friend on another device. It runs in the browser on
phones, tablets and desktops.

The controlling plan is [`NECROCARD_BLUEPRINT_v2.md`](NECROCARD_BLUEPRINT_v2.md).

## Prerequisites

- Node 24.22.2 (pinned in `.nvmrc` and `package.json` `engines`)
- npm 12.2.2 (pinned in `package.json` `packageManager`)
- Google Chrome, for the local end-to-end tests
- Docker is optional. It is not required on the development machine.

## Install

```sh
npm ci
```

Copy `.env.example` to `.env.local` and fill in your own Supabase development
project values. Never commit real URLs or keys.

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Start the Vite dev server on `127.0.0.1` |
| `npm run typecheck` | Type-check browser, domain and Node sources, then the Edge Functions |
| `npm run build` | Build the app into `dist/` and report initial JavaScript sizes |
| `npm run check:bundle` | Scan `dist/` for server secrets and key patterns |
| `npm run test:e2e:local` | Run Playwright against the installed Google Chrome |

## Hosted development workflow

Backend checks on this machine run against a hosted Supabase development
project instead of a local stack. Keep credentials in ignored local files or
provider secrets.

```sh
npx supabase link --project-ref <project-ref>
npx supabase db push
npx supabase functions deploy --use-api
```

`--use-api` bundles Edge Functions on the server, so no Docker is needed.

`npm run dev:backend` (`supabase functions serve`) requires Docker. It is
pending on this machine and runs only in CI, where GitHub Actions runners
provide Docker.

## Blocked items

| Item | Reason |
|---|---|
| Local Supabase stack (`supabase start`, `supabase functions serve`, `npm run dev:backend`) | Docker is not permitted on the development machine by organisation policy. The local stack runs only in CI. |
| Pinned Node 24.22.2 and npm 12.2.2 | Not yet installed; the machine has Node 24.19.0 and npm 11.17.0. |
| Kiro hooks (`.kiro/hooks/core-checks.json`) | Deferred by user decision. |

## License

[MIT](LICENSE)
