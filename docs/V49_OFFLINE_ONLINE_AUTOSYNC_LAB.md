# ZHIROX371 V49 - offline/online automatic outbox retry LAB (NO-GO)

**Status:** Disposable test only. No real cloud host, no Supabase production, no live market data, no payment processing, no Windows service auto-start.

## Implemented
1. Cash sales and their outbox records remain local PostgreSQL transactions. Checkout NEVER waits for network.
2. A separate V49 worker calls the existing V27 syncOutboxOnce method repeatedly. Signed sale.completed events use the existing V27 ACK and idempotent retry logic.
3. A receiver outage retains locally pending events for retry; an unavailable database produces bounded exponential scheduler backoff. No overlapping scheduler calls.
4. Only a manually approved disposable LOCAL test database and HTTP receiver at loopback 127.0.0.1/localhost are accepted by V49. Production HTTPS and Supabase endpoints are deliberately REFUSED until a security review.
5. A validated ACK must match event/store IDs before V27 marks the local event as delivered. Stats report only counts and delays; no customer/product details or credentials.
6. This is a sales-event one-way test; not bidirectional catalog, stock or price sync.

## Windows EXE handover
- Built atop V48 trial code, the V49 EXE adds the manual shortcut: Start V49 Sync Test.
- The older downloaded V48 EXE does not include this feature.
- The receiver, PostgreSQL, local credentials, trusted devices and security rules are NOT included. No actual sales are permitted.

## Isolated test setup only
A trained operator must create a disposable local PostgreSQL database with V27 migrations and a loopback-only V28 receiver, then set these LOCAL server variables:
- ZHIROX_V49_LAB_AUTOSYNC_ENABLED=true
- ZHIROX_V27_TEST_MODE=true
- ZHIROX_V27_STORE_ID=disposable-test-uuid
- ZHIROX_V27_SYNC_SECRET=unique-32-plus-byte-test-only-secret
- ZHIROX_V27_RECEIVER_URL=http://127.0.0.1:3418/v27/events
- ZHIROX_LOCAL_DB_URL=postgresql://...@127.0.0.1:5432/zhirox_disposable_test

Never post tokens, connection strings or real data publicly.
Run node --test offline/tests/autosync-v49.test.mjs and existing V27/V28 tests. Test disconnection, reconnect, duplicate ACK, DB failure and restart. Do not claim that an HTTP 200 proves remote settlement.

## Remaining blockers for official EXE and automatic internet sync
- Hardened HTTPS cloud receiver and private tenant authentication, production credentials kept out of browser;
- Windows signed installer and protected auto-start service with safe rollback;
- Disconnected WAN/LAN physical two-cashier checkout, printer and scanner tests;
- Backup with independent hardware restore; event-id reconciliation and alerts;
- Product/price/stock conflict rules and inbound sync design;
- Owner-witnessed security, finance and operational GO-LIVE acceptance.

**No production release. A green CI only confirms scripted test behavior.**
