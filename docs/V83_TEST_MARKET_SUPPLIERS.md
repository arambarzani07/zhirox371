# ZHIROX V83 — Test-only suppliers, purchase orders and atomic receiving

This phase continues the 12×4 Sorani RTL PC layout for the isolated
**«مارکێتی تاقیکردنەوە»** test market, not the active Kani Chnar database.

## Real local PostgreSQL changes

The new test-only migration `offline/migrations/029_supplier_receiving_v83.sql`
creates five typed, store-scoped tables:
`suppliers_v83`, `purchase_orders_v83`,
`purchase_order_lines_v83`, `goods_receipts_v83`,
and `goods_receipt_lines_v83`.

There are three isolated manager/owner-only functions: register a supplier,
place an idempotent purchase order with up to 50 distinct products,
and receive an order **exactly once**. Receiving updates real
`products.stock_base_units` atomically, with quantity bounds and
immutable receipt+receipt-line journal. Duplicates, changed-request replays,
over-receipts, cashier writes, missing products and cross-store entities
are explicitly rejected. The purchase amount is a recorded purchase COST,
not supplier debt, settlement, payment or verified money movement.

## Actual persistent synthetic fixture

The CI database `zhirox_v80_disposable` is only a disposable PostgreSQL 16
instance. After V80 provisions a test market, the V83 fixture:
- registers `دابینکەری نموونەی تاقیکردنەوە`;
- places and receives an order for 6 waters at IQD 1,900 and 4 sugars at
  IQD 2,200, total recorded purchase cost **IQD 20,200**;
- records one additional unreceived order for 3 sugars at IQD 2,200,
  cost **IQD 6,600**, without incrementing inventory;
- verifies a retry cannot duplicate stock, giving 28 water units and
  20 sugar units remaining. The existing two cash test sales remain **IQD
  11,000**. The customer's test accounting debt remains IQD 10,000.

A new test-only custom-format `pg_dump` snapshot is archived as a GitHub
Actions artifact, with **30-day retention**, not an always-running DB.
For longer-lived use the operator must restore it into a **dedicated, empty**
local `zhirox_test_market` and reset the ephemeral credentials. None of
this auto-uploads any data to Supabase or production.

## Four newly connected submodules

Every one of these opens its own authenticated PostgreSQL read-only page:
- `دابینکەران` / `supplier-building`: real supplier list.
- `داواکاری` / `purchase-order`: real orders and purchase costs.
- `وەرگرتنی کاڵا` / `receive-goods`: receipt lines and quantities.
- `حسابەکان` / `supplier-accounts`: supplier ORDER commitments only,
  **not** settled accounts payable or actual supplier balances.

`کۆگا ← هاتووچۆ` now shows both sale deductions and supplier receipts
as typed stock changes. Financial purchasing writes remain **SQL-test-only**,
never exposed through an HTTP write route or connected to the live cashier.
Cost information and supplier accounts are manager-only.

**V83 navigation maturity:** 26 of 48 pages read authenticated PostgreSQL;
22 remain intentionally labeled unimplemented, with no fabricated values.

## Verification and non-deletion

`offline/tests/037_v83_supplier_test_fixture.sql` persists the synthetic
fixture into the isolated test DB. The transactional rollback test
`038_v83_supplier_acceptance.sql` proves idempotence and accounting
safety. Node permission tests and real Chromium PC tests inspect all four
pages, read actual SQL rows, and check cashier access denial.

Production, zhirox.com, PC Relay, Supabase, real debtors and Windows
release are unchanged. **No deletion is authorized**. The actual
test-market account and saved snapshots must be retained until a later
explicit instruction.
