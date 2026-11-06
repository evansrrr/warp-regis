import { generateP256KeyPair, randomBase64, randomHex } from "./crypto";
import type { RegisterResponse, WarpDevice } from "./types";

/** Same account API + client fingerprint as the reference implementation. */
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

function stripPem(value: string): string {
  return value
    .replace(/-----BEGIN PUBLIC KEY-----/g, "")
    .replace(/-----END PUBLIC KEY-----/g, "")
    .replace(/\s+/g, "");
}

/**
 * Registers a WARP device and enrolls a MASQUE (P-256) key:
 *   1. POST /reg   — bootstrap account with a throwaway curve25519 key, returns id + token
 *   2. PATCH /reg/{id} — swap in the P-256 key, tunnel_type=masque, returns addresses + peer key
 */
export async function registerDevice(name: string): Promise<WarpDevice> {
  const registration = await callUpstream("POST", "/reg", null, {
    key: randomBase64(32),
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

  const keys = await generateP256KeyPair();
  const enrolled = await callUpstream("PATCH", `/reg/${deviceId}`, token, {
    key: keys.publicKey,
    key_type: "secp256r1",
    tunnel_type: "masque",
    name,
  });

  const peer = enrolled.config?.peers?.[0];
  const peerPublicKey = peer?.public_key ? stripPem(peer.public_key) : "";
  if (!peerPublicKey) {
    throw new Error("enrollment response is missing the peer public key");
  }

  const addresses = enrolled.config?.interface?.addresses;
  const ipv4 = addresses?.v4 ?? "";
  const ipv6 = addresses?.v6 ?? "";
  if (!ipv4 && !ipv6) {
    throw new Error("enrollment response is missing the tunnel addresses");
  }

  // `endpoint.v4` is often reported as "x.x.x.x:0"; the hostname carries the real port.
  const endpoint = peer?.endpoint?.host ?? peer?.endpoint?.v4;

  return {
    deviceId,
    token,
    name,
    privateKey: keys.privateKey,
    publicKey: keys.publicKey,
    peerPublicKey,
    ipv4,
    ipv6,
    ...(endpoint ? { endpoint } : {}),
    registeredAt: new Date().toISOString(),
    raw: {
      register: registration,
      enroll: enrolled,
    },
  };
}
