# V24 whole-system organization

The owner requested consistent design and workflow from the Sales card through the final Audit card on 2026-10-28.

`system-shell.js` supplies the same 12 main destinations in Home order on Operations, Products, device diagnostics, QA and the previously empty module pages. Existing authenticated controller buttons and role checks remain attached. Cashier receipt/payment/return buttons form a contextual second row. Shared page titles follow the selected section. The shared stylesheet standardizes form spacing, input/button sizes, surface borders, tables, pagination, validation and focus states. The PC canvas stays at least 1020px wide, with fixed market/header and internal scrolling. Thermal receipt styles are excluded.

Home's markup, card CSS, 12-card grid, all 60 icons and fixed desktop source remain unchanged. `index.html` gained only the shell script reference to route previously empty labels, attendance/work time/review, alerts and approvals destinations. Its byte-lock baseline was updated for this explicitly requested all-system reorganization; the other four locked files retain their hashes. These redirects are behavior changes, not a redesigned Home.

The missing Payments panel now uses its existing protected cash-movement controller, with current-shift scope and an explicit 200-row recent-history label. Missing historical shift profit is shown as unknown rather than guessed as 18% of revenue.

Previously empty destinations now use `modules.html`, identify their exact module and show an explicit unavailable status with a route to a related working module. No attendance, approval or batch-label financial behavior is fabricated. Individual shelf labels and barcode inspection use the real Products implementation; print-template diagnostics use the existing diagnostic page.

CSV import now preflights the entire input before any write. A genuine CSV parser handles quotes, commas/semicolons/tabs, BOM and CRLF. Legacy three-column files remain supported. Recognized `name/barcode/price` and original `ItemName/ItemCode/SalePrice` headers are mapped, never imported as products. Bad prices are rejected without rounding/default zero. Exact repeated records are skipped; conflicting barcodes block preflight. Nonzero stock, recorded purchase cost, extra barcodes, carton modes, SKU/PLU or kg metadata that the legacy RPC cannot preserve are explicitly rejected. This does NOT implement stock/bulk advanced-catalog import or silently discard requested stock of 10,000,000.

Validation: existing tests, six parser regression tests, full build, and a Chromium pass through all 48 real Home destinations plus CSV no-write preflight and header mapping. Browser fixture data is isolated; no hosted DB schema/data changes, merge or external publication.

Remaining business work is unchanged: server-backed supplier returns, capped account history/exports, other local-only prototypes, unimplemented attendance/approval/batch-label workflows, hardware checks and hosted backup/preflight. This reorganization does not certify these as production features.
