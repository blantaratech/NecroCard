// Edge_Checker (Requirements 3.4, 3.5, 3.6, 3.7).
// Requires the npm-installed Deno 2.9.6, then runs
// `deno check --config supabase/functions/deno.json <entry>` for every
// supabase/functions/*/index.ts (skipping _shared). Every entry point is
// checked before the script exits non-zero, and each failing file is named.

import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const EXPECTED_DENO_VERSION = "2.9.6";

const DEFAULT_ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const IS_WINDOWS = process.platform === "win32";
// Supabase function names; anything else is refused rather than passed to a shell.
const FUNCTION_NAME = /^[A-Za-z0-9_-]+$/;

/**
 * Version from the first line of `deno --version` output, for example
 * `deno 2.9.6 (stable, release, x86_64-pc-windows-msvc)`, or null.
 * @param {string} output
 * @returns {string | null}
 */
export function parseDenoVersion(output) {
  const first = output.replace(/^\uFEFF/, "").split(/\r?\n/, 1)[0] ?? "";
  const m = /^deno\s+(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)(?:\s|$)/.exec(first.trim());
  return m ? (m[1] ?? null) : null;
}

/**
 * Entry points `supabase/functions/<name>/index.ts`, relative to `root`
 * with forward slashes, sorted. `_shared` and dot-directories are skipped.
 * @param {string} root
 * @returns {string[]}
 */
export function listEntryPoints(root) {
  const functionsDir = path.join(root, "supabase", "functions");
  if (!statSync(functionsDir, { throwIfNoEntry: false })?.isDirectory()) return [];
  return readdirSync(functionsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name !== "_shared" && !d.name.startsWith("."))
    .map((d) => d.name)
    .filter((name) => existsSync(path.join(functionsDir, name, "index.ts")))
    .sort()
    .map((name) => `supabase/functions/${name}/index.ts`);
}

/**
 * Copy of `env` with the given directories prepended to PATH (whatever the
 * key's case is on Windows).
 * @param {NodeJS.ProcessEnv} env
 * @param {string[]} dirs
 * @returns {NodeJS.ProcessEnv}
 */
function withBinOnPath(env, dirs) {
  const out = { ...env };
  const key = Object.keys(out).find((k) => k.toUpperCase() === "PATH") ?? "PATH";
  out[key] = [...dirs, out[key] ?? ""].filter((p) => p !== "").join(path.delimiter);
  out.DENO_NO_UPDATE_CHECK = "1";
  return out;
}

/**
 * Runs the npm-installed `deno` with fixed arguments. On Windows the npm bin
 * shim is a `.cmd` file, so a shell is required; arguments are quoted and
 * joined into one command string. The program name stays unquoted: cmd.exe
 * resolves `%~dp0` inside the shim wrongly when a quoted name is found via
 * PATH ("The system cannot find the path specified").
 * @param {string[]} args
 * @param {{ cwd: string, env: NodeJS.ProcessEnv }} options
 * @returns {{ status: number | null, stdout: string, stderr: string, missing: boolean }}
 */
function runDeno(args, { cwd, env }) {
  const result = IS_WINDOWS
    ? spawnSync(["deno", ...args.map((a) => `"${a}"`)].join(" "), { cwd, env, shell: true, encoding: "utf8" })
    : spawnSync("deno", args, { cwd, env, encoding: "utf8" });
  const err = /** @type {NodeJS.ErrnoException | undefined} */ (result.error);
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    missing: err?.code === "ENOENT",
  };
}

/**
 * @param {{ root?: string, env?: NodeJS.ProcessEnv, log?: (line: string) => void, error?: (line: string) => void }} [options]
 * @returns {number} Exit code.
 */
export function run(options = {}) {
  const root = options.root ?? DEFAULT_ROOT;
  const log = options.log ?? ((line) => console.log(line));
  const error = options.error ?? ((line) => console.error(line));
  const binDirs = [...new Set([path.join(root, "node_modules", ".bin"), path.join(DEFAULT_ROOT, "node_modules", ".bin")])];
  const env = withBinOnPath(options.env ?? process.env, binDirs);

  const version = runDeno(["--version"], { cwd: root, env });
  const found = version.status === 0 ? parseDenoVersion(version.stdout) : null;
  if (found === null) {
    const firstLine = (version.stdout.split(/\r?\n/, 1)[0] ?? "").trim().slice(0, 120);
    if (version.missing || version.status !== 0 || firstLine === "") {
      error(`check-edge: expected Deno ${EXPECTED_DENO_VERSION}, but no Deno executable was found (run npm install).`);
    } else {
      error(`check-edge: expected Deno ${EXPECTED_DENO_VERSION}, found unrecognised version output '${firstLine}'.`);
    }
    return 1;
  }
  if (found !== EXPECTED_DENO_VERSION) {
    error(`check-edge: expected Deno ${EXPECTED_DENO_VERSION}, found Deno ${found}.`);
    return 1;
  }
  log(`check-edge: Deno ${found}`);

  const config = "supabase/functions/deno.json";
  const frozen = existsSync(path.join(root, "supabase", "functions", "deno.lock")) ? ["--frozen"] : [];
  const entries = listEntryPoints(root);
  /** @type {string[]} */
  const failed = [];
  for (const entry of entries) {
    const name = entry.split("/")[2] ?? "";
    if (!FUNCTION_NAME.test(name)) {
      error(`FAIL ${entry} (function directory name must match ${FUNCTION_NAME.source})`);
      failed.push(entry);
      continue;
    }
    const result = runDeno(["check", ...frozen, "--config", config, entry], { cwd: root, env });
    if (result.stdout.trim() !== "") log(result.stdout.trimEnd());
    if (result.stderr.trim() !== "") error(result.stderr.trimEnd());
    if (result.status === 0) {
      log(`ok   ${entry}`);
    } else {
      error(`FAIL ${entry}`);
      failed.push(entry);
    }
  }

  log(`Checked ${entries.length} entry point(s)`);
  if (failed.length > 0) {
    error(`${failed.length} entry point(s) failed:`);
    for (const f of failed) error(`  ${f}`);
    return 1;
  }
  return 0;
}

/**
 * @param {string[]} argv
 * @returns {string | undefined}
 */
function rootArg(argv) {
  const i = argv.indexOf("--root");
  return i !== -1 && argv[i + 1] ? path.resolve(argv[i + 1]) : undefined;
}

/**
 * @param {string} metaUrl
 * @returns {boolean}
 */
function isMain(metaUrl) {
  const entry = process.argv[1];
  if (!entry) return false;
  const self = path.resolve(fileURLToPath(metaUrl));
  const invoked = path.resolve(entry);
  return process.platform === "win32" ? self.toLowerCase() === invoked.toLowerCase() : self === invoked;
}

if (isMain(import.meta.url)) {
  process.exitCode = run({ root: rootArg(process.argv.slice(2)) });
}
