# ZHIROX371 V112 — signed atomic FEFO checkout for bundle/set (isolated lab)

## Scope and release status
**ISOLATED DISPOSABLE PostgreSQL TEST ONLY; production launch NO-GO.**
The original V97 cashier route consumes product-id/base-unit lines at product unit prices. Feeding pack counts into that route is financially incorrect. V111 adds a signed read-only server pack quote. V112 supplies an **independent** SQL gate for package-priced, single-SKU bundle/set test sales, without changing V97 or the live cashier.

## Implemented
- `offline/migrations/047_v112_signed_pack_atomic_fefo.sql`: restricted `zhirox_v95_gate`-only `checkout_proven_pack_fefo_v112` SQL function requiring the exact isolated V80 market and live V96/V97 HMAC proof over authenticated cashier, session version, request UUID, JSONB cart, expiry and single-use nonce.
- Every signed line specifies `barcode`, `qty`, `expected_price_minor`, `expected_units_per_pack`. Database independently reads active barcode owner, pack size and price under row locks. A changed pack definition, bad barcode, inactive product, stale price, tampered signature, expired or revoked session rejects.
- A single database transaction holds the store lock and atomically writes **sale with its original barcode-shaped request**, strictly server-calculated total, receipt number, pack mode/name/barcode/pack count/size/price/quantity snapshots, aggregate base stock decrement, immutable stock ledger and outbox, and **original-line FEFO LOT allocations** across opening and received inventory. Expired LOTs cannot fund sales; insufficient available units rejects with rollback and audit.
- Repeated exact request UUID, actor and signed lines with a **new** valid HMAC proof returns the original receipt and leaves stock/LOT/outbox untouched. Reusing a nonce or modifying any original field rejects.
- Existing V84 return records multiply base-unit quantity by unit_price_minor, which for bundles is *per-pack*. `v112_deny_incorrect_pack_refunds` blocks those unsafe legacy returns until a separate pack-price-aware original LOT refund route is implemented. **No actual customer payment or cash refund is recorded** by the V112 pack API.

## Server-only client
`offline/proven-pack-checkout-v112.mjs` exposes
`createV112SignedPackCheckoutAdapter` with **distinct restricted auth/gate database pools**.
The callable's `prepare({token,request_id,lines})` uses V111's trusted price/FEFO quote and returns `prepared_lines` containing canonical barcode, quantity, price and pack size; **no sale** occurs during prepare. For resilience, a future client must durably save this snapshot with its request UUID **before** attempting `checkout({token,request_id,prepared_lines})`. This permits a signed idempotent receipt replay after lost acknowledgment or stock depletion, without silently re-quoting the modified catalog. No HTTP endpoint was added. `payment_settled:false` and `refund_authorized:false` are explicit.

## CI acceptance
After the existing isolated V80–V104 fixtures, the V81 GitHub Actions workflow runs the V112 SQL migration and `offline/tests/v112_signed_pack_fefo_real_pg.mjs` using disposable PostgreSQL 16 and temporary restricted credentials.
The test checks:
- no gate permission to read keys, sales or direct inventory mutation;
- signed price and pack-count integrity, replay/expiry/actor/session revocation;
- stale price rejection without sales, stock or ledger changes;
- committed 6-base-unit bundle plus 3-base-unit set with original pack-price total 5,500 IQD and separate snapshot lines;
- original receipt ID on a second signed request with the same UUID and *exact retained prepared lines*;
- rejection of incorrect V84 pack refund with no restocking;
- two simultaneous cashier checkout attempts for one final 3-unit LOT, exactly one winner, no oversell;
- sales/outbox/receipts/stock/lot totals and reasons in the V97 audit.

These are synthetic monetary figures, not actual funds paid or observed physical stock.

## Unfinished requirements before changing Style A or beginning final Canva rebuild
1. Server-authoritative **original-pack-price partial/full refund** with immutable LOT attribution, rounding policy, manager approval and optional restocking.
2. Pack catalog registration/aliases in the V90/V97 database, including historical versioning, actor privilege boundary and no cross-mode barcode conflicts.
3. Mix all price modes (unit, carton, bundle, set, gram) in **one proven sale** rather than distinct V110/V112/V97 prototypes; correct combined receipt, tender/discount/return mechanics.
4. Authenticated secured LAN API, offline queue durability, hardware scanner, 58/80mm thermal printer, crash/backup/recovery, multi-PC real environment tests.
5. Release governance: real physical count, complete financial reconciliation, security review, supervised deployment and explicit go-live authorization.

**Do not merge into main or modify live market database until release gates are satisfied.** Preserve all test store records and the previously locked 12×4 PC Home until the user starts the deliberate Canva visual redesign.
