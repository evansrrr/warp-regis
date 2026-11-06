# warp-regis

A stateless [Cloudflare WARP](https://1.1.1.1/) device registrar that runs on Cloudflare Workers.

Hit `GET /regis` to register a device, then open `GET /device` to read the credentials as JSON.
No KV, no D1, no Durable Objects — the result is handed back immediately and memoized in the
Cache API, so deploying is a single `wrangler deploy` with zero bindings to provision.

## How registration works

The flow mirrors the one used by the freev6 client and other MASQUE clients:

1. `POST https://api.cloudflareclient.com/v0a4471/reg`
   Bootstraps an account with a throwaway curve25519 key and returns `id` + `token`.
2. `PATCH /v0a4471/reg/{id}` (Bearer token)
   Swaps in a freshly generated P-256 (secp256r1) key with `tunnel_type: masque`, which returns
   the tunnel addresses (`config.interface.addresses`) and the peer public key
   (`config.peers[0].public_key`).

The P-256 private key is exported as SEC1 / RFC 5915 DER and base64-encoded, matching Go's
`x509.MarshalECPrivateKey` output, so the value can be pasted straight into MASQUE-capable
clients.

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
| `GET /` | Route index. |
| `GET /regis` | Register a new device, cache it, and return it. |
| `GET /device` | Return the most recently registered device on this colo. |
| `GET /device/{deviceId}` | Return a specific cached device. |

Query parameters for `/regis`:

| Param | Default | Description |
| --- | --- | --- |
| `name` | `warp-regis` | Device name sent with the MASQUE enrollment (max 64 chars, sanitized). |
| `ttl` | `86400` | Cache lifetime in seconds, clamped to `60`–`604800`. |

```bash
curl https://<your-worker>.workers.dev/regis
curl https://<your-worker>.workers.dev/regis?name=phone&ttl=3600
curl https://<your-worker>.workers.dev/device
```

## Response

`/regis` and `/device` return the same shape. Normalized fields are on top, and `raw` keeps the
untouched upstream responses for anything the mapping does not cover.

```json
{
  "deviceId": "11111111-1111-4111-8111-111111111111",
  "token": "22222222-2222-4222-8222-222222222222",
  "name": "warp-regis",
  "privateKey": "MGsCAQEEIJ+HMzsCZSwVKlRVzp3/6GtBCm8j0eDY03mukSfyAy2RoUQDQgAE...",
  "publicKey": "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE...",
  "peerPublicKey": "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEIaU7MToJm9NKp8YfGxR6r...",
  "ipv4": "172.16.0.2",
  "ipv6": "2606:4700:110:8f8a:81c6:c5fa:f31c:a4f2",
  "endpoint": "engage.cloudflareclient.com:2408",
  "registeredAt": "2026-11-06T18:00:25.758Z",
  "raw": {
    "register": { "...": "POST /reg response" },
    "enroll": { "...": "PATCH /reg/{id} response" }
  }
}
```

Field notes:

- `privateKey` — P-256 private key, SEC1 DER, base64.
- `peerPublicKey` — base64 DER, PEM armor stripped and whitespace removed.
- `endpoint` — `endpoint.host` from the peer config; `endpoint.v4` is frequently reported with
  port `0`, so the hostname is preferred.

## Storage model

This is deliberately not a database-backed service:

- Devices are written to the **Cache API** under `device/latest` and `device/{deviceId}`.
- Entries live **per colo**, honour the `ttl` parameter, and may be evicted at any time.
- A `/device` request that lands in a different colo than the `/regis` request can return `404`.
  Retry, or call `/regis` again — registration is cheap.
- Nothing is stored outside Cloudflare's cache layer, and no credentials are written to logs.

## Security

- **Everything is public by design.** Anyone who can reach the Worker can register devices and
  read the returned `token` / `privateKey`. Treat a deployed instance as a personal endpoint and
  do not post the URL publicly, or put it behind Cloudflare Access.
- The Worker never requires authentication. If you need a gate, add a `REGIS_TOKEN` check or a
  WAF rule in front of `/regis`.
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
