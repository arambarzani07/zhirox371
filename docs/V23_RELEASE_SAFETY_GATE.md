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

## Regression suites — no silent waiver

After the October 29 React/Vite rewrite, the old `pc-foundation.yml` ran 89 tests, with **50 failing**, mostly because it expected removed `operations.js`, `operations.html`, `qa.html` and older data APIs. It does not test today's React application, and the obsolete source must **not** be recreated just to satisfy the checks.

The historical full suite and its PostgreSQL, browser and RLS jobs remain intact as the **manual** `Legacy V20 PC regression` workflow, with all four jobs checking out the immutable pre-React SHA `44ef8f2a246787b1682c748509977c1591b7b1ab`. Its results describe ONLY the historic V20 source, never the current React POS. No obsolete test is deleted or silently considered passing.

The applicable React safety gate is now automatic: `v23-react-preview-safety.yml` typechecks and builds React, runs fail-closed/mock and receipt-marking unit tests, then uses actual headless Chromium on the current branch to verify 12 Home modules, a four-subcard drawer, offline browser **demo** barcode scan, demo checkout and the printable non-fiscal watermark. The `offline-foundation.yml` continues to test the separate local PostgreSQL V1–V5 pilot when its files change.

**Remaining blockers**: full feature parity of old POS and React, a production-ready authenticated LAN database/API and real fiscal checkout, mandatory offline durability and cloud sync, cross-cashier concurrency, Windows/thermal printer and live-store acceptance checks. A passing preview CI does not certify those.
