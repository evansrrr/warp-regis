export interface WarpDevice {
  /** Cloudflare device id returned by POST /reg. */
  deviceId: string;
  /** Bearer token for the device; keep it private. */
  token: string;
  /** Device name sent with the MASQUE enrollment. */
  name: string;
  /** P-256 private key, SEC1 DER, base64 (same encoding as the reference implementation). */
  privateKey: string;
  /** P-256 public key, SPKI DER, base64. */
  publicKey: string;
  /** Peer (server) public key, base64 DER with the PEM armor stripped. */
  peerPublicKey: string;
  /** Assigned tunnel IPv4 address. */
  ipv4: string;
  /** Assigned tunnel IPv6 address. */
  ipv6: string;
  /** Peer endpoint, when the API returns one. */
  endpoint?: string;
  /** ISO-8601 timestamp of the registration. */
  registeredAt: string;
  /** Unmodified upstream responses, for downstream tooling. */
  raw: {
    register: unknown;
    enroll: unknown;
  };
}

export interface UpstreamConfig {
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
