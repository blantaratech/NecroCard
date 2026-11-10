# Decisions

Reviewed decisions, recorded gaps and check results for NecroCard. Entries are dated YYYY-MM-DD. Earlier entries are never edited; a later entry supersedes them. No secret, URL or project ref is recorded here.

## 2026-11-09: Toolchain mismatch

- Installed: Node 24.19.0, npm 11.17.0.
- Pinned: Node 24.22.2 (`.nvmrc`, `engines.node`), npm 12.2.2 (`packageManager`).
- Scaffold checks run on the installed versions until the pinned versions are installed. Checks run on the installed versions so far: none. Each run is listed in the Verification log with the versions used.
- `npm ci` on the pinned toolchain (Req 1.6) runs in CI until the pins are installed locally.

## 2026-11-09: Docker not permitted; Docker-free backend path (D8)

- Docker is not permitted on the development machine by organisation policy. This is permanent. `supabase start` and `supabase functions serve` are unavailable here.
- Alternative path: migrations via `supabase db push` to a linked hosted Supabase development project; Edge Functions via `supabase functions deploy --use-api` (server-side bundling); authenticated calls to the hosted function URLs; the full local-stack integration suite in GitHub Actions (Docker on Ubuntu runners, workflow built by spec 03).
- Hosted-project credentials stay in ignored local files or provider secrets.

Day 1 compatibility-gate checks:

| check | venue | result | reason |
|---|---|---|---|
| SQL migration | hosted dev project | not run | No migration exists yet (spec 03); hosted project not linked yet |
| Anonymous session | hosted dev project | not run | No Supabase client code yet (spec 03) |
| Authenticated Edge call | hosted dev project | not run | No Edge Function exists yet |
| SDK MCP handshake | hosted dev project | not run | MCP server function not built yet (spec 05) |

Later runs are appended to the Verification log.

## 2026-11-09: Kiro hooks deferred

- `.kiro/hooks/core-checks.json` (blueprint §3.4) is deferred by user decision, dated 2026-11-09. No file exists under `.kiro/hooks/`.
- Condition to add it: the user reverses the decision, and `npm run typecheck` and `npm run check:core` exist and run locally. Before recording hooks as used, inspect one file edit and one completed turn in the installed IDE (blueprint §3.4).

## 2026-11-09: `.kiro/settings/mcp.json` deferred

- Deferred until local Edge Functions can be served (blueprint §3.6). Its URL targets `supabase functions serve`, which needs Docker, so not on this machine.
- Gap: `.kiro/agents/runtime-engineer.json` lists the `@necrocard-dev` MCP tool. Without `mcp.json` that tool is unavailable; the agent still works with read, write and shell.

## 2026-11-09: Pending package scripts

Blueprint §4.2 scripts omitted from `package.json` (Req 1.7, 1.8):

| script | command (blueprint §4.2) | missing file or tool |
|---|---|---|
| `test:integration` | `vitest run tests/integration` | No test files under `tests/integration/`; Vitest exits non-zero with no test files |
| `verify` | `npm run check:core && npm run test:integration && npm run build && npm run check:bundle && npm run test:e2e` | The `test:integration` script |
| `check:submission` | `node scripts/check-submission.mjs` | `scripts/check-submission.mjs` (release work) |
| `dev:backend` | `supabase functions serve --env-file supabase/functions/.env.local` | Docker (not permitted here); CI-only |
| `test:e2e:smoke` | `playwright test tests/e2e/judge-path.spec.ts` | `tests/e2e/judge-path.spec.ts`; pending until task 21.3 |

## 2026-11-09: Paths outside blueprint §4.1/§4.2

| path | reason |
|---|---|
| `index.html` | Vite entry page; loads `/theme-init.js` and `/src/main.tsx` |
| `vite.config.ts` | React plugin, `necrocardHeaders()` plugin (CSP `_headers`, initial-JS size report, D7) and Vitest config |
| `src/main.tsx` | Browser entry module that mounts the App_Shell |
| `src/input/pointerStroke.ts` | Pure single-active-pointer gate, kept apart from pointer mapping so it can be property-tested |
| `scripts/check-domain-imports.mjs` | Domain import allowlist (D1, Req 3.3) |
| `scripts/check-tracked-secrets.mjs` | Scans tracked files for `.my_env` values (Req 4.17) |
| `scripts/lib/*` | Shared pure helpers (`csp.mjs`, `secretPatterns.mjs`) used by the config, scripts and tests |
| `tsconfig.domain.json` | DOM-free compile of `src/domain/` (D1) |
| `tsconfig.node.json` | Node-side compile of `vite.config.ts`, `playwright.config.ts`, tests and `scripts/**/*.mjs` |
| `tests/properties/fc-options.ts` | Shared fast-check options for all property tests |
| `.gitkeep` placeholders | Keep empty scaffold directories in Git; each is removed when its directory gets real files |

## 2026-11-09: `supabase/config.toml` function entries deferred

- `supabase/config.toml` holds `project_id` only. The blueprint function entries are added by the spec that creates each function.

## 2026-11-09: `noReferences` gap (D9)

- `src/app/ports.ts` ships `noReferences`, which returns no references, so deleting a card or widget is never blocked by references (temporary gap of Req 7.4/7.6). Rules do not execute in spec 01.
- Rule 1: spec 02 must replace `noReferences` with the real Reference_Index before the Rule_Interpreter is enabled in Play_Mode.
- Rule 2: no deletion path edits the Showcase. It opens only in Play_Mode without delete controls, the session reducer refuses `card/delete` and `widget/delete` while the source is the Showcase, and `public/showcase.json` is never written.

## 2026-11-09: Placeholder interpreter gap (D9)

- `placeholderInterpreter` returns the play state unchanged with the message "Rules run once the rule engine (spec 02) lands". Play_Mode calls it for every Button press (Req 22.2). Spec 02 replaces it.

## 2026-11-09: Two-layer Nebius key check

- Nebius publishes no key format, so `check:bundle` uses two layers: (a) exact match on the real `NEBIUS_API_KEY` from the environment or ignored `supabase/functions/.env.local`, held in memory and never printed; (b) a heuristic for high-entropy quoted tokens near `nebius`, `tokenfactory` or `Bearer`.
- The structural protection is primary: the key exists only as an Edge Function secret, is never `VITE_`-prefixed, and the browser never calls Nebius. The scan is a backstop.
- Whether layer (a) ran is noted with each `check:bundle` row in the Verification log.

## 2026-11-09: Light-theme status and cursor colours

- Light `--success` `#1E6B32`, light `--danger` `#B3123A` and Keyboard_Cursor ring `#C2185B`: contrast checked and approved by the team (user-reported, 2026-11-09).

## 2026-11-09: Playwright browsers (D10)

- Locally, the four Chromium-engine projects use the installed Google Chrome (`channel: "chrome"`) through `npm run test:e2e:local`; no Playwright browser download.
- WebKit (`phone-webkit`, `tablet-webkit`) and Firefox (`desktop-firefox`): "not run" locally (browser not installed). They run in CI, which installs Chrome, WebKit and Firefox and records the Chrome and Playwright versions per run.

## 2026-11-09: E2E against the preview server

- Playwright `webServer` runs `npm run build && npm run preview` on port 4173 instead of the blueprint's dev server. A fixture applies the CSP from `dist/_headers` to document responses, and tests fail on any `securitypolicyviolation`. Tests therefore see the production build and policy.

## 2026-11-09: LICENSE holder

- MIT LICENSE copyright holder: Blantara Tech (supplied by the team, 2026-11-09).

## 2026-11-09: Checks run on the installed toolchain (task 1.11)

- Supersedes "Checks run on the installed versions so far: none" in the Toolchain mismatch entry.
- Run on Node 24.19.0 / npm 11.17.0 (not the pins 24.22.2 / 12.2.2): `npm install`, lockfile pin comparison, `npm run typecheck`, `npm run build`, `npm run check:bundle`, `npm run check:edge` (Deno 2.9.6), and the Req 4.9 and Req 4.10 `git check-ignore --no-index` lists. Results are in the Verification log.
- npm 11.17.0 `allow-scripts` skipped the postinstall scripts of `deno@2.9.6`, `netlify-cli@27.16.2` and `esbuild@0.28.1` (no `allowScripts` entry). The platform binaries came from optional packages instead: `node_modules/deno/deno.exe` reports Deno 2.9.6, `@supabase/cli-windows-x64` reports Supabase CLI 3.0.0, `@esbuild/win32-x64` is present. No `allowScripts` setting was added. `netlify-cli` was not exercised.
- Fix in `scripts/check-edge.mjs`: on Windows the program name `deno` is no longer quoted in the shell command. A quoted name found via PATH made cmd.exe resolve `%~dp0` in `node_modules/.bin/deno.cmd` wrongly ("The system cannot find the path specified"), so the checker reported Deno as missing. Arguments are still quoted.

## 2026-11-09: Public defaults exempted in check:tracked

- Rule: `scripts/check-tracked-secrets.mjs` reads the tracked `supabase/functions/.env.example` and treats each non-empty `NAME=value` as a public default. A `.my_env` value is skipped only when it is exactly equal to one of those defaults; substrings and superstrings of a default are still searched for.
- Credential variables are never exempted: `NEBIUS_API_KEY`, `MCP_SERVICE_TOKEN` and any name containing KEY, TOKEN, SECRET or PASS. A `.my_env` value under such a label is always searched for, and a non-empty credential variable in the example is itself a finding (`supabase/functions/.env.example: credential variable <NAME> has a value`).
- The checker prints `Exempted N public default value(s) from supabase/functions/.env.example`, never the values. Only a tracked example file counts.
- Rationale: the first `check:tracked` run (task 2.2) flagged the public `NEBIUS_MODEL` default from blueprint §4.4, which `.my_env` also contains on a free-text line. That value is published in the tracked example file, so it is not a secret. Exact matching keeps every other `.my_env` value under check. `.my_env` and tracked files were not edited.
- Tested on synthetic fixtures in `%TEMP%` (deleted afterwards): exact match skipped; superstring and substring still flagged; a credential label whose value equals a default still flagged; non-empty `MCP_SERVICE_TOKEN` and `DB_PASSWORD` in the example reported; no value printed.

## 2026-11-10: Name rule helper in `src/domain/limits.ts` (task 4.1)

- design.md names the "name rules" in `limits.ts` but gives no helper signature. Chosen: `checkName(s): NameRuleFailure | null` with `NameRuleFailure = "empty" | "too-long" | "whitespace-only"`, plus `isValidName(s)`. Rule: 1–64 code points (`LIMITS.nameCodePointsMin/Max`) and not whitespace-only (`/^\s*$/u`, as in the design's semantic checks); failures are reported in the order empty, too long, whitespace-only.
- The helper returns rule names, not `DiagnosticCode` values. Mapping to codes (`name-empty`, `name-too-long` and a code for whitespace-only) is decided in tasks 5.1/5.3, where `DiagnosticCode` is defined.
- `utf8ByteLength` counts per code point (1/2/3/4 bytes) with a lone surrogate counted as 3 (U+FFFD); `codePointLength` counts `for...of` iterations, equal to `[...s].length` without allocating an array. No `TextEncoder`, since `tsconfig.domain.json` has `lib: ["ES2023"]` only.

## 2026-11-10: Bitmap codec in `src/domain/bitmap.ts` (task 4.3)

- `Result<T>` (`{ ok: true; value: T } | { ok: false; error: string }`, design: Domain components) is defined and exported in `bitmap.ts`, its first user. design.md names no file for it; later modules (`raster.ts`, `editor.ts`, `src/input/pointerMapper.ts`) import it from `bitmap.ts` unless a later task moves it.
- `decodeBitmap` checks, in order and before allocating output: `typeof text === "string"`, length exactly `LIMITS.bitmapBase64Chars` (6,828), `/^[A-Za-z0-9+/]{6827}=$/` (alphabet and single final `=`), alphabet index of character 6,826 with `index & 0b11 === 0`, decoded length 1,706 × 3 + 2 = 5,120. Any failure returns `{ ok: false, error }` and no bitmap.
- Encoder and decoder are table-driven (64-character alphabet string and a 128-entry `Int8Array` reverse table); no `atob`, `btoa`, `Buffer` or `TextEncoder`.
- `getPixel` and `setPixel` return an error for a non-integer or out-of-range coordinate, a value other than 0 or 1, or a bitmap that is not a 5,120-byte `Uint8Array`. `setPixel` writes to `b.slice()` and never modifies its input.
- `encodeBitmap(b): string` has no error channel in the design signature, so a bitmap that is not 5,120 bytes throws `RangeError`. This is the design's allowed programmer-error case: the `Bitmap` type promises 5,120 bytes. Callers pass only `createBitmap`, `setPixel` or `decodeBitmap` output.

## 2026-11-10: Property 8 generator (task 4.4)

- `tests/properties/raster.property.test.ts` drives Property 8 with 0–300 assignments. x is drawn from {0, 7, 8, 255} or 0–255, y from {0, 159} or 0–159, value from {0, 1}.
- fast-check's default `size` keeps generated arrays short (about 10 elements), so the sequence arbitrary is `fc.oneof` of the default-size array and an array with `size: "max"`. Coverage measured on seed 20261108, 500 runs: lengths 0–298, 34 empty runs, 155 runs longer than 100, 245 runs that write one pixel more than once, all of x ∈ {0, 7, 8, 255} and y ∈ {0, 159} generated.
- The oracle is a `Uint8Array(40960)` with one entry per pixel, packed MSB-first in the test and compared with `Buffer.from(bytes).toString("base64")`. Its constants (256, 160, 5,120, 6,828) are written in the test, not read from `LIMITS`.
- Req 8.2 "identical text for equal pixels" is checked by rebuilding the same pixel array from only its ink pixels in index order and comparing the encoded text.
- The all-black bitmap is not generated: Property 8 starts from blank with at most 300 writes. The all-white (blank) bitmap is the empty sequence.

## Verification log

Rows are appended and never edited. The latest row for a check is its current result. Results are "pass", "fail" or "not run" with a reason.

| date | check | command | node/npm (deno) | result | notes |
|---|---|---|---|---|---|
| 2026-11-09 | Install and lockfile pins (Req 1.4) | `npm install` | — | not run (pending 1.11) | Record EBADENGINE warnings and installed versions |
| 2026-11-09 | Type-check | `npm run typecheck` | — | not run (pending 1.11) | |
| 2026-11-09 | Build | `npm run build` | — | not run (pending 1.11) | Record initial-JS gzip sizes, total and the `VITE_SUPABASE_URL` warning |
| 2026-11-09 | Bundle secret check | `npm run check:bundle` | — | not run (pending 1.11) | Record whether Nebius layer (a) ran |
| 2026-11-09 | Edge check | `npm run check:edge` | — | not run (pending 1.11) | Record Deno version and entry-point count |
| 2026-11-09 | Not-ignored paths (Req 4.9) | `git check-ignore --no-index <paths>` | — | not run (pending 1.11) | Temporary bare repository |
| 2026-11-09 | Ignored paths (Req 4.10) | `git check-ignore --no-index <paths>` | — | not run (pending 1.11) | Temporary bare repository |
| 2026-11-09 | Unit tests | `npm run test:unit` | — | not run (pending 1.11) | |
| 2026-11-09 | Property tests | `npm run test:pbt` | — | not run (pending 1.11) | |
| 2026-11-09 | Clean install on pinned toolchain (Req 1.6) | `npm ci` | — | not run (pending 1.11) | Needs Node 24.22.2 / npm 12.2.2 |
| 2026-11-09 | Tracked-file secret check (Req 4.17) | `npm run check:tracked` | — | not run (pending 1.11) | Needs a Git repository (task 2.2) |
| 2026-11-09 | Install (attempt 1) | `npm install` | 24.19.0 / 11.17.0 | fail | Exit 1: `ERR_SSL_CIPHER_OPERATION_FAILED` (OpenSSL `ossl_gcm_stream_update: cipher operation failed`) while downloading tarballs from registry.npmjs.org; npm rolled back. Also EBUSY/EPERM `cleanup` warnings on `node_modules` (OneDrive-synced folder). No lockfile written |
| 2026-11-09 | Install and lockfile pins (Req 1.4) | `npm install` | 24.19.0 / 11.17.0 | pass | Re-run of attempt 1. Exit 0; added 1014 packages in 3m. One EBADENGINE warning: `necrocard@0.2.0` requires node 24.22.2, current v24.19.0 / npm 11.17.0. Deprecation warnings: `@opentelemetry/sdk-trace-node@2.12.0`, `@opentelemetry/sdk-trace-base@2.12.0`, `node-domexception@1.0.0`. `npm audit`: 18 vulnerabilities (2 low, 16 moderate), not addressed. Postinstall of deno, netlify-cli and esbuild skipped by npm allow-scripts (see the task 1.11 entry); no download was blocked |
| 2026-11-09 | Lockfile pins (Req 1.4) | PowerShell comparison of `package.json` pins with `package-lock.json` `packages["node_modules/<name>"].version` and `node_modules/<name>/package.json` | 24.19.0 / 11.17.0 | pass | Exit 0; lockfileVersion 3; 0 mismatches. Lock = installed = pin: @supabase/supabase-js 2.119.0, react 19.3.1, react-dom 19.3.1, zod 4.6.7, vite 8.3.6, @vitejs/plugin-react 6.2.1, typescript 7.0.2, vitest 5.1.0, fast-check 4.10.2, @playwright/test 1.65.0, @types/react 19.3.0, @types/react-dom 19.3.0, @types/node 24.19.2, @modelcontextprotocol/client 2.4.0, @modelcontextprotocol/server 2.4.0, deno 2.9.6, supabase 3.0.0, netlify-cli 27.16.2. Only lockfile outside `node_modules/`: `package-lock.json` (no npm-shrinkwrap.json, yarn.lock, pnpm-lock.yaml, bun.lockb, bun.lock) |
| 2026-11-09 | Type-check (attempt 1) | `npm run typecheck` | 24.19.0 / 11.17.0 (deno 2.9.6 installed) | fail | Exit 1. All three `tsc` projects and `check-domain-imports` (1 file, 0 findings) passed; `check:edge` printed "expected Deno 2.9.6, but no Deno executable was found". Cause: quoted `"deno"` in the Windows shell command (scaffold defect, fixed in `scripts/check-edge.mjs`) |
| 2026-11-09 | Type-check | `npm run typecheck` | 24.19.0 / 11.17.0 (deno 2.9.6) | pass | Re-run after the fix. Exit 0; `check-domain-imports: 1 file(s), 0 finding(s)`; `check-edge: Deno 2.9.6`, `Checked 0 entry point(s)` |
| 2026-11-09 | Build | `npm run build` | 24.19.0 / 11.17.0 | pass | Exit 0; vite 8.3.6, 14 modules. Warning: "VITE_SUPABASE_URL is not set; Content-Security-Policy uses connect-src 'self' only." (no `.env.local`, variable unset). Initial JS gzip level 9: `assets/index-TYLJPTH8.js` 67,792 bytes; total 67,792 bytes (max 358,400). `dist/_headers` CSP for `/*`: `default-src 'self'; script-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; worker-src 'self'; connect-src 'self'` |
| 2026-11-09 | Bundle secret check | `npm run check:bundle` | 24.19.0 / 11.17.0 | pass | Exit 0; scanned 4 files under `dist/`, 0 findings. Nebius layer (a) not run: `NEBIUS_API_KEY` not set and no `supabase/functions/.env.local`; layer (b) heuristic ran |
| 2026-11-09 | Edge check | `npm run check:edge` | 24.19.0 / 11.17.0 (deno 2.9.6) | pass | Exit 0; `check-edge: Deno 2.9.6`; `Checked 0 entry point(s)` (no `supabase/functions/*/index.ts` yet) |
| 2026-11-09 | Not-ignored paths (Req 4.9) | `git --git-dir="$env:TEMP\nc-ignore-check" --work-tree=. check-ignore --no-index <7 Req 4.9 paths>`, asserted by a PowerShell wrapper | 24.19.0 / 11.17.0 (git 2.55.0.windows.3) | pass | Plain `git check-ignore` printed nothing and exited 1 (git's "no path ignored" status, the Req 4.9 expectation). The wrapper (also `--verbose --non-matching`: `.env.example` and `supabase/functions/.env.example` match only the `!` re-include lines 5 and 8; the rest match no pattern) exited 0. A first wrapper run exited 1 because it counted `!` re-include lines as ignored; wrapper logic fixed, `.gitignore` unchanged. Temporary bare repository deleted; no `.git` created in `NC_Codebase` |
| 2026-11-09 | Ignored paths (Req 4.10) | `git --git-dir="$env:TEMP\nc-ignore-check" --work-tree=. check-ignore --no-index memory/test.md memory/sub/test.md .my_env .env .env.local supabase/functions/.env supabase/functions/.env.local` | 24.19.0 / 11.17.0 (git 2.55.0.windows.3) | pass | Exit 0; printed all 7 paths. Temporary bare repository deleted; no `.git` created in `NC_Codebase` |
| 2026-11-09 | Unit tests | `npm run test:unit` | — | not run | No test files yet; optional tasks 1.8–1.10 skipped |
| 2026-11-09 | Property tests | `npm run test:pbt` | — | not run | No test files yet; optional tasks 1.8–1.10 skipped |
| 2026-11-09 | Clean install on pinned toolchain (Req 1.6) | `npm ci` | — | not run | Pinned toolchain Node 24.22.2 / npm 12.2.2 not installed |
| 2026-11-09 | Tracked-file secret check (Req 4.17) | `npm run check:tracked` | — | not run | No Git repository yet; runs in task 2.2 |
| 2026-11-09 | Repository and remote (Req 4.8, task 2.1) | `git init`; `git switch -c main`; `git remote add origin https://github.com/blantaratech/NecroCard.git` | 24.19.0 / 11.17.0 (git 2.55.0.windows.3) | pass | Each exited 0. `git remote -v`: `origin https://github.com/blantaratech/NecroCard.git` (fetch and push); HEAD `refs/heads/main` (unborn). `user.name` and `user.email` already set (repository view and global); Git config not changed. Nothing staged or committed |
| 2026-11-09 | Not-ignored paths (Req 4.9), real repository | `git check-ignore --no-index .kiro/specs/01-responsive-authoring/requirements.md .kiro/steering/product.md .kiro/agents/runtime-engineer.json .kiro/agents/runtime-reviewer.json .env.example supabase/functions/.env.example src/memory/notes.md` | 24.19.0 / 11.17.0 (git 2.55.0.windows.3) | pass | Printed nothing and exited 1 (git's "no path ignored" status, the Req 4.9 expectation). With `--verbose --non-matching` (exit 0): `.env.example` and `supabase/functions/.env.example` match only the `!` re-include lines 5 and 8; the other five match no pattern |
| 2026-11-09 | Ignored paths (Req 4.10), real repository | `git check-ignore --no-index memory/test.md memory/sub/test.md .my_env .env .env.local supabase/functions/.env supabase/functions/.env.local` | 24.19.0 / 11.17.0 (git 2.55.0.windows.3) | pass | Exit 0; printed all 7 paths |
| 2026-11-09 | Tracked-file secret check (Req 4.17), attempt 1 | `npm run check:tracked` | 24.19.0 / 11.17.0 (git 2.55.0.windows.3) | fail | Exit 1; 49 staged paths; 4 findings, all `value of line 14`. False positive: the value is the public `NEBIUS_MODEL` default from blueprint §4.4 in `supabase/functions/.env.example`, on a lowercase-key (free-text) line of `.my_env`. No value printed |
| 2026-11-09 | Tracked-file secret check fix | `scripts/check-tracked-secrets.mjs` change; synthetic fixtures in `%TEMP%` via `run()` | 24.19.0 / 11.17.0 | pass | Exact-match exemption of public defaults from the tracked `supabase/functions/.env.example`; credential variables never exempted; non-empty credential in the example reported (see "Public defaults exempted in check:tracked"). Fixture script exit 0, all assertions passed; fixtures deleted. `.my_env` and tracked files not edited |
| 2026-11-09 | Tracked-file secret check (Req 4.17) | `npm run check:tracked` | 24.19.0 / 11.17.0 (git 2.55.0.windows.3) | pass | Re-run after the fix. Exit 0; `Exempted 1 public default value(s) from supabase/functions/.env.example`; `Scanned 49 tracked file(s); 0 finding(s)`. `git ls-files .my_env` printed nothing |
| 2026-11-09 | Type-check | `npm run typecheck` | 24.19.0 / 11.17.0 (deno 2.9.6) | pass | After the `check-tracked-secrets.mjs` change. Exit 0; `check-domain-imports: 1 file(s), 0 finding(s)`; `check-edge: Deno 2.9.6`, `Checked 0 entry point(s)` |
| 2026-11-10 | Remote state before first push (task 2.3) | `git ls-remote origin` | 24.19.0 / 11.17.0 (git 2.55.0.windows.3) | pass | Printed nothing: the remote was empty, so no `git pull --rebase` was needed. Result as reported by task 2.3 |
| 2026-11-10 | First push (Req 1.4, 4.17) | `git push -u origin main` | 24.19.0 / 11.17.0 (git 2.55.0.windows.3) | pass | Commit `efd10f4`; `* [new branch] main -> main`; upstream set (`branch.main.remote` origin, `branch.main.merge` refs/heads/main); no force. Rechecked 2026-11-10 MYT in task 3.1: `git ls-remote origin` lists `refs/heads/main` at `efd10f4`, `git branch -vv` shows `main` tracking `origin/main` |
| 2026-11-10 | Type-check (task 4.1, `src/domain/limits.ts`) | `npm run typecheck` | 24.19.0 / 11.17.0 (deno 2.9.6) | pass | Exit 0; all three `tsc` projects passed; `check-domain-imports: 2 file(s), 0 finding(s)`; `check-edge: Deno 2.9.6`, `Checked 0 entry point(s)` |
| 2026-11-10 | Ad hoc limits spot check (task 4.1) | `node --input-type=module -e "<import ./src/domain/limits.ts; compare with Buffer.byteLength and [...s].length>"` | 24.19.0 / 11.17.0 | pass | Exit 0. 9 strings (empty, ASCII, 2-, 3- and 4-byte, lone high and low surrogates, a valid pair, a trailing lone high surrogate): 0 mismatches. `checkName`: "" → empty, 1 and 64 code points → pass, 65 → too-long, "   " and NBSP+LF → whitespace-only, 64 astral → pass, 65 astral → too-long. Not a test file; optional task 4.2 not written |
| 2026-11-10 | Type-check (task 4.3, `src/domain/bitmap.ts`) | `npm run typecheck` | 24.19.0 / 11.17.0 (deno 2.9.6) | pass | Exit 0; all three `tsc` projects passed; `check-domain-imports: 3 file(s), 0 finding(s)`; `check-edge: Deno 2.9.6`, `Checked 0 entry point(s)` |
| 2026-11-10 | Ad hoc bitmap codec spot check (task 4.3) | `<script> \| node --input-type=module -` (stdin; `module.registerHooks` adds `.ts` to relative specifiers; no file written) | 24.19.0 / 11.17.0 | pass | Exit 0; 999 checks, 0 failures. Blank and 300 random bitmaps: `encodeBitmap` equals `Buffer.toString("base64")`, 6,828 chars matching `/^[A-Za-z0-9+/]{6827}=$/`, decode round trip equal. Coordinates x ∈ {0, 7, 8, 255} × y ∈ {0, 159}: set/get/clear, exact byte and MSB-first bit, input unchanged. Rejected with no value: coordinates −1, 256, 160 (y), 0.5, NaN, Infinity, non-number; values 2, −1, 0.5, NaN, "1", true; decode of non-strings, lengths 0/6,827/6,829, `==`, `=` first, no padding, `-`, space, LF, non-ASCII, lone surrogate, unused bits 1/2/3 (`B`, `C`, `D`); `E` (unused bits 0) accepted. Not a test file; task 4.4 not written |
| 2026-11-10 | Property tests (task 4.4, attempt 1) | `npm run test:pbt` | 24.19.0 / 11.17.0 | pass (superseded) | Exit 0; 1 file, 1 test: `raster.property.test.ts` > Property 8. Seed 20261108, 500 runs (`FC_RUNS`, `FC_SEED`, `FC_PATH` unset). The generator then used the default `size` only (arrays of about 10), so long sequences were not reached; changed before the next row |
| 2026-11-10 | Property 8 generator coverage (task 4.4) | `<script> \| node --input-type=module -` (stdin; same arbitraries, `fc.assert` with seed 20261108, 500 runs; no file written) | 24.19.0 / 11.17.0 | pass | Exit 0; 500 runs; max length 298; 34 empty; 155 longer than 100; 245 with a repeated pixel; boundary x {0, 7, 8, 255} and y {0, 159} all generated |
| 2026-11-10 | Property tests (task 4.4) | `npm run test:pbt`; `npx vitest run tests/properties --reporter=verbose` | 24.19.0 / 11.17.0 | pass | Both exit 0; 1 file, 1 test passed: `tests/properties/raster.property.test.ts > bitmap codec (raster.property) > Property 8: matches an independent pixel array` (773 ms in the verbose run). Seed 20261108, 500 runs; `FC_RUNS`, `FC_SEED`, `FC_PATH` unset. No counterexample |
| 2026-11-10 | Type-check (task 4.4) | `npm run typecheck` | 24.19.0 / 11.17.0 (deno 2.9.6) | pass | Exit 0; all three `tsc` projects passed (the node project includes `tests/**/*.ts`); `check-domain-imports: 3 file(s), 0 finding(s)`; `check-edge: Deno 2.9.6`, `Checked 0 entry point(s)` |
| 2026-11-10 | Tracked-file secret check (Req 4.17), before the tasks 4.1–4.4 commit | `npm run check:tracked` | 24.19.0 / 11.17.0 (git 2.55.0.windows.3) | pass | Exit 0; `Exempted 1 public default value(s) from supabase/functions/.env.example`; `Scanned 52 tracked file(s); 0 finding(s)` (includes the 8 staged paths). `git ls-files .my_env` printed nothing |
