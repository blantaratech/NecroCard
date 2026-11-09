// Public Supabase configuration stub. Reads only VITE_-prefixed public values
// from import.meta.env. It deliberately does not import @supabase/supabase-js,
// so the client library stays out of the bundle until spec 03 needs it.

export interface PublicConfig {
  url: string;
  publishableKey: string;
}

/** Returns the public config, or null when either value is missing or empty. */
export function readPublicConfig(): PublicConfig | null {
  const url: unknown = import.meta.env.VITE_SUPABASE_URL;
  const publishableKey: unknown = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (typeof url !== "string" || url.trim() === "") return null;
  if (typeof publishableKey !== "string" || publishableKey.trim() === "") return null;
  return { url: url.trim(), publishableKey: publishableKey.trim() };
}
