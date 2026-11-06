# Changelog

## 2.0.0 — 2026-11-07

- Storage is pluggable: bind `WARP_KV` for durable devices, otherwise the Cache API is used.
- `REGIS_KEY` accepts a comma-separated list for rotation; the bearer header is preferred over
  `?key=`; an optional `RATE_LIMITER` binding guards `/regis`.
- Structured errors (`code`, `upstreamStatus`, `upstreamPath`, `detail`), 10 s upstream timeout and
  one retry on network failures.
- New routes: `GET /enroll` (WireGuard → MASQUE) and `GET /account` (account payload, license bind
  and clear, device list).
- `GET /regis?jwt=` registers against a ZeroTrust team.
- The summary gains `reserved` (decoded `client_id`); `endpoint` now uses the first advertised port
  (`443` for MASQUE, `2408` for WireGuard).
- Single-file bundle (`npm run build`) plus `Deploy to Cloudflare` button.
- 38 tests, ESLint, Prettier and a CI workflow.

## 1.5.0 — 2026-11-07

- `DEVICE_TTL` sets the default storage lifetime.

## 1.4.0 — 2026-11-07

- `format=json` is now the default on `/device` too.

## 1.3.0 — 2026-11-07

- The normalized payload is down to nine connection fields; `raw` is only returned on demand.

## 1.2.0 — 2026-11-07

- Optional `REGIS_KEY` gate; `/device` returns the raw upstream payload by default.

## 1.1.0 — 2026-11-07

- WireGuard mode (`?mode=wg`), `?format=conf`, and a dependency-free RFC 7748 implementation.

## 1.0.0 — 2026-11-07

- Initial release: MASQUE registration, `/regis` and `/device`, Cache API storage.
