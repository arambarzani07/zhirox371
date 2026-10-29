# سیستەمی کاشێر — Retail OS

## V21/V22 repair candidate — 2026-10-28

Transaction/security repair, receipt-linked partial/credit returns and server-side reports are prepared for review; **not deployed to hosted Supabase**. Install order, verified behavior and remaining release blockers are in [docs/V21_TRANSACTION_REPAIR.md](docs/V21_TRANSACTION_REPAIR.md). Use `npm run test:database` for the actual production SQL regression suite. V22 behavior and boundaries are in [docs/V22_RETURNS_REPORTS.md](docs/V22_RETURNS_REPORTS.md). Historical version notes below do not describe the current hosted database state.

## دۆخ
V8 — Auth, Protected Checkout, Cash Shifts, Receipts, Hardware Diagnostics and Concurrent PostgreSQL QA. Development only; NOT production-ready.

## GitHub
- Repository: arambarzani07/zhirox371
- Development branch: feature/retail-os-pc-foundation
- Immutable-in-practice design snapshot branch: design-lock/pc-home-v1
- Approved Home design rules: DESIGN_LOCK.md. No branch protection configured.

## یاسای پیشاندانی گۆڕانکارییەکان
- لەگەڵ هەر commit و گۆڕانکارییەک، پێشبینینی **کاراکردووی کۆدی PC** و لینکەکانی فایل/commit پێویستن.
- [PREVIEW_POLICY.md](PREVIEW_POLICY.md) ـی پڕۆژەیەکە بخوێنەرەوە. دیزاینی قوفڵکراو هەروا دەمێنێتەوە.

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
- 13 empty RLS-enabled tables: retail_stores, retail_products, retail_barcodes, retail_customers, retail_sales, retail_sale_items, retail_stock_events, retail_memberships, retail_stock_balances, retail_audit_events, retail_receipt_counters, retail_cash_sessions, retail_cash_movements.
- Migrations: retail_pc_foundation, retail_products_atomic_create_and_safety_gate, retail_rbac_stock_atomic_cash_checkout, retail_checkout_request_unique_constraint_fix, retail_v4_receipt_numbers_and_request_fingerprint, retail_v5_cash_shift_reconciliation, retail_v5_live_shift_summary, retail_v5_cash_movement_concurrent_retry_guard.
- Product and initial barcode creation is all-or-nothing (one database transaction).
- anon cannot call retail_create_product. authenticated cannot directly insert sales or stock events.
- No store, account or product has been seeded.

## بەشە نوێیەکان — V3
- `operations.html` + `operations.js`: فرۆشتنی کاش، هاتنی کۆگا، دەسەڵاتی کارمەندان، تۆماری چاودێری.
- ڕووکاری قوفڵکراوی `index.html` تەنها لە ڕێگای کلیلککردنەوە بۆ ئەم بەشانە پەیوەست کرا؛ CSS و 12 کارت نەگۆڕدراون.
- خاوەن دەتوانێت ڕۆڵی manager/cashier بۆ Auth user UUID ـی موجود دابنێت، ناتوانێت خۆی بە خۆی مۆڵەت بەخشێت.
- بەڕێوەبەر و خاوەن دەتوانن کۆگا زیاد بکەن؛ کاشێر دەتوانێت فرۆشتنی کاش تۆمار بکات.
- پسووڵە، کۆگا و audit لە یەک تراکنشندا تۆمار دەکرێن؛ دووبارەکردنەوەی request UUID هەمان فرۆشتن دەگەڕێنێتەوە.
- سنوور: تەنها IQD، پارەی کاش، کاڵای تاک و بڕی تەواو. چاپکەر، کارتۆن، قەرز و پارەدانی تێکەڵ هێشتا نییە.
- پڕۆژە هێشتا بە دوو کاشێری ڕاستەقینە هاوکات تاقی نەکراوەتەوە و بۆ بەکارهێنانی ڕاستەقینە ڕێگەپێنەدراوە.
- قەراردادی تەواو و سنوورەکان لە [db/V3_CONTRACT.md](db/V3_CONTRACT.md).
- پشکنینی کۆدی V3: `node --test tests/v3_operations.test.mjs` (Node 22+).

## بەشە نوێیەکان — V4
- ژمارەی پسووڵەی تایبەت بۆ هەر فرۆشگا لە database transaction زیادکرا؛ `retail_receipt_counters` بەپێی RLS پارێزراوە.
- `retail_sales.request_payload` هەمان داواکاری دەناسێتەوە؛ request ID لەگەڵ ئەکتەر یان زانیاریی جیاواز ڕەت دەکرێتەوە.
- `operations.html`/ `operations.js`: لیستی ١٠٠ پسووڵەی دواهەم، وردەکاریی پسووڵە و دووپاتکردنەوەی مامەڵەی نادیار.
- `index.html`: ژێرکارتی پسووڵەکان ڕووی کردووەتە `operations.html?view=receipts`. هیچ دیزاینێکی سەرەتا نەگۆڕدراوە.
- `db/v4_receipt_migration.sql` و `db/V4_CONTRACT.md`: SQL و سنوورەکانی V4.
- `tests/v4_receipts.test.mjs` بۆ static assertions؛ تاقیکردنەوەی ڕاستەقینەی دوو کاشێری هاوکات هێشتا پێویستە.
- **مێژووی ناوی کاڵا** لە ڕیزی پسووڵەدا snapshot ناکرێت؛ دوای گۆڕینی ناوی کاڵا دەکرێت ناوی ئێستا پیشان بدرێت.
- تۆمارەکانی داتابەیس لەم قۆناغەدا بەتاڵ ماون؛ هیچ فرۆشتنێکی ڕاستەقینە یان داتای نموونەیی زیاد نەکراوە.

## بەشە نوێیەکان — V5
- `operations.html`/ `operations.js`: سندووق و شێفتی کاشێر، پارەی سەرەتا، پارەی هاتوو/دەرچوو، داخستنی شێفت و ڕاپۆرتی کەموزیادی.
- `retail_cash_sessions`, `retail_cash_movements`, `retail_sales.cash_session_id` و `retail_shift_summary`.
- فرۆشتنی نوێ تەنها بە شێفتی کراوەی هەمان کاشێر تۆمار دەکرێت؛ داخستنی شێفت و فرۆشتن هاوکات هەمان ڕیزی شێفت قوفڵ دەکەن.
- `db/v5_cash_shifts.sql`، `db/V5_CONTRACT.md` و `tests/v5_cash_shifts.test.mjs` زیادکران.
- دیزاینی سەرەتای قوفڵکراو تەنها ڕێگای چوونە ناو شێفتی بەشی «دارایی» و «شێفت و کارمەندان» وەرگرتووە.
- شێفتەکان تاکەکەسیین بۆ هەر کاشێر؛ هێشتا ئامێری چاپ، هەژمارکردنی پارەی بانکی، گەڕاندنەوە و سندووقی هاوبەش نییە.
- هیچ داتای ساختە یان مامەڵەی ڕاستەقینە تۆمار نەکراوە؛ QA ـی کۆتایی هێشتا ماوە.

## بەشی چاپ و پشکنین — V6
- `receipt-print.html` و `receipt-print.js`: چاپی پسووڵە بە 58/80mm، بە پشتڕاستکردنەوەی Auth و پسووڵەی Posted. هیچ پسووڵەی ساختە نییە.
- `operations.js`: دوگمەکانی 58/80mm بۆ دووبارەچاپکردنی پسووڵەی تۆمارکراو.
- `retail_sale_items.product_name_snapshot`: پاراستنی ناوی کاڵا لە کاتی فرۆشتن بۆ چاپی مێژوویی.
- `db/v6_receipt_name_snapshot.sql`، `db/V6_CONTRACT.md` و `tests/v6_receipt_print.test.mjs` زیادکراون.
- `.github/workflows/pc-foundation.yml`: پشکنینی خۆکاری کۆدەکان و پاراستنی دیزاینی قوفڵکراو.
- ١٣ خشتەی Supabase بە RLS؛ هیچ کڕیار، پسووڵە یان فرۆشتنی ڕاستەقینە نەزیادکراوە.
- هەڵبژاردنی چاپکەر و قەبارەی کاغەز لە دیالۆگی چاپی Windows/Browser پێویستە؛ بەڵێنی Auto Print و ESC/POS نەدراوە.
- هێشتا هەڵسەنگاندنی E2E بە دوو کاشێری ڕاستەقینە و تاقیکردنەوەی چاپکەر ماوە.

## پشکنینی PC — V7
- `diagnostics.html`، `diagnostics.js` و `diagnostics-core.mjs`: بەشی سەربەخۆی پشکنینی سکانی بارکۆد، EAN-13، پێوانەی prefix 27، کیبۆرد و چاپی تاقیکردنەوەی 58/80mm.
- `index.html`: ژێرکارتەکانی ڕێکخستن → ئامێرەکان و چاپکردن → قاڵبی چاپ، بەبێ گۆڕینی دیزاینی قوفڵکراو، کراونەتە ڕێگە بۆ Diagnostics.
- `tests/v7_diagnostics.test.mjs` و `docs/V7_HARDWARE_QA.md`: تاقیکردنەوەکان و یاساکانی QA.
- پشکنینی خۆکاری GitHub Actions: 39/39 تاقیکردنەوە سەرکەوتوون لە run 40216110209.
- چاپی تاقیکردنەوە فرۆشتن نییە؛ هیچ بڕی پارەیەک نانووسێت، هیچ داتابەیسێک ناگۆڕێت.
- ناسینەوەی Windows printer، Auto Cut و Cash Drawer لە وێبگەڕ بە تەنها پشتڕاست ناکرێت.

## قۆناغی V8 — پشکنینی هاوکات
- `tests/integration/fixture.sql`: temporary PostgreSQL 16 schema plus verified live Supabase function definitions, no writes to production.
- `tests/integration/concurrency.test.mjs`: 10 genuinely concurrent SQL integration cases, including 12 simultaneous requests for three stock units.
- `.github/workflows/pc-foundation.yml`: independent PostgreSQL integration job and frozen-Home static test job; no production keys.
- `qa.html`: interactive Sorani PC QA case browser, linked from چاودێری و مۆڵەتەکان → پشکنینی مامەڵە (Home navigation only).
- `tests/v8_qa.test.mjs` and `docs/V8_CONCURRENCY_QA.md`: QA contracts and scope exclusions.
- Hosted Supabase database remains empty; full live Supabase Auth, tenant RLS, physical printer and load E2E checks are NOT yet complete.

## Safety / remaining work
- All remaining Home-linked internal modules are either empty scaffolds or local/in-memory prototypes.
- Now connected in development: cash checkout, cash drawer shifts and reconciliation, stock receiving, membership assignment and audit reads. Not implemented: refunds/reversals, debt settlement, mixed payments, broader reports and printing.
- Owner/manager/cashier RBAC is implemented server-side; it has not been live-tested with separate real Auth accounts. Do not use in production before QA.
- Email confirmation redirects must be configured in Supabase Auth to match any deployed web origin.
- Static tests: node --test tests/foundation.test.mjs (Node 22+).
- Next engineering gate: live end-to-end authorization and concurrent shift/checkout tests, then receipt printing, returns, mixed currencies and device integration.
