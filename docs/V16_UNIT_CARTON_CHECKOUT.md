# V16 — One product, unit/carton/both

## Implementation
- Products -> New product: explicit Sorani RTL selling mode 'unit' / 'carton' / 'both'. The selected mode controls the form sections and validates required barcodes and independent IQD prices. Carton-only has no fake unit barcode and no unit sale price.
- Unit and carton aliases remain on ONE product ID; carton aliases share the same pack quantity and pack-specific purchase/sale price.
- Register V14 and update V15 QA-only RPCs accept sale_mode and reject contradictory definitions. The seller can change the mode using the existing audit/optimistic version path.
- Cashier scans both kinds of barcodes from the owner-approved product catalog. Each unit and carton receives the server-derived sale price; no costs are exposed by retail_scan_catalog_v16.
- Basket keeps two separate sale rows for unit and carton, even when both share the same product_id. Each line has a distinct price and qty.
- A carton of 12 subtracts 12 BASE UNITS from the one stock ledger; 2 cartons + 3 units subtract 27 BASE UNITS and charge 2 * 11000 + 3 * 1000 = 25000 IQD.
- Carton price is independently stored; never force carton price = units_per_carton * unit price.
- Stock list displays total base units plus equivalent complete cartons and loose remainder (33 units = 2 cartons + 9 units at 12 per carton).

## Local backend contract
- tests/v16/local_dual_sale_checkout.sql: ISOLATED LOCAL QA SQL ONLY.
- New retail_scan_catalog_v16(p_store uuid) read-only RPC, explicit verified current store role, returns code/product/unit_type/pack size/SERVER sale price; excludes purchase costs.
- New retail_checkout_packs_v16(p_store uuid,p_request uuid,p_items jsonb,p_cash_received bigint) uses SERVER-side pack price and pack size, validates scanned expected price/size against live definitions, checks open shift + RLS role, locks product/barcode price rows, aggregates stock required BY PRODUCT, locks stock rows in sorted order, blocks negative stock, writes draft/posted sale and receipt, one row per unit/carton sale line, stock event and audit in a single transaction.
- Immutable sale rows snapshot package_type, package barcode, units_per_package, base_units and unit-price. Cashier receipt shows carton suffix. Previous receipt lines remain unchanged by product price edits.
- V16 receipt history and 58/80mm printing now show original pack quantities (e.g. 2 cartons × 12 units, plus 3 individual units) and independent line prices. Historical receipts with no V16 fields still use the legacy SELECT query; carton print validation prevents an inconsistent base-unit snapshot from printing.
- The same request UUID/payload returns the same posted sale even on retry; different payload under same UUID is rejected.
- Direct authenticated SELECT for retail_products is limited to non-cost columns in the local schema; owner-only v15 snapshot is used for purchase cost. Carton table cost is withheld from cashiers by RLS.
- Old production instances without the V16 API keep the existing unit-only checkout and may not checkout cartons. Absolutely no fallback that charges a carton at unit price.
- Only V16 local isolated CI modifies this schema. NO LIVE SUPABASE MIGRATION, NO PC RELAY, NO OLD POS mutations.

## Testing
- tests/v16_dual_sale.test.mjs: selling-mode validation and static financial safety.
- tests/browser/v16_receipt_packs.mjs: real Chromium receipt history and 58/80mm print of mixed unit/carton historic lines, checking total and cash change.
- tests/browser/v16_units_cartons.mjs: actual HTML/CSS/JS in Chromium with an isolated in-memory Supabase fixture, modes, mixed basket/25k sale/27-stock reduction, carton-only, and 2 cartons + 9 remaining loose units.
- tests/v12/auth_rls_e2e.mjs: real local GoTrue JWT owner/manager/cashier/outsider, 25k posted, 27 base units decremented, idempotent replay, bad price/bad pack/insufficient stock blocked, carton-only checkout, and two authorized cashiers competing for last carton (only one can succeed).
- .github/workflows/pc-foundation.yml: all QA disposable, no hosted project or service token.

## Production release gate
These are QA features; the hosted DB still lacks the V14/V15/V16 schema/RPC and purchase-cost protections. Existing hosted TRUNCATE privilege exposure is a separate production blocker. Require explicit user authorization for any production migration plus backup, privilege review and hardware checkout tests. Do not use as a real till yet. Frozen 12-card/48-subcard PC design and no-extra-copy restriction remain unchanged.
