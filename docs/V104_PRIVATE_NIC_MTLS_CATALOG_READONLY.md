# V104 — Private-NIC TLS 1.3 mTLS Read-Only Market Catalog Watcher (NO-GO live cashier)

**Status: NO-GO for official supermarket cashier deployment.**

V104 bridges the V103 atomic read-only CSV catalog watcher with the V100/V101
private-NIC TLS 1.3 mutual-certificate device registry. It allows enrolled
trial devices (`trial-pc-01`, `trial-pc-02`) to query the operator-approved
read-only CSV price snapshot over a non-loopback RFC1918 interface with
per-request PostgreSQL device certificate fingerprint and revocation checks.

## Scope & Security Boundary

- **Exact Private-NIC Policy (`V101`):** Requires an existing non-loopback
  RFC1918 IPv4 address (`10/8`, `172.16/12`, `192.168/16`) on the host,
  explicit peer IP allowlist, and exact numeric `Host` header (`<ip>:3322`).
  Rejects `0.0.0.0`, `127.0.0.1`, public IPs, and any request carrying a
  browser `Origin` header (no CORS).
- **Mutual TLS 1.3 + Durable Device Registry (`V100`):** Enforces TLS 1.3 with
  `requestCert: true` and `rejectUnauthorized: true`. On every HTTP `GET`
  request, verifies that `x-zhirox-device-id` matches the client certificate
  `CN` and queries `zhirox_local.v100_trial_devices` via the restricted
  `zhirox_v95_gate` role (`SELECT` only) so device revocation or certificate
  rotation takes effect immediately without restarting the watcher.
- **Atomic Fail-Closed CSV Watcher (`V103`):** Uses `createV103AtomicCatalog`
  with before/after file signature checks, fixed 5-minute full hash verification,
  and 24-hour freshness enforcement. Corrupted, missing, symlinked, or stale
  CSV files immediately return `503` and never serve stale prices.
- **Strictly Read-Only (`GET` only):** Exposes only `/api/local/v104/status`,
  `/api/local/v104/scan`, and `/api/local/v104/products` with a 32+ character
  bearer token. Rejects `POST`/`PUT`/`PATCH`/`DELETE`/`OPTIONS` with `405`.
  Excludes wholesale costs, file paths, and unverified stock. Checkout and
  inventory writes remain `false`.
- **Public Build Untouched:** Never mounted in `src/main.tsx`, GitHub Pages, or
  the browser demo.

## Automated Verification

1. `offline/tests/v104-lan-catalog-mtls.test.mjs`:
   - Generates ephemeral OpenSSL CA, server cert with the runner's actual
     RFC1918 IP SAN, and client certs for `trial-pc-01`, `trial-pc-02`, and
     rotated `trial-pc-01`.
   - Verifies simultaneous TLS 1.3 mTLS catalog status, barcode scan, ambiguous
     barcode refusal (`409`), and Sorani search across both devices.
   - Verifies atomic operator CSV price update (`1250 -> 1750`), immediate DB
     revocation of `trial-pc-02` (`403`), certificate rotation for `trial-pc-01`,
     fail-closed `503` on invalid/stale/symlinked CSV, and recovery on repair.
   - Rejects unauthenticated TLS, spoofed `Host`, `Origin` headers, wrong bearer
     token, non-GET methods, checkout routes, and non-RFC1918 bind targets.
2. `offline/tests/v104_lan_catalog_mtls_real_pg.mjs`:
   - Runs against the disposable `zhirox_v80_disposable` PostgreSQL instance in
     CI after V101, verifying real SQL role privilege checks (`zhirox_v95_gate`)
     and confirming zero mutations to `sales`, `event_outbox`, `products`, or
     `lot_inventory_v90`.

## Remaining Gaps Before Physical Store Cutover

- Physical multi-PC Windows 10 LAN test with hardware barcode scanners, thermal
  printers, and OS key store certificate protection.
- Approved read-only production SQL Server / PC Relay automated export pipeline
  and full physical stock/LOT reconciliation.
- Official fiscal cashier remains **NO-GO**; locked 12×4 Sorani Home and public
  demo safeguards remain unchanged.
