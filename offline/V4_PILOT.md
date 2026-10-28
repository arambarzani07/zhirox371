# ZHIROX V4 Local Cashier Pilot (NOT production-ready)

This phase creates a standalone experimental Sorani RTL cashier page **served by the local POS API**. It does not modify the owner-locked Home or existing operations.js. Production Supabase, PC Relay, and the current checkout UI remain untouched.

## Scope proven by the pilot
- Local username/password login against isolated PostgreSQL (V3 API).
- Local barcode lookup from zhirox_local.barcodes joined to local products, scoped to the authenticated store.
- Unit-only basket and idempotent checkout using the V3 server's transactional SQL function.
- Pilot HTML has no CDN or Supabase dependencies; same-origin HTTP requests go to 127.0.0.1 only.
- Pending checkout request_id and line payload are kept in sessionStorage to support retries after an ambiguous response (not sufficiently durable for production).

## Run locally (isolated test PC ONLY)
1. Install PostgreSQL and run migrations 001, 002, 003 on a disposable local DB.
2. Provision test store, products, barcodes, and locally hashed test user through a secure fixture (not supplied here). Do not use production data.
3. Run `npm install pg --no-save` in a disposable checkout to install the PostgreSQL driver.
4. Set environment variables `ZHIROX_LOCAL_DB_URL` and `ZHIROX_LOCAL_SESSION_SECRET` (>= 32 bytes).
5. `node offline/local-pilot-server-v4.mjs`; browse `http://127.0.0.1:3304/pilot`.
6. Unplug WAN while retaining loopback/local DB. Login, scan a test unit barcode and make a test sale; inspect local sales, stock_ledger, event_outbox. No remote service is used.

## Hard blockers
- No staff provisioning/reset workflow, role-based limits beyond the basic cashier login, LAN TLS or device enrollment.
- Existing operations.js / workspace.js still route through browser-local emulation or Supabase and MUST NOT be treated as fully offline multi-cashier.
- Pilot supports **unit-only** quantities. Cartons, weighted codes (prefix 27), promotions, returns, debt, shifts and hardware receipt printing are not wired to local API.
- Browser sessionStorage is not reliable crash/power-safe persistence. For rollout use durable POS server-owned pending transactions plus idempotency recovery and a signed-in account checkpoint.
- Local stock and price queries can become stale before checkout; authoritative revalidation and a customer-facing price conflict resolution workflow are needed.
- Cloud sync must remain asynchronous and optional. No cloud call may block checkout.
- Never expose port 3304 to the LAN or Internet until hardening is complete.
- Strict UI integrity gate: no changes to locked index.html, ui-global.css, ui-fixed-pc.css, card-icons.css or card-icons.js.

## Tests
`node --test offline/tests/*.test.mjs` checks the local API behavior with fake DB.
CI also executes `npm test` and a PostgreSQL smoke test. End-to-end multi-cashier hardware validation still required.
