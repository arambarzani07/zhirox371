# Local POS API (isolated test only)

This prototype is **not cashier-ready**. It runs on loopback 127.0.0.1:3301 only; it must NOT be exposed on LAN. A temporary shared test token is not a substitute for real user logins, cashier/store authorization, TLS, or staff permission checks.

Prerequisites: isolated PostgreSQL, Node 20+, `npm install pg` in the offline development environment. Apply `001_core.sql` then `002_atomic_checkout.sql` to that isolated DB. The SQL function assumes a trusted API caller and is *not* authorized for direct browser or anonymous DB invocation.

Start after setting `ZHIROX_LOCAL_DB_URL` (test-only local connection string) and `ZHIROX_LOCAL_TEST_TOKEN` (random secret of 32+ chars): `node offline/local-pos-api.mjs`.

Unit tests: `node --test offline/tests/*.test.mjs`. PostgreSQL integration tests remain outstanding. Keep production Supabase, locked Home UI, PC Relay and main untouched.

### Blockers before operational LAN deployment
- Local store-scoped user authentication and role checking; no client-supplied cashier impersonation.
- Local-only API binding on LAN with TLS and signed device/client sessions.
- Verify pg migrations and SQL tests against an isolated Postgres instance.
- Fix catalog, price, shifts, checkout/refund and stock operations to use the local API, with no external login dependency.
- Put all critical frontend assets and dependencies on the local origin.
- Rollback, receipt printer, independent backups and 30-day WAN-off soak tests.
