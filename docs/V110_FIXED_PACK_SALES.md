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

## V110 server-owned pack catalog (disposable only)
`offline/migrations/045_fixed_pack_catalog_v110_disposable.sql` adds a **separate, versioned and idempotent** owner/manager catalog registration transaction:
- Enforces active local user role, session version, store ownership, product version and one-SKU unit base stock.
- Atomically replaces one fixed-pack configuration, retires old primary/alias codes without deleting historical definitions, and forbids reuse of previously allocated barcodes across products or sale modes.
- Persists a store-scoped registration audit keyed by request UUID.
- Uses the same PostgreSQL store-row lock as the isolated checkout to avoid races.

`offline/fixed-pack-catalog-server-v110.mjs` exposes a separately opted-in, loopback-only POST endpoint (`/api/local/v110/fixed-pack`) and is disabled by default. Startup also checks the exact disposable database name. Its owner token must be freshly authorized; cashier, stale-session, malformed request and duplicate barcode submissions fail closed. Tests include API contract and a SQL registration → scan/checkout round trip.

The existing React ProductCatalogView still uses LocalStorage. **No live React catalog registration is wired to this pilot endpoint.** The server is a standalone isolated proof of the new catalog ownership contract.

## V110 extended checkout coverage
- `offline/tests/054_v110_durable_packs.sql`: durable intent, different-cashier rejection, stale quote cancellation, replay without duplicate cash/stock and fresh retry.
- `offline/tests/055_v110_pack_concurrency_seed.sql` and `056_v110_pack_concurrency_verify.sql`: two separate PostgreSQL connections attempt overlapping fixed-pack stock; exactly one commits.
- `tests/browser/v110_fixed_pack_sale.mjs`: real Chromium PC browser scans fixed-pack codes and aliases, checks inventory and DEMO receipt without modifying the locked 12-card Home.

## Remaining requirements for *official* multi-cashier release
1. Integrate the isolated server registration contract into the *production-authorized* catalog workflow with approved migrations, roles, audit and a synchronized React client; React's LocalStorage catalog is **not** the PostgreSQL catalog.
2. Port and verify bundle/set semantics through the current restricted/actor-proof, V90 FEFO lot and V97 atomic checkout route. V110 pilot extends legacy V26 only; it does not bypass the V63 deprecation gate or enable an official cash write route.
3. Conduct simultaneous cashier tests including lot expiry, rollback/restart, stale price, pack return and thermal printer. Obtain market acceptance before any database migration or main production activation.

**Operational rule:** Do not run the V110 SQL on market databases, Supabase, live LAN servers or the unrelated ZHIROX NEW Windows test system. Preserve all locked Home/Style A UI files and actual market data.
