# V18 — Enterprise Catalog Scaling & Intelligent Barcode Engine

This stage upgrades ZHIROX Supermarket POS to handle enterprise-scale catalogs of **50,000+ products** and **150,000+ registered barcodes** (unit primary, unit aliases, carton primary, and carton aliases) without preloading the entire catalog into browser memory, while adding dedicated barcode and price inspection tools inside the existing product workspace and keeping the locked PC Home interface 100% untouched.

## User Review & Critical Decisions

> [!IMPORTANT]
> The following architectural and UX decisions incorporate your confirmed selections and strict design/database locks:

- **Confirmed Decision 1 — Dedicated Inspection Tabs in Product Workspace**: Fast Barcode & Price Inspection will be added as dedicated tabs (`نرخەکان` / Prices and `بارکۆدەکان` / Barcodes) alongside `کاڵای نوێ` (New Product) and `لیستی کاڵاکان` (Product List) inside the existing product workspace, preserving the byte-for-byte SHA lock on the 12-card PC Home screen.
- **Confirmed Decision 2 — 50-Item Server-Side Pagination with Instant Search**: Product and stock tables will fetch 50 items per page from the server with keyset/offset pagination (`پێشوو` / `داهاتوو`), total count indicators, and server-indexed search by product name, SKU, PLU, or barcode.
- **Confirmed Decision 3 — Hybrid Local Hot-Cache + Server RPC Scanner Engine**: The single-field cashier scanner will combine a fast local hot-cache of active/recently scanned items with an indexed server-side barcode resolution RPC (`retail_resolve_barcode_v18`), supporting both Enter-terminated HID scanners and 160ms idle no-Enter scanners with server-verified prefix-collision protection.
- **Database & Branch Safety Gate**: All V18 schema indexes and RPC definitions are isolated to QA test fixtures and branch `feature/v18-catalog-scaling` off `main`. Production Supabase, PC Relay, and the legacy POS remain untouched, and the V13 `TRUNCATE` privilege check remains enforced in isolated QA.

---

## 1. Overview & Core Concept

- **What It Does**:
  1. Eliminates the 200/400 product and 1,000/2,000 barcode client-side query ceilings by introducing server-side paginated catalog and stock queries (`50` items per page) and on-demand server-side barcode/product lookup.
  2. Enables the single-field POS scanner to resolve any of 150,000+ primary or alias unit/carton barcodes in milliseconds using a hybrid local hot-cache and indexed server RPC (`retail_resolve_barcode_v18`), returning exact unit/carton sale price, pack size (`units_per_scan`), and live base-unit stock balance without exposing purchase costs.
  3. Provides store owners and managers with dedicated **Price Inspection (`نرخەکان`)** and **Barcode Inspection (`بارکۆدەکان`)** tabs inside the catalog workspace to instantaneously verify unit vs. carton selling prices, pack multipliers, and active/retired barcode mappings across tens of thousands of SKUs.
- **Target Audience / Persona**: Supermarket cashiers requiring sub-second barcode scanning at the till, and store owners/inventory managers auditing prices, multi-barcodes, and stock across a 50,000-item catalog.
- **Key Value**: Unlocks enterprise catalog capacity (50k products / 150k barcodes) with constant $O(1)$ browser memory usage and sub-10ms indexed barcode lookups while maintaining 100% compatibility with V1–V17.1 financial, shift, receipt, and stock-receiving workflows.

---

## 2. User Experience & Visual Design

- **Key User Flows**:
  1. **Paginated Catalog Browsing & Search (`لیستی کاڵاکان`)**:
     - Opening the Product List loads Page 1 (50 products) via `retail_catalog_page_v18`.
     - Typing a product name, SKU, PLU, or barcode into the search input triggers a debounced server query across all 50,000+ products and 150,000+ barcodes, updating the 50-row table and page counter (`پەڕەی ١ لە ...`) with Previous (`پێشوو`) and Next (`داهاتوو`) buttons.
  2. **Barcode & Price Inspection Tabs (`نرخەکان` & `بارکۆدەکان`)**:
     - Clicking `نرخەکان` (Prices) displays a high-density tabular comparison of Unit Sale Price, Carton Sale Price, Units per Carton, and Selling Mode (`دانە` / `کارتۆن` / `هەردووکیان`) with instant search and 50-row pagination.
     - Clicking `بارکۆدەکان` (Barcodes) provides an instant scanner/search field and paginated directory of all primary and alias barcodes, showing exact barcode string, product name, package type (`دانە` vs. `کارتۆن`), pack multiplier (`1` vs. `N`), selling price, and status (`چالاک` / `ناچالاک`).
  3. **Hybrid Single-Field Cashier Scanning (`فرۆشتنی نوێ`)**:
     - When a cashier scans or types a barcode into the single scan field:
       - **Enter-terminated scan**: Immediately checks the local hot-cache; if not cached, invokes `retail_resolve_barcode_v18` to fetch the exact barcode match, live product stock balance, and server-authoritative unit or carton selling price, caches the result in the hot-cache, and adds the line to the basket.
       - **No-Enter scan (160ms idle)**: After 160ms of input inactivity, checks whether the code is an exact match and whether any longer active barcode shares that prefix (`has_longer_prefix`). Only unambiguous, complete barcodes auto-submit; prefix-ambiguous codes wait for `Enter`.
  4. **Scalable Stock Receiving (`دۆخی کۆگا`)**:
     - Includes a fast product/barcode search filter and 50-item pagination for the stock balance table (`کارتۆن + دانە` display) so managers can select any product out of 50,000 SKUs and receive unit, carton, or mixed (`دانە و کارتۆن`) stock.

- **Visual Identity & Theme (Strict PC Design Lock Compliance)**:
  - *Aesthetic Direction*: Clean, utilitarian desktop POS interface matching the locked ZHIROX PC foundation (`min-width: 1020px`, stationary header and `سوپەرمارکێتی کانی چنار` top banner, zero extra instructional copy).
  - *Color Palette*: Crisp light neutral canvas (`#f5f7fa`), white structural surfaces (`#ffffff`) with `#e5eaf1` hairline borders, high-contrast ink (`#172b45`, `font-weight: 900` / `800`), primary action navy (`#274871` / `#284973`), semantic error (`#ad4b45` / `#bc584b`), and semantic success (`#087c60` / `#137d68`).
  - *Typography & Tabular Discipline*: Kurdish Sorani RTL throughout (`lang="ckb" dir="rtl"`), bold readable labels, and `direction: ltr; font-variant-numeric: tabular-nums` for IQD prices, barcode strings, stock quantities, and pagination counters.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Hybrid Local Hot-Cache + Server RPC for Barcode Scanning**
  - *Chosen Approach*: Keep a bounded in-memory Map of recently resolved and initial top barcodes (`hotBarcodes`), backed by `retail_resolve_barcode_v18(p_store, p_code)` which returns both exact barcode metadata (product ID, name, unit/carton type, units per scan, server selling price, current base-unit stock) and a boolean `has_longer_prefix` flag in a single indexed round-trip.
  - *Why*: Preloading 150,000 barcodes into the browser consumes excessive memory and bandwidth on page load, whereas pure uncached server lookups add network latency on repeated scans of popular items. The hybrid approach gives $0\text{ms}$ repeat scans and $<10\text{ms}$ indexed lookup for any of the 150,000 barcodes while preserving prefix-collision safety for no-Enter scanners.
  - *Alternatives Considered*: Loading all 150k barcodes in chunks on boot (rejected: slow startup and high RAM usage) or requiring Enter for all scans (rejected: breaks compatibility with existing no-Enter scanners).

- **Decision 2: Server-Side Keyset/Offset Pagination (50 Items/Page) with Legacy Fallback**
  - *Chosen Approach*: Introduce `retail_catalog_page_v18` and `retail_barcode_Directory_v18` RPCs with `p_search`, `p_limit` (default 50, max 100), and `p_offset`, while retaining automatic fallback to standard table queries if connected to an older unmigrated database instance.
  - *Why*: Ensures smooth, instantaneous pagination across 50,000+ products in V18 environments while preserving backward compatibility with existing V3–V17 tests.

---

## 4. Technical Architecture & Data Strategy

### Architecture & Data Flow Diagram

```
┌────────────────────────────────────────────────────────────────────────────┐
│                   LOCKED PC HOME (12 Cards × 48 Subcards)                  │
│             Fixed Banner: سوپەرمارکێتی کانی چنار (Unmodified)              │
└───────────────────┬────────────────────────────────────┬───────────────────┘
                    │                                    │
                    ▼                                    ▼
┌───────────────────────────────────────┐  ┌─────────────────────────────────┐
│       Catalog Workspace (PC)          │  │     Operations & POS (PC)       │
│  ┌─────────┬─────────┬──────┬───────┐ │  │  ┌───────────────────────────┐  │
│  │کاڵای نوێ│لیستی کاڵا│نرخەکان│بارکۆد │ │  │  │ Single-Field Auto Scanner │  │
│  └────┬────┴────┬────┴───┬──┴───┬───┘ │  │  │  (Enter + 160ms No-Enter) │  │
│       │         │        │      │     │  │  └─────────────┬─────────────┘  │
│       │    ┌────┴────────┴──────┘     │  │                │                │
│       │    ▼                          │  │                ▼                │
│  ┌──────────────────────────────────┐ │  │  ┌───────────────────────────┐  │
│  │  50-Item Paginated View Engine   │ │  │  │  Hybrid Scanner Engine    │  │
│  │  • Debounced Search Input        │ │  │  │  1. Local Hot-Cache Map   │  │
│  │  • Page Controls (پێشوو / داهاتوو)│ │  │  │  2. Server Prefix/Exact   │  │
│  └─────────────────┬────────────────┘ │  │  └─────────────┬─────────────┘  │
└────────────────────┼──────────────────┘  └────────────────┼────────────────┘
                     │                                      │
                     ▼                                      ▼
┌────────────────────────────────────────────────────────────────────────────┐
│            PostgreSQL / Supabase Isolated RPC Layer (RLS + RBAC)           │
│                                                                            │
│  • retail_catalog_page_v18(p_store, p_search, p_offset, p_limit)           │
│      → Returns 50 products + unit/carton prices + barcode summary + total  │
│  • retail_barcode_lookup_v18(p_store, p_search, p_offset, p_limit)         │
│      → Paginated barcode & price inspection across 150,000+ codes          │
│  • retail_resolve_barcode_v18(p_store, p_code)                             │
│      → Exact active unit/carton match + has_longer_prefix + live stock     │
│        (Purchase costs strictly excluded from cashier RPCs)                │
└────────────────────────────────────────────────────────────────────────────┘
```

### Data Model & Indexing Strategy (Isolated QA SQL)

1. **B-Tree & Prefix Indexes for 50k Products / 150k Barcodes**:
   - `retail_barcodes (store_id, code text_pattern_ops) WHERE active = true` — enables sub-millisecond exact match (`code = p_code`) and prefix range checks (`code LIKE p_code || '%' AND code <> p_code`) across 150,000+ rows.
   - `retail_products (store_id, created_at DESC, id)` and `(store_id, lower(name) text_pattern_ops)` — supports fast 50-row pagination and search.
2. **RPC Contracts**:
   - `retail_resolve_barcode_v18(p_store uuid, p_code text)`:
     - Verifies `manager` or `cashier` role for `p_store`.
     - Looks up `p_code` among active barcodes for active `IQD` products in `p_store`, resolving unit selling price (`p.price_minor`) or carton selling price (`c.sale_price_minor`), `units_per_scan`, and current `retail_stock_balances.quantity`.
     - Checks `EXISTS(SELECT 1 FROM public.retail_barcodes b2 WHERE b2.store_id = p_store AND b2.active AND length(b2.code) > length(p_code) AND b2.code LIKE p_code || '%')` as `has_longer_prefix`.
     - Never exposes `unit_purchase_price_minor` or `carton_purchase_price_minor`.
   - `retail_catalog_page_v18(p_store uuid, p_search text, p_offset integer, p_limit integer)`:
     - Verifies store membership/ownership.
     - Filters by product name, SKU, PLU, or matching barcode in `retail_barcodes`.
     - Returns `total_count`, `items` array (50 rows max per page) with `id`, `name`, `sku`, `plu`, `sale_mode`, `unit_price_minor`, `carton_price_minor`, `units_per_carton`, `active`, `stock_quantity`, and `barcodes` array.
   - `retail_barcode_page_v18(p_store uuid, p_search text, p_offset integer, p_limit integer)`:
     - Returns paginated rows of barcodes (`code`, `product_id`, `product_name`, `unit_type`, `units_per_scan`, `sale_price_minor`, `active`) for the `بارکۆدەکان` inspection tab.

### Interactive Component & State Mapping

- **Catalog Workspace Tabs (`کاڵای نوێ` | `لیستی کاڵاکان` | `نرخەکان` | `بارکۆدەکان`)**:
  - URL query parameter `?view=new|list|prices|barcodes` selects the active tab on load.
  - Each paginated tab maintains `{ pageOffset: 0, pageSize: 50, totalCount: 0, searchQuery: "" }` with working `پێشوو` (Previous) and `داهاتوو` (Next) buttons disabled at boundaries (`offset === 0` or `offset + 50 >= totalCount`).
  - Clicking `دەستکاری` (Edit) on any row in `لیستی کاڵاکان` or `نرخەکان` (for store owners) opens the optimistic-concurrency V15 product editor (`retail_product_snapshot_v15`).
- **POS Scanner & Stock Selector (`operations.js`)**:
  - When a barcode not yet in `barcodes` / `products` memory is scanned or searched, `retail_resolve_barcode_v18` hydrates the exact product, barcode definition, and live stock balance into the local hot-cache Map so cart calculations, shared base-unit stock checks (`stockUsed`), and V16 checkout (`retail_checkout_packs_v16`) work seamlessly.
  - Stock receiving (`دۆخی کۆگا`) includes a server-backed search input and 50-row page navigation so managers can find and receive stock for any product in a 50,000-product catalog.

### Verification & Benchmarking Plan

1. **Git Branch**: Create `feature/v18-catalog-scaling` from `main` (`0cfad05`).
2. **Existing Regression Suite**: Run all 22 existing test files (`109` tests) including `owner_locked_home_sha.test.mjs` to guarantee zero regressions and byte-for-byte Home lock preservation.
3. **V18 Benchmark & Scale Suite**:
   - Seed an isolated test dataset with **50,000 products** and **150,000 barcodes** (50k primary unit, 50k unit aliases, 25k primary carton, 25k carton aliases).
   - Measure and report actual execution times for:
     - Exact lookup of primary unit, alias unit, primary carton, and alias carton barcodes.
     - Prefix-collision check for no-Enter auto-scanning.
     - Paginated 50-item catalog and barcode inspection queries.
     - Browser E2E verification of pagination, price/barcode inspection tabs, and hybrid scanner checkout.
