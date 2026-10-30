# V29 — ZHIROX Owner iPhone preview and event-level reconciliation

**Scope: isolated GitHub code and disposable PostgreSQL preview, NOT a real cloud deployment.** Current checkout remains offline and independent of this read-only work.

## Features

- `/v29/owner`: same-origin mobile-first, Sorani RTL owner dashboard suited to an iPhone-sized browser. Uses V28 read-only summary and latest sale endpoints. Reports received **cloud** events only, with clear offline staleness disclaimer. The UI never requests sales writes or claims to show an offline store's complete sales.
- The owner types store UUID and a long private bearer token. The token remains in an in-memory JS variable only; it is not written to localStorage, sessionStorage, query strings, cookies, source code or logs. A page refresh requires a fresh sign-in. This is an isolated preview, not completed secure native iPhone authentication.
- Six owner notification categories are displayed truthfully: received sales events available; price changes, low stock, returns/refunds, shift open/close and security alerts **not implemented**. No APNs, Web Push, background delivery or automatic monitoring is installed.
- `GET /v29/owner/event-ids` is owner-authenticated with the existing store-specific owner bearer hash, paginates PostgreSQL inbox IDs by UUID with a strict max of 50 per page, and never exposes cross-store events. It is read-only and does not transmit names, prices or customer details.
- `offline/reconcile-events-v29.mjs` compares immutable event IDs from local PostgreSQL `event_outbox` and cloud `received_sales`. It detects missing IDs and unknown cloud IDs that V28 count comparison cannot discover. Both sides are bounded to 5,000 IDs: truncated reports are explicitly **partial**, not a proof of reconciliation. Even equal complete sets are marked as a **non-atomic snapshot**, because writes may occur while the two separate databases are read.
- V28 receiver HMAC, tenant isolation, PostgreSQL uniqueness, V27 nonblocking outbox sender and V26 cash checkout are unchanged. No production database, PC Relay, or locked Home modified.

## Preview, disposable PC only

Use a fresh TEST PostgreSQL database initialized with `offline/cloud-migrations/008_v28_received_sales.sql`. Run `node offline/cloud-receiver-v29.mjs` only with `ZHIROX_V29_PREVIEW_ENABLED=true`, `ZHIROX_V29_TEST_DATABASE_URL` and `ZHIROX_V29_STORES_JSON` from a secure test environment. The server binds **127.0.0.1:3419**, not a LAN/public address. Visit `http://127.0.0.1:3419/v29/owner` on the same test PC.

For true iPhone access later: build an authenticated HTTPS reverse proxy, secret rotation, rate limits, device enrollment, secure owner identity and platform browser certificate trust, then review CSP, origin policy and consent. **V29 itself is not reachable from a real iPhone over the public internet or home LAN.**

To run event reconciliation, explicitly set `ZHIROX_V29_RECONCILE_ENABLED=true`, `ZHIROX_V29_STORE_ID`, `ZHIROX_V29_OWNER_TOKEN`, `ZHIROX_V29_RECEIVER_URL` (exact `/v27/events`), and local DB connection; use `ZHIROX_V29_TEST_MODE=true` for loopback tests only. Execute `node offline/reconcile-events-v29.mjs`. It issues SELECT only. Count 5,000 is a report bound, not a universal sync limit.

## Production blockers

1. Real approved cloud hosting and tenant-scoped HTTPS security, secret renewal, owner login/token revocation, privacy and operational audit.
2. Read consistency for event-by-event reconciliation (snapshot cutoff, sequence checkpoints or a durable cursor), reconciliation repairs only after audited operator review.
3. Secure owner iPhone hosting and optional PWA Web Push opt-in; user-selected five other notification domains need corresponding source events and business rules.
4. Full 100% internet-independent local LAN cashier deployment, backup restoration, real printer/scanner and multi-cashier tests remain outstanding.

**This is a working code foundation tested in CI; it is not an iPhone App Store build, live owner app, deployed cloud receiver or production-ready POS.**