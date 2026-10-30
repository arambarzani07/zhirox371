# V31 — durable PostgreSQL checkout intent recovery (isolated local-PC pilot)

**Code-only development against disposable local PostgreSQL. Do not apply to production Supabase. Do not expose on LAN.**

## Why this stage

Previously the React pilot stored the unresolved `request_id` and lines only in `sessionStorage`, which can vanish when a tab is closed or a PC fails. V31 makes an isolated PostgreSQL checkout intent the durable source of truth **before** any sale or stock mutation, and allows the same authenticated cashier to recover it after browser restart.

## Atomic protocol

1. Cashier logs in to the local session; `GET /api/local/v31/recover` reads **only that signed principal's** one unresolved prepared intent. Browser cache is only a hint. On recovery the previous immutable lines, quote and UUID are restored, and the basket remains locked.
2. `POST /api/local/v31/prepare` commits a row in `zhirox_local.checkout_intents_v31` with cashier/store identity derived from the signed session. Its barcode lines and expected IQD total cannot be changed under the same UUID. Only **one prepared checkout per cashier per store** is allowed. This step does not sell any product, print a receipt or decrement stock.
3. Only after that row is durably committed does `POST /api/local/v31/commit` execute the existing V26 atomic PostgreSQL checkout *inside the same SQL statement/transaction as the journal status change*. It writes the receipt, inventory deduction, ledger and outbox atomically, and marks the intent committed. A repeated commit returns the original receipt without new financial effects.
4. Uncertain timeouts keep the prepared UUID intact and lock the cart. On a verified server price mismatch, the UI calls `POST /api/local/v31/cancel`, which locks the store and intent and refuses to cancel a completed sale. If cancellation fails, the UI **does not clear the pending intent**; the cashier must resume or retry it. Terminal `cancelled` requests can never be committed.
5. The existing React Demo checkout, customer data, shifts and Demo receipts are unchanged. Only the explicitly enabled local PostgreSQL pilot uses these new endpoints.

## Files and reproducible checks

- Migration: `offline/migrations/009_durable_checkout_intents.sql` after V1–V7 local migrations. Creates durable intent table, one-active-per-cashier index and SQL prepare/commit/cancel with store-level serialization.
- HTTP entry point: `offline/local-durable-server-v31.mjs` binding **127.0.0.1:3307** only with explicit `ZHIROX_V31_TEST_ENABLED=true`, isolated `ZHIROX_LOCAL_DB_URL` and `ZHIROX_LOCAL_SESSION_SECRET`.
- React: `src/components/LocalPostgresPilotV24.tsx`, `src/localPilotV24.ts`, and opt-in Vite proxy to 3307. The existing label now identifies V31. Browser token/password never enter persistent storage or the URL.
- CI: `offline/tests/009_durable_checkout.sql` on disposable PostgreSQL 16 proves no sale on prepare, no overlapping intents, identity scope, crash retry, price mismatch rollback, non-cancellable completed receipt and exactly-once stock/outbox effects. `offline/tests/local-durable-v31.test.mjs` verifies authenticated HTTP boundaries, `tests/browser/v24_react_local_pilot.mjs` simulates real browser reload after a failed checkout response, and `tests/v24_local_pilot_contract.test.mjs` enforces Home/Demo protection.

## Operational blockers that still remain

V31 is **not** a formally deployable cashier. PostgreSQL durability assumes a properly managed local server with WAL/fsync, power protection, verified backups/restore and full-disk failure plans. No power-cut hardware drill, thermal printer acceptance test, real multi-PC LAN authentication/TLS, standalone Windows installer, or long-offline soak test has passed. The normal React cashier remains Demo and must not be used for real sales. The pending journal covers only tested cash unit/carton/gram sales, not credit, returns, discounts, split tenders or future catalog operations. Cloud and Owner remain optional async and **cannot block checkout**.

**No production data/DB, PC Relay, locked Home design or public cloud service was modified.**