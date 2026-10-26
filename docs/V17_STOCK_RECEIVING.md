# V17 — Pack-Based Stock Receiving and Retry Safety

**Environment:** GitHub branch `feature/retail-os-pc-foundation` and disposable CI Supabase only. No hosted Supabase SQL, old POS, or PC Relay changes.

## Contract
The same product can be received via a unit barcode, unit alias, carton barcode or carton alias. The manager chooses the registered active barcode and enters how many packages arrived; the backend gets `units_per_scan` from the trusted catalog, confirms `expected_units` against it and updates exactly **one stock balance measured in base units**.

Example: 2 cartons × 12 + 3 units × 1 = 27 base units. Current UI includes the useful base-unit total as a read-only field. The frozen 12×4 Home and icon/label design have not changed.

The local-only `retail_receive_packs_v17` RPC checks the authenticated manager's active store role and rejects cross-store users, cashiers, retired barcodes, fake carton multipliers, invalid reasons and quantities. A successful receipt records exactly one stock update, stock event, request identity and actor audit.

## Idempotency after retirement
A successfully committed `request_id` is first looked up in the private `retail_stock_receipt_requests_v17` request table, **before** active-barcode validation. This ensures that a network retry can retrieve the original balance even if the alias has since been retired. A different actor, barcode, quantity, multiplier or reason with the same ID fails with SQLSTATE 23505. A brand-new request for a retired code is rejected, and direct Data API reads/writes on the private request table are denied.

Concurrent calls by the same authorized manager using exactly the same request UUID are serialized through the unique (store, request) index and add inventory only once; the original immutable resulting balance is returned on both requests.

## Checked
- `tests/v17/local_receive_packs.sql`: transaction, store role, audit and idempotent replay.
- `tests/v12/auth_rls_e2e.mjs`: actual disposable GoTrue JWT / RLS roles, 2 cartons + 3 units, concurrency with identical request UUID, retry after retired alias, unauthorized actor and forged multiplier denial.
- `tests/browser/v17_stock_receiving.mjs`: real PC browser stock inputs, inactive barcodes excluded, unit and carton receive in one shared base-unit balance.
- `tests/owner_locked_home_sha.test.mjs`: SHA-1 lock of Home and CSS/icons.

## Release gate
V17 remains QA-only. Hosted project has not received V14–V17 schema/RPC migrations. Prior hosted `TRUNCATE` privilege concern remains unresolved. There is no approval to deploy these changes to live stock or financial data. Unsupported legacy unit-intake fallback must not accept carton barcodes.
