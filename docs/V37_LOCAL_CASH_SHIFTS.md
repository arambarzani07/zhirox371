# V37 — offline PostgreSQL cash shifts, cashier-scoped sales and close reconciliation

**Date:** 2026-10-30. **Status:** isolated, opt-in local-LAN developer test ONLY; not an official or production cashier. **No live data or PC Relay modification.** Locked Home and unrelated Demo modules remain unchanged.

## Server invariants
- `offline/migrations/013_cash_shifts_v37.sql` creates independent cashier/store cash shifts. At most one open shift per cashier. Only enabled local `owner`, `manager`, or `cashier` account may open their own shift through verified V3 session.
- Opening cash is a nonnegative integer IQD amount. Shift ID is a UUID. Duplicate exact open retries return original row; conflicting IDs/amounts and simultaneous second shifts are rejected.
- A `BEFORE INSERT` trigger binds V31 durable checkout intents to **one currently open shift**, and a second trigger binds **actual committed sales** to the *same* shift. No-shift sales, forged shift IDs and direct V26 inserts without a prepared V31 intent reject with SQLSTATE `P3701`. Existing older sales remain unattributed: do not invent historic shifts or backfill.
- V31 commit (store-lock, stock check, receipt and outbox) and V37 shift close both use the **same store-row lock**. The cashier cannot close over an unfinished prepared intent. Closing cash derives committed cash sales only from actual local PostgreSQL sales rows for that exact shift and cashier. Expected cash = opening cash + cash sales. Variance = counted cash - expected cash. Close is idempotent for the same counted amount; subsequent differing amounts are rejected.
- **V37 only supports cash sales.** It does NOT implement cash-out/in, expenses, change due, returns, debt, split payments, discounts or supplier payments yet. Those must not be misrepresented in the expected balance; the operational manager must stay in an isolated test environment until a full cash ledger exists.

## Authenticated test-only LAN API
Start isolated V33 test gateway with V34, V35, V36 flags, plus `ZHIROX_V37_LOCAL_SHIFTS_ENABLED=true`. Apply V37 migration to a disposable PostgreSQL database *before* testing. All requests are TLS protected and pass V33 exact private peer and Origin restrictions. No public Internet route or browser DB credentials.

- `GET /api/local/v37/shift`: current open shift, or `null`. Derives `store_id` and `cashier_id` exclusively from verified bearer.
- `POST /api/local/v37/shift/open`: exactly `{ "shift_id": "<uuid>", "opening_minor": 10000 }`. Only the authenticated cashier's shift.
- `POST /api/local/v37/shift/close`: exactly `{ "shift_id": "<uuid>", "counted_minor": 12500 }`. Returns server-derived cash sales, expected cash and counted variance.
- No path accepts browser-supplied `store_id`, `cashier_id`, `role`, price or shift revenue.

## Separate V37 UI bundle
```bash
npm install
VITE_V36_ISOLATED_LAN_PILOT=true VITE_V37_LOCAL_SHIFTS=true npm run build
node scripts/package-lan-pilot-v36.mjs dist
node scripts/release-readiness-v35.mjs --json
```
Only in this explicitly isolated V37 staging bundle does the Sorani RTL cashier show PostgreSQL shift open/close and disable its checkout button until the shift is verified open. The SQL triggers enforce the rule independently of the browser; loss of status fails closed. The ordinary DEMO app remains untouched, with release flag `official` still refused.

CI: `offline-foundation.yml` runs older V33 concurrency and backup/restore tests FIRST, then applies migration 013 **only to throwaway PostgreSQL** and executes `offline/tests/013_cash_shifts_v37.sql` inside a transaction rolled back on completion. `v37-cash-shifts.yml` runs Node API tests and a mocked Chromium checkout with real shift gating. CI or a source merge is **not** proof of a Windows installation, physical printer operation or formal authorization.

## Blockers before a real market launch
Full cash-in/out and expense ledger, signed refund/debt/split-payment handling, manager oversight and supervisor approval of variances, robust shift journal after power loss, role separation and audit, actual printer success/failed handling, multi-PC LAN with UPS, independent encrypted backup/restore, official Windows installer and hardware acceptance. See `docs/V36_PHYSICAL_ACCEPTANCE_HANDOVER.md`. A pilot must not be run on live supermarket data.

**No production database migration or official cutover is approved by V37.**
