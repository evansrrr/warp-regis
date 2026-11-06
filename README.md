# warp-regis

A [Cloudflare WARP](https://1.1.1.1/) device registrar that runs on Cloudflare Workers.

Hit `GET /regis` to register a device, then open `GET /device` to read the credentials as JSON.
Both MASQUE and classic WireGuard enrollment are supported. No database is required: results are
handed back immediately and kept in the Cache API, or in KV if you bind it.

```bash
curl https://<your-worker>.workers.dev/regis              # MASQUE, 9-field JSON
curl https://<your-worker>.workers.dev/regis?mode=wg      # WireGuard
curl https://<your-worker>.workers.dev/device
```

## How registration works

Both modes start from the same call:

`POST https://api.cloudflareclient.com/v0a4471/reg` bootstraps a WARP account and returns
`id`, `token`, the tunnel addresses and the peer public key.

What happens next depends on the mode:

| Mode | Request extra | Key type | Result |
| --- | --- | --- | --- |
| `masque` (default) | `PATCH /v0a4471/reg/{id}` with a P-256 key, `tunnel_type: masque` | secp256r1 (P-256) | MASQUE / Connect-IP credentials |
| `wireguard` (`?mode=wg`) | none — the account is already enrolled with the key sent at registration | curve25519 (X25519) | Standard WireGuard credentials + `wg-quick` config |

The MASQUE private key is exported as SEC1 / RFC 5915 DER and base64-encoded, matching Go's
`x509.MarshalECPrivateKey` output. The WireGuard private key is the raw 32-byte clamped scalar,
base64-encoded — exactly what `[Interface] PrivateKey` expects.

WireGuard devices need a *real* Curve25519 keypair, because the key sent to `/reg` is the one the
tunnel uses; the public key is derived locally with a small RFC 7748 implementation
(`src/x25519.ts`), so no dependency and no runtime WebCrypto support is required.

## MASQUE vs WireGuard

| | MASQUE | WireGuard |
| --- | --- | --- |
| Transport | QUIC / HTTP/3 + Connect-IP (RFC 9484), TLS 1.3 | WireGuard over UDP (2408, 500, 1701, 4500) |
| Key type | P-256 / secp256r1 | Curve25519 / X25519 |
| Registration calls | `POST /reg`, then `PATCH /reg/{id}` | `POST /reg` only |
| Config format | client-specific JSON | `wg-quick` / native `.conf` |
| Client support | mihomo, sing-box, usque, this worker | official apps, `wireguard-tools`, most routers |
| Survives UDP blocking | yes, looks like HTTPS/QUIC on 443 | no, needs UDP reachability |

Both modes hit the same account API and yield the same tunnel addresses. MASQUE clients (usque,
freev6) also register with a curve25519 key first and only then swap it for a P-256 key, so the
WireGuard path is the shorter subset of the same flow.

## Deploy

```bash
npm install
npx wrangler deploy
```

Or click through the dashboard: create a Worker, paste `src/index.ts` (bundled), deploy.

Requirements: a Cloudflare account and Node.js 18+ for the Wrangler CLI.

## Endpoints

| Route | Description |
| --- | --- |
| `GET /` | Route index: auth mode, storage backend, effective TTL. |
| `GET /regis` | Register a new device, store it, and return it. |
| `GET /device` | Return the latest device on this instance. |
| `GET /device/{deviceId}` | Return a specific stored device. |
| `GET /enroll` | Re-enroll the latest device as MASQUE with a fresh P-256 key. |
| `GET /account` | Proxy the upstream account of the latest device. |

Query parameters for `/regis`:

| Param | Default | Description |
| --- | --- | --- |
| `name` | `warp-regis` | Device name. Applied server-side for `masque`; informational for `wireguard`. |
| `ttl` | `DEVICE_TTL` or `86400` | Storage lifetime in seconds, clamped to `60`–`604800`. |
| `mode` | `masque` | `masque` or `wg` (alias `wireguard`). |
| `format` | `json` | `json`, `raw` (upstream responses only) or `conf` (wg-quick, WireGuard only). |
| `jwt` | unset | ZeroTrust team token, sent as `CF-Access-Jwt-Assertion`. |

`/device` and `/device/{id}` take only `format`, with the same default (`json`).

`/account` actions:

| Param | Description |
| --- | --- |
| *(none)* | Upstream `GET /reg/{id}/account` payload. |
| `license=<key>` | Bind a WARP+ license to the device. |
| `license=-` | Clear the bound license. |
| `devices=1` | List devices sharing the license. |

```bash
curl https://<your-worker>.workers.dev/regis
curl https://<your-worker>.workers.dev/regis?name=phone&ttl=3600
curl https://<your-worker>.workers.dev/regis?mode=wg            # classic WireGuard
curl https://<your-worker>.workers.dev/regis?mode=wg&format=conf
curl https://<your-worker>.workers.dev/regis?jwt=<team-token>   # ZeroTrust
curl https://<your-worker>.workers.dev/device                   # same compact JSON
curl https://<your-worker>.workers.dev/device?format=raw        # upstream responses
curl https://<your-worker>.workers.dev/enroll                   # WireGuard -> MASQUE
curl https://<your-worker>.workers.dev/account?license=<key>
```

## Configuration

Everything is optional; the Worker is fully functional as deployed.

| Variable / binding | Default | Description |
| --- | --- | --- |
| `REGIS_KEY` | unset (open) | One or more shared secrets, comma separated, for rotation. |
| `DEVICE_TTL` | `86400` | Default storage lifetime in seconds, clamped to `60`–`604800`. `?ttl=` wins. |
| `WARP_KV` | unset | KV namespace binding. When bound, devices are durable and globally readable. |
| `RATE_LIMITER` | unset | Workers Rate Limiting binding, applied to `/regis`. |

```bash
npx wrangler secret put REGIS_KEY                        # sensitive
npx wrangler deploy --var DEVICE_TTL:604800              # or [vars] in wrangler.toml

npx wrangler kv namespace create WARP_KV                  # then uncomment the binding
# [[ratelimits]] simple = { limit = 10, period = 60 }     # optional, on /regis
```

### Key auth

With `REGIS_KEY` set, every data route (`/regis`, `/device`, `/device/{id}`, `/enroll`, `/account`)
requires it. Prefer the header:

```bash
curl -H "Authorization: Bearer <REGIS_KEY>" https://<your-worker>.workers.dev/device
```

`?key=<REGIS_KEY>` works too, but query strings land in access logs and `Referer` headers — use it
for manual poking only. Without `REGIS_KEY` the Worker stays open, which is the default. The
comparison is constant-time and accepts any of the comma-separated keys, so you can rotate by
appending a new one, redeploying, then removing the old.

`GET /` reports `auth`, `storage` and the effective `defaultTtl`.

## Response

`/regis` and `/device` both return the compact nine-field device below. Add `?format=raw` for the
untouched upstream responses (`{ "register": {...} }`, plus `"enroll"` for MASQUE), or
`?format=conf` for a wg-quick config. Both full upstream
payloads and a field-by-field diff live in [docs/response-shape.md](docs/response-shape.md).

```json
{
  "mode": "masque",
  "deviceId": "11111111-1111-4111-8111-111111111111",
  "token": "22222222-2222-4222-8222-222222222222",
  "privateKey": "MGsCAQEEIJ+HMzsCZSwVKlRVzp3/6GtBCm8j0eDY03mukSfyAy2RoUQDQgAE...",
  "peerPublicKey": "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEIaU7MToJm9NKp8YfGxR6r...",
  "ipv4": "172.16.0.2",
  "ipv6": "2606:4700:110:8f8a:81c6:c5fa:f31c:a4f2",
  "endpoint": "engage.cloudflareclient.com:443",
  "clientId": "h6xM",
  "reserved": [135, 170, 76]
}
```

Nine connection fields plus `reserved` — no account block, no timestamps, no upstream bodies.

Field notes:

- `mode` — `masque` or `wireguard`; decides how the keys are encoded.
- `privateKey` — `masque`: P-256 private key, SEC1 DER, base64. `wireguard`: raw 32-byte clamped
  Curve25519 scalar, base64.
- `peerPublicKey` — base64 DER for masque (PEM armor stripped), raw 32 bytes for wireguard.
- `endpoint` — `endpoint.host` with the first advertised port (`443` for MASQUE, `2408` for
  WireGuard); `endpoint.v4` is frequently reported with port `0` and is not used.
- `clientId` / `reserved` — `config.client_id` and its three decoded bytes, which some WARP clients
  expect as `reserved`.

The public key matching `privateKey` can be derived if you need it: for WireGuard it is
`X25519(privateKey, 9)`, for MASQUE it is the SPKI form of the P-256 key. Use `?format=raw` for
the complete upstream payloads.

Errors are structured, so clients can branch on `code`:

```json
{
  "code": "registration_failed",
  "error": "upstream request failed",
  "upstreamStatus": 429,
  "upstreamPath": "/reg",
  "detail": "{\"errors\":[{\"code\":1015,\"message\":\"rate limited\"}]}"
}
```

Codes: `invalid_mode`, `invalid_format`, `unauthorized`, `rate_limited`, `not_found`,
`already_masque`, `unsupported_format`, `registration_failed`, `enroll_failed`, `account_failed`,
`method_not_allowed`.

### WireGuard config output

With `?mode=wg&format=conf` (or `?format=conf` on `/device`) the Worker returns a `wg-quick`
config instead of JSON:

```ini
[Interface]
PrivateKey = oBwoV/ivsgjHrQls2RjSMrOstI670o87WfP0XnJD9mo=
Address = 172.16.0.2/32, 2606:4700:110:846d:5e52:2b9c:2d84:c1f7/128
DNS = 1.1.1.1, 1.0.0.1, 2606:4700:4700::1111, 2606:4700:4700::1001
MTU = 1280

[Peer]
PublicKey = bmXOC+F1FxEMF9dyiK2H5/1SUtzH0JuVo51h2wPfgyo=
AllowedIPs = 0.0.0.0/0, ::/0
Endpoint = engage.cloudflareclient.com:2408
PersistentKeepalive = 25
```

## Storage model

Storage is pluggable and both backends store the same record under `device/latest` and
`device/{deviceId}`:

| Backend | When | Behaviour |
| --- | --- | --- |
| KV (`WARP_KV`) | binding present | Durable, readable from every colo, honours `ttl` as `expirationTtl`. |
| Cache API | no binding | Zero setup; per-colo, best-effort, entries can be evicted. |

With the Cache API backend a `/device` request that lands in a different colo than the `/regis`
request can return `404` — retry, or bind KV. Either way the credentials themselves stay valid
until the WARP account's own `ttl` (roughly three months), which is visible in `?format=raw`.

Nothing else is persisted, and no credentials are written to logs.

## Security

- **Open by default.** Anyone who can reach the Worker can register devices and read the returned
  `token` / `privateKey` unless `REGIS_KEY` is set.
- Prefer `Authorization: Bearer`; `?key=` ends up in logs and `Referer` headers.
- `REGIS_KEY` accepts a comma-separated list, so rotation needs no downtime.
- Bind `RATE_LIMITER` if the endpoint is public; `/regis` creates real devices and upstream applies
  its own limits.
- Registration creates real WARP devices. Clean up unused ones in your Cloudflare WARP account if
  that matters to you.

## Local development

```bash
npm install
npm run dev        # http://127.0.0.1:8787
npm run typecheck
npm test           # 38 tests in the Workers runtime via vitest
```

`wrangler dev` runs the Worker locally with Miniflare, including the Cache API. Tests cover X25519
against the RFC 7748 vectors, PKCS#8→SEC1 conversion, the summary mapping, auth, both storage
backends and the HTTP routes with a mocked upstream.

## License

MIT
