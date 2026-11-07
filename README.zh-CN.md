# warp-regis

[English](README.md) | **中文**

运行在 Cloudflare Workers 上的 [Cloudflare WARP](https://1.1.1.1/) 设备注册器。一次 `GET` 即可拿到可用的
**MASQUE** 或 **WireGuard** 凭证，无需数据库。

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/evansrrr/warp-regis)
[![CI](https://github.com/evansrrr/warp-regis/actions/workflows/ci.yml/badge.svg)](https://github.com/evansrrr/warp-regis/actions/workflows/ci.yml)

## 快速开始

点上面的按钮，或：

```bash
npm install
npx wrangler deploy
```

```bash
curl https://<worker>/regis            # MASQUE
curl https://<worker>/regis?mode=wg    # WireGuard
curl https://<worker>/device
```

## 接口

全部为 `GET`，数据接口可统一带鉴权 key。

| 路径           | 作用                          | 参数                                              |
| -------------- | ----------------------------- | ------------------------------------------------- |
| `/regis`       | 注册设备、存储并返回          | `mode=masque\|wg`、`format`、`name`、`ttl`、`jwt` |
| `/device`      | 当前实例最新的设备            | `format`                                          |
| `/device/{id}` | 指定设备                      | `format`                                          |
| `/enroll`      | 把最新设备重新入册为 MASQUE   | `name`、`ttl`、`format`                           |
| `/account`     | 最新设备的上游账号信息        | `license=<key>`、`license=-`、`devices=1`         |
| `/`            | 索引：鉴权状态、存储后端、TTL | —                                                 |

`format` 取 `json`（默认）、`raw`（上游原始响应）或 `conf`（wg-quick，仅 WireGuard）。
`mode` 默认 `masque`；`jwt` 用于 ZeroTrust 团队令牌注册。

## 响应

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

只返回连接所需字段。`privateKey` 在 MASQUE 下是 SEC1 DER base64，在 WireGuard 下是 32 字节
clamped 标量；`peerPublicKey` 同理。错误响应带 `code`（如 `registration_failed`、
`unauthorized`、`not_found`），便于程序分支处理。

各客户端配置见 **[docs/clients.md](docs/clients.md)**；上游完整字段与差异见
**[docs/response-shape.md](docs/response-shape.md)**。

## 配置

全部可选。

| 名称           | 默认           | 说明                                                  |
| -------------- | -------------- | ----------------------------------------------------- |
| `REGIS_KEY`    | 未设置（开放） | 逗号分隔的多把密钥；优先用 Bearer 头而非 `?key=`。    |
| `DEVICE_TTL`   | `86400`        | 存储有效期（秒），夹在 `60`–`604800`。                |
| `WARP_KV`      | 未绑定         | KV 绑定：设备持久化、跨地区可读，替代按 colo 的缓存。 |
| `RATE_LIMITER` | 未绑定         | Workers 限流绑定，作用于 `/regis`。                   |

```bash
npx wrangler secret put REGIS_KEY
npx wrangler kv namespace create WARP_KV      # 然后在 wrangler.toml 打开对应 binding
```

## 工作原理

- `POST /reg` 用 curve25519 公钥建账号，这一步就是 WireGuard 所需的全部。
- MASQUE 多一次 `PATCH /reg/{id}`，换成 P-256 密钥并设 `tunnel_type=masque`。
- 密钥在本地生成：P-256 走 WebCrypto，X25519 用自带的 RFC 7748 实现，保证返回的私钥与注册的
  公钥严格对应。
- `/device` 读存储记录；`/enroll` 对已有设备补做 MASQUE 入册。

## 存储

绑 `WARP_KV` 即持久化。未绑时退回 Cache API：零配置，但按 colo 生效且可能被驱逐，跨地区访问
`/device` 可能 404。凭证本身有效期约三个月，存储只决定 Worker 记多久。

## 安全

- 默认开放。对外部署前请设置 `REGIS_KEY`，并优先用 `Authorization` 头——`?key=` 会进访问日志
  和 `Referer`。
- 公网部署建议绑定 `RATE_LIMITER`：`/regis` 会产生真实的 WARP 设备。
- 注册出来的是真实设备，不用了请在 WARP 账号里清理。

## 开发

```bash
npm run dev      # 本地 Worker，:8787
npm test         # 38 个测试，跑在 Workers 运行时里
npm run lint
npm run build    # 单文件产物 dist/worker.js（约 12 KiB，gzip 5 KiB）
```

`npm run build` 产出可直接粘贴进控制台的自包含 ES 模块；打 tag 发布时 Release 会自动附带该产物。
版本历史见 [CHANGELOG.md](CHANGELOG.md)。

## 许可证

MIT
