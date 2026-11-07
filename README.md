# warp-regis

**English** | [中文](README.zh-CN.md)

A [Cloudflare WARP](https://1.1.1.1/) device registrar that runs on Cloudflare Workers. One `GET`
returns usable **MASQUE** or **WireGuard** credentials, with no database to provision.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/USER/warp-regis)
[![CI](https://github.com/USER/warp-regis/actions/workflows/ci.yml/badge.svg)](https://github.com/USER/warp-regis/actions/workflows/ci.yml)

> Replace `USER` with your GitHub handle (and the matching `repository` field in `package.json`)
> once the repo is public.

## Quick start

Click the button above, or:

```bash
npm install
npx wrangler deploy
```

```bash
curl https://<worker>/regis            # MASQUE
curl https://<worker>/regis?mode=wg    # WireGuard
curl https://<worker>/device
```

## Endpoints

Every route is a `GET`. All data routes take the same optional key.

| Route          | Purpose                                | Parameters                                        |
| -------------- | -------------------------------------- | ------------------------------------------------- |
| `/regis`       | Register a device, store it, return it | `mode=masque\|wg`, `format`, `name`, `ttl`, `jwt` |
| `/device`      | Latest device on this instance         | `format`                                          |
| `/device/{id}` | Specific stored device                 | `format`                                          |
| `/enroll`      | Re-enroll the latest device as MASQUE  | `name`, `ttl`, `format`                           |
| `/account`     | Upstream account of the latest device  | `license=<key>`, `license=-`, `devices=1`         |
| `/`            | Index: auth mode, storage backend, TTL | —                                                 |

`format` is `json` (default), `raw` (untouched upstream bodies) or `conf` (wg-quick, WireGuard
only). `mode` defaults to `masque`; `jwt` registers against a ZeroTrust team.

## Response

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

Connection credentials only. `privateKey` is SEC1 DER base64 for MASQUE and a raw 32-byte clamped
scalar for WireGuard; `peerPublicKey` follows the same split. Errors carry a `code`, so clients can
branch on it (`registration_failed`, `unauthorized`, `not_found`, …).

Client snippets for WireGuard, mihomo, usque and friends: **[docs/clients.md](docs/clients.md)**.
Full upstream payloads and the field diff: **[docs/response-shape.md](docs/response-shape.md)**.

## Configuration

All optional.

| Name           | Default      | What it does                                                              |
| -------------- | ------------ | ------------------------------------------------------------------------- |
| `REGIS_KEY`    | unset (open) | Comma-separated secrets; bearer header preferred over `?key=`.            |
| `DEVICE_TTL`   | `86400`      | Storage lifetime in seconds, clamped to `60`–`604800`.                    |
| `WARP_KV`      | unset        | KV binding: durable, globally readable devices instead of per-colo cache. |
| `RATE_LIMITER` | unset        | Workers Rate Limiting binding, applied to `/regis`.                       |

```bash
npx wrangler secret put REGIS_KEY
npx wrangler kv namespace create WARP_KV      # then uncomment the binding in wrangler.toml
```

## How it works

- `POST /reg` creates the account with a Curve25519 key: that is all WireGuard needs.
- MASQUE adds one `PATCH /reg/{id}`, swapping in a P-256 key with `tunnel_type=masque`.
- Keys are generated locally — P-256 via WebCrypto, X25519 via a small RFC 7748 implementation — so
  the caller always receives a private key that actually matches the enrolled public key.
- `/device` reads the stored record; `/enroll` repeats the MASQUE step for an existing device.

## Storage

Bind `WARP_KV` for durable devices. Without it the Worker falls back to the Cache API: zero setup,
but per-colo and best-effort, so `/device` can `404` in a different region. Credentials stay valid
for months either way — storage only controls how long the Worker remembers them.

## Security

- Open by default. Set `REGIS_KEY` before exposing a deployment, and prefer the `Authorization`
  header over `?key=`, which ends up in logs and `Referer` headers.
- Bind `RATE_LIMITER` on public deployments: `/regis` creates real WARP devices.
- Registered devices are real; remove unused ones from your WARP account if that matters.

## Development

```bash
npm run dev      # local Worker on :8787
npm test         # 38 tests in the Workers runtime
npm run lint
npm run build    # single-file bundle -> dist/worker.js (~12 KiB, 5 KiB gzip)
```

`npm run build` produces a self-contained ES module you can paste into the dashboard; tagged
releases attach it automatically. See [CHANGELOG.md](CHANGELOG.md) for history.

## License

MIT
