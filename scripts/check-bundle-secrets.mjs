// Bundle_Secret_Check (Requirements 3.9, 3.10, 3.11).
// Scans every file under dist/ as bytes and reports `<path>: <pattern name>`
// per finding, then the finding count. Matched values are never printed.
// Exit codes: 0 no findings, 1 findings or configuration failure,
// 2 dist/ missing or empty.

import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  NEBIUS_EXACT_MIN_LENGTH,
  buildSecretScanConfig,
  parseEnvAssignments,
  parseEnvNames,
  scanText,
} from "./lib/secretPatterns.mjs";

const DEFAULT_ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));

/**
 * Every regular file under `dir`, recursively, as absolute paths in sorted
 * order. Symbolic links are followed once; directory cycles are skipped.
 * @param {string} dir
 * @returns {string[]}
 */
export function listFiles(dir) {
  /** @type {string[]} */
  const files = [];
  /** @type {Set<string>} */
  const seenDirs = new Set();
  /** @param {string} current */
  const walk = (current) => {
    const real = realpathSync(current);
    if (seenDirs.has(real)) return;
    seenDirs.add(real);
    const entries = readdirSync(current, { withFileTypes: true }).sort((a, b) =>
      a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
    );
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) files.push(full);
      else if (entry.isSymbolicLink()) {
        const st = statSync(full, { throwIfNoEntry: false });
        if (st?.isDirectory()) walk(full);
        else if (st?.isFile()) files.push(full);
      }
    }
  };
  walk(dir);
  return files;
}

/**
 * Finds the real NEBIUS_API_KEY for the exact-value layer: the process
 * environment first, then the ignored `supabase/functions/.env.local`.
 * The value stays in memory; only `source` and `status` are ever printed.
 * @param {string} root
 * @param {NodeJS.ProcessEnv} env
 * @returns {{ value: string | null, status: string }}
 */
export function resolveNebiusKey(root, env) {
  const fromEnv = env.NEBIUS_API_KEY;
  if (typeof fromEnv === "string" && fromEnv !== "") {
    return fromEnv.length >= NEBIUS_EXACT_MIN_LENGTH
      ? { value: fromEnv, status: "run (key from environment)" }
      : { value: null, status: `not run (NEBIUS_API_KEY shorter than ${NEBIUS_EXACT_MIN_LENGTH} characters)` };
  }
  const localFile = path.join(root, "supabase", "functions", ".env.local");
  if (existsSync(localFile)) {
    const fromFile = parseEnvAssignments(readFileSync(localFile, "utf8")).get("NEBIUS_API_KEY");
    if (typeof fromFile === "string" && fromFile !== "") {
      return fromFile.length >= NEBIUS_EXACT_MIN_LENGTH
        ? { value: fromFile, status: "run (key from supabase/functions/.env.local)" }
        : { value: null, status: `not run (NEBIUS_API_KEY shorter than ${NEBIUS_EXACT_MIN_LENGTH} characters)` };
    }
  }
  return { value: null, status: "not run (NEBIUS_API_KEY not set)" };
}

/**
 * @param {{ root?: string, env?: NodeJS.ProcessEnv, log?: (line: string) => void, error?: (line: string) => void }} [options]
 * @returns {number} Exit code.
 */
export function run(options = {}) {
  const root = options.root ?? DEFAULT_ROOT;
  const env = options.env ?? process.env;
  const log = options.log ?? ((line) => console.log(line));
  const error = options.error ?? ((line) => console.error(line));

  const distDir = path.join(root, "dist");
  const distStat = statSync(distDir, { throwIfNoEntry: false });
  if (!distStat || !distStat.isDirectory()) {
    error("check-bundle-secrets: dist/ not found; run `npm run build` first.");
    return 2;
  }
  const files = listFiles(distDir);
  if (files.length === 0) {
    error("check-bundle-secrets: dist/ contains no files; run `npm run build` first.");
    return 2;
  }

  const envExample = path.join(root, "supabase", "functions", ".env.example");
  if (!existsSync(envExample)) {
    error("check-bundle-secrets: supabase/functions/.env.example not found; cannot list server variable names.");
    return 1;
  }
  const serverEnvNames = parseEnvNames(readFileSync(envExample, "utf8"));
  const nebius = resolveNebiusKey(root, env);
  const config = buildSecretScanConfig({ serverEnvNames, nebiusKey: nebius.value });

  log(`nebius exact-value check: ${nebius.status}`);

  let count = 0;
  for (const file of files) {
    const rel = path.relative(distDir, file).split(path.sep).join("/");
    const text = readFileSync(file).toString("latin1");
    for (const finding of scanText(text, config)) {
      log(`${rel}: ${finding.pattern}`);
      count += 1;
    }
  }
  log(`Scanned ${files.length} file(s) under dist/`);
  log(`${count} finding(s)`);
  return count > 0 ? 1 : 0;
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
