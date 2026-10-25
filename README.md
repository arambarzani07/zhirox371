# سیستەمی کاشێر — Retail OS

## دۆخ
V3 — Supabase Auth, Products, Role-Based Permissions, Stock Intake and Atomic Cash Checkout. Development only; NOT production-ready.

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
- 10 empty RLS-enabled tables: retail_stores, retail_products, retail_barcodes, retail_customers, retail_sales, retail_sale_items, retail_stock_events, retail_memberships, retail_stock_balances, retail_audit_events.
- Migrations: retail_pc_foundation, retail_products_atomic_create_and_safety_gate, retail_rbac_stock_atomic_cash_checkout, retail_checkout_request_unique_constraint_fix.
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

## Safety / remaining work
- All remaining Home-linked internal modules are either empty scaffolds or local/in-memory prototypes.
- Now connected in development: cash checkout RPC, stock receiving RPC, membership assignment and audit reads. Not implemented: full cash-shift accounting, refund/reversals, debt settlement, mixed payments, reports and printing.
- Owner/manager/cashier RBAC is implemented server-side; it has not been live-tested with separate real Auth accounts. Do not use in production before QA.
- Email confirmation redirects must be configured in Supabase Auth to match any deployed web origin.
- Static tests: node --test tests/foundation.test.mjs (Node 22+).
- Next engineering gate: end-to-end integration tests for real roles, concurrent checkout/idempotency, receipt numbering, cash reconciliation, returns and device integration.
