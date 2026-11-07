# Security policy

## Reporting a vulnerability

Do not open a public issue. Use GitHub's private vulnerability reporting: **Security → Report a
vulnerability** on this repository, or open a private security advisory.

Please include the affected route or file, a reproduction (request/response or commit), and the
impact you expect. Expect an initial reply within a week.

## Scope notes

- A deployed instance stores live WARP credentials. Anyone who can reach `/regis` or `/device`
  without a key can read them — that is the design, not a bug. Set `REGIS_KEY`.
- `?key=` is supported for convenience but lands in logs; the bearer header is the intended path.
- Reports about upstream WARP accounts (rate limits, bans, API changes) belong upstream, not here.
