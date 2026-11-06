import type { DeviceSummary, WarpDevice } from "./types";

/** Fallback peer endpoint when the API omits one. */
export const DEFAULT_ENDPOINT = "engage.cloudflareclient.com:2408";

/**
 * Public, minimal device shape: connection credentials only.
 * `raw`, account facts and routing extras stay out of it on purpose.
 */
export function toSummary(device: WarpDevice): DeviceSummary {
  return {
    mode: device.mode,
    deviceId: device.deviceId,
    token: device.token,
    privateKey: device.privateKey,
    peerPublicKey: device.peerPublicKey,
    ipv4: device.ipv4,
    ipv6: device.ipv6,
    endpoint: device.endpoint ?? DEFAULT_ENDPOINT,
    clientId: device.clientId ?? "",
  };
}
