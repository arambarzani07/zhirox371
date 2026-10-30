# V33 — LAN TLS gateway + multi-cashier contention and restore drill

**2026-10-30. Isolated foundation and disposable CI; NOT a deployed supermarket LAN server.** No live store, PC Relay, Supabase or production database edits.

## Delivered in repository

1. `offline/lan-gateway-v33.mjs`: an explicitly enabled HTTPS-only API gateway that wraps the SAME V32/V31 PostgreSQL cash checkout and receipt-read APIs. It does not create an alternative checkout path or rely on Internet. Only allowlisted private IPv4 **socket** peers can connect (never trust X-Forwarded-For). The trial enforces TLS v1.2+, validates the bind IP is private, refuses unapproved browser origins and OPTIONS, limits requests per socket, and has no HTTP fallback. A shared local server should use a locally trusted CA certificate; passwords/session secrets and the local database URL stay on the server.
2. `offline/tests/lan-gateway-v33.test.mjs`: HTTPS with a self-signed **ephemeral CI** certificate and explicitly CA-trusting test HTTP client; two independently authenticated cashiers with different receipt visibility, invalid bearer rejection, spoofed peer/Origin denial, public-IP rejection, rate limiting, and proof plaintext HTTP is refused. This is not a physical multi-PC acceptance test.
3. `offline/tests/010_v33_concurrency_seed.sql` and `_verify.sql`: CI starts TWO separate real PostgreSQL psql clients committing two different prepared cashiers against **one remaining item**. Exactly one can succeed, one must fail closed, and exactly one sale, receipt, stock deduction, ledger row and outbox event may exist.
4. `.github/workflows/offline-foundation.yml`: after concurrency checks, runs **real `pg_dump -Fc` and `pg_restore` into a DIFFERENT disposable PostgreSQL database** (not the original). It verifies restored sales, stock, outbox and both committed/prepared intent rows match the source. The temporary backup is created with restrictive permissions and deleted at the end of CI. No production files are downloaded or backed up.

## Local-LAN trial requirements (NOT approved for live shop)

- A dedicated **test** PostgreSQL instance on the local network. Configure a strong local-session secret and database credentials **only in the server process**; grant restricted SQL roles before any real rollout.
- Explicitly set `ZHIROX_V33_LAN_TRIAL_ENABLED=true`, `ZHIROX_V33_BIND_IP` to a concrete private IPv4 of the test host (never `0.0.0.0`), and `ZHIROX_V33_ALLOWED_PEERS` to a comma-separated list of *exact* enrolled private client IP addresses. DHCP/static reservations are advisable for the trial. A firewall must deny any other network traffic even though the application checks peer addresses.
- Provide `ZHIROX_V33_TLS_CERT_PATH`, `ZHIROX_V33_TLS_KEY_PATH`, `ZHIROX_V33_DISPOSABLE_DB_URL` and `ZHIROX_LOCAL_SESSION_SECRET`. The gateway binds the chosen private host at port `3433` and exposes local API only. For an existing same-origin HTTPS application, configure `ZHIROX_V33_ALLOWED_ORIGIN` to the exact **HTTPS** page origin. No unsafe permissive CORS wildcard.
- The gateway is **API-only**; V33 does NOT bundle/serve the React UI to the remote PCs, provide a Windows installer, or provision certificates to clients. Browsers on other PCs need a separate, security-reviewed same-origin frontend deployment. No direct PostgreSQL port should be exposed to clients.
- The TLS test uses private test certificates. Real workstations must independently trust the correct local CA and verify the certificate hostname/IP SAN; never disable HTTPS validation or commit a private key.

## Still incomplete / hard production gates

- Hardware: no actual cashier PC with Windows, barcode scanner, scale or USB/thermal 58/80 mm receipt printer was used in this PR. A `58/80mm` formatting preview is not proof that hardware printed correctly; print service integration still remains.
- Resilience: successful PostgreSQL concurrent-transaction and backup/restore CI do not replace unplugging the real switch, router, internet, PC power or UPS, measuring RPO/RTO, testing WAL durability, backups across disks, offsite recovery, automated retention or disaster recovery drills.
- Security: IP allowlists and a simple in-memory rate limiter are not device enrollment or mTLS. No remote-device credential lifecycle, Windows service integration, SQL least-privilege grants and multi-host production firewall audit have been approved.
- Scope: primary React cashier outside the explicit V32 test mode remains DEMO; V33 adds LAN transport groundwork only. Other modules and Owner/iPhone push remain incomplete. The local checkout must be independent of WAN/cloud availability.

**V34 should address authenticated printer service / server-derived immutable receipt and then controlled LAN hardware trials.**