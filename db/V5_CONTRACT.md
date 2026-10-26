# V5 — Cash Drawer & Shift Reconciliation

Project: Zhirox-New-Project (`qcfmlyyzfykzszvtllrw`)
Working branch: `feature/retail-os-pc-foundation`
Locked Home: `design-lock/pc-home-v1`

## Database
- `retail_cash_sessions`: one open shift per store + authenticated cashier. Tracks opening, close count, sales, net movements, expected cash and variance.
- `retail_cash_movements`: immutable, request-ID-guarded cash-in/cash-out events with mandatory reason.
- `retail_sales.cash_session_id`: all **new posted cash sales** are tied to the cashier's open shift; checkout requires an open shift, except replay of an already posted, identical request.
- The live summary RPC computes posted sales plus net cash movements directly from PostgreSQL, without client-side row limits.
- Closeout obtains a row lock on the session, computes expected cash, records variance and closes the shift atomically.
- Receipt numbering, stock decrement, sale posting and audit remain inside the prior checkout transaction.
- Closed-shift recount with identical counted amount returns the already committed report; changed amount is rejected.

Formula (IQD):
`expected = opening cash + SUM(posted sale totals) + cash in - cash out`
`variance = counted cash - expected`

Because collected tender minus change equals sale total, expected cash uses final posted sale totals, **not** gross tendered notes.

## Access control
- `retail_shift_open`: authenticated owner, manager or cashier for own user.
- `retail_cash_movement`: same, only on caller's **own open** shift.
- `retail_shift_close`: same, only on caller's own shift.
- `retail_shift_summary`: caller's own shift.
- No direct browser INSERT/UPDATE/DELETE privilege on either cash table.
- PostgreSQL RLS enabled for both tables and restricts read access.
- Private functions check `auth.uid()` and server membership. Public wrappers are security invoker.
- Cash movement request UUID is unique per store, payload/actor checked for retries, and the movement table is rechecked **after acquiring the shift row lock** to prevent duplicate concurrent requests.

## PC UI
- `operations.html` / `operations.js`: **سندووق و شێفت**, open form, cash-in/out, close form, live summary and shift history; reload/ambiguous-movement retries use the same request UUID within browser-tab session storage.
- Locked `index.html`: navigation from **دارایی → سندووق** and **شێفت و کارمەندان → شێفتەکان** to `operations.html?view=shift`, no visual changes.
- Checkout submit disabled when no open shift; server enforces the same rule for security.
- Counted money can differ from expected. Variance is recorded and audited, not silently overwritten.

## Limitations and QA
- Do not use this software for a live register yet. No live signed-in end-to-end QA has been performed with multiple cashiers, concurrent checkout, or printer/cash-drawer hardware.
- Auth users, stores, products, balances, shifts and sales still start empty.
- Current model supports one open shift **per cashier per store**, not shared tills/physical register IDs.
- Only IQD integer amounts and cash sales. Refunds, credit, mixed tender, USD exchange, cash drops with handover confirmation, supervisor variance approval and offline operation not yet implemented.
- The front-end cash movement idempotency key survives reload within the same browser tab, but a new tab/device does not automatically restore it; SQL uniqueness still protects same-ID retries.
- End-to-end tests must verify concurrent shift close versus checkout, identical/changed retries, insufficient cash, stock protection and role isolation.
- No changes to old POS or other Supabase projects.

## Delivered SQL
- `db/v5_cash_shifts.sql` contains the V5 schema and latest checked function definitions.
- Applied remote migrations:
  `retail_v5_cash_shift_reconciliation`,
  `retail_v5_live_shift_summary`,
  `retail_v5_cash_movement_concurrent_retry_guard`.
- The SQL file is for reconstructing a fresh V4 project and must **not** be re-applied to the current Supabase project.
- Every delivered change needs an interactive PC code preview plus source links, per `PREVIEW_POLICY.md`.
