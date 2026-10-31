# ZHIROX V82 — All 12 Main Modules / 48 Test-Market Submodules

The owner requested **every section of ZHIROX371 to be accessible within
«مارکێتی تاقیکردنەوە»**. V82 brings the full Sorani RTL PC navigation to
the isolated test-market login, using the same `MODULE_SPECS` as the 48-page
design. Only authenticated, read-only queries against the dedicated PostgreSQL
test database are allowed.

## Precisely what is available

- **12 parent modules, 4 distinct subpages each (48/48):** all can be opened.
- Every subpage is identified by `module_id` and `section_id`; the active
  second horizontal strip shows a selected checkmark and the correct title.
- **22 subpages** now read existing, genuine PostgreSQL test data (products,
  prices, barcodes, existing stock, sale receipts, stock changes, sample debts,
  user roster, or sale-line consistency). Some have intentionally empty
  results when the test fixture contains no matching records.
- **26 subpages** have their own UI and explicit `planned` status because no
  truthful backend exists yet. They DO NOT create sales, discounts, suppliers,
  shifts, returns, attendance, approvals or settlements.
- The cashier still sees all 48 navigation positions, but customer/debtor and
  administrative information is denied by the API.
- All data comes from isolated PostgreSQL. There is no fallback to demo
  localStorage, fake HTTP success, or production Kani Chnar.
- No deletion is permitted or scheduled. The original V80 test backup remains
  separate.

## Local PostgreSQL schema prerequisite

The **V78** registry migration is required in the isolated test database,
because `GET /api/local/v81/sections/:sectionId` verifies each ID against
`zhirox_local.section_registry_v78` before reading it.

Use `offline/migrations/027_section_settings_v78.sql` once on the correctly
isolated database (after `001_core.sql` and `003_local_users.sql`).
Do not execute it on an operating supermarket or Supabase production.
The V82 CI automatically provisions a fresh disposable PostgreSQL 16 database,
applies V78 and V79, creates the V80 test market, and loads the GUI.

## Business readiness warning

**V82 is navigation completeness, not 48 working business APIs.**
The 22 connected pages are **read-only**; 26 are explicit planned pages.
There is no new cashier financial write endpoint, bank settlement, real
supplier ledger, discount creation, physical label printing or Windows
production release. All official release blockers remain NO-GO.

## Validation

- `node --test offline/tests/test-market-sections-v82.test.mjs` ensures all
  48 source IDs match the actual V78 SQL registry, none mutates the DB,
  and private debtor/admin routes deny cashier access.
- `node tests/browser/v81_test_market_real_pg.mjs` in V81/V82 GitHub CI
  opens all 48 subpages, verifies horizontal geometry, the selected item,
  the V80 genuine persisted sample receipts, catalog, stock, debts and
  owner-only permissions. Real 1920×1080 Chromium screenshots are archived.
- No real production DB, relay, remote hosting, installed service or live
  market operation is changed as part of this PR.

## Later work to complete actual business functionality

Build isolated, typed, per-store and idempotent PostgreSQL APIs for the
remaining planned modules; add real local user/manager control, audited
returns and refunds, verified debt-cash reconciliation, supplier purchase
and receiving, shift and cash drawer controls, safe label printing, offer
rules, staff attendance, approvals and operations. Acceptance must remain
offline-first and test-store-only until explicitly approved for production.
