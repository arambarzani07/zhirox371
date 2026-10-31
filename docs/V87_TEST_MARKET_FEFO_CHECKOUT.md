# ZHIROX V87 — Isolated test FEFO cash checkout with verifiable LOT allocation

## Scope and operational release boundary

**Only** the disposable PostgreSQL test market `مارکێتی تاقیکردنەوە`.
V87 does not modify the existing cashier's `checkout_cash_v1`, does not
install software on store PCs, and creates NO public financial POST endpoint.
Supabase, production data, Kani Chnar, PC Relay, physical cash, bank and
actual debt collection are unchanged.

## New transactional pathway (test-only)

`offline/migrations/033_fefo_checkout_v87.sql` adds:

- `lot_checkouts_v87`: uniquely identifies new V87-originated checkout
  sales, actor and request UUID.
- `lot_sale_allocations_v87`: immutable per-sale-line, per-LOT allocation
  quantities, tied by store-local FKs to actual V1 sale lines and V86 lots.
- `checkout_fefo_test_v87(store,actor,request,lines)`: **SQL-only**
  integration test checkout with a store-level lock. It checks signed-in
  local-user table state, strict line shape, quantity bounds and idempotency,
  then calls the existing `checkout_cash_v1` for the actual SQL receipt,
  sequential receipt number, product-stock decrement and outbox event.
  **In the same PostgreSQL transaction**, it allocates units FEFO (earliest
  expiry first) from non-expired recorded V86 lots and records every
  selected lot. If any allocation fails, the function raises a custom error
  and **all** V1 financial, inventory, receipt-counter and outbox changes
  are rolled back together. Same request and actor replays only once;
  altered requests or legacy V1 sale collisions are rejected.

There are NO browser-visible write APIs. This is a successful transactional
isolated SQL exercise, not a finished production barcode scanner.

## Actual committed SQL fixture (synthetic customer/business values)

Against the disposable, single-store CI DB after V80–V86 fixtures, V87
registers one additional cash sale on receipt **#3**:

- **3 units water** allocated to `TEST-SOON-002`, no units to
  `TEST-EXP-001` because it expired.
- **2 units sugar** allocated to `TEST-SAFE-003`.
- Historical sale-line prices: 3×2,500 + 2×3,000 = **13,500 IQD**.
- The new aggregate trial sales figure becomes **24,500 IQD**.
- Global base-unit product stock becomes **26 water** and **18 sugar**.
- Test LOT allocations: water expiring lot has tracked V87 remainder
  **1**; sugar lot has tracked V87 remainder **2**; expired water lot
  still has **2 units originally received** but no V87 allocation.
- The PostgreSQL transaction includes the third sale's outbox event.
  Duplicate checkout request confirms the same receipt without double write.

Negative PostgreSQL tests reject:
- requests for two more waters when the only available nonexpired tracked
  water lot has one unit; expired water cannot be selected;
- requests for three sugars when V87 tracked sugar remainder is two;
- changed idempotency replay, invalid/unauthorized actor, zero quantity,
  client-supplied price, and mutation/deletion of the allocation journal;
- failed checkout's stock/receipt/outbox side effects (atomic rollback).

## Critical limitation: NOT full physical LOT stock or production expiry blocking

V80–V86 historical checkouts, returns and receipts were NOT assigned to
specific lots. Global product stock and V87's remaining tracked LOT
quantities therefore **cannot be reconciled into a verified physical
per-LOT balance**. The unchanged legacy `checkout_cash_v1` remains
available and does not independently block expired stock. V87 only
rejects expired and insufficient lots when explicitly invoked through the
new **test-only** SQL function. A full production rollout needs mandatory
lot-aware checkout, verified legacy stock opening balances, batch-aware
returns, validated receiving, operator corrections/quarantine with audit,
and concurrent multi-cashier acceptance before enabling blocking.

The read-only Sorani `کۆگا ← بەسەرچوون` screen displays received,
V87-allocated, and `received - allocated_v87` as **tracked test balance**
distinct from actual physical stock. All 48 screens remain; 32 are linked
to read-only SQL; the other 16 show honest planned states.

## Verification, backups and retention

CI runs `045_v87_fefo_fixture.sql` and `046_v87_fefo_acceptance.sql`,
the Node V87 contract suite, and full-PC Chromium tests validating
24,500 IQD trial gross sales, current product stock, tracked lot totals,
historical cashier permissions and the unchanged offline-only boundary.
A custom-format PostgreSQL snapshot is archived for **30 days** in GitHub
Actions. It is NOT a long-running persistent database; restore to a
dedicated isolated local database as needed, with fresh credentials.

Do not delete the test market or any sample data/backup without a later
explicit instruction.
