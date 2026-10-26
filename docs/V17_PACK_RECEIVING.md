# V17 — Unit and carton stock receiving (ISOLATED QA ONLY)

## Locked design
Home stays unchanged: 12 main cards, 48 subcards, 60 SVG icons, persistent banner, fixed PC width and Sorani RTL.
The existing Stock form alone adds product, unit/carton pack mode, active barcode selector, pack quantity, read-only computed base units and stock-receipt reason.

## Backend
tests/v17/local_receive_packs.sql defines retail_receive_packs_v17 (LOCAL disposable PostgreSQL only).
Only owner/manager can add stock. Cashier, other tenant and anonymous callers cannot.
Barcode resolution verifies active registered unit/carton primary and aliases, carton pack size and currently active product. No fake unit barcode for carton-only items.
All stock additions are counted in ONE base-unit ledger by calling the existing transactional retail_internal.receive_stock function.
Each receipt has one store-scoped request ID and a parameter/actor fence against changed-payload duplicate requests.
Stock events and immutable audit record the actual base-unit movement, actor and carton barcode/quantity.

## Checks
tests/browser/v17_stock_receiving.mjs: existing PC form, carton alias 2 x 12, unit alias 3, 60 -> 87 base units, 7 cartons + 3 loose units.
tests/v12/auth_rls_e2e.mjs: real local GoTrue JWT and RLS manager permissions, negative stock guards and duplicate prevention.
tests/v17_stock_receiving.test.mjs: source contract and locked form fields.

## Production gate
Hosted Supabase and PC Relay remain completely untouched.
Old server without V17 supports its existing unit-only receipt; carton input is not silently treated as single units.
Production use requires approved schema migration, least-privilege review and pre-existing TRUNCATE privilege remediation.