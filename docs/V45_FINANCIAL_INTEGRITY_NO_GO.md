# V45 — financial discrepancy audit for offline mixed-tender readiness

**Status: DISPOSABLE PostgreSQL 16 lab, financial controls only; provider payments remain NO-GO.**

V44's manager exception queue and immutable notes already exist on `main` (PR #41). V45 is an **additional independent accounting-integrity diagnostic**, not another review system.

## What it checks, without changing financial records

`zhirox_local.financial_integrity_audit_v45(store_uuid)` derives seven fixed categories from V31 checkout intents, V41 tender plans, V42 external evidence, V43 stock/price reservations and committed sales:

- `evidence_pending_sale`: an external evidence record exists but the V31 sale is not committed; requires urgent reconciliation
- `evidence_cancelled_intent`: exceptional cancelled intent accompanied by external evidence; never dismiss
- `expired_held_stock`: a 15-minute stock hold expired while checkout remains prepared; does **not** automatically release held goods
- `missing_reservation`: a prepared external tender without a stock hold; not safe for capture
- `sale_without_evidence`: a mixed sale marked committed but evidence/sale row is missing
- `sale_without_consumed_hold`: a committed mixed sale without correctly consumed V43 hold
- `sale_amount_mismatch`: a committed mixed sale with differing quote, receipt, or recorded external amount

All checks have a count, a **proposed** external IQD amount, and severity. These values are NOT bank balances and do NOT prove payment. A V42 evidence row is database evidence (CI may use **synthetic** evidence), not cryptographic authenticity. Do not use this report as merchant settlement.

## Access and safety

The private V33 TLS gateway opt-in `ZHIROX_V45_FINANCIAL_INTEGRITY_ENABLED=true` requires all V34–V44 gated services. `GET /api/local/v45/financial-integrity` accepts only an enabled signed **manager/owner** account. Store ID is always derived from the authenticated session, never the request query. Any POST, explicit payment success, provider verification, refund, or stock release is rejected or unavailable. The Sorani V44 manager panel gains a separate read-only button when `VITE_V45_FINANCIAL_AUDIT=true`. Nothing about the locked Home, default DEMO and official release guard is loosened.

## Disposable test only

Apply migrations V1–V44 in their existing CI order, then `offline/migrations/022_financial_integrity_audit_v45.sql` **only to a throwaway PostgreSQL test database**. Run `offline/tests/022_financial_integrity_v45.sql` to prove synthetic captured-but-uncommitted, expired and unreserved cases, manager note does not settle funds, audits do not mutate stock/receipts and clean synthetic settlement clears the correct alert. Node checks test role separation; Chromium checks the Sorani manager view.

```bash
node --test offline/tests/local-financial-audit-v45.test.mjs
VITE_V36_ISOLATED_LAN_PILOT=true VITE_V37_LOCAL_SHIFTS=true VITE_V38_CASH_LEDGER=true VITE_V39_REFUNDS=true VITE_V40_PARTIAL_REFUNDS=true VITE_V41_TENDER_PREFLIGHT=true VITE_V42_TENDER_REPORT=true VITE_V43_RESERVATIONS=true VITE_V44_RECONCILIATION_LAB=true VITE_V45_FINANCIAL_AUDIT=true npm run build
node scripts/package-lan-pilot-v36.mjs dist
```

## NO-GO blockers

Actual bank/merchant provider must be chosen and contracted; verified webhook/terminal finality, signed payload anti-replay and least-privilege provider role must be implemented. Safe compensation after provider capture, real bank reversal/refund, multi-register crash and UPS trial, signed Windows deployment, actual thermal printer, independent backup restore and formal owner acceptance are outstanding.

**NO official banking or in-store deployment is authorized by green CI.**
