# ZHIROX371 V92 — PostgreSQL restricted viewer, isolated test-market proof

**Release status: NO-GO. Isolated PostgreSQL CI evidence, not production cashier.**

V90/V91 verified FEFO lot sales and concurrent returns through the privileged
`v80test` database owner. However, an administrative connection can change
inventory and spoof the V88/V90 PostgreSQL custom GUC routing flag. That
flag is **not** an authorization boundary. V81's existing browser API is
read-only but currently uses an owner-level database connection.

## What V92 actually implements

`offline/migrations/037_v92_isolated_viewer_privilege_boundary.sql` only runs
when the current database, PostgreSQL administrator identity, exact
«مارکێتی تاقیکردنەوە» name, sole store UUID, activated V90 LOT engine, and
the seven committed V91 receipts match the disposable fixture.

It creates a **NOLOGIN**, no-inheritance, nonprivileged PostgreSQL role
`zhirox_v92_viewer` with **only SELECT permission on three security-barrier
views**, restricted to the fixed synthetic test-store UUID:

- `v92_stock_readonly`: product ID/name, price and counted/LOT tracked stock
- `v92_lots_readonly`: LOT codes, expiry and tracked non-physical balances
- `v92_receipts_readonly`: receipt number, amount and timestamp

No tables, functions, account password hashes, ledger writes, stock writes,
or transaction routing functions are granted. Existing SQL functions' public
EXECUTE defaults are revoked in this **disposable database only**.

## Actual independent PostgreSQL authentication test

`offline/tests/v92_real_pg_viewer_boundary.mjs` uses a randomly generated
32-byte secret, temporarily enables login for this test role, and opens a
**different authenticated PostgreSQL TCP connection**, not merely `SET ROLE`
from the administrator. The tests assert:

1. The viewer can read the three fixed-store views and sees the exact V91
   totals: 7 receipts, 98,000 IQD synthetic gross, sugar stock and unified
   LOT balance both equal 1 base unit.
2. The viewer cannot read underlying `products`, `sales`, `local_users`
   hashes or the return ledger, and cannot directly update stock, insert a
   forged sale, delete sales or create a schema table.
3. The viewer cannot assume the PostgreSQL administrator identity, execute
   `checkout_unified_fefo_v90`, or insert a forged sale even after setting
   the spoofable `zhirox.v88_fefo_route` transaction-local flag.
4. Rejected operations do not change the real committed **synthetic** test
   sale/receipt/outbox/stock state.
5. The test closes the login and returns the role to `NOLOGIN PASSWORD NULL`;
   CI then archives the isolated PostgreSQL snapshot with 30-day retention.

## What V92 does NOT claim

This is **proof of a read-only database role**, not an authenticated writable
cashier application. The existing V81 web API has **not been switched** to the
new role because its login handler reads/writes auth state and would need a
separate verified least-privilege authentication path. No trusted security
definer checkout executor or independently validated identity binding has
been granted to this viewer. The PostgreSQL administrative role still has
owner privileges and can bypass the test GUC guard.

Remaining release blockers include production-grade authenticated API
enforcement, scoped cashier/manager financial operations, verified physical
stock, multi-PC LAN/power outage testing, scanner/printer and safe rollback
evidence, and acceptance by the market operator.

No real store, Supabase, legacy SQL Server, PC Relay, Windows build, Vercel
site, locked PC Home design, customer data or existing test-market record
is modified or deleted by V92.
