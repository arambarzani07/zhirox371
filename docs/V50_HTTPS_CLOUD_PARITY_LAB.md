# ZHIROX371 V50 — HTTPS receiver rehearsal and event-level cloud parity (NO-GO)

**Status: isolated test environment only. No cloud domain, production Supabase connection, market data or financial records have been touched.** No installer is certified for real sales.

## What V50 implements

- A standalone **TLS1.2+ loopback-only** receiver in `offline/staging-https-v50.mjs`. It reuses the authenticated V29/V28 receiver: store-scoped HMAC signatures, one immutable `sale.completed` event per ID, immutable minimal stored sales summary, idempotent duplicate acknowledgement, owner bearer authorization, and event-ID pages. It rejects unencrypted requests, unregistered network peers, oversized bodies and request-rate spikes.
- The HTTPS listener binds **only to 127.0.0.1:3445**. It refuses to run unless `ZHIROX_V50_HTTPS_LAB_ENABLED=true`, the PostgreSQL URL is a loopback **test/trial/disposable** DB, an explicit test store map is configured, and local TLS cert/key files exist. Do not expose it on a public Internet interface; a production reverse proxy, authorization, storage and operator model remain unreviewed.
- A read-only **V50 reconciliation tool** in `offline/cloud-readiness-v50.mjs` combines the existing V28 sale-count/pending-outbox audit with V29 event-ID comparison. Its result distinguishes **PENDING_OR_MISSING**, **CONFLICT_REQUIRES_REVIEW**, **PARTIAL_NOT_VERIFIED**, and **MATCHED_NON_ATOMIC_LAB_SNAPSHOT**. Even a match always returns `release_status=NO_GO`.
- The V50 audit command is guarded to work only with the **V29 loopback HTTP test receiver** and local disposable PostgreSQL; its purpose is to test the existing V27 → V28/V29 pipeline, not contact any real cloud host. The HTTPS receiver has its **separate TLS smoke test**, using a temporary self-signed CA/cert generated during CI. This is deliberate: the V49 Windows worker currently refuses public endpoints and no production receiver is configured.

## Validation with synthetic events

- `node --test offline/tests/cloud-readiness-v50.test.mjs` sends signed synthetic events from a simulated local PostgreSQL outbox into a real loopback V29 receiver. The first reconciliation reports an outstanding event; after delivery of the second event it reports matching counts and event IDs while retaining NO-GO.
- `node --test offline/tests/staging-https-v50.test.mjs` generates a temporary local certificate, starts an HTTPS server, validates TLS trust, idempotent signed delivery and owner event listing, and rejects invalid signatures and changed replay payloads. Temporary certificate private keys are deleted after the test, never committed or uploaded.
- Existing V27/V28/V29 and V49 regressions are also run by the V50 GitHub Actions job. No real cloud data is used in CI.

## Test-only operator setup

A trained developer can run an isolated V50 TLS receiver only after provisioning a separate throwaway local PostgreSQL schema `zhirox_cloud_v28` with the previous V28 migration and creating an ephemeral trusted test certificate. Store environment variables privately and never paste real passwords or tokens:

- `ZHIROX_V50_HTTPS_LAB_ENABLED=true`
- `ZHIROX_V50_CLOUD_DISPOSABLE_DB_URL=postgresql://...@127.0.0.1:5432/v50_disposable_test`
- `ZHIROX_V50_LAB_STORES_JSON=[{store_id,sync_secret,owner_token_hash}]` (shape only)
- `ZHIROX_V50_TLS_CERT_FILE=<absolute private test cert path>`
- `ZHIROX_V50_TLS_KEY_FILE=<absolute private test key path>`

Run `node offline/staging-https-v50.mjs` locally. Its port is not a production cloud endpoint and **V49 does not automatically sync to this HTTPS listener**. The V49 sender is separately tested with a loopback HTTP receiver; configuring external delivery requires a future reviewed integration.

To run the event parity CLI against a disposable V29 HTTP loopback test receiver, configure the existing `ZHIROX_V29_STORE_ID`, `ZHIROX_V29_OWNER_TOKEN`, `ZHIROX_V29_RECEIVER_URL` and `ZHIROX_LOCAL_DB_URL` plus `ZHIROX_V29_TEST_MODE=true`, `ZHIROX_V50_CLOUD_AUDIT_LAB_ENABLED=true`. Run `node offline/cloud-readiness-v50.mjs`.

## Before any real external Cloud connection

1. Select an explicit approved HTTPS cloud hostname, tenancy boundary and supported deployment environment. Sign off network egress/DNS/redirect policies, TLS certificate validation, recovery and uptime.
2. Configure a dedicated cloud PostgreSQL schema, role isolation, audited migrations, event retention and encrypted backups; never reuse supermarket legacy or existing production Supabase databases as a disposable target.
3. Implement a production-grade HTTPS receiver with rate limits, device key rotation, independent authentication, private credentials and event-ID reconciliation at scale. Restrict synced customer/product data.
4. Integrate a signed Windows auto-start sync service, cloud-disconnect handling and RPO/RTO testing against an independent physical machine; approval must be documented.
5. For catalog, price and stock, design authoritative source-of-truth and bidirectional conflict resolution. The current transport covers **sales events only**.
6. Complete physical two-cashier LAN WAN-off checkout, real scanner/scale/receipt, UPS and rollback acceptance. Banking and mixed tenders remain disabled.

**Outcome: V50 advances test coverage and cloud-interface design only. It does not turn ZHIROX371 into a live cloud-connected, fully offline cash register.**
