# ZHIROX V88 — guarded opening inventory and FEFO laboratory cutover

This is an **isolated, disposable PostgreSQL test-market exercise**, not an
official POS build, physical stock count, security-certified sales gateway, or
deployment to «سوپەرمارکێتی کانی چنار». All amounts and counted quantities
in GitHub CI are **synthetic trial data persisted in genuine PostgreSQL**.

## Motivation

The historical V80/V87 sales and returns were not consistently assigned
to actual LOTs. V87 tracked a new transaction's allocations but could not
claim real physical per-LOT remaining stock, and the older V1 checkout,
V84 restock, and V83 receipt routes could still bypass lot accounting.

## V88 test-only PostgreSQL design

`offline/migrations/034_lot_cutover_v88.sql` adds:

- `opening_lot_counts_v88`: immutable, manager-asserted starting count
  per product/LOT/expiry. These numbers are NOT automatically proven
  physical unless independently counted by a real operator.
- `lot_cutovers_v88`: one-way, opt-in, test-store activation. Activation
  demands exactly one named test store in an allowlisted local database;
  every active product's sum of opening LOT counts MUST exactly match
  its existing global `stock_base_units`, including zero-stock products.
  Inactive products with positive stock block activation.
- `lot_checkouts_v88` and `lot_sale_allocations_v88`: immutable
  financial reference and FEFO per-line allocations for post-cutover
  test-only checkouts.
- In an **activated test store only**, SQL INSERT guards refuse newly
  created legacy V1/V87 sales, V84 returns, V83 goods receipts and V86
  lot registrations that could desynchronize the opening balances.
  The opt-in V88 FEFO function writes the existing V1 sale, product
  stock, sequential receipt and outbox and then allocates the
  nonexpired counted opening LOTs in the **same ACID transaction**.
  A failed allocation aborts every effect. Same actor/request/payload
  returns the original sale without duplication; changed replays fail.
- For an unactivated test store, old migrations are unchanged.

**Important security limitation:** The SQL routing interlock relies on
a PostgreSQL transaction-local custom GUC during the nested V1 checkout.
A privileged database connection can spoof that value, change database
ownership state or directly manipulate stock. It is NOT a secure
production enforcement mechanism. The browser and V81 API remain
read-only; there is no newly exposed financial POST endpoint.
V88 does **not** certify all POS routes or cash/card refund settlement.

A production-grade solution still needs least-privilege app roles,
enforced API authorization, immutable schema-level audit, mandatory
lot-aware receiving and returns, and independent physical stock
reconciliation, including concurrency/power-loss/multi-cashier tests.

## Real CI operations with synthetic data

After V80–V87 fixtures, global test inventory is 26 water and 18 sugar.
The fixture creates manager-asserted starting counts:
- Expired water LOT `TEST-EXP-001`: 2 units (not saleable by V88).
- Near-expiry water `TEST-SOON-002`: 1 unit.
- Future water `TEST-FUTURE-004`: 23 units.
- Future sugar `TEST-SAFE-003`: 18 units.

A deliberately incomplete opening count **fails activation**.
The complete 26+18 counts then activate the **test-only** FEFO mode.
V88 cash test receipt **#4** sells 2 water (1 from the near LOT and
1 from the future LOT) plus 1 sugar. This adds **8,000 IQD** in trial
sales, raising cumulative synthetic gross sales to **32,500 IQD**,
and global stock becomes 24 water / 17 sugar. Earlier receipts,
debts, returns, and supplier receiving records remain intact.

V88 acceptance verifies old sale/return/receiving routes cannot
create new transactions after test cutover, expired LOTs are skipped,
over-allocation fails with full SQL rollback, altered replay and
unauthorized actors are rejected, audit tables remain immutable and
no failed transaction mutates receipts, outbox or global stock.

## PC display

`کۆگا → بەسەرچوون` now detects whether this isolated store has
activated the V88 cutover. If so, it shows operator-asserted initial
quantities, allocations tied to genuine V88 SQL test sales, and
remaining **V88 trial tracked balance**. These are *not* confirmed
physical quantities in a real supermarket. Previously registered
V86 receipts remain unchanged as historical data.
The full desktop Sorani RTL 12×4 navigation stays intact; there
are still 32 read-only SQL-backed and 16 unimplemented submodules.

## No deletion and retention

CI saves a restorable custom-format `pg_dump` of the synthetic
single-store trial PostgreSQL DB, with 30-day GitHub Actions retention.
CI databases terminate when jobs end; they are **not persistent
production instances**. The assistant does not delete the user's
test-market backups or existing data. No GitHub branches are pruned
or production database migrations authorized by this work.
