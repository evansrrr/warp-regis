import { afterEach, describe, expect, it } from "vitest";
import worker from "../src/index";
import type { Env, DeviceSummary } from "../src/types";
import { DEVICE_ID, DEVICE_TOKEN, WG_PEER_KEY, enrollBody, mockUpstream, registerBody } from "./fixtures";

function get(path: string, headers: Record<string, string> = {}): Request {
  return new Request(`https://warp.test${path}`, { headers });
}

let restore: (() => void) | null = null;

afterEach(() => {
  restore?.();
  restore = null;
});

function upstreamOk(): void {
  restore = mockUpstream((call) => {
    if (call.method === "POST" && call.url.endsWith("/reg")) return registerBody();
    if (call.method === "PATCH") return enrollBody();
    if (call.method === "GET" && call.url.endsWith("/account")) {
      return { license: "license-1", warp_plus: true, quota: 0, usage: 0 };
    }
    return new Response("not found", { status: 404 });
  }).restore;
}

async function body<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

describe("GET /regis", () => {
  it("registers a WireGuard device with a resolvable endpoint", async () => {
    upstreamOk();
    const response = await worker.fetch(get("/regis?mode=wg"), {});
    expect(response.status).toBe(200);

    const device = await body<DeviceSummary>(response);
    expect(device.mode).toBe("wireguard");
    expect(device.deviceId).toBe(DEVICE_ID);
    expect(device.token).toBe(DEVICE_TOKEN);
    expect(device.peerPublicKey).toBe(WG_PEER_KEY);
    expect(device.endpoint).toBe("engage.cloudflareclient.com:2408");
    expect(device.clientId).toBe("OapF");
    expect(device.reserved).toEqual([0x39, 0xaa, 0x45]);
    expect(device).not.toHaveProperty("raw");
  });

  it("enrolls MASQUE credentials and prefers port 443", async () => {
    upstreamOk();
    const response = await worker.fetch(get("/regis?mode=masque"), {});
    const device = await body<DeviceSummary>(response);

    expect(device.mode).toBe("masque");
    expect(device.endpoint).toBe("engage.cloudflareclient.com:443");
    expect(device.peerPublicKey).toMatch(/^MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE/);
    expect(device.peerPublicKey).not.toContain("BEGIN PUBLIC KEY");
  });

  it("returns the raw upstream payloads on request", async () => {
    upstreamOk();
    const response = await worker.fetch(get("/regis?mode=masque&format=raw"), {});
    const raw = await body<{ register: unknown; enroll: unknown }>(response);
    expect(Object.keys(raw)).toEqual(["register", "enroll"]);
  });

  it("rejects an unknown mode", async () => {
    const response = await worker.fetch(get("/regis?mode=xx"), {});
    expect(response.status).toBe(400);
    expect(await body<{ code: string }>(response)).toMatchObject({ code: "invalid_mode" });
  });

  it("maps upstream failures to a structured 502", async () => {
    restore = mockUpstream(
      () => new Response(JSON.stringify({ code: 1001 }), { status: 403 }),
    ).restore;

    const response = await worker.fetch(get("/regis"), {});
    expect(response.status).toBe(502);
    expect(await body<Record<string, unknown>>(response)).toMatchObject({
      code: "registration_failed",
      upstreamStatus: 403,
    });
  });

  it("enforces the rate limiter when bound", async () => {
    const env: Env = { RATE_LIMITER: { limit: async () => ({ success: false }) } };
    const response = await worker.fetch(get("/regis"), env);
    expect(response.status).toBe(429);
  });
});

describe("GET /device", () => {
  it("returns the device written by /regis", async () => {
    upstreamOk();
    await worker.fetch(get("/regis?mode=wg"), {});

    const response = await worker.fetch(get("/device"), {});
    expect(response.status).toBe(200);
    const device = await body<DeviceSummary>(response);
    expect(device.deviceId).toBe(DEVICE_ID);
    expect(device.mode).toBe("wireguard");
  });

  it("renders a wg-quick config for WireGuard devices", async () => {
    upstreamOk();
    await worker.fetch(get("/regis?mode=wg"), {});

    const response = await worker.fetch(get("/device?format=conf"), {});
    expect(response.headers.get("Content-Type")).toContain("text/plain");
    const config = await response.text();
    expect(config).toContain("[Interface]");
    expect(config).toContain(`PublicKey = ${WG_PEER_KEY}`);
    expect(config).toContain("Endpoint = engage.cloudflareclient.com:2408");
  });

  it("refuses wg-quick output for MASQUE devices", async () => {
    upstreamOk();
    await worker.fetch(get("/regis?mode=masque"), {});

    const response = await worker.fetch(get("/device?format=conf"), {});
    expect(response.status).toBe(409);
    expect(await body<{ code: string }>(response)).toMatchObject({ code: "unsupported_format" });
  });

  it("404s for unknown ids and formats", async () => {
    const missing = await worker.fetch(get("/device/does-not-exist"), {});
    expect(missing.status).toBe(404);

    const badFormat = await worker.fetch(get("/device?format=yaml"), {});
    expect(badFormat.status).toBe(400);
  });
});

describe("GET /account", () => {
  it("proxies the upstream account payload", async () => {
    upstreamOk();
    await worker.fetch(get("/regis?mode=wg"), {});

    const response = await worker.fetch(get("/account"), {});
    expect(response.status).toBe(200);
    expect(await body<Record<string, unknown>>(response)).toMatchObject({ license: "license-1" });
  });
});

describe("auth", () => {
  const env: Env = { REGIS_KEY: "secret-one,secret-two" };

  it("rejects a missing key", async () => {
    const response = await worker.fetch(get("/device"), env);
    expect(response.status).toBe(401);
    expect(await body<{ code: string }>(response)).toMatchObject({ code: "unauthorized" });
  });

  it("accepts either configured key, via header or query", async () => {
    upstreamOk();
    await worker.fetch(get("/regis?mode=wg"), env); // rejected without a key, so nothing is stored
    const viaHeader = await worker.fetch(get("/regis?mode=wg", { Authorization: "Bearer secret-two" }), env);
    expect(viaHeader.status).toBe(200);
    const viaQuery = await worker.fetch(get("/device?key=secret-one"), env);
    expect(viaQuery.status).toBe(200);
  });
});

describe("routing", () => {
  it("describes itself on /", async () => {
    const response = await worker.fetch(get("/"), {});
    expect(await body<Record<string, unknown>>(response)).toMatchObject({
      name: "warp-regis",
      auth: "off",
      storage: "cache",
    });
  });

  it("404s unknown routes and 405s writes", async () => {
    expect((await worker.fetch(get("/nope"), {})).status).toBe(404);
    const post = new Request("https://warp.test/regis", { method: "POST" });
    expect((await worker.fetch(post, {})).status).toBe(405);
  });
});
