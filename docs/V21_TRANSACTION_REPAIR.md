# V21 transaction integrity repair candidate

This branch is a reviewable source change, not a hosted database deployment. The PC Home's five locked files are unchanged. Do not run this against a hosted database until actual schema/ACL preflight, backup and restore verification, and owner-approved maintenance are complete.

## Install contract

1. Existing Retail OS V8+ relational/Auth foundation is required. This is an upgrade, not a fresh Supabase project bootstrap.
2. Review and apply `db/v19_complete_production_upgrade.sql` as a single transaction. Its final region embeds the exact V21 integrity code, so no permissive intermediate upgrade state is committed.
3. Apply/record `supabase/migrations/20261028045514_transaction_integrity.sql` through the reviewed migration workflow; reapplying its already embedded repair is idempotent. Run `node scripts/sync-upgrade.mjs` after editing that migration, then rerun database tests.
4. Deploy the matching frontend only with both SQL changes. Old clients that directly write balances are intentionally rejected. Do not roll back only the frontend or only the SQL.
5. Inspect effective grants, policies and inherited privileges on the actual hosted database before approving release. Local fixtures cannot establish hosted schema parity.

## Delivered behavior

- Production SQL now installs in tests, includes paginated catalog/barcode RPCs and a cashier-compatible resolver, and removes impossible same-signature argument overloads.
- Cash refunds use the tested transactional cash movement + stock restoration + audit flow, with tenant authorization and replay guards.
- Customer checkout, debt and drawer offsets commit together. Credit checkout requires manager/owner and a positive customer limit. A changed replay payload is rejected, including after ambiguous network failure.
- Customer/supplier payments update the ledger and cash shift in one database transaction. Overpayments are rejected rather than silently clamped to zero.
- Purchase receiving commits stock, supplier ledger/debt, drawer/safe movement, cost and optional expiry/order state together. A failed payout rolls back the receipt's stock changes too.
- Customer/supplier creation and opening balances are atomic. Financial request UUIDs survive reload within the tab's session and are scoped to actor/store/action.
- Client ledger failures no longer fall back to direct writes or locally fabricate a successful ledger entry.
- Effective table TRUNCATE grants are revoked in the candidate, and direct ledger/balance writes and staff PIN reads are restricted. Existing PIN data is preserved but no longer loaded/exported by the app; PIN entry is disabled. Supabase Auth remains the login mechanism.
- JSON export is labeled as a snapshot of loaded data, not a full backup. Diagnostics extract the actual five-digit scale PLU.
- Dev server honors the preview port and rejects malformed URLs and source/dependency directories.

## Intentional release restrictions / remaining work

- Item-only returns are paused before any RPC: the old form did not link a return to an immutable sold line or enforce cumulative returned quantity.
- Credit receipt refunds fail atomically before committing cash/stock effects. Debt allocation/reconciliation needs a separately tested return flow.
- Historical financial local caches and nonfinancial prototype modules still need complete server-authoritative reconciliation. No offline sales promise is made.
- Reporting retains existing row limits and current/estimated cost fallback. It must not be used as a complete accounting report. Server-side period aggregation and historical cost snapshots remain a separate workstream.
- The loaded JSON snapshot does not replace database backups or a tested recovery procedure.
- This branch does not certify hosted RLS/Auth, inherited ACLs, real PostgREST function resolution, real simultaneous cashiers, or printer/scanner behavior. The SQL suite uses local PostgreSQL 17 via PGlite; the earlier CI suite separately tests PostgreSQL 16 concurrency.

## Verification

`npm ci`, `npm test`, `npm run test:database`, `npm run build`.
The database suite executes the **actual production artifact plus the actual integrity migration**, including repeat installation, failed-payment rollback, replay, cross-store denial, balances, full cash returns and kilogram snapshots. It is not an in-memory JavaScript approximation of financial logic.

`node scripts/build-preview.mjs` builds a single offline `preview.html` from all six actual PC pages and local assets, preserving every Home card and route. The Supabase fixture is injected **only into this generated preview**, and its CSP denies all connections. It demonstrates the UI, not production database connectivity. It never ships through actual app pages.
