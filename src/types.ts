export type RegistrationMode = "masque" | "wireguard";

/** Minimal public shape returned by `?format=json`. Nine fields, no raw payloads. */
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
}

/** Full record kept in the Cache API so `?format=raw` and `?format=conf` still work. */
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
    };
  }>;
}

export interface RegisterResponse {
  id?: string;
  token?: string;
  config?: UpstreamConfig;
  [key: string]: unknown;
}
