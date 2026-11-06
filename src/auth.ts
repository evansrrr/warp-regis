import type { Env } from "./types";

/** REGIS_KEY may hold several comma-separated keys, which makes rotation painless. */
export function configuredKeys(env: Env): string[] {
  return (env.REGIS_KEY ?? "")
    .split(",")
    .map((key) => key.trim())
    .filter(Boolean);
}

/** Length-aware constant-time comparison. */
export function safeEqual(left: string, right: string): boolean {
  const a = new TextEncoder().encode(left);
  const b = new TextEncoder().encode(right);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) {
    diff |= a[index] ^ b[index];
  }
  return diff === 0;
}

/** Reads the key from the bearer header first, then from `?key=`. */
export function extractKey(request: Request, url: URL): string {
  const header = request.headers.get("Authorization") ?? "";
  const bearer = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  return bearer || url.searchParams.get("key") || "";
}

/** Open when no key is configured; otherwise any configured key is accepted. */
export function isAuthorized(request: Request, url: URL, env: Env): boolean {
  const keys = configuredKeys(env);
  if (keys.length === 0) return true;

  const provided = extractKey(request, url);
  if (!provided) return false;
  return keys.some((key) => safeEqual(provided, key));
}
