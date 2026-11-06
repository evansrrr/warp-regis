import { readDevice, writeDevice } from "./store";
import type { RegistrationMode, WarpDevice } from "./types";
import { registerDevice } from "./warp";
import { toWireGuardConfig } from "./wireguard";

const DEFAULT_TTL = 86_400;
const MIN_TTL = 60;
const MAX_TTL = 604_800;
const DEFAULT_NAME = "warp-regis";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const ROUTES = {
  "GET /regis": "Register a new WARP device and cache the result. Params: name, ttl, mode=masque|wg, format=json|conf.",
  "GET /device": "Return the most recently registered device. Params: format=json|conf.",
  "GET /device/{deviceId}": "Return a specific device registered on this colo.",
};

function json(body: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      // Credentials are in the payload; never let a browser or edge cache them.
      "Cache-Control": "no-store",
      ...CORS_HEADERS,
      ...extraHeaders,
    },
  });
}

function text(body: string): Response {
  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      ...CORS_HEADERS,
    },
  });
}

function parseTtl(raw: string | null): number {
  const value = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(value)) return DEFAULT_TTL;
  return Math.min(MAX_TTL, Math.max(MIN_TTL, value));
}

function parseName(raw: string | null): string {
  const name = (raw ?? "").trim().replace(/[^\w.@-]/g, "-").slice(0, 64);
  return name || DEFAULT_NAME;
}

function parseMode(raw: string | null): RegistrationMode | null {
  if (!raw) return "masque";
  const value = raw.toLowerCase();
  if (value === "masque") return "masque";
  if (value === "wg" || value === "wireguard") return "wireguard";
  return null;
}

function render(device: WarpDevice, format: string | null): Response {
  if (format === "conf") {
    if (device.mode !== "wireguard") {
      return json(
        {
          error: "unsupported format",
          message: "MASQUE devices have no wg-quick equivalent; use the default JSON output.",
        },
        409,
      );
    }
    return text(toWireGuardConfig(device));
  }
  return json(device);
}

async function handleRegis(url: URL): Promise<Response> {
  const name = parseName(url.searchParams.get("name"));
  const ttl = parseTtl(url.searchParams.get("ttl"));
  const mode = parseMode(url.searchParams.get("mode"));
  const format = url.searchParams.get("format");

  if (!mode) {
    return json({ error: "invalid mode", hint: "Use mode=masque (default) or mode=wg." }, 400);
  }

  try {
    const device = await registerDevice(name, mode);
    await writeDevice(device, ttl);
    return render(device, format);
  } catch (error) {
    return json(
      {
        error: "registration failed",
        message: error instanceof Error ? error.message : String(error),
      },
      502,
    );
  }
}

async function handleDevice(name: string, format: string | null): Promise<Response> {
  const device = await readDevice(name);
  if (!device) {
    return json(
      {
        error: "device not found",
        hint:
          name === "latest"
            ? "Hit GET /regis first. Results are stored in the Cache API, so a miss is also possible on a different colo or after the TTL expires."
            : "No device with this id is cached on this colo.",
      },
      404,
    );
  }
  return render(device, format);
}

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (request.method !== "GET") {
      return json({ error: "method not allowed", hint: "Only GET is supported." }, 405);
    }

    if (path === "/") {
      return json({ name: "warp-regis", routes: ROUTES });
    }

    if (path === "/regis") {
      return handleRegis(url);
    }

    const format = url.searchParams.get("format");

    if (path === "/device") {
      return handleDevice("latest", format);
    }

    if (path.startsWith("/device/")) {
      const id = decodeURIComponent(path.slice("/device/".length));
      if (!id || id === "latest") return handleDevice("latest", format);
      return handleDevice(id, format);
    }

    return json({ error: "not found", routes: ROUTES }, 404);
  },
};
