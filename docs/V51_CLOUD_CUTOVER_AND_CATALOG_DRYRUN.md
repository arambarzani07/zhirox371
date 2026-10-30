# ZHIROX371 V51 — Cloud Cutover Preflight & Catalog Conflict DRY RUN

**Release status: NO-GO for actual supermarket sales and live Cloud synchronization.**

V51 supplies two bounded, **read-only validation layers** before the first external Cloud connection is approved. V50's real TLS test remains loopback-only; there is still no production receiver URL, no production authorization, and no access to Supermarket Kani Chnar's live data.

## 1. Approved Cloud endpoint preflight

`offline/cloud-cutover-v51.mjs` accepts an explicitly proposed external HTTPS endpoint and an exact owner-approved DNS hostname. It rejects userinfo, query and fragments, different path, HTTP, alternate ports, IP literals and obvious private or local hosts. It **never connects** to the hostname.

The nine operational evidence fields cover a real deployed receiver, DNS/egress protection, secret rotation, cloud database tenant isolation, event-ID reconciliation, independent backup restore, Windows service signing, physical checkout and owner sign-off.

Important: **Even if all nine fields are asserted TRUE, the result stays NO-GO**. Claimed evidence cannot replace independent operator verification or authorization. Hostname-only validation is NOT sufficient protection from DNS rebinding, IP resolution to a private address or compromised TLS chains; network egress deny rules and monitored DNS verification are still needed.

## 2. Versioned, conservative catalog/price/stock proposals

`offline/catalog-conflicts-v51.mjs` defines a DRY RUN protocol:
- `catalog.product_upsert`: local-store-owned name and base unit.
- `catalog.price_set`: an IQD selling price, with no purchase costs transmitted.
- `stock.snapshot`: a store-local stock observation, not an instruction for Cloud to overwrite local stock.

Every event has a unique UUID, store/product UUID, source, numeric previous/current version and strict payload fields. The dry run detects invalid or cross-store payloads, stale versions, missing products, version gaps, duplicate event IDs and same-ID conflicting payloads. Contiguous proposals advance an **in-memory virtual cursor only** to validate an ordered batch. It does not open PostgreSQL, write stock, modify selling prices or call Supabase.

V51 does NOT yet implement outbound or inbound catalog/price/stock sync, migrations or authoritative conflict resolution. Local LAN PostgreSQL remains the financial source of truth. No cloud-origin stock snapshots are accepted.

## 3. How to test

Use `node --test offline/tests/cloud-cutover-v51.test.mjs`. CI also runs V50 real HTTPS TLS smoke, V49 automatic reconnection and V27 authenticated sender regression tests, alongside existing PostgreSQL foundation checks.

These tests must run without live data and without any Cloud URL being called.

## 4. Requirements before physical release or a public receiver

- Provision an isolated tenant-scoped Cloud environment; do not repurpose the existing live Supabase POS tables or Legacy SQL database.
- Add a secure externally deployed HTTPS ingress with independent credentials, tenant authorization, per-store HMAC key rotation, denial of private network targets and rate limiting.
- Define signed privacy-minimized sales payload and a migration plan for pre-existing undelivered messages. Do NOT change payload hashes for already-queued event IDs.
- Complete conflict authority design for catalog, price and stock, then develop audited migrations and run full round-trip tests on two disposable databases.
- Add operational metrics, event-ID mismatch alerts, outbox backlog threshold, reliable Windows background sync auto-start, backup/restore, and a rollback plan.
- Conduct actual two-register WAN-disconnected checkout, real receipt printer and scale/barcode scanner tests. Require written owner GO-LIVE acceptance and code signing before taking money.

The V48, V49, V50 and V51 pull requests are intentionally stacked. Do not merge them to production merely because CI is green. **The current V49 EXE is NOT an officially certified offline cashier and cannot synchronize real market data.**
