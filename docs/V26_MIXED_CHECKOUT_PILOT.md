# V26 — isolated PostgreSQL mixed unit/carton/scale pilot

**Test-only, loopback PC foundation. Not Production.**

## Implemented

- Disposable migration 006_packs_scale_checkout.sql adds products.base_unit (unit or gram) and unique five-digit PLU per store. Gram products store stock in integer grams; products.price_minor is IQD per kilogram. No automatic conversion of old inventory.
- For unit products barcodes.sale_mode is unit or carton; cartons have independent sale_price_minor and quantity_base_units.
- Scale barcode format: 27 + five-digit PLU + five-digit grams + EAN-13 checksum. Example 2700001004806: PLU 00001, 480 grams. Positive IQD line totals are rounded half-up.
- The authenticated V26 API derives store/cashier from its revocable session, resolves barcodes server-side, locks product rows and validates cumulative stock and final prices. PostgreSQL atomically commits or rolls back sale lines, stock, receipt counters, ledger and outbox.
- Every sale line retains barcode_snapshot, sale_mode_snapshot and scan_quantity; outbox records immutable package breakdown.
- Replays of the same UUID, cashier and payload return the original receipt. Altered requests are rejected. Repeated physical scale labels are rejected.
- The isolated development-only server binds to 127.0.0.1:3306. The React pilot retains the Sorani RTL six-column cart; unit/carton quantities are editable but scale weight is immutable.

## Disposable test setup

Apply migrations 001_core.sql through 006_packs_scale_checkout.sql in numeric order ONLY to a disposable PostgreSQL test database.
Create test store and test account. A unit product gets a primary barcode with quantity_base_units=1 and sale_mode=unit. Its carton barcode gets quantity_base_units=12, sale_mode=carton and independent price. A weighed product gets base_unit=gram, five-digit PLU and a stock count in grams.
Start node offline/local-packs-scale-server-v26.mjs with test ZHIROX_LOCAL_DB_URL and ZHIROX_LOCAL_SESSION_SECRET in the server environment. Start the same-PC React preview using VITE_ENABLE_LOCAL_PILOT=true npm run dev -- --host 127.0.0.1. Never put database credentials into browser code.
The offline foundation CI uses disposable PostgreSQL 16 to test the SQL contract; Node and Chromium verify server scan, checksum, carton pricing, stock limits, quote drift and demo isolation.

## Not production ready

LAN/TLS/device credentials, multi-PC deployment, crashproof pending transaction journaling, actual cloud outbox delivery, printer, customer/debt, returns, discounts and shifts remain incomplete. No verified physical scanner/printer or disaster recovery test. The primary React cashier remains browser DEMO; V26 is opt-in isolated pilot only.

No Supabase production, locked Home or PC Relay was modified.