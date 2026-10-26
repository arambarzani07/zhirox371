# V15 — Product Editing and Immutable Audit

## Scope
GitHub-only isolated QA. No hosted Supabase changes, PC Relay writes or old POS mutations.

## Implemented
- Products > product list: owner-only Edit button opens the same full product form.
- Owner-only snapshot RPC: retail_product_snapshot_v15.
- Atomic owner-only edit RPC: retail_update_product_v15. A PostgreSQL row lock plus catalog_version prevents stale edits (SQLSTATE 40001).
- Updates modify the same product_id; no new record is created.
- Unit and carton aliases removed from the form become active=false, never physically deleted; historical codes remain reserved and cannot be assigned to other products.
- Primary and multiple carton barcodes all share exactly one carton pack quantity, purchase cost and selling price.
- SQL uniqueness, input validation and full transaction rollback block inter-product and unit/carton duplicate barcodes (SQLSTATE 23505).
- One product.update_v15 immutable audit event for each successful change, storing owner actor_id, time and before/after snapshots, including old/new version.
- Owner-only product history RPC: retail_product_history_v15, max 50 events.
- Direct UPDATE/DELETE grants on product definitions are revoked for authenticated in the local QA schema so updates must pass the audited RPC.
- Cashier cannot use editing RPCs. Barcode search now excludes inactive codes, with a fallback for older hosted databases without the active column.
- Existing sale receipts and money totals are not edited. Carton checkout is still unit-only blocked.

## Files and checks
- tests/v15/local_product_editor.sql (LOCAL disposable Supabase only, never hosted migration).
- workspace.html and workspace.js (edit, cancel, history UI).
- operations.js (retired barcode lookup safety).
- tests/browser/qa_supabase_fixture.js and tests/browser/v15_product_editor.mjs (isolated browser)
- tests/v12/auth_rls_e2e.mjs (real GoTrue JWT, tenant isolation, owner-only edit, history, stale versions and duplicate rollback).
- tests/v15_product_editor.test.mjs and .github/workflows/pc-foundation.yml.

## Production release blockers
- Hosted schema lacks V14/V15 editing RPCs, active and catalog_version columns. Editing stays blocked in production until a separately approved migration.
- The hosted TRUNCATE grant issue discovered in V12 remains unresolved.
- Purchase cost currently lives in retail_products under V14 QA design; existing broad SELECT grants may reveal that cost to cashiers. Review and separate confidential cost storage or restrict table/column grants before exposing real data.
- The backend must not allow carton checkout until server-calculated carton price and stock accounting are verified.
- Zero extra instructional copy in the PC screen; frozen 12 main cards and 48 subcards retained.
