# ZHIROX371 V97 — signed, restricted, atomic FEFO checkout in isolated PostgreSQL

**Test-only financial *database accounting* transactions; not physical cash or production cashier. Release: NO-GO.**

V96 bound a single-use HMAC actor proof to the authenticated test cashier,
request, cart and expiry, but could only audit a nonfinancial preflight.
V97 introduces a restricted *SQL function*, not a network-accessible cashier
write API. It uses the dedicated `zhirox_v95_gate` database login, which
still has **no direct INSERT/UPDATE rights on sales, stock, receipts,
stock ledger, outbox or LOT allocations**.

The newly installed `checkout_proven_fefo_v97` function is
`SECURITY DEFINER` with an explicit search path and a hard requirement
for the exact disposable PostgreSQL database, one named test market and
`session_user='zhirox_v95_gate'`. Its HMAC-SHA256 verification binds
the store, authenticated actor UUID, current **session_version**, request
UUID, PostgreSQL jsonb canonical cart, expiry and 128-bit one-use nonce.
The V97 server-side issuer `proven-checkout-v97.mjs` revalidates a locally
signed token with the low-privilege V94 auth pool, independently reads the
canonical cart from PostgreSQL, and signs an intent valid for ~45 seconds.
The unbound V95 preflight and V96 bound preflight entrypoint are no longer
callable by this gate role.

When a valid proof arrives, PostgreSQL also locks and checks the account's
enabled status, cashier/manager/owner role, lockout and **unchanged
session_version**. A unique nonce is then reserved and the existing tested
`checkout_unified_fefo_v90` runs inside one PostgreSQL transaction, using
its store-wide lock, normalized lines, FEFO nonexpired LOT allocation,
sequential receipt counter, stock ledger and outbox. A sale cannot be
partially written when the nested checkout fails. A rejected attempt is
recorded without a completed receipt. The decision and receipt metadata
are appended to the V97 audit (without names, passwords or private notes).

A retry with the **same HMAC nonce** is rejected. A separately signed
retry with the **same request UUID, actor and cart** is an idempotent
replay of the original V90 sale, returning its receipt without a second
stock decrement or outbox event. A changed actor/cart on a reused request
cannot be accepted by the V90 idempotency check.

## Real PostgreSQL acceptance

After the V96 CI fixture, the V97 migration requires seven synthetic
receipts and the one remaining synthetic sugar unit. The genuine separate
restricted auth/gate PostgreSQL logins are temporarily enabled with
random passwords. The integration checks:

- Direct sales, inventory, account hashes, keys, audit reads, unsigned
  V90/V96 mutation and role escalation are denied at SQL privilege level.
- Signed actor, request, cart, MAC, expiry and session version tampering
  are denied without a sale.
- Bumping `local_users.session_version` **after** proof issuance blocks
  the old proof at the database, even before its expiration.
- Two independently signed simultaneous checkout requests fight for
  the last eligible sugar LOT unit; exactly one succeeds. The other
  produces an audit denial; no negative stock or extra receipt.
- A *new* proof for the successful request returns the original receipt
  as a replay without another committed sale or stock/outbox change.
- Final expected synthetic totals: 8 receipts, 8 outbox events, 0
  remaining sugar units/LOTS, trial gross up by the product's current
  test price; all earlier return records untouched.
- All ephemeral SQL role login privileges/passwords are reset to
  `NOLOGIN PASSWORD NULL`. The CI produces a custom PostgreSQL
  `pg_dump` artifact with 30-day retention.

## Limits and next steps

This test proves the database transactional boundary, **not a deployed
sale**. The issuer process and its HMAC secret are still trusted, the
`SECURITY DEFINER` routine is owned by the disposable database owner,
the V90 legacy FEFO route uses a test-only GUC and privileged accounts
can bypass guards. No public cash register write API, online payment,
printer confirmation, barcode hardware acceptance, signed Windows
installer or multi-cashier LAN recovery is delivered here. The
restricted credential must never go to a browser or cashier terminal.
Before a live pilot, harden key storage and rotation, external service
isolation, authorization tests, immutable financial audit, real offline
hardware acceptance, backup restoration and operator controls.

No production SQL Server/Supabase, Windows PC, DVR, domain, live store
stock or locked Sorani 12×4 Home is modified. No test market is deleted.
