# ZHIROX371 — Canva visual parity migration

## Official source and scope
- Original existing Canva folder: `FAHaXeWwwvs` (148 separate, user-owned designs).
- Stable per-screen IDs and canonical links: [canva-original-screen-map.json](./canva-original-screen-map.json).
- Source canvas: **1920 × 1080**, desktop PC, Sorani RTL.
- Current primary source screens: `001` Home, `002` Cashier, `148` final navigation.

## Implementation status (2026-11-11)
| Item | State |
|---|---|
| Original Canva screen-to-GitHub ID mapping | 148/148 committed |
| Original Canva source screens | 148 distinct single-page designs in existing folder; unmodified |
| Native 1920×1080 text-container geometry captured | 022 (34), 023 (30), 024 (40), 025 (56), 026 (40), 027 (48), 028 (44), 029 (35), 030 (50), 031 (42), 032 (50), 033 (54), 034 (44), **035 (44)** |
| GitHub React design-reference route | `?canva-source=001..148` (explicit opt-in) |
| React UI alignment work | 001, 002, 021, 022, 023 **partial only** |
| In-screen product editor 023 | Source-measured column proportions, item search and permissions panel; live editor remains the existing DEMO implementation |
| Original screen 024 | RTL selected-product barcode table, unit/carton/bundle/set/kg mode tabs, local demo alias insertion and duplicate guard implemented; **pixel parity and real permissions NOT verified** |
| Original screen 025 | Read-only Canva-inspired live local-DEMO price history, real before/after structured audit events for new changes; old history unknown, approval counts withheld; **pixel parity and production audit NOT verified** |
| Original screen 026 | Exact local-DEMO read-only barcode scanner, cross-product and cross-unit duplicate detection for unit/carton/bundle/set/kg and aliases; **not a production-wide scan or proven pixel parity** |
| Original screen 027 | Five original Canva unit rows (unit, carton, bundle, set, kg), actual local-DEMO selling and purchase prices only, last known real DEMO change date; approval action disabled pending screen 029; **pixel parity NOT verified** |
| Original screen 028 | Read-only bulk price **preview**, actual category-scoped unit/carton prices and bounded percent/IQD calculation; wholesale unsupported; no approval or write path; **pixel parity NOT verified** |
| Original screen 029 | Original 5-row cashier/manager permission template and local request-reason draft, navigation to 028/026; **identity unverified, submission disabled, no backend authorization or price write**, pixel parity unverified |
| Original screen 030 | Read-only review screen: actual local DEMO price-change audit entries clearly marked non-requests; no genuine pending/approved/rejected records, both approval buttons disabled, no backend actions or price mutation; **pixel parity NOT verified** |
| Original screen 031 | Extra barcodes per unit: 5 RTL selling modes, local-DEMO alias insertion, exact global duplicate checks and maximum 30 aliases per mode; **server-side permissions and pixel parity NOT verified** |
| Original screen 032 | Five-unit conversion factors sourced from actual product data (unit, carton, bundle, set, kg), independent weight units and read-only integrity check; write request disabled without verified permissions; **pixel parity NOT verified** |
| Original screen 033 | Five-unit read-only gross profit audit from real local-DEMO selling/purchase prices, absent or zero purchase cost withheld, gross margin based on selling price; link to disabled 029 permission request, no write path; **pixel parity NOT verified** |
| Original screen 034 | Local CSV file **preview only**: explicit four-column name/barcode/price/base-unit validation, active-catalog aliases and within-file collisions, row counts, invalid price and unsupported pack units. Legacy direct importer entry routes here; **no approvals or writes**, pixel parity unverified |
| Original screen 035 | Source-based product/barcode deactivation and restoration **read-only** view: actual registered unit/carton/pack barcodes but status **unverified** (no active/retired state in DEMO model), local reason draft, all deactivation/restoration actions disabled; no mutation/history fabrication, pixel parity unverified |
| Original PNG exports | 148/148 in [canva-exports](./canva-exports), all 1920 × 1080 |
| Original screens 036–039 | Stock overview, movement history, low-stock alerts and expiry tracking use existing local data. Browser checks cover search, filters, movement details and local edits at 1920 × 1080 and 1366 × 768. |
| Original screen 040 | Session-local physical count draft snapshots recorded stock per item, validates pieces and kg, calculates differences and flags stale snapshots. Approval submission remains disabled because this route has no authenticated approval workflow. |
| Original screen 041 | Local receiving uses the existing stock and supplier handlers for units, cartons and weight. Bundle, set and per-lot expiry are unavailable in the receiving model. |
| Original screen 042 | Warehouse transfer draft uses the existing catalog and aggregate stock. The demo lacks per-location balances and authenticated approvals; this screen does not apply transfers or simulate them with stock adjustments. |
| Pixel-perfect typography, shapes, icons, colors, responsive states | **Not verified** |
| Real role-based permission approval for price edits | **Not verified in preview**; approval request is disabled rather than presented as real |
| Functional POS parity for all 148 screens | **Not done — NO-GO** |
| Production deploy, real printer/offline cash testing | **Not verified by source geometry or preview CI** |

Geometry files are grounded in the original Canva editable text container positions, not guesswork:
- [022 original text bounds](./canva-original-screen-022-geometry.json)
- [023 original text bounds](./canva-original-screen-023-geometry.json)
- [024 original text bounds](./canva-original-screen-024-geometry.json)
- [025 original text bounds](./canva-original-screen-025-geometry.json)
- [026 original text bounds](./canva-original-screen-026-geometry.json)
- [027 original text bounds](./canva-original-screen-027-geometry.json)
- [028 original text bounds](./canva-original-screen-028-geometry.json)
- [029 original text bounds](./canva-original-screen-029-geometry.json)
- [030 original text bounds](./canva-original-screen-030-geometry.json)
- [031 original text bounds](./canva-original-screen-031-geometry.json)
- [032 original text bounds](./canva-original-screen-032-geometry.json)
- [033 original text bounds](./canva-original-screen-033-geometry.json)
- [034 original text bounds](./canva-original-screen-034-geometry.json)
- [035 original text bounds](./canva-original-screen-035-geometry.json)

These do **not** include full editable vector/shape styling, fonts/weights, backgrounds, icon geometry or all visual states. Until a rendered 1920×1080 screen is compared to the authentic original using exported artwork/layer styles and functional tests, label each screen **partial**, not "pixel-perfect." Preserve the same project and never replace existing Canva originals.

The Canva connector returns a low-resolution image preview, **not** the original
1920×1080 exported artwork, editable shapes, or all Canva style metadata.
Attempts to load Canva in automated CI browser resulted in HTTP 403; do not
try to bypass access controls. No temporary signed Canva URLs should remain
in the repository.

Do not mistake a screenshot or iframe of the original Canva design for an
implemented React POS interface. Do not claim the project is officially
deployable or that physical printer, database, or offline behavior has been
validated by these design reference checks.

## Non-negotiable visual and interaction contract
1. Sorani Kurdish RTL throughout, with English digits 0–9.
2. All UI is PC-only; white, formal, restrained theme; `Noto Kufi Arabic`.
3. Header: store name **سوپەرمارکێتی کانی چنار** centered, `ZHIROX` top left.
4. Locked 12-card Home: first card far right; proceed right-to-left.
5. Keep up to five cashier ticket tabs and unit/carton/kilo barcode selection.
6. Routine actions stay on their originating screen. Avoid unnecessary
   navigation, modals and double-confirmation.
7. Real checkout, barcode scanning, debt settlement, print, reprint and
   idempotency must be implemented in application logic and tested separately.
8. Keep original Canva file IDs and internal navigation target mapping.
9. Do not make changes to actual supermarket database as part of a design port.

## Required to finish the *same* design in GitHub
- Implement each screen as React/TypeScript/CSS at 1920×1080 using original
  spacing, colors, fonts, iconography and UI states.
- Verify every screen against the authentic reference at desktop resolution,
  including RTL alignment, interactive states, and navigation.
- Add unit, E2E, printer and crash/recovery tests before calling any POS feature
  production-ready.

**No-Go**: The source map and PNG thumbnails are design evidence, not
proof that the 148 original Canva pages have been transferred as functioning UI.

### Screen 043 — stock count reconciliation
- Implemented from the original 043 PNG, connected from 040 with return navigation.
- Reads the shared tab-local count draft. Shows signed differences, alias/name search, incomplete counts and stale product snapshots. Totals remain separate by unit and exclude stale/invalid rows.
- Approval is explicitly unavailable in the demo route. No inventory mutation or production database changes. Reason selection is a local preview only.
- Validation: TypeScript/Vite build and Playwright at 1920×1080 and 1366×768 passed, including draft reuse, alias search, stale exclusion, return navigation and unchanged stock.
- Visual layout reviewed against Canva, exact pixel parity has not been certified. Backend approval integration remains outstanding.

### Screen 044 — expiry and lot history preview
- Layout follows original 044, reachable from 039 with return navigation. Product expiry search, date-ordered rows, 30-day/expired filters and selection are working.
- The demo Product model has no lot identity or lot balances. Those cells are explicitly unavailable; aggregate stock is never relabeled as a lot balance. Lot movement action remains disabled.
- Existing isolated V93 read-only lot endpoint and V92 views were inspected. They require their own authenticated test-store session and are not integrated into this demo. No database or API writes were made, and FEFO behavior is not claimed by this screen.
- Build and Playwright passed at 1920×1080 and 1366×768: filters with a fixed date, search, selection clearing, unavailable lot values, return navigation, and unchanged product state.
- Partial implementation: authenticated lot-source integration and exact pixel parity remain outstanding.

### Screen 045 — inventory action approvals (fail-closed preview)
- Original Canva 045 is DAHaahQHQZ8 (52 authentic text bounds, 1920×1080).
- Connected from the existing 043 stock reconciliation screen; returns to 036.
- The React DEMO has no verified inventory approval request feed, trusted actor identity, or secure approval/rejection endpoint. Therefore no pending, approved, or rejected records are invented. Search and status filters are operable, but results and managerial summary remain unverified.
- Both decision buttons are disabled even if someone claims to be the manager. A count draft from 040/043 is not a submitted request. No inventory, receipts, or real database are changed.
- This is partial visual/interaction work, **not production-grade authorization or pixel-perfect parity**.
- [045 original text bounds](./canva-original-screen-045-geometry.json).

### Screen 046 — supplier directory
- Authentic Canva design DAHaalUCb80: 48 original text bounds at 1920×1080, saved in [046 text geometry](./canva-original-screen-046-geometry.json).
- React directory is connected to supplier-building in Home and the plain suppliers route; existing supplier-accounts submodule is retained separately.
- Shows existing local DEMO supplier names, internal IDs, recorded remaining debt and contact detail; no changes to supplier, cash or production records.
- Supplier model has no trusted active/inactive flag; both status filters show no fabricated records. Creation/edit requires backend authorization and is disabled. Source layout pixel parity and production role validation are not certified.

### Screen 047 — purchase requisition DRAFT (no production submission)
- Original Canva design DAHaavwwB0c, 45 native editable text boxes at 1920×1080, documented in [047 geometry](./canva-original-screen-047-geometry.json).
- Wired to Home 4th card / first subcard (`purchase-order` ID remains unchanged). The older operational purchase-order handler is not invoked via this Home route; its local direct order/receiving write actions are deliberately not exposed by the 047 screen.
- React UI searches actual local-DEMO products by barcode or name, derives configured unit/carton/bundle/set/kg modes, requires a deliberate existing DEMO supplier selection and positive validated quantities. Repeated identical product/unit/supplier items merge with a maximum cap; unlike physical units are **never summed as a single count**.
- The draft lives in this browser tab's `sessionStorage` only after explicit "save draft"; on reload its product and supplier references are revalidated. This **does not** create a purchase order, submitted request, supplier charge, stock receiving, or official audit log.
- "Send for approval" stays disabled until a verified authorized backend request/approval workflow exists. Real DB, Canva originals, existing sales and inventory are not modified. Pixel perfect parity **not certified**.

### Screen 048 — purchase order pricing preview
- Added to the latest main after preserving the independently shipped 045–047 implementations and global PC navigation.
- Reads 047's explicitly saved tab-local requisition, separates rows by supplier, uses the correct unit/carton/extra-pack purchase cost, validates positive integer IQD costs and safe totals, and saves draft price overrides per line.
- Search filters displayed rows without changing the whole supplier order total. No approval, official order identifier, supplier send, stock movement or debt mutation is simulated.
- Fixed 047's empty-draft save so removing the final row can be persisted instead of restoring it on reload.
- Validation: TypeScript/Vite build, all 36 Canva source checks, and Playwright 047→048 navigation, price validation, totals, persisted prices, empty-draft reload and global navigation at 1920×1080 and 1366×768 passed.
- Partial: server-authorized order submission, receiving linkage, exact pixel parity and remaining screens are still outstanding.

### Screen 049 — supplier receiving reconciliation DEMO, never recorded stock
- Authentic original Canva design DAHaagvelAY (45 native text elements at 1920×1080) documented at [049 geometry](./canva-original-screen-049-geometry.json).
- Reachable from 048 pricing preview via a clearly labeled DEMO receiving review, back to 048 and Home; 047 source requisition remains only an unapproved browser-tab draft.
- A supplier-scoped item table supports barcode/name search, unit/carton/bundle/set/kg measured differences, input validation and per-row expiry dates, and a supplier invoice reference kept in tab-local sessionStorage only. Base-unit conversion uses confirmed local product pack ratios; never sum unlike product units.
- Approved order IDs are unavailable and never fabricated. All receiving confirmation and stock/financial writes stay disabled. No real inventory, supplier balance, receipts, auth or Canva originals were changed.
- Remaining: backend approved order lookup, server-side idempotent receiving, authoritative role, exact pixel parity.

### Screens 050–052 — purchase invoices, supplier return drafts and supplier accounts
- 050 shows invoice lines recorded by 041 when a known supplier, invoice number and positive purchase cost are available. Unit, quantity and cost are captured at receipt time. Invoice-level payment allocation requires a corresponding server data source.
- 051 uses the same receipt lines for a tab-local return draft. It validates quantity against the received amount and previews the value. Submitting an approved return requires a server endpoint.
- 052 shows structured local invoice records and supplier payments still present in the capped audit log. The outstanding balance comes from the supplier record. Existing account-level payment entry is accessible through the account details action. Old records lack the fields needed to reconstruct invoice history or running balances.
- Verified the build, 38 Canva source tests and browser workflows at 1920×1080 and 1366×768. Visual comparison used the original Canva exports. Exact pixel parity remains unverified.

### Shared Canva workspace and supplier payment history 053
- The main React PC app uses one Canva-derived workspace heading and control style for module and direct navigation. Screen-specific layouts keep their own geometry. Noto Kufi Arabic ships locally for offline rendering.
- 053 replaces the old supplier payment view. It lists the structured payment records still present in the local audit log, filters by drawer or safe, and reuses the account-level payment handler. The form checks the supplier balance and available drawer cash.
- Browser checks passed for the 12 main sections, 48 sub-tabs, Home, demo checkout and receipt printing, and supplier payment entry and persistence. Build and 38 source tests passed.
- This changes the shared PC design and the supplier payment workflow. Remaining screens need individual Canva layout work, and the separate pilot entrypoints still need review. Per-screen exact visual parity and a dedicated supplier payment history print layout remain unverified.
