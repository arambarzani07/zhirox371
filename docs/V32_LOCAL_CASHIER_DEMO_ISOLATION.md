# V32 — Isolated primary PostgreSQL cashier route with no Demo fallback

**Scope: disposable same-PC development environment ONLY. NOT a formal store cashier.**

## Runtime separation

- The ordinary Vite/React app remains a clearly labeled browser **DEMO**, using its original CashierPos and Demo receipts.
- Only when **both** `VITE_ENABLE_LOCAL_PILOT=true` and `VITE_V32_LOCAL_CASHIER=true` are set in **development mode**, the existing Home Cashier route renders `LocalCashierV32` **instead of** mounting `CashierPos`. The browser Demo checkout, Demo financial hotkeys, Demo receipt table and Demo print modal are inaccessible from this local cashier page. Do not edit the locked Home or merge browser DEMO receipts into PostgreSQL.
- V32 reuses the V31 authenticated prepare → commit → recover → cancel flow with the server-computed V26 cash checkout of unit, carton and integer gram scale labels. It does not create an alternative transaction path. This POS must never silently fall back to Demo on local database failure.
- `LocalPostgresPilotV24` in `standalone` mode opens immediately with no separate collapsible card. It shows the existing Sorani RTL six-column basket plus a **PostgreSQL-only cashier receipt history**. The receipt list comes exclusively from a signed local API, not LocalStorage or DEMO receipts; history displays no customer PII.

## New read-only V32 API

`offline/local-cashier-server-v32.mjs` wraps V31 using the **same** authenticated server-side principal. It binds only to `127.0.0.1:3308`, with explicit `ZHIROX_V32_LOCAL_CASHIER_TEST_ENABLED=true`. It exposes:

- `GET /api/local/v32/receipts?limit=20` — most recent 20 sales where **both** store_id and cashier_id equal the verified session principal. Query is parameterized and SELECT-only. A different cashier's or store's receipts are never exposed.
- `GET /api/local/v32/intent?request_id=<uuid>` — exact status of the authenticated cashier's previously prepared checkout. On login, a stale browser hint whose UUID has **already committed** is cleared and the original receipt is shown; a **cancelled** hint is cleared. A `prepared` hint resumes the immutable journal. If the server returns no intent, the prior hint can be safely re-prepared with its same UUID. Errors fail closed.
- If the local API is unreachable, the local cashier displays an error; it never creates Demo products or a Demo receipt as a fallback. Credentials remain server-side or session-memory-only.

## Running an isolated demonstration

1. Use a disposable PostgreSQL test DB, apply local migrations 001, 002, 003, 004, 005, 006, 007, 009 (the cloud migration 008 is separate). Seed a test-only store, cashier account and mock products/barcodes.
2. Set `ZHIROX_LOCAL_DB_URL`, `ZHIROX_LOCAL_SESSION_SECRET` and `ZHIROX_V32_LOCAL_CASHIER_TEST_ENABLED=true` in the **server process**; launch `node offline/local-cashier-server-v32.mjs`. It will bind loopback only.
3. Set `VITE_ENABLE_LOCAL_PILOT=true` and `VITE_V32_LOCAL_CASHIER=true` for `npm run dev -- --host 127.0.0.1`. The Vite local same-origin proxy routes `/api/local` to `127.0.0.1:3308`. No browser database credentials and no Supabase dependency.
4. Open the Home card for Cashier. The V32 local mode displays a PostgreSQL-only cashier (no Demo finish button). Normal Vite startup without both flags still displays the browser Demo cashier. Stop the test process to leave the app in ordinary Demo mode.

## Verified checks

- Node HTTP tests assert store/cashier authorization, SELECT-only and no anonymous access to receipts or journal status.
- A real Chromium regression runs an **independent Vite instance** on loopback 3001 with both flags. It tests local-mode route replacement, rejected local barcode scan with no Demo fallback, true server receipt list, and restart with stale **committed** browser UUID that is recognized rather than resold.
- All V23–V31 React/Node/SQL smoke tests remain in CI, and locked Home hash integrity is preserved.

## What remains before formal use

Still missing: actual PC/LAN PostgreSQL host with encrypted and authenticated device connections, verified WAL+UPS+backup/restore and power-cut drills, thermal receipt print of server sale, shift close/open accounting, correct multi-cashier hardware, returns/credit/split-tender/discount workflows and full outage acceptance. Cloud sync is optional async, never required for cashier operations. Other Home modules still show Demo data: **do not use their Demo outputs as real market records**. No production database, PC Relay or real supermarket data was modified.