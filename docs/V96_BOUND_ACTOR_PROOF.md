# V96 — signed, one-use actor-bound PostgreSQL preflight (synthetic test only)

**Release: NO-GO.** Target is the disposable PostgreSQL CI database
`zhirox_v80_disposable` and the single synthetic store
«مارکێتی تاقیکردنەوە». No real cashier checkout, live stock,
production Supabase or LAN POS is changed.

V95's database preflight checked a caller-supplied actor UUID. That UUID
was not proof of that user's identity. V96 adds an independently verified,
**short-lived HMAC-SHA256 actor proof** tied to the authenticated session,
store UUID, actor UUID, request UUID, the *exact PostgreSQL jsonb canonical
cart*, expiration and a random 128-bit nonce.

The server-side issuer in `offline/actor-proof-issuer-v96.mjs` accepts a
locally signed session **only if the restricted V94 authentication role
rechecks the actual user's enabled state, role, session version and lockout**.
It obtains PostgreSQL's canonical cart serialization, signs the bounded
test intent using a separate 256-bit HMAC secret, and never sends the
signing key to a cashier or database gate user.

The new SQL routine `preflight_checkout_bound_v96` is SECURITY DEFINER
with fixed search_path and a runtime check of the exact disposable
database, test-store identity and `session_user='zhirox_v95_gate'`.
A private database table holds the HMAC verification key, a unique
nonce ledger denies replay, and a new reason-coded audit records allow
and refusal decisions without passwords, notes or full carts.
`pgcrypto.hmac` validates the MAC inside PostgreSQL. The restricted
gate role's permission to call the prior **unbound V95** routine is
revoked; it can call only the V96 bound entrypoint.

## Actual independent three-identity test

After the V95 database fixture and acceptance, CI provisions a **random**
HMAC key in the disposable database, and temporarily enables real
PostgreSQL network logins for the restricted authentication and gate
roles. The test verifies good/wrong synthetic login passwords, one
allowed intent, and denials for identical proof replay, actor switch,
request switch, cart tampering, invalid signature, expired proof and
real stock shortfall. It must see eight V96 audit records (1 allow,
7 denials), exactly two consumed nonces, and no change to the
existing seven trial receipts, 98,000 IQD synthetic gross, event
outbox, LOT stock or returns. Temporary SQL login passwords are reset
to NOLOGIN, and a custom-format synthetic PostgreSQL dump is uploaded
with 30-day retention.

## Critical remaining limitations

This is **identity binding for a test-only preflight**. It does not
reserve stock, debit accounts, create a receipt, execute a return,
or issue a financial authorization. A valid preflight can become stale
before a concurrent cashier checkout. Compromise of the trusted
proof-issuer process or HMAC key can compromise actor attestation;
the database owner can bypass privilege guards. Real production requires
a trusted, atomic, scoped checkout under least privilege, secret
rotation and protected configuration, TLS/device enrollment, auditing
and physical supermarket acceptance. No network-accessible V96
HTTP checkout API is introduced.

The original Sorani RTL locked PC Home, existing V81–V94 routes,
production database, Supabase, PC Relay, Windows 10 PC, domain and
test-market account are unchanged. No existing records are deleted.
