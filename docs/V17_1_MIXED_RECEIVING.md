# V17.1 — Atomic mixed receiving (QA only)

- One stock receipt for a single product with exactly one unit-barcode line and one carton-barcode line. Primary or registered alternate barcodes both accepted.
- Manager selects «دانە و کارتۆن» in PC Stock form. Stock balance always counts base units.
- Example: 2 cartons × 12 + 3 loose units = 27 base units in ONE atomic transaction. Onhand 60 → 87, displayed as 7 cartons + 3 units.
- Server RPC retail_receive_mixed_v171(p_store,p_request,p_lines,p_reason) validates live product, barcodes, carton definition, role, one shared product, counts and total cap; never trusts a client-computed quantity.
- A single transactional internal receive_stock call updates the common stock ledger, and one additional correlated immutable request/audit entry logs the mixed package lines.
- Identical repeated or simultaneous UUID/payload returns the same committed total without duplicate inventory. Altered actor, barcode, quantity or reason is rejected.
- A completed receipt may replay even after a barcode retires; new receipts cannot use retired codes.
- Ambiguous network failure keeps the same UUID and blocks changed requests until the original is retried; there is no non-idempotent legacy receiving fallback.
- Isolated QA SQL: tests/v17/local_receive_mixed_v171.sql; static: tests/v171_mixed_stock_receiving.test.mjs; browser: tests/browser/v171_mixed_stock_receiving.mjs; real GoTrue/RLS: tests/v12/auth_rls_e2e.mjs.
- Home design stays locked byte-for-byte (12 cards × four subcards), existing colors/fonts and stable PC frame unchanged. Only Stock view adds a compact receiving option.

## Release gate
NOT FOR PRODUCTION. No hosted Supabase migrations, no PC Relay modifications. Requires owner's explicit approval, verified backups, grants/TRUNCATE remediation, end-to-end hardware and finance QA before any real release.
