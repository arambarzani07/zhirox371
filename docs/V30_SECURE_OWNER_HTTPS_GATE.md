# V30 — HTTPS owner access and credential-revocation safety gate

**2026-10-30. Isolated same-PC preview only. No production hosting, real cloud or live supermarket database changes.**

## Verified features to test

- `offline/secure-owner-v30.mjs` adds an **explicitly enabled**, loopback-only HTTPS server (`127.0.0.1:3420`) with TLS 1.2 minimum. Operators supply their own TLS certificate and private key as environment-controlled absolute paths. This repository contains no keys, passwords, credentials or CA certificates.
- Owner read-only APIs, event-id reconciliation and signed ingestion retain the existing V27–V29 handler. The new gate requires an encrypted socket, rejects cross-origin requests, sets HSTS/no-store/frame/referrer/permission protection headers, and rate-limits owner and ingest routes based on actual socket address (never the untrusted `X-Forwarded-For` header).
- Owner and per-store HMAC credentials are read from a **private JSON file on every request**. On Linux/macOS, the regular file must be `0600`, cannot be a symlink and must be at an absolute path. Its file handle is opened with `O_NOFOLLOW`. Replacing/revoking the stored `owner_token_hash` denies the previous owner token immediately; unreadable/malformed config returns 503 rather than reverting to stale credentials.
- The owner-facing mobile page uses JS memory only for its bearer token. On authorization failure, it hides the old totals and shows no private data. No cookies/localStorage/sessionStorage/SW. V29 remains a *read-only* preview with just `sale.completed` observations; no Web Push, background owner monitoring or other five alert categories are implemented.
- `offline/tests/secure-owner-v30.test.mjs` generates an **ephemeral self-signed test certificate** using OpenSSL in CI and validates its CA trust via Node HTTPS client. It tests valid/invalid certificates, TLS-only access, immediate token revocation, strict secret-file permissions and rate limits. `tests/browser/v30_owner_https.mjs` tests 390px owner layout over the same isolated HTTPS fixture; Chromium is configured to trust only test-local self-signed cert via a test exception. This exception is NEVER an instruction for production clients.

## Running an isolated preview on the same PC

1. Create a disposable PostgreSQL 16 database, apply only `offline/cloud-migrations/008_v28_received_sales.sql`. Use no existing production Supabase credentials, market database or customer data.
2. Create a private test JSON file outside the repository: an array containing `{store_id, sync_secret, owner_token_hash}`. Use test-only random values. `sync_secret` must have 32+ bytes; `owner_token_hash` is a SHA-256 hex digest of the separate, long random owner bearer. Keep the bearer in an approved secret store, never in GitHub, browser storage or command-line URLs.
3. Provision a test HTTPS certificate and private key for `127.0.0.1` (trusted by your local testing environment). Put the private key and JSON config under restricted filesystem permissions (`chmod 600`). Do not reuse testing certificates in production.
4. Set server-side environment variables `ZHIROX_V30_HTTPS_PREVIEW_ENABLED=true`, `ZHIROX_V30_DISPOSABLE_DB_URL`, `ZHIROX_V30_CREDENTIALS_FILE`, `ZHIROX_V30_TLS_CERT_PATH` and `ZHIROX_V30_TLS_KEY_PATH`. Run `node offline/secure-owner-v30.mjs` and visit `https://127.0.0.1:3420/v29/owner` in a browser that trusts the local test certificate.
5. For revocation, replace the private credentials file **atomically**, preserving owner-only permissions. Every new request loads the new credentials; an old bearer stops working. A request already in flight cannot be retroactively revoked.

## Still blocking real iPhone / cloud deployment

- Loopback `127.0.0.1` is inaccessible from an actual remote iPhone. This phase does **not** deploy HTTPS to a domain, install trusted production certificates, configure DNS/firewall or expose a public service.
- Real cloud setup still needs an approved hosting account, managed domain and TLS, ingress rate limits across multiple instances, reliable credential management/revocation, owner authentication beyond a bearer paste, observability, least-privilege database roles, backup/restore testing, security review and penetration tests.
- There is no production-ready multi-cashier LAN server or automated event-level reconciliation checkpoint. The PostgreSQL pilot remains isolated and does not replace the browser Demo cashier. Neither checkout nor inventory may depend on cloud availability.
- Only new-sale events have cloud data. Other owner alerts, APNs/Web Push and native iPhone app distribution are not implemented.

**No production Supabase, real market database, PC Relay, locked Home or genuine owner iPhone changed.**