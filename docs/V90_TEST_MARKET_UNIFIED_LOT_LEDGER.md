# ZHIROX V90 — unified FEFO lot accounting in isolated test PostgreSQL

## Scope: nonproduction testing only
The change runs solely in the disposable, single-store `zhirox_v80_disposable`
database for «مارکێتی تاقیکردنەوە». The existing real market, Supabase,
remote website, Windows cashier and PC Relay are not modified.
No browser checkout/refund write endpoint is exposed. Database administrators
can still bypass the GUC-based test guard, so this is **not** an audited
production financial-write boundary or certification of physical stock.

## One ledger for opening + received + restocked — with traceable outgoing sales

`offline/migrations/036_unified_lot_ledger_v90.sql` creates:
- `lot_inventory_v90` read-only PostgreSQL view that accurately computes
  **tracked test units** for each LOT from recorded V88 opening counts,
  V89 incoming supplier lots, V88+V90 sales, V89 original-lot returns and
  V90 returned units. This is not a verified real-store physical count.
- `lot_cutovers_v90`: isolated store-manager-only *opt-in* activation
  requiring all source LOT balances to reconcile exactly with global
  `products.stock_base_units`, including rejecting negative balances.
- `lot_checkouts_v90` and `lot_sale_allocations_v90`: immutable sale
  attribution, which can span both opening LOTs and a newly received
  V89 supplier LOT **within the same invoice**.
- `lot_returns_v90`: immutable, manager-only return attribution to
  the exact original allocation of a V90 sale, whether its source is an
  opening LOT or a supplier receipt line.
- `checkout_unified_fefo_v90`: uses original V1 checkout for receipt,
  original price snapshot, stock decrement and outbox, then allocates
  quantities FEFO across both sources in the same ACID transaction.
  Failed lot allocation rolls back sale, receipt, outbox and stock.
- `return_unified_lot_v90`: uses V84 original-sale return logic for
  face value and optional restock, then links the return to its exact
  V90 sale allocation. Damaged items are not restocked. **No actual cash,
  transfer or verified refund is paid.**
- `block_legacy_lot_mutations_v88` updated so *after V90 activation*
  legacy V1 and V88 sale routes are denied, while idempotent,
  manager-controlled V89 LOT receiving and prior V88 allocated returns
  remain available. This is a **spoofable PostgreSQL test GUC**, not a
  secure gateway and not a production enforcement solution.

The read-only Sorani RTL PC warehouse LOT screen now uses the unified view
only after the V90 opt-in, and the returns screen identifies both old and
new source LOTs. No redesign of 12×4 desktop navigation.

## PostgreSQL committed test transactions, synthetic financial values

Pre-V90: four cash trial sales = **32,500 IQD** gross, water stock 25,
sugar stock 20 (including the V89 received LOT and original returns).

V90 verifies exact global/source reconciliation, then creates **receipt #5**
with 1 water and 18 sugar units: 2,500 + 54,000 = **56,500 IQD**
(synthetic sale values). The 18 sugar units are attributed FEFO:
- 17 sugar from original opening `TEST-SAFE-003` (earlier expiration);
- **1 sugar from new received `SUGAR-NEW-89`** (later expiration).
- 1 water from the nonexpired opening LOT.
- No expired LOT is used.
A second request with the same ID, actor and lines replays once without
changing stock or receipt sequence. An altered request is rejected.
A manager then returns **1 sugar to the very same received LOT**,
restocking the inventory. It adds 3,000 IQD *face value* to the
immutable return journal; **zero physical cash is paid**.

Expected committed test database balances:
- **5** sales, gross **89,000 IQD**; 5 outbox sale events.
- Global base-unit stocks: water **24**, sugar **3**.
- Unified LOT totals: water **24**, sugar **3**.
- `SUGAR-NEW-89` tracked remaining **3** after 1 sold and 1 restocked.
- All recorded accounting-return face values total **11,000 IQD**,
  explicitly **not** real customer reimbursements.

## Acceptance, risks and next steps

`051_v90_unified_lot_fixture.sql`: committed test transactions.
`052_v90_unified_lot_acceptance.sql`: rollback-only negative cases,
including legacy checkout denial, expired-stock refusal with atomic rollback,
global stock rejection, changed replay, cashier refund denial, wrong or
excess LOT returns and immutable audit tests.

Node contract tests validate store scoping, permissions and honest UI.
Chromium checks the 48-page PC navigation, LOT view, receipts and returns.
CI provides a **30-day** custom-format PostgreSQL test snapshot, not an
always-on store database. Test store and data are NOT deleted.

**Remaining release NO-GO:** real-world stock count, robust least-privilege
API role (privileged SQL can spoof the GUC), lot-aware all POS/return
endpoints, payment flows, simultaneous multi-cashier concurrency and
abrupt outage/restore acceptance are not yet certified. No automatic
migration/deployment to production is authorized.
