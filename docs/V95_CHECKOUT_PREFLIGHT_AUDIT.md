# ZHIROX371 V95 — audited checkout-intent preflight (isolated CI ONLY)

**Official live cashier status: NO-GO.** This is a nonfinancial, disposable
PostgreSQL test using the synthetic «مارکێتی تاقیکردنەوە» store. Do not run
the migration against Supabase, a production LAN database or legacy PC.

V94 proved that authenticated HTTP sessions and base-table reads could be
handled by separate PostgreSQL users with no financial permissions. V95
adds a THIRD independent, initially `NOLOGIN` database identity:
`zhirox_v95_gate`. The role has no SELECT on accounts, no inventory
UPDATE, no sales INSERT, no returns or payment rights. Its sole exposed
function is:

`zhirox_local.preflight_checkout_v95(store, actor_claim, request_id, lines)`

This is a **test-only checkout intent check, not a checkout**. Its
`SECURITY DEFINER` function explicitly guards the database, only accepted
test store, and actual `session_user`, then checks an enabled/unlocked
cashier/manager/owner record and a bounded, strictly shaped proposed cart.
It verifies active products, global stock, and nonexpired unified LOT
availability. A durable `checkout_intent_audit_v95` row stores only
the claimed actor ID, request UUID, allow/deny decision, reason, item count
and timestamp. No customer phone number, password, private note or
full basket is copied into the audit.

The audit data stays in the **30-day CI artifact**. It is append-only
*from the restricted gate user's privileges*, not immutable against a
database owner. Repeated preflight intents append separate records. There
is no payment authorization, stock reservation, receipt, checkout, or
guarantee of later stock availability: concurrent sales can invalidate
a positive preflight before a real atomic checkout.

## Real V95 acceptance

The integration connects by PostgreSQL TCP as the separate restricted gate
user with a random one-time password. It confirms direct SQL stock writes,
account reads, audit reads, and V90 checkout calls are forbidden.
It performs four genuine calls: one allowed synthetic 1-unit sugar
intent, and three denied intents (insufficient stock, invalid quantity,
unknown actor). Exactly four audit entries persist. The existing
synthetic V91 transaction totals (7 receipts, 98,000 IQD gross,
7 outbox events, 1 sugar unit) must remain unchanged. CI resets the role
to `NOLOGIN PASSWORD NULL` and archives the test database.

## Important security limitation

The SQL `actor_claim` is **not cryptographically bound to a signed
HTTP session or a separate database-issued actor proof**. A client with the
V95 gate database login can supply another valid actor UUID; the gate can
only approve a *nonfinancial preflight*, never book a real transaction.
Therefore V95 must **not** be connected to a cashier write endpoint or
treated as a trustworthy production permission to sell. An upcoming
version must implement independently verified proof binding and scoped
atomic checkout under least privilege before even a realistic supervised
cashier pilot may be considered.

The read-only V94 API and locked 12×4 Sorani PC Home are unchanged.
No source code changes, SQL, or deployments touch real store databases,
real cash, Windows 10, Supabase, PC Relay, zhirox.com or any physical
scanner/printer. No test-market records or existing backups are deleted.
