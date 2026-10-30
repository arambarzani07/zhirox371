# V42 — Cash and bank settlement accounting boundary (NO-GO official payment)

**2026-10-30. Isolated PostgreSQL 16 lab ONLY.** V42 fixes cash-vs-bank accounting in the *schema and tests* but is NOT an integrated merchant terminal, FIB, bank account or approved payment processor. There is **no HTTP endpoint or merchant adapter for recording a verified external payment**. Real production, Supabase, legacy POS, locked Home and PC Relay remain unchanged.

## Problem that V42 addresses

V31 previously counted every committed sale as cash in shift closing. A 25,000-IQD split sale with 10,000 cash and 15,000 bank would wrongly add all 25,000 to the drawer. V41 blocked all split sales because no processor verification exists. V42 models what is required *after an independent bank provider actually verifies funds*: an append-only, uniquely keyed external receipt, exact matching V41 amount/currency/method/intent, and a V31 sale trigger that requires that evidence. The demo test inserts a **synthetic external proof directly as PostgreSQL test-owner**; no such proof may be issued through a live cashier. It is not evidence that any real payment happened.

- Original gross sale and printed receipt remain 25,000 IQD.
- Cashier drawer receives 10,000 IQD **cash only**.
- Separate external tender ledger accounts for 15,000 IQD of provider payment **only after settlement evidence is present**. No app endpoint to submit evidence exists until a vendor-specific verified merchant service and its own least-privilege database role are installed.
- Example with 1,200 IQD starting cash: expected drawer = 11,200 IQD (before expenses and cash refunds), not 26,200 IQD.
- The provider receipt key is unique across all stores for a provider; immutable evidence cannot be updated/deleted. V31 commit remains idempotent and checks product price/stock on the server.
- A verified external payment **cannot be silently cancelled** by V31; errors after external capture require an explicit provider reversal/refund mechanism and reconciliation. Unresolved prepared transactions block shift close.
- V39/V40 direct cash refunding of mixed sales is forbidden pending a provider-aware refund/reversal workflow. The full original line cash-refund mechanism cannot be used to give cash back for a bank-funded sale.
- Read-only signed local report: `GET /api/local/v42/tender-report?shift_id=<uuid>`. Readiness endpoint: `GET /api/local/v42/merchant-readiness` returns `external_provider_integrated:false` and `official_mixed_tender_enabled:false`. There is **no** `POST /verify`, "cashier approved", or "mark bank paid" endpoint.

## Crucial production blockers

1. **Identify the actual merchant payment provider and contract** (e.g., which terminal/acquirer or FIB merchant service); obtain its official API/webhook specification, merchant provisioning and test credentials. Do not treat a screenshot, manual receipt number or PIN entry as authoritative.
2. Provider adapter must validate authenticity of event/signature, merchant/store identity, IQD amount, currency, authorization/capture finality, transaction idempotency, replay/duplicate references and refunds, using a segregated service/database role. **The SQL evidence table by itself cannot verify that proof**; any DB owner could insert synthetic rows in a lab.
3. V31 does not reserve stock/prices during a bank authorization. A confirmed bank payment can therefore precede a failed stock/price commit. Before go-live, create a durable inventory reservation/expiry and an explicit reversal/compensation state machine, plus reconciliation of orphan/timeout cases. **Do not charge real customers until this is solved.**
4. Multi-PC local LAN/payment terminal TLS enrolment, staff roles, audit log, printer/receipt, Windows installer signing, real provider settlement reconciliation, real bank-specific refund processing, backup/restore and physical supervised acceptance still remain.
5. While Internet is unavailable, cashier's **cash-only** sales can continue on local PostgreSQL LAN; unverified online external tender transactions MUST remain pending or be cancelled safely, never fabricated as paid.

## Disposable CI acceptance
Apply migrations through `offline/migrations/018_split_tender_draft_v41.sql` and then `offline/migrations/019_external_settlement_accounting_v42.sql` **only to a disposable PostgreSQL test DB**. The transactional fixture `offline/tests/019_external_settlement_accounting_v42.sql` proves cash/bank segregation, refusal without synthetic proof, event uniqueness, no cash-refunding mixed sales and prevention of silent cancellation after capture.

Feature flags are OFF by default. For the isolated *read-only* report layer only, enable all V33-V41 local lab flags and `ZHIROX_V42_TENDER_REPORT_ENABLED=true`. The Sorani staging report also requires `VITE_V42_TENDER_REPORT=true`. No official release override is made. Hardware tests are not simulated as physical acceptance.

**Release readiness: NO-GO. V42 proves accounting logic only, not secure real-world bank processing.**
