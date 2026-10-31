# ZHIROX V81 — Isolated Test Market: Actual PG-Backed PC Read-Only Viewer

## Status

Test-only local Windows PC proof. The screen and HTTP routes read **real persisted
SQL data** from the dedicated PostgreSQL store created by V80. This does NOT
constitute a certified cashier, a public website login, an installed Windows
service or completed 48-section integration. V81 never alters live stores.

### Browser UI

- Store title: **مارکێتی تاقیکردنەوە** — not Kani Chnar.
- Authenticated owner and cashier login, with no demo/localStorage fallback.
- Two PC-width horizontal navigation ribbons and English numeric glyphs, Sorani RTL.
- Owner: totals, active products, receipts, customers and each customer's
  immutable debt journal.
- Cashier: own receipts and products; no access to customer/debt data.
- No sale, debt repayment, cash drawer, refund or destructive action is possible.
  Repayment shown is *accounting-only*, not verified cash/bank settlement.
- Authentication token is memory-only and discarded on sign-out or reload.

### Developer-only local run (not production)

1. Start/recover the **dedicated single-store** PG16 database named
   `zhirox_test_market` on local loopback, using
   `docs/V80_TEST_MARKET.md`.
2. Restore the V80 archive if needed; use the V80 guarded reset helper to
   set private owner and cashier passwords (not printed or source committed).
3. Install Node dependencies for local test with `npm install --no-save pg`.
4. Export `ZHIROX_LOCAL_DB_URL` pointing exclusively to
   `postgresql://...@127.0.0.1/.../zhirox_test_market`.
   Export a random private `ZHIROX_LOCAL_SESSION_SECRET` of 32+ bytes.
   Export `ZHIROX_V81_TEST_MARKET=YES_LOCAL_TEST_READ_ONLY`.
5. Run `node offline/local-test-market-v81.mjs` on loopback 3311.
6. In another terminal export `VITE_ENABLE_LOCAL_PILOT=true` and
   `VITE_V81_TEST_MARKET=true`, then `npm run dev`.
   Visit http://127.0.0.1:3000 and enter only the V80 private test credentials.
7. No WAN access is required. The normal demo and isolated V36 Windows
   cashier bundles remain separate and unchanged.

The server checks the database's actual name and that exactly the known V80
test store exists before accepting every request; it verifies a signed,
non-revoked local session and obtains the store/actor only from authentication.
It uses a fixed loopback port, rejects all financial mutation endpoints, sends
no credentials to the browser bundle, and fails closed on unavailable PG.

### Actual CI acceptance

`.github/workflows/v81-test-market-pc.yml` creates a PostgreSQL 16
ephemeral test DB, runs the actual V80 fixture with hashed account passwords,
authenticates both accounts, starts real API and Vite, and captures genuine
1920×1080 Chromium screenshots after querying the PG database. It also
verifies that the cashier is denied access to debtor records.

### Blockers before a real market release

- Complete LAN TLS/device enrollment, least-privilege DB roles and
  transaction-proofed sales/refunds/printing in an authenticated server.
- Wire the remaining 48 submodule domain APIs. Do not conflate the Demo
  UI with the separate V80/V81 test market.
- Add real debt collection integration with signed cash journal and
  idempotent financial proof (V79 repayment is accounting-only).
- Run physical Windows multi-cashier, printer, power-loss and backup-restore
  acceptance against an authorized nonproduction environment.
- Do not delete test store or its archive without separate explicit consent.
