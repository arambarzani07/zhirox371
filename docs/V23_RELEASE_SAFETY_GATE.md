# V23 — React preview and offline safety gate (2026-10-30)

## What has actually been verified

The React cashier in `src/context/AppContext.tsx` is a browser-local preview. Product, receipt, customer, stock, shift and audit state is seeded from `initialData.ts` or browser `LocalStorage`, then mutated in React state. Its `completeCheckout` is not the authenticated LAN/PostgreSQL transactional checkout from `offline/`. Generated receipt IDs therefore use `DEMO-RCP-...`, and the cashier and printable receipt visibly say **تاقیکردنەوە**.

The legacy `config.js` contained an unauthenticated offline Supabase emulator, fake default owner, and an automatic sync attempt to `/api/sync`. It MUST NOT replace real Supabase or schedule outbound synchronization on arbitrary origins. It now runs ONLY on an explicitly marked disposable preview with `window.RETAIL_DEMO_MODE === true`. `offlineFirst` now reflects this demo-only switch, NOT a claim that production LAN POS is ready.

The current React `index.html` does not import `config.js`. React preview mode is independently browser-local, irrespective of this legacy toggle. The V1–V5 local PostgreSQL API in `offline/` remains a separate, loopback-only isolated pilot, not wired to the React cashier. No authenticated `/api/sync` endpoint or PC disk backup implementation is verified for the React build.

## Required before cashier deployment (blocking)

1. Authenticated, store-scoped local LAN API and real PostgreSQL transactional checkout; server derives cashier/store from an authenticated session.
2. Replace client-only React `completeCheckout`, price, inventory, shifts and receipts with verified server-side RPC/API calls; retain the server's idempotency keys and atomic stock deductions.
3. Implement a durable, authenticated outbox in local PostgreSQL; cloud sync must be asynchronous, idempotent, recoverable, and must NEVER block checkout.
4. Eliminate fake default owner/passwordless sign-in from operational mode. Do not trust the `LocalStorage` / simulated auth for permission checks.
5. Install and validate printer, scanner, independent local backups and restore drills on Windows/PC; perform outage and multi-cashier concurrency testing.
6. Restore or separately approve the React Home design against the owner-locked original, then implement an automated pixel and DOM regression check for the 12×4 structure.

This change does **not** modify production Supabase, install migrations, create server secrets, change PC Relay, or certify production use. No actual sales, returns, stock or debts should be entered in the preview.
