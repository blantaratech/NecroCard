// Secret patterns for the Bundle_Secret_Check (Requirements 3.9, 3.11).
// Pure: no file system or environment access. Callers pass in the server
// variable names and the optional exact Nebius key, and get back findings that
// carry a pattern name and an offset only. Matched text is never returned.

/** Pattern names reported by scanText (design table, Requirement 3.9). */
export const PATTERN_NAMES = /** @type {const} */ ([
  "supabase-secret-key",
  "supabase-service-role-jwt",
  "nebius-api-key",
  "server-env-assignment",
]);

/** Minimum length of a NEBIUS_API_KEY value used for the exact-value layer. */
export const NEBIUS_EXACT_MIN_LENGTH = 8;

/** Heuristic layer: anchor words, window size and entropy threshold. */
export const NEBIUS_ANCHOR = /nebius|tokenfactory|bearer/gi;
export const NEBIUS_WINDOW = 120;
export const NEBIUS_MIN_ENTROPY = 4.0;

const SB_SECRET = /\bsb_secret_[A-Za-z0-9_-]{20,}/g;
const JWT = /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{20,}/g;
const JWT_WHOLE = /^eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
// A quoted token, or one that follows a space inside a string such as
// "Bearer <token>". The opening delimiter is exactly one character.
const NEBIUS_TOKEN = /(?:["'`]|[^\S\r\n])([A-Za-z0-9._~+/-]{32,}={0,2})["'`]/g;
// Longest token the heuristic looks for past the end of the window.
const NEBIUS_TOKEN_SLACK = 4096;

const ENV_NAME_LINE = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/;

/**
 * @typedef {object} SecretScanConfig
 * @property {RegExp | null} serverAssignment Compiled server-env-assignment pattern, or null when no names are declared.
 * @property {string | null} nebiusExact Exact Nebius key in the latin1 view used for scanning, or null when layer (a) does not run.
 */

/**
 * @typedef {object} SecretFinding
 * @property {string} pattern One of PATTERN_NAMES.
 * @property {number} index Offset of the match in the scanned text.
 */

/**
 * Names declared in a dotenv-style file such as `supabase/functions/.env.example`.
 * @param {string} text
 * @returns {string[]}
 */
export function parseEnvNames(text) {
  /** @type {string[]} */
  const names = [];
  for (const line of text.split(/\r?\n/)) {
    const m = ENV_NAME_LINE.exec(line);
    if (m && m[1] && !names.includes(m[1])) names.push(m[1]);
  }
  return names;
}

/**
 * Name/value pairs from a dotenv-style file. Surrounding matching quotes are
 * removed from values. Later assignments win.
 * @param {string} text
 * @returns {Map<string, string>}
 */
export function parseEnvAssignments(text) {
  /** @type {Map<string, string>} */
  const out = new Map();
  for (const line of text.split(/\r?\n/)) {
    const m = ENV_NAME_LINE.exec(line);
    if (!m || !m[1]) continue;
    out.set(m[1], unquote((m[2] ?? "").trim()));
  }
  return out;
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
 * @param {string} s
 * @returns {string}
 */
function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Builds the server-env-assignment pattern: a declared name, an optional
 * closing quote, a `:` or `=` separator and a non-empty value. Whitespace
 * around the separator is limited to the same line so `NAME=` followed by a
 * line break is not read as an assignment of the next line.
 * @param {readonly string[]} names
 * @returns {RegExp | null}
 */
export function serverAssignmentPattern(names) {
  const valid = names.filter((n) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(n));
  if (valid.length === 0) return null;
  const alternation = valid.map(escapeRegExp).join("|");
  return new RegExp(
    `\\b(?:${alternation})\\b["'\`]?[^\\S\\r\\n]*[:=][^\\S\\r\\n]*["'\`]?[^\\s"'\`,;)}\\]]+`,
    "g",
  );
}

/**
 * Shannon entropy in bits per character.
 * @param {string} s
 * @returns {number}
 */
export function shannonEntropy(s) {
  if (s.length === 0) return 0;
  /** @type {Map<string, number>} */
  const counts = new Map();
  for (const ch of s) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  const total = [...s].length;
  let h = 0;
  for (const c of counts.values()) {
    const p = c / total;
    h -= p * Math.log2(p);
  }
  return h;
}

/**
 * The `role` claim of a JWT's payload, or null when the payload cannot be
 * decoded or has no string role.
 * @param {string} jwt
 * @returns {string | null}
 */
export function jwtRole(jwt) {
  const payload = jwt.split(".")[1];
  if (!payload) return null;
  try {
    const json = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return json !== null && typeof json === "object" && typeof json.role === "string" ? json.role : null;
  } catch {
    return null;
  }
}

/**
 * @param {{ serverEnvNames: readonly string[], nebiusKey?: string | null }} options
 *   `nebiusKey` is the real NEBIUS_API_KEY value, or null/undefined when unavailable.
 * @returns {SecretScanConfig}
 */
export function buildSecretScanConfig({ serverEnvNames, nebiusKey }) {
  const exact =
    typeof nebiusKey === "string" && nebiusKey.length >= NEBIUS_EXACT_MIN_LENGTH
      ? Buffer.from(nebiusKey, "utf8").toString("latin1")
      : null;
  return { serverAssignment: serverAssignmentPattern(serverEnvNames), nebiusExact: exact };
}

/**
 * Scans text (a latin1 view of file bytes) and returns one finding per
 * secret. Layers run in this order: `sb_secret_` keys, service-role JWTs, the
 * exact Nebius key, server variable assignments, then the Nebius heuristic.
 * A match that overlaps an earlier finding is not counted again.
 * @param {string} text
 * @param {SecretScanConfig} config
 * @returns {SecretFinding[]}
 */
export function scanText(text, config) {
  /** @type {{ start: number, end: number, pattern: string }[]} */
  const spans = [];
  /**
   * @param {number} start
   * @param {number} end
   * @param {string} pattern
   */
  const add = (start, end, pattern) => {
    for (const s of spans) if (start < s.end && s.start < end) return;
    spans.push({ start, end, pattern });
  };

  for (const m of text.matchAll(SB_SECRET)) add(m.index, m.index + m[0].length, "supabase-secret-key");

  for (const m of text.matchAll(JWT)) {
    if (jwtRole(m[0]) === "service_role") add(m.index, m.index + m[0].length, "supabase-service-role-jwt");
  }

  if (config.nebiusExact) {
    const key = config.nebiusExact;
    let i = text.indexOf(key);
    while (i !== -1) {
      add(i, i + key.length, "nebius-api-key");
      i = text.indexOf(key, i + key.length);
    }
  }

  if (config.serverAssignment) {
    const re = new RegExp(config.serverAssignment.source, "g");
    for (const m of text.matchAll(re)) add(m.index, m.index + m[0].length, "server-env-assignment");
  }

  for (const anchor of text.matchAll(new RegExp(NEBIUS_ANCHOR.source, "gi"))) {
    const windowStart = anchor.index + anchor[0].length;
    const slice = text.slice(windowStart, windowStart + NEBIUS_WINDOW + NEBIUS_TOKEN_SLACK);
    for (const m of slice.matchAll(new RegExp(NEBIUS_TOKEN.source, "g"))) {
      if (m.index > NEBIUS_WINDOW) break;
      const token = m[1] ?? "";
      if (token.startsWith("sb_publishable_")) continue;
      if (JWT_WHOLE.test(token) && jwtRole(token) !== "service_role") continue;
      if (shannonEntropy(token) < NEBIUS_MIN_ENTROPY) continue;
      const start = windowStart + m.index + 1;
      add(start, start + token.length, "nebius-api-key");
    }
  }

  return spans.sort((a, b) => a.start - b.start).map(({ pattern, start }) => ({ pattern, index: start }));
}
