# Requirements Document

## Introduction

This is spec 01 of five requirements-first specs for NecroCard (Kiroween 2026, Resurrection category). The controlling source is `NECROCARD_BLUEPRINT_v2.md`; where this document and the blueprint disagree, the blueprint wins. Owner: A.

Spec 01 covers the repository scaffold, the stack document schema and limits, card authoring, one-bit drawing, buttons and plain text fields, pointer and touch input, the responsive phone/tablet/desktop layout, the spooky dark theme with Light/System modes, reduced motion and keyboard access, versioned JSON export/import, local drafts and local showcase play/fork.

Blueprint traceability: MVP items M1, M2, M3, M7, M8 and the local part of M11; seed requirements R1, R2, R4, R12 (local play/fork part), R13, R17, R18, R19 and R23; normative inputs §1.5, §2.3, §2.7, §4.1–§4.4.

Out of scope, owned by other specs:

- 02-readable-runtime: tokenizer, parser, rule compilation, name-to-ID bindings, the interpreter and rule execution in Play mode (R5, R6).
- 03-shared-stacks: cloud save state, Supabase persistence, RLS, invites, cross-device resume, shared-room undo limits, retry/dedup and reconnect (R3, R7, R8, R9, R16, R21).
- 04-spellforge-ai: AI proposals, approval and cost reservation (R14, R15, R20). Spec 01 provides only the sheet/panel container that 04 fills.
- 05-world-pulse: tool consent and MCP (R10, R11).
- R22 (no server secrets in the published bundle) is owned jointly; spec 01 delivers the bundle secret check for the scaffold (Requirement 3).

### Environment constraints and open items

These are recorded facts and unresolved decisions. They are not verified product behavior.

1. Installed toolchain on the development machine is Node 24.19.0 and npm 11.17.0. The blueprint pins Node 24.22.2 and npm 12.2.2. Scaffold checks run on the installed versions until the pinned versions are installed; the discrepancy is recorded in `docs/decisions.md` (Requirement 2).
2. Docker cannot be installed on this development machine (organisation policy, recorded 2026-11-09). This is a permanent constraint, not a temporary gap. The local Supabase stack (`supabase start`, `supabase functions serve`) is therefore unavailable here. Day 1 backend checks (blueprint §2.1) on this machine run against a hosted Supabase development project: migrations via `supabase db push` to the linked project, Edge Functions via `supabase functions deploy --use-api` (server-side bundling without Docker), and authenticated calls to the hosted function URLs. The full local-stack integration suite runs in GitHub Actions, whose Ubuntu runners provide Docker. Hosted-project credentials stay in ignored local files or provider secrets, never in tracked files. The frontend scaffold is not affected.
3. Kiro hooks (`.kiro/hooks/core-checks.json`) were deferred by user decision during the scaffold. By user decision (2026-11-10) they are now added at checkpoint task 9, once the domain code and its tests exist (Requirement 24). `.kiro/settings/mcp.json` stays deferred until local Edge Functions can be served (blueprint §3.6).
4. The MIT LICENSE copyright holder was supplied by the team on 2026-11-09: Blantara Tech.
5. Values marked "proposed" in this document (name lengths, undo depth, draft save delay) are not stated in the blueprint. Confirm or change them during requirements review.
6. Keyboard drawing is in scope by user decision (2026-11-09). Drawing with each Drawing_Tool is required by keyboard alone through a keyboard pixel cursor, the Keyboard_Cursor (Requirement 23).
7. Rename binding preservation and reference-guarded deletion depend on the Reference_Index supplied by spec 02. Spec 01 exposes the deletion and rename actions and consumes that index.
8. The local `.my_env` file at the workspace root holds private values. No value from it may appear in any tracked file, document or log.
9. Proposed values added during detailing: default card name format "Card N", case-sensitive name comparison, current-card selection after delete, Shift+arrow keyboard resize binding, one Edit_History entry per keyboard nudge, 1-second status-label update and 500 ms virtual-keyboard settle times, Keyboard_Cursor start position (128, 80), the 8-pixel Shift+arrow Keyboard_Cursor step, and the Enter (pen down/up), Space (single pixel or fill) and Escape (discard Stroke) keyboard drawing bindings. Confirm or change during review.

## Glossary

- **NecroCard_App**: The browser application built from this repository and served as static files by Netlify.
- **App_Shell**: The top-level responsive user interface of the NecroCard_App: card navigator or card strip, canvas workspace, tool dock, panels, sheets and status region.
- **Creator**: A person authoring a stack in Edit mode.
- **Player**: A person interacting with a stack in Play mode.
- **Edit_Mode / Play_Mode**: The two App_Shell modes. Edit_Mode permits authoring; Play_Mode presents the stack for interaction without authoring controls.
- **Stack_Document**: The persisted stack value defined in blueprint §2.3: `format` "necrocard", `schemaVersion` 1, `id`, `title`, `cardOrder` and `cards`.
- **Card**: An entry of `Stack_Document.cards` with `id`, `name`, `width` 256, `height` 160, `bitmapBase64` and `widgets`.
- **Widget**: A Button or a Field placed on a Card, with `id`, `name`, `x`, `y`, `width`, `height` and `kind`.
- **Button**: A Widget of kind "button" with `label` and rule `source` text.
- **Field**: A Widget of kind "field" holding plain `text`.
- **Stable_ID**: A UUID string assigned to a Stack_Document, Card or Widget at creation and never changed by later edits.
- **Document_Limits**: The bounds in blueprint §2.3: at most 20 Cards per stack, at most 40 Widgets per Card, at most 1 MiB (1,048,576 bytes) serialized Stack_Document, at most 8 KiB (8,192 bytes) of `source` per Button.
- **Schema_Validator**: The pure domain component that checks a candidate Stack_Document against the schema and Document_Limits.
- **Stack_Editor**: The pure domain reducer that applies authoring actions (card, widget and pixel actions) to a Stack_Document.
- **Bitmap**: The one-bit raster of a Card: 256 × 160 pixels, value 0 (paper) or 1 (ink), row-major, most significant bit first, 5,120 bytes before base64 encoding.
- **Bitmap_Codec**: The pure component that converts between a Bitmap and its base64 text in `bitmapBase64`.
- **Pencil**: The Drawing_Tool that sets pixels to 1.
- **Eraser**: The Drawing_Tool that sets pixels to 0.
- **Dither_Fill**: The Drawing_Tool that fills a 4-connected region with the fixed ordered-dither pattern.
- **Dither_Pattern**: A fixed function from absolute pixel coordinates (x, y) to a pixel value, defined by one ordered-dither matrix at one fixed level; the matrix is chosen in design.
- **Drawing_Tool**: Pencil, Eraser or Dither_Fill.
- **Stroke**: The sequence of logical pixel samples from one pointer-down to the matching pointer-up or pointer-cancel.
- **Edit_History**: The solo (single-session, local) undo/redo history of committed authoring actions.
- **Widget_Inspector**: The panel or sheet in which a Creator edits a selected Widget's name, label, text, source and numeric geometry.
- **Pointer_Mapper**: The pure component that converts client pointer coordinates and the canvas element's current bounding rectangle into logical pixel coordinates (blueprint §2.7 `logicalPoint`).
- **Canvas_View**: The on-screen drawing surface and its Widget overlay, including Draw/Pan mode and zoom.
- **Keyboard_Cursor**: The logical pixel position on the focused drawing surface that keyboard drawing acts on.
- **Draw_Mode / Pan_Mode**: Canvas_View input modes. Draw_Mode sends pointer input to the selected Drawing_Tool; Pan_Mode lets the page or canvas scroll.
- **Zoom_Level**: Canvas_View display scale, one of 1×, 2× or 4×.
- **Viewport_Class**: Phone (320–767 CSS px wide), Tablet (768–1199 CSS px) or Desktop (≥1200 CSS px).
- **Sheet**: An accessible modal dialog used on Phone for the Widget_Inspector and later panels.
- **Primary_Control**: An App_Shell control used in the core create/edit/play/share/export workflow: tool selection, card navigation, mode switching, undo/redo, zoom, Apply/Cancel/Close in Sheets, and export/import.
- **Theme_Preference**: The per-browser setting Dark, Light or System.
- **Theme_Controller**: The App_Shell component that reads, applies and stores the Theme_Preference.
- **Theme_Initializer**: The same-origin external script `public/theme-init.js` that applies the resolved theme before first paint.
- **Status_Region**: The App_Shell area that labels the selected tool, mode, local draft state and, for later specs, connection and AI status.
- **Exporter**: The component that serializes a Stack_Document to a versioned JSON file.
- **Importer**: The component that reads a JSON file, validates it and produces a Stack_Document.
- **Canonical_Form**: The deterministic serialization of a Stack_Document defined in design (fixed key order, fixed whitespace), used to compare document meaning.
- **Draft_Store**: The browser-local store of unexported Stack_Document drafts on one browser.
- **Showcase**: The immutable original example stack "Lantern Relay" served as `public/showcase.json`.
- **Fork**: A new editable local Stack_Document copied from another Stack_Document with a new stack Stable_ID.
- **Reference_Index**: The spec 02 component that reports which Buttons' source references a given Card or Widget.
- **Rule_Interpreter**: The spec 02 component that executes Button rules in Play_Mode.
- **Scaffold**: The repository structure, configuration and tooling files created by the first task of this spec.
- **Build**: The `npm run build` production build that writes the NecroCard_App to `dist/`.
- **Bundle_Secret_Check**: The `npm run check:bundle` script that scans `dist/` for server credentials.
- **Edge_Checker**: The `npm run check:edge` script that type-checks Supabase Edge Function entry points with the npm-installed Deno 2.9.6.
- **Domain_Module**: Source under `src/domain/` (pure document, bitmap, reducer and validation logic).
- **Hook_Config**: The Kiro hook file `.kiro/hooks/core-checks.json` in the blueprint §3.4 format.
- **Kiro_IDE**: The Kiro IDE installed on the development machine, identified by its reported version string.

## Requirements

### Requirement 1: Pinned toolchain and dependencies

**User Story:** As a team member, I want every dependency and tool version pinned exactly, so that both teammates and CI build the same application.

#### Acceptance Criteria

1. THE Scaffold SHALL declare in `package.json` exactly these versions, each written as a bare `MAJOR.MINOR.PATCH` string with no range operator, wildcard, tag, URL or Git reference (no `^`, `~`, `>`, `<`, `=`, `*`, `x`, `latest`): react 19.3.1, react-dom 19.3.1, @supabase/supabase-js 2.119.0 and zod 4.6.7 under `dependencies`; vite 8.3.6, @vitejs/plugin-react 6.2.1, typescript 7.0.2, vitest 5.1.0, fast-check 4.10.2, @playwright/test 1.65.0, @types/react 19.3.0, @types/react-dom 19.3.0, @types/node 24.19.2, @modelcontextprotocol/client 2.4.0, @modelcontextprotocol/server 2.4.0, deno 2.9.6, supabase 3.0.0 and netlify-cli 27.16.2 under `devDependencies`. Each package SHALL appear in exactly one of the two sections, and neither section SHALL contain a package not listed in this criterion.
2. THE Scaffold SHALL declare `"engines": { "node": "24.22.2" }`, `"packageManager": "npm@12.2.2"`, `"type": "module"`, `"private": true` and `"license": "MIT"` in `package.json`, each with exactly the value shown.
3. THE Scaffold SHALL contain at the repository root `.nvmrc`, whose only content is `24.22.2` (one optional trailing newline allowed), and `.npmrc`, which contains the setting `save-exact=true`.
4. THE Scaffold SHALL contain exactly one npm lockfile, `package-lock.json`, at the repository root and tracked by Git. The lockfile SHALL resolve each package listed in criterion 1 to the exact version listed there. The repository SHALL contain no `npm-shrinkwrap.json`, `yarn.lock`, `pnpm-lock.yaml`, `bun.lockb` or `bun.lock` at any path outside `node_modules/`.
5. THE Scaffold SHALL contain `supabase/functions/deno.json` with `compilerOptions.strict` set to the boolean `true`. Its import entries SHALL map `@supabase/supabase-js`, `@modelcontextprotocol/client`, `@modelcontextprotocol/server` and `zod` each to an `npm:<package-name>@<version>` specifier whose version is exactly the version listed for that package in criterion 1, with no range operator.
6. WHEN `npm ci` runs with Node 24.22.2 and npm 12.2.2 on a fresh Git clone that has no `node_modules/` directory, THE Scaffold SHALL complete the install with exit code 0. After the install, `package-lock.json` SHALL be byte-identical to the committed version, and the installed version of each package listed in criterion 1 SHALL equal the version listed there.
7. THE Scaffold SHALL define in `package.json` only scripts whose invoked files and tools exist in the repository. For each defined script, every repository file path it references SHALL exist, and every command it invokes SHALL be one of: `node`, `npm`, `npx`, a binary provided by a package listed in criterion 1, or another script defined in the same `package.json`.
8. IF a script listed in blueprint §4.2 is omitted from `package.json` because its invoked file or tool does not yet exist, THEN THE Scaffold SHALL list that script in `docs/decisions.md` as pending, recording the script name, the command text given in blueprint §4.2 and the missing file or tool.
9. IF `package.json` and `package-lock.json` disagree on any dependency or version, THEN running `npm ci` on a fresh Git clone SHALL exit with a non-zero code without modifying `package-lock.json`, and the CI job that runs `npm ci` SHALL report failure.

### Requirement 2: Recorded environment constraints

**User Story:** As a team member, I want toolchain gaps and blocked checks recorded, so that nobody mistakes an unrun check for a passed one.

#### Acceptance Criteria

1. IF the installed Node version differs in its major, minor or patch number from the version pinned in `.nvmrc`, or the installed npm version differs in its major, minor or patch number from the version pinned in `packageManager`, THEN THE Scaffold SHALL have a `docs/decisions.md` entry dated in YYYY-MM-DD form that states the installed Node and npm versions, the pinned Node and npm versions, and the name of each verification check that ran on the installed versions.
2. THE Scaffold SHALL have a `docs/decisions.md` entry dated in YYYY-MM-DD form that records that Docker is not permitted on the development machine by organisation policy, states the alternative path (migrations via `supabase db push` to a linked hosted Supabase development project, Edge Functions via `supabase functions deploy --use-api`, authenticated calls to the hosted function URLs, and the full local-stack integration suite in GitHub Actions), and lists each of the four Day 1 compatibility-gate checks (migration, anonymous session, authenticated Edge call, MCP handshake) with its execution venue ("hosted dev project" or "CI") and its current result, where a check not yet executed has the result "not run".
3. THE Scaffold SHALL have a `docs/decisions.md` entry dated in YYYY-MM-DD form that records the deferral of `.kiro/hooks/core-checks.json` by user decision and states the condition under which the hook is to be added. WHEN the hook is added (Requirement 24), a later `docs/decisions.md` entry dated in YYYY-MM-DD form SHALL record that addition, and the deferral entry SHALL stay unchanged.
4. WHEN a verification check is executed (including the Build, the Bundle_Secret_Check and the Edge_Checker with Deno 2.9.6), THE Scaffold SHALL record in `docs/decisions.md` the exact command run, the Node and npm versions used, the Deno version for the Edge_Checker, the execution date in YYYY-MM-DD form, and a result of "pass" if the command exited with status 0 or "fail" if it exited with a non-zero status or was terminated before it exited.
5. IF a verification check or Day 1 compatibility-gate check was not executed, THEN THE Scaffold SHALL mark that check in `docs/decisions.md` as "not run" and state the reason it did not run (for example, Docker unavailable), and SHALL NOT mark it as "pass".
6. THE Scaffold SHALL list every verification check of the Scaffold task and every Day 1 compatibility-gate check in `docs/decisions.md`, each with exactly one current result of "pass", "fail" or "not run".
7. WHEN a check already recorded as "not run" or "fail" is executed again, THE Scaffold SHALL add a new dated `docs/decisions.md` entry with the new result as defined in criterion 4, and SHALL keep the earlier entry unchanged.

### Requirement 3: Compile boundaries, build and bundle safety

**User Story:** As a team member, I want browser, domain and Edge code compiled separately, so that server modules and secrets never reach the browser.

#### Acceptance Criteria

1. THE Scaffold SHALL contain `tsconfig.app.json` with `strict` and `noUncheckedIndexedAccess` enabled, ESNext modules, bundler module resolution, DOM and DOM.Iterable libraries, the `react-jsx` JSX mode and explicit `vite/client` types, and with `supabase/functions` excluded from compilation.
2. WHEN `npm run typecheck` runs, THE Scaffold SHALL type-check every Domain_Module source file with no DOM or DOM.Iterable type definitions available, and with no import of React, `@supabase/supabase-js`, any `@modelcontextprotocol/*` package, `localStorage`, `sessionStorage` or `indexedDB`.
3. IF a Domain_Module source file references a DOM type or browser global, or imports React, `@supabase/supabase-js`, any `@modelcontextprotocol/*` package or a browser storage API, THEN `npm run typecheck` SHALL exit with a non-zero status and an error message naming the offending file.
4. WHEN `npm run typecheck` runs, THE Scaffold SHALL type-check the browser and domain sources with `tsconfig.app.json` first and SHALL run the Edge_Checker only if that type-check reports zero errors. The command SHALL exit with status 0 only when both steps report zero errors, and with a non-zero status otherwise.
5. WHEN the Edge_Checker runs, THE Edge_Checker SHALL type-check every entry point matching `supabase/functions/*/index.ts` with the npm-installed Deno 2.9.6 using `supabase/functions/deno.json`, SHALL print the number of entry points checked (0 or more), and SHALL exit with status 0 when every checked entry point reports zero type errors.
6. IF any entry point checked by the Edge_Checker reports one or more type errors, THEN THE Edge_Checker SHALL exit with a non-zero status after checking all entry points, and SHALL name each failing entry point file in its output.
7. IF the Deno executable is missing or reports a version other than 2.9.6, THEN THE Edge_Checker SHALL exit with a non-zero status before checking any entry point, with a message naming the expected version 2.9.6 and, when a Deno executable is found, the version it reported.
8. WHEN `npm run build` completes with exit status 0, THE Build SHALL have written the NecroCard_App to `dist/`, and the output SHALL include no module resolved from a path under `supabase/functions/` and no module from any `@modelcontextprotocol/*` package.
9. WHEN `npm run check:bundle` runs, THE Bundle_Secret_Check SHALL scan every file under `dist/`, including nested directories and all file extensions, and SHALL exit with status 0 only if no file contains any of: a server variable name listed in `supabase/functions/.env.example` followed by an assignment or key-value separator and a non-empty value; a match for the service-role key pattern; or a match for the Nebius key pattern. Both patterns are defined in design.
10. IF any file under `dist/` matches a check in criterion 9, or `dist/` is missing or contains no files, THEN THE Bundle_Secret_Check SHALL exit with a non-zero status.
11. THE Bundle_Secret_Check SHALL report each finding with the file path relative to `dist/` and the matched pattern name, SHALL report the total finding count, and SHALL print no part of any matched value.
12. WHEN the Build completes, THE Build SHALL report the compressed size of each initial JavaScript file (the JavaScript loaded by the entry HTML page before any dynamic import) and their compressed total. The NecroCard_App initial JavaScript compressed total SHALL be at most 350 KiB (358,400 bytes), a blueprint §4.8 target, and the measured total SHALL be recorded as measured.

### Requirement 4: Repository layout, configuration and project evidence files

**User Story:** As a team member, I want the repository layout, hosting configuration and Kiro artifacts in place from the first commit, so that later specs build on a known structure.

#### Acceptance Criteria

1. THE Scaffold SHALL place each file it creates at a path that is listed in the blueprint §4.1 layout table, listed in blueprint §4.2, or located under a directory listed in the blueprint §4.1 layout table; any other created path SHALL have an entry in `docs/decisions.md` naming the path and the reason for it.
2. THE Scaffold SHALL contain `netlify.toml` with build command `npm run build`, publish directory `dist`, `NODE_VERSION` 24.22.2, `NPM_VERSION` 12.2.2, a `/*` to `/index.html` rewrite with status 200, the response headers `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY` and `Permissions-Policy: camera=(), microphone=(), geolocation=()` applied to path `/*`, and `Cache-Control: no-cache` applied to `/index.html`.
3. WHEN the Build runs with `VITE_SUPABASE_URL` set to an HTTPS URL, THE Build SHALL write to `dist/` a Content-Security-Policy header rule for path `/*` whose directives are exactly `default-src 'self'`, `script-src 'self'`, `object-src 'none'`, `base-uri 'self'`, `frame-ancestors 'none'`, `worker-src 'self'` and `connect-src 'self' https://<host>[:<port>] wss://<host>[:<port>]`, where `<host>` and the optional non-default `<port>` come from `VITE_SUPABASE_URL` and any path, query or fragment of that URL is dropped.
4. THE Build SHALL produce a Content-Security-Policy that contains none of these: `unsafe-eval`, a host source containing `*`, or any origin whose host ends in `nebius.com`.
5. IF `VITE_SUPABASE_URL` is absent, empty or not an HTTPS URL at build time, THEN THE Build SHALL emit the Content-Security-Policy of criterion 3 with `connect-src 'self'` as its only `connect-src` source, print a warning that names `VITE_SUPABASE_URL`, and finish with exit status 0.
6. THE Scaffold SHALL contain `.env.example` that declares exactly two variables, `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`, each with an empty value.
7. THE Scaffold SHALL contain `supabase/functions/.env.example` that declares exactly the six variables of blueprint §4.4 and no others: `NEBIUS_API_KEY` empty, `NEBIUS_MODEL` empty or `Qwen/Qwen3-30B-A3B-Instruct-2507`, `NEBIUS_BASE_URL` empty or `https://api.tokenfactory.nebius.com/v1/`, `MCP_SERVICE_TOKEN` empty, `ALLOWED_ORIGINS` empty, and `AI_APP_CAP_MICROUSD` empty or `8500000`.
8. THE Scaffold SHALL contain `.gitignore` with every entry of blueprint §4.1 (`node_modules/`, `dist/`, `.env`, `.env.*`, `!.env.example`, `supabase/functions/.env`, `supabase/functions/.env.*`, `!supabase/functions/.env.example`, `supabase/.temp/`, `supabase/.branches/`, `.local-test/`, `playwright-report/`, `test-results/`, `coverage/`, `*.log`) plus `.my_env` and `/memory/`, and with no entry that matches `.kiro` or any path under `.kiro/`.
9. WHEN `git check-ignore --no-index` is run from the repository root against `.kiro/specs/01-responsive-authoring/requirements.md`, `.kiro/steering/product.md`, `.kiro/agents/runtime-engineer.json`, `.kiro/agents/runtime-reviewer.json`, `.env.example`, `supabase/functions/.env.example` and `src/memory/notes.md`, THE Scaffold SHALL cause the command to print none of these paths.
10. WHEN `git check-ignore --no-index` is run from the repository root against `memory/test.md`, `memory/sub/test.md`, `.my_env`, `.env`, `.env.local`, `supabase/functions/.env` and `supabase/functions/.env.local`, THE Scaffold SHALL cause the command to print every one of these paths.
11. THE Scaffold SHALL contain a root `LICENSE` file whose text matches the standard MIT license text word for word, apart from the copyright line, and whose copyright line is exactly "Copyright (c) 2026 Blantara Tech".
12. THE Scaffold SHALL contain `README.md` with a product description of the NecroCard_App; Node 24.22.2 and npm 12.2.2 listed as prerequisites; Docker listed as optional and not required on the development machine; the install command; the commands `npm run dev`, `npm run typecheck`, `npm run build` and `npm run check:bundle`; a hosted development project workflow section that gives the commands `supabase link`, `supabase db push` and `supabase functions deploy --use-api`; a statement that `npm run dev:backend` (`supabase functions serve`) requires Docker and is pending or CI-only; and a "blocked items" section that gives each blocked item and its blocking reason.
13. THE Scaffold SHALL contain `.kiro/steering/product.md`, `.kiro/steering/runtime-safety.md`, `.kiro/steering/release-review.md` and `.kiro/steering/ai-mobile.md`, each with front matter and body text equal to the matching block in blueprint §3.3 or §3.8 after line endings are normalized to LF and trailing whitespace is removed. `.kiro/steering/product.md` SHALL additionally end with the "Project continuity" block from the project memory guide, appended after the blueprint body.
14. THE Scaffold SHALL contain `.kiro/agents/runtime-engineer.json` and `.kiro/agents/runtime-reviewer.json`, each parsing as valid JSON and equal to the matching block in blueprint §3.5 after line endings are normalized to LF and trailing whitespace is removed.
15. THE Scaffold SHALL contain `powers/safe-card-runtime/plugin.json` and `powers/safe-card-runtime/skills/verify-runtime/SKILL.md`, each equal to the matching block in blueprint §3.7 after line endings are normalized to LF and trailing whitespace is removed.
16. THE Scaffold SHALL contain `docs/decisions.md` and `docs/kiro-evidence.md`, where `docs/kiro-evidence.md` contains a Markdown table whose header row has exactly the columns date, requirement, Kiro feature, artifact/commit, check/result and consequence, in that order.
17. THE Scaffold SHALL keep `.my_env` out of `git ls-files` output, and no file listed by `git ls-files` SHALL contain any value of 8 or more characters from the local `.my_env` file.
18. THE Scaffold SHALL contain no file under `.kiro/hooks/` at the initial scaffold commit, and SHALL contain an entry in `docs/decisions.md` that records the deferral with its date; the hooks are then added under Requirement 24.

### Requirement 5: Phone-sized blank shell

**User Story:** As a Creator on a phone, I want the app to open to a usable blank card, so that the foundation is proven on the smallest supported screen.

#### Acceptance Criteria

1. WHEN the NecroCard_App is opened with no saved draft in the Draft_Store at a 320 × 568 CSS px viewport, THE App_Shell SHALL display, without the user scrolling, one Card in the Canvas_View at Zoom_Level 1× (all 256 × 160 logical pixels visible), the card strip with exactly one Card entry, the bottom tool dock, and the Status_Region.
2. WHEN the NecroCard_App is opened with no saved draft in the Draft_Store, THE App_Shell SHALL start in Edit_Mode, and the Status_Region SHALL label the selected Drawing_Tool, the current mode as Edit_Mode, and the local draft state.
3. WHEN the NecroCard_App is opened at a 320 × 568 CSS px viewport, THE App_Shell SHALL render with a document scroll width equal to the viewport width of 320 CSS px, so that no horizontal scrolling is possible.
4. WHEN the blank shell is loaded from the Build output, THE NecroCard_App SHALL log no uncaught error and no unhandled promise rejection to the browser console from navigation start until 10 seconds after the App_Shell displays the Card.
5. WHEN the NecroCard_App is opened with no saved draft in the Draft_Store, THE App_Shell SHALL create a Stack_Document that passes the Schema_Validator and has `schemaVersion` 1, a Stable_ID, exactly one Card listed in `cardOrder`, and zero Widgets on that Card.
6. WHEN the NecroCard_App creates the blank Stack_Document, THE App_Shell SHALL give its one Card `width` 256, `height` 160, and a `bitmapBase64` value that the Bitmap_Codec decodes to 5,120 bytes in which every pixel is 0.
7. IF the Draft_Store cannot be read when the NecroCard_App opens, THEN THE App_Shell SHALL display the same blank shell as criterion 1, and the Status_Region SHALL state that local drafts are unavailable.

### Requirement 6: Stack document schema and limits

**User Story:** As a Creator, I want every stack to follow one strict versioned schema, so that stacks are portable and invalid data never corrupts my work.

#### Acceptance Criteria

1. THE Schema_Validator SHALL accept a Stack_Document only when all of the following hold: `format` equals "necrocard"; `schemaVersion` equals the integer 1; `id`, every Card `id` and every Widget `id` are Stable_IDs in the 36-character hyphenated 8-4-4-4-12 hexadecimal UUID text form; `cards` contains between 1 (proposed minimum) and 20 Cards; `cardOrder` lists every key of `cards` exactly once with no other entries; and each Card's `id` equals its key in `cards`.
2. THE Schema_Validator SHALL accept a Card only when `width` equals the integer 256, `height` equals the integer 160, `widgets` contains between 0 and 40 Widgets, and `bitmapBase64` is standard-alphabet padded base64 text that the Bitmap_Codec decodes to exactly 5,120 bytes.
3. THE Schema_Validator SHALL accept a Widget only when `kind` is "button" or "field"; a Button has string `label` and string `source` properties; a Field has a string `text` property; and `x`, `y`, `width` and `height` are integers with `x ≥ 0`, `y ≥ 0`, `width ≥ 1`, `height ≥ 1`, `x + width ≤ 256` and `y + height ≤ 160`.
4. IF a candidate Stack_Document has more than 20 Cards, more than 40 Widgets on any Card, a Canonical_Form longer than 1,048,576 bytes when UTF-8 encoded, or a Button `source` longer than 8,192 bytes when UTF-8 encoded, THEN THE Schema_Validator SHALL reject the candidate with a diagnostic naming the exceeded Document_Limit, the measured value and the maximum, and SHALL accept candidates whose measured values equal the maximum exactly.
5. IF a candidate contains a non-finite number, an object key equal to `__proto__`, `constructor` or `prototype`, a property not defined by the schema, a missing required property, a property whose value type differs from the schema type, or a `schemaVersion` other than 1, THEN THE Schema_Validator SHALL reject the candidate with a diagnostic naming the offending property path.
6. IF two Cards in one Stack_Document have identical names, two Widgets on one Card have identical names, or two Cards or Widgets in one Stack_Document share a Stable_ID, THEN THE Schema_Validator SHALL reject the candidate with a diagnostic naming the duplicated value and the property paths of both occurrences, where names are compared as exact, case-sensitive character sequences (proposed).
7. IF a Stack_Document `title`, Card `name` or Widget `name` has fewer than 1 or more than 64 Unicode code points (proposed limit), or consists only of whitespace, THEN THE Schema_Validator SHALL reject the candidate with a diagnostic naming the offending property path.
8. IF the result of an authoring action applied by the Stack_Editor fails any Schema_Validator check, THEN THE Stack_Editor SHALL return the input Stack_Document unchanged together with the validation diagnostic, and SHALL add no entry to the Edit_History.
9. FOR ALL valid Stack_Documents and all sequences of accepted authoring actions, THE Stack_Editor SHALL produce a Stack_Document that passes Schema_Validator checks (invariant).
10. THE Stack_Document schema SHALL define no property for Theme_Preference, Zoom_Level, selection, Edit_History or Play_Mode game state, so that THE Schema_Validator rejects any candidate containing such a property under criterion 5.
11. WHEN the Schema_Validator checks a candidate, THE Schema_Validator SHALL leave the candidate unmodified and SHALL return the same accept or reject result and the same diagnostics for every check of an identical candidate.

### Requirement 7: Card authoring

**User Story:** As a Creator, I want to create, rename, reorder and delete cards, so that I can structure a small interactive story.

#### Acceptance Criteria

1. WHEN a Creator adds a Card while the Stack_Document has 19 or fewer Cards, THE Stack_Editor SHALL create a Card with a new Stable_ID, `width` 256, `height` 160, an all-0 Bitmap, an empty `widgets` list and the default name "Card N", where N is the smallest positive integer for which no other Card in the Stack_Document has that name (proposed format), SHALL insert the new Card in `cardOrder` at the position immediately after the current Card, and SHALL make the new Card the current Card.
2. WHEN a Creator renames a Card to a name of 1 to 64 characters (proposed limit) that is not equal to the `name` of any other Card in the Stack_Document, THE Stack_Editor SHALL change only that Card's `name` and SHALL keep its Stable_ID, Bitmap, Widgets and position in `cardOrder` unchanged.
3. WHEN a Creator moves a Card earlier or later, THE Stack_Editor SHALL swap that Card with the adjacent Card in that direction in `cardOrder`, SHALL leave every other Card's position in `cardOrder` unchanged, and SHALL keep the same set of Card IDs.
4. WHEN a Creator deletes a Card while the Stack_Document has 2 or more Cards and the Reference_Index reports no reference to that Card or to any Widget on that Card, THE Stack_Editor SHALL remove the Card, including its Widgets, from `cards` and `cardOrder`.
5. IF a Creator attempts to delete the only Card, THEN THE Stack_Editor SHALL keep the Stack_Document unchanged and THE App_Shell SHALL show a message stating that a stack needs at least one card.
6. IF a Creator attempts to delete a Card or Widget that the Reference_Index reports as referenced, or a Card that contains a Widget the Reference_Index reports as referenced, THEN THE Stack_Editor SHALL keep the Stack_Document unchanged and THE App_Shell SHALL list every referencing Button by its Card name and Widget name.
7. IF a Creator attempts to add a Card while the Stack_Document already has 20 Cards, THEN THE Stack_Editor SHALL keep the Stack_Document unchanged and THE App_Shell SHALL show a message stating that a stack can have at most 20 cards.
8. FOR ALL sequences of add, rename, reorder and delete actions, THE Stack_Editor SHALL keep Card Stable_IDs unique, keep Card names unique, keep `cardOrder` a permutation of the keys of `cards`, keep between 1 and 20 Cards, and keep every surviving Card's Stable_ID unchanged (invariant, blueprint P1).
9. THE App_Shell SHALL provide a "move earlier" button and a "move later" button for the current Card, each with an accessible name and each operable by a single tap and by the Enter or Space key, so that card reordering does not require drag.
10. IF a Creator attempts to rename a Card to an empty name, a name longer than 64 characters (proposed limit), or a name equal to the `name` of another Card in the Stack_Document, THEN THE Stack_Editor SHALL keep the Stack_Document unchanged and THE App_Shell SHALL show a message identifying which of these rules the entered name breaks.
11. IF a Creator attempts to move the first Card in `cardOrder` earlier or the last Card in `cardOrder` later, THEN THE Stack_Editor SHALL keep `cardOrder` unchanged and THE App_Shell SHALL present the corresponding move button as disabled.
12. WHEN the Stack_Editor removes the current Card, THE App_Shell SHALL make the current Card the Card that followed the removed Card in `cardOrder`, or the Card that preceded it if the removed Card was last (proposed rule).

### Requirement 8: One-bit bitmap encoding

**User Story:** As a Creator, I want my artwork stored as an exact one-bit raster, so that it looks identical on every device and after export.

#### Acceptance Criteria

1. THE Bitmap_Codec SHALL represent each Bitmap as exactly 5,120 bytes holding 40,960 pixels, storing pixel (x, y) at bit `7 − (i mod 8)` of byte `floor(i / 8)`, where `i = y × 256 + x`, bit 7 is the most significant bit, a set bit (1) means ink and a cleared bit (0) means paper.
2. WHEN the Bitmap_Codec encodes a Bitmap to `bitmapBase64`, THE Bitmap_Codec SHALL return a string of exactly 6,828 characters that uses only the standard base64 alphabet (A–Z, a–z, 0–9, `+`, `/`), ends with exactly one `=` padding character, contains no whitespace or line breaks, and is identical for any two Bitmaps whose 40,960 pixel values are equal.
3. FOR ALL Bitmaps, THE Bitmap_Codec SHALL produce, after encoding to base64 and decoding, a Bitmap whose 40,960 pixel values all equal those of the original (round-trip property).
4. FOR ALL sequences of 0 or more in-bounds pixel assignments, including sequences that assign the same pixel more than once, THE Bitmap_Codec SHALL produce, after encoding and decoding, pixel values equal at all 40,960 coordinates to an independent 256 × 160 array oracle that started from all-0 pixels and applied the same assignments in the same order (blueprint P3 oracle).
5. IF `bitmapBase64` is not a string, is not exactly 6,828 characters, contains any character outside the standard base64 alphabet, has `=` anywhere other than the final character, has non-zero unused bits in its last data character, or decodes to a length other than 5,120 bytes, THEN THE Bitmap_Codec SHALL return a decoding error and no Bitmap, including no partially decoded pixels.
6. IF a pixel write targets a coordinate that is not an integer within 0 ≤ x ≤ 255 and 0 ≤ y ≤ 159, or a value other than the integer 0 or 1, THEN THE Bitmap_Codec SHALL return an error and leave all 40,960 pixel values of the Bitmap unchanged.
7. IF a pixel read targets a coordinate that is not an integer within 0 ≤ x ≤ 255 and 0 ≤ y ≤ 159, THEN THE Bitmap_Codec SHALL return an error and no pixel value, and leave all 40,960 pixel values of the Bitmap unchanged.

### Requirement 9: Pencil and Eraser

**User Story:** As a Creator, I want to draw and erase pixels with mouse, pen or finger, so that I can sketch a tiny world on any device.

#### Acceptance Criteria

1. WHILE Edit_Mode and Draw_Mode are active with the Pencil selected, WHEN a Stroke receives a sample after its first sample, THE Stack_Editor SHALL set to 1 every pixel of the 8-connected line between the previous sample and the current sample, where the line contains both sample pixels and exactly max(|Δx|, |Δy|) + 1 pixels, and the rasterization rule is fixed in design.
2. WHILE Edit_Mode and Draw_Mode are active with the Eraser selected, WHEN a Stroke receives a sample after its first sample, THE Stack_Editor SHALL set to 0 every pixel of the 8-connected line between the previous sample and the current sample, where the line contains both sample pixels and exactly max(|Δx|, |Δy|) + 1 pixels, and the rasterization rule is the same one Criterion 1 uses.
3. THE Stack_Editor SHALL leave unchanged every pixel of the Card's Bitmap that is neither a Stroke sample pixel nor on one of the Stroke's line segments, and SHALL leave unchanged every other Card, every Widget and every other Stack_Document value (locality invariant).
4. THE Stack_Editor SHALL produce, for every Bitmap and every Stroke, a Bitmap of exactly 256 × 160 pixels whose values are all 0 or 1, and SHALL write no pixel whose logical coordinate lies outside x 0–255 or y 0–159, while it still writes the in-range pixels of any line segment that crosses the Bitmap edge (invariant).
5. WHEN a Stroke ends with pointer-up and changes at least 1 pixel, THE Stack_Editor SHALL commit the Stroke as exactly one Edit_History entry, so that one undo restores the Bitmap to its exact pre-Stroke value.
6. WHEN a Stroke ends with pointer-cancel, THE Canvas_View SHALL discard the Stroke's uncommitted preview and THE Stack_Editor SHALL keep the Bitmap identical to its value before the Stroke began, with no Edit_History entry added.
7. WHEN a Stroke sample is received, THE Canvas_View SHALL display the updated preview within 32 ms of receiving the pointer event, at the 95th percentile over a Stroke of at least 100 samples at each Zoom_Level (1×, 2× and 4×), on the reference device recorded in `docs/device-matrix.md` (blueprint §4.8 target, recorded as measured).
8. WHILE Edit_Mode and Draw_Mode are active with the Pencil or Eraser selected, WHEN a Stroke begins with pointer-down from a mouse primary button, a pen or a touch, THE Stack_Editor SHALL set the single pixel at the first sample's logical coordinate (from the Pointer_Mapper) to 1 for the Pencil or to 0 for the Eraser.
9. IF a second pointer goes down while a Stroke is in progress, THEN THE Canvas_View SHALL ignore that pointer's samples and SHALL continue the Stroke using only the pointer that began it.
10. IF a Stroke ends with pointer-up and changed no pixel, THEN THE Stack_Editor SHALL add no Edit_History entry and SHALL leave the Bitmap unchanged.

### Requirement 10: Fixed ordered-dither fill

**User Story:** As a Creator, I want a one-tap patterned fill, so that I can shade areas in a consistent one-bit style.

#### Acceptance Criteria

1. WHILE the App_Shell is in Edit_Mode and the Canvas_View is in Draw_Mode with Dither_Fill selected, WHEN a Creator taps a point that the Pointer_Mapper maps to logical pixel (x, y) with 0 ≤ x ≤ 255 and 0 ≤ y ≤ 159, THE Stack_Editor SHALL set every pixel (px, py) of the fill region to `Dither_Pattern(px, py)`. The fill region is pixel (x, y) plus every pixel reachable from it through steps to an edge-adjacent pixel ((px ± 1, py) or (px, py ± 1), diagonals excluded) inside the 256 × 160 Bitmap, where each pixel along the path has the same value that pixel (x, y) had in the Bitmap before the fill.
2. FOR ALL Bitmaps and fill positions, THE Stack_Editor SHALL leave unchanged every pixel outside the fill region, the Bitmaps of all other Cards, and every Widget of every Card (locality invariant).
3. FOR ALL Bitmaps and fill positions, THE Stack_Editor SHALL produce byte-identical `bitmapBase64` output whenever the same fill position is applied to byte-identical input Bitmaps (determinism).
4. THE Dither_Pattern SHALL return a value that depends only on the absolute pixel coordinates (px, py). Every pixel set by any Dither_Fill at (px, py) SHALL therefore equal `Dither_Pattern(px, py)` whatever the tap position, the region shape or the order of earlier fills, so that two adjacent filled regions show an aligned pattern.
5. WHEN a Dither_Fill changes at least one pixel, THE Stack_Editor SHALL commit the whole fill as exactly one Edit_History entry.
6. WHEN a Creator performs one undo immediately after a Dither_Fill, THE Stack_Editor SHALL restore the Card's `bitmapBase64` byte for byte to its value before the fill. WHEN the Creator then performs one redo, THE Stack_Editor SHALL restore the post-fill `bitmapBase64` byte for byte.
7. IF a Dither_Fill tap maps to a logical pixel outside 0 ≤ x ≤ 255 and 0 ≤ y ≤ 159, or the fill would change no pixel, THEN THE Stack_Editor SHALL leave the Stack_Document unchanged and add no Edit_History entry.

### Requirement 11: Solo undo and redo

**User Story:** As a Creator working alone, I want to undo and redo my edits, so that I can experiment without fear.

#### Acceptance Criteria

1. WHEN a Creator selects Undo while the Edit_History contains at least one Undo entry, THE Stack_Editor SHALL restore a Stack_Document whose Canonical_Form equals the Canonical_Form of the Stack_Document immediately before the most recent committed authoring action that has not been undone, and THE Edit_History SHALL move that entry from the Undo entries to the top of the Redo entries.
2. WHEN a Creator selects Redo while the Edit_History contains at least one Redo entry, THE Stack_Editor SHALL restore a Stack_Document whose Canonical_Form equals the Canonical_Form of the Stack_Document immediately before the most recent Undo, and THE Edit_History SHALL move that entry from the Redo entries back to the top of the Undo entries.
3. FOR ALL Stack_Documents and accepted authoring actions, THE Stack_Editor SHALL produce a Stack_Document whose Canonical_Form equals that of the pre-action Stack_Document after applying the action and then Undo, and equals that of the post-action Stack_Document after a subsequent Redo (round-trip property).
4. WHEN a Creator commits a new authoring action while the Edit_History contains one or more Redo entries, THE Edit_History SHALL discard all Redo entries, leaving zero Redo entries.
5. WHEN a committed authoring action would make the Edit_History hold more than 50 Undo entries (proposed depth), THE Edit_History SHALL discard the oldest Undo entry, so that at most 50 consecutive Undo selections are possible.
6. WHILE the Edit_History contains zero Undo entries, THE App_Shell SHALL present the Undo control as disabled, exposed as disabled to assistive technology and visibly distinguished from its enabled state by text or icon state that does not depend on color alone.
7. WHILE the Edit_History contains zero Redo entries, THE App_Shell SHALL present the Redo control as disabled, exposed as disabled to assistive technology and visibly distinguished from its enabled state by text or icon state that does not depend on color alone.
8. WHERE the Stack_Document is opened as a shared room, THE Edit_History SHALL apply the undo limits defined by spec 03-shared-stacks in place of criteria 1–7 of this requirement.
9. IF a Creator selects Undo while the Edit_History contains zero Undo entries, or selects Redo while the Edit_History contains zero Redo entries, THEN THE Stack_Editor SHALL leave the Stack_Document and the Edit_History unchanged.
10. IF the Stack_Editor rejects an authoring action because its result fails Schema_Validator checks (Requirement 6, criterion 8), or a Stroke ends with pointer-cancel, THEN THE Edit_History SHALL keep its Undo entries and Redo entries unchanged.
11. WHEN the App_Shell opens a Stack_Document, whether it is a new stack, an imported file, a Fork, the Showcase or a Draft_Store draft (including after a page reload), THE Edit_History SHALL contain zero Undo entries and zero Redo entries.

### Requirement 12: Buttons and plain text fields

**User Story:** As a Creator, I want to place buttons and text fields on a card, so that players have something to click and read.

#### Acceptance Criteria

1. WHEN a Creator adds a Button or Field to a Card that has at most 39 Widgets, THE Stack_Editor SHALL add one Widget to that Card with a new Stable_ID, a default name of 1 to 64 characters that no other Widget on that Card uses, and integer `x`, `y`, `width` and `height` values that satisfy Requirement 6 criterion 3.
2. WHEN a Creator adds a Button, THE Stack_Editor SHALL give the Button a non-empty default `label` and an empty `source`; WHEN a Creator adds a Field, THE Stack_Editor SHALL give the Field an empty `text`.
3. WHEN a Creator edits a Button's label or a Field's text in the Widget_Inspector, THE Stack_Editor SHALL store the entered value character for character, including whitespace and line breaks, without removing, escaping or converting any character.
4. WHEN a Creator edits a Button's source in the Widget_Inspector and the source is at most 8,192 bytes in UTF-8 encoding, THE Stack_Editor SHALL store the source character for character and SHALL NOT compile, reject or modify it for rule syntax, leaving rule compilation to the Rule_Interpreter's compiler in spec 02.
5. IF a Creator enters Button source longer than 8,192 bytes in UTF-8 encoding, THEN THE Widget_Inspector SHALL show a message stating the 8,192-byte limit and the entered byte count, and THE Stack_Editor SHALL keep the previously stored source unchanged.
6. IF a Creator attempts to add a Widget to a Card that already has 40 Widgets, THEN THE Stack_Editor SHALL keep the Card and its Widgets unchanged and THE App_Shell SHALL show a message stating the 40-widget limit.
7. WHEN a Creator renames a Widget to a name of 1 to 64 characters that no other Widget on its Card uses, THE Stack_Editor SHALL change only that Widget's `name` and SHALL keep its Stable_ID, geometry, label, text and source unchanged.
8. IF a Creator renames a Widget to an empty name, a name longer than 64 characters, or a name another Widget on the same Card uses, THEN THE Widget_Inspector SHALL show a message naming the failed rule and THE Stack_Editor SHALL keep the Widget's previous name.
9. IF an edit to a label, text, source or name would make the serialized Stack_Document exceed 1,048,576 bytes, THEN THE Stack_Editor SHALL keep the previous value per Requirement 6 criterion 8 and THE Widget_Inspector SHALL show a message stating the 1 MiB document limit.
10. WHILE Play_Mode is active, THE App_Shell SHALL render each Button as a native button element whose accessible name equals its `label`, or equals its Widget `name` when the `label` is empty, and SHALL render each Field's `text` as read-only text that a Player cannot edit.
11. THE App_Shell SHALL render Field text and Button labels as text content in both Edit_Mode and Play_Mode, so that a value such as `<b>x</b>` appears as those literal characters and creates no HTML element.

### Requirement 13: Widget placement by touch, keyboard and numbers

**User Story:** As a Creator, I want to position and resize widgets by dragging, by keyboard or by typing numbers, so that I can lay out cards precisely on any device.

#### Acceptance Criteria

1. WHILE the App_Shell is in Edit_Mode, WHEN a Creator drags the body of a selected Widget from pointer-down to pointer-up, THE Stack_Editor SHALL set the Widget's `x` and `y` to their pre-drag values plus the difference between the Pointer_Mapper logical coordinates of the current pointer position and of the pointer-down position, clamped to `0 ≤ x ≤ 256 − width` and `0 ≤ y ≤ 160 − height`, keep `width` and `height` unchanged, and commit the move as one Edit_History entry at pointer-up.
2. WHILE a Widget is selected and keyboard focus is on the Canvas_View Widget overlay, WHEN a Creator presses an arrow key without Shift, THE Stack_Editor SHALL move the Widget one logical pixel in the arrow's direction, clamp the position to `0 ≤ x ≤ 256 − width` and `0 ≤ y ≤ 160 − height`, commit each position change as one Edit_History entry, and leave the document unchanged with no Edit_History entry if the Widget is already at the Card edge in that direction. The page SHALL NOT scroll on that key press.
3. WHEN a Creator applies an integer value for `x`, `y`, `width` or `height` in the Widget_Inspector, and the resulting geometry satisfies Requirement 6 criterion 3, THE Stack_Editor SHALL set that value, keep the other three geometry values unchanged, and commit the change as one Edit_History entry.
4. IF a Creator applies a Widget_Inspector geometry value that is empty, non-numeric, non-integer, or outside its valid range (`x` 0 to 256 − width, `y` 0 to 160 − height, `width` 1 to 256 − x, `height` 1 to 160 − y, using the Widget's current values), THEN THE Widget_Inspector SHALL show a message that names the field and its valid range, and THE Stack_Editor SHALL keep the previous geometry and add no Edit_History entry.
5. FOR ALL drag, keyboard and numeric placement and resize actions, THE Stack_Editor SHALL produce Widget geometry whose `x`, `y`, `width` and `height` are integers that satisfy Requirement 6 criterion 3 (invariant).
6. WHEN a placement or resize drag ends with pointer-cancel, THE Canvas_View SHALL discard the drag preview and THE Stack_Editor SHALL keep the Widget's geometry from before the drag and add no Edit_History entry.
7. THE Canvas_View SHALL position the Widget overlay with the same logical-to-screen transform as the Bitmap, so that at each Zoom_Level (1×, 2× and 4×), and after any viewport resize or orientation change, the top-left corner of a Widget at logical (x, y) lies within 1 CSS px of the top-left corner of Bitmap pixel (x, y) on screen.
8. WHILE the App_Shell is in Edit_Mode, WHEN a Creator drags the resize handle of a selected Widget from pointer-down to pointer-up, THE Stack_Editor SHALL set `width` and `height` to their pre-drag values plus the Pointer_Mapper logical-coordinate difference, clamped to `1 ≤ width ≤ 256 − x` and `1 ≤ height ≤ 160 − y`, keep `x` and `y` unchanged, and commit the resize as one Edit_History entry at pointer-up.
9. WHILE a Widget is selected and keyboard focus is on the Canvas_View Widget overlay, WHEN a Creator presses Shift with an arrow key (proposed binding), THE Stack_Editor SHALL change the Widget's `width` (Left/Right) or `height` (Up/Down) by one logical pixel, clamp it to `1 ≤ width ≤ 256 − x` and `1 ≤ height ≤ 160 − y`, keep `x` and `y` unchanged, and commit each change as one Edit_History entry.
10. WHILE a placement or resize drag is active, WHEN a second pointer goes down, THE Canvas_View SHALL ignore the second pointer for that drag.

### Requirement 14: Pointer mapping and touch input

**User Story:** As a Creator, I want my finger, pen or mouse to land on the pixel under it, after any resize or rotation, so that drawing feels accurate on every device.

#### Acceptance Criteria

1. WHEN a pointer position is mapped, THE Pointer_Mapper SHALL compute integer logical coordinates from the canvas element's current bounding rectangle as `floor((clientX − left) × 256 / width)` and `floor((clientY − top) × 160 / height)`, clamped to 0…255 and 0…159, so that a pointer at or beyond the right or bottom edge maps to 255 or 159 and a pointer at or beyond the left or top edge maps to 0.
2. IF the bounding rectangle width or height is less than or equal to 0, or any of clientX, clientY, left, top, width or height is not a finite number, THEN THE Pointer_Mapper SHALL return an invalid-geometry error and no coordinate.
3. FOR ALL integer left and top values in −10,000…10,000, integer width and height in 1…10,000, integer pointer offsets dx = clientX − left in 0…width − 1 and dy = clientY − top in 0…height − 1, and integer factors k in 1…16, THE Pointer_Mapper SHALL return the same logical coordinates for the rectangle (left, top, width, height) with pointer (left + dx, top + dy) as for the rectangle (k × left, k × top, k × width, k × height) with pointer (k × left + k × dx, k × top + k × dy) (metamorphic property, blueprint P10).
4. FOR ALL finite clientX and clientY values, including values outside the rectangle, and all rectangles with finite left and top and finite width and height greater than 0, THE Pointer_Mapper SHALL return integer coordinates within 0…255 and 0…159 (invariant).
5. WHEN a pointer sample is mapped after a viewport resize, orientation change, page scroll or Zoom_Level change, including a change that occurs during an active Stroke, THE Canvas_View SHALL pass the Pointer_Mapper the canvas bounding rectangle measured after that change, so that the sample maps to the Bitmap pixel displayed under the pointer.
6. WHEN a pointer-down in Draw_Mode starts a Stroke, THE Canvas_View SHALL capture that pointer and SHALL send samples from that pointer only to the selected Drawing_Tool until the matching pointer-up or pointer-cancel, including clamped samples while the pointer is outside the drawing surface.
7. WHILE a Stroke is active, WHEN a second pointer goes down, THE Canvas_View SHALL ignore the second pointer for drawing for its whole contact, including after the first pointer's Stroke ends, and SHALL leave the active Stroke's samples unchanged.
8. WHILE Draw_Mode is active, THE Canvas_View SHALL apply `touch-action: none` to the drawing surface only, so that a one-finger or two-finger touch on the drawing surface does not scroll or zoom the page.
9. WHILE Pan_Mode is active, THE Canvas_View SHALL allow the browser's default touch scrolling on the drawing surface.
10. THE App_Shell SHALL keep touch scrolling, wheel scrolling and browser pinch or keyboard zoom operative outside the drawing surface in Draw_Mode, Pan_Mode, Edit_Mode and Play_Mode.
11. THE Canvas_View SHALL provide Draw/Pan switching and Zoom_Level buttons for 1×, 2× and 4×, each activated by a tap, a primary mouse button click, or the Enter or Space key after Tab focus, and each exposing whether it is the current mode or Zoom_Level as a pressed state to assistive technology.
12. THE App_Shell SHALL make every action reachable by tap, primary-button click or keyboard, with no action reachable only through hover, right-click or a context menu.
13. THE Canvas_View SHALL keep a 256 × 160 backing bitmap and display the Bitmap scaled at an 8:5 aspect ratio with pixelated image rendering, with paper #FFFFFF and ink #121416, so that at 1×, 2× and 4× every displayed Bitmap pixel is a uniform block of one of those two colours with no interpolated intermediate colours.
14. IF the Pointer_Mapper returns an invalid-geometry error for a pointer sample, THEN THE Canvas_View SHALL send no sample for that event to the Drawing_Tool and SHALL leave the active Stroke's previous samples and the Bitmap unchanged.
15. IF a pointer-down on the drawing surface comes from a mouse button other than the primary button, THEN THE Canvas_View SHALL start no Stroke and SHALL leave the Bitmap unchanged.
16. WHILE Pan_Mode is active, WHEN a pointer goes down on the drawing surface, THE Canvas_View SHALL start no Stroke and SHALL leave the Bitmap and Edit_History unchanged.

### Requirement 15: Responsive layout

**User Story:** As a Creator, I want the full authoring workflow on a phone, tablet or laptop, so that I can create wherever I am.

#### Acceptance Criteria

1. WHILE the Viewport_Class is Phone, THE App_Shell SHALL show exactly one canvas workspace, a horizontal card strip listing every Card in `cardOrder` sequence, and a tool dock fixed to the bottom edge of the viewport, with no side panel visible.
2. WHILE the Viewport_Class is Phone, WHEN a Creator opens the Widget_Inspector for a selected Widget, THE App_Shell SHALL present the Widget_Inspector as a Sheet.
3. WHILE the Viewport_Class is Tablet, THE App_Shell SHALL show the Canvas_View and exactly one side panel holding the card navigator and the Widget_Inspector, with a control that collapses and expands that side panel without changing the Stack_Document or the selection.
4. WHILE the Viewport_Class is Desktop, THE App_Shell SHALL show the card navigator, the Canvas_View and the Widget_Inspector as three side-by-side regions, none overlapping another.
5. WHILE the viewport width is at least 320 CSS px in portrait or landscape orientation, THE App_Shell SHALL keep card authoring, drawing with each Drawing_Tool, widget editing, Play_Mode, export and import reachable, where reachable means visible within the viewport or brought into view by scrolling its containing panel, card strip or Sheet or by activating at most one other App_Shell control, without horizontal document scrolling.
6. WHILE the viewport width is at least 320 CSS px, THE App_Shell SHALL show no message, disabled state or hidden control that restricts any function listed in criterion 5 to a single Viewport_Class.
7. WHILE the viewport width is at least 320 CSS px, THE App_Shell SHALL render with a document scroll width equal to the viewport width at every Zoom_Level, with Canvas_View content wider than its region scrolling inside the Canvas_View and card strip content wider than the viewport scrolling inside the card strip.
8. WHEN the Viewport_Class changes through a window resize or an orientation change, THE App_Shell SHALL switch to the layout of the new Viewport_Class without a page reload and SHALL keep the Stack_Document Canonical_Form, the selected Card and Widget, the Edit_History undo and redo entries, the selected Drawing_Tool, the Zoom_Level, the Draw_Mode or Pan_Mode setting and the Edit_Mode or Play_Mode setting unchanged.
9. IF the Widget_Inspector is open with unapplied values when the Viewport_Class changes, THEN THE App_Shell SHALL show the Widget_Inspector in the new layout (as a Sheet on Phone, as a panel on Tablet and Desktop) for the same Widget with the unapplied values retained and neither applied nor discarded.
10. WHILE a Sheet's content height exceeds the Sheet's visible height, THE Sheet SHALL scroll its content vertically inside the Sheet and SHALL keep its Apply, Cancel and Close controls, where present, fully visible within the Sheet at every scroll position.
11. WHILE browser zoom is 200% and the resulting viewport width is at least 320 CSS px, THE App_Shell SHALL keep every Primary_Control reachable as defined in criterion 5, with no Primary_Control clipped or covered by another App_Shell element.
12. THE App_Shell SHALL render the Widget_Inspector and the panels of later specs (04-spellforge-ai, 05-world-pulse) through one shared Sheet and panel container that presents its content as a Sheet when the Viewport_Class is Phone and as a side panel when the Viewport_Class is Tablet or Desktop.

### Requirement 16: Touch ergonomics and virtual keyboard

**User Story:** As a Creator on a phone, I want controls large enough to tap and inputs that are not hidden by the keyboard, so that mobile editing is practical.

#### Acceptance Criteria

1. THE App_Shell SHALL render every Primary_Control, in every Viewport_Class and in both Edit_Mode and Play_Mode, with a pointer-responsive target area of at least 48 × 48 CSS px, measured at a browser page zoom of 100%, and with no overlap between the target areas of any two Primary_Controls.
2. WHILE the Viewport_Class is Phone, THE App_Shell SHALL render every single-line and multi-line text input, including the Widget_Inspector name, label, text, source and numeric geometry inputs, with a computed font size of at least 16 CSS px.
3. THE App_Shell SHALL pad each edge of the tool dock and of each Sheet that touches a viewport edge by at least the `env(safe-area-inset-*)` value for that same edge (top, right, bottom or left), so that no Primary_Control's target area lies inside a safe-area inset.
4. WHILE the virtual keyboard is open and an input inside a Sheet has focus, THE App_Shell SHALL keep the line of the focused input that contains the text caret, and the target areas of that Sheet's Apply and Cancel controls, entirely within the part of the viewport not covered by the virtual keyboard, no later than 500 ms after the virtual keyboard finishes opening or the focus moves to another input.
5. THE App_Shell SHALL size each Sheet with dynamic viewport units, with a height of at most 85dvh, and SHALL recompute that height whenever the dynamic viewport height changes.
6. IF a Sheet's content is taller than the Sheet's maximum height, THEN THE App_Shell SHALL scroll that content inside the Sheet while keeping the Sheet's Apply, Cancel and Close controls visible and operable without scrolling.
7. WHEN the virtual keyboard closes while a Sheet is open, THE App_Shell SHALL keep the Sheet open, keep every value entered in its inputs unchanged and unapplied, and return the Sheet to a height of at most 85dvh within 500 ms.

### Requirement 17: Spooky dark theme and theme preference

**User Story:** As a Creator, I want an original spooky dark look with Light and System options, so that the app feels distinctive while remaining readable.

#### Acceptance Criteria

1. WHEN the NecroCard_App is opened on a browser with no stored Theme_Preference, THE Theme_Initializer SHALL apply the Dark theme before first paint and THE Theme_Controller SHALL report the Theme_Preference as Dark, without storing a Theme_Preference until the Creator makes a selection.
2. WHEN a Creator selects Dark, Light or System, THE Theme_Controller SHALL apply the resolved theme within 1 second, without a page reload, and SHALL leave the Stack_Document, Edit_History, current Card, selected Drawing_Tool and Edit_Mode or Play_Mode unchanged.
3. WHEN a Creator selects Dark, Light or System, THE Theme_Controller SHALL store the selected Theme_Preference in that browser, so that the next load of the NecroCard_App in the same browser applies the same Theme_Preference.
4. WHEN the NecroCard_App is loaded or reloaded with a stored Theme_Preference, THE Theme_Initializer SHALL apply the theme resolved from that Theme_Preference before first paint, so that no rendered frame shows a different theme.
5. WHILE the Theme_Preference is System, WHEN the operating system color scheme changes, THE Theme_Controller SHALL apply the matching Light or Dark theme within 1 second, without a reload, and SHALL leave the Stack_Document, Edit_History and current Card unchanged.
6. IF browser storage is unavailable, or the stored Theme_Preference is a value other than Dark, Light or System, THEN THE Theme_Initializer SHALL apply the Dark theme, THE Theme_Controller SHALL still apply a later Creator selection for the current page session, and THE NecroCard_App SHALL continue without an uncaught error.
7. FOR ALL Stack_Documents and Theme_Preference changes, THE Exporter SHALL produce byte-identical Canonical_Form output before and after the change (blueprint P13).
8. THE Canvas_View SHALL display Bitmap paper and ink with the same computed color values in the Dark theme and the Light theme, and SHALL apply no CSS filter or color inversion to the Bitmap or the App_Shell.
9. THE Theme_Initializer SHALL be loaded as a same-origin external script, so that under a Content Security Policy of `script-src 'self'` without `'unsafe-inline'` the theme is applied and no policy violation is reported.
10. THE App_Shell SHALL define the Dark theme with the blueprint §1.5 token values and the Light theme with the blueprint §4.2 token values as starting values.
11. THE App_Shell SHALL show normal text with a contrast ratio of at least 4.5:1, and large text (at least 24 CSS px regular or 18.66 CSS px bold) and necessary UI boundaries (Primary_Control borders, input borders and focus indicators) with at least 3:1, against their adjacent backgrounds in the Dark theme and the Light theme and in default, hover, focus, selected and disabled states, measured with the WCAG 2.x relative-luminance contrast formula.
12. THE App_Shell SHALL use only original imagery and generic CSS font families, with no bundled font files, third-party icon packs or historical operating-system chrome.
13. WHILE the Theme_Preference is System, WHEN the NecroCard_App loads or the Creator selects System, THE Theme_Controller SHALL apply the Dark theme if the operating system reports a dark color scheme, the Light theme if it reports a light color scheme, and the Dark theme if it reports no color-scheme preference.
14. WHILE the Theme_Preference is Dark or Light, WHEN the operating system color scheme changes, THE Theme_Controller SHALL keep the currently applied theme unchanged.

### Requirement 18: Reduced motion and motion safety

**User Story:** As a Creator sensitive to motion, I want decorations and transitions turned off on request, so that I can use every feature comfortably.

#### Acceptance Criteria

1. WHILE `prefers-reduced-motion: reduce` is active, THE App_Shell SHALL render no decorative effect, where a decorative effect is any visual element of the App_Shell that conveys no information, state or affordance (for example scanlines, glow, flicker or ambient movement).
2. WHILE `prefers-reduced-motion: reduce` is active, THE App_Shell SHALL run no animation and no transition with a duration greater than 0 ms, including Sheet open and close, panel open and close, card navigation, Zoom_Level changes and scrolling triggered by the App_Shell, and SHALL show the final visual state of each such change in the first frame painted after the change.
3. WHILE `prefers-reduced-motion: reduce` is active, THE App_Shell SHALL provide every Primary_Control and every other action that is available without reduced motion, and each action SHALL produce the same Stack_Document, Edit_History, Edit_Mode or Play_Mode and Status_Region result as it does without reduced motion.
4. WHEN the `prefers-reduced-motion` value changes while the NecroCard_App is open, THE App_Shell SHALL apply criteria 1 and 2 (or end them, if the value changes to `no-preference`) within 1 second, without a page reload, and without changing the open Stack_Document, Edit_History, selected Card, selected Widget, selected Drawing_Tool, Draw_Mode or Pan_Mode, or Zoom_Level.
5. THE App_Shell SHALL limit every decorative animation to at most three flashes in any 1-second period, where a flash is a pair of opposing luminance changes in the same screen area.
6. WHILE `prefers-reduced-motion: reduce` is not active, IF a decorative animation in the App_Shell starts automatically and runs for more than 5 seconds, THEN THE App_Shell SHALL provide a control that stops or hides that animation, and SHALL keep the animation stopped or hidden for the rest of the session once the Creator uses that control.
7. THE App_Shell SHALL paint no decorative effect over the bounding box of any interactive control, text, focus indicator, validation message, the Canvas_View or the Status_Region.
8. THE App_Shell SHALL prevent decorative effects from receiving pointer or keyboard input, so that every pointer and keyboard event reaches the control, text or Canvas_View underneath.
9. THE App_Shell SHALL show every affordance and state (focus, selection, selected Drawing_Tool, Draw_Mode or Pan_Mode, Edit_Mode or Play_Mode, open Sheet, and progress of export or import) through a static visual cue such as text, an icon, a border or a fill, and each cue SHALL be identifiable from one still frame without any motion.

### Requirement 19: Keyboard access, focus and status

**User Story:** As a keyboard user, I want every control, panel and dialog to be reachable with visible focus, so that I can author and play without a pointer.

#### Acceptance Criteria

1. THE App_Shell SHALL give every interactive control a non-empty accessible name. For a control that shows visible label text, the accessible name SHALL contain that visible text. For an icon-only control, the accessible name SHALL state the control's action or target, for example the Drawing_Tool name or "Undo".
2. WHEN a control receives keyboard focus, THE App_Shell SHALL show a focus indicator that is at least 3 CSS px thick, has at least 3:1 contrast against adjacent colors in both the Dark and Light themes, and is not fully covered by the tool dock, a Sheet or the header.
3. WHEN a Player or Creator presses Tab repeatedly from the top of the page, THE App_Shell SHALL move keyboard focus through the rendered regions in this order: header and mode controls, card navigator or card strip, canvas and Widget overlay, tool dock, then open panel. Shift+Tab SHALL follow the exact reverse order. Regions not rendered in the current mode or Viewport_Class SHALL be skipped.
4. THE App_Shell SHALL make the following operable using only Tab, Shift+Tab, Enter, Space, arrow keys and Escape, with no pointer input and no point where focus cannot leave a control: card navigation, card add/rename/reorder/delete, widget add/select/edit/placement, drawing with each Drawing_Tool (Requirement 23), tool selection, Draw/Pan, zoom, undo/redo, theme selection, Edit/Play switching, export and import.
5. WHEN a Sheet or dialog opens, THE App_Shell SHALL move keyboard focus to the first focusable control or the heading inside it within 100 ms of opening.
6. WHILE a Sheet or dialog is open, THE App_Shell SHALL keep keyboard focus inside it. Tab from the last focusable control SHALL wrap to the first, and Shift+Tab from the first SHALL wrap to the last.
7. WHEN a Creator presses Escape or activates the Close control while a Sheet or dialog is open, THE App_Shell SHALL close it with the same effect as Cancel: edits not yet applied are discarded and the Stack_Document is left unchanged.
8. WHEN a Sheet or dialog closes and the control that opened it still exists, THE App_Shell SHALL return keyboard focus to that control.
9. THE Status_Region SHALL show text labels for the current mode (Edit_Mode or Play_Mode), the selected Drawing_Tool while Edit_Mode is active, and the local draft state. The draft state label SHALL be one of: unsaved or saving, saved locally, or local saving unavailable (Requirement 21).
10. WHEN a Status_Region label or a validation result changes, THE App_Shell SHALL expose the new text to assistive technology as a status announcement within 1 second of the change, without moving keyboard focus.
11. IF a Card delete or Widget delete removes the element that had keyboard focus or the control that opened a closing Sheet, THEN THE App_Shell SHALL move keyboard focus to the selected Card's entry in the card navigator or card strip after a Card delete, or to the Canvas_View Widget overlay after a Widget delete, and SHALL NOT leave focus on the page body.
12. THE App_Shell SHALL convey every status and validation result through text, or through an icon with a text alternative, in addition to color. Each input validation message SHALL be shown next to its input and be exposed to assistive technology as that input's description.

### Requirement 20: Versioned JSON export and import

**User Story:** As a Creator, I want to export my stack to a file and import it again, so that I can back up, move or share work without an account.

#### Acceptance Criteria

1. WHEN a Creator selects Export and the current Stack_Document passes Schema_Validator checks, THE Exporter SHALL produce one UTF-8 encoded JSON file with a name ending in ".json" whose content is the Canonical_Form of the current Stack_Document with `format` "necrocard" and `schemaVersion` 1, and THE App_Shell SHALL leave the current Stack_Document and Edit_History unchanged.
2. WHERE the browser supports sharing files through the native share sheet, THE App_Shell SHALL offer Share alongside Download for the exported file, and IF the share sheet is dismissed or reports a failure, THEN THE App_Shell SHALL keep Download available for the same exported file without producing a new export.
3. IF a file selected for import is larger than 1,048,576 bytes, THEN THE Importer SHALL reject the file without parsing its contents, THE App_Shell SHALL show a message stating the 1,048,576-byte limit, and THE App_Shell SHALL keep the current Stack_Document and Edit_History unchanged; a file of exactly 1,048,576 bytes or fewer SHALL proceed to parsing.
4. WHEN a Creator imports a file of at most 1,048,576 bytes that is valid JSON and passes Schema_Validator checks, THE Importer SHALL open the imported Stack_Document as the current document with an empty Edit_History, and THE App_Shell SHALL keep the previously current Stack_Document unchanged in the Draft_Store.
5. IF an imported file cannot be read, is empty, is not valid JSON, has a `format` other than "necrocard", has a `schemaVersion` other than 1, or fails any other Schema_Validator check (including Document_Limits), THEN THE Importer SHALL show a diagnostic naming the first failing path, expressed as the sequence of keys and array indexes from the document root (or stating that the file could not be read or parsed when no path applies), and THE App_Shell SHALL keep the current Stack_Document, Edit_History and Draft_Store unchanged.
6. WHEN a stack is imported, THE Importer SHALL treat each Button's `source` as the only authoritative rule text, SHALL NOT execute any Button `source` during import, and SHALL leave all executable bindings to be recomputed by spec 02.
7. FOR ALL valid Stack_Documents, THE Importer SHALL produce a Stack_Document with the same Canonical_Form after Export then Import (round-trip property, blueprint P2).
8. FOR ALL valid Stack_Documents, THE Exporter SHALL produce output byte-identical to its first export when exporting the result of importing that first export (idempotence).
9. IF a Creator selects Export while the current Stack_Document fails Schema_Validator checks (including exceeding any Document_Limits), THEN THE Exporter SHALL produce no file, THE App_Shell SHALL show a diagnostic naming the first failing path, and THE App_Shell SHALL keep the current Stack_Document and Edit_History unchanged.
10. IF a valid imported Stack_Document has the same stack Stable_ID as the current Stack_Document or a draft in the Draft_Store, THEN THE App_Shell SHALL open the imported content as a Fork with a new stack Stable_ID and SHALL keep the existing draft with that Stable_ID unchanged in the Draft_Store.

### Requirement 21: Local drafts

**User Story:** As a Creator, I want my work kept on this browser between visits, so that closing a tab does not lose my stack.

#### Acceptance Criteria

1. WHEN a Creator commits an authoring action (any Stack_Editor action recorded in Edit_History, including the end of a Stroke on pointer-up; a cancelled Stroke commits nothing), THE Draft_Store SHALL, within 2 seconds (proposed delay) of that commit, save the current Stack_Document on that browser, replacing any earlier draft that has the same stack Stable_ID; several commits inside one 2-second window MAY be combined into one save, provided the saved Stack_Document reflects the latest commit.
2. WHEN the NecroCard_App is reopened on the same browser and the Draft_Store holds at least one draft, THE App_Shell SHALL open the draft with the latest successful save time in Edit_Mode, with a Canonical_Form identical to the Canonical_Form of the Stack_Document at that save, with an empty Edit_History, and with a local draft label in the Status_Region.
3. WHILE at least one committed authoring action has not yet been saved to the Draft_Store, THE Status_Region SHALL show a text label reading unsaved or saving.
4. WHEN a Draft_Store save completes and no later commit is pending, THE Status_Region SHALL replace the unsaved or saving label with a saved-locally text label no more than 1 second (proposed delay) after the save completes.
5. IF the Draft_Store cannot save (storage unavailable, write rejected or storage quota exceeded), THEN THE Status_Region SHALL show a text label stating that local saving is unavailable, THE App_Shell SHALL keep the current Stack_Document and Edit_History unchanged in the open session, and THE App_Shell SHALL show an Export control in the current view without requiring navigation; THE Draft_Store SHALL attempt the save again on the next committed authoring action, and the unavailable label SHALL be replaced by the saved-locally label after the next successful save.
6. IF a stored draft is not valid JSON or fails Schema_Validator checks on load, THEN THE App_Shell SHALL keep the stored draft byte-for-byte unmodified in the Draft_Store, show a recovery message with an option to export the raw stored draft text byte-for-byte unchanged, and open a new blank Stack_Document with a new stack Stable_ID in Edit_Mode.
7. THE App_Shell SHALL display a text notice, reachable from the Status_Region local draft label with at most one activation, stating that local drafts are kept only on this browser, that drafts are lost when browser data is cleared, and that Export is the backup.
8. IF the NecroCard_App is opened on a browser whose Draft_Store holds no draft, THEN THE App_Shell SHALL open a new blank Stack_Document with a new stack Stable_ID in Edit_Mode and SHALL NOT show a restored local draft label until the first successful save.
9. IF a save to the Draft_Store fails or is interrupted, THEN THE Draft_Store SHALL keep the previously saved draft with the same stack Stable_ID unchanged and loadable, so that a later reopen restores that previous draft and never a partially written one.

### Requirement 22: Local showcase play and fork

**User Story:** As a new visitor, I want to play the showcase at once and make my own editable copy, so that I can try NecroCard without an account or API key.

#### Acceptance Criteria

1. WHEN a visitor opens the Showcase route, THE NecroCard_App SHALL load `public/showcase.json`, open it in Play_Mode on the first Card in `cardOrder`, and show no account creation step, sign-in form or API key prompt before the first Card is displayed.
2. WHILE the Showcase is open in Play_Mode, THE App_Shell SHALL pass every Button rule execution to the Rule_Interpreter and SHALL apply no Stack_Editor action to the Showcase.
3. WHEN a visitor selects Fork, THE Stack_Editor SHALL create a Fork whose Canonical_Form equals the Showcase's Canonical_Form except for a new stack Stable_ID, with every Card and Widget Stable_ID kept unchanged; THE App_Shell SHALL open the Fork in Edit_Mode on the first Card in `cardOrder`; and THE Draft_Store SHALL save the Fork on that browser within 2 seconds (proposed delay, same as Requirement 21).
4. WHEN a Creator commits an authoring action on a Fork, THE NecroCard_App SHALL leave `public/showcase.json` and any Showcase copy opened in Play_Mode identical in Canonical_Form to their state before the action (invariant over all authoring actions).
5. THE Showcase SHALL pass Schema_Validator checks, SHALL contain at least 1 Card and stay within Document_Limits, and SHALL contain only artwork and text created for NecroCard, with no copied third-party images, stack content or text.
6. WHILE Play_Mode is active, THE App_Shell SHALL keep score, active Card and all other game state in local memory only, SHALL write none of that state into the Stack_Document or the Draft_Store, and SHALL discard that state when the NecroCard_App is reloaded.
7. WHEN a Player switches from Play_Mode to Edit_Mode, THE App_Shell SHALL show a Stack_Document whose Canonical_Form is identical to its Canonical_Form when Play_Mode was entered.
8. IF `public/showcase.json` cannot be loaded or fails Schema_Validator checks, THEN THE App_Shell SHALL show an error message stating that the Showcase is unavailable, SHALL offer to open a new blank Stack_Document, and SHALL leave every draft in the Draft_Store unchanged.
9. IF a visitor attempts to enter Edit_Mode while the Showcase itself is open, THEN THE App_Shell SHALL keep the Showcase in Play_Mode, SHALL apply no authoring action to the Showcase, and SHALL offer Fork as the way to edit.
10. IF the Draft_Store cannot save a newly created Fork, THEN THE App_Shell SHALL keep the Fork open in Edit_Mode, THE Status_Region SHALL show that local saving is unavailable, and THE App_Shell SHALL offer Export, matching Requirement 21 criterion 5.

### Requirement 23: Keyboard pixel drawing

**User Story:** As a Creator who uses a keyboard instead of a pointer, I want to move a pixel cursor and draw, erase and fill with keys, so that I can create card artwork without a mouse, pen or touch screen.

#### Acceptance Criteria

1. WHILE Edit_Mode and Draw_Mode are active and keyboard focus is on the drawing surface, THE Canvas_View SHALL show the Keyboard_Cursor as an outline enclosing the on-screen square of the logical pixel at the Keyboard_Cursor position at every Zoom_Level (1×, 2× and 4×), whether or not a keyboard Stroke is in progress. The outline SHALL be at least 1 CSS px thick, SHALL have at least 3:1 contrast against both the paper (0) and ink (1) pixel colors in both the Dark and Light themes, and SHALL be identifiable by its outline shape without relying on color alone. The outline SHALL change no Bitmap pixel value.
2. WHILE Edit_Mode and Draw_Mode are active and keyboard focus is on the drawing surface, THE Status_Region SHALL show the Keyboard_Cursor logical coordinates as text in the form "x X, y Y", for example "x 128, y 80".
3. WHILE Edit_Mode and Draw_Mode are active and keyboard focus is on the drawing surface, THE Status_Region SHALL show the text "pen down" while a keyboard Stroke is in progress and the text "pen up" otherwise.
4. WHEN the drawing surface of a Card receives keyboard focus for the first time in the current page session, THE Canvas_View SHALL place the Keyboard_Cursor of that Card at logical pixel (128, 80) (proposed start).
5. WHEN the drawing surface of a Card receives keyboard focus again in the same page session, THE Canvas_View SHALL restore the Keyboard_Cursor position that Card had when its drawing surface last lost keyboard focus.
6. THE Canvas_View SHALL keep Keyboard_Cursor positions in page memory only, so that no Stack_Document, Draft_Store draft or Exporter output contains a Keyboard_Cursor position, and a page reload resets every Card's Keyboard_Cursor to the start position of criterion 4.
7. WHILE Edit_Mode and Draw_Mode are active and keyboard focus is on the drawing surface, WHEN a Creator presses an arrow key with no Shift, Ctrl, Alt or Meta modifier, THE Canvas_View SHALL move the Keyboard_Cursor 1 logical pixel in the arrow's direction, clamped to 0 ≤ x ≤ 255 and 0 ≤ y ≤ 159, SHALL keep the page scroll position unchanged on that key press, and, while no keyboard Stroke is in progress, SHALL change no pixel and add no Edit_History entry for that key press.
8. WHILE Edit_Mode and Draw_Mode are active and keyboard focus is on the drawing surface, WHEN a Creator presses an arrow key with Shift and no Ctrl, Alt or Meta modifier, THE Canvas_View SHALL move the Keyboard_Cursor 8 logical pixels (proposed step) in the arrow's direction, clamped to 0 ≤ x ≤ 255 and 0 ≤ y ≤ 159, SHALL keep the page scroll position unchanged on that key press, and, while no keyboard Stroke is in progress, SHALL change no pixel and add no Edit_History entry for that key press.
9. WHILE keyboard focus is on the drawing surface, WHEN a Creator presses an arrow key with or without Shift, THE Stack_Editor SHALL keep the geometry of every Widget unchanged.
10. WHILE keyboard focus is on the Canvas_View Widget overlay, WHEN a Creator presses an arrow key with or without Shift, THE Canvas_View SHALL keep every Keyboard_Cursor position unchanged, and the key press SHALL have only the effect defined in Requirement 13 criteria 2 and 9.
11. WHILE Edit_Mode and Draw_Mode are active, keyboard focus is on the drawing surface, no keyboard Stroke is in progress and the Pencil or Eraser is selected, WHEN a Creator presses Space, THE Stack_Editor SHALL set the single pixel at the Keyboard_Cursor to 1 for the Pencil or to 0 for the Eraser, commit the change as exactly one Edit_History entry if the pixel value changed, add no Edit_History entry if the pixel already had that value, and THE Canvas_View SHALL keep the page scroll position unchanged on that key press.
12. WHILE Edit_Mode and Draw_Mode are active, keyboard focus is on the drawing surface and Dither_Fill is selected, WHEN a Creator presses Space, THE Stack_Editor SHALL apply Dither_Fill at the Keyboard_Cursor pixel with exactly the region, pattern, locality, history and no-change behavior that Requirement 10 defines for a tap mapped to that pixel, and THE Canvas_View SHALL keep the page scroll position unchanged on that key press.
13. WHILE Edit_Mode and Draw_Mode are active, keyboard focus is on the drawing surface, no keyboard Stroke is in progress, no pointer Stroke is in progress and the Pencil or Eraser is selected, WHEN a Creator presses Enter, THE Canvas_View SHALL start a keyboard Stroke (pen down) whose first sample is the Keyboard_Cursor position, and THE Stack_Editor SHALL set that pixel to 1 for the Pencil or to 0 for the Eraser as Requirement 9 criterion 8 defines for a pointer-down, as part of the uncommitted Stroke that is committed only under criterion 15 or 18.
14. WHILE a keyboard Stroke is in progress, WHEN an arrow key press changes the Keyboard_Cursor position, THE Canvas_View SHALL send the new Keyboard_Cursor position as the next Stroke sample, and THE Stack_Editor SHALL apply the selected Drawing_Tool to every pixel of the 8-connected line between the previous sample and the new sample, using the rasterization rule of Requirement 9 criteria 1 and 2. An arrow key press that leaves the Keyboard_Cursor position unchanged because of clamping SHALL add no Stroke sample.
15. WHILE a keyboard Stroke is in progress, WHEN a Creator presses Enter, THE Canvas_View SHALL end the keyboard Stroke (pen up), and THE Stack_Editor SHALL commit the Stroke as exactly one Edit_History entry if the Stroke changed at least 1 pixel, so that one undo restores the Bitmap to its exact pre-Stroke value (Requirement 9 criterion 5), or add no Edit_History entry and leave the Bitmap unchanged if the Stroke changed no pixel.
16. WHILE a keyboard Stroke is in progress, WHEN a Creator presses Escape, THE Canvas_View SHALL end the keyboard Stroke and discard its uncommitted preview, and THE Stack_Editor SHALL keep the Bitmap identical to its value before the Stroke began and add no Edit_History entry, with the same result as a pointer-cancel under Requirement 9 criterion 6.
17. WHEN a Creator presses Tab or Shift+Tab while keyboard focus is on the drawing surface, THE App_Shell SHALL move keyboard focus off the drawing surface to the next or previous focusable control in the order of Requirement 19 criterion 3.
18. IF a keyboard Stroke is in progress and any of these occurs: keyboard focus leaves the drawing surface (by Tab, Shift+Tab, pointer activation of another control, the browser tab or window losing focus, or any other focus change), Edit_Mode or Draw_Mode ends, the selected Card changes, the selected Drawing_Tool changes, or a Creator selects Undo or Redo, THEN THE Canvas_View SHALL end the keyboard Stroke (pen up) and THE Stack_Editor SHALL commit it with the same result as criterion 15 before applying that change, so that a selected Undo or Redo acts on an Edit_History that already contains the committed Stroke.
19. IF a pointer goes down on the drawing surface while a keyboard Stroke is in progress, THEN THE Canvas_View SHALL start no pointer Stroke for that pointer, SHALL apply no Drawing_Tool action for that pointer's samples, and SHALL leave the keyboard Stroke's samples unchanged.
20. FOR ALL Bitmaps, Pencil or Eraser selections and sequences of 1 or more in-bounds logical sample positions in which each pair of consecutive samples differs in exactly one axis by 1 to 8 logical pixels (the sequences that keyboard input can produce), THE Stack_Editor SHALL produce a byte-identical `bitmapBase64` value and the same number of added Edit_History entries for a keyboard Stroke ended by pen up and for a pointer Stroke ended by pointer-up with the same sample sequence (model-based property).
21. WHILE Edit_Mode and Draw_Mode are active and keyboard focus is on the drawing surface, IF a Creator presses Space while a keyboard Stroke is in progress, presses Enter while Dither_Fill is selected, or presses Escape while no keyboard Stroke is in progress, THEN THE Stack_Editor SHALL leave the Bitmap and Edit_History unchanged, and THE Canvas_View SHALL keep the keyboard Stroke state (pen down or pen up), the Keyboard_Cursor position, keyboard focus and the page scroll position unchanged.
22. IF a Creator presses Space or Enter while keyboard focus is on the drawing surface and a pointer Stroke is in progress, THEN THE Canvas_View SHALL start no keyboard Stroke and SHALL continue the pointer Stroke with its samples unchanged, and THE Stack_Editor SHALL apply no Drawing_Tool action for that key press.
23. WHILE keyboard focus is on the drawing surface, WHEN the browser reports a press of Space, Enter or Escape as an auto-repeat of a key the Creator is holding down, THE Canvas_View SHALL ignore that press and keep the page scroll position unchanged, so that holding the key has the same result as one press, and THE Canvas_View SHALL treat each auto-repeated arrow key press as a separate press under criteria 7, 8 and 14.

### Requirement 24: Kiro development hooks

**User Story:** As a team member, I want the Kiro IDE to type-check my source after each save and run the core checks at the end of each agent turn, so that I see breakage early without the hooks changing any file.

#### Acceptance Criteria

1. THE Hook_Config SHALL parse as valid JSON and SHALL use the blueprint §3.4 format: a top-level `version` equal to "v1" and a `hooks` array in which every entry has a `name`, a PascalCase `trigger`, an `action` whose `type` is "command" and whose `command` is a non-empty string, an integer `timeout` in seconds and a boolean `enabled`.
2. THE Hook_Config SHALL define exactly two hooks, named "Type safety after source edits" and "Core invariants at turn end", and no other hook.
3. THE "Type safety after source edits" hook SHALL have trigger `PostFileSave`, command `npm run typecheck` and a `timeout` of 30, unless criterion 9 requires a larger value.
4. THE "Type safety after source edits" hook SHALL have a `matcher` regular expression that matches the path of every `.ts` or `.tsx` file under `src/` or `supabase/functions/`, whether the path is relative or absolute and whether its separators are forward slashes or backslashes (for example `src/domain/bitmap.ts`, `src\app\AppShell.tsx`, `supabase/functions/ai/index.ts` and `C:\repo\supabase\functions\ai\index.ts`).
5. THE "Type safety after source edits" hook `matcher` SHALL NOT match a path whose file extension is other than `.ts` or `.tsx`, or a path that contains neither a `src` directory segment nor consecutive `supabase` and `functions` directory segments (for example `src/styles/app.css`, `src/domain/bitmap.ts.bak`, `tests/unit/limits.test.ts`, `scripts/check-edge.mjs` and `vite.config.ts`).
6. THE "Core invariants at turn end" hook SHALL have trigger `Stop`, command `npm run check:core`, no `matcher` and a `timeout` of 60, unless criterion 9 requires a larger value.
7. THE Hook_Config SHALL contain only read-only hook commands: no hook command SHALL create, modify or delete any tracked file, any source or test file, or any file under `docs/`, including `docs/decisions.md` and `docs/kiro-evidence.md`.
8. THE Hook_Config SHALL set `enabled` to true for a hook only after that hook's command has exited with status 0 on the current working tree on the development machine in each of 3 consecutive runs, and only after `docs/decisions.md` records, with the date, each run time and the median run time in seconds.
9. IF any measured run of a hook command takes longer than that hook's `timeout`, THEN the hook's scope SHALL be reduced (a narrower `matcher` or a narrower command) or its `timeout` SHALL be raised to a value of at least the longest measured run time, and `docs/decisions.md` SHALL record, with the date, the measured times, the change made and the reason.
10. `docs/kiro-evidence.md` SHALL record a Hook_Config hook as used only after the Kiro_IDE has been observed running it: one save of a file matched by the "Type safety after source edits" `matcher` for that hook, and one completed agent turn for the "Core invariants at turn end" hook.
11. WHEN the Kiro_IDE is observed running a Hook_Config hook, `docs/kiro-evidence.md` SHALL contain a row in the table of Requirement 4 criterion 16 that gives the observation date in YYYY-MM-DD form, Requirement 24, the hook trigger, the hook command, the exit status and the duration in seconds.
12. IF the Kiro_IDE does not run a Hook_Config hook after its trigger event occurs, THEN `docs/kiro-evidence.md` SHALL record that hook as "not observed" with the date and the Kiro_IDE version, and SHALL NOT record it as "pass".
13. THE `docs/decisions.md` file SHALL contain an entry dated in YYYY-MM-DD form that records the Kiro_IDE version used for the observations of criteria 10 to 12.
