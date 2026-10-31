# ZHIROX V89 — Isolated LOT-aware supplier receiving and original-sale returns

**Test-only**: `zhirox_v80_disposable` PostgreSQL 16 and the Sorani RTL PC
test-market workspace. This is not production-ready cashier, not real
physically counted stock, and not an official refund/payout workflow.

## Added durable PostgreSQL transactions

The additive `offline/migrations/035_lot_receiving_returns_v89.sql` adds
`lot_receipt_batches_v89`, `lot_receipt_lines_v89` and
`lot_returns_v89` with store/receipt/sale foreign keys, immutable
history, manager-only validation and unique request UUIDs.

**Supplier receiving:** `receive_order_lots_v89` checks every ordered
line, ensures one matching non-expired LOT per purchase line and consumes
the legacy V83 goods-receipt function inside ONE PostgreSQL transaction,
then atomically records exact LOT identity and expiry. Replay of the
same request/actor/payload returns the same receipt ID. Changing any
field, calling as a cashier, attempting to receive an already-received
order or mismatching quantity fails.

**Returned goods:** `return_opening_lot_v89` requires a genuine
V88 sale-line allocation to the exact opening LOT and ensures cumulative
returned quantity is no greater than the quantity originally sold from
that LOT. It invokes V84's immutable, original-price return accounting
and optional global stock restock in the same transaction, then records
the exact original LOT and audit actor. It does not pay out real money,
and does not automatically return a damaged item into stock.

The V88 test gate was extended with two distinct transaction-local
routing values for these wrappers; all unknown or missing values remain
fail-closed. The guard is deliberately a **lab interlock, NOT a secure
production security boundary**, because PostgreSQL privileged users
can spoof custom GUC values. We have NOT installed a least-privilege
financial-write service role or enabled HTTP checkout/refund APIs.

## Real PostgreSQL trial records with synthetic values

After prior V88 fixture (4 genuine SQL sales, total 32,500 IQD, global
stock 24 waters + 17 sugars):

- The previously open V83 purchase order for **3 sugars** receives
  exactly **3 units** into new LOT `SUGAR-NEW-89` (expires in 150
  days), global sugar stock becomes **20**.
- From receipt #4, exactly **1 water** from original opening LOT
  `TEST-FUTURE-004` is returned and restocked with its original
  purchase price snapshot **2,500 IQD**, global water stock **25**.
- The original 4 sale receipts remain **32,500 IQD** gross.
  Return face-value journal total (prior V84 examples + new V89)
  becomes **8,000 IQD**; that is **NOT paid-out cash**.
- Repeated identical actions never duplicate receipt or stock.
  Adversarial tests cover altered retry, wrong LOT, cashier writes,
  over-return, immutable journal updates/deletes and rollback safety.

The PC read-only supplier receiving and return screens now show LOT
codes, including historical entries with unknown LOT appropriately
marked. The expiry screen includes opening allocations, V89 restocks,
and newly received LOT identities, but explicitly distinguishes a
**tracked trial balance** from confirmed physical inventory.

## Material remaining limitation (NO-GO)

The existing V88 FEFO checkout only allocates original opening LOTs.
It **does not consume newly received V89 LOTs nor currently take V89
returns into its allocation availability**. This may block otherwise
saleable stock. DO NOT enable this as a production cashier pathway.
V90 should unify incoming LOTs, opening counts, returned goods and
outgoing FEFO allocations within one enforced server-side stock
accounting engine, followed by least-privilege roles and multi-cashier
concurrent testing.

## Tests, backup, non-deletion

Real PostgreSQL 16 fixture `049_v89_lot_receiving_return_fixture.sql`,
rollback-only negative test `050_v89_lot_receiving_returns_acceptance.sql`,
Node contract and Chromium full-PC checks run under GitHub CI.
Only if all pass are test snapshots archived in GitHub Actions
(custom format PostgreSQL, **30-day retention**).
Nothing is deployed to Supabase, zhirox.com, Windows or PC Relay.
No store, receipt, test file, market account or backup is deleted.
