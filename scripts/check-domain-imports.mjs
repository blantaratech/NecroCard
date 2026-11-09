// Domain import allowlist (decision D1, Requirements 3.2 and 3.3).
// Every source file under src/domain/ may import only the package `zod` and
// relative paths that stay inside src/domain/. The identifiers localStorage,
// sessionStorage and indexedDB are flagged as well. Each finding prints
// `path:line: forbidden import '<spec>'`; the script exits 1 on any finding.

import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const SOURCE_FILE = /\.(?:ts|tsx|mts|cts)$/;
const FORBIDDEN_GLOBALS = /(?<![\w$])(localStorage|sessionStorage|indexedDB)(?![\w$])/g;

// Keywords after which a `/` starts a regular expression rather than a division.
const REGEX_AFTER_WORD = new Set([
  "return", "typeof", "instanceof", "in", "of", "new", "delete", "void",
  "throw", "case", "do", "else", "yield", "await",
]);
const REGEX_AFTER_PUNCT = "(,=:[!&|?{};+-*%<>~^";

/**
 * Two index-aligned views of a source file:
 * `code` has comments replaced by spaces (strings kept, newlines kept);
 * `bare` also blanks the contents of strings, template text and regex literals.
 * @param {string} source
 * @returns {{ code: string, bare: string }}
 */
export function maskSource(source) {
  let code = "";
  let bare = "";
  /** @param {string} s */
  const blank = (s) => s.replace(/[^\n]/g, " ");
  /** @param {string} s */
  const keep = (s) => { code += s; bare += s; };
  /** @param {string} s */
  const comment = (s) => { const b = blank(s); code += b; bare += b; };
  /** @param {string} s */
  const literal = (s) => { code += s; bare += blank(s); };

  const n = source.length;
  let i = 0;
  let lastPunct = "";
  let lastWord = "";
  // One entry per open `${`: the number of unmatched `{` inside that expression.
  /** @type {number[]} */
  const templateDepth = [];

  /** Reads template text from `i` (just after a backtick or `}`) to the closing backtick or `${`. */
  const readTemplate = () => {
    const start = i;
    while (i < n) {
      const c = source[i];
      if (c === "\\") { i += 2; continue; }
      if (c === "`") { i += 1; literal(source.slice(start, i)); lastPunct = "`"; lastWord = ""; return; }
      if (c === "$" && source[i + 1] === "{") {
        i += 2;
        literal(source.slice(start, i));
        templateDepth.push(0);
        lastPunct = "{"; lastWord = "";
        return;
      }
      i += 1;
    }
    literal(source.slice(start, i));
  };

  while (i < n) {
    const c = source[i] ?? "";
    const next = source[i + 1];

    if (c === "/" && next === "/") {
      const end = source.indexOf("\n", i);
      const stop = end === -1 ? n : end;
      comment(source.slice(i, stop));
      i = stop;
      continue;
    }
    if (c === "/" && next === "*") {
      const end = source.indexOf("*/", i + 2);
      const stop = end === -1 ? n : end + 2;
      comment(source.slice(i, stop));
      i = stop;
      continue;
    }
    if (c === '"' || c === "'") {
      const start = i;
      i += 1;
      while (i < n && source[i] !== c && source[i] !== "\n") i += source[i] === "\\" ? 2 : 1;
      if (source[i] === c) i += 1;
      literal(source.slice(start, i));
      lastPunct = c; lastWord = "";
      continue;
    }
    if (c === "`") {
      literal("`");
      i += 1;
      readTemplate();
      continue;
    }
    if (c === "}" && templateDepth.length > 0) {
      const top = templateDepth.length - 1;
      if ((templateDepth[top] ?? 0) === 0) {
        templateDepth.pop();
        i += 1;
        literal("}");
        readTemplate();
        continue;
      }
      templateDepth[top] = (templateDepth[top] ?? 0) - 1;
    }
    if (c === "{" && templateDepth.length > 0) {
      const top = templateDepth.length - 1;
      templateDepth[top] = (templateDepth[top] ?? 0) + 1;
    }
    if (c === "/" && (lastPunct === "" || REGEX_AFTER_PUNCT.includes(lastPunct) || REGEX_AFTER_WORD.has(lastWord))) {
      const start = i;
      let inClass = false;
      i += 1;
      while (i < n && source[i] !== "\n") {
        const r = source[i];
        if (r === "\\") { i += 2; continue; }
        if (r === "[") inClass = true;
        else if (r === "]") inClass = false;
        else if (r === "/" && !inClass) break;
        i += 1;
      }
      if (source[i] === "/") {
        i += 1;
        while (i < n && /[a-z]/i.test(source[i] ?? "")) i += 1;
        literal(source.slice(start, i));
        lastPunct = "/"; lastWord = "x";
        continue;
      }
      // Not a terminated regex on this line: treat the `/` as an operator.
      i = start;
    }
    if (/[A-Za-z0-9_$]/.test(c)) {
      const start = i;
      while (i < n && /[A-Za-z0-9_$]/.test(source[i] ?? "")) i += 1;
      const word = source.slice(start, i);
      keep(word);
      lastWord = word; lastPunct = "a";
      continue;
    }
    keep(c);
    i += 1;
    if (!/\s/.test(c)) { lastPunct = c; lastWord = ""; }
  }
  return { code, bare };
}

/**
 * 1-based line number of `index` in `text`.
 * @param {string} text
 * @param {number} index
 * @returns {number}
 */
function lineAt(text, index) {
  let line = 1;
  for (let k = text.indexOf("\n"); k !== -1 && k < index; k = text.indexOf("\n", k + 1)) line += 1;
  return line;
}

/**
 * True when `spec` is `zod` (or a `zod/` subpath) or a relative path that
 * resolves inside `domainDir`.
 * @param {string} spec
 * @param {string} fileAbs
 * @param {string} domainDir
 * @returns {boolean}
 */
export function isAllowedSpecifier(spec, fileAbs, domainDir) {
  if (spec === "zod" || spec.startsWith("zod/")) return true;
  const relative = spec === "." || spec === ".." || spec.startsWith("./") || spec.startsWith("../");
  if (!relative) return false;
  const target = path.resolve(path.dirname(fileAbs), spec);
  const rel = path.relative(domainDir, target);
  return !path.isAbsolute(rel) && rel !== ".." && !rel.startsWith(`..${path.sep}`);
}

/**
 * Forbidden imports and storage globals in one domain source file.
 * @param {string} source
 * @param {string} fileAbs
 * @param {string} domainDir
 * @returns {{ line: number, spec: string }[]}
 */
export function findViolations(source, fileAbs, domainDir) {
  const { code, bare } = maskSource(source);
  /** @type {{ line: number, spec: string, index: number }[]} */
  const found = [];
  /** @param {number} at @param {string} word */
  const isCode = (at, word) => bare.startsWith(word, at);

  /**
   * @param {number} index
   * @param {string} spec
   */
  const check = (index, spec) => {
    if (!isAllowedSpecifier(spec, fileAbs, domainDir)) found.push({ line: lineAt(code, index), spec, index });
  };

  // import … from "x" / export … from "x"
  for (const m of code.matchAll(/(?<![\w$.])(import|export)(?=[\s{*])[^;]*?\b(from)\s*(["'])([^"'\n]*)\3/dg)) {
    const kw = m.indices?.[1]; const from = m.indices?.[2]; const spec = m.indices?.[4];
    if (!kw || !from || !spec) continue;
    if (isCode(kw[0], m[1] ?? "") && isCode(from[0], "from")) check(spec[0], m[4] ?? "");
  }
  // import "x"
  for (const m of code.matchAll(/(?<![\w$.])(import)\s*(["'])([^"'\n]*)\2/dg)) {
    const kw = m.indices?.[1]; const spec = m.indices?.[3];
    if (kw && spec && isCode(kw[0], "import")) check(spec[0], m[3] ?? "");
  }
  // import("x"), require("x"); a non-literal argument cannot be checked and is refused.
  for (const m of code.matchAll(/(?<![\w$.])(import|require)\s*\(\s*([^)]*)/dg)) {
    const kw = m.indices?.[1]; const arg = m.indices?.[2];
    if (!kw || !arg || !isCode(kw[0], m[1] ?? "")) continue;
    const text = (m[2] ?? "").trim();
    const lit = /^(["'`])([^"'`\n]*)\1$/.exec(text);
    if (lit && !(lit[1] === "`" && (lit[2] ?? "").includes("${"))) check(arg[0], lit[2] ?? "");
    else found.push({ line: lineAt(code, arg[0]), spec: `${m[1]}(<non-literal>)`, index: arg[0] });
  }
  for (const m of bare.matchAll(FORBIDDEN_GLOBALS)) {
    found.push({ line: lineAt(code, m.index), spec: m[1] ?? "", index: m.index });
  }

  /** @type {Set<string>} */
  const seen = new Set();
  return found
    .sort((a, b) => a.index - b.index)
    .filter((f) => {
      const key = `${f.line}\u0000${f.spec}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map(({ line, spec }) => ({ line, spec }));
}

/**
 * @param {string} dir
 * @returns {string[]}
 */
function listSources(dir) {
  /** @type {string[]} */
  const out = [];
  const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
    a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
  );
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listSources(full));
    else if (entry.isFile() && SOURCE_FILE.test(entry.name)) out.push(full);
  }
  return out;
}

/**
 * @param {{ root?: string, log?: (line: string) => void, error?: (line: string) => void }} [options]
 * @returns {number} Exit code.
 */
export function run(options = {}) {
  const root = options.root ?? DEFAULT_ROOT;
  const log = options.log ?? ((line) => console.log(line));
  const error = options.error ?? ((line) => console.error(line));
  const domainDir = path.join(root, "src", "domain");
  if (!statSync(domainDir, { throwIfNoEntry: false })?.isDirectory()) {
    error("check-domain-imports: src/domain/ not found.");
    return 1;
  }
  const files = listSources(domainDir);
  let count = 0;
  for (const file of files) {
    const rel = path.relative(root, file).split(path.sep).join("/");
    for (const v of findViolations(readFileSync(file, "utf8"), file, domainDir)) {
      error(`${rel}:${v.line}: forbidden import '${v.spec}'`);
      count += 1;
    }
  }
  log(`check-domain-imports: ${files.length} file(s), ${count} finding(s)`);
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
