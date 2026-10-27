# Scale-only product registration — isolated QA fix

## Verified failure (read-only on 2026-10-27)
The connected frontend config selects Supabase project `Zhirox-New-Project` (`qcfmlyyzfykzszvtllrw`). A read-only information_schema/pg_proc inventory found:

- Existing RPC: `public.retail_create_product(uuid,text,text,bigint)`
- Missing RPCs: `retail_register_product_v14`, `retail_update_product_v15`, `retail_resolve_barcode_v18`
- Missing column: `retail_products.plu`
- Missing table: `retail_product_cartons`

When SKU, PLU, purchase costs, multiple barcodes or cartons are supplied, `workspace.js` **must not** silently fall back to the legacy unit-only RPC. Otherwise SKU, PLU, prices and scan behavior become inconsistent and purchase/checkout cannot be trusted.

## Code fix on feature branch
- Genuine five-digit scale PLU (e.g. `00001`) allows a scale-only unit-priced item without any fake unit barcode. Its sale price field is labeled **IQD per kg**.
- The incomplete seven-digit `27+PLU` string is not accepted as its ordinary barcode.
- Legacy normal unit, carton and multi-barcode registration semantics remain unchanged.
- QA-local V14 registration and V15 editor/snapshot accept a scale-only product with no unit barcode; a unique indexed `(store_id,plu)` match for five-digit PLUs prevents ambiguous scale resolution.
- The genuine scale label `2700001004806` is generated at weighing time, decoded by V18 scanner and never stored as a fixed unit barcode.
- Existing SQL stays under `tests/v14` and `tests/v15` for the disposable local CI Supabase mirror. **These files are not production-safe, idempotent upgrade migrations**.

## Production release gate (still BLOCKED)
No schema changes, migrations, hosted data writes or privilege GRANT changes were made to the connected Supabase project.
To activate the product form against that project later, the owner must explicitly approve:
1. A restorable backup and exact schema diff from existing hosted retail schema to the tested V14–V19 contracts.
2. Rehearsal in a separate staging Supabase project with identical schema and sanitized data.
3. RLS, EXECUTE privilege and TRUNCATE default-privilege review, sensitive purchase-price access checks and functional scanner/checkout tests.
4. An incremental, reversible migration reviewed before running against the active Supabase project.

**Do not copy `tests/v14/local_product_registration.sql` directly into the connected hosted SQL editor.**
