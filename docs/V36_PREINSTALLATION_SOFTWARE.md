# V36 — pre-installation LAN cashier software staging (not formal approval)

**Repository:** `arambarzani07/zhirox371`. **Scope:** software preparation that can be verified without actual cashier PCs, scanners, thermal printers, LAN switch, UPS, or production data.

## What changed

- A dedicated *test-only, production-mode Vite bundle* launches the existing authenticated V31/V32 PostgreSQL cashier as its **sole React root**. It does **not** mount the browser DEMO `AppProvider`, browser-local financial records, simulated login, fictitious receipts, or the DEMO cashier. The locked Home source is unchanged. The test root remains visibly identified as non-production.
- `VITE_V36_ISOLATED_LAN_PILOT=true npm run build` is the opt-in *staging bundle*; **not** `VITE_ZHIROX_RELEASE_MODE=official`. The latter must still fail.
- `node scripts/package-lan-pilot-v36.mjs dist` creates a SHA256 allowlist of the staged `index.html` and JS/CSS assets. This refuses an ordinary demo bundle without the isolated React entrypoint marker.
- `offline/lan-pilot-static-v36.mjs` loads and verifies the allowlist BEFORE the server listens. Only `/`, `/index.html` and manifested `/assets/*.js|css` are served. Requests for `.env`, sourcemaps, Git source, unlisted paths and mutated assets are denied. No SPA wildcard fallback.
- An optional V36 static handler is passed through the **same** V33 HTTPS/TLS1.2+, socket-IP, rate limiter and browser Origin boundary; API traffic continues to use V35 → V34 → V31/32 PostgreSQL. No browser holds DB credentials.
- After a committed PostgreSQL sale, the cashier can explicitly fetch a server-authored Sorani RTL receipt preview and queue **one** verified print request. Queue reply explicitly says `hardware_printed: false`; no unsolicited auto-print, no raw ESC/POS input, no actual printer adapter yet.

## Test-only build and gateway configuration

On a **disposable** developer workstation with Node and `npm`, from a clean clone:

```bash
npm install
VITE_V36_ISOLATED_LAN_PILOT=true npm run build
node scripts/package-lan-pilot-v36.mjs dist
node --test offline/tests/lan-pilot-v36.test.mjs
node scripts/release-readiness-v35.mjs --json
```

Use an independent, disposable local PostgreSQL test DB with migrations 001–007, 009, 011 and 012. Cloud migration 008 is separate. Prepare test-only store, users, barcodes and stock. **Never apply these migrations to Supermarket Kani Chnar live data or Supabase.**

Existing `offline/lan-gateway-v33.mjs` must be started with the earlier mandatory V33 test flags, strict static IP, allowed peers, trusted CA/TLS keypair, local DB URL and high-entropy session secret, plus:

```text
ZHIROX_V33_LAN_TRIAL_ENABLED=true
ZHIROX_V33_BIND_IP=<PRIVATE_TEST_SERVER_IPV4>
ZHIROX_V33_ALLOWED_PEERS=<EXACT_ENROLLED_PRIVATE_CLIENT_IPS>
ZHIROX_V33_ALLOWED_ORIGIN=https://<PRIVATE_TEST_SERVER_IPV4>:3433
ZHIROX_V33_TLS_CERT_PATH=<ABSOLUTE_TEST_CERT_PATH>
ZHIROX_V33_TLS_KEY_PATH=<ABSOLUTE_TEST_KEY_PATH>
ZHIROX_V33_DISPOSABLE_DB_URL=<ISOLATED_POSTGRES_CONNECTION_STRING>
ZHIROX_LOCAL_SESSION_SECRET=<UNIQUE_STRONG_SECRET>
ZHIROX_V34_RECEIPT_PREVIEW_ENABLED=true
ZHIROX_V35_PRINT_QUEUE_ENABLED=true
ZHIROX_V36_LAN_PILOT_ENABLED=true
ZHIROX_V36_STATIC_DIR=<ABSOLUTE_PATH_TO_HASHED_DIST>
```

These are placeholders, **never put a real password, certificate private key or connection URL in GitHub or chat**. Server-to-PostgreSQL access stays private. The gateway serves the staged pilot at `https://<PRIVATE_TEST_SERVER_IPV4>:3433/` only after the local CA is trusted on each registered client. Use a dedicated firewall, private host address, DHCP reservations and restricted SQL user. Current V33 gateway has not undergone security certification.

## Verified automatically vs not yet verified

Automated checks cover React staging build, isolated root behavior under headless Chromium with mocked endpoints, server session data path, retries, queue-only display, SHA256 tamper rejection, forbidden paths, old test-only V33 TLS denial, no official build release and the existing SQL concurrent checkout / backup restore simulations. CI on a GitHub runner is **not physical LAN acceptance**. Test counts and outcomes should be read from the PR GitHub Actions run, not presumed.

**Hard NO-GO blockers (cannot be waived by CI):**
- Real thermal 58/80mm Windows print service, RTL rendering, cutting, paper-out and operator recovery;
- Physical PC, barcode scanner, weighing scale, router/switch/WAN outage, protected local CA enrollment, firewall;
- UPS and power-loss recovery, offline DB durability, encrypted backup off-machine, restore on another host with measured RPO/RTO;
- Complete authoritative PostgreSQL financial modules: real shift management, cash drawer, purchases, returns, debt, discount, split tender, stock adjustments, product management and real role/permission boundaries. These remain separate DEMO modules in the full React app and are deliberately unavailable in the isolated V36 staging page.
- Official Windows installer, signed service, auto-start, credential storage, migration/rollback procedures and real data migration validation.
- Supervised operator/owner sign-off after actual hardware and transaction reconciliation.

**No external cloud required for cashier operations.** Supabase/Owner notifications remain asynchronous optional and must never block local sales.

## Physical test handover

Use `docs/V36_PHYSICAL_ACCEPTANCE_HANDOVER.md` only after the machine, printer and LAN setup is available. Capture the exact Git commit, OS, PostgreSQL version, printer model/driver, scanner model, scale barcode example, CA fingerprints and evidence for every failed/passed acceptance item. Do not use live store credentials or sell goods before formal independent approval.
