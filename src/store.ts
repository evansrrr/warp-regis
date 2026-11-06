import type { WarpDevice } from "./types";

/**
 * Devices live in the Cloudflare Cache API only — no KV, D1 or Durable Object.
 * Consequence: entries are per-colo and best-effort (an entry can be evicted,
 * and a request hitting a different colo will miss). That is the trade-off for
 * deploying with a bare `wrangler deploy` and no bindings.
 */
const CACHE_ORIGIN = "https://warp-regis.cache";

function cacheKey(name: string): Request {
  return new Request(`${CACHE_ORIGIN}/${name}`, { method: "GET" });
}

function cacheResponse(body: string, ttl: number): Response {
  return new Response(body, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": `public, max-age=${ttl}`,
    },
  });
}

export async function writeDevice(device: WarpDevice, ttl: number): Promise<void> {
  const body = JSON.stringify(device);
  await Promise.all([
    caches.default.put(cacheKey("device/latest"), cacheResponse(body, ttl)),
    caches.default.put(cacheKey(`device/${device.deviceId}`), cacheResponse(body, ttl)),
  ]);
}

export async function readDevice(name: string): Promise<WarpDevice | null> {
  const hit = await caches.default.match(cacheKey(`device/${name}`));
  if (!hit) return null;
  try {
    return (await hit.json()) as WarpDevice;
  } catch {
    return null;
  }
}
