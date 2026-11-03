# ZHIROX371 V111 — signed, read-only server pack quote with FEFO

**Implementation status: isolated PostgreSQL CI proof only. Not a sale, fiscal receipt, hold, or release authorization.**

## Why V97 cannot currently sell a bundle/set
The existing V97 signed checkout passes `[{product_id,qty}]` into V90, whose V1 financial checkout multiplies the **unit's** `products.price_minor`. A fixed bundle/set instead has its own sale barcode, pack quantity and **independent price**. Translating a bundle to `product_id + units_per_pack` without replacing sale-line pricing would charge a false price and lose the mode/name barcode snapshot. Therefore direct pack checkout via V97 must remain **NO-GO**.

## What V111 adds
The guarded `offline/migrations/046_v111_pack_fefo_signed_quote.sql` adds a separate **read-only** `quote_proven_fefo_pack_v111` function in the disposable `zhirox_v80_disposable` test database. It:
- Accepts only the restricted `zhirox_v95_gate` database session and the exact test market; direct table reads/writes from the gate remain prohibited.
- Verifies the *existing* V97 HMAC-SHA256 proof over store, actor, session version, request ID, **exact JSONB cart**, expiry, and nonce; checks current account lockout/revocation. Quotes do not burn sale nonces or issue receipts.
- Accepts only fixed `bundle`/`set` barcode lines with integer pack count, checks stored price, base-unit conversion, active ownership and totals from the **server-owned** barcode table.
- Aggregates required base units **across multiple bundles and sets of the same SKU**. Checks both global stock and the sum of **nonexpired, positive V90 LOT balances**. Fails closed if either is inadequate.
- Returns an informational quote, mode/name/base-unit breakdown and the reason for refusal. The quote does **not** reserve a LOT, authorize payment, decrement stock or write the sale/outbox/receipt/return journal.

The synthetic `V111-BUNDLE`, alias and `V111-SET` barcodes are added only in the exact disposable CI store by `offline/tests/059_v111_pack_quote_fixture.sql`. They are not imported into the live market, Supabase, Windows database or deployment.

## Server-only quote adapter
`offline/proven-pack-quote-v111.mjs` exposes
`createV111SignedPackQuoteAdapter({authPool,gatePool,sessionSecret,proofKeyHex})`.
This callable requires two **distinct, server-side PostgreSQL pools**, uses
V97's authenticated proof issuer, rejects non-integer/malformed pack lines,
and returns `checkout_authorized:false` even for a positive quote. There is
**no** exposed cashier HTTP write endpoint and no stock hold. Alias barcodes
are the same SKU/pack price as their primary barcode.

## Acceptance and safety boundary
`offline/tests/v111_signed_fefo_pack_quote_real_pg.mjs` exercises: valid signed price from server, alias ownership (fixture), aggregate 6+3-unit conversion, stale account refusal, MAC/actor/request/cart tampering, expiration, bad input keys, insufficient LOT stock, rejected unit barcode and changed server price. It calls V97 **with a pack-form cart** and explicitly verifies refusal with no sales, stock, ledger, LOT allocation, or money changes.

CI invokes this after the genuine V97 restricted PostgreSQL test and before V98 API tests, without modifying the locked PC interface.

## What remains before production pack sales
- Implement a **new** restricted HMAC-bound transaction which accepts barcode-pack lines, snapshots the **independent pack price**, atomically decrements base units, and writes FEFO LOT allocations, receipt lines, outbox and idempotency in one SQL transaction.
- Attach controlled server catalog registration to the same PostgreSQL environment, including version checks and alias ownership. V110 registration is a separate isolated prototype.
- Test terminal and printer restart, returns attributed to original LOTs and original pack prices, actor revocation and real hardware with the original PC-only UI unchanged.
- Require explicit approval for any schema changes, main branch merge or market activation. No data deletion or live SQL writes.

Do not turn a positive V111 **quote** into a sale. Quotes are not authoritative stock reservations: concurrent checkouts must recheck both prices and LOT availability atomically.
