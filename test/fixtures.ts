import { expect } from "vitest";

export const WG_PEER_KEY = "bmXOC+F1FxEMF9dyiK2H5/1SUtzH0JuVo51h2wPfgyo=";
export const MASQUE_PEER_PEM =
  "-----BEGIN PUBLIC KEY-----\nMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEIaU7MToJm9NKp8YfGxR6r+/h4mcG\n7SxI8tsW8OR1A5tv/zCzVbCRRh2t87/kxnP6lAy0lkr7qYwu+ox+k3dr6w==\n-----END PUBLIC KEY-----\n";

export const DEVICE_ID = "11111111-1111-4111-8111-111111111111";
export const DEVICE_TOKEN = "22222222-2222-4222-8222-222222222222";

export interface UpstreamCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

/** Replaces global fetch with a URL-based router and returns a restore function. */
export function mockUpstream(
  handler: (call: UpstreamCall) => object | Response | Promise<object | Response>,
): { calls: UpstreamCall[]; restore: () => void } {
  const original = globalThis.fetch;
  const calls: UpstreamCall[] = [];

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const call: UpstreamCall = {
      url: String(input),
      method: (init?.method ?? "GET").toUpperCase(),
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
    };
    calls.push(call);
    const response = await handler(call);
    if (response instanceof Response) return response;
    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  return { calls, restore: () => void (globalThis.fetch = original) };
}

export function registerBody(options: { peerKey?: string; ports?: number[]; host?: string } = {}) {
  return {
    id: DEVICE_ID,
    type: "a",
    model: "PC",
    name: "",
    key: "GqQDt6yp1SVbdzm/K1EH97KfzcJN0zJeIWY4d/0fqiU=",
    key_type: "curve25519",
    tunnel_type: "wireguard",
    token: DEVICE_TOKEN,
    config: {
      client_id: "OapF",
      peers: [
        {
          public_key: options.peerKey ?? WG_PEER_KEY,
          endpoint: {
            v4: "162.159.192.10:0",
            host: options.host ?? "engage.cloudflareclient.com:2408",
            ports: options.ports ?? [2408, 500, 1701, 4500],
          },
        },
      ],
      interface: { addresses: { v4: "172.16.0.2", v6: "2606:4700:110:86dc:ff6f:dfbc:5388:67a4" } },
      services: { http_proxy: "172.16.0.1:2480" },
    },
    account: { license: "00000000-0000000-00000000", warp_plus: true, quota: 0, usage: 0 },
  };
}

export function enrollBody() {
  return {
    ...registerBody({
      peerKey: MASQUE_PEER_PEM,
      host: "engage.cloudflareclient.com:2408",
      ports: [443, 500, 1701, 4500, 4443, 8443, 8095],
    }),
    name: "warp-regis",
    key_type: "secp256r1",
    tunnel_type: "masque",
    token: undefined,
  };
}

export function expectJson(response: Response): Promise<unknown> {
  expect(response.headers.get("Content-Type")).toContain("application/json");
  return response.json() as Promise<unknown>;
}
