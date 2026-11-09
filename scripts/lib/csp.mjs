// Content-Security-Policy builder shared by the Vite headers plugin and tests.
// Requirements 4.3, 4.4, 4.5. Pure: no I/O, no environment access.

/** Directives that never change, in their fixed output order. */
const FIXED_DIRECTIVES = [
  "default-src 'self'",
  "script-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "worker-src 'self'",
];

// Lowercase DNS name (labels of a-z, 0-9 and inner hyphens) or a bracketed
// IPv6 literal. Anything else (for example a `*` that WHATWG URL accepts in a
// host) is refused so the policy never gains a wildcard or odd host source.
const DNS_HOST = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*$/;
const IPV6_HOST = /^\[[0-9a-f:.]+\]$/;

/**
 * @param {string} reason
 * @returns {string}
 */
function warningFor(reason) {
  return `VITE_SUPABASE_URL ${reason}; Content-Security-Policy uses connect-src 'self' only.`;
}

/**
 * Builds the NecroCard Content-Security-Policy.
 *
 * For an HTTPS `url`, `connect-src` allows `https://<host>` and `wss://<host>`,
 * where `<host>` is the hostname plus any non-default port; path, query,
 * fragment and credentials are dropped. For any other value the policy has
 * `connect-src 'self'` alone and `warning` names `VITE_SUPABASE_URL`.
 *
 * @param {unknown} url Value of VITE_SUPABASE_URL (may be undefined).
 * @returns {{ policy: string, warning: string | null }}
 */
export function buildCsp(url) {
  const fallback = (/** @type {string} */ reason) => ({
    policy: [...FIXED_DIRECTIVES, "connect-src 'self'"].join("; "),
    warning: warningFor(reason),
  });

  if (typeof url !== "string" || url.trim() === "") {
    return fallback("is not set");
  }

  /** @type {URL} */
  let parsed;
  try {
    parsed = new URL(url.trim());
  } catch {
    return fallback("is not a valid URL");
  }

  if (parsed.protocol !== "https:") {
    return fallback("is not an HTTPS URL");
  }

  const hostname = parsed.hostname;
  if (!DNS_HOST.test(hostname) && !IPV6_HOST.test(hostname)) {
    return fallback("has an unsupported host");
  }
  if (hostname.endsWith("nebius.com")) {
    return fallback("must not point at a Nebius host");
  }

  // `host` omits the port when it is the scheme default (443).
  const host = parsed.host;
  return {
    policy: [...FIXED_DIRECTIVES, `connect-src 'self' https://${host} wss://${host}`].join("; "),
    warning: null,
  };
}
