# V25 — price-locked local cash checkout (isolated PC pilot)

The V24 React/PostgreSQL pilot had a real safety gap: a sale scanned at 1,250 IQD could be completed at a different price if another cashier or manager changed the catalog before checkout. V25 closes that gap for **cash-only, whole-unit** pilot sales.

## Implemented

- `offline/migrations/005_price_locked_checkout.sql` adds `zhirox_local.checkout_cash_v25` in a disposable PostgreSQL database. It calls the existing store-serialized, idempotent `checkout_cash_v1` in **the same SQL statement/transaction**. The actual server total is compared to `p_expected_total_minor`. On mismatch it raises SQLSTATE `P2501`. PostgreSQL rolls back any sale, stock deduction, receipt counter, ledger or outbox write made by the inner function.
- `POST /api/local/v25/checkout` requires valid local user session, forbids client-supplied cashier/store identity and checks integer `expected_total_minor`. The local API derives identity from the signed, revocable session and returns HTTP 409 `price_changed` on `P2501`.
- The React pilot holds its price quote and the request UUID together in tab-local `sessionStorage` **before** sending. On uncertain 503 or network failure, it retries the **exact same request and expected total**. On a verified `price_changed` (which guarantees transaction rollback), it clears the old quote and requires scanning items again.
- PostgreSQL smoke test asserts zero receipt/stock/outbox effects after mismatch; correct-price success, changed-price replay of original request, and rejection of stale price for new request. Node HTTP tests verify authorization and status mapping; Chromium test covers ambiguous retry and definite mismatch.
- V23 React DEMO checkout stays completely separate. No production Supabase, Home or PC Relay touched.

## Limitations / not production ready

V25 **does not** enable kg/scale, carton pack-specific prices, debt, split payments, returns, coupons, multi-cashier React operation or actual customer sale receipts. This is an isolated loopback pilot with a browser-side pending-request recovery aid, not crashproof durable journaling. Although the inner V1 SQL writes a durable outbox event, **no trusted cloud delivery worker** is implemented yet. The local pilot server must not be exposed to LAN until TLS, device enrollment, permissions, backups, shift verification, and hardware/outage tests are complete.

Only apply migration 005 to an **isolated, disposable** PostgreSQL test DB after 001–004. The older `/api/local/v3/checkout` remains for legacy isolated tests; new React pilot calls only `/api/local/v25/checkout`.
