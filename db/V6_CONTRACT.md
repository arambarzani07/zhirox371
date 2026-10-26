# V6 — Receipt Printing & QA Gate

Supabase: `Zhirox-New-Project` (`qcfmlyyzfykzszvtllrw`)
GitHub branch: `feature/retail-os-pc-foundation`
Locked Home: `design-lock/pc-home-v1`

## Delivered
- SQL migration `retail_v6_receipt_line_name_snapshot` adds `retail_sale_items.product_name_snapshot`. The posted-sale RPC fetches the product's name and price in the same transaction, then stores both in the sale-line record.
- `db/v6_receipt_name_snapshot.sql` contains verified deployed SQL for rebuilding a clean V5 schema. **Do not reapply it to the current project.**
- `receipt-print.html` + `receipt-print.js` are a Sorani RTL standalone print view. The browser user chooses 58mm/80mm width and presses Print; the system calls the standard browser print dialog. It does not silently choose printers or bypass Windows print settings.
- `operations.js` provides 58mm/80mm links after posted cash checkout and in receipt history/detail.
- Receipts are always loaded from `retail_sales` and `retail_sale_items` with RLS under a verified Supabase Auth session; the print page refuses missing/unposted/incomplete sales.
- Print actions remain disabled until fetched sale lines match `total_minor`, `cash_received_minor` and `change_due_minor`. All user/database text is written via `textContent` (no HTML injection).
- Paper-specific CSS widths: 58mm paper (48mm printable content) and 80mm paper (70mm printable content), no page margins in print CSS. **Actual roll size/width must still be configured in the printer driver and browser print dialog**.
- No sample sale, sample account, or real financial record was created.
- PC Home CSS/card order/card labels remain identical to the locked snapshot. New work is on internal pages only.

## Automated source tests
- `.github/workflows/pc-foundation.yml`: runs `node --test tests/*.test.mjs` on pushes to the working branch and on PRs targeting main.
- `tests/design_lock_snapshot.test.mjs` compares source Home styles and all 12 card definitions against the frozen Git branch.
- `tests/v6_receipt_print.test.mjs` checks printer widths, posted-receipt authentication and data verification, product-name snapshots, and safe text rendering.
- Tests are static/in-process; they do **not** require live Supabase credentials or create financial data.

## Production blockers (explicit)
1. No Auth user, store, stock, sale, shift, or receipt seeded in the selected Supabase project. Live end-to-end QA cannot yet pass without an isolated test fixture and real staff authentication.
2. Browser printing does not verify thermal printer compatibility. Physical 58/80mm thermal printer, Kurdish font availability, automatic paper cutting, ESC/POS and cash-drawer pulse are still untested and unsupported.
3. Concurrent multi-session tests (sale retry, shift close vs checkout, stock locking and movement retry) remain to be executed using **two authenticated clients** and intentional stock/shift test fixtures in a dedicated QA store, with clean teardown.
4. Print requires functioning HTTPS static hosting and browser access to the Supabase public project; GitHub source view is not a deploy.
5. Receipt name snapshot is for **new** sales after V6; historical receipts before migration lack snapshots and print is intentionally blocked for such rows.
6. Barcode scanner input, offline operation, returns, coupon tax/discount, mixed payment, multiple currencies, historical store name snapshot, printer driver paper format and cashier training remain for subsequent gates.

## QA acceptance scenarios
- Cashier without a shift cannot post a sale.
- Two simultaneous checkout requests selling the final unit result in at most one successful sale and no negative stock.
- Same request UUID + identical actor/item/cash returns the same sale; mismatched content must fail.
- Shift close and checkout racing cannot add a posted sale to a closed shift.
- Same cash movement request retried simultaneously is counted exactly once.
- Past receipt reprints display the stored product name and price even after product rename.
- RLS prevents one store's authenticated user from reading or printing another store's sale.
- Browser Print uses correct paper width in actual Windows printer settings.
- Original locked Home stays pixel-consistent; do not redesign without explicit approval.

## Sources and policy
- `DESIGN_LOCK.md` and `PREVIEW_POLICY.md` remain mandatory.
- This release remains **development only, NOT READY for live cashier use**.
