# ZHIROX371 V94 — restricted authentication and read-only data pools (isolated test)

**Official cashier release: NO-GO.** This is real PostgreSQL and HTTP
acceptance against the **disposable synthetic** database
`zhirox_v80_disposable` for «مارکێتی تاقیکردنەوە».
No real store data, production account, network device or deployment is changed.

## Change from V93

V93 uses a superuser-level `v80test` CI login for authentication, even
though it restricts the business-data pool. V94 replaces that HTTP
authentication connection with a separate restricted
`zhirox_v94_auth` database identity, created as `NOLOGIN` by
`offline/migrations/039_v94_restricted_auth_role.sql`.

Its grants are limited to `stores(id,name)` SELECT, required login verifier
columns of `local_users` SELECT, and **column-specific UPDATE only on
`local_users.failed_attempts` and `local_users.locked_until`**.
No UPDATE to user role, password verifier, account status or session version;
no SELECT or DML on inventory, sales, receipts, returns, debt or event outbox;
no financial function EXECUTE. Credentials are random and injected only into
CI, then both SQL roles are restored to `NOLOGIN PASSWORD NULL`.

`offline/local-test-market-v94.mjs` exposes only loopback
`127.0.0.1:3313` with explicit `ZHIROX_V94_READONLY_API` opt-in.
It checks the actual PostgreSQL privileges of the new auth connection.
The separate `zhirox_v93_api_reader` connection still fetches all
business values exclusively via the V92 fixed-store security-barrier
views. The existing signed session mechanism and HTTP role checks from V93
are reused with a strict V94 URL/auth-role pair. V81 and default V93 routing
are unchanged.

The lab API routes are `POST /api/local/v94/login` and GET `stock`,
`lots`, `receipts`. Cashiers can read stock; only owner/manager can read
LOTs and receipts. No browser sale, refund, debt or tender write endpoint
is introduced.

## Real PostgreSQL and HTTP CI

`offline/tests/v94_restricted_auth_real_pg.mjs` verifies independent
non-owner database logins, wrong-password failure count increment,
correct-password counter reset, signed owner/cashier session access,
ten concurrent stock reads, unknown-store token refusal, and method/route
denial. It tries to read base product/sale/return data from the auth role,
forge stock or an owner account, change a password hash, delete accounts
and execute FEFO checkout. PostgreSQL must reject those operations.

A before/after database snapshot must still show seven synthetic receipts,
98,000 IQD trial gross, seven outbox events, one remaining sugar unit and
its corresponding LOT balance, and unchanged return records. No customer
money, goods or reimbursement are exchanged. CI saves a PostgreSQL
custom-format **test-only 30-day artifact** after all checks pass.

## Release limitations

This **is not** a financial-write gateway, real cashier authentication
certification or installed Windows EXE. The V88/V90 GUC interlock remains
spoofable by privileged PostgreSQL identities; PostgreSQL ownership and
network/firewall/device access must be secured separately. V94's auth
identity can read password *hashes* for verification (never raw passwords),
which must remain private to the local auth process. There is no
field acceptance for printer, scanner, UPS, multi-PC LAN, real stock count,
card payments, backups off-device or production TLS. Real-world pilot
approval remains blocked.

The owner-locked Sorani desktop 12×4 UI, live production Supabase, domain,
Windows PC, PC Relay, and saved test-market records/backups are untouched.
