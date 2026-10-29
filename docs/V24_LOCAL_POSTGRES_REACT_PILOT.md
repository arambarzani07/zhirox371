# V24 — React ↔ isolated local PostgreSQL pilot (2026-10-30)

## Current, actual scope

V24 provides an **explicit opt-in PC development pilot**, not a replacement for the React browser-only DEMO checkout and not a production LAN deployment. The existing local PostgreSQL V1–V5 pilot remains loopback-only. The React PC cashier includes a **separate** V24 panel only when Vite is running in development with `VITE_ENABLE_LOCAL_PILOT=true`. Both Vite and the local server bind to **127.0.0.1**; Vite proxies `/api/local/**` to `http://127.0.0.1:3305` on the same workstation. No public IP or browser database password is used, and the V24 panel is excluded from production builds.

### How to test on a disposable PC database

1. Create a **disposable** PostgreSQL DB. Apply `offline/migrations/001_core.sql`, `002_atomic_checkout.sql`, `003_local_users.sql` and `004_catalog_indexes.sql`. Create only test products, store and cashier credentials following the existing V3/V5 isolated pilot instructions.
2. Set `ZHIROX_LOCAL_DB_URL` to the test-only DB and `ZHIROX_LOCAL_SESSION_SECRET` to a random 32+ byte secret **in the local server environment only**. Start `node offline/local-catalog-server-v5.mjs` (requires the `pg` package installed in the test environment), which serves the authenticated V3/V4/V5 API on `127.0.0.1:3305`.
3. On the **same PC**, start the React dev server with `VITE_ENABLE_LOCAL_PILOT=true npm run dev -- --host 127.0.0.1`. The V24 panel appears above the Demo cashier. Open it and sign in with the **real local test account**, store UUID and password. Neither token nor password is persisted.
4. Scan only unit barcodes with one base unit per scan. V4 API rejects multi-unit cartons and does not decode weight or discounts. V3 cash checkout derives store/cashier from its authenticated bearer session and calls `zhirox_local.checkout_cash_v1` atomically. V24 does not invent the final price: the SQL function calculates authoritative prices.
5. On ambiguous network/database failures, the same `request_id` and item payload are retained in the browser tab's `sessionStorage` for manual retry after re-login. Do not create a new transaction for an uncertain outcome. SessionStorage is a **pilot recovery aid**, not crashproof financial durability, not a database and not a cloud outbox. If browser storage disappears, reconcile against PostgreSQL before any manual retry.

## Critical limits (deployment gate)

- **Unit-only, cash-only** pilot: no kg/scale, carton, debt, customer balance, coupons, discounts, returns, mixed payments or multi-cashier management from the React panel.
- No LAN-facing server yet, **no TLS/device enrollment**, no printer integration, no robust Windows installation, no offline disk backups, no PostgreSQL-based durable request outbox and no cloud sync implementation. The PostgreSQL test server and React dev UI must remain restricted to one workstation.
- Server prices and stock are authoritative, but V3 does not implement an expected-total quote in the atomic SQL transaction; a concurrent price change may make the final receipt differ from the pre-scan preview. **Never treat this prototype as an approved cash-drawer POS.**
- The React DEMO cashier, original product ledger, and sample receipts are still browser state/LocalStorage. The V24 pilot does not write to any of those React states, so its receipts never appear in the DEMO history. The loopback database stores the pilot checkout separately.
- No real market database, Supabase production, owner-locked Home files, or PC Relay changed.

## Required next steps

Server-side expected-total validation and final price snapshot, weighted/package checkout SQL, store-scoped shift and payment verification, PostgreSQL-backed idempotent pending checkout journal and cloud sync outbox, on-LAN TLS/device auth, multiple concurrent PC cashier tests, standalone offline asset serving, printer and backup restore drills. Only then may the Demo paths be removed and the real API become the primary React cashier.
