# Client setup

Every snippet below starts from one request. Replace `<worker>` with your deployment and add
`Authorization: Bearer <REGIS_KEY>` when key auth is enabled.

```bash
curl https://<worker>/regis?mode=wg          # WireGuard
curl https://<worker>/regis?mode=masque      # MASQUE
```

## WireGuard app / wg-quick / routers

Ask for the config directly and import the file:

```bash
curl -H "Authorization: Bearer $KEY" "https://<worker>/regis?mode=wg&format=conf" > warp.conf
sudo wg-quick up ./warp.conf
```

The JSON fields map one to one: `privateKey` → `PrivateKey`, `peerPublicKey` → `[Peer] PublicKey`,
`ipv4`/`ipv6` → `Address`, `endpoint` → `Endpoint`.

## mihomo / Clash.Meta (MASQUE)

```yaml
proxies:
  - name: warp
    type: masque
    server: engage.cloudflareclient.com # from `endpoint`, before the colon
    port: 443 # from `endpoint`, after the colon
    private-key: <privateKey>
    public-key: <peerPublicKey>
    ip: 172.16.0.2
    ipv6: 2606:4700:110:...
    mtu: 1280
    udp: true
    remote-dns-resolve: true
    dns: [1.1.1.1, 2606:4700:4700::1111]
```

`private-key` is SEC1 DER in base64, `public-key` is SPKI DER in base64 — both are exactly what the
Worker returns, so no conversion is needed.

## usque

usque stores its own `config.json`. Map the fields, and note that `endpoint_pub_key` wants PEM
while the API returns base64 DER:

```json
{
  "id": "<deviceId>",
  "access_token": "<token>",
  "private_key": "<privateKey>",
  "endpoint_pub_key": "-----BEGIN PUBLIC KEY-----\n<peerPublicKey, wrapped at 64 chars>\n-----END PUBLIC KEY-----\n",
  "ipv4": "172.16.0.2",
  "ipv6": "2606:4700:110:...",
  "endpoint_v4": "162.159.198.2",
  "endpoint_h2_v4": "162.159.198.2"
}
```

Re-wrap the key with:

```bash
echo "<peerPublicKey>" | fold -w 64 | sed '1i -----BEGIN PUBLIC KEY-----' | sed '$a -----END PUBLIC KEY-----'
```

Then run `usque socks` (or `nativetun`) with `-c config.json`.

## WARP+ and ZeroTrust

- Bind a license: `GET /account?license=<key>`; query the result with `GET /account`.
- ZeroTrust: register with a team token, `GET /regis?jwt=<team-token>`.
- Switch an existing WireGuard device to MASQUE: `GET /enroll` (same `deviceId`, new key pair).
