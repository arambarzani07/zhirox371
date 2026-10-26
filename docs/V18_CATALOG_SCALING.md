# V18 — Enterprise Catalog Scaling & Intelligent Barcode Engine

## Scope & Objectives

Stage V18 removes the previous client-side catalog retrieval ceilings (`limit(200)` / `limit(400)` / `limit(2000)`) and introduces server-side pagination, indexed barcode resolution, and dedicated barcode/price inspection views inside existing workspace files while keeping the locked PC Home interface (`index.html`) 100% untouched.

1. **50,000+ Product & 150,000+ Barcode Capacity**:
   - Browser memory only loads 50 rows per page (`PAGE_SIZE = 50`, capped at `100` on the server).
   - High-selectivity B-tree and `text_pattern_ops` indexes on `public.retail_barcodes` and `public.retail_products` provide sub-10ms exact and prefix lookups across 150,000+ barcodes.
2. **Exact Server-Side Barcode Resolution (`public.retail_resolve_barcode_v18`)**:
   - Resolves primary unit barcodes, multiple unit alias barcodes, primary carton barcodes, and multiple carton alias barcodes.
   - Returns authoritative server selling prices (`unit` vs `carton`), package quantities (`units_per_scan`), live shared base-unit stock (`stock_quantity`), active sibling barcodes, and a server-computed prefix-collision indicator (`has_longer_prefix`).
   - Never exposes confidential unit or carton purchase costs (`purchase_price_minor`).
3. **Hybrid Cashier Auto-Scanner (`operations.html` / `operations.js`)**:
   - Combines a local hot-cache of active scanned items with `retail_resolve_barcode_v18`.
   - Preserves both HID Enter scanning and 160ms idle no-Enter scanning, including server-verified prefix-collision protection (`has_longer_prefix`) and duplicate-scan protection.
4. **Price & Barcode Inspection Tabs (`workspace.html` / `workspace.js`)**:
   - Adds `نرخەکان` (`data-tab="prices"`) and `بارکۆدەکان` (`data-tab="barcodes"`) inside `workspace.html` alongside `کاڵای نوێ` and `لیستی کاڵاکان`.
   - Includes an exact barcode inspector (`#barcode-inspect-form`) and 50-item server-side pagination (`#list-pagination`, `#prices-pagination`, `#barcodes-pagination`, `#stock-pagination`).

## Mandatory Production Release Gate

- Hosted production Supabase was **not** modified during V18 development.
- The documented `TRUNCATE` privilege on `public.retail_customers` (and other `retail_*` tables) for `authenticated` remains an active **mandatory production release blocker** (V12/V13 gate) until revoked in a separately approved maintenance window.
