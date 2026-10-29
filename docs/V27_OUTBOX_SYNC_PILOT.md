# V27 — PostgreSQL outbox sync pilot (NOT a production cloud integration)

**Operational scope:** separate, explicit opt-in local-PC sender and disposable loopback receiver for acceptance testing. The normal cashier checkout is completely independent of this worker. No existing Supabase/project tables or secrets have been accessed or changed.

## Implemented guarantees

- Migration `offline/migrations/007_outbox_leases.sql` retains the V1/V26 transactional `event_outbox` and adds a retry schedule, lease token, lease expiry and bounded last-error field. `claim_outbox_v27` uses `FOR UPDATE SKIP LOCKED`; acknowledgement and retry require the current matching lease token. Worker restart or network downtime cannot erase a pending event.
- Sender `offline/outbox-sync-worker-v27.mjs` remains disabled unless `ZHIROX_V27_SYNC_ENABLED=true`. An explicit store UUID, local database and HMAC secret (at least 32 bytes) and exact external HTTPS receiver endpoint ending in `/v27/events` are required. Testing allows HTTP only for loopback with explicit `ZHIROX_V27_TEST_MODE=true`.
- Each request contains store_id, event_id, aggregate_id, event_type, created_at, and the immutable PostgreSQL checkout payload. `X-ZHIROX-Timestamp` and `X-ZHIROX-Signature` bind the raw body and freshness to a server-only HMAC secret. The receiver verifies the signature and rejects a different store. Sender accepts only an exact positive acknowledgement naming the same store_id and event_id.
- PostgreSQL claims are performed in a short committed statement BEFORE network operations, never holding checkout transactions while waiting for HTTPS. Failed/ambiguous remote deliveries get a 2–900 second database backoff and stay in the outbox; there is no silent deletion or retry cap.
- The isolated test receiver `offline/test-cloud-receiver-v27.mjs` stores events in `zhirox_cloud_test.received_events` with `(store_id,event_id)` as the unique key. Identical delivery retries acknowledge as duplicates without inserting another record. Conflicting payloads for an existing event_id return HTTP 409.
- Exactly-once network delivery is **not claimed**: delivery is *at least once*, receiver effect is idempotent when it applies these safeguards. The sender ACKs locally only after a validated response. A crash after the receiver commit but before ACK causes safe re-delivery.

## Disposable test instructions

1. Apply local migrations 001–007 in order on a disposable PostgreSQL instance; do not run migration 007 on live Supabase. In a separate disposable test database, apply `offline/tests/007_receiver_fixture.sql` to simulate remote inbox storage.
2. Start the loopback-only test receiver, using `ZHIROX_V27_RECEIVER_TEST_MODE=true`, `ZHIROX_V27_TEST_RECEIVER_DB_URL`, `ZHIROX_V27_STORE_ID`, and `ZHIROX_V27_SYNC_SECRET`. It binds `127.0.0.1:3407`, not an external/cloud address.
3. Start the independent sender with a local PostgreSQL connection string and `ZHIROX_V27_SYNC_ENABLED=true`, `ZHIROX_V27_STORE_ID`, `ZHIROX_V27_SYNC_SECRET`, `ZHIROX_V27_RECEIVER_URL=http://127.0.0.1:3407/v27/events`, `ZHIROX_V27_TEST_MODE=true`; run `node offline/outbox-sync-worker-v27.mjs --once` for one batch. It is safe to run without network: it keeps events in the local outbox for retry.
4. For a real cloud destination in a later phase, the team MUST build and security-review a tenant-scoped HTTPS receiver, authentication/credential lifecycle, database uniqueness and reconciliation, plus no-PII data rules. This V27 branch **does not deploy a cloud receiver** or send production sale data anywhere.

## Remaining production blockers

- Setup of encrypted, authenticated cloud receiver with rotated per-store keys, device enrollment and certificate validation; verify DNS/IP egress policy and protection against SSRF.
- Lease lifetime and heartbeat under a slow receiver, metrics and dead-letter operator handling, accurate local store clock, durable local DB backups and restore drills, ordering/conflict reconciliation for catalog and stock; the current payload stream is **sales events only**, not bidirectional catalog sync.
- No multi-PC LAN HTTPS provisioning yet, no physical printer/scanner production verification, no Windows service installer, and no real Supabase credentials configured.
- The primary React cashier remains a DEMO; local V26 PostgreSQL cashier is still a loopback test panel and is not formally ready for real supermarket transactions.

## CI contract

`offline-foundation.yml` runs Node transport/signature/idempotency unit tests and PostgreSQL 16 transactional lease/ACK/backoff tests. No external service or real user data are used.