import { toSummary } from "./device";
import { readDevice, writeDevice } from "./store";
import type { RegistrationMode, WarpDevice } from "./types";
import { registerDevice } from "./warp";
import { toWireGuardConfig } from "./wireguard";

const DEFAULT_TTL = 86_400;
const MIN_TTL = 60;
const MAX_TTL = 604_800;
const DEFAULT_NAME = "warp-regis";

export interface Env {
  /** When set, every /regis and /device request must carry it via ?key= or a bearer token. */
  REGIS_KEY?: string;
  /** Default cache lifetime in seconds for cached devices (default 86400). */
  DEVICE_TTL?: string;
}

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const ROUTES = {
  "GET /regis": "Register a new WARP device. Params: name, ttl, mode=masque|wg, format=json|raw|conf.",
  "GET /device": "Return the latest device on this colo. Params: format=json|raw|conf.",
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

function clampTtl(value: number): number {
  return Math.min(MAX_TTL, Math.max(MIN_TTL, value));
}

/** Default TTL: DEVICE_TTL when set and numeric, otherwise 24 hours. */
function resolveDefaultTtl(env: Env): number {
  const value = Number.parseInt(env.DEVICE_TTL ?? "", 10);
  return Number.isFinite(value) ? clampTtl(value) : DEFAULT_TTL;
}

function parseTtl(raw: string | null, fallback: number): number {
  if (raw === null || raw.trim() === "") return fallback;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) ? clampTtl(value) : fallback;
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

function safeEqual(left: string, right: string): boolean {
  const a = new TextEncoder().encode(left);
  const b = new TextEncoder().encode(right);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) {
    diff |= a[index] ^ b[index];
  }
  return diff === 0;
}

/** Constant-time check of `?key=` or `Authorization: Bearer <key>` against REGIS_KEY. */
function isAuthorized(request: Request, url: URL, env: Env): boolean {
  const expected = env.REGIS_KEY;
  if (!expected) return true;

  const header = request.headers.get("Authorization") ?? "";
  const bearer = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  const provided = url.searchParams.get("key") ?? bearer;

  return provided.length > 0 && safeEqual(provided, expected);
}

function render(device: WarpDevice, format: "json" | "raw" | "conf"): Response {
  if (format === "raw") {
    return json(device.raw);
  }

  if (format === "conf") {
    if (device.mode !== "wireguard") {
      return json(
        {
          error: "unsupported format",
          message: "MASQUE devices have no wg-quick equivalent; use format=json or format=raw.",
        },
        409,
      );
    }
    return text(toWireGuardConfig(device));
  }

  return json(toSummary(device));
}

function parseFormat(raw: string | null, fallback: "json" | "raw"): "json" | "raw" | "conf" | null {
  if (!raw) return fallback;
  const value = raw.toLowerCase();
  if (value === "json" || value === "raw" || value === "conf") return value;
  return null;
}

async function handleRegis(url: URL, env: Env): Promise<Response> {
  const name = parseName(url.searchParams.get("name"));
  const ttl = parseTtl(url.searchParams.get("ttl"), resolveDefaultTtl(env));
  const mode = parseMode(url.searchParams.get("mode"));
  const format = parseFormat(url.searchParams.get("format"), "json");

  if (!mode) {
    return json({ error: "invalid mode", hint: "Use mode=masque (default) or mode=wg." }, 400);
  }
  if (!format) {
    return json(
      { error: "invalid format", hint: "Use format=json (default), raw, or conf." },
      400,
    );
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

async function handleDevice(name: string, format: "json" | "raw" | "conf"): Promise<Response> {
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
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (request.method !== "GET") {
      return json({ error: "method not allowed", hint: "Only GET is supported." }, 405);
    }

    if (path === "/") {
      return json({
        name: "warp-regis",
        routes: ROUTES,
        auth: env.REGIS_KEY ? "key" : "off",
        defaultTtl: resolveDefaultTtl(env),
      });
    }

    const guarded = path === "/regis" || path === "/device" || path.startsWith("/device/");
    if (guarded && !isAuthorized(request, url, env)) {
      return json(
        {
          error: "unauthorized",
          hint: "Pass the key from REGIS_KEY as ?key=<key> or an Authorization: Bearer <key> header.",
        },
        401,
      );
    }

    if (path === "/regis") {
      return handleRegis(url, env);
    }

    // Both endpoints default to the compact device JSON; raw/conf must be explicit.
    const format = parseFormat(url.searchParams.get("format"), "json");
    if (!format) {
      return json({ error: "invalid format", hint: "Use format=json (default), raw, or conf." }, 400);
    }

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
