# V105 — Atomic CSV-to-PostgreSQL Catalog Price Drift Guard & Full 48-Submodule React Workspace

## Scope
1. **Backend (`offline/catalog-price-guard-v105.mjs`)**:
   - Bridges the `V103`/`V104` SHA-256 verified operator CSV catalog with `zhirox_local.products` and `zhirox_local.barcodes`.
   - Before any local checkout basket is accepted, `verifyV105CatalogPriceParity` refreshes the `V103` atomic CSV snapshot and verifies every line's barcode and integer IQD `price_minor`.
   - Fails closed on:
     - Stale or corrupt CSV (`503 catalog_source_unavailable`)
     - Missing product or barcode (`404 db_product_or_barcode_missing` / `404 catalog_barcode_missing`)
     - Duplicate/ambiguous CSV barcode (`409 catalog_barcode_ambiguous`)
     - Price drift between PostgreSQL and the operator CSV (`409 catalog_price_drift_detected`)
2. **React Workspace (`src/components/SectionWorkspace.tsx` & `src/components/OperationalSubmodulesView.tsx`)**:
   - Completes all 16 previously unimplemented submodules in the Sorani RTL React workspace (`return-arrow`, `profit-chart`, `ai-insights`, `purchase-order`, `new-offer`, `discount-percent`, `coupon-ticket`, `promotion-speaker`, `manage-users`, `access-key`, `system-controls`, `print-template`, `attendance`, `work-timer`, `staff-review`, `approval-file`) so all 48/48 submodules are interactive.
   - Preserves the locked 12×4 Home screen (`src/components/HomeScreen.tsx`), browser `DEMO-RCP-` watermarks, and `NO-GO` production build guard.
