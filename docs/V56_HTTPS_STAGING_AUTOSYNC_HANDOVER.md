# ZHIROX371 V56 — STAGING HTTPS automatic outbox sender (NO-GO)

## Implemented
- Separate opt-in background process, reusing V27 signed HMAC outbox delivery and V49 exponential retry. The local cashier checkout remains independent of Internet.
- Receivers must respond with matching store ID, event ID, accepted=true; even an HTTP 200 without this acknowledgment cannot clear the local outbox.
- After WAN interruption, the worker retries when connectivity returns while it remains running. No ping, captive portal, cloud calls or waits are added to cashier checkout.
- Only sale.completed events. This is NOT full catalog, pricing, stock or finance synchronization.
- No production service, DB migration, live data access or deployed cloud endpoint. The original locked Home and V55 read-only EXE are unchanged.

## STAGING-only configuration
Set these variables in an access-controlled private environment on an isolated test server; never commit secrets:
- ZHIROX_V56_STAGING_AUTOSYNC_ENABLED=true
- ZHIROX_V56_ISOLATED_TEST_DATA=true (explicit operator assertion of synthetic data)
- ZHIROX_V56_STORE_ID: synthetic store UUID
- ZHIROX_V56_HMAC_SECRET: unique staging-only 32+ byte signing secret
- ZHIROX_V56_EXPECTED_STAGING_HOST: exact public DNS host containing staging or sandbox
- ZHIROX_V56_STAGING_RECEIVER_URL: https://<same-staging-host>/v27/events at port 443
- ZHIROX_V56_LOCAL_DISPOSABLE_DB_URL: localhost/private-LAN PostgreSQL with a V56-named disposable/test DB; private LAN DB requires sslmode=verify-full and a trustworthy CA; use a least-privilege test account.

Provision isolated PostgreSQL with V27 migrations and independently configured HTTPS staging receiver with same store ID and signing key. Check exact DNS/TLS, controlled network egress and receiver idempotency. Run interactively with: node offline/staging-autosync-v56.mjs. Ctrl-C ends the process. It intentionally refuses official release mode. No unattended Windows service is set up yet.

## Automated checks
Run: node --test offline/tests/staging-autosync-v56.test.mjs offline/tests/autosync-v49.test.mjs offline/tests/outbox-sync-v27.test.mjs

The V56 workflow tests configuration rejection, lost WAN, signed event, reconnect and strict ACK with injected test DB and HTTPS response. V52 separately tests genuine TLS and dual disposable PostgreSQL on loopback with synthetic WAN disconnect/reconnect. Neither substitutes for real remote infrastructure tests.

## Formal release blockers
1. Integrate the original locked 12x4 Home and offline cashier with production-hardened local PostgreSQL, TLS LAN gateway, login, purchase/stock invariants and shutdown recovery.
2. Physical multi-cashier WAN-off test, scanner prefix-27 and actual 58/80 mm six-column Sorani receipt printed, power-cut, UPS and independent encrypted restore.
3. Deploy a separately reviewed and secured live HTTPS receiver, protected Windows auto-start service, secret rotation, reconciliation, alerting, signed Windows installer and rollback.
4. Implement versioned bidirectional catalog/price/stock sync only if such two-way sync is required, with audited conflict handling; the current sender is sale-events only.
5. Independent financial/security verification and owner witness/signoff, with strict NO-GO on any failure.

RELEASE STATUS: NO-GO. No production DB, Vercel deployment, PC Relay, or locked Home change is authorized or made by V56.
