# سیستەمی کاشێر — Retail OS

## دۆخ
V2 — Supabase Auth and Products Foundation. Development only; NOT production-ready.

## GitHub
- Repository: arambarzani07/zhirox371
- Development branch: feature/retail-os-pc-foundation
- Immutable-in-practice design snapshot branch: design-lock/pc-home-v1
- Approved Home design rules: DESIGN_LOCK.md. No branch protection configured.

## ڕووکاری PC
- index.html is the approved Sorani RTL desktop launcher: 12 main cards, 3 rows × 4, expandable subcards directly under the selected row.
- The locked Home CSS, markup, and card definitions have not been changed. Navigation from the first two Products subcards now opens workspace.html.
- No help text, demo badge or sample data on Home.

## بەشی کاڵاکان
Open workspace.html from the Products Home subcards, on the same static web origin.
1. Sign in to Supabase using email/password, or sign up (email confirmation may be required).
2. Create a store linked to the authenticated user's verified ID.
3. Add products using an atomic owner-only RPC: retail_create_product.
4. List real products and barcodes from Supabase. Current UI retrieves up to 200 products and 1000 barcodes.
- workspace.html loads a pinned supabase-js 2.118.0 CDN build.
- config.js contains only the publishable API key and project URL, not a service-role/secret key.
- Host all static files together over HTTPS; GitHub's source-code viewer does not execute HTML.

## Supabase
- Project: Zhirox-New-Project / qcfmlyyzfykzszvtllrw.
- 7 empty RLS-enabled tables: retail_stores, retail_products, retail_barcodes, retail_customers, retail_sales, retail_sale_items, retail_stock_events.
- Migrations: retail_pc_foundation and retail_products_atomic_create_and_safety_gate.
- Product and initial barcode creation is all-or-nothing (one database transaction).
- anon cannot call retail_create_product. authenticated cannot directly insert sales or stock events.
- No store, account or product has been seeded.

## Safety / remaining work
- All remaining Home-linked internal modules are either empty scaffolds or local/in-memory prototypes.
- Not connected: finalized checkout, payments, stock writes, debt settlement, reports, printing.
- No cashier/manager RBAC yet; do not permit real operations before RBAC and atomic checkout are complete.
- Email confirmation redirects must be configured in Supabase Auth to match any deployed web origin.
- Static tests: node --test tests/foundation.test.mjs (Node 22+).
- Next engineering gate: RBAC, audit records, protected stock ledger and transaction-safe posted sales.
