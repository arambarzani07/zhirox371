# V110 — Fixed single-SKU bundle/set checkout

Status: **Browser DEMO implemented; isolated PostgreSQL pilot implemented; NOT APPROVED FOR PRODUCTION.**

## Sale model
Each registered `bundle` (دەستە) or `set` (سێت) represents a **fixed positive integer quantity of ONE underlying SKU**. This is not a mixed-product kit/BOM. Primary and alias barcodes resolve the same pack and price. Store stock is always held in base units; 2 bundles with 6 units remove 12 base units. Cartons, loose units, bundles and sets all share the same stock constraint.

## Browser React DEMO
- ProductCatalogView registers one bundle and/or one set per product, with independent pack price, count, name and aliases (up to 30). KG products and carton-only products reject these packs.
- CashierPos scans pack aliases, exposes pack search actions, tracks package mode in the basket, prints mode and base-unit count in DEMO-RCP receipt.
- Checkout validates the *current* catalog price/count/barcode, cumulative stock, line bounds and integer totals, blocking stale or corrupted cart snapshots. Repeated same-tab clicks cannot create duplicate demo receipts.
- Browser refunds verify original receipt mode, quantity and price; when eligible they restock `units_per_pack * refunded_packs`, not one piece.

**Never mistake this React path for fiscal sales**: it writes to LocalStorage, has no cross-terminal atomicity and produces DEMO-RCP only.

## Isolated PostgreSQL pilot
`offline/migrations/044_fixed_packs_v110_disposable.sql` is guarded to run only in a database named `zhirox_v110_packs_disposable`. It extends the earlier V26 barcode schema to bundle/set modes with per-code `display_name`, independent `sale_price_minor` and `quantity_base_units`. Checkout reuses V26 store-row serialization, aggregated stock validation, server-priced total comparison, sale/receipt/stock ledger/outbox in one transaction, and request UUID replay behavior. The scanner continues to support pre-V110 schemas without referring to a missing column.

`offline/tests/053_v110_fixed_packs_checkout.sql` exercises mixed unit/carton/bundle/set, alias codes, price drift rollback, receipt names, cumulative base units, replay, oversell rejection and no partial side effects. The CI job creates its own disposable PostgreSQL service; no production database is connected.

## Remaining requirements for *official* multi-cashier release
1. Integrate product registration with authenticated server-side catalog ownership and unique-code transactions; React's LocalStorage catalog is **not** the PostgreSQL catalog.
2. Port and verify bundle/set semantics through the current restricted/actor-proof, V90 FEFO lot and V97 atomic checkout route. V110 pilot extends legacy V26 only; it does not bypass the V63 deprecation gate or enable an official cash write route.
3. Conduct simultaneous cashier tests including lot expiry, rollback/restart, stale price, pack return and thermal printer. Obtain market acceptance before any database migration or main production activation.

**Operational rule:** Do not run the V110 SQL on market databases, Supabase, live LAN servers or the unrelated ZHIROX NEW Windows test system. Preserve all locked Home/Style A UI files and actual market data.
