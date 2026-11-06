import { describe, expect, it } from "vitest";
import { createStore } from "../src/store";
import type { WarpDevice } from "../src/types";

function device(id = "device-1"): WarpDevice {
  return {
    mode: "wireguard",
    deviceId: id,
    token: "token-1",
    name: "warp-regis",
    privateKey: "priv",
    publicKey: "pub",
    peerPublicKey: "peer",
    ipv4: "172.16.0.2",
    ipv6: "2606:4700::2",
    endpoint: "engage.cloudflareclient.com:2408",
    clientId: "OapF",
    registeredAt: "2026-11-06T18:00:00.000Z",
    raw: { register: {} },
  };
}

function fakeKv() {
  const entries = new Map<string, { value: string; ttl?: number }>();
  return {
    entries,
    async get(key: string) {
      return entries.get(key)?.value ?? null;
    },
    async put(key: string, value: string, options?: { expirationTtl?: number }) {
      entries.set(key, { value, ttl: options?.expirationTtl });
    },
  };
}

describe("createStore", () => {
  it("uses the Cache API when no KV binding is present", () => {
    expect(createStore({}).backend).toBe("cache");
  });

  it("uses KV when bound, storing latest and per-id keys with the TTL", async () => {
    const kv = fakeKv();
    const store = createStore({ WARP_KV: kv });

    expect(store.backend).toBe("kv");
    await store.write(device("abc"), 3600);

    expect(kv.entries.get("device/latest")?.ttl).toBe(3600);
    expect(kv.entries.get("device/abc")?.ttl).toBe(3600);
    expect(await store.read("latest")).toMatchObject({ deviceId: "abc" });
    expect(await store.read("abc")).toMatchObject({ deviceId: "abc" });
    expect(await store.read("missing")).toBeNull();
  });

  it("ignores corrupted KV entries", async () => {
    const kv = fakeKv();
    kv.entries.set("device/latest", { value: "{not json" });
    expect(await createStore({ WARP_KV: kv }).read("latest")).toBeNull();
  });
});
