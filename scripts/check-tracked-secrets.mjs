// Tracked-file secret check (Requirement 4.17).
// Reads the local `.my_env` (from NECROCARD_MY_ENV, ../.my_env or ./.my_env),
// collects every value of 8 or more characters, and fails if `.my_env` is
// tracked or any file listed by `git ls-files` contains one of the values.
// Findings print only `<path>: value of <KEY>`; values stay in memory and are
// never printed, logged or written.
// Public defaults: the non-empty values of the tracked
// `supabase/functions/.env.example` (blueprint §4.4) are public. A `.my_env`
// value exactly equal to one of them is not searched for, unless its
// `.my_env` label is a credential variable. A non-empty credential variable in
// the example is itself a finding.
// Exit codes: 0 clean or skipped (.my_env absent), 1 findings,
// 2 `git ls-files` could not run.

import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const DEFAULT_ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
export const MIN_VALUE_LENGTH = 8;

// Only conventional upper-case variable names are used as labels, so a
// free-text secret that happens to contain `=` or `:` is never printed as a key.
const ENV_KEY = /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*$/;
const ASSIGNMENT = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/;
const COLON_PAIR = /^([A-Za-z_][A-Za-z0-9_]*)\s*:(?!\/\/)\s*(.*)$/;
const GITHUB_REPO_URL =
  /^(?:(?:https?:\/\/|ssh:\/\/git@)?(?:www\.)?github\.com\/|git@github\.com:)[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+?(?:\.git)?\/?$/i;
const EDGE_PUNCTUATION = /^["'`(<[{]+|["'`)>\]},;.]+$/g;

export const PUBLIC_DEFAULTS_PATH = "supabase/functions/.env.example";
const CREDENTIAL_NAMES = new Set(["NEBIUS_API_KEY", "MCP_SERVICE_TOKEN"]);
const CREDENTIAL_PART = /KEY|TOKEN|SECRET|PASS/;

/**
 * True for `NEBIUS_API_KEY`, `MCP_SERVICE_TOKEN` and any name containing KEY,
 * TOKEN, SECRET or PASS (case-insensitive).
 * @param {string} name
 * @returns {boolean}
 */
export function isCredentialName(name) {
  const upper = name.toUpperCase();
  return CREDENTIAL_NAMES.has(upper) || CREDENTIAL_PART.test(upper);
}

/**
 * Parses `supabase/functions/.env.example`. Each non-empty `NAME=value`
 * assignment gives a public default, except that a credential variable with a
 * value is returned in `credentialsWithValue` and never becomes a default.
 * Blank lines, `#` comments and empty assignments are ignored.
 * @param {string} text
 * @returns {{ defaults: Set<string>, credentialsWithValue: string[] }}
 */
export function parsePublicDefaults(text) {
  /** @type {Set<string>} */
  const defaults = new Set();
  /** @type {string[]} */
  const credentialsWithValue = [];
  for (const raw of text.replace(/^\uFEFF/, "").split(/\r\n|\n|\r/)) {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) continue;
    const pair = ASSIGNMENT.exec(line);
    if (!pair) continue;
    const name = pair[1] ?? "";
    const value = unquote((pair[2] ?? "").trim());
    if (value === "") continue;
    if (isCredentialName(name)) {
      if (!credentialsWithValue.includes(name)) credentialsWithValue.push(name);
      continue;
    }
    defaults.add(value);
  }
  return { defaults, credentialsWithValue };
}

/**
 * True for a plain GitHub repository URL with no credentials, such as
 * `https://github.com/org/repo.git` or `git@github.com:org/repo.git`.
 * @param {string} value
 * @returns {boolean}
 */
export function isGitHubRepoUrl(value) {
  return GITHUB_REPO_URL.test(value);
}

/**
 * @param {string} value
 * @returns {string}
 */
function unquote(value) {
  if (value.length >= 2) {
    const q = value[0];
    if ((q === '"' || q === "'" || q === "`") && value.endsWith(q)) return value.slice(1, -1);
  }
  return value;
}

/**
 * Candidate values of one whitespace-separated token: the token, the token
 * without surrounding quotes or punctuation, and the part after a first `=`
 * or `:` (a `:` that starts `//` is part of a URL and is not split).
 * @param {string} token
 * @returns {string[]}
 */
function tokenVariants(token) {
  const stripped = token.replace(EDGE_PUNCTUATION, "");
  /** @type {string[]} */
  const variants = [token, stripped];
  for (const base of [token, stripped]) {
    const eq = base.indexOf("=");
    if (eq !== -1) variants.push(unquote(base.slice(eq + 1)));
    const colon = base.indexOf(":");
    if (colon !== -1 && !base.startsWith("//", colon + 1)) variants.push(unquote(base.slice(colon + 1)));
  }
  return [...new Set(variants)];
}

/**
 * Parses `.my_env`, which is not a strict dotenv file. `KEY=value` and
 * `KEY: value` lines give values labelled with KEY; every other line gives
 * each whitespace-separated token as a value labelled `line N`. Values shorter
 * than 8 characters and plain GitHub repository URLs are dropped.
 * @param {string} text
 * @returns {{ label: string, value: string }[]}
 */
export function parseMyEnv(text) {
  /** @type {{ label: string, value: string }[]} */
  const out = [];
  /** @type {Set<string>} */
  const seen = new Set();
  /**
   * @param {string} label
   * @param {string} value
   */
  const add = (label, value) => {
    if (value.length < MIN_VALUE_LENGTH || isGitHubRepoUrl(value)) return;
    const key = `${label}\u0000${value}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ label, value });
  };
  /**
   * @param {string} label
   * @param {string} text
   */
  const addTokens = (label, text) => {
    for (const token of text.split(/\s+/)) {
      if (token === "") continue;
      const variants = tokenVariants(token);
      if (variants.some(isGitHubRepoUrl)) continue;
      for (const v of variants) add(label, v);
    }
  };

  text.replace(/^\uFEFF/, "").split(/\r\n|\n|\r/).forEach((raw, index) => {
    const line = raw.trim();
    if (line === "") return;
    const pair = ASSIGNMENT.exec(line) ?? COLON_PAIR.exec(line);
    const key = pair?.[1] ?? "";
    const value = unquote((pair?.[2] ?? "").trim());
    if (pair && ENV_KEY.test(key)) {
      if (!/^=*$/.test(value)) {
        if (!isGitHubRepoUrl(value)) add(key, value);
        addTokens(key, value);
        return;
      }
      // `NEBIUS_API_KEY=` is an empty assignment with nothing to look for. A
      // key without an underscore followed only by `=` may instead be a padded
      // base32/base64 secret, so that line is treated as free text below.
      if (key.includes("_")) return;
    }
    addTokens(`line ${index + 1}`, line);
  });
  return out;
}

/**
 * First existing `.my_env` candidate: NECROCARD_MY_ENV, then `../.my_env`
 * and `./.my_env` relative to the repository root.
 * @param {string} root
 * @param {NodeJS.ProcessEnv} env
 * @returns {string | null}
 */
export function findMyEnv(root, env) {
  const candidates = [];
  if (env.NECROCARD_MY_ENV) candidates.push(path.resolve(env.NECROCARD_MY_ENV));
  candidates.push(path.resolve(root, "..", ".my_env"), path.resolve(root, ".my_env"));
  for (const c of candidates) if (statSync(c, { throwIfNoEntry: false })?.isFile()) return c;
  return null;
}

/**
 * @param {string} root
 * @returns {string[] | null} Tracked paths relative to `root`, or null when git fails.
 */
function gitLsFiles(root) {
  const result = spawnSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  if (result.error || result.status !== 0) return null;
  return (result.stdout ?? "").split("\0").filter((p) => p !== "");
}

/**
 * @param {{ root?: string, env?: NodeJS.ProcessEnv, log?: (line: string) => void, error?: (line: string) => void, listTracked?: (root: string) => string[] | null }} [options]
 *   `listTracked` replaces `git ls-files` (for tests).
 * @returns {number} Exit code.
 */
export function run(options = {}) {
  const root = options.root ?? DEFAULT_ROOT;
  const env = options.env ?? process.env;
  const log = options.log ?? ((line) => console.log(line));
  const error = options.error ?? ((line) => console.error(line));
  const listTracked = options.listTracked ?? gitLsFiles;

  const myEnvPath = findMyEnv(root, env);
  if (myEnvPath === null) {
    log("SKIPPED: .my_env not found");
    return 0;
  }

  const tracked = listTracked(root);
  if (tracked === null) {
    error("check-tracked-secrets: `git ls-files` failed; run inside a Git repository.");
    return 2;
  }

  let findings = 0;
  let scanned = 0;

  /** @type {Set<string>} */
  let publicDefaults = new Set();
  const examplePath = path.resolve(root, PUBLIC_DEFAULTS_PATH);
  const exampleTracked = tracked.some((rel) => rel.split(path.sep).join("/") === PUBLIC_DEFAULTS_PATH);
  if (exampleTracked && statSync(examplePath, { throwIfNoEntry: false })?.isFile()) {
    const parsed = parsePublicDefaults(readFileSync(examplePath, "utf8"));
    publicDefaults = parsed.defaults;
    for (const name of parsed.credentialsWithValue) {
      error(`${PUBLIC_DEFAULTS_PATH}: credential variable ${name} has a value`);
      findings += 1;
    }
  }

  /** @type {Set<string>} */
  const exempted = new Set();
  const values = parseMyEnv(readFileSync(myEnvPath, "utf8"))
    .filter(({ label, value }) => {
      if (isCredentialName(label) || !publicDefaults.has(value)) return true;
      exempted.add(value);
      return false;
    })
    .map(({ label, value }) => ({
      label,
      bytes: Buffer.from(value, "utf8"),
    }));
  log(`Exempted ${exempted.size} public default value(s) from ${PUBLIC_DEFAULTS_PATH}`);

  for (const rel of tracked) {
    const shown = rel.split(path.sep).join("/");
    const abs = path.resolve(root, rel);
    if (path.basename(rel) === ".my_env") {
      error(`${shown}: .my_env is tracked`);
      findings += 1;
      continue;
    }
    if (abs === myEnvPath || !existsSync(abs) || !statSync(abs).isFile()) continue;
    const content = readFileSync(abs);
    scanned += 1;
    /** @type {Set<string>} */
    const labels = new Set();
    for (const { label, bytes } of values) {
      if (!labels.has(label) && content.indexOf(bytes) !== -1) labels.add(label);
    }
    for (const label of labels) {
      error(`${shown}: value of ${label}`);
      findings += 1;
    }
  }

  log(`Scanned ${scanned} tracked file(s); ${findings} finding(s)`);
  return findings > 0 ? 1 : 0;
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
