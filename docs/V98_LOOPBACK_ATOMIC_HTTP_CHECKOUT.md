# ZHIROX371 V98 — restricted localhost HTTP atomic test checkout

**OFFICIAL LIVE POS: NO-GO.** This is a real HTTP + PostgreSQL integration
against a synthetic disposable CI store «مارکێتی تاقیکردنەوە».
No real customer payment, physical inventory, remote POS or production DB
is modified or authorized.

## Architecture

V98 wraps the existing V97 signed actor-bound atomic FEFO checkout inside a
**strict 127.0.0.1-only HTTP gateway**. It is not a production deployment.
The runtime requires the exact opt-in
`ZHIROX_V98_TEST_HTTP=YES_ISOLATED_V98_CHECKOUT_TEST_ONLY`,
separately authenticated `zhirox_v94_auth` and `zhirox_v95_gate`
PostgreSQL connection strings pointing to `zhirox_v80_disposable`
on loopback, a private session secret and the existing V96 database
HMAC key. The signer key and PostgreSQL credentials stay on the
local server and are never included in HTTP responses.

The gateway independently checks both restricted PostgreSQL identities:
the login role has no financial table privileges, and the gate role can
execute **only the V97 bound function**, never directly update
`products`, insert `sales`, read accounts or invoke V90/V96 bypasses.
The API accepts only these routes:

- `POST /api/local/v98/login`: verify the isolated cashier/owner password
  and return a short-lived signed local session.
- `POST /api/local/v98/checkout`: accepts ONLY a validated
  `request_id` UUID and up to 30 cart lines plus a Bearer session. No
  store/actor/price override, customer data, refunds or unrelated actions.
  The locally authenticated actor and current session version are bound
  by HMAC to the request and cart, and the restricted PostgreSQL function
  handles atomic FEFO sale, LOT allocation, receipt, ledger and outbox.

All routes require POST, JSON bodies of at most 8 KiB, valid loopback
socket peers and Host headers, and no query parameters. No CORS opt-in
or SQL failure stack details are returned. Successful first sale returns
HTTP 201; an authenticated **idempotent replay** returns HTTP 200 with
the same sale and receipt ID. A rejected attempted sale returns HTTP 409.
Failures of the isolated database are HTTP 503 and do not claim a sale.

## Genuine acceptance tests

The CI test begins after V97's real PostgreSQL acceptance, when
there are eight genuine *synthetic* receipts and the remaining sugar stock
is zero. It uses the independently authenticated limited SQL roles and
temporary random PostgreSQL passwords to run two simultaneous HTTP
checkouts (cashier and owner) for water. Both must commit **separate**
receipts and each decrease the tracked LOT stock exactly once.

It then intentionally destroys the response socket **after** a third
HTTP checkout has committed to PostgreSQL. The client observes a lost
response. On reconnect/retry, the same signed cashier session and
identical `request_id` + cart must return HTTP 200 with the original
receipt rather than committing a fourth sale. A changed cart using the
already recorded request ID is rejected.

Final synthetic expectations: 11 receipts, 11 outbox entries, water
global and LOT balance each reduced by exactly 3 base units, sugar
unchanged, and trial gross increased by exactly three *current synthetic*
water prices. Forged sessions, foreign stores, arbitrary actor overrides,
unpermitted HTTP methods, direct SQL writes and unauthenticated
checkouts are denied. The CI disables temporary SQL role login and saves
a custom-format PostgreSQL test snapshot (30-day retention).

## What this does not establish

Loopback-only access is not an authenticated LAN service for real cashier
PCs. This is not tested with interrupted PostgreSQL transactions, a
real printer or scanner, UPS power failure, multiple actual Windows
cashier terminals or an operational recovery procedure. Production still
requires protected secret rotation, device-bound authentication, TLS
for LAN access, monitored health/reconnect, safe local installers,
backup restoration, independent payment approval and security review.
An HTTP error or lost response does **not** by itself prove rollback;
retry with the original immutable request ID is compulsory.

No locked Kurdish Sorani desktop UI, real SQL/Supabase, PC Relay,
DVR, Windows market device, domain or previously saved trial market
is modified or deleted.
