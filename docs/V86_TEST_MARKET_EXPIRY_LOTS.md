# ZHIROX V86 — Receipt-linked expiry LOT tracking (isolated test market)

**Environment:** The disposable PostgreSQL 16 **«مارکێتی تاقیکردنەوە»**
only. No production Supabase, legacy POS, public endpoint, PC Relay,
physical cashier or shared live database was modified.

## What is implemented

`offline/migrations/032_expiry_lots_v86.sql` adds one typed,
store-scoped, immutable `expiry_lots_v86` table. Every batch references
an actual V83 supplier receipt line; the registration function:
- accepts a distinct idempotency UUID, supplier-receipt line,
  LOT code, expiration date and units assigned to that lot;
- holds a row lock on its receiving document to serialize concurrent
  registrations and reject allocation greater than the **original quantity
  received** for that exact receipt line;
- permits only locally authenticated **manager/owner** actor identities
  passed by a trusted server-side process. It grants no PUBLIC access;
- refuses changed replays, duplicate LOT codes on a receipt line,
  missing receipts and cashier writes, and disallows mutation of history;
- NEVER changes product stock, sales, payment, shifts, refunds or
  supplier payable totals.

The **کۆگا → بەسەرچوون** section is now a genuine read-only
PostgreSQL view with a selected horizontal subtab and Sorani status:
expired, within 30 days, or later. The API derives store ID from a
verified local session and denies cashier access.

## Critical accuracy boundary

The quantities shown for each LOT are the **registered quantities
originally received**, **not current unexpired units remaining**.
V80 checkout scans are product-based and do not assign sales or
returns to particular LOTs (FEFO/FIFO). The system therefore **cannot
claim accurate live per-LOT stock or automatically quarantine expired
stock**. This limitation is prominently shown in the screen and in
acceptance tests. Do not base real sale-blocking or write-offs on these
figures without implementing lot-aware inventory and transaction proofs.

## Real SQL fixtures, synthetic test goods

The disposable V80+V83+V84+V85 PostgreSQL test market registers
three **actual database records** for the V83 received inventory:
- water, 2 units: LOT `TEST-EXP-001`, expiration **3 days before
  the run date** (expired);
- water, 4 units: LOT `TEST-SOON-002`, expiration **12 days after
  run date** (near expiry);
- sugar, 4 units: LOT `TEST-SAFE-003`, expiration **90 days
  after run date** (later).

All 10 units match exactly the receipt's 6 water + 4 sugar units.
No new stock is added, and the previous sample cashier transactions
remain unchanged. The simulated cash and debt examples remain as
separate, unmodified historical records.

## Tests and safe persistence

- `043_v86_expiry_lot_fixture.sql`: committed real PG sample LOT rows.
- `044_v86_expiry_acceptance.sql`: rollback tests for changed
  idempotent requests, cashier denial, cumulative over-allocation,
  unknown receipts, immutable audit and unchanged inventory/sales.
- `expiry-v86-contract.test.mjs`: read-only UI tenancy, permission,
  wording and no stock-write contracts.
- GitHub Chromium tests exercise all **48** navigation pages and verify
  owner-only expiry display in full-screen Sorani PC.
- **32 pages** now read authentic isolated PostgreSQL records,
  **16 pages** remain explicitly marked unimplemented.
  Read-only access does not mean 32 end-to-end completed workflows.
- A PostgreSQL custom-format test snapshot is produced by CI and
  retained for 30 days; it is NOT a long-lived running database.

There is **NO automatic deletion** of the sample market, data or
backup. A dedicated restore and later separate explicit approval are
still required before any destructive operation.
