# V14 — Product-owned barcodes, unit/carton prices (QA only)

## Product architecture
**Products (کاڵاکان)** owns every product definition, SKU/PLU, unit barcode, additional barcodes, carton barcode, carton size, unit and carton purchase costs, and unit and carton sales prices.

The **cashier** only reads registered barcodes. It does not create, modify, or relabel product barcodes or prices. The existing production checkout RPC is strictly unit-only and calculates charge from `retail_products.price_minor`; the cashier already rejects barcodes with `unit_type != unit` or `units_per_scan != 1`. Do not lift this safety block before the backend supports server-calculated carton prices/quantities.

## Implemented on GitHub working branch
- `workspace.html` — single Sorani RTL product entry form with name, SKU, PLU, unit barcode, multiple unit aliases, unit cost/sale price, carton name/barcode/units per carton/carton cost/carton sale price.
- `product-catalog.js` — field normalization, type and range validation, duplicate-barcode detection, ownership and safe IQD payload.
- `workspace.js` — legacy single barcode/price submission retains its existing RPC. Advanced registration uses a distinct `retail_register_product_v14` atomic RPC **only if available**; missing function returns a real error **without writing a partial product**.
- `tests/browser/qa_supabase_fixture.js` and `tests/browser/v14_product_catalog.mjs` — browser-only QA with full form, blocked duplicate/carton validation, mock complete atomic registration, alternate barcode list search, and explicit missing-RPC failure without fallback.
- `tests/v14_product_catalog.test.mjs` — static pure normalization and cashier/Products separation.
- `tests/v14/local_product_registration.sql` — disposable local Supabase Postgres only: RLS-protected carton table, product purchase cost/SKU/PLU and atomic owner-only RPC with product + 4 codes + carton configuration saved together.
- `tests/v12/auth_rls_e2e.mjs` — real local Auth/JWT/RLS tests of owner registration, cost-price retention, manager/cashier prohibition, duplicate rollback, carton price security.
- CI runs all of these against a disposable Supabase stack. No production migration.

## Important release boundary
This change is NOT authorization to migrate a real Supabase project. A real hosted database will not yet have `retail_register_product_v14`; advanced form registration is blocked and shows an actionable error, rather than silently dropping purchase costs or carton fields. The basic single-unit workflow remains usable on the existing contract. The carton scan/checkout remains disabled because the production checkout uses unit-only pricing and quantities; allowing it would risk inaccurate cash receipts and stock accounting.

Pre-existing hosted `TRUNCATE` privilege security gate from V12/V13 remains unresolved. Production Supabase, PC Relay and legacy POS were not mutated. All design locks remain: fixed 12 main cards, 48 subcards, high contrast, no extra instructional UI copy.
