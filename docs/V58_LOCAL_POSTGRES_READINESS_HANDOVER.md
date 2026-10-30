# V58 — Step 2: local PostgreSQL readiness audit (NO-GO until physical deployment)

This does **not** install PostgreSQL on the real supermarket PC. It only adds a read-only, strict local test configuration and a validation gate against a real disposable PostgreSQL 16 instance.

## Implemented
- Check isolated localhost-only PostgreSQL URL, synthetic store UUID, explicitly enabled test mode, restricted DB username; reject Supabase/production/public networks and official release mode.
- Use BEGIN READ ONLY and ROLLBACK for the audit; inspect PostgreSQL >=16, current DB role privilege flags, 14 mandatory local tables, 6 server functions, synthetic store scope, pending event-outbox read.
- Return detailed named check results but **always** release_status=NO_GO, ready_for_production=false; never print DB connection strings, customer data or passwords.
- Real PostgreSQL 16 CI applies existing isolated migrations, creates a disposable test store, grants a dedicated read-only DB user SELECT and verifies that user cannot insert records.
- No write to production, no changes to the legacy SQL market, no real credentials and no deploy.

## Why Step 2 is NOT yet complete
The target Windows/LAN server must be installed, secured and operated by an authorized operator. We still need independent real-PC evidence of:
1. PostgreSQL server with proper Windows service, startup/recovery, authentication, firewall, verified TLS, restricted per-store role; no direct browser DB credentials.
2. One signed-in cashier with unique role and live local cash shift; atomic sale, stock, receipts and print queue through the V33/V45 LAN gateway while WAN cable is unplugged.
3. Simultaneous multi-cashier last-item race; no oversell, no duplicate receipt or lost durable checkout, correct customer/local stock data.
4. Physical login, actual scanner and printer and independent backup/restore/UPS.
5. Deployment with known private store UUID and separate secure secrets in an approved production service, never in a public repository.

## Command for disposable trial ONLY
Run after provisioning a separate synthetic PostgreSQL 16 database and migrations:

- Set ZHIROX_V58_ISOLATED_PREFLIGHT=true
- Set ZHIROX_V58_SYNTHETIC_TEST_ONLY=true
- Set ZHIROX_V58_STORE_ID to synthetic UUID
- Set ZHIROX_V58_LOCAL_DB_URL to an isolated localhost zhirox_v58_*test/trial/disposable database with a least-privileged read-only user
- Run node offline/local-readiness-v58.mjs

The V58 process can only read the test DB, will always report NO_GO, and cannot be used to start real sales. This is a preparation gate, not permission to skip to point 3.

## Seven-step release workflow
1. V57 isolated 12×4 visual shell: automated build/browser checks passed; store-PC visual acceptance remains.
2. V58 local PostgreSQL and cash sales: **IN PROGRESS, not operationally certified**.
3. Production Cloud receiver and automatic outbound sync: BLOCKED pending step 2.
4. Versioned products/pricing/stock conflict-safe sync: BLOCKED.
5. Signed resilient Windows EXE/service: BLOCKED.
6. Physical scanner, receipt printer, LAN and power-loss acceptance: BLOCKED.
7. Independent backup recovery, financial audit and owner witnessed GO-LIVE: BLOCKED.

**Do not merge this branch to main or activate an official cashier on the strength of CI alone.**
