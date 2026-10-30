# V43 — bank-neutral stock and price reservation (DISPOSABLE LAB, NO-GO)

**2026-10-30. Not a bank integration.** This is a staged extension of ZHIROX371 V42, designed to eliminate a critical gap: inventory and price drift between *preparing* a mixed tender and confirming a future payment. There is no FIB, card/acquirer SDK, or verified bank authorization, capture or reversal path. No real supermarket database, Supabase, PC Relay, printer, Windows install or locked Home is touched.

## What V43 implements

1. A signed cashier may request `POST /api/local/v43/reserve` with the **existing immutable V31 request UUID**. It must refer to that same cashier's **prepared** checkout and V41 external-tender plan. No sale, receipt or stock deduction is made; it is a **logical inventory reservation** held inside local PostgreSQL.
2. Server rebuilds the unit/carton quote from local barcodes and products, holds the shared store lock, checks summed quantities including reservations from **every local cashier**, and compares exact IQD against the original V31 quote. Price, active status, package definition and stock minimum are protected by PostgreSQL triggers. A second terminal cannot oversell stock that is already reserved.
3. A **15-minute** reservation clock is recorded. Importantly, expiration does **not** automatically discard a hold: a payment might already have been captured at the provider. An expired hold must be investigated and safely resolved; automatic cancellation could lose funds or enable duplicate sales.
4. A validated V31 commit consumes an unexpired hold **inside the same transaction** before V26 stock deduction. If V26 fails, the release rolls back too. A mixed sale cannot bypass V43 by calling raw V26 because the sale INSERT trigger requires the hold to be marked `consumed`. V42 still requires immutable external settlement evidence. Neither the cashier UI nor V43's API can create that evidence.
5. A cancellation accepted by V42's no-post-capture guard marks the hold `cancelled` and releases logical reservations atomically. A captured external payment **cannot** be silently cancelled.
6. `GET /api/local/v43/reservation-status?request_id=<UUID>` returns only the authenticated cashier's own reservation, including expiry and an indicator that a DB evidence row exists. It *never* claims provider validation: `provider_payment_verified:false`, `external_settlement_supported:false`.
7. The Sorani isolated V41 tender panel receives a **reserve stock and price** button, with an explicit message that no bank payment has been received. A mixed tender still cannot be checked out by pressing a button.

## Strict limits

- **No weighed-label / prefix-27 reservation in V43.** The database explicitly rejects these quotes pending an exact gram-based variant. Normal cash-only weighable sales remain unaffected.
- Price/stock holds cover **only supported unit and carton codes** in the present V26 catalog. No real bank should charge until a PCI/payment-provider signed verifier and merchant-specific integration exist.
- Reservations currently persist if an external transaction times out without a cashier cancel; an operational queue of stale holds, transaction investigation and supervisor recovery policies are mandatory before live use.
- Cash checkout is still allowed while the Internet is unavailable via local PostgreSQL. Bank/card payments are not: there is **no** offline bank settlement substitute.
- The local DB owner used in CI can directly create *synthetic* V42 evidence to test logic. This must **never** be treated as a genuine payment verification path, and a fully isolated least-privilege app role/service role is needed.
- Even with a valid hold, provider capture may succeed and later local commit fail for unrelated faults (disk, power, role revocation). A durable provider-refund/reversal and settlement-reconciliation protocol with human handling is a formal release blocker.

## Test commands / gates

In a **throwaway PostgreSQL 16 lab only**, apply migration V42 `019`, then V43 `020_reservation_v43.sql` (after preceding V1–V41 migrations). Run `offline/tests/020_reservation_v43.sql` and Node `offline/tests/local-reservation-v43.test.mjs`. The SQL suite checks two cashiers racing for stock, duplicate reserve retry, price and barcode update refusal, direct V26 bypass, cancellation release, exact synthetic V42-backed checkout, cash-vs-bank shift totals, and expired hold fail-closed.

Special isolated V36–V43 UI build (never official):
```bash
VITE_V36_ISOLATED_LAN_PILOT=true VITE_V37_LOCAL_SHIFTS=true VITE_V38_CASH_LEDGER=true VITE_V39_REFUNDS=true VITE_V40_PARTIAL_REFUNDS=true VITE_V41_TENDER_PREFLIGHT=true VITE_V42_TENDER_REPORT=true VITE_V43_RESERVATIONS=true npm run build
node scripts/package-lan-pilot-v36.mjs dist
```

Local V33 TLS pilot additionally requires all earlier flags plus `ZHIROX_V43_INVENTORY_RESERVATIONS_ENABLED=true`. Do **NOT** run against production data or publish a public endpoint.

**Go-live remains NO-GO.** Remaining major work: provider/merchant selection and verified signed payment events; payment-before-stock reserve saga and recovery; typed bank refund/reversal; real device signoff and Windows release; privilege isolation, audit, backups and power/Internet failure handling.
