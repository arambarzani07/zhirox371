# ZHIROX V84 — Isolated test-market returned goods, not real cash refunds

**Scope:** Test-only «مارکێتی تاقیکردنەوە» PostgreSQL 16. This
does not enable production refunds, cashier money handling, real bank reversal,
credit-note settlement, or deployment on zhirox.com.

## Database and financial correctness

`offline/migrations/030_sale_returns_v84.sql` creates an append-only,
tenant-scoped `sale_returns_v84` journal. Each return references the exact
original sale and line, with a manager/owner actor and immutable request UUID.

`record_sale_return_v84`:
- Locks the original sale with `FOR UPDATE` to serialize overlapping partial
  returns and prevent cumulative returned quantity exceeding purchased quantity.
- Obtains the price from the original sale-line snapshot, not the current
  catalog or client-supplied claimed refund.
- Uses a unique request ID for idempotent replay; rejects reused IDs with
  different actor, line, quantity, restock status or reason.
- Optionally puts only a *physically verified restockable* return back into
  `products.stock_base_units`, atomically with the append-only journal.
- Leaves damaged/non-restockable returned product OUT of inventory.
- Never changes the historical `sales`, `sale_lines`, `cash_movements`,
  bank settlement, cash drawer, or payment journal. The recorded return value
  is **an accounting estimate only**: it does not prove any cash was paid out.

The production cashier browser has no direct SQL grant and no HTTP write
endpoint for refunds. No real-store production database changes are made.

## Persistent synthetic PostgreSQL test transactions

The disposable CI test store has the genuine V80+V83 SQL trial history:
2 sales totaling **11,000 IQD**, a supplier order received in stock, plus
a manager-recorded return on receipt #1:
- **1 water** returned and restocked at original sale-line price 2,500 IQD;
  test inventory for water increases from 28 to 29.
- **1 damaged sugar** returned, NOT restocked, valued at original sale
  price 3,000 IQD; test inventory for sugar remains 20.
- Total accounting face value of two returns is **5,500 IQD**.
- Original two sales remain 11,000 IQD (gross). No real cash refund was made.

The test data is genuine SQL record history with **synthetic commercial
figures**; never characterize it as actual customer reimbursements.

## PC and access

`کاشێر و فرۆشتن → گەڕاندنەوە` now displays the actual immutable
return journal for owner/manager only, including original receipt number,
item name, quantity, recorded face value, whether restocked, and reason.
`کۆگا → هاتووچۆ` includes the returned **restocked** item as incoming
stock, alongside earlier sales and supplier receiving.

The full-screen Sorani RTL PC still has 12 modules and 48 distinct subpages:
**27 read-only SQL-backed**, **21 explicitly unimplemented**.
This is *not 27 completed production business features*.

## Tests and retention

- `offline/tests/039_v84_return_fixture.sql`: creates genuine committed
  returns in the ephemeral isolated PostgreSQL database.
- `offline/tests/040_v84_returns_acceptance.sql`: rolls back attempted
  invalid returns, cashier writes, excess returns, altered retries and
  immutable-journal edits, and re-checks original sale totals.
- `offline/tests/returns-v84-contract.test.mjs` validates the financial
  non-mutation contract and manager-only server-side queries.
- The real Chromium PC CI tests navigate all 48 sections, validate returned
  items and restored/unchanged quantities, and capture original screenshots.
- A fresh `pg_dump -Fc` test-market snapshot is archived with GitHub Actions
  retention of **30 days**. It is NOT a continuously running database.

No deletion is performed or scheduled. Retire the test market and sample
records only after explicit later user authorization and verified backup.
