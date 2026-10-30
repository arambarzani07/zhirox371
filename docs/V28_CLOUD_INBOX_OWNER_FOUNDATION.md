# V28 — Cloud inbox / owner read-only monitoring foundation

**2026-10-30. Code and disposable CI only. No external deployment, no connection to production Supabase, no live market data.**

## New implementation

- `offline/cloud-migrations/008_v28_received_sales.sql` creates a **separate** cloud-style PostgreSQL inbox `zhirox_cloud_v28.received_sales`, which contains only store ID, event ID, sale ID, receipt number, total IQD, event hash and timestamps. Unique `(store_id,event_id)`, `(store_id,sale_id)`, `(store_id,receipt_no)` protect against duplicate effects.
- `offline/cloud-receiver-v28.mjs` accepts V27's signed `POST /v27/events` at a separate server, with independent per-store HMAC keys and strict 5-minute timestamps. It verifies signatures, store identity and sale data before committing to PostgreSQL; errors and conflicting event/sale/receipt IDs fail closed. A replay of an identical event yields a matching positive acknowledgment. Product names, barcodes and customer details in the original event payload are **not persisted** in V28 inbox. They remain present in the signed event transit unless a later privacy filtering protocol is agreed.
- Authenticated `GET /v28/owner/summary?store_id=...` and `/v28/owner/latest?store_id=...` provide store-scoped **read-only** sales metrics and last received events; a separate long random owner bearer token is checked against a server-side SHA-256 hash with constant-time comparison. No CORS, cookie session or public anonymous metrics. The owner view is API-only in V28, not an iPhone application or Web Push implementation.
- `offline/reconcile-cloud-v28.mjs` is an explicitly enabled read-only CLI: compares count, last receipt number and pending local outbox rows against authenticated cloud summary. It clearly labels count-only parity as **not proof of event-by-event reconciliation**.
- The cloud server is **disabled by default**, runs only on `127.0.0.1:3418` with a disposable DB, and needs `ZHIROX_V28_RECEIVER_ENABLED=true` plus `ZHIROX_V28_CLOUD_TEST_DATABASE_URL` and `ZHIROX_V28_STORES_JSON`. These are exclusively server-side values. This is not yet an Internet-exposed deployment.

## Testing (disposable only)

Run the `offline-foundation.yml` CI suite. Node tests exercise two-store separation, invalid signatures, event conflicts and idempotency, owner authentication, read-only summary, interoperability with V27 sender and reconciliation. PostgreSQL 16 smoke tests validate unique sale/event/receipt IDs and minimum retained fields.

Sample configuration **shapes only** (do not commit real tokens/secrets):

- `ZHIROX_V28_STORES_JSON` must be a JSON array of objects `{store_id, sync_secret, owner_token_hash}`, each store ID unique. The `owner_token_hash` is the SHA-256 hex digest of an independently generated owner token; the raw token must be kept in an approved secret manager, never in GitHub files, browser LocalStorage or URL queries.
- Local cashier worker's `ZHIROX_V27_RECEIVER_URL` must target the exact HTTPS endpoint `/v27/events`; in isolated loopback tests only it may target `http://127.0.0.1:3418/v27/events` with `ZHIROX_V27_TEST_MODE=true`.
- `ZHIROX_V28_RECONCILE_ENABLED=true`, store UUID, HTTPS receiver URL, owner token and local PostgreSQL test URL are required to run the comparison. No automatic modification occurs.

## Blocking requirements for a real cloud launch

1. Approved dedicated cloud host and PostgreSQL database; actual HTTPS reverse proxy with authentication/rate limits, secret rotation, deployment/rollback, monitored backups and least-privilege database identity. External firewall and CORS policy. Never expose loopback test listener directly on a public interface.
2. Per-store device enrollment and audit, owner identity with revocation, request throttling, automatic credential renewal and secure iPhone access. Owner API bearer alone is not a finished iPhone authentication solution.
3. End-to-end event-id reconciliation, catalog/stock bidirectional conflict rules, immutable source-of-truth rules and privacy review of signed event payload. In particular, V27 currently sends the full `package_breakdown` over HTTPS; V28 stores only sale summary.
4. Six requested iPhone alert categories: only **new sales** events are currently modeled. Price changes, low stock, refunds, shift events and security alerts are **not** available; code reports this explicitly. No push notifications were delivered or scheduled.
5. Real Windows PC/thermal printer/scanner/multi-cashier outage/backup testing. V28 **does not** make the React demo or the isolated PostgreSQL pilot production ready.

All Home design files, Supabase Production, real retail databases and PC Relay remain untouched.