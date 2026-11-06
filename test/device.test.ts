import { describe, expect, it } from "vitest";
import { DEFAULT_ENDPOINT, toSummary } from "../src/device";
import type { WarpDevice } from "../src/types";

function device(overrides: Partial<WarpDevice> = {}): WarpDevice {
  return {
    mode: "wireguard",
    deviceId: "device-1",
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
    ...overrides,
  };
}

describe("toSummary", () => {
  it("keeps only the connection fields", () => {
    const summary = toSummary(device());
    expect(Object.keys(summary).sort()).toEqual(
      ["clientId", "deviceId", "endpoint", "ipv4", "ipv6", "mode", "peerPublicKey", "privateKey", "reserved", "token"].sort(),
    );
    expect(summary).not.toHaveProperty("raw");
    expect(summary).not.toHaveProperty("registeredAt");
    expect(summary).not.toHaveProperty("publicKey");
  });

  it("decodes client_id into reserved bytes", () => {
    expect(toSummary(device({ clientId: "OapF" })).reserved).toEqual([0x39, 0xaa, 0x45]);
  });

  it("omits reserved when client_id is absent or not base64", () => {
    expect(toSummary(device({ clientId: undefined }))).not.toHaveProperty("reserved");
    expect(toSummary(device({ clientId: "!!" }))).not.toHaveProperty("reserved");
  });

  it("falls back to a mode-specific endpoint", () => {
    expect(toSummary(device({ endpoint: undefined })).endpoint).toBe(DEFAULT_ENDPOINT.wireguard);
    expect(toSummary(device({ mode: "masque", endpoint: undefined })).endpoint).toBe(
      DEFAULT_ENDPOINT.masque,
    );
  });
});
