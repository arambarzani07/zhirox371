# V3 — Retail RBAC, Stock & Cash Checkout

Project: Supabase `Zhirox-New-Project` (`qcfmlyyzfykzszvtllrw`).
Latest migrations:
- `retail_rbac_stock_atomic_cash_checkout`
- `retail_checkout_request_unique_constraint_fix`

## Permissions
- Owner: Supabase Auth user recorded in `retail_stores.owner_user_id`; all store administration.
- Manager: active `retail_memberships` role manager; stock intake and cash checkout.
- Cashier: active `retail_memberships` role cashier; cash checkout.
- Role checks are **server-side**, not client-controlled. Employee self-authorization is not allowed.
- Owner grants staff to an **existing Supabase Auth user UUID** via `retail_assign_staff`. Email invitations are not implemented.
- Membership table and audit records have RLS, with read restrictions; no browser direct write grants.

## Database RPC interfaces
All RPCs require an authenticated Supabase session. Roles checked again inside the database.

### `retail_assign_staff`
Arguments: `p_store uuid, p_user uuid, p_role text, p_active boolean`.
Owner-only. Role is manager/cashier, and target Auth user must already exist. Writes audit action `staff.assign`.

### `retail_receive_stock`
Arguments: `p_store uuid, p_product uuid, p_quantity numeric, p_reason text`.
Owner/manager only. Reason is opening/purchase; quantity positive, at most 1,000,000 and no more than three decimals. Atomic balance increment, stock event and audit event. No direct browser INSERT to stock ledger/balance.

### `retail_checkout_cash`
Arguments: `p_store uuid, p_request uuid, p_items jsonb, p_cash_received bigint`.
- Owner/manager/cashier only. Current checkout supports **IQD cash only, whole-unit quantity only**, up to 100 JSON line items.
- `p_items` example: `[{"product_id":"PRODUCT_UUID","quantity":2}]`.
- Each product is fetched from the database; browser-supplied prices/totals are ignored.
- Product and stock rows are locked in sorted UUID order. Insufficient balance aborts the entire call.
- Stock reduction, sale, sale items, stock events and audit event are committed together.
- `(store_id, request_id)` is uniquely indexed. Repeating a completed request ID returns its previous sale ID without deducting stock again.
- Cash received must be >= server-calculated total. Cash change is calculated by the database.
- Client has NO direct permissions to write sales, sale-items or stock events. All writes occur under checked database functions.
- A separate duplicate-key reuse with a different payload is not yet fingerprint-verified; the same UUID must only be used for retries of exactly the same checkout.

## UI
- `index.html`: visually locked Home (12 cards / 3x4), navigation-only changes.
- `operations.html`, `operations.js`: cashier, receiving, memberships and audit.
- `workspace.html`, `workspace.js`: login and product creation/list.
- `config.js`: publishable client key only, **not** a service-role secret.
- PC viewport fixed >= 1020px. Kurdish Sorani RTL.

## Deployment and QA limitations
- This is **not approved for production use** yet.
- Database remains empty until owner logs in and creates a store/products/stock.
- No cashier account has been created or assigned.
- Not yet tested with two concurrent live authenticated cashiers or integrated printer/payment hardware.
- No scale-barcode, cartons, mixed currencies, cash-shift reconciliation, returns, refund or offline mode yet.
- UI lists cap products at 400, barcodes at 2,000 and staff at 100; server-side search/pagination is pending.
- `operations.html` requires HTTPS/static hosting of all files together.
- Owner should test authorization isolation, zero-stock rejection, transaction rollback, idempotent retry and concurrent checkout before going live.

## Security controls
- RLS enabled on all 10 retail tables.
- `retail_internal` is a private, unexposed schema; its definer functions check `auth.uid()` and store roles before any mutation.
- Public RPC wrappers are security-invoker functions with explicit `authenticated` EXECUTE grants; `anon` is denied.
- Security advisor and privileges must be reviewed after each migration.

## Visual-lock and delivery rules
`DESIGN_LOCK.md` and `PREVIEW_POLICY.md` remain in force.
