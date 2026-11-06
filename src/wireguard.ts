import type { WarpDevice } from "./types";

const DEFAULT_ENDPOINT = "engage.cloudflareclient.com:2408";

/**
 * Renders a wg-quick style config for a WireGuard-mode device.
 * MASQUE devices cannot be expressed in this format.
 */
export function toWireGuardConfig(device: WarpDevice): string {
  if (device.mode !== "wireguard") {
    throw new Error("only WireGuard devices can be rendered as a wg-quick config");
  }

  const addresses = [device.ipv4 ? `${device.ipv4}/32` : "", device.ipv6 ? `${device.ipv6}/128` : ""]
    .filter(Boolean)
    .join(", ");

  const lines = [
    "[Interface]",
    `PrivateKey = ${device.privateKey}`,
    `Address = ${addresses}`,
    "DNS = 1.1.1.1, 1.0.0.1, 2606:4700:4700::1111, 2606:4700:4700::1001",
    "MTU = 1280",
    "",
    "[Peer]",
    `PublicKey = ${device.peerPublicKey}`,
    "AllowedIPs = 0.0.0.0/0, ::/0",
    `Endpoint = ${device.endpoint ?? DEFAULT_ENDPOINT}`,
    "PersistentKeepalive = 25",
  ];

  return `${lines.join("\n")}\n`;
}
