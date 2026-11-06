import type { DeviceSummary, RegistrationMode, WarpDevice } from "./types";

/** Fallback peer endpoint when the API omits one, keyed by mode. */
export const DEFAULT_ENDPOINT: Record<RegistrationMode, string> = {
  masque: "engage.cloudflareclient.com:443",
  wireguard: "engage.cloudflareclient.com:2408",
};

/** `client_id` is base64 of three bytes; some WARP clients want them as `reserved`. */
function decodeReserved(clientId: string | undefined): number[] | undefined {
  if (!clientId) return undefined;
  try {
    const binary = atob(clientId);
    if (binary.length === 0) return undefined;
    return [...binary].map((char) => char.charCodeAt(0));
  } catch {
    return undefined;
  }
}

/**
 * Public, minimal device shape: connection credentials only.
 * `raw`, account facts and routing extras stay out of it on purpose.
 */
export function toSummary(device: WarpDevice): DeviceSummary {
  const reserved = decodeReserved(device.clientId);
  return {
    mode: device.mode,
    deviceId: device.deviceId,
    token: device.token,
    privateKey: device.privateKey,
    peerPublicKey: device.peerPublicKey,
    ipv4: device.ipv4,
    ipv6: device.ipv6,
    endpoint: device.endpoint ?? DEFAULT_ENDPOINT[device.mode],
    clientId: device.clientId ?? "",
    ...(reserved ? { reserved } : {}),
  };
}
