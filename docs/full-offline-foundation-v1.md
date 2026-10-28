# ZHIROX Full Offline Foundation V1

Status: architecture and migration specification. **Not production-ready.** Do not claim offline operation until all acceptance tests pass.

## Non-negotiable behavior
- With WAN unplugged (but LAN operational), every cashier can authenticate locally, scan all configured barcodes and scales, load full catalog, price and stock, perform sales, returns, shift operations, stock management, customer debt, print receipts, and view reports.
- Checkout, receipt numbering, inventory changes, and authorization must never depend on Supabase availability, DNS, CDN, cloud auth, or an external API.
- Local PostgreSQL + local POS API is the sole transaction authority; remote Supabase is optional asynchronous replication for owner monitoring.
- With LAN/server down, do **not** silently promise multi-cashier stock consistency. Enter clearly labeled degraded mode and block unsafe transactions until a separately tested emergency checkout design exists.
- Keep locked Home 12x4 files byte-for-byte unchanged. PC-first Sorani RTL; English digits.
- Never change production Supabase, PC Relay or legacy cashier databases during the migration.

## Current baseline (main, inspected 2026-10-28)
- `operations.js`: direct `db.rpc`, `db.from`, online login and remote data access; checkout, stock, shifts and returns currently routed through remote calls.
- `workspace.js`: `retail_catalog_page_v18` RPC + hosted table fallbacks for products/barcodes/stock.
- `server.mjs`: Node HTTP static server and JSON snapshot/backup functionality; does not by itself make remote RPC checkout offline.
- `package.json`: Node test runner `node --test tests/*.test.mjs`.

## Migration order
1. Inventory all remote dependencies and establish offline contract tests. Freeze locked home SHA checks.
2. Add local PostgreSQL schema and deterministic, idempotent migrations in isolated test environment: stores, users/password hashes/roles, catalog, barcode aliases, packs, price versions, stock ledger, shifts, sales, receipts, refunds, debt, audit and transactional outbox.
3. Add local POS API implementing atomic checkout (sale, sale lines, stock ledger, receipt sequence, outbox event in one DB transaction), idempotency key and authenticated local session.
4. Define data-access port for existing UI; switch operations and workspace from remote DB client to local API without altering visuals. Remove remote login dependency and remote font/library imports from core UI.
5. Test multi-cashier concurrent checkout and last-item contention; check role enforcement, data integrity, printer offline and crash recovery.
6. Add optional outbound sync worker that never blocks local commits; retry and deduplicate using event ID.
7. Restore testing from independent backup, WAN-disconnected soak test, rollback plan and staged pilot.

## Acceptance test gate (must pass before calling it FULL OFFLINE)
- On a freshly provisioned local server, turn off external WAN and DNS. Keep LAN active; reload all pages and reboot clients.
- Complete end-to-end cash sale, unit/carton, scale barcode, refund, products/prices, receiving and stock adjustment, shifts, debt, and all required reports using local authorization.
- Concurrent cashier tests including last unit: no negative stock and no double spend; failures roll back cleanly.
- Pull power during synthetic checkout; reopen: committed receipt appears exactly once; uncommitted transaction leaves zero effect.
- Repeated submit/timeout/retry uses stable idempotency key; no duplicate receipt.
- Prints work with WAN absent; resources and dependencies bundled locally.
- After WAN resumes, outbox catches up without changing local confirmed sales; owner can see sync lag.
- Automated checksum and restore verification for independent, encrypted backups.

## Architecture decision
Local server: PostgreSQL + POS API + durable outbox + audited backup.
Client: browser UI served from local HTTP origin, with permitted local auth.
Remote: Supabase subscriber, asynchronous only. No remote call in critical transaction path.

## Blocking migration concerns
Existing hosted Supabase RPCs cannot simply be "cached" or replaced with a service worker. Business logic and authority must be migrated to local Postgres/API. A JSON snapshot is not a transactional substitute for a local database.
