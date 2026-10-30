# V41 — Split-tender preflight (strict NO-GO external settlement)

**2026-10-30. Disposable isolated PostgreSQL + private HTTPS LAN test ONLY. No real bank/card settlement. Not an operational split-payment release.** Production Supabase, existing store data, PC Relay and the locked 12×4 Sorani Home remain unchanged.

## The central accounting decision

V31 currently books every committed sale as **100% cash** in V37/V38 closing. We cannot safely let the cashier enter “card paid”, “bank transfer received”, FIB confirmation or debt and automatically create a cash sale: that would invent funds and misstate drawer balances. V41 adds a **prepared split-tender PLAN**, not payment collection.

- For a V31 **prepared** checkout ID, the authenticated cashier can record an immutable allocation `cash_minor + external_minor == expected_total_minor`. Supported proposal labels are `none`, `card`, `bank_transfer`; these are *intent descriptions only*. Any external part is `external_unverified`. The system deliberately provides **no method to mark external funds settled** and **no captured authorization IDs**.
- A **database BEFORE INSERT ON sales** trigger rejects every mixed plan regardless of whether the caller used the V41 API or bypassed it to call older `commit_checkout_v31`. No receipt, stock decrement, cash posting, shift revenue or sale event occurs from an unverified bank proposal. Cash-only plans can complete existing V31 atomic cash checkout.
- Plans are **append-only**, uniquely tied to the durable V31 request ID and cashier/store, with a store-wide row lock and strict integer IQD validation. Identical retries return the original plan. Altered allocations/actor or attempts to update/delete the plan fail. Abandoned unverified plans can be **explicitly cancelled** via V31; the audit record is not erased.
- Cash drawer account remains unchanged for pure-cash sales. There is no fake processor, payment-success button, or card webhook simulation in the market execution path.

## API, Sorani UI and startup

All prior V33–V40 private TLS / peer ACL / session conditions remain in place. V41 opt-in flag: `ZHIROX_V41_TENDER_PREFLIGHT_ENABLED=true`; disabled by default.

`POST /api/local/v41/tender-plan`:
```json
{"request_id":"<PREPARED_V31_UUID>","cash_minor":1000,"external_minor":1500,"external_method":"card"}
```

`GET /api/local/v41/tender-status?request_id=<UUID>` returns the immutable allocation with `external_settlement_supported:false`; an existing mixed plan always reports `checkout_allowed:false`.

Frontend special build (test only, not official):
```bash
npm install
VITE_V36_ISOLATED_LAN_PILOT=true VITE_V37_LOCAL_SHIFTS=true VITE_V38_CASH_LEDGER=true VITE_V39_REFUNDS=true VITE_V40_PARTIAL_REFUNDS=true VITE_V41_TENDER_PREFLIGHT=true npm run build
node scripts/package-lan-pilot-v36.mjs dist
node --test offline/tests/local-tender-preflight-v41.test.mjs
node scripts/release-readiness-v35.mjs --json
```

A dedicated “prepare only” button creates a V31 intent but **does not commit it**. The V41 Sorani form quotes the planned cash/external allocation. The cashier checkout button stays disabled while the external component is unverified, including after reload and network uncertainty. A separate cancel button requests server-confirmed cancellation before the browser discards the pending UUID. There is no direct checkout through the mixed-payment workflow.

Run migration `offline/migrations/018_split_tender_draft_v41.sql` **after V40 migration 017, only on a disposable PostgreSQL 16 lab database**. `offline/tests/018_split_tender_draft_v41.sql` proves that bank proposals leave stock, receipts and cash untouched, while pure cash plans commit and replay correctly. Node API tests prove actor scoping and rejection of forged `settled` or `provider_approved` flags; Chromium tests prove the browser cannot create a bank “paid” receipt.

## Not implemented and not authorized

- Actual POS / provider SDK, FIB payment gateway, card authorization, capture, cancellation, settlement/chargebacks.
- Verified asynchronous external settlement events, durable tender ledgers linked to actual settled sales, cash-vs-bank shift summary, supervisor reconciliation.
- Split tender refunds (the V39/V40 cash refund path must not be reused on noncash funds).
- Local Windows printer spooler, signed installer, real scanner scale, CA enrollment, least-privilege SQL role, UPS, backup restore on a different physical PC, physical acceptance.

Only after the specific bank/payment provider's signed verification mechanism, merchant account, refund policy and ledger have been integrated and **proven with real test credentials and hardware** can noncash commits be considered. Do not bypass the database gate by trusting user-entered “approved” flags.

**Production approval remains NO-GO.**
