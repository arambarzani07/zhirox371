# ZHIROX V93 — separate PostgreSQL connections for signed test login and restricted read-only API

**Scope: isolated disposable `zhirox_v80_disposable` CI test market only.
Official cashier release remains NO-GO.**

V92 demonstrated that a real `NOLOGIN` PostgreSQL role could inherit nothing
beyond three security-barrier stock/LOT/receipt views. V93 adds a **different**
`zhirox_v93_api_reader` test login that inherits those views and has no
table access or financial-function privileges. The SQL migration creates it
with `NOLOGIN`; in CI only, a random one-time 32-byte password temporarily
allows a network connection. That permission and password are removed when
integration testing finishes.

The V93 read-only HTTP server binds only to **127.0.0.1:3312**, with an
explicit environment opt-in. It uses distinct `pg.Pool` objects:

1. **Authentication pool:** historically privileged `v80test` CI identity,
   used exclusively for verifying the one synthetic test-store identity,
   user password checking, login failure counters, session issuance and
   token revalidation. This pool is not used for business-data responses.
2. **Data pool:** separately connected `zhirox_v93_api_reader`, used for
   all stock, LOT and receipt values through precisely the V92 view grants.
   It independently checks PostgreSQL `current_user` and denied base-table
   privileges and fails closed if it is not the actual restricted identity.

The only HTTP routes are `POST /api/local/v93/login`,
`GET /api/local/v93/stock` (owner, manager, cashier),
`GET /api/local/v93/lots` and `GET /api/local/v93/receipts`
(owner/manager). Unexpected methods, query parameters, unknown routes,
other store IDs and unsigned/invalid sessions are refused.
No checkout, returns, tender, customer-debt mutations or SQL construction
from client input are available.

## Real PostgreSQL + HTTP acceptance

After V91 real concurrency acceptance, V92 role and V92 independent-role
acceptance, the CI applies V93 migration, then runs
`offline/tests/v93_dual_pool_api_real_pg.mjs`. It verifies:

- Two distinct `current_user` identities on different authenticated
  PostgreSQL pools, with random credentials never committed to source.
- Real test-cashier and test-owner password login with locally signed
  15-minute tokens, and owner-only LOT/receipt visibility.
- Read-only trial stock and seven synthetic receipts using the restricted
  view SQL; twelve simultaneous authenticated stock GETs.
- Denial of direct table writes, password-hash reads, financial functions,
  forged HTTP writes, unsigned and cross-store requests.
- Identical original V91 persisted sales, stock, outbox and return data
  before and after acceptance. No physical refunds or money transfers.
- The V93 read-only role reverts to NOLOGIN; the CI preserves a
  **30-day**, custom-format synthetic PostgreSQL archive.

## Limitations not represented as completed

This does **not** switch the original V81 API to the restricted data role,
and does not open any financial write API. It is a separate V93 lab route.
The auth process still possesses a privileged PostgreSQL credential, even
though its code path is limited to authentication and test-store checks;
compromise of that process or leaked credentials remains dangerous. A
production solution requires a separately isolated least-privilege auth
service/role and trusted DB-side actor verification, TLS mutual or device
auth, abuse resistance, field audit, physical printer/scanner/UPS/LAN
testing and real operator acceptance. The V88/V90 GUC interlock is
still spoofable by privileged accounts.

Nothing is deployed to the real Kani Chnar store, Supabase, zhirox.com,
Windows PC or PC Relay. The owner-locked 12×4 Sorani PC UI is not changed.
Neither the test-market account nor any real historical backup is deleted.
