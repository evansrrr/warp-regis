import { configuredKeys, isAuthorized } from "./auth";
import { toSummary } from "./device";
import { createStore } from "./store";
import type { Env, RegistrationMode, WarpDevice } from "./types";
import {
  UpstreamError,
  enrollMasque,
  getAccount,
  getDevices,
  registerDevice,
  updateLicense,
} from "./warp";
import { toWireGuardConfig } from "./wireguard";

const DEFAULT_TTL = 86_400;
const MIN_TTL = 60;
const MAX_TTL = 604_800;
const DEFAULT_NAME = "warp-regis";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const ROUTES = {
  "GET /regis": "Register a new WARP device. Params: name, ttl, mode, format, jwt.",
  "GET /device": "Latest device on this instance. Params: format.",
  "GET /device/{deviceId}": "Specific device. Params: format.",
  "GET /enroll": "Re-enroll the latest device as MASQUE. Params: name, ttl, format.",
  "GET /account": "Account of the latest device. Params: license=<key>, license=-, devices=1.",
};

type Format = "json" | "raw" | "conf";

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

function fail(
  code: string,
  message: string,
  status: number,
  extra: Record<string, unknown> = {},
): Response {
  return json({ code, error: message, ...extra }, status);
}

/** Maps internal/upstream failures onto the public error shape. */
function mapError(error: unknown, code: string): Response {
  if (error instanceof UpstreamError) {
    return fail(code, "upstream request failed", 502, {
      upstreamStatus: error.status,
      upstreamPath: error.path,
      detail: error.detail.slice(0, 500),
    });
  }
  return fail(code, error instanceof Error ? error.message : String(error), 502);
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
  const name = (raw ?? "")
    .trim()
    .replace(/[^\w.@-]/g, "-")
    .slice(0, 64);
  return name || DEFAULT_NAME;
}

function parseMode(raw: string | null): RegistrationMode | null {
  if (!raw) return "masque";
  const value = raw.toLowerCase();
  if (value === "masque") return "masque";
  if (value === "wg" || value === "wireguard") return "wireguard";
  return null;
}

function parseFormat(raw: string | null, fallback: Format = "json"): Format | null {
  if (!raw) return fallback;
  const value = raw.toLowerCase();
  if (value === "json" || value === "raw" || value === "conf") return value;
  return null;
}

async function isRateLimited(request: Request, env: Env): Promise<boolean> {
  if (!env.RATE_LIMITER) return false;
  const key = request.headers.get("CF-Connecting-IP") ?? "anonymous";
  const { success } = await env.RATE_LIMITER.limit({ key });
  return !success;
}

function render(device: WarpDevice, format: Format): Response {
  if (format === "raw") return json(device.raw);

  if (format === "conf") {
    if (device.mode !== "wireguard") {
      return fail(
        "unsupported_format",
        "MASQUE devices have no wg-quick equivalent; use format=json or format=raw.",
        409,
      );
    }
    return text(toWireGuardConfig(device));
  }

  return json(toSummary(device));
}

async function handleRegis(url: URL, env: Env): Promise<Response> {
  const mode = parseMode(url.searchParams.get("mode"));
  const format = parseFormat(url.searchParams.get("format"));
  const name = parseName(url.searchParams.get("name"));
  const ttl = parseTtl(url.searchParams.get("ttl"), resolveDefaultTtl(env));
  const jwt = url.searchParams.get("jwt")?.trim() || undefined;

  if (!mode) {
    return fail("invalid_mode", "mode must be masque or wg", 400, {
      hint: "Use mode=masque (default) or mode=wg.",
    });
  }
  if (!format) {
    return fail("invalid_format", "format must be json, raw or conf", 400);
  }

  try {
    const device = await registerDevice(name, mode, { jwt });
    await createStore(env).write(device, ttl);
    return render(device, format);
  } catch (error) {
    return mapError(error, "registration_failed");
  }
}

async function handleDevice(name: string, format: Format, env: Env): Promise<Response> {
  const device = await createStore(env).read(name);
  if (!device) {
    return fail("not_found", "device not found", 404, {
      hint:
        name === "latest"
          ? "Hit GET /regis first. With the Cache API backend a miss is also possible on another colo or after the TTL expires; bind WARP_KV for durable storage."
          : "No device with this id is stored on this instance.",
    });
  }
  return render(device, format);
}

async function handleEnroll(url: URL, env: Env): Promise<Response> {
  const format = parseFormat(url.searchParams.get("format"));
  const ttl = parseTtl(url.searchParams.get("ttl"), resolveDefaultTtl(env));
  if (!format) {
    return fail("invalid_format", "format must be json, raw or conf", 400);
  }

  const store = createStore(env);
  const current = await store.read("latest");
  if (!current) {
    return fail("not_found", "no device to enroll", 404, { hint: "Call GET /regis first." });
  }
  if (current.mode === "masque") {
    return fail("already_masque", "device is already enrolled as MASQUE", 409);
  }

  const name = parseName(url.searchParams.get("name") ?? current.name);
  try {
    const device = await enrollMasque(current, name);
    await store.write(device, ttl);
    return render(device, format);
  } catch (error) {
    return mapError(error, "enroll_failed");
  }
}

async function handleAccount(url: URL, env: Env): Promise<Response> {
  const store = createStore(env);
  const device = await store.read("latest");
  if (!device) {
    return fail("not_found", "no device in storage", 404, { hint: "Call GET /regis first." });
  }

  try {
    if (url.searchParams.get("devices") === "1") {
      return json(await getDevices(device));
    }

    const license = url.searchParams.get("license");
    if (license !== null) {
      const result = await updateLicense(device, license === "-" ? null : license);
      return json({ ok: true, license: license === "-" ? null : license, upstream: result });
    }

    return json(await getAccount(device));
  } catch (error) {
    return mapError(error, "account_failed");
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (request.method !== "GET") {
      return fail("method_not_allowed", "only GET is supported", 405);
    }

    if (path === "/") {
      return json({
        name: "warp-regis",
        routes: ROUTES,
        auth: configuredKeys(env).length > 0 ? "key" : "off",
        storage: env.WARP_KV ? "kv" : "cache",
        defaultTtl: resolveDefaultTtl(env),
      });
    }

    const guarded =
      path === "/regis" ||
      path === "/device" ||
      path.startsWith("/device/") ||
      path === "/enroll" ||
      path === "/account";

    if (guarded && !isAuthorized(request, url, env)) {
      return fail("unauthorized", "missing or invalid key", 401, {
        hint: "Send Authorization: Bearer <REGIS_KEY> (preferred) or ?key=<REGIS_KEY>.",
      });
    }

    if (path === "/regis") {
      if (await isRateLimited(request, env)) {
        return fail("rate_limited", "too many registration attempts", 429);
      }
      return handleRegis(url, env);
    }

    if (path === "/enroll") {
      return handleEnroll(url, env);
    }

    if (path === "/account") {
      return handleAccount(url, env);
    }

    const format = parseFormat(url.searchParams.get("format"));
    if (!format) {
      return fail("invalid_format", "format must be json, raw or conf", 400);
    }

    if (path === "/device") {
      return handleDevice("latest", format, env);
    }

    if (path.startsWith("/device/")) {
      const id = decodeURIComponent(path.slice("/device/".length));
      return handleDevice(id || "latest", format, env);
    }

    return fail("not_found", "unknown route", 404, { routes: ROUTES });
  },
};
