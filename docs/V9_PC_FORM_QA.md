# PC Forms Interaction QA — V9

Checked 2026-10-25, GitHub Actions run 40233110161 (successful).

## Automated checks against real project HTML/JS

The workflow now executes `tests/browser/pc_forms_interaction.mjs` using Chromium, loading the unchanged GitHub working-branch versions of:
- `workspace.html` + `workspace.js` (product management)
- `operations.html` + `operations.js` (cashier, receipts, cash shift, staff)

The browser intercepts the Supabase SDK CDN and injects `tests/browser/qa_supabase_fixture.js` in the page's own isolated test context. The fixture emulates a signed-in store owner and a local QA-only store, one stock item and empty shift/session/sales. All form handlers and UI rendering are the actual application code. **There is no API call, write, seed, or authentication attempt to the production Supabase project.**

## Covered behavior
- Product form rejects negative IQD price via native browser validity.
- Product RPC request creates an item in test-only memory and displays success.
- Duplicate barcode returns a clear conflict message; only one item is added.
- List/search/refetch and live input filtering render correctly.
- Cashier cannot complete checkout without an open shift.
- Unknown barcode returns an error; known barcode updates basket and total.
- Quantity cannot exceed available test inventory.
- Shift cannot open with negative opening amount; valid amount enables checkout.
- Insufficient cash input is blocked; cash-only checkout in browser fixture shows simulated receipt link.
- Receipt list displays a result from isolated local fixture.
- Cash movement, shift closing and end-of-shift summary all run through real UI handlers against fixture.
- Bad UUID for staff assignment is rejected before RPC.
- No unhandled JavaScript runtime errors in tested scenarios.
- The fixed 1020px+ PC shell, fixed supermarket banner and window scroll lock remain intact.

## Checks run together
- 69 Node static tests
- 10 real PostgreSQL concurrency integration tests against isolated disposable PostgreSQL 16
- Chromium: 60/60 card labels legible + fixed PC screen and keyboard UI + actual forms against in-browser fixtures

## Remaining blockers to production
This is **not** a live Supabase Auth/RLS or device E2E test. It does not verify account invitations, tenant isolation through genuine JWTs, physical barcode devices/printing, or Windows cash drawers. A browser mock is intentionally not a substitute for real server acceptance and financial data reconciliation.

No approved Home CSS, module names, 12-card 3x4 positions, 48 subcards, icon identities, or real database functions were changed.
