# Implementation Plan: 01-responsive-authoring

## Overview

This plan builds the NecroCard repository scaffold and the browser-only authoring loop in TypeScript (React 19, Vite 8, zod 4, Vitest 5, fast-check 4, Playwright 1.65), following `design.md`. Work runs in this order: scaffold, Git and first push, a checkpoint, the pure domain (`src/domain/`), the input state machines (`src/input/`), the app layer (`src/app/`), export/import, drafts, showcase, browser tests, showcase content and evidence.

Owners: **A** for UI, input and styles; **B** for domain, tooling and deploy. Goal: a working demo first, polish second.

Local constraints that apply to every task:

- No Docker on this machine. Backend checks stay "not run" or run on the hosted dev project or in CI.
- Installed Node 24.19.0 and npm 11.17.0, while the pins are Node 24.22.2 and npm 12.2.2. Record the versions used with every check.
- Playwright uses the installed Google Chrome (`channel: "chrome"`). WebKit and Firefox are "not run" locally.
- Create no `.kiro/hooks/` before task 9; task 9 adds `core-checks.json` (Req 24).
- Never put a value from `../.my_env` into any tracked file, document or log.
- Record every executed check in `docs/decisions.md` as pass, fail or not run with a reason. Never record an unrun check as pass.

## Tasks

- [x] 1. Repository scaffold (Owner B)
  - [x] 1.1 Create the folder structure, package manifest and TypeScript projects
    - In `NC_Codebase/`, create `src/domain/`, `src/input/`, `src/app/`, `src/styles/`, `src/lib/`, `public/`, `scripts/lib/`, `supabase/functions/`, `docs/`, `tests/unit/`, `tests/properties/`, `tests/e2e/`
    - Write `package.json` with the exact dependency and devDependency pins of Req 1.1 (bare `MAJOR.MINOR.PATCH`, no other packages), `engines.node` 24.22.2, `packageManager` `npm@12.2.2`, `type` module, `private` true, `license` MIT
    - Define the scripts from the design's package.json table that are marked "Defined", except `test:e2e:smoke`, which is added in 21.3 because its spec file does not exist yet (Req 1.7). Leave out `test:integration`, `verify`, `check:submission` and `dev:backend`
    - Write `.nvmrc` (`24.22.2`) and `.npmrc` (`save-exact=true`)
    - Write `tsconfig.app.json`, `tsconfig.domain.json` and `tsconfig.node.json` with the options in the design's TypeScript projects table. Give `tsconfig.node.json` `allowJs: true` and include `scripts/**/*.mjs` so `vite.config.ts` and tests can import the `.mjs` helpers under `strict`
    - Create `src/domain/ids.ts` (`Id`, `UUID_TEXT`, `IdSource`) so the domain project has an input file and `tsc` does not stop with "No inputs were found"
    - Create `tests/properties/fc-options.ts` exactly as in the design's Testing Strategy
    - _Requirements: 1.1, 1.2, 1.3, 1.7, 3.1, 3.2_

  - [x] 1.2 Create the Vite config, headers plugin, entry page and minimal blank shell
    - Write `scripts/lib/csp.mjs` with `buildCsp(url)`: fixed directive order, `https://<host>` and `wss://<host>` from an HTTPS `VITE_SUPABASE_URL` (path, query and fragment dropped), otherwise `connect-src 'self'` plus a warning naming `VITE_SUPABASE_URL`
    - Write `vite.config.ts` with `@vitejs/plugin-react`, the `necrocardHeaders()` plugin (emit `_headers` with the CSP for `/*`; gzip level 9 each initial JS file, print sizes and total, `this.error` above 358,400 bytes) and a Vitest `test` block with the Node environment
    - Write `index.html` with the viewport meta from the design (`width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content`), `<script src="/theme-init.js"></script>` in `<head>` and `/src/main.tsx` as a module
    - Write `public/theme-init.js` exactly as in the design
    - Write `src/main.tsx` that renders a minimal placeholder shell (heading "NecroCard" and an empty main region); task 15 replaces it
    - Write `src/lib/supabase.ts` with `readPublicConfig()` from `import.meta.env` only, without importing `@supabase/supabase-js`
    - _Requirements: 3.8, 3.12, 4.3, 4.4, 4.5, 17.9_

  - [x] 1.3 Create hosting, environment and Supabase configuration files
    - Write `netlify.toml` verbatim from blueprint §4.3
    - Write `.gitignore` with the fifteen §4.1 entries in blueprint order, then `.my_env` and `/memory/`; no entry may match `.kiro`
    - Write `.env.example` with `VITE_SUPABASE_URL=` and `VITE_SUPABASE_PUBLISHABLE_KEY=` only
    - Write `supabase/functions/.env.example` with the six §4.4 names; values empty except the public defaults `NEBIUS_MODEL=Qwen/Qwen3-30B-A3B-Instruct-2507`, `NEBIUS_BASE_URL=https://api.tokenfactory.nebius.com/v1/` and `AI_APP_CAP_MICROUSD=8500000`
    - Write `supabase/functions/deno.json` with `compilerOptions.strict: true` and `npm:` imports for `@supabase/supabase-js`, `@modelcontextprotocol/client`, `@modelcontextprotocol/server` and `zod` at the Req 1.1 versions
    - Write `supabase/config.toml` with `project_id` only; the blueprint function entries are added by the spec that creates each function (record this in `docs/decisions.md` in 1.6)
    - _Requirements: 1.5, 4.2, 4.6, 4.7, 4.8_

  - [x] 1.4 Write LICENSE and README
    - `LICENSE`: standard MIT text with the line `Copyright (c) 2026 Blantara Tech`
    - `README.md`: product description; Node 24.22.2 and npm 12.2.2 as prerequisites; Docker optional and not required here; install command; `npm run dev`, `typecheck`, `build`, `check:bundle`; hosted dev workflow (`supabase link`, `supabase db push`, `supabase functions deploy --use-api`); `dev:backend` needs Docker and is pending or CI-only; a "Blocked items" section with each item and reason
    - _Requirements: 4.11, 4.12_

  - [x] 1.5 Create the Kiro steering, agent and power files
    - Copy `NECROCARD_BLUEPRINT_v2.md` to the repository root
    - Create `.kiro/steering/product.md`, `runtime-safety.md`, `release-review.md` and `ai-mobile.md` from blueprint §3.3 and §3.8 blocks; append the "Project continuity" block from `NECROCARD_KIRO_MEMORY_GUIDE.md` §2 to the end of `product.md`
    - Create `.kiro/agents/runtime-engineer.json` and `.kiro/agents/runtime-reviewer.json` from §3.5
    - Create `powers/safe-card-runtime/plugin.json` and `powers/safe-card-runtime/skills/verify-runtime/SKILL.md` from §3.7
    - Use LF line endings and no trailing whitespace; create nothing under `.kiro/hooks/`
    - _Requirements: 4.13, 4.14, 4.15, 4.18_

  - [x] 1.6 Create the docs stubs
    - `docs/decisions.md` with dated entries for: toolchain mismatch (installed 24.19.0 / 11.17.0 vs pinned 24.22.2 / 12.2.2); Docker policy and the docker-free path with the four Day 1 gate checks (migration, anonymous session, authenticated Edge call, MCP handshake), each with venue and result "not run"; Kiro hooks deferred by user decision and the condition to add them; `.kiro/settings/mcp.json` deferred and the `runtime-engineer` MCP tool gap; pending scripts with command text and missing file or tool (`test:integration`, `verify`, `check:submission`, `dev:backend`, and `test:e2e:smoke` until 21.3); extra paths outside blueprint §4.1/§4.2 and why; `supabase/config.toml` function entries deferred; the `noReferences` gap with its two rules; the placeholder interpreter gap; the two-layer Nebius check; the light-theme success/danger and cursor-ring colours as "contrast checked and approved by the team (user-reported, 2026-11-09)"; the Playwright browser choice; the preview-server e2e setup
    - `docs/kiro-evidence.md` with the table header `| date | requirement | Kiro feature | artifact/commit | check/result | consequence |`
    - _Requirements: 1.8, 2.1, 2.2, 2.3, 2.5, 2.6, 4.1, 4.16, 4.18_

  - [x] 1.7 Write the check scripts
    - `scripts/check-domain-imports.mjs`: allow only `zod` and relative paths inside `src/domain/`; flag `localStorage`, `sessionStorage`, `indexedDB`; print `path:line: forbidden import '<spec>'`; exit 1 on findings
    - `scripts/check-edge.mjs`: require `deno 2.9.6` (exit 1 naming the expected and found version); check each `supabase/functions/*/index.ts` (skip `_shared`) with `deno check --config supabase/functions/deno.json`; print `Checked N entry point(s)`; name every failing file; exit non-zero after all files if any failed; `shell: true` on Windows
    - `scripts/lib/secretPatterns.mjs` and `scripts/check-bundle-secrets.mjs` with the four patterns in the design table, including the two-layer Nebius check and the "not run" message when `NEBIUS_API_KEY` is unavailable; exit 2 on missing or empty `dist/`, exit 1 on findings; print path and pattern name only, then the finding count
    - `scripts/check-tracked-secrets.mjs`: read `.my_env` from `NECROCARD_MY_ENV`, `../.my_env` or `./.my_env`; fail if `.my_env` is tracked or a tracked file contains a value of 8 or more characters; print only `<path>: value of <KEY>`; print `SKIPPED: .my_env not found` and exit 0 when absent
    - _Requirements: 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.9, 3.10, 3.11, 4.17_

  - [ ]* 1.8 Write property test for the CSP builder
    - **Property 25: CSP is built correctly from any Supabase URL**
    - **Validates: Requirements 4.3, 4.4, 4.5**
    - File: `tests/properties/csp.property.test.ts`

  - [ ]* 1.9 Write property test for the secret scanner
    - **Property 26: The secret scanner finds planted secrets and never prints them**
    - **Validates: Requirements 3.9, 3.11**
    - File: `tests/properties/secrets.property.test.ts`; use synthetic secrets only

  - [ ]* 1.10 Write scaffold unit tests
    - `tests/unit/scaffold.test.ts`: package pins, engines and scripts; lockfile versions; `tsconfig.app.json` options; both `.env.example` files; `.gitignore` entries; LICENSE text; steering, agent and power files equal the normalized blueprint blocks; evidence table header; no `.kiro/hooks/`
    - Script tests: `check-domain-imports` on fixture sources, the Deno version parser, `check-edge` with zero entry points and with a fixture containing a type error, `check-bundle-secrets` exit codes on missing, empty and seeded temporary directories
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.7, 3.1, 3.3, 3.5, 3.6, 3.7, 3.10, 4.6, 4.7, 4.8, 4.11, 4.13, 4.14, 4.15, 4.16, 4.18_

  - [x] 1.11 Verify the scaffold and record results
    - Run `npm install` to generate `package-lock.json`; confirm the lockfile resolves every Req 1.1 package to its pinned version and no other lockfile exists. Record EBADENGINE warnings and the installed versions
    - Run `npm run typecheck`, `npm run build` (record the printed initial-JS gzip sizes and total, and the `VITE_SUPABASE_URL` warning), `npm run check:bundle` and `npm run check:edge` (record the Deno version and `Checked 0 entry point(s)`)
    - Run `git check-ignore --no-index` for the Req 4.9 and Req 4.10 path lists without creating `.git` in `NC_Codebase`: `git init --bare "$env:TEMP\nc-ignore-check"`, then `git --git-dir="$env:TEMP\nc-ignore-check" --work-tree=. check-ignore --no-index <paths>`. Delete the temporary bare repository afterwards
    - If 1.8–1.10 were implemented, run `npm run test:unit` and `npm run test:pbt`; otherwise record them as "not run (no test files yet)"
    - Record `npm ci` with Node 24.22.2 / npm 12.2.2 as "not run (pinned toolchain not installed)" and `check:tracked` as "not run (no Git repository yet; runs in 2.2)"
    - Append one entry per check to `docs/decisions.md`: command, Node/npm (and Deno) versions, date, result pass/fail/not run with reason
    - _Requirements: 1.4, 1.6, 2.1, 2.4, 2.5, 2.6, 3.4, 3.5, 3.8, 3.9, 3.12, 4.5, 4.9, 4.10_

- [x] 2. Git setup and first push (Owner B)
  - [x] 2.1 Initialise the repository and remote
    - In `NC_Codebase/`: `git init`, `git switch -c main` (or `git branch -M main`), `git remote add origin https://github.com/blantaratech/NecroCard.git`
    - Do not change Git config. If `user.name` or `user.email` is not set, stop and ask the user
    - Re-run the Req 4.9 and 4.10 `git check-ignore --no-index` lists inside the real repository and append the result to `docs/decisions.md`
    - _Requirements: 4.8, 4.9, 4.10, 2.4_

  - [x] 2.2 Verify that no secrets are staged
    - Stage the scaffold, then review `git ls-files --cached` (or `git diff --cached --name-only`): no `.my_env`, `memory/`, `.env`, `.env.*` other than the two examples, `supabase/functions/.env.local`, `node_modules/` or `dist/`
    - Run `npm run check:tracked` and confirm `git ls-files .my_env` prints nothing. Unstage and fix any finding before continuing
    - Append the `check:tracked` result to `docs/decisions.md` and stage it
    - _Requirements: 4.17, 2.4_

  - [x] 2.3 Make the initial commit and push
    - Create one clean initial commit of the scaffold
    - Run `git ls-remote origin`. If the remote has commits, run `git pull --rebase origin main` first and resolve conflicts without discarding scaffold files (the remote was empty when checked on 2026-11-09)
    - Run `git push -u origin main`. Never force push. If authentication fails, stop and ask the user
    - Note the commit hash and push result for 3.1
    - _Requirements: 1.4, 4.17_

- [x] 3. Checkpoint - Record the Resume note and push
  - [x] 3.1 Add the initial Resume note
    - Append a `## Resume` section at the end of this `tasks.md` with five bullets per `NECROCARD_KIRO_MEMORY_GUIDE.md` §3: task and owner (task 3, Owner B, date MYT); working state (branch `main`, commit hash from 2.3, local changes); last verified check (command and result); blocker (or none); next action (task 4.1, `src/domain/limits.ts`)
    - Append the push result to `docs/decisions.md`
    - _Requirements: 2.4, 2.6_

  - [x] 3.2 Commit and push the checkpoint
    - Commit `tasks.md` and `docs/decisions.md`, then `git push` (no force)
    - Ensure all checks recorded so far are listed with one current result; ask the user if questions arise
    - _Requirements: 2.6_

- [x] 4. Domain limits and bitmap codec (Owner B)
  - [x] 4.1 Implement `src/domain/limits.ts`
    - `LIMITS` constants, `utf8ByteLength` (lone surrogates count 3), `codePointLength`, and the name rule helper (1–64 code points, not whitespace-only)
    - _Requirements: 6.4, 6.7, 12.5_

  - [ ]* 4.2 Write unit tests for limits
    - `tests/unit/limits.test.ts`: ASCII, multi-byte, astral and lone-surrogate byte counts against `Buffer.byteLength`; name rule edges (0, 1, 64, 65 code points, whitespace-only)
    - _Requirements: 6.4, 6.7_

  - [x] 4.3 Implement the bitmap codec in `src/domain/bitmap.ts`
    - `createBitmap`, `getPixel`, `setPixel` (copy on write, error on non-integer or out-of-range coordinate or value), table-driven `encodeBitmap` and `decodeBitmap` with the 6,828-character, single `=` and unused-bits checks before allocating output
    - _Requirements: 6.2, 8.1, 8.2, 8.3, 8.5, 8.6, 8.7_

  - [x] 4.4 Write property test for the bitmap codec oracle
    - **Property 8: The bitmap codec matches an independent pixel array** (blueprint P3)
    - **Validates: Requirements 8.1, 8.2, 8.3, 8.4**
    - File: `tests/properties/raster.property.test.ts`; include coordinates 0, 7, 8, 255 and 159

  - [ ]* 4.5 Write property test for codec rejection
    - **Property 9: The codec rejects invalid input without partial effect**
    - **Validates: Requirements 8.5, 8.6, 8.7**
    - File: `tests/properties/raster.property.test.ts`

- [x] 5. Canonical form and schema validator (Owner B)
  - [x] 5.1 Define the zod schemas and document types in `src/domain/schema.ts`
    - `z.strictObject` for every object, literals for `format` and `schemaVersion`, integer geometry, `discriminatedUnion("kind")` for widgets, `UUID_TEXT` IDs, `z.record` for `cards`; export `StackDocument`, `Card`, `Widget`, `Diagnostic`, `DiagnosticCode`, `Path`, `Validation`
    - _Requirements: 6.1, 6.2, 6.3, 6.5, 6.10_

  - [x] 5.2 Implement `canonicalize` in `src/domain/canonical.ts`
    - Schema key order, `cards` keys sorted by UTF-16 code units, widget arrays in order, 2-space indent, LF, one trailing newline, no BOM
    - _Requirements: 20.1, 20.7_

  - [x] 5.3 Implement `validateStack` in `src/domain/schema.ts`
    - Structural pre-pass (iterative; non-finite numbers, `__proto__`/`constructor`/`prototype` keys, depth over 8), zod parse mapped to diagnostics, semantic checks (cardOrder permutation, id equals key, card and widget counts, geometry bounds, bitmap decode, names and title, unique names, unique lowercased IDs, source bytes, canonical size); limit diagnostics carry `measured` and `max`; deterministic diagnostic order; never mutates the candidate
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.10, 6.11_

  - [x] 5.4 Create shared test generators in `tests/properties/arbitraries.ts`
    - Valid-document generator (1–20 cards, 0–40 widgets, names of 1–64 code points including astral and combining characters, in-card geometry, random and boundary bitmaps, biased toward small sizes), a deterministic `IdSource` counter, and a fault injector that records the injected path
    - _Requirements: 6.1, 6.2, 6.3_

  - [ ]* 5.5 Write property test for Canonical_Form
    - **Property 5: Canonical_Form depends only on document meaning**
    - **Validates: Requirements 20.1, 20.7**
    - File: `tests/properties/canonical.property.test.ts`

  - [ ]* 5.6 Write property test for validator acceptance and purity
    - **Property 3: The validator accepts valid documents and is pure**
    - **Validates: Requirements 6.1, 6.2, 6.3, 6.11**
    - File: `tests/properties/schema.property.test.ts`

  - [ ]* 5.7 Write property test for validator fault rejection
    - **Property 4: The validator rejects every injected fault with its path**
    - **Validates: Requirements 6.4, 6.5, 6.6, 6.7, 6.10**
    - File: `tests/properties/schema.property.test.ts`

  - [ ]* 5.8 Write unit tests for exact limits
    - `tests/unit/schema.test.ts`: 20 cards, 40 widgets, an 8,192-byte source and a document whose Canonical_Form is exactly 1,048,576 bytes are accepted; one more is rejected with `measured` and `max`
    - _Requirements: 6.4_

- [x] 6. Raster and dither (Owner B)
  - [x] 6.1 Implement `linePixels` and `applyPolyline` in `src/domain/raster.ts`
    - Integer Bresenham with the design's tie rule; polyline applies the first sample, then each segment in arrival order; out-of-range pixels skipped, in-range pixels of the same segment written
    - _Requirements: 9.1, 9.2, 9.4_

  - [ ]* 6.2 Write property test for the line rasterizer
    - **Property 10: Line rasterizer shape**
    - **Validates: Requirements 9.1, 9.2**
    - File: `tests/properties/line.property.test.ts`

  - [x] 6.3 Implement `fillRegion` and `src/domain/dither.ts`
    - Iterative 4-connected fill with `visited` marked at push time (stack bounded at 40,960); `BAYER4`, `DITHER_LEVEL = 6`, `ditherPattern(x, y)`
    - _Requirements: 10.1, 10.4_

- [ ] 7. Editor reducer (Owner B)
  - [ ] 7.1 Implement the editor core and card actions in `src/domain/editor.ts`
    - `EditAction` union, `EditorContext`, `EditResult`, `applyAction` contract (candidate, noop check, `validateStack`, applied or rejected), `createBlankStack`, `forkStack`
    - Card actions `card/add`, `card/rename`, `card/move`, `card/delete` with "Card N" defaults, `last-card`, `referenced` (listing every referencing `{cardId, widgetId}`), `card-limit` and name diagnostics; move at the ends is a noop
    - Pure helper for the current card after delete (follower, else predecessor)
    - _Requirements: 5.5, 5.6, 6.8, 6.9, 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 7.10, 7.11, 7.12_

  - [ ] 7.2 Write property test for card authoring invariants
    - **Property 1: Card authoring invariants** (blueprint P1)
    - **Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 7.10, 7.11, 7.12**
    - File: `tests/properties/cards.property.test.ts`; generate a Reference_Index that reports random references

  - [ ] 7.3 Implement widget actions in `src/domain/editor.ts`
    - `widget/add` (defaults from the design table, smallest free "Button N"/"Field N", `widget-limit`), `widget/update` (verbatim text, `source-too-large` with measured bytes, name rules, `document-too-large`), `widget/move` and `widget/resize` (clamped, zero change is noop), `widget/setGeometry` (`geometry-range` with field and range), `widget/delete` (reference-guarded)
    - _Requirements: 6.8, 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7, 12.8, 12.9, 13.1, 13.2, 13.3, 13.4, 13.5, 13.8, 13.9_

  - [ ]* 7.4 Write property test for verbatim widget text
    - **Property 7: Widget text is stored verbatim**
    - **Validates: Requirements 12.3, 12.4, 12.5**
    - File: `tests/properties/widget-text.property.test.ts`

  - [ ]* 7.5 Write property test for widget geometry
    - **Property 15: Widget geometry is clamped or rejected exactly**
    - **Validates: Requirements 13.1, 13.2, 13.3, 13.4, 13.5, 13.8, 13.9**
    - File: `tests/properties/geometry.property.test.ts`

  - [ ] 7.6 Implement `stroke/commit` and `fill/apply` in `src/domain/editor.ts`
    - Stroke: reject non-integer samples or |v| > 4,096; decode the card bitmap, `applyPolyline` with 1 (Pencil) or 0 (Eraser), noop if no pixel changed
    - Fill: noop if the tap is outside 0–255 × 0–159 or no region pixel would change; otherwise set region pixels to `ditherPattern`
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.8, 9.10, 10.1, 10.2, 10.3, 10.5, 10.7_

  - [ ]* 7.7 Write property test for stroke locality and history
    - **Property 11: Stroke locality, bounds and history**
    - **Validates: Requirements 9.3, 9.4, 9.5, 9.8, 9.10**
    - File: `tests/properties/line.property.test.ts`

  - [ ]* 7.8 Write property test for Dither_Fill
    - **Property 12: Dither_Fill region, pattern, locality and determinism**
    - **Validates: Requirements 10.1, 10.2, 10.3, 10.7**
    - File: `tests/properties/fill.property.test.ts`

  - [ ]* 7.9 Write property test for dither alignment
    - **Property 13: The dither pattern aligns across fill sequences**
    - **Validates: Requirements 10.4**
    - File: `tests/properties/fill.property.test.ts`

  - [ ]* 7.10 Write property test for editor validity
    - **Property 2: Editor actions preserve schema validity and rejections change nothing**
    - **Validates: Requirements 6.8, 6.9, 12.1, 12.7, 12.8, 13.5**
    - File: `tests/properties/editor-validity.property.test.ts`

- [ ] 8. Edit history (Owner B)
  - [ ] 8.1 Implement `src/domain/history.ts`
    - `emptyHistory`, `commit` (cap 50, clears redo), `undo`, `redo` returning `null` on empty stacks
    - _Requirements: 10.5, 10.6, 11.1, 11.2, 11.3, 11.4, 11.5, 11.9, 11.10_

  - [ ]* 8.2 Write property test for undo and redo
    - **Property 14: Undo and redo match a snapshot history model**
    - **Validates: Requirements 10.5, 10.6, 11.1, 11.2, 11.3, 11.4, 11.5, 11.9, 11.10**
    - File: `tests/properties/history.property.test.ts`

  - [ ]* 8.3 Write unit tests for history edges
    - `tests/unit/history.test.ts`: depth 51 → 50, undo and redo on empty stacks return `null`
    - _Requirements: 11.5, 11.9_

- [ ] 9. Checkpoint - Domain complete
  - [ ] 9.1 Run the core checks and record the result
    - Run `npm run check:core` (typecheck including the domain import check, unit and property tests). Ensure all tests pass, ask the user if questions arise
    - Record the command, Node/npm/Deno versions, date, result and duration in `docs/decisions.md`
    - _Requirements: 2.4, 2.6_

  - [ ] 9.2 Add `.kiro/hooks/core-checks.json`
    - Write the file per the design's Kiro hooks section: `version` "v1", the two hooks "Type safety after source edits" (`PostFileSave`, Windows-safe matcher, `npm run typecheck`) and "Core invariants at turn end" (`Stop`, `npm run check:core`)
    - First time `npm run typecheck` and `npm run check:core` locally, 3 runs each; every run must exit 0. Record each time and the median in `docs/decisions.md`, then set the timeouts (30 and 60 unless a measured run is longer; if so, narrow the hook or raise the timeout and record why)
    - Verify the matcher against sample Windows and POSIX paths: matches `src/domain/bitmap.ts`, `src\app\AppShell.tsx`, `supabase/functions/ai/index.ts`, `C:\repo\supabase\functions\ai\index.ts`; does not match `src/styles/app.css`, `src/domain/bitmap.ts.bak`, `tests/unit/limits.test.ts`, `scripts/check-edge.mjs`, `vite.config.ts`
    - Keep both commands read-only: no source, docs or evidence writes
    - _Requirements: 2.3, 24.1, 24.2, 24.3, 24.4, 24.5, 24.6, 24.7, 24.8, 24.9_

  - [ ] 9.3 Observe the hooks in the Kiro IDE
    - This step may need the user to perform the save and the agent turn in the IDE; ask the user to do so, with `NC_Codebase/` open as the workspace folder
    - Save one `src/domain/*.ts` file and complete one agent turn
    - Record each observation in `docs/kiro-evidence.md`: date, trigger, command, exit result and duration. Record the Kiro IDE version in `docs/decisions.md`
    - If a hook did not fire, record "not observed" with the IDE version (never "pass") and ask the user how to proceed
    - _Requirements: 24.10, 24.11, 24.12, 24.13_

  - [ ] 9.4 Record the checkpoint, commit and push
    - Add a dated "hooks added" entry to `docs/decisions.md` (the deferral entry stays unchanged) and Verification log rows for 9.1–9.3
    - Refresh the Resume note at the end of this file
    - Review `git status`, then stage by path the domain code and tests from tasks 4–8 (`src/domain/`, `tests/`), `.kiro/hooks/core-checks.json`, `docs/decisions.md`, `docs/kiro-evidence.md` and this `tasks.md`; run `npm run check:tracked`; commit and `git push` (no force)
    - _Requirements: 2.3, 2.4, 2.6, 4.17, 24.8, 24.13_

- [ ] 10. Input state machines (Owner A)
  - [x] 10.1 Implement `src/input/pointerMapper.ts`
    - `logicalPoint` with the blueprint §2.7 formula, clamping, and an invalid-geometry error for non-finite inputs or non-positive size
    - _Requirements: 14.1, 14.2, 14.4_

  - [ ] 10.2 Write property test for pointer mapping
    - **Property 16: Pointer mapping is bounded and scale-invariant** (blueprint P10)
    - **Validates: Requirements 14.1, 14.2, 14.3, 14.4**
    - File: `tests/properties/pointer.property.test.ts`

  - [ ] 10.3 Implement the pointer gate in `src/input/pointerStroke.ts`
    - `stepPointerGate` per the design's gate table: one active pointer, ignored set for the whole contact, primary mouse button only, no start while Draw is disabled or a keyboard Stroke is active, cancel maps to discard
    - _Requirements: 9.6, 9.9, 13.6, 13.10, 14.6, 14.7, 14.15, 14.16, 23.19_

  - [ ]* 10.4 Write property test for the pointer gate
    - **Property 17: Only the first eligible pointer draws**
    - **Validates: Requirements 9.6, 9.9, 13.6, 13.10, 14.7, 14.15, 14.16, 23.19**
    - File: `tests/properties/pointer.property.test.ts`

  - [ ] 10.5 Implement the Keyboard_Cursor in `src/input/keyboardCursor.ts`
    - `stepKeyboard` per the design's key table: start (128, 80), per-card restore, 1 and 8 px clamped moves, Space pixel or fill, Enter pen down and up, Escape discard, auto-repeat ignored for Space/Enter/Escape, Ctrl/Alt/Meta arrows not handled, blur and `forceEnd` commit, no keyboard start during a pointer Stroke
    - _Requirements: 23.4, 23.5, 23.7, 23.8, 23.11, 23.12, 23.13, 23.14, 23.15, 23.16, 23.18, 23.21, 23.22, 23.23_

  - [ ] 10.6 Write property test for keyboard and pointer stroke equivalence
    - **Property 20: Keyboard and pointer strokes are equivalent**
    - **Validates: Requirements 23.11, 23.13, 23.14, 23.15, 23.20**
    - File: `tests/properties/keyboard.property.test.ts`; dispatch both sample lists through `applyAction` and `commit`

  - [ ]* 10.7 Write property test for cursor movement and no-op keys
    - **Property 21: Keyboard cursor movement and no-op keys**
    - **Validates: Requirements 23.5, 23.7, 23.8, 23.9, 23.16, 23.18, 23.21, 23.22, 23.23**
    - File: `tests/properties/keyboard.property.test.ts`

  - [ ]* 10.8 Write unit tests for keyboard examples
    - `tests/unit/keyboardCursor.test.ts`: first focus at (128, 80); Space with Dither_Fill emits `fill`
    - _Requirements: 23.4, 23.12_

- [ ] 11. Session, ports and styles (Owner A)
  - [ ] 11.1 Implement `src/app/ports.ts` and `src/app/session.ts`
    - `noReferences` and `placeholderInterpreter` ports
    - Session reducer: open document (history reset on every open path), apply editor actions (commit only on `applied`), undo/redo, selection, tool, Draw/Pan, zoom, mode switch (play state cleared on exit, same `doc` restored), inspector draft, panel collapse, messages; refuse `card/delete` and `widget/delete` and Edit_Mode entry while `source === "showcase"`; current card after add and delete
    - _Requirements: 6.10, 7.12, 11.11, 15.8, 22.2, 22.6, 22.7, 22.9_

  - [ ] 11.2 Write property test for document isolation from session state
    - **Property 18: Presentation and session state never change the document** (blueprint P13)
    - **Validates: Requirements 6.10, 15.8, 17.7, 22.6, 22.7, 23.6**
    - File: `tests/properties/session.property.test.ts`

  - [ ]* 11.3 Write unit tests for the session reducer
    - `tests/unit/session.test.ts`: history reset on new, import, fork, showcase and draft open; Play_Mode button press calls the interpreter port and never the editor; showcase delete and edit refused
    - _Requirements: 11.11, 22.2, 22.9_

  - [ ] 11.4 Implement `src/app/viewport.ts`, `src/styles/tokens.css` and `src/styles/app.css`
    - `PHONE_MAX = 767`, `TABLET_MAX = 1199`, `useViewportClass()` with `matchMedia` listeners
    - Tokens: dark §1.5 and light §4.2 values plus raised, success and danger (light `--success: #1E6B32`, `--danger: #B3123A`); fixed paper `#FFFFFF` and ink `#121416`; no CSS filter
    - Layout grids for Phone, Tablet and Desktop; fixed bottom dock with safe-area padding and `scroll-padding-bottom`; 3rem minimum targets with 0.25rem gaps; 1rem input font; `:focus-visible` 3px outline; `touch-action: none` only on `.canvas-surface[data-mode="draw"]`; `image-rendering: pixelated`; reduced-motion block; lantern glow (3 iterations of 1.6 s, `aria-hidden`, `pointer-events: none`); 150 ms functional transitions
    - _Requirements: 14.8, 14.13, 15.1, 15.3, 15.4, 15.7, 16.1, 16.2, 16.3, 17.8, 17.10, 17.12, 18.1, 18.2, 18.4, 18.5, 18.6, 18.7, 18.8, 18.9, 19.2_

  - [ ]* 11.5 Write unit tests for styles
    - `tests/unit/styles.test.ts`: breakpoint constants match `app.css` media queries; WCAG contrast of the listed token pairs in both themes and of `#C2185B` against paper and ink
    - _Requirements: 17.11, 19.2, 23.1_

- [ ] 12. Theme and shell components (Owner A)
  - [ ] 12.1 Implement `src/app/theme.ts` and `src/app/ThemeControl.tsx`
    - Pure resolver identical to `public/theme-init.js`; guarded `setItem`, in-memory fallback; `prefers-color-scheme` listener only while System; Dark/Light/System radio group; update `data-theme` and `data-theme-preference`
    - _Requirements: 17.1, 17.2, 17.3, 17.4, 17.5, 17.6, 17.9, 17.13, 17.14_

  - [ ]* 12.2 Write property test for theme resolution
    - **Property 19: Theme resolution falls back to Dark**
    - **Validates: Requirements 17.6, 17.13**
    - File: `tests/properties/theme.property.test.ts`

  - [ ] 12.3 Implement `StatusRegion.tsx`, `CardStrip.tsx` and `ToolDock.tsx`
    - StatusRegion: mode, tool, draft-state, cursor and pen labels; polite `role="status"` live region
    - CardStrip: horizontal strip or vertical navigator from one component; add, rename, move earlier/later (disabled at the ends), delete; accessible names
    - ToolDock: Pencil, Eraser, Dither fill, Draw/Pan, zoom 1×/2×/4× with `aria-pressed`; Undo and Redo disabled with a non-colour cue; add Button/Field; overflow entry for export and import
    - _Requirements: 5.2, 7.9, 7.11, 11.6, 11.7, 14.11, 14.12, 19.1, 19.9, 19.10, 19.12_

  - [ ] 12.4 Implement `src/app/SheetOrPanel.tsx`
    - Phone: `<dialog>` with `showModal()`, focus moved in, Tab wrap, `cancel` routed to Cancel, focus returned to the opener or the Req 19.11 fallback; fixed header and footer with scrolling body; `max-height: 85dvh`; `visualViewport` listener setting `--kb-inset` and `scrollIntoView` 150 ms after the last resize
    - Tablet/Desktop: non-modal `<aside aria-labelledby>` with the same markup
    - _Requirements: 15.2, 15.10, 15.12, 16.3, 16.4, 16.5, 16.6, 16.7, 19.5, 19.6, 19.7, 19.8_

- [ ] 13. Canvas view (Owner A)
  - [ ] 13.1 Implement rendering and the widget overlay in `src/app/CanvasView.tsx`
    - 256 × 160 `<canvas>` with `ImageData`; scale `fit × zoom` from a `ResizeObserver`; widget overlay in the same box positioned through the `style` prop; Canvas_View region scrolls its own overflow
    - _Requirements: 5.1, 13.7, 14.13, 15.7_

  - [ ] 13.2 Add the pointer drawing adapter to `CanvasView.tsx`
    - Feed events through `stepPointerGate`; `setPointerCapture`; re-read `getBoundingClientRect()` on every sample; working-bitmap preview with `putImageData`; dispatch `stroke/commit` or `fill/apply` on commit; restore from the document on discard; drop invalid-geometry samples; `data-mode` draw/pan
    - _Requirements: 9.6, 9.7, 9.8, 9.9, 10.1, 14.5, 14.6, 14.7, 14.8, 14.9, 14.10, 14.14, 14.15, 14.16_

  - [ ] 13.3 Add the keyboard drawing adapter to `CanvasView.tsx`
    - Focusable surface (`tabIndex=0`, `role="application"`, accessible name and key help); Keyboard_Cursor state in a `useRef`; `preventDefault` on handled keys; `#C2185B` 2px cursor ring on an overlay layer; cursor and pen labels to StatusRegion; imperative `endKeyboardStroke()`; blur and `visibilitychange` commit
    - _Requirements: 19.4, 23.1, 23.2, 23.3, 23.6, 23.7, 23.8, 23.11, 23.17, 23.18_

  - [ ] 13.4 Add widget selection, drag, resize and keyboard placement to `CanvasView.tsx`
    - Select on tap; body drag dispatches one `widget/move`, handle drag one `widget/resize` at pointer-up through the pointer gate; nothing on cancel; arrows nudge and Shift+arrows resize on the overlay only, without page scroll
    - _Requirements: 13.1, 13.2, 13.6, 13.8, 13.9, 13.10, 23.9, 23.10_

- [ ] 14. Widget inspector (Owner A)
  - [ ] 14.1 Implement `src/app/WidgetInspector.tsx`
    - Name, label/text, source and x/y/width/height inputs held in `inspectorDraft`; Apply dispatches one action per changed field; Cancel/Escape clears the draft; diagnostics next to each input through `aria-describedby` (byte count, 1 MiB limit, name rule, geometry range); rendered inside `SheetOrPanel`; draft kept across a Viewport_Class change
    - _Requirements: 12.3, 12.4, 12.5, 12.7, 12.8, 12.9, 13.3, 13.4, 15.2, 15.9, 19.12_

- [ ] 15. App shell wiring (Owner A)
  - [ ] 15.1 Implement `src/app/AppShell.tsx` and update `src/main.tsx`
    - Replace the placeholder shell; inject `newId` (`crypto.randomUUID` with a `getRandomValues` v4 fallback), `storage`, `matchMedia`, `interpreter` and `references`
    - Route `/` to a blank stack (drafts added in 18.3); regions in DOM order header → card strip/navigator → canvas → tool dock → panel; Tablet collapse control; rejection messages for last card, references (card and widget names), card limit and names; focus fallback after deletes; top-level error boundary with Export and a reload hint
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 7.5, 7.6, 7.7, 7.10, 7.12, 15.1, 15.3, 15.4, 15.5, 15.6, 15.8, 15.11, 19.3, 19.11_

  - [ ] 15.2 Add Play_Mode rendering to `CanvasView.tsx` and `AppShell.tsx`
    - Edit/Play switch; in Play_Mode render Buttons as native `<button>` (name from label, else widget name) that call the interpreter port, and Fields as read-only text; text content only, never HTML; hide authoring controls; play state in memory only
    - _Requirements: 12.10, 12.11, 22.2, 22.6, 22.7_

- [ ] 16. Checkpoint - Local authoring loop works
  - Run `npm run check:core` and `npm run build`. Ensure all tests pass, ask the user if questions arise. Record results in `docs/decisions.md`, refresh the Resume note, then commit and push (no force).

- [ ] 17. Export and import (Owner B core, Owner A UI)
  - [ ] 17.1 Implement the pure export/import core in `src/app/exportImport.ts`
    - `exportBytes(doc)`: validate first, then UTF-8 bytes of `canonicalize(doc)`; `.json` file name
    - `importFile(file, knownIds, ctx)`: reject over 1,048,576 bytes before reading; read, parse and validate with first-failing-path diagnostics; never call the interpreter; an ID that matches the current document or a stored draft gives a Fork
    - _Requirements: 20.1, 20.3, 20.5, 20.6, 20.9, 20.10_

  - [ ] 17.2 Write property test for the export/import round trip
    - **Property 6: Export/import round trip and export idempotence** (blueprint P2)
    - **Validates: Requirements 20.1, 20.7, 20.8**
    - File: `tests/properties/canonical.property.test.ts`

  - [ ]* 17.3 Write property test for importer rejection
    - **Property 23: The Importer rejects invalid files without changing state**
    - **Validates: Requirements 20.3, 20.5**
    - File: `tests/properties/import.property.test.ts`

  - [ ] 17.4 Wire export and import into the shell
    - Download plus Share (when `navigator.canShare` accepts files), Download kept after a dismissed or failed share; file input for import; open imported documents with empty history; diagnostics in the Status_Region; reachable on Phone through the dock overflow or Sheet
    - _Requirements: 11.11, 15.5, 20.1, 20.2, 20.3, 20.4, 20.5, 20.9, 20.10_

  - [ ]* 17.5 Write unit tests for share fallback
    - `tests/unit/exportImport.test.ts`: a fake `navigator.share` that rejects leaves Download available with the same bytes
    - _Requirements: 20.2_

- [ ] 18. Local drafts (Owner B core, Owner A wiring)
  - [ ] 18.1 Implement `src/app/draftStore.ts`
    - Key `necrocard.draft.v1.<stackId>`, record `{"v":1,"savedAt","document"}`; one `setItem` per save; load the latest valid `savedAt`; a corrupt latest record is left untouched and reported with its raw string
    - _Requirements: 21.2, 21.6, 21.9_

  - [ ]* 18.2 Write property test for the Draft_Store
    - **Property 22: Draft_Store round trip and atomic failure**
    - **Validates: Requirements 21.2, 21.6, 21.9**
    - File: `tests/properties/drafts.property.test.ts`

  - [ ] 18.3 Wire draft saving and loading into `AppShell.tsx`
    - Open the latest draft on `/`; 1-second save timer after an applied commit; flush on `pagehide`, hidden `visibilitychange` and before switching document; labels unsaved/saving → saved locally → local saving unavailable with Export shown and retry on next commit; drafts-unavailable label when storage cannot be read; recovery message with "Export raw draft"; local-drafts notice one activation from the label; keep the previous document's draft on import
    - _Requirements: 5.7, 20.4, 21.1, 21.2, 21.3, 21.4, 21.5, 21.6, 21.7, 21.8_

  - [ ]* 18.4 Write unit tests for draft timing
    - `tests/unit/drafts.test.ts` with fake timers: save within 2 s, label sequence, failure label and retry
    - _Requirements: 21.1, 21.3, 21.4, 21.5, 21.8_

- [ ] 19. Showcase play and fork (Owner A)
  - [ ] 19.1 Implement the `/showcase` route and Fork in `AppShell.tsx`
    - Create a minimal valid `public/showcase.json` placeholder (replaced in 22.1)
    - Fetch and validate; open in Play_Mode on the first card with no sign-in or key prompt; "Showcase unavailable" with "Start a blank stack" on failure; Edit attempt stays in Play_Mode and offers Fork; Fork opens in Edit_Mode, saved through the Draft_Store, with the unavailable label and Export if saving fails
    - _Requirements: 11.11, 22.1, 22.2, 22.3, 22.4, 22.6, 22.7, 22.8, 22.9, 22.10_

  - [ ]* 19.2 Write property test for Fork isolation
    - **Property 24: A Fork changes only the stack ID and isolates its source**
    - **Validates: Requirements 20.10, 22.3, 22.4**
    - File: `tests/properties/fork.property.test.ts`

  - [ ]* 19.3 Write unit tests for showcase guards
    - `tests/unit/showcase.test.ts`: fetch failure and invalid file show the unavailable message and leave drafts unchanged; Fork save failure shows the unavailable label
    - _Requirements: 22.8, 22.10_

- [ ] 20. Checkpoint - Feature complete before browser tests
  - Run `npm run check:core`, `npm run build`, `npm run check:bundle` and `npm run check:tracked`. Ensure all tests pass, ask the user if questions arise. Record results in `docs/decisions.md`, refresh the Resume note, then commit and push (no force).

- [ ] 21. Playwright browser tests (Owner A)
  - [ ] 21.1 Create `playwright.config.ts` and the CSP fixture
    - Seven projects from the design table (`channel: "chrome"` on every Chromium-engine project); `webServer` runs `npm run build && npm run preview` on port 4173
    - `tests/e2e/fixtures.ts`: add the CSP from `dist/_headers` to document responses through `page.route`; fail on any `securitypolicyviolation` event, console error or unhandled rejection
    - _Requirements: 4.3, 5.4, 17.9_

  - [ ] 21.2 Write `tests/e2e/shell.spec.ts`
    - 320 × 568 blank shell without scrolling, no horizontal scroll, layouts per Viewport_Class, layout switch keeps state, 48 px targets, 16 px inputs, Sheet footer visible while scrolling
    - _Requirements: 5.1, 5.3, 5.4, 15.1, 15.3, 15.4, 15.8, 16.1, 16.2, 16.5, 16.6_

  - [ ] 21.3 Write `tests/e2e/judge-path.spec.ts` and add the `test:e2e:smoke` script
    - Fresh context opens `/showcase` with no account prompt, plays, Forks, edits, reloads and finds the Fork draft
    - Add `test:e2e:smoke` to `package.json` and mark it no longer pending in `docs/decisions.md`
    - _Requirements: 1.7, 22.1, 22.3, 22.4, 21.2_

  - [ ]* 21.4 Write `tests/e2e/drawing.spec.ts`
    - Pencil, Eraser, Dither fill, overlay alignment at each zoom, resize mid-stroke, Draw/Pan touch behaviour; measure preview latency at each Zoom_Level
    - _Requirements: 9.7, 10.1, 13.7, 14.5, 14.6, 14.8, 14.9, 14.10, 14.11, 14.12, 14.13_

  - [ ]* 21.5 Write `tests/e2e/keyboard.spec.ts`
    - Tab order, focus visibility, Sheet focus trap and return, keyboard drawing labels and no page scroll
    - _Requirements: 19.2, 19.3, 19.4, 19.5, 19.6, 19.7, 19.8, 23.1, 23.2, 23.3, 23.7, 23.17_

  - [ ]* 21.6 Write `tests/e2e/theme-motion.spec.ts`
    - `emulateMedia` for colour scheme and reduced motion; no theme flash on reload; System follows the OS
    - _Requirements: 17.1, 17.2, 17.4, 17.5, 17.13, 17.14, 18.1, 18.2, 18.4_

  - [ ]* 21.7 Write `tests/e2e/export-import.spec.ts`
    - Export then import gives identical bytes; oversize and invalid files rejected; draft survives a reload
    - _Requirements: 20.1, 20.3, 20.4, 20.5, 20.7, 20.8, 21.2_

  - [ ] 21.8 Run the local browser suite and record results
    - Run `npm run test:e2e:local` (four chrome-channel projects) and record the result, Chrome version and Playwright version in `docs/decisions.md`
    - Record `phone-webkit`, `tablet-webkit` and `desktop-firefox` as "not run (browser not installed)"
    - Create `docs/device-matrix.md` with the reference device, measured preview latency if 21.4 ran, and the physical-device checks (Req 16.3, 16.4, 16.7) listed as untested
    - _Requirements: 2.4, 2.5, 9.7_

- [ ] 22. Lantern Relay showcase content (Owner A, with Owner B)
  - [ ] 22.1 Author `public/showcase.json`
    - Canonical_Form "Lantern Relay" with five cards (Start, Courtyard, Tower, Gate, Win), Buttons whose `source` uses the blueprint §1.3 grammar (not parsed in spec 01) and Fields with original text
    - Use the team's NecroCard-drawn artwork from an exported file; ask the user for it. If it is not available yet, keep blank bitmaps and record that in `docs/decisions.md`
    - _Requirements: 22.1, 22.5_

  - [ ] 22.2 Write the showcase unit test
    - `tests/unit/showcase-content.test.ts`: the file passes `validateStack`, stays within Document_Limits, has five cards and is in Canonical_Form
    - _Requirements: 22.5_

  - [ ] 22.3 Re-run the smoke path
    - Run `npm run test:e2e:smoke` against the final showcase and record the result in `docs/decisions.md`
    - _Requirements: 2.4, 22.1, 22.3_

- [ ] 23. Kiro evidence and handoff (Owner B)
  - [ ] 23.1 Update `docs/kiro-evidence.md` and `docs/decisions.md`
    - Add rows for the spec documents, property-test runs (seed and runs), checkpoints and commits, each with date, requirement, Kiro feature, artifact/commit, check/result and consequence
    - Add any failing-seed regression tests and their notes; append final check entries without editing earlier ones
    - _Requirements: 2.6, 2.7, 4.16_

  - [ ] 23.2 Refresh the Resume note, commit and push
    - Update the `## Resume` section at the end of this file with the final state; commit and `git push` (no force)
    - _Requirements: 2.6_

- [ ] 24. Final checkpoint - Ensure all tests pass
  - Run `npm run check:core`, `npm run build`, `npm run check:bundle`, `npm run check:tracked` and `npm run test:e2e:local`. Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster demo. Required property tests: Property 1 (P1), Property 6 (P2), Property 8 (P3), Property 16 (P10), Property 18 (P13) and Property 20 (keyboard/pointer equivalence).
- Each property test is one `fc.assert` with `fcOptions` (at least 100 runs, fixed seed) and the tag comment `// Feature: 01-responsive-authoring, Property N: <title>`. Copy any failing seed, path and shrunk counterexample into a regression unit test.
- Requirement 11.8 (shared-room undo) is owned by spec 03; this spec adds no code for it.
- Backend Day 1 gate checks stay "not run" here; they run on the hosted dev project or in CI.
- `deploy:frontend` is never run by these tasks.
- Checkpoints ensure incremental validation and keep the Resume note current for handoff between Owners A and B.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3", "1.4", "1.5", "1.6", "1.7"] },
    { "id": 2, "tasks": ["1.8", "1.9", "1.10"] },
    { "id": 3, "tasks": ["1.11"] },
    { "id": 4, "tasks": ["2.1"] },
    { "id": 5, "tasks": ["2.2"] },
    { "id": 6, "tasks": ["2.3"] },
    { "id": 7, "tasks": ["3.1"] },
    { "id": 8, "tasks": ["3.2"] },
    { "id": 9, "tasks": ["4.1"] },
    { "id": 10, "tasks": ["4.2", "4.3"] },
    { "id": 11, "tasks": ["4.4", "5.1", "6.1"] },
    { "id": 12, "tasks": ["4.5", "5.2", "6.2", "6.3", "10.1"] },
    { "id": 13, "tasks": ["5.3"] },
    { "id": 14, "tasks": ["5.4"] },
    { "id": 15, "tasks": ["5.5", "5.6", "5.8", "7.1"] },
    { "id": 16, "tasks": ["5.7", "7.2", "7.3"] },
    { "id": 17, "tasks": ["7.4", "7.5", "7.6"] },
    { "id": 18, "tasks": ["7.7", "7.8", "7.10", "8.1"] },
    { "id": 19, "tasks": ["7.9", "8.2", "8.3"] },
    { "id": 20, "tasks": ["9.1"] },
    { "id": 21, "tasks": ["9.2"] },
    { "id": 22, "tasks": ["9.3"] },
    { "id": 23, "tasks": ["9.4"] },
    { "id": 24, "tasks": ["17.1", "18.1"] },
    { "id": 25, "tasks": ["17.2", "17.3", "18.2"] },
    { "id": 26, "tasks": ["10.2", "10.3", "11.1", "11.4", "12.1", "12.4"] },
    { "id": 27, "tasks": ["10.4", "10.5", "11.2", "11.3", "11.5", "12.2", "12.3", "13.1"] },
    { "id": 28, "tasks": ["10.6", "10.7", "10.8", "13.2", "14.1"] },
    { "id": 29, "tasks": ["13.3"] },
    { "id": 30, "tasks": ["13.4"] },
    { "id": 31, "tasks": ["15.1"] },
    { "id": 32, "tasks": ["15.2"] },
    { "id": 33, "tasks": ["17.4"] },
    { "id": 34, "tasks": ["17.5", "18.3"] },
    { "id": 35, "tasks": ["18.4", "19.1"] },
    { "id": 36, "tasks": ["19.2", "19.3", "21.1"] },
    { "id": 37, "tasks": ["21.2", "21.3", "21.4", "21.5", "21.6", "21.7"] },
    { "id": 38, "tasks": ["21.8"] },
    { "id": 39, "tasks": ["22.1"] },
    { "id": 40, "tasks": ["22.2"] },
    { "id": 41, "tasks": ["22.3"] },
    { "id": 42, "tasks": ["23.1"] },
    { "id": 43, "tasks": ["23.2"] }
  ]
}
```

## Resume

- Task and owner — task 3 (checkpoint after scaffold and first push) · Owner B · 2026-11-10 MYT
- Working state — branch `main` · commit `efd10f4` (initial scaffold, pushed to origin/main) · local changes: this Resume note, tasks.md checkbox states, the `docs/decisions.md` push entry and the `docs/kiro-evidence.md` row, committed in 3.2
- Last verified — `npm run typecheck`, `npm run build`, `npm run check:bundle`, `npm run check:edge` and `npm run check:tracked` all exit 0 on Node 24.19.0 / npm 11.17.0; `git push -u origin main` succeeded · see the Verification log in `docs/decisions.md`
- Blocker — none for spec 01. Known constraints: no Docker (organisation policy), pinned Node 24.22.2 / npm 12.2.2 not installed locally, 18 moderate/low npm audit findings not yet triaged
- Next action — task 4.1, implement `src/domain/limits.ts` (`LIMITS`, `utf8ByteLength`, `codePointLength`, name rule) per `design.md`
