/// <reference types="vitest/config" />
import { gzipSync } from "node:zlib";
import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type Plugin } from "vite";
import { buildCsp } from "./scripts/lib/csp.mjs";

/** Requirement 3.12: initial JavaScript gzip budget (350 KiB). */
const INITIAL_JS_GZIP_MAX = 358_400;

/**
 * Build-only plugin that
 * - writes `dist/_headers` with the Content-Security-Policy for `/*` (Req 4.3-4.5),
 * - reports the gzip (level 9) size of each initial JS file and the total, failing
 *   the build above 358,400 bytes (Req 3.12),
 * - fails the build if a module from `supabase/functions/` or
 *   `@modelcontextprotocol/*` reaches the browser bundle (Req 3.8).
 */
function necrocardHeaders(supabaseUrl: string | undefined): Plugin {
  let root = process.cwd();
  return {
    name: "necrocard-headers",
    apply: "build",
    configResolved(config) {
      root = config.root;
    },
    generateBundle(_options, bundle) {
      const { policy, warning } = buildCsp(supabaseUrl);
      if (warning !== null) this.warn(warning);
      this.emitFile({
        type: "asset",
        fileName: "_headers",
        source: `/*\n  Content-Security-Policy: ${policy}\n`,
      });

      const chunks = new Map<string, { code: string; imports: readonly string[] }>();
      const forbidden: string[] = [];
      const functionsDir = path.resolve(root, "supabase/functions").replaceAll("\\", "/") + "/";
      const entries: string[] = [];
      for (const [fileName, item] of Object.entries(bundle)) {
        if (item.type !== "chunk") continue;
        chunks.set(fileName, { code: item.code, imports: item.imports });
        if (item.isEntry) entries.push(fileName);
        for (const id of item.moduleIds) {
          const normalized = id.replaceAll("\\", "/");
          if (normalized.startsWith(functionsDir) || normalized.includes("/node_modules/@modelcontextprotocol/")) {
            forbidden.push(`${fileName}: ${path.relative(root, id).replaceAll("\\", "/")}`);
          }
        }
      }
      if (forbidden.length > 0) {
        this.error(`Browser bundle includes server-only modules:\n  ${forbidden.join("\n  ")}`);
      }

      // Initial JS = entry chunks plus their transitive static imports.
      const initial = new Set<string>();
      const pending = [...entries];
      while (pending.length > 0) {
        const name = pending.pop() as string;
        if (initial.has(name)) continue;
        const chunk = chunks.get(name);
        if (chunk === undefined) continue;
        initial.add(name);
        pending.push(...chunk.imports);
      }

      let total = 0;
      const lines: string[] = [];
      for (const name of [...initial].sort()) {
        const code = (chunks.get(name) as { code: string }).code;
        const size = gzipSync(Buffer.from(code, "utf8"), { level: 9 }).length;
        total += size;
        lines.push(`  ${name}: ${size} bytes gzip`);
      }
      console.log(
        `\nInitial JavaScript (gzip level 9):\n${lines.join("\n")}\n  total: ${total} bytes (max ${INITIAL_JS_GZIP_MAX})`,
      );
      if (total > INITIAL_JS_GZIP_MAX) {
        this.error(
          `Initial JavaScript is ${total} bytes gzip, above the ${INITIAL_JS_GZIP_MAX}-byte budget:\n${lines.join("\n")}`,
        );
      }
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  return {
    plugins: [react(), necrocardHeaders(env.VITE_SUPABASE_URL)],
    test: {
      environment: "node",
      include: ["tests/**/*.test.ts"],
    },
  };
});
