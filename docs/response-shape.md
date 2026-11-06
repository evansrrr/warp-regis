# Upstream response shapes

Both modes hit `POST https://api.cloudflareclient.com/v0a4471/reg`. WireGuard stops there; MASQUE
adds `PATCH /reg/{id}`.

```text
wireguard:  POST /reg                                       -> register
masque:     POST /reg  ->  PATCH /reg/{id} (Bearer token)   -> register + enroll
```

The payloads below are verbatim copies with credentials replaced by placeholders (`<uuid>`,
`<token>`, …). Field names, ordering, nesting and value formats are untouched.

## WireGuard — `POST /reg`

```json
{
  "register": {
    "id": "<device-uuid>",
    "type": "a",
    "model": "PC",
    "name": "",
    "key": "GqQDt6yp1SVbdzm/K1EH97KfzcJN0zJeIWY4d/0fqiU=",
    "key_type": "curve25519",
    "tunnel_type": "wireguard",
    "account": {
      "id": "<account-uuid>",
      "account_type": "free",
      "created": "2026-11-06T18:28:10.630821329Z",
      "updated": "2026-11-06T18:28:10.630821329Z",
      "premium_data": 0,
      "quota": 0,
      "usage": 0,
      "warp_plus": true,
      "referral_count": 0,
      "referral_renewal_countdown": 0,
      "role": "child",
      "license": "00000000-0000000-00000000",
      "ttl": "2027-02-04T18:28:10.630818239Z"
    },
    "config": {
      "client_id": "OapF",
      "peers": [
        {
          "public_key": "bmXOC+F1FxEMF9dyiK2H5/1SUtzH0JuVo51h2wPfgyo=",
          "endpoint": {
            "v4": "162.159.192.10:0",
            "v6": "[2606:4700:d0::a29f:c00a]:0",
            "host": "engage.cloudflareclient.com:2408",
            "ports": [2408, 500, 1701, 4500]
          }
        }
      ],
      "interface": {
        "addresses": {
          "v4": "172.16.0.2",
          "v6": "2606:4700:110:86dc:ff6f:dfbc:5388:67a4"
        }
      },
      "services": {
        "http_proxy": "172.16.0.1:2480"
      }
    },
    "token": "<device-token>",
    "warp_enabled": false,
    "waitlist_enabled": false,
    "created": "2026-11-06T18:28:10.344279008Z",
    "updated": "2026-11-06T18:28:10.344279008Z",
    "tos": "2026-11-06T18:28:09.78Z",
    "place": 0,
    "locale": "en-US",
    "enabled": true,
    "install_id": "",
    "fcm_token": "",
    "policy": {
      "always_include": [{ "ip": "162.159.197.4" }, { "ip": "2606:4700:102::4" }],
      "always_exclude": [{ "ip": "162.159.197.3" }, { "ip": "2606:4700:102::3" }],
      "tunnel_protocol": "masque",
      "post_quantum": "enabled_with_downgrades"
    }
  }
}
```

## MASQUE — `POST /reg` + `PATCH /reg/{id}`

`register` is byte-for-byte the same shape as above (only `key` is a throwaway value). The enroll
response is the one that matters:

```json
{
  "register": {
    "id": "<device-uuid>",
    "type": "a",
    "model": "PC",
    "name": "",
    "key": "FpTigzhDSNQh0RgNc6dwQM+q8c8NDns5W1RavK3cp5Y=",
    "key_type": "curve25519",
    "tunnel_type": "wireguard",
    "account": { "...": "same as WireGuard" },
    "config": { "...": "same as WireGuard" },
    "token": "<device-token>",
    "...": "same boilerplate"
  },
  "enroll": {
    "id": "<device-uuid>",
    "type": "a",
    "model": "PC",
    "name": "warp-regis",
    "key": "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEvWWI7COV8oKOhEa3VxtTp1tZ6J2rNb87drzLdVJ/zGiVK/fZX1qyxxR945qPvBYKSV80DetSnAiOLgQA+7DUgQ==",
    "key_type": "secp256r1",
    "tunnel_type": "masque",
    "account": {
      "id": "<account-uuid>",
      "account_type": "free",
      "created": "2026-11-06T18:28:04.147438Z",
      "updated": "2026-11-06T18:28:04.147438Z",
      "premium_data": 0,
      "warp_plus": true,
      "referral_count": 0,
      "referral_renewal_countdown": 0,
      "role": "child",
      "license": "00000000-0000000-00000000"
    },
    "config": {
      "client_id": "fPdw",
      "peers": [
        {
          "public_key": "-----BEGIN PUBLIC KEY-----\nMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEIaU7MToJm9NKp8YfGxR6r+/h4mcG\n7SxI8tsW8OR1A5tv/zCzVbCRRh2t87/kxnP6lAy0lkr7qYwu+ox+k3dr6w==\n-----END PUBLIC KEY-----\n",
          "endpoint": {
            "v4": "162.159.198.2:0",
            "v6": "[2606:4700:103::2]:0",
            "host": "engage.cloudflareclient.com:2408",
            "ports": [443, 500, 1701, 4500, 4443, 8443, 8095]
          }
        }
      ],
      "interface": {
        "addresses": {
          "v4": "172.16.0.2",
          "v6": "2606:4700:110:8b52:c823:b229:b42a:bf30"
        }
      },
      "services": {
        "http_proxy": "172.16.0.1:2480"
      }
    },
    "warp_enabled": false,
    "waitlist_enabled": false,
    "created": "2026-11-06T18:28:03.831004138Z",
    "updated": "2026-11-06T18:28:05.203572439Z",
    "tos": "2026-11-06T18:28:03.268Z",
    "place": 0,
    "locale": "en-US",
    "enabled": true,
    "install_id": "",
    "fcm_token": "",
    "policy": {
      "always_include": [{ "ip": "162.159.197.4" }, { "ip": "2606:4700:102::4" }],
      "always_exclude": [{ "ip": "162.159.197.3" }, { "ip": "2606:4700:102::3" }],
      "tunnel_protocol": "masque",
      "post_quantum": "enabled_with_downgrades"
    }
  }
}
```

## Differences that matter

| Field | WireGuard (`register`) | MASQUE (`enroll`) | Note |
| --- | --- | --- | --- |
| `token` | present | **absent** | take it from `register` |
| `name` | `""` | the requested name | only PATCH accepts a name |
| `key` | raw 32-byte b64 (client public key) | SPKI DER b64 (P-256) | different encodings |
| `key_type` | `curve25519` | `secp256r1` | |
| `tunnel_type` | `wireguard` | `masque` | |
| `config.peers[0].public_key` | raw 32-byte b64 | PEM-wrapped SPKI DER | must strip PEM for masque |
| `config.peers[0].endpoint.ports` | `2408, 500, 1701, 4500` | `443, 500, 1701, 4500, 4443, 8443, 8095` | 443 first for masque |
| `account.ttl` | present | present | both expire ~3 months out |
| `account.license` | present | present | same format |
| everything else | identical boilerplate | identical boilerplate | `type`, `model`, `place`, `locale`, `policy`, `warp_enabled`, `waitlist_enabled`, `install_id`, `fcm_token`, `created`, `updated`, `tos`, `enabled` |

Stable, interesting fields: `id`, `token`, `key`, `key_type`, `tunnel_type`, `name`,
`config.client_id`, `config.peers[0].public_key`, `config.peers[0].endpoint.host`,
`config.interface.addresses.v4/v6`, `account.license`, `account.warp_plus`, `account.quota`,
`account.usage`.

Constant / ignorable for client configuration: `type` (`"a"`), `model` (`"PC"`), `place` (`0`),
`locale` (`"en-US"`), `enabled` (`true`), `warp_enabled` / `waitlist_enabled` (`false`),
`install_id` / `fcm_token` (empty), `policy.*` (identical every time), `config.services.http_proxy`
(`172.16.0.1:2480`).

## Adopted compact shape (A)

Nine connection fields plus `reserved`. `?format=json` (the default everywhere) returns exactly
this; `?format=raw` is the only way to get the upstream bodies.

```json
{
  "mode": "wireguard",
  "deviceId": "<uuid>",
  "token": "<uuid>",
  "privateKey": "<b64>",
  "peerPublicKey": "<b64>",
  "ipv4": "172.16.0.2",
  "ipv6": "2606:4700:110:...",
  "endpoint": "engage.cloudflareclient.com:2408",
  "clientId": "OapF",
  "reserved": [57, 170, 69]
}
```

| Compact field | Source (wireguard) | Source (masque) |
| --- | --- | --- |
| `mode` | constant `"wireguard"` | constant `"masque"` |
| `deviceId` | `register.id` | `register.id` = `enroll.id` |
| `token` | `register.token` | `register.token` (**not** in `enroll`) |
| `privateKey` | locally generated X25519 scalar | locally generated P-256 key (SEC1 DER) |
| `peerPublicKey` | `register.config.peers[0].public_key` | `enroll.config.peers[0].public_key`, PEM stripped |
| `ipv4` | `config.interface.addresses.v4` | `enroll.config.interface.addresses.v4` |
| `ipv6` | `config.interface.addresses.v6` | `enroll.config.interface.addresses.v6` |
| `endpoint` | `peers[0].endpoint.host` + first advertised port (2408) | `peers[0].endpoint.host` + first advertised port (443) |
| `clientId` | `config.client_id` | `enroll.config.client_id` |
| `reserved` | base64-decoded `client_id` bytes | base64-decoded `client_id` bytes |

`ports` is still kept on the stored record (it powers the endpoint), but is not part of the public
shape. `endpoint` is normalised to `host:first-port`, because the raw `endpoint.v4` often ends in
`:0`.

Deliberately dropped: `name`, `type`, `model`, `locale`, `place`, `enabled`, `warp_enabled`,
`waitlist_enabled`, `install_id`, `fcm_token`, `created`, `updated`, `tos`, `policy`,
`config.services.http_proxy`, `endpoint.v4/v6` (they end in `:0`), `endpoint.ports`, and the whole
`account` block (`license`, `ttl`, `warp_plus`, `quota`, `usage`). If you need any of them, read
`?format=raw` or call `GET /reg/{id}` yourself.

The full record (including `raw` and `ports`) stays in storage, because `?format=raw` and
`?format=conf` are rendered from it.
