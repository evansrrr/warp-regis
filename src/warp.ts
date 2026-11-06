import { generateP256KeyPair, generateX25519KeyPair, randomBase64, randomHex } from "./crypto";
import type { RegisterResponse, RegistrationMode, WarpDevice } from "./types";

/** Same account API + client fingerprint as the reference implementations. */
const API_BASE = "https://api.cloudflareclient.com/v0a4471";
const REQUEST_TIMEOUT_MS = 10_000;

const BASE_HEADERS: Record<string, string> = {
  "User-Agent": "WARP for Android",
  "CF-Client-Version": "a-6.35-4471",
  "Content-Type": "application/json; charset=UTF-8",
};

const DEFAULT_PORTS: Record<RegistrationMode, number> = { masque: 443, wireguard: 2408 };

/** Upstream rejected the request; `status` and `detail` are surfaced to the caller. */
export class UpstreamError extends Error {
  constructor(
    readonly status: number,
    readonly path: string,
    readonly detail: string,
  ) {
    super(`upstream ${path} failed (HTTP ${status}): ${detail.slice(0, 300)}`);
    this.name = "UpstreamError";
  }
}

/** `2006-01-02T15:04:05.000-07:00`, i.e. the format the client sends for `tos`. */
function cloudflareTimestamp(now: Date = new Date()): string {
  return now.toISOString().replace("Z", "+00:00");
}

interface RequestOptions {
  token?: string | null;
  payload?: unknown;
  headers?: Record<string, string>;
  /** Retries once on network failures and timeouts, never on 4xx. */
  retry?: boolean;
}

async function send(
  method: "POST" | "PATCH" | "PUT" | "DELETE" | "GET",
  path: string,
  options: RequestOptions = {},
): Promise<RegisterResponse> {
  const { token = null, payload, headers: extraHeaders = {}, retry = true } = options;

  const attempt = async (): Promise<RegisterResponse> => {
    const headers: Record<string, string> = {
      ...BASE_HEADERS,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...extraHeaders,
    };

    const response = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: payload === undefined ? undefined : JSON.stringify(payload),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    const body = await response.text();
    if (!response.ok) {
      throw new UpstreamError(response.status, path, body);
    }

    if (body.trim() === "") return {};
    try {
      return JSON.parse(body) as RegisterResponse;
    } catch {
      throw new UpstreamError(response.status, path, `non-JSON body: ${body.slice(0, 200)}`);
    }
  };

  try {
    return await attempt();
  } catch (error) {
    if (!retry || error instanceof UpstreamError) throw error;
    return attempt();
  }
}

/** Strips PEM armor (MASQUE peer keys) and any whitespace / line breaks (WireGuard keys). */
function normalizePeerKey(value: string): string {
  return value
    .replace(/-----(BEGIN|END) PUBLIC KEY-----/g, "")
    .replace(/\s+/g, "");
}

/** Combines `endpoint.host` with the advertised port list into a usable `host:port`. */
function buildEndpoint(
  host: string | undefined,
  ports: number[] | undefined,
  mode: RegistrationMode,
): { endpoint: string; ports?: number[] } {
  const port = ports?.[0] ?? DEFAULT_PORTS[mode];
  const hostname = (host ?? "engage.cloudflareclient.com").replace(/:\d+$/, "");
  return ports?.length ? { endpoint: `${hostname}:${port}`, ports } : { endpoint: `${hostname}:${port}` };
}

function extractConfig(account: RegisterResponse, mode: RegistrationMode) {
  const peer = account.config?.peers?.[0];
  const addresses = account.config?.interface?.addresses;

  const peerPublicKey = peer?.public_key ? normalizePeerKey(peer.public_key) : "";
  if (!peerPublicKey) throw new Error("response is missing the peer public key");

  const ipv4 = addresses?.v4 ?? "";
  const ipv6 = addresses?.v6 ?? "";
  if (!ipv4 && !ipv6) throw new Error("response is missing the tunnel addresses");

  const { endpoint, ports } = buildEndpoint(peer?.endpoint?.host, peer?.endpoint?.ports, mode);
  const clientId = account.config?.client_id;

  return {
    ipv4,
    ipv6,
    peerPublicKey,
    endpoint,
    ...(ports ? { ports } : {}),
    ...(clientId ? { clientId } : {}),
  };
}

interface RegisterOptions {
  /** ZeroTrust team token, sent as `CF-Access-Jwt-Assertion` on the registration call. */
  jwt?: string;
}

/**
 * Registers a WARP device.
 *
 * `wireguard`: one POST /reg with a real Curve25519 public key.
 * `masque`: POST /reg bootstraps the account, then PATCH /reg/{id} swaps in a P-256 key
 * with tunnel_type=masque.
 */
export async function registerDevice(
  name: string,
  mode: RegistrationMode = "masque",
  options: RegisterOptions = {},
): Promise<WarpDevice> {
  const wireguardKeys = mode === "wireguard" ? generateX25519KeyPair() : null;
  const masqueKeys = mode === "masque" ? await generateP256KeyPair() : null;

  const registration = await send("POST", "/reg", {
    payload: {
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
    },
    headers: options.jwt ? { "CF-Access-Jwt-Assertion": options.jwt } : {},
  });

  const deviceId = registration.id;
  const token = registration.token;
  if (!deviceId || !token) {
    throw new Error("registration response is missing id or token");
  }

  const registeredAt = new Date().toISOString();

  if (wireguardKeys) {
    return {
      mode: "wireguard",
      deviceId,
      token,
      name,
      privateKey: wireguardKeys.privateKey,
      publicKey: wireguardKeys.publicKey,
      ...extractConfig(registration, "wireguard"),
      registeredAt,
      raw: { register: registration },
    };
  }

  const enrolled = await send("PATCH", `/reg/${deviceId}`, {
    token,
    payload: { key: masqueKeys!.publicKey, key_type: "secp256r1", tunnel_type: "masque", name },
  });

  return {
    mode: "masque",
    deviceId,
    token,
    name,
    privateKey: masqueKeys!.privateKey,
    publicKey: masqueKeys!.publicKey,
    ...extractConfig(enrolled, "masque"),
    registeredAt,
    raw: { register: registration, enroll: enrolled },
  };
}

/** Re-enrolls an existing device as MASQUE with a fresh P-256 key (usque's `enroll`). */
export async function enrollMasque(device: WarpDevice, name: string): Promise<WarpDevice> {
  const keys = await generateP256KeyPair();
  const enrolled = await send("PATCH", `/reg/${device.deviceId}`, {
    token: device.token,
    payload: { key: keys.publicKey, key_type: "secp256r1", tunnel_type: "masque", name },
  });

  return {
    mode: "masque",
    deviceId: device.deviceId,
    token: device.token,
    name,
    privateKey: keys.privateKey,
    publicKey: keys.publicKey,
    ...extractConfig(enrolled, "masque"),
    registeredAt: new Date().toISOString(),
    raw: { register: device.raw.register, enroll: enrolled },
  };
}

export async function getAccount(device: WarpDevice): Promise<unknown> {
  return send("GET", `/reg/${device.deviceId}/account`, { token: device.token });
}

export async function getDevices(device: WarpDevice): Promise<unknown> {
  return send("GET", `/reg/${device.deviceId}/account/devices`, { token: device.token });
}

/** Binds (`license`) or clears (`null`) the WARP+ license of an existing device. */
export async function updateLicense(device: WarpDevice, license: string | null): Promise<unknown> {
  if (license === null) {
    return send("DELETE", `/reg/${device.deviceId}/account`, { token: device.token });
  }
  return send("PUT", `/reg/${device.deviceId}/account`, { token: device.token, payload: { license } });
}
