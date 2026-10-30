# V38 — isolated offline cash movements and reconciled cash shift reports

**2026-10-30. Development/test only. NO GO for live financial use.** No real PostgreSQL/Supabase/PC Relay changes, no Windows printer, installer or hardware acceptance. Locked Home unchanged.

## What is implemented
- `offline/migrations/014_cash_movements_v38.sql`: append-only local PostgreSQL cash journal with unique `(store_id,entry_id)`, matching `store_id + cashier_id + shift_id`, and 3 types: `cash_in`, `cash_out`, `expense`.
- Authorized cashier/staff can post cash to **their own open shift only** through the signed local V3 session and opt-in V33 TLS private-peer gateway; no browser-supplied actor/tenant or sales totals. A precise reason (3–240 characters), safe positive integer-IQD amount and stable UUID are mandatory.
- Database serializes writes using the same **store-row lock** as V31 sales and V37 shift open/close. The cash balance cannot go negative; duplicate same-ID retries return the existing immutable entry; conflicting same-ID requests are rejected. UPDATE and DELETE are prohibited through a database trigger. Database owners/superusers retain elevated capabilities: least privilege is a separate rollout gate.
- Shift report derives `opening + committed cash sales + cash_in - cash_out - expense` on the server. Closing stores a counted total and signed variance; legacy V37 closing cannot silently ignore nonzero adjustments because V38 DB trigger verifies the true expected amount.
- `createLocalCashLedgerHandlerV38`: `POST /api/local/v38/movement`, `GET /api/local/v38/summary?shift_id=<uuid>`, `GET /api/local/v38/movements?shift_id=<uuid>` (max 100 latest), and interception of the existing `POST /api/local/v37/shift/close` to use V38 reconciliation. All scoped by signed server-side cashier/store identity. Browser gets no DB credentials.
- Sorani RTL V38 cash form and shift report are only mounted on a **separate isolated V36+V37+V38 staging build**. A lost network acknowledgement retains the same entry UUID and freezes fields for retry rather than silently creating new cash activity. Production/official Vite build remains blocked.

## Testing and lab setup
Apply migrations 001–007, 009, 011, 012, 013 and **014** in order to a fresh **throwaway PostgreSQL lab database**, not a market DB. Older V33 CI backup/restore and races run before enabling V37/V38 constraints; V38 SQL test is rolled back. CI includes test of same UUID replay, denial of other cashier, overdraw, append-only, old V37 close bypass and exact expected/variance values.

To compile the isolated **NOT OFFICIAL** demo-free cashier test interface:

```bash
npm install
VITE_V36_ISOLATED_LAN_PILOT=true VITE_V37_LOCAL_SHIFTS=true VITE_V38_CASH_LEDGER=true npm run build
node scripts/package-lan-pilot-v36.mjs dist
```

To test on an **isolated** V33 TLS local pilot, ALL prior V33–V37 requirements stay enabled, plus `ZHIROX_V38_CASH_LEDGER_ENABLED=true`. Never expose via public network or run against live data.

**Limitations and formal blockers:** this is cash-only and lacks manager cash-expense approval, reconciliation adjustments/reversal protocol, separate supervisor override, refund/debt/split payment and a complete expense accounting system. Receipt printer hardware, secure Windows install, staff roles, backups, UPS, physical LAN and real scanning/scale acceptance are still unverified. Expense 'reason' is an audit note, **not** a supplier payment/accounting posting. Any mismatch or unverified operation fails closed.

Source documentation of acceptance conditions: `docs/V36_PHYSICAL_ACCEPTANCE_HANDOVER.md`. **No production authorization or automatic deployment is implied by a passing PR.**
