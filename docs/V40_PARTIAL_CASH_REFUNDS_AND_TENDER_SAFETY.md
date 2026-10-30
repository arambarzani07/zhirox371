# V40 — partial original-line CASH returns and strict mixed-payment NO-GO

**Date:** 2026-10-30. **Status: software-only, disposable PostgreSQL and isolated LAN trial. NO GO for official/live use.** Locked Home remains unmodified. Neither production Supabase, real Kani Chnar register nor PC Relay are touched.

## Scope delivered
- Partial refunds use integer **base units** from the immutable V34 receipt: whole pieces or integer grams for the original sale line. The cashier cannot send a refund amount, selling price, product ID, exchange rate or stock delta. The actual amount is derived exclusively in PostgreSQL.
- To avoid rounding overpayment, let original line amount `M`, base quantity `Q`, previously refunded quantity `q` and value `v`, and newly returned quantity `n`. The new cash refund is `floor(M * (q+n) / Q) - v`. A 3-piece 100-IQD carton returned as 1+1+1 gives **33+33+34**, never 99 or 101. At `q=Q`, sum of all refunds is EXACTLY original amount.
- `offline/migrations/017_partial_cash_refunds_v40.sql` creates immutable append-only cash partial refunds. It serializes against the same store-row lock used for sales, cash movements and shift close. Subsequent partials may not exceed the original base quantity; an original line already fully returned via V39 cannot be partially refunded, and V39 cannot fully refund a line with any V40 partial returns. Manager/owner authorization and distinct cashier are checked against locally enabled user records. Cash must be available *on the refunding cashier's open shift*.
- Optional `restock=true` returns only the physically inspected, sellable base units to stock in the **same SQL transaction** as the cash refund and its outbox event. For damaged/expired goods use `restock=false` (the default).
- Append-only UUID retries are idempotent. A changed quantity, manager, shift, restock choice or reason with the same refund UUID is a conflict. Immutable stock/outbox records must not be duplicated. V38/V39 cash summary and shift closing subtract **both V39 full and V40 partial cash refunds**, including when checking subsequent expenses and cash-outs.
- `offline/local-partial-refunds-v40.mjs` is the opt-in separate manager/cashier signed, same-store API with `GET /api/local/v40/refundable-lines?sale_id=<uuid>` and `POST /api/local/v40/partial-refund`. Only the verified principal(s) determine store and users. The Sorani UI is a **separate lab-only** section inside an authenticated V36+V37+V38+V39 isolated cashier, never browser Demo.
- **Mixed payment is NOT YET SUPPORTED.** V31 is intentionally cash-only; a client field claiming `card`, `split`, `credit` or `tenders` without actual settlement will not be silently booked as cash. The server rejects any extra checkout fields. Future card/FIB authorization requires provider-confirmed offline-compatible protocol, atomic settlement evidence, cash-vs-noncash accounting and refund reversal before enabling mixed tenders.

## Staging setup (disposable laboratory only)
After applying prior isolated PostgreSQL migrations 001–007, 009, 011–015, apply **017** on a fresh test database (there is no migration 016; it is the V39 concurrency test fixture). Run `offline/tests/017_partial_cash_refunds_v40.sql` only against disposable data. Run Node API tests and review GitHub Actions' SQL/Chromium results. V40 gateway requires previous V33–V39 opt-in flags and `ZHIROX_V40_PARTIAL_CASH_REFUNDS_ENABLED=true`; no internet publication.

```bash
npm install
VITE_V36_ISOLATED_LAN_PILOT=true VITE_V37_LOCAL_SHIFTS=true VITE_V38_CASH_LEDGER=true VITE_V39_REFUNDS=true VITE_V40_PARTIAL_REFUNDS=true npm run build
node scripts/package-lan-pilot-v36.mjs dist
node --test offline/tests/local-partial-refunds-v40.test.mjs
node scripts/release-readiness-v35.mjs --json
```

## Acceptance blockers remain
Partial line returns are **cash-only** and do not represent card/bank, split tender, credit/debt refunds or exchange transactions. They do not provide printed return slips, fiscal/legal tax treatment, a manager station with tamper-resistant approval, real cashier provisioned SQL privileges, signed Windows installer, live schema migrations, thermal printer spooler, private LAN CA/firewall enrollment, durable independent backup/restore on a second PC, UPS/power-loss trials or formal owner physical acceptance.

**An isolated green CI is not authorization for live market transactions.**
