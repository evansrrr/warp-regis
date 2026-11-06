# warp-regis

A stateless [Cloudflare WARP](https://1.1.1.1/) device registrar that runs on Cloudflare Workers.

Hit `GET /regis` to register a device, then open `GET /device` to read the credentials as JSON.
No KV, no D1, no Durable Objects — the result is handed back immediately and memoized in the
Cache API, so deploying is a single `wrangler deploy` with zero bindings to provision.

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
| `GET /` | Route index (also reports whether key auth is on). |
| `GET /regis` | Register a new device, cache it, and return it. |
| `GET /device` | Return the latest device on this colo. |
| `GET /device/{deviceId}` | Return a specific cached device. |

Query parameters for `/regis`:

| Param | Default | Description |
| --- | --- | --- |
| `name` | `warp-regis` | Device name. Applied server-side for `masque`; informational for `wireguard`. |
| `ttl` | `86400` | Cache lifetime in seconds, clamped to `60`–`604800`. |
| `mode` | `masque` | `masque` or `wg` (alias `wireguard`). |
| `format` | `json` | `json`, `raw` (upstream responses only) or `conf` (wg-quick, WireGuard only). |

`/device` and `/device/{id}` take only `format`, with the same default (`json`).

```bash
curl https://<your-worker>.workers.dev/regis
curl https://<your-worker>.workers.dev/regis?name=phone&ttl=3600
curl https://<your-worker>.workers.dev/regis?mode=wg            # classic WireGuard
curl https://<your-worker>.workers.dev/regis?mode=wg&format=conf
curl https://<your-worker>.workers.dev/device                   # same compact JSON
curl https://<your-worker>.workers.dev/device?format=raw        # upstream responses
curl https://<your-worker>.workers.dev/device?format=conf
```

## Access control

Set `REGIS_KEY` and `/regis` and `/device` stop answering without it:

```bash
npx wrangler secret put REGIS_KEY     # or [vars] REGIS_KEY = "..." in wrangler.toml
```

Then pass it as `?key=` or as a bearer token:

```bash
curl "https://<your-worker>.workers.dev/regis?key=<REGIS_KEY>"
curl -H "Authorization: Bearer <REGIS_KEY>" https://<your-worker>.workers.dev/device
```

Without `REGIS_KEY` the Worker stays open, which is the default. The comparison is constant-time;
`GET /` reports `"auth": "key"` or `"auth": "off"`.

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
  "endpoint": "engage.cloudflareclient.com:2408",
  "clientId": "h6xM"
}
```

Nine fields, connection credentials only — no account block, no timestamps, no upstream bodies.

Field notes:

- `mode` — `masque` or `wireguard`; decides how the keys are encoded.
- `privateKey` — `masque`: P-256 private key, SEC1 DER, base64. `wireguard`: raw 32-byte clamped
  Curve25519 scalar, base64.
- `peerPublicKey` — base64 DER for masque (PEM armor stripped), raw 32 bytes for wireguard.
- `endpoint` — `endpoint.host` from the peer config, falling back to
  `engage.cloudflareclient.com:2408`; `endpoint.v4` is frequently reported with port `0`.
- `clientId` — `config.client_id`; some WARP clients want it as the `reserved` field.

The public key matching `privateKey` can be derived if you need it: for WireGuard it is
`X25519(privateKey, 9)`, for MASQUE it is the SPKI form of the P-256 key. Use `?format=raw` for
the complete upstream payloads.

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

This is deliberately not a database-backed service:

- Devices are written to the **Cache API** under `device/latest` and `device/{deviceId}`.
- Entries live **per colo**, honour the `ttl` parameter, and may be evicted at any time.
- A `/device` request that lands in a different colo than the `/regis` request can return `404`.
  Retry, or call `/regis` again — registration is cheap.
- Nothing is stored outside Cloudflare's cache layer, and no credentials are written to logs.

## Security

- **Open by default.** Anyone who can reach the Worker can register devices and read the returned
  `token` / `privateKey` unless `REGIS_KEY` is set. Treat a deployed instance as a personal
  endpoint, keep the key out of URLs you share, or put it behind Cloudflare Access.
- Set `REGIS_KEY` for any deployment that outlives a quick test; the check is constant-time and
  covers `/regis`, `/device` and `/device/{id}`.
- Registration creates real WARP devices. Clean up unused ones in your Cloudflare WARP account if
  that matters to you.

## Local development

```bash
npm install
npm run dev        # http://127.0.0.1:8787
npm run typecheck
```

`wrangler dev` runs the Worker locally with Miniflare, including the Cache API.

## License

MIT
