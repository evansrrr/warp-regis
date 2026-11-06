import { readDevice, writeDevice } from "./store";
import { registerDevice } from "./warp";

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
  "GET /regis": "Register a new WARP (MASQUE) device and cache the result.",
  "GET /device": "Return the most recently registered device.",
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

function parseTtl(raw: string | null): number {
  const value = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(value)) return DEFAULT_TTL;
  return Math.min(MAX_TTL, Math.max(MIN_TTL, value));
}

function parseName(raw: string | null): string {
  const name = (raw ?? "").trim().replace(/[^\w.@-]/g, "-").slice(0, 64);
  return name || DEFAULT_NAME;
}

async function handleRegis(url: URL): Promise<Response> {
  const name = parseName(url.searchParams.get("name"));
  const ttl = parseTtl(url.searchParams.get("ttl"));

  try {
    const device = await registerDevice(name);
    await writeDevice(device, ttl);
    return json(device, 200, { "X-Device-Id": device.deviceId });
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

async function handleDevice(name: string): Promise<Response> {
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
  return json(device);
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

    if (path === "/device") {
      return handleDevice("latest");
    }

    if (path.startsWith("/device/")) {
      const id = decodeURIComponent(path.slice("/device/".length));
      if (!id || id === "latest") return handleDevice("latest");
      return handleDevice(id);
    }

    return json({ error: "not found", routes: ROUTES }, 404);
  },
};
