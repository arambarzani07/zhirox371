# V4 — پسووڵەکان و دڵنیابوونەوە لە مامەڵە

Project: `Zhirox-New-Project` (`qcfmlyyzfykzszvtllrw`).
Working branch: `feature/retail-os-pc-foundation`.
Locked Home snapshot: `design-lock/pc-home-v1`.

## Database changes (applied)
- Supabase migration: `retail_v4_receipt_numbers_and_request_fingerprint`.
- Added `public.retail_receipt_counters`, RLS enabled. Each store has its own `last_no`.
- Added `retail_sales.receipt_no` and `retail_sales.request_payload`.
- Unique store receipt numbers via `retail_sales_receipt_unique`.
- Checkout transaction obtains next receipt number by atomic insert/upsert on the store counter. Failed transactions roll back number increments.
- Request payload includes normalized aggregated product quantities (UUID order) and cash received.
- Replaying the same request UUID, same actor and same normalized payload returns the previous sale ID and does **not** deduct stock again.
- Reusing the same request UUID with changed actor or content is rejected (`23505`).

The deployed migration's SQL and the current checkout function are captured in `db/v4_receipt_migration.sql`. This file is for clean rebuilds after V3; do not apply it again against the same project.

## PC interface (GitHub)
- `operations.html`: new **پسووڵەکان** tab, detail panel, retry button for ambiguous checkout.
- `operations.js`: reads last 100 posted sales; opens receipt details from sale + sale-items records.
- `index.html`: existing **پسووڵەکان** subcard now navigates to `operations.html?view=receipts`, navigation only.
- `DESIGN_LOCK.md`: preserved. All approved Home CSS and all 12 card definitions remain byte-identical to locked snapshot.

## Pending request protection
- Before checkout RPC, the frontend stores the request UUID and exact payload in `sessionStorage` under a key scoped to the Auth user and store.
- If the call fails ambiguously (network/server fault), the cart and cash input are held and the same UUID/payload can be retried.
- A verified success clears the pending record. Authorization/validation errors that definitely aborted the transaction can unlock the form.
- Reloading the **same browser tab** restores the pending attempt. The browser tab's storage is not a substitute for server reconciliation and may not survive tab/browser destruction.
- After RPC success, inventory refresh errors do not misrepresent the successful sale as a failed checkout.

## Current limitations / QA
- No real signed-in staff accounts or populated store were used for an end-to-end checkout test; live role isolation, concurrent cashiers, printer behavior and cash reconciliation require dedicated QA.
- Read UI shows a maximum of 100 most recent receipts; pagination is pending.
- Older/later product names are resolved from the current product catalog or UUID. **Historical product-name snapshots are not implemented**, so renames can change displayed names on older receipts.
- Refunds/returns, thermal-print templates, scale barcodes, carton pricing, and mixed currency/payment are not implemented.
- Receipt numbers are per store and assigned to committed posted sales. No new financial records were seeded for this implementation.
- Real sale deployment remains **NOT APPROVED FOR PRODUCTION**.

## Validation
- SQL permissions should deny anonymous `retail_checkout_cash`, deny direct inserts to sales and stock for authenticated clients.
- All public retail tables must have RLS enabled; Supabase advisor should show no security notices.
- Source checks: `node --test tests/foundation.test.mjs tests/v3_operations.test.mjs tests/v4_receipts.test.mjs`.
- Concurrency, rollback and exact-retry behavior still require real two-session end-to-end tests.

## Never break
- Locked Home design remains unchanged except explicit navigation wiring.
- Each change needs a live HTML/CSS/JS PC preview and GitHub file links per `PREVIEW_POLICY.md`.
