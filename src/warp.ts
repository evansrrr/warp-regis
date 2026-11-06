import { generateP256KeyPair, generateX25519KeyPair, randomBase64, randomHex } from "./crypto";
import type { RegisterResponse, RegistrationMode, WarpDevice } from "./types";

/** Same account API + client fingerprint as the reference implementations. */
const API_BASE = "https://api.cloudflareclient.com/v0a4471";

const BASE_HEADERS: Record<string, string> = {
  "User-Agent": "WARP for Android",
  "CF-Client-Version": "a-6.35-4471",
  "Content-Type": "application/json; charset=UTF-8",
};

/** `2006-01-02T15:04:05.000-07:00`, i.e. the format the client sends for `tos`. */
function cloudflareTimestamp(now: Date = new Date()): string {
  return now.toISOString().replace("Z", "+00:00");
}

async function callUpstream(
  method: "POST" | "PATCH",
  path: string,
  token: string | null,
  payload: unknown,
): Promise<RegisterResponse> {
  const headers = token ? { ...BASE_HEADERS, Authorization: `Bearer ${token}` } : BASE_HEADERS;
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: JSON.stringify(payload),
  });

  const body = await response.text();
  if (!response.ok) {
    throw new Error(`upstream ${method} ${path} failed (HTTP ${response.status}): ${body.slice(0, 400)}`);
  }

  try {
    return JSON.parse(body) as RegisterResponse;
  } catch {
    throw new Error(`upstream ${method} ${path} returned non-JSON body: ${body.slice(0, 200)}`);
  }
}

/** Strips PEM armor (MASQUE peer keys) and any whitespace / line breaks (WireGuard keys). */
function normalizePeerKey(value: string): string {
  return value
    .replace(/-----(BEGIN|END) PUBLIC KEY-----/g, "")
    .replace(/\s+/g, "");
}

function extractConfig(account: RegisterResponse): {
  ipv4: string;
  ipv6: string;
  peerPublicKey: string;
  endpoint?: string;
  clientId?: string;
} {
  const peer = account.config?.peers?.[0];
  const addresses = account.config?.interface?.addresses;

  const peerPublicKey = peer?.public_key ? normalizePeerKey(peer.public_key) : "";
  if (!peerPublicKey) throw new Error("response is missing the peer public key");

  const ipv4 = addresses?.v4 ?? "";
  const ipv6 = addresses?.v6 ?? "";
  if (!ipv4 && !ipv6) throw new Error("response is missing the tunnel addresses");

  // `endpoint.v4` is often reported as "x.x.x.x:0"; the hostname carries the real port.
  const endpoint = peer?.endpoint?.host ?? peer?.endpoint?.v4;
  const clientId = account.config?.client_id;

  return {
    ipv4,
    ipv6,
    peerPublicKey,
    ...(endpoint ? { endpoint } : {}),
    ...(clientId ? { clientId } : {}),
  };
}

/**
 * Registers a WARP device.
 *
 * `wireguard`: one POST /reg with a real Curve25519 public key. The returned
 * peer key and addresses are directly usable by a WireGuard client.
 *
 * `masque`: POST /reg bootstraps the account with a throwaway curve25519 key,
 * then PATCH /reg/{id} swaps in a P-256 key with tunnel_type=masque.
 */
export async function registerDevice(
  name: string,
  mode: RegistrationMode = "masque",
): Promise<WarpDevice> {
  const wireguardKeys = mode === "wireguard" ? generateX25519KeyPair() : null;
  const masqueKeys = mode === "masque" ? await generateP256KeyPair() : null;

  const registration = await callUpstream("POST", "/reg", null, {
    key: wireguardKeys ? wireguardKeys.publicKey : randomBase64(32),
    install_id: "",
    fcm_token: "",
    tos: cloudflareTimestamp(),
    model: "PC",
    serial_number: randomHex(8),
    os_version: "",
    key_type: "curve25519",
    tunnel_type: "wireguard",
    locale: "en-US",
  });

  const deviceId = registration.id;
  const token = registration.token;
  if (!deviceId || !token) {
    throw new Error("registration response is missing id or token");
  }

  const registeredAt = new Date().toISOString();

  if (wireguardKeys) {
    const config = extractConfig(registration);
    return {
      mode: "wireguard",
      deviceId,
      token,
      name,
      privateKey: wireguardKeys.privateKey,
      publicKey: wireguardKeys.publicKey,
      ...config,
      registeredAt,
      raw: { register: registration },
    };
  }

  const enrolled = await callUpstream("PATCH", `/reg/${deviceId}`, token, {
    key: masqueKeys!.publicKey,
    key_type: "secp256r1",
    tunnel_type: "masque",
    name,
  });

  const config = extractConfig(enrolled);
  return {
    mode: "masque",
    deviceId,
    token,
    name,
    privateKey: masqueKeys!.privateKey,
    publicKey: masqueKeys!.publicKey,
    ...config,
    registeredAt,
    raw: { register: registration, enroll: enrolled },
  };
}
