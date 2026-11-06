import type { Env, KvNamespaceLike, WarpDevice } from "./types";

/**
 * Storage is optional infrastructure:
 * - bind `WARP_KV` for durable, globally readable devices;
 * - without it the Cache API is used, which is per-colo and best-effort.
 */
export interface DeviceStore {
  backend: "kv" | "cache";
  write(device: WarpDevice, ttl: number): Promise<void>;
  read(name: string): Promise<WarpDevice | null>;
}

const CACHE_ORIGIN = "https://warp-regis.cache";

function cacheKey(name: string): Request {
  return new Request(`${CACHE_ORIGIN}/device/${name}`, { method: "GET" });
}

function cacheResponse(body: string, ttl: number): Response {
  return new Response(body, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": `public, max-age=${ttl}`,
    },
  });
}

function createCacheStore(): DeviceStore {
  return {
    backend: "cache",
    async write(device, ttl) {
      const body = JSON.stringify(device);
      await Promise.all([
        caches.default.put(cacheKey("latest"), cacheResponse(body, ttl)),
        caches.default.put(cacheKey(device.deviceId), cacheResponse(body, ttl)),
      ]);
    },
    async read(name) {
      const hit = await caches.default.match(cacheKey(name));
      if (!hit) return null;
      try {
        return (await hit.json()) as WarpDevice;
      } catch {
        return null;
      }
    },
  };
}

function createKvStore(kv: KvNamespaceLike): DeviceStore {
  return {
    backend: "kv",
    async write(device, ttl) {
      const body = JSON.stringify(device);
      const options = { expirationTtl: ttl };
      await Promise.all([
        kv.put("device/latest", body, options),
        kv.put(`device/${device.deviceId}`, body, options),
      ]);
    },
    async read(name) {
      const body = await kv.get(`device/${name}`);
      if (!body) return null;
      try {
        return JSON.parse(body) as WarpDevice;
      } catch {
        return null;
      }
    },
  };
}

export function createStore(env: Env): DeviceStore {
  return env.WARP_KV ? createKvStore(env.WARP_KV) : createCacheStore();
}
