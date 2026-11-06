export type RegistrationMode = "masque" | "wireguard";

/** Minimal shape of the KV binding, so the Worker does not depend on global typings. */
export interface KvNamespaceLike {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

/** Minimal shape of the Workers Rate Limiting binding. */
export interface RateLimiterLike {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface Env {
  /** One or more shared secrets, comma separated. Unset or empty means open access. */
  REGIS_KEY?: string;
  /** Default cache lifetime in seconds (default 86400). */
  DEVICE_TTL?: string;
  /** Optional KV namespace; when absent the Cache API is used instead. */
  WARP_KV?: KvNamespaceLike;
  /** Optional rate limiting binding, applied to /regis. */
  RATE_LIMITER?: RateLimiterLike;
}

/** Minimal public shape returned by `?format=json`. */
export interface DeviceSummary {
  mode: RegistrationMode;
  deviceId: string;
  token: string;
  privateKey: string;
  peerPublicKey: string;
  ipv4: string;
  ipv6: string;
  endpoint: string;
  clientId: string;
  /** `clientId` decoded into the three bytes some WARP clients expect as `reserved`. */
  reserved?: number[];
}

/** Full record kept in storage so `?format=raw` and `?format=conf` still work. */
export interface WarpDevice {
  /** How the device was enrolled. */
  mode: RegistrationMode;
  /** Cloudflare device id returned by POST /reg. */
  deviceId: string;
  /** Bearer token for the device; keep it private. */
  token: string;
  /** Device name sent with the MASQUE enrollment (empty for WireGuard devices). */
  name: string;
  /**
   * Private key, base64.
   * - `masque`: P-256, SEC1 / RFC 5915 DER.
   * - `wireguard`: raw 32-byte clamped Curve25519 scalar (WireGuard PrivateKey).
   */
  privateKey: string;
  /** Public key matching `privateKey`. SPKI DER for masque, raw 32 bytes for WireGuard. */
  publicKey: string;
  /** Peer (server) public key, base64 DER for masque and raw 32 bytes for WireGuard. */
  peerPublicKey: string;
  /** Assigned tunnel IPv4 address. */
  ipv4: string;
  /** Assigned tunnel IPv6 address. */
  ipv6: string;
  /** Peer endpoint, when the API returns one. */
  endpoint?: string;
  /** Ports advertised for the peer, in upstream order. */
  ports?: number[];
  /** Cloudflare `config.client_id`; required by some WARP clients as `reserved`. */
  clientId?: string;
  /** ISO-8601 timestamp of the registration. */
  registeredAt: string;
  /** Unmodified upstream responses, for downstream tooling. */
  raw: {
    register: unknown;
    enroll?: unknown;
  };
}

export interface UpstreamConfig {
  client_id?: string;
  interface?: {
    addresses?: {
      v4?: string;
      v6?: string;
    };
  };
  peers?: Array<{
    public_key?: string;
    endpoint?: {
      v4?: string;
      v6?: string;
      host?: string;
      ports?: number[];
    };
  }>;
}

export interface RegisterResponse {
  id?: string;
  token?: string;
  config?: UpstreamConfig;
  [key: string]: unknown;
}
